"""집계 표를 '전량 delete → 500행씩 insert' 대신 갈아 끼우는지 — common/supabase_client.replace_rows.

태그 표에서 먼저 고친 방식(test_tag_table_swap.py)을 집계 표 여섯 곳(종목·테마 일별, 센티먼트·화제어, 이슈 키워드)과
트렌딩·미장 종목별 톤이 같이 쓴다. 예전엔 delete 가 성공한 뒤 insert 배치 하나만 끊겨도 표가 반쪽이거나 빈 채로
다음 성공 실행까지 갔고, delete 와 insert 사이에 들어온 페이지 요청은 빈 표를 읽었다(pipeline-telegram#0 · db#2).
"""
import re
from datetime import datetime
from pathlib import Path

import httpx

import common.supabase_client as sc

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
OLD = "2026-09-30T08:00:00.000001+00:00"


class _Table:
    """유일 키(key) 하나를 가진 표 흉내. fail(n) 이 참인 n 번째 요청은 전송이 끊긴다."""

    def __init__(self, key, rows, fail=lambda n: False):
        self.key, self.calls, self.fail = key, 0, fail
        self.rows = {tuple(r[k] for k in key): dict(r) for r in rows}

    def table(self, _name):
        return _Q(self)


class _Q:
    def __init__(self, t):
        self.t, self.op, self.payload, self.filters = t, None, None, []

    def upsert(self, rows, on_conflict=""):
        assert on_conflict == ",".join(self.t.key)
        self.op, self.payload = "upsert", rows
        return self

    def delete(self):
        self.op = "delete"
        return self

    def lt(self, col, v):
        self.filters.append(lambda r: datetime.fromisoformat(r[col]) < datetime.fromisoformat(v))
        return self

    def eq(self, col, v):
        self.filters.append(lambda r: r.get(col) == v)
        return self

    def execute(self):
        t = self.t
        t.calls += 1
        if t.fail(t.calls):
            raise httpx.RemoteProtocolError("<ConnectionTerminated error_code:0>")
        if self.op == "delete":
            t.rows = {k: r for k, r in t.rows.items() if not all(f(r) for f in self.filters)}
        for r in self.payload or []:
            k = tuple(r[c] for c in t.key)
            t.rows[k] = {**t.rows.get(k, {}), **r}
        return self


def _no_sleep(monkeypatch):
    monkeypatch.setattr(sc.time, "sleep", lambda _s: None)


def test_issue_keywords_swap_by_rank_with_updated_at(monkeypatch):
    # 이슈 키워드 표는 순위가 키이고 실행 시각 열이 updated_at 이다. 10위 → 8위로 줄면 9·10위 옛 줄이 빠진다.
    _no_sleep(monkeypatch)
    db = _Table(("rank",), [{"rank": i, "keyword": f"old{i}", "updated_at": OLD} for i in range(1, 11)])
    sc.replace_rows(db, "telegram_issue_keyword", [{"rank": i, "keyword": f"new{i}"} for i in range(1, 9)], "rank", stamp_col="updated_at")
    assert sorted(db.rows) == [(i,) for i in range(1, 9)]
    assert {r["keyword"] for r in db.rows.values()} == {f"new{i}" for i in range(1, 9)}


def test_a_failed_write_keeps_last_run(monkeypatch):
    # 종목 일별 1,200행 중 둘째 배치부터 계속 끊긴다 — 지난 결과가 한 행도 안 빠진다(예전엔 표가 비었다).
    _no_sleep(monkeypatch)
    key = ("date", "stock_code")
    old = [{"date": "2026-09-30", "stock_code": f"{i:06d}", "mention_count": 1, "created_at": OLD} for i in range(900)]
    db = _Table(key, old, fail=lambda n: n >= 2)
    new = [{"date": "2026-10-01", "stock_code": f"{i:06d}", "mention_count": 2} for i in range(1200)]
    try:
        sc.replace_rows(db, "telegram_stock_daily", new, ",".join(key))
    except httpx.TransportError:
        pass
    else:
        raise AssertionError("끝내 끊긴 요청은 올라와야 한다(스텝이 실패로 보여야 알림이 간다)")
    assert {("2026-09-30", f"{i:06d}") for i in range(900)} <= set(db.rows)


def test_empty_result_leaves_the_table_alone(monkeypatch):
    # 빈 결과로 갈아 끼우면 표가 통째로 빈다 — 앞 단계가 죽은 날이 대부분이다.
    _no_sleep(monkeypatch)
    db = _Table(("rank",), [{"rank": 1, "keyword": "x", "updated_at": OLD}])
    sc.replace_rows(db, "telegram_issue_keyword", [], "rank", stamp_col="updated_at")
    assert db.calls == 0 and list(db.rows) == [(1,)]


def test_where_limits_the_cleanup_to_one_slice(monkeypatch):
    # 미장 종목별 톤은 기준일 × 창 하나만 갈아 끼운다 — 다른 기준일 행은 둔다.
    _no_sleep(monkeypatch)
    key = ("as_of_date", "window_days", "ticker")
    old = [
        {"as_of_date": "2026-09-30", "window_days": 7, "ticker": "NVDA", "updated_at": OLD},
        {"as_of_date": "2026-10-01", "window_days": 7, "ticker": "NVDA", "updated_at": OLD},
        {"as_of_date": "2026-10-01", "window_days": 7, "ticker": "TSLA", "updated_at": OLD},
    ]
    db = _Table(key, old)
    new = [{"as_of_date": "2026-10-01", "window_days": 7, "ticker": "NVDA"}]
    sc.replace_rows(db, "telegram_us_stock_tone", new, ",".join(key), stamp_col="updated_at",
                    where={"as_of_date": "2026-10-01", "window_days": 7})
    assert sorted(db.rows) == [("2026-09-30", 7, "NVDA"), ("2026-10-01", 7, "NVDA")]


def test_no_aggregate_script_wipes_then_inserts():
    # 옛 패턴(조건 없는 delete 를 흉내 내는 neq("id", 0000…) · gte("rank", 0) 뒤에 insert)이 다시 들어오지 않게.
    wipe = re.compile(r'\.delete\(\)\s*\.(neq\(\s*"id",\s*"0{8}-|gte\(\s*"rank",\s*0\))')
    offenders = [p.name for p in SCRIPTS.glob("calculate_*.py") if wipe.search(p.read_text(encoding="utf-8"))]
    assert offenders == [], f"전량 delete 뒤 insert 가 남았다: {offenders} — common/supabase_client.replace_rows 를 쓴다"
