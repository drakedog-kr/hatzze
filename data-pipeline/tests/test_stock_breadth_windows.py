"""관심의 폭 저장분 — 리포트 창과 저녁 급부상 창이 한 표에 같이 남는가(마이그레이션 098).

2026-10-12 저녁 급부상 카드는 10-10~10-12 창을 물었는데 표에는 10-09~10-11(리포트 창) 60행뿐이라
렌더마다 조인으로 직접 셌고, 그 조인이 5xx 를 내 빌드가 /kadera 를 못 그렸다.

메모리 위 가짜 표로 PostgREST 의 select · upsert(on_conflict) · delete(lt · neq) 만 흉내 낸다.
열쇠는 on_conflict 열과 표의 유일 제약이 같아야 받아 준다(아니면 42P10) — 098 전 표도 흉내 낸다.
"""
from postgrest.exceptions import APIError

import common.surging as S
import generate_telegram_narratives as G

REPORT = ("2026-10-09", "2026-10-11")   # 기준일 10-12 의 리포트 창(기준일 하루 전 끝)
EVENING = ("2026-10-10", "2026-10-12")  # 같은 날 저녁 급부상 창(기준일 끝)


class _Table:
    def __init__(self, db, name):
        self.db, self.name = db, name
        self.op = None
        self.filters = []
        self.payload = None
        self.on_conflict = None

    # 읽기 — save_stock_breadth 가 telegram_stock_daily 를 읽는 꼴만 맞춘다
    def select(self, _cols):
        self.op = "select"
        return self

    def gte(self, col, v):
        self.filters.append(lambda r: r[col] >= v)
        return self

    def lte(self, col, v):
        self.filters.append(lambda r: r[col] <= v)
        return self

    def limit(self, _n):
        return self

    # 키셋 페이징(load_keyset) — order(key) · gt(key, 마지막값)
    def order(self, col, **_):
        self.order_col = col
        return self

    def gt(self, col, v):
        self.filters.append(lambda r: r[col] > v)
        return self

    # 쓰기
    def upsert(self, payload, on_conflict):
        self.op, self.payload, self.on_conflict = "upsert", payload, on_conflict
        return self

    def delete(self):
        self.op = "delete"
        return self

    def lt(self, col, v):
        self.filters.append(lambda r: r[col] < v)
        return self

    def neq(self, col, v):
        self.filters.append(lambda r: r[col] != v)
        return self

    def execute(self):
        rows = self.db.tables.setdefault(self.name, [])
        if self.op == "select":
            got = [r for r in rows if all(f(r) for f in self.filters)]
            if getattr(self, "order_col", None):
                got.sort(key=lambda r: r[self.order_col])
            return type("R", (), {"data": got})()
        self.db.log.append((self.name, self.op, self.on_conflict))
        if self.op == "delete":
            self.db.tables[self.name] = [r for r in rows if not all(f(r) for f in self.filters)]
        elif self.op == "upsert":
            if self.name == G.BREADTH_TABLE and self.on_conflict != self.db.breadth_key:
                raise APIError({"code": "42P10", "message": "there is no unique or exclusion constraint matching the ON CONFLICT specification"})
            cols = self.on_conflict.split(",")
            for p in self.payload:
                key = tuple(p[c] for c in cols)
                rows[:] = [r for r in rows if tuple(r[c] for c in cols) != key]
                rows.append(dict(p))
        return type("R", (), {"data": []})()


class _Db:
    def __init__(self, breadth_key=G.BREADTH_KEY):
        self.tables = {}
        self.log = []
        self.breadth_key = breadth_key  # 표의 유일 제약. 098 전은 "stock_code"

    def table(self, name):
        return _Table(self, name)


def _windows(db):
    return sorted({(r["window_start"], r["window_end"]) for r in db.tables.get(G.BREADTH_TABLE, [])})


def _card(code, channels, window=EVENING):
    return {"code": code, "channels": channels, "channels_window": window}


def _daily(db, *codes):
    db.tables["telegram_stock_daily"] = [
        {"id": f"{c}-{d}", "stock_code": c, "date": d, "mention_count": 10} for c in codes for d in ("2026-10-09", "2026-10-10", "2026-10-11")
    ]


