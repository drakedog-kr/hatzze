"""고점권 외국인 매도(fetch_foreign_sell_at_high)의 연 단위 ECOS 조회 — 자료가 없는 해 조각에서 죽지 않는지.

ECOS 는 조회 결과가 없으면 StatisticSearch 대신 {"RESULT": {"CODE": "INFO-200"}} 을 준다. 새해 첫 개장일
자료가 올라오기 전(1/1 저녁·1/2 아침 …)엔 올해 조각이 비고, 시작일이 휴장인 12/31 하루로 잘릴 때도 그 조각이
빈다. 그때 멈추면 안 된다. 인증키 오류 같은 다른 RESULT 는 그대로 터져야 한다.
"""
import pytest

import common.ecos_client as ecos
import fetch_foreign_sell_at_high as fs

NO_DATA = {"RESULT": {"CODE": "INFO-200", "MESSAGE": "해당하는 데이터가 없습니다."}}
BAD_KEY = {"RESULT": {"CODE": "INFO-100", "MESSAGE": "인증키가 유효하지 않습니다."}}

# 2026-12-31 은 휴장, 2027-01-04(월)가 새해 첫 개장일.
TRADING = {"20251230": 1.0, "20260102": 2.0, "20261230": 3.0, "20270104": 4.0}


def fake_ecos(monkeypatch, days=TRADING, payload=None):
    def fetch(url):
        if payload is not None:
            return payload
        start, end = url.split("/")[-3:-1]
        rows = [{"TIME": t, "DATA_VALUE": str(v)} for t, v in days.items() if start <= t <= end]
        return {"StatisticSearch": {"row": rows}} if rows else NO_DATA

    monkeypatch.setattr(ecos, "fetch_ecos_payload", fetch)


def test_new_year_before_first_trading_day(monkeypatch):
    fake_ecos(monkeypatch)
    # 1/2 아침 실행: 올해 조각 20270101~20270102 엔 아직 자료가 없다.
    assert fs._ecos_daily(fs.ITEM_KOSPI, "20261201", "20270102") == {"20261230": 3.0}


def test_start_chunk_on_year_end_holiday(monkeypatch):
    fake_ecos(monkeypatch)
    # 시작일이 휴장인 12/31 이면 첫 조각이 그 하루뿐이라 빈다.
    assert fs._ecos_daily(fs.ITEM_KOSPI, "20251231", "20260105") == {"20260102": 2.0}


def test_other_ecos_errors_still_raise(monkeypatch):
    fake_ecos(monkeypatch, payload=BAD_KEY)
    with pytest.raises(RuntimeError, match="INFO-100"):
        fs._ecos_daily(fs.ITEM_KOSPI, "20261201", "20261231")
