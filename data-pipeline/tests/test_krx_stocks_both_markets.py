"""KRX 상장종목 마스터가 한 시장만 받은 날 stocks 를 반쪽으로 올리지 않는지(fetch_krx_stocks.main).

코스닥 호출만 재시도 끝에 빈 목록이 되면 코스피만 새 price_date 로 올라가고, 배당 화면
(lib/dividend.ts)은 기준일이 뒤처진 코스닥 전부를 상장폐지로 보고 뺀다.
"""
import sys

import pytest

import fetch_krx_stocks as krx


class _Table:
    def __init__(self, log):
        self.log = log

    def upsert(self, rows, on_conflict=None):
        self.log.extend(rows)
        return self

    def execute(self):
        return self


class _DB:
    def __init__(self):
        self.upserted = []

    def table(self, _name):
        return _Table(self.upserted)


def _krx_row(code, name, market):
    return {"ISU_CD": code, "ISU_NM": name, "MKT_NM": market, "SECT_TP_NM": "", "TDD_CLSPRC": "1,000", "FLUC_RT": "0.5", "MKTCAP": "1000000"}


def _run(monkeypatch, kospi, kosdaq):
    db = _DB()
    by_url = {krx.KOSPI_URL: kospi, krx.KOSDAQ_URL: kosdaq}
    monkeypatch.setattr(sys, "argv", ["fetch_krx_stocks.py"])
    monkeypatch.setattr(krx, "latest_available_date", lambda: "20260929")
    monkeypatch.setattr(krx, "fetch_rows", lambda url, bas_dd: by_url[url])
    monkeypatch.setattr(krx, "get_client", lambda: db)
    monkeypatch.setattr(krx, "stored_price_date", lambda _db: "2026-09-26")
    return db


KOSPI = [_krx_row("005930", "삼성전자", "KOSPI")]
KOSDAQ = [_krx_row("247540", "에코프로비엠", "KOSDAQ")]


def test_upserts_both_markets_on_the_same_day(monkeypatch):
    db = _run(monkeypatch, KOSPI, KOSDAQ)
    krx.main()
    assert {(r["code"], r["market"], r["price_date"]) for r in db.upserted} == {
        ("005930", "KOSPI", "2026-09-29"),
        ("247540", "KOSDAQ", "2026-09-29"),
    }


@pytest.mark.parametrize("kospi, kosdaq", [(KOSPI, []), ([], KOSDAQ)])
def test_refuses_when_one_market_came_back_empty(monkeypatch, kospi, kosdaq):
    db = _run(monkeypatch, kospi, kosdaq)
    with pytest.raises(SystemExit) as exc:
        krx.main()
    assert exc.value.code == 1
    assert db.upserted == []


def test_refuses_when_both_markets_are_empty(monkeypatch):
    db = _run(monkeypatch, [], [])
    with pytest.raises(SystemExit):
        krx.main()
    assert db.upserted == []
