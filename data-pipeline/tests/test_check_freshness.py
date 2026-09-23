"""check_freshness 의 지연 계산 — KRX 휴장일을 '늦은 날'로 세지 않는지.

2026-09-23 에 해외 휴장(#549·#550)으로 알림이 났고, 같은 계산이 추석 연휴 뒤(09-28)에는
KRX 지표 전부를 낡았다고 볼 참이었다. 그 두 날을 그대로 박아 둔다.
"""
from datetime import date

from check_freshness import ALLOWANCE, DEFAULT_ALLOWANCE, business_day_lag
from common.timeutil import KRX_HOLIDAY_YEARS, KRX_HOLIDAYS, krx_trading_days


def test_same_or_future_day_is_zero():
    assert business_day_lag("2026-09-23", date(2026, 9, 23)) == 0
    assert business_day_lag("2026-09-24", date(2026, 9, 23)) == 0


def test_previous_trading_day_is_one():
    assert business_day_lag("2026-09-22", date(2026, 9, 23)) == 1
    # 금요일 자료를 월요일에 보면 1(주말은 안 센다).
    assert business_day_lag("2026-09-18", date(2026, 9, 21)) == 1


def test_chuseok_2026_does_not_age_krx_data():
    # 09-24·25 휴장. 연휴 뒤 첫 개장일 아침·저녁에 09-23 자료는 1일 늦은 것이다.
    assert business_day_lag("2026-09-23", date(2026, 9, 28)) == 1
    assert business_day_lag("2026-09-23", date(2026, 9, 28)) <= DEFAULT_ALLOWANCE
    # 휴장일 당일에 직전 개장일 자료는 0.
    assert business_day_lag("2026-09-23", date(2026, 9, 25)) == 0


def test_asia_relative_strength_on_2026_09_23():
    # 일본 연휴(09-21~23)로 공통 날짜가 09-18 에 멈췄다. 개장일로도 3일이라 기본 허용 2는
    # 넘고, 이 지표의 허용치 안에는 든다.
    lag = business_day_lag("2026-09-18", date(2026, 9, 23))
    assert lag == 3
    assert lag > DEFAULT_ALLOWANCE
    assert lag <= ALLOWANCE["kospi_asia_relative_strength"]


def test_holiday_table_is_weekdays_only_and_covers_its_years():
    for d in KRX_HOLIDAYS:
        x = date.fromisoformat(d)
        assert x.weekday() < 5, d
        assert x.year in KRX_HOLIDAY_YEARS, d
    for y in KRX_HOLIDAY_YEARS:
        assert any(d.startswith(f"{y}-") for d in KRX_HOLIDAYS), y


def test_trading_days_skip_holidays():
    days = [d.isoformat() for d in krx_trading_days(date(2026, 9, 21), date(2026, 9, 30))]
    assert days == ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-28", "2026-09-29", "2026-09-30"]
