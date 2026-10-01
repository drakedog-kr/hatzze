"""오늘 못 받은 시세·환율을 표에 있던 바로 전 값으로 물려받는지(common/carry_quote.py, dividend#6·#7).

예전엔 핀허브·환율이 안 온 날 그 칸을 None 으로 upsert 해 어제 값까지 지웠다 — 종가가 비면 투자금·수익률이 빠지고
바스켓에서도 빠졌고, 환율이 비면 화면이 미국 주식·ETF 를 통째로 뺐다.
"""
import sys
from datetime import date

import fetch_etf_dividends as etf
from common.carry_quote import carry_close, fx_or_last, last_fx

TODAY = date(2026, 10, 1)


def test_carry_close_keeps_old_date_and_recomputes_yield():
    row = {"code": "SCHD", "ttm_dps": 1.0, "close": None, "price_date": None, "ttm_yield_pct": None}
    assert carry_close(row, {"close": 25.0, "price_date": "2026-09-29"})
    # 날짜는 그 종가의 날짜 그대로 — 오늘로 바꾸면 낡은 값이 새 값인 척한다. 수익률은 오늘 배당 ÷ 물려받은 종가.
    assert row == {"code": "SCHD", "ttm_dps": 1.0, "close": 25.0, "price_date": "2026-09-29", "ttm_yield_pct": 4.0}


def test_carry_close_leaves_fresh_or_unknown_rows_alone():
    fresh = {"ttm_dps": 1.0, "close": 30.0, "price_date": "2026-09-30", "ttm_yield_pct": 3.333}
    assert not carry_close(fresh, {"close": 25.0, "price_date": "2026-09-29"})
    assert fresh["close"] == 30.0
    new = {"ttm_dps": 1.0, "close": None, "price_date": None, "ttm_yield_pct": None}
    assert not carry_close(new, None)  # 표에 없던 종목(오늘 처음) — 물려받을 것이 없다
    assert not carry_close(new, {"close": None, "price_date": None})
    assert new["close"] is None


def test_fx_prefers_today_then_latest_stored():
    prev = {
        "A": {"usdkrw": 1390.0, "usdkrw_date": "2026-09-26"},
        "B": {"usdkrw": 1401.5, "usdkrw_date": "2026-09-29"},
        "C": {"usdkrw": None, "usdkrw_date": None},
    }
    assert fx_or_last((1410.0, "2026-09-30"), prev) == ((1410.0, "2026-09-30"), False)
    assert fx_or_last(None, prev) == ((1401.5, "2026-09-29"), True)
    assert fx_or_last(None, {}) == (None, False)
    assert last_fx([]) is None


class _Q:
    def __init__(self, db):
        self.db = db

    def upsert(self, rows, on_conflict=None):
        self.db.upserted.extend(rows)
        return self

    def select(self, _cols):
        return self

    def eq(self, *_a):
        return self

    def execute(self):
        self.data = []
        return self


class _DB:
    def __init__(self):
        self.upserted = []

    def table(self, _name):
        return _Q(self)


def test_etf_run_carries_quote_and_fx_when_sources_fail(monkeypatch):
    """핀허브 키도 환율도 없는 날 — 미국 ETF 행이 어제 종가·환율을 들고 upsert 된다."""
    paid = [{"ex": "2026-06-20", "record": "2026-06-20", "pay": "2026-06-29", "amount": 0.5}]
    db = _DB()
    stored = {"SCHD": {"code": "SCHD", "close": 25.0, "price_date": "2026-09-29", "usdkrw": 1401.5, "usdkrw_date": "2026-09-29"}}
    monkeypatch.setattr(sys, "argv", ["fetch_etf_dividends.py"])
    monkeypatch.setattr(etf, "today_kst", lambda: TODAY)
    monkeypatch.setattr(etf, "krx_latest", lambda: None)
    monkeypatch.setattr(etf, "seibro_history", lambda today: None)
    monkeypatch.setattr(etf, "get_client", lambda: db)
    monkeypatch.setattr(etf, "load_last_quotes", lambda _db, _t, _k: stored)
    monkeypatch.setattr(etf, "usdkrw", lambda: None)
    monkeypatch.setattr(etf, "FINNHUB_API_KEY", None)
    monkeypatch.setattr(etf, "US_ETFS", [{"code": "SCHD", "name_ko": "SCHD", "name_en": "SCHD", "cadence": "분기", "source": "x"}])
    monkeypatch.setattr(etf, "dividend_history", lambda code, kind: paid)
    etf.main()
    (row,) = db.upserted
    assert (row["close"], row["price_date"], row["ttm_yield_pct"]) == (25.0, "2026-09-29", 2.0)
    assert (row["usdkrw"], row["usdkrw_date"]) == (1401.5, "2026-09-29")
