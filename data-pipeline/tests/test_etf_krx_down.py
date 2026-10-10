"""KRX 시세를 못 받은 날 국내 ETF 를 어제 표로 거르는지(fetch_etf_dividends.main).

평소엔 그날 시세 목록에 없는 코드(상장폐지·만기·코드 변경)를 뺀다. 2026-10-10 에 KRX 가 403 을 주자 이 거름이
꺼져 상장폐지·만기 ETF 26개가 종가 없이 실렸다 — carry_close 는 어제 종가가 있던 코드만 채운다. 그날 검색창에
그 ETF 들이 떴다. 어제 표에 종가가 있던 코드만 싣고, 정리 단계는 평소처럼 돈다.
"""
import sys
from datetime import date

import fetch_etf_dividends as etf

TODAY = date(2026, 10, 10)


class _Q:
    def __init__(self, db):
        self.db, self.op, self.market, self.data = db, None, None, None

    def upsert(self, rows, on_conflict=None):
        self.db.upserted.extend(rows)
        return self

    def select(self, _cols):
        self.op = "select"
        return self

    def eq(self, _col, value):
        self.market = value
        return self

    def delete(self):
        self.op = "delete"
        return self

    def in_(self, _col, codes):
        self.db.deleted.extend(codes)
        return self

    def execute(self):
        if self.op == "select":
            self.data = [{"code": c} for c in self.db.stored.get(self.market, [])]
        return self


class _DB:
    def __init__(self, stored):
        self.stored, self.upserted, self.deleted = stored, [], []

    def table(self, _name):
        return _Q(self)


def _paid(code):
    return {"code": code, "name": f"ETF {code}", "record": "2026-09-30", "pay": "2026-10-02", "amount": 100.0, "kind": "이익분배", "issuer": "운용사"}


def _last(close):
    return {"close": close, "price_date": "2026-10-08" if close else None, "usdkrw": None, "usdkrw_date": None}


def _run(monkeypatch, latest, codes, last, stored):
    db = _DB(stored)
    monkeypatch.setattr(sys, "argv", ["fetch_etf_dividends.py"])
    monkeypatch.setattr(etf, "today_kst", lambda: TODAY)
    monkeypatch.setattr(etf, "krx_latest", lambda: latest)
    monkeypatch.setattr(etf, "seibro_history", lambda today: [_paid(c) for c in codes])
    monkeypatch.setattr(etf, "get_client", lambda: db)
    monkeypatch.setattr(etf, "load_last_quotes", lambda db, table, key: last)
    monkeypatch.setattr(etf, "tiger_taxable", lambda today: {})
    monkeypatch.setattr(etf, "stored_taxable", lambda db: {})
    monkeypatch.setattr(etf, "usdkrw", lambda: None)
    monkeypatch.setattr(etf, "FINNHUB_API_KEY", None)
    monkeypatch.setattr(etf, "US_ETFS", [])
    monkeypatch.setattr(etf, "MIN_ROWS_TO_PRUNE", 2)
    etf.main()
    return db


def test_krx_down_keeps_only_codes_with_yesterday_close(monkeypatch):
    # 069500·091160 은 어제 종가가 있다. 448600 은 어제 표에 종가 없이 남은 만기 ETF(10-10 의 26개 꼴),
    # 0099X0 은 어제 표에 없던 코드다. 100000 은 지난 1년 지급이 끊겨 이번 분배 내역에 없다.
    codes = ["069500", "091160", "448600", "0099X0"]
    last = {"069500": _last(40000.0), "091160": _last(12500.0), "448600": _last(None), "100000": _last(9000.0)}
    db = _run(monkeypatch, None, codes, last, {"KR": ["069500", "091160", "448600", "100000"]})
    by_code = {r["code"]: r for r in db.upserted}
    assert set(by_code) == {"069500", "091160"}
    assert all(r["close"] for r in db.upserted)
    # 물려받은 종가는 그 종가의 날짜를 그대로 둔다(common/carry_quote.py).
    assert by_code["069500"]["close"] == 40000.0 and by_code["069500"]["price_date"] == "2026-10-08"
    assert by_code["069500"]["ttm_yield_pct"] == 0.25
    # 정리 단계는 평소처럼 돈다 — 이번에 안 나온 100000 과 종가 없이 남았던 448600 이 지워진다.
    assert sorted(db.deleted) == ["100000", "448600"]


def test_krx_down_and_table_unread_writes_no_kr(monkeypatch):
    # 어제 표까지 못 읽은 날은 국내를 하나도 안 싣는다. 국내가 문턱 밑이라 정리도 안 해 어제 행이 그대로 남는다.
    codes = ["069500", "091160", "448600"]
    db = _run(monkeypatch, None, codes, {}, {"KR": codes})
    assert db.upserted == [] and db.deleted == []


def test_krx_up_uses_listing_not_yesterday(monkeypatch):
    # KRX 를 받은 날은 그날 시세 목록이 기준이다 — 어제 표에 없던 새 ETF 도 싣고, 목록에서 빠진 코드는 어제 종가가 있어도 뺀다.
    latest = ("2026-10-08", {"069500": {"ISU_CD": "069500", "TDD_CLSPRC": "41000"}, "0099X0": {"ISU_CD": "0099X0", "TDD_CLSPRC": "10000"}})
    codes = ["069500", "0099X0", "448600"]
    last = {"069500": _last(40000.0), "448600": _last(10000.0)}
    db = _run(monkeypatch, latest, codes, last, {"KR": ["069500", "448600"]})
    by_code = {r["code"]: r for r in db.upserted}
    assert set(by_code) == {"069500", "0099X0"}
    assert by_code["069500"]["close"] == 41000.0
    assert db.deleted == ["448600"]
