"""fetch_kr_overnight 의 두 거름 — 거래가 없는 시장만 빼는지, 기준 종가의 낡음을 개장일로 세는지.

2026-09-25~27 추석 연휴·주말에 현대차 선물 거래대금이 2.6만~8.6만 달러로 얇아져 옛 문턱(10만)에
걸려 카드가 사흘 빠졌고, 09-28(연휴 뒤 첫 개장일) 아침엔 09-23 종가가 달력 5일이라 세 종목이 다 빠질
참이었다. 그 두 날을 박아 둔다.
"""
from datetime import date

from fetch_kr_overnight import MAX_CLOSE_LAG, close_lag, tradeable


def test_thin_but_alive_market_is_kept():
    # 09-27 현대차: 거래대금 2.6만 달러 · 미결제 약 5,000계약.
    assert tradeable({"vlm": 26_095, "oi": 4_969.75})


def test_dead_market_is_dropped():
    # xyz:KRW 는 거래도 미결제도 0 이고 표시가만 붙어 있다.
    assert not tradeable({"vlm": 0, "oi": 0})
    assert not tradeable({"vlm": 12_000, "oi": 0})
    assert not tradeable({"vlm": 0, "oi": 300})


def test_first_open_after_chuseok_is_fresh():
    # 09-24·25 휴장, 26·27 주말. 09-28 아침에 09-23 종가는 직전 개장일치다.
    assert close_lag("2026-09-23", date(2026, 9, 28)) == 1
    assert close_lag("2026-09-23", date(2026, 9, 28)) <= MAX_CLOSE_LAG


def test_same_day_close_and_weekend():
    assert close_lag("2026-09-28", date(2026, 9, 28)) == 0  # 저녁 실행, 당일 종가
    assert close_lag("2026-09-25", date(2026, 9, 27)) == 0  # 휴장일·주말엔 지난 개장일이 없다


def test_monday_holiday_then_tuesday_morning():
    # 10-05(월) 대체공휴일. 10-06(화) 아침에 10-02(금) 종가는 직전 개장일치다.
    assert close_lag("2026-10-02", date(2026, 10, 6)) == 1


def test_missing_a_trading_day_is_stale():
    # 화요일 아침인데 금요일 종가뿐이면 월요일 종가가 빠진 것이다.
    assert close_lag("2026-09-18", date(2026, 9, 22)) == 2
    assert close_lag("2026-09-18", date(2026, 9, 22)) > MAX_CLOSE_LAG
