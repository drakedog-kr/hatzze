"""종목 추출이 태그 표를 갈아 끼우다 도중에 죽어도 표가 반쯤 비지 않는지 — 국장·미장이 같이 쓴다.

extract_telegram_stocks.replace_rows 가 막는 자리다. 예전엔 전량 delete 뒤 500행씩 insert 해서,
25만 행을 싣는 500여 번의 요청 중 하나만 끊겨도(GOAWAY, common/supabase_client.execute_with_retry 주석)
앞 배치만 든 표가 남았다. 다음 스텝(calculate_stock_daily)은 '전량 재계산'이라 그 반쪽 표로 일별 집계와
급부상 카드를 다시 만들었다.
"""
from datetime import datetime

import httpx

import common.supabase_client as sc
import extract_telegram_stocks as ets
import extract_telegram_us_stocks as us

KEY = ("channel_handle", "message_id", "stock_code")
OLD_STAMP = "2026-09-28T08:31:12.000001+00:00"


class _Table:
    """유일 키 하나를 가진 표 흉내. fail(n) 이 참인 n 번째 요청은 전송이 끊긴다."""

    def __init__(self, rows, fail=lambda n: False):
        self.rows = {tuple(r[k] for k in KEY): dict(r) for r in rows}
        self.calls = 0
        self.fail = fail

    def table(self, name):
        assert name == "telegram_message_stocks"
        return _Q(self)


class _Q:
    def __init__(self, t):
        self.t, self.op, self.payload, self.filters = t, None, None, []

    def delete(self):
        self.op = "delete"
        return self

    def neq(self, col, v):
        self.filters.append(lambda r: r.get(col) != v)
        return self

    def lt(self, col, v):
        self.filters.append(lambda r: datetime.fromisoformat(r[col]) < datetime.fromisoformat(v))
        return self

    def insert(self, rows):
        self.op, self.payload = "insert", rows
        return self

    def upsert(self, rows, on_conflict=""):
        assert on_conflict == ",".join(KEY)
        self.op, self.payload = "upsert", rows
        return self

    def execute(self):
        t = self.t
        t.calls += 1
        if t.fail(t.calls):
            raise httpx.RemoteProtocolError("<ConnectionTerminated error_code:0>")
        if self.op == "delete":
            t.rows = {k: r for k, r in t.rows.items() if not all(f(r) for f in self.filters)}
        for r in self.payload or []:
            k = tuple(r[c] for c in KEY)
            assert self.op == "upsert" or k not in t.rows, "unique violation"
            t.rows[k] = {**t.rows.get(k, {}), **r}
        return self


def _rows(n, method="dict", start=0, **extra):
    return [
        {"channel_handle": "ch", "message_id": i, "stock_code": "005930", "match_text": "삼성전자",
         "method": method, **extra}
        for i in range(start, start + n)
    ]


def _no_sleep(monkeypatch):
    monkeypatch.setattr(sc.time, "sleep", lambda _s: None)


def test_a_write_that_keeps_failing_leaves_last_run_rows(monkeypatch):
    # 지난 실행 1,000행 → 이번 1,200행(500행 배치 셋). 셋째 요청부터 계속 끊긴다.
    _no_sleep(monkeypatch)
    db = _Table(_rows(1000, created_at=OLD_STAMP), fail=lambda n: n >= 3)
    try:
        ets.replace_rows(db, "telegram_message_stocks", _rows(1200), ",".join(KEY))
    except httpx.TransportError:
        pass
    else:
        raise AssertionError("끊긴 요청은 끝내 올라와야 한다(스텝이 실패로 보여야 알림이 간다)")
    # 지난 결과가 한 행도 안 빠진다 — 반쪽 표가 다음 스텝으로 넘어가지 않는다.
    assert {("ch", i, "005930") for i in range(1000)} <= set(db.rows)


def test_a_dropped_write_is_sent_again_and_the_swap_finishes(monkeypatch):
    _no_sleep(monkeypatch)
    db = _Table(_rows(1000, created_at=OLD_STAMP), fail=lambda n: n == 2)
    ets.replace_rows(db, "telegram_message_stocks", _rows(1200, start=100), ",".join(KEY))
    assert set(db.rows) == {("ch", i, "005930") for i in range(100, 1300)}


def test_rows_missing_from_this_run_go_and_the_rest_take_new_values(monkeypatch):
    _no_sleep(monkeypatch)
    db = _Table(_rows(3, created_at=OLD_STAMP))
    ets.replace_rows(db, "telegram_message_stocks", _rows(2, method="house", start=1), ",".join(KEY))
    assert set(db.rows) == {("ch", 1, "005930"), ("ch", 2, "005930")}
    assert {r["method"] for r in db.rows.values()} == {"house"}


def test_both_markets_swap_the_same_way():
    assert us.replace_rows is ets.replace_rows
