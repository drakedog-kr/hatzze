"""stockanalysis 페이지를 못 받은 미국 ETF 의 저장된 행을 지우지 않는지(fetch_etf_dividends.main 의 정리 단계).

지울 것은 목록에서 뺀 ETF 와 지난 1년 지급이 끊긴 ETF 뿐이다. 페이지가 안 온 날(타임아웃·429·5xx,
구조 변경)에 그 ETF 를 '이번에 안 나온 행'으로 지우면 다음 실행까지 배당 화면에서 사라진다.
"""
import sys
from datetime import date

import pytest

import fetch_etf_dividends as etf
from common.stockanalysis import PageChanged

TODAY = date(2026, 9, 29)


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


def _etf(code):
    return {"code": code, "name_ko": code, "name_en": code, "cadence": "분기", "source": f"https://example.com/{code}"}


PAID = [{"ex": "2026-06-20", "record": "2026-06-20", "pay": "2026-06-29", "amount": 0.25}]
STOPPED = [{"ex": "2025-06-20", "record": "2025-06-20", "pay": "2025-06-27", "amount": 0.25}]


def _run(monkeypatch, pages, stored):
    def history(code, kind):
        page = pages.get(code, PAID)
        if page is PageChanged:
            raise PageChanged("배당 표를 못 찾았다")
        return page

    db = _DB(stored)
    codes = sorted({*pages, *(f"E{i:02d}" for i in range(12))})
    monkeypatch.setattr(sys, "argv", ["fetch_etf_dividends.py"])
    monkeypatch.setattr(etf, "today_kst", lambda: TODAY)
    monkeypatch.setattr(etf, "krx_latest", lambda: None)
    monkeypatch.setattr(etf, "seibro_history", lambda today: None)
    monkeypatch.setattr(etf, "get_client", lambda: db)
    monkeypatch.setattr(etf, "usdkrw", lambda: None)
    monkeypatch.setattr(etf, "FINNHUB_API_KEY", None)
    monkeypatch.setattr(etf, "US_ETFS", [_etf(c) for c in codes])
    monkeypatch.setattr(etf, "dividend_history", history)
    etf.main()
    return db


def test_keeps_rows_whose_page_did_not_come(monkeypatch):
    pages = {"VYM": None, "DGRO": PageChanged, "GONE": [], "STOP": STOPPED}
    stored = {"US": [*(f"E{i:02d}" for i in range(12)), "VYM", "DGRO", "GONE", "STOP", "DROPPED"]}
    db = _run(monkeypatch, pages, stored)
    assert {r["code"] for r in db.upserted} == {f"E{i:02d}" for i in range(12)}
    # 목록에서 뺀 것·배당이 없는 것·1년 넘게 끊긴 것만 지운다. 못 받은 VYM·DGRO 는 어제 행을 둔다.
    assert sorted(db.deleted) == ["DROPPED", "GONE", "STOP"]


@pytest.mark.parametrize("page", [None, PageChanged])
def test_does_not_prune_when_too_few_came(monkeypatch, page):
    # 원천이 통째로 죽은 날(미국 10행 미만)은 아예 안 지운다 — 원래 있던 안전장치.
    pages = {f"E{i:02d}": page for i in range(12)}
    db = _run(monkeypatch, pages, {"US": [f"E{i:02d}" for i in range(12)]})
    assert db.upserted == [] and db.deleted == []