def test_evening_surging_rows_survive_report_save(monkeypatch):
    """급부상 스텝(849)이 먼저 적고 총평 스텝(899)이 뒤에 돈다. 뒤 스텝이 저녁 창 행을 지우면 안 된다."""
    db = _Db()
    # 지난 아침의 리포트 창 — 이번 실행에서 지워져야 한다
    db.tables[G.BREADTH_TABLE] = [
        {"stock_code": "000660", "channel_count": 1, "window_start": "2026-10-08", "window_end": "2026-10-10",
         "computed_for": "2026-10-11", "updated_at": "x"},
    ]
    G.save_surging_breadth(db, "2026-10-12", [_card("000660", 122), _card("083470", 3)])

    _daily(db, "000660", "005930")
    monkeypatch.setattr(G, "channel_breadth_map", lambda _db, codes, first, last: {c: 200 for c in codes})
    G.save_stock_breadth(db, "2026-10-12")

    assert _windows(db) == [REPORT, EVENING]
    by = {(r["stock_code"], r["window_start"], r["window_end"]): r["channel_count"] for r in db.tables[G.BREADTH_TABLE]}
    # 두 자리에 다 오르는 종목은 창마다 한 줄씩
    assert by[("000660", *EVENING)] == 122
    assert by[("000660", *REPORT)] == 200
    # 리포트 상위에 없는 작은 카드 종목도 저녁 창에 남는다
    assert by[("083470", *EVENING)] == 3


def test_report_save_writes_before_deleting(monkeypatch):
    """먼저 지우고 쓰기가 실패하면 표가 빈다. 적은 뒤에 지난 창을 지운다."""
    db = _Db()
    _daily(db, "005930")
    monkeypatch.setattr(G, "channel_breadth_map", lambda _db, codes, first, last: {c: 5 for c in codes})
    G.save_stock_breadth(db, "2026-10-12")
    ops = [(op, key) for name, op, key in db.log if name == G.BREADTH_TABLE]
    assert ops == [("upsert", G.BREADTH_KEY), ("delete", None)]


def test_surging_rows_use_card_window():
    """창은 따로 셈하지 않고 top_surging 이 채널 수를 센 창(channels_window)을 그대로 적는다."""
    db = _Db()
    morning = ("2026-10-09", "2026-10-11")
    G.save_surging_breadth(db, "2026-10-12", [_card("034730", 33, window=morning)])
    assert _windows(db) == [morning]
    (row,) = db.tables[G.BREADTH_TABLE]
    assert row["computed_for"] == "2026-10-12"
    assert row["channel_count"] == 33


def test_before_migration_098_keeps_old_behaviour(monkeypatch):
    """098 전 표(열쇠가 종목코드뿐) — 급부상 창은 건너뛰고 리포트 창은 예전처럼 적는다."""
    db = _Db(breadth_key="stock_code")
    db.tables[G.BREADTH_TABLE] = [
        {"stock_code": "000660", "channel_count": 1, "window_start": "2026-10-08", "window_end": "2026-10-10",
         "computed_for": "2026-10-11", "updated_at": "x"},
    ]
    G.save_surging_breadth(db, "2026-10-12", [_card("083470", 3)])
    assert _windows(db) == [("2026-10-08", "2026-10-10")]  # 건드리지 않았다

    _daily(db, "000660")
    monkeypatch.setattr(G, "channel_breadth_map", lambda _db, codes, first, last: {c: 7 for c in codes})
    G.save_stock_breadth(db, "2026-10-12")
    assert _windows(db) == [REPORT]
    assert [r["channel_count"] for r in db.tables[G.BREADTH_TABLE]] == [7]


def test_top_surging_reports_the_window_it_counted(monkeypatch):
    """channels_window 는 언급 수와 같은 최근 날짜들의 처음과 끝이다(화면 getSurgingStocks 가 묻는 창)."""
    seen = {}

    def fake_breadth(_db, codes, first, last):
        seen["window"] = (first, last)
        return {c: 1 for c in codes}

    monkeypatch.setattr(S, "channel_breadth_map", fake_breadth)
    dates = [f"2026-10-{d:02d}" for d in range(1, 13)]
    rows = [{"stock_code": "A", "date": d, "weighted_score": 1.0, "mention_count": 5} for d in dates]
    rows += [{"stock_code": "B", "date": d, "weighted_score": 1.0, "mention_count": 5} for d in dates[-3:]]
    top = S.top_surging(None, 10, preloaded=(rows, dates), cap=10)
    assert seen["window"] == EVENING
    assert {s["channels_window"] for s in top} == {EVENING}
