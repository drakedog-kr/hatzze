"""common/thin_days — lib/theme-flow.ts thinDays · usableDays · weekAgoDates 의 사본. 같은 입력에 같은 답을 내야 한다(tests/theme-flow.test.ts 와 같은 값)."""
from common.thin_days import thin_days, usable_days, week_ago_dates

DAYS = ["09-28", "09-29", "09-30", "10-03", "10-04"]
TOTALS = {"09-28": 2776, "09-29": 2587, "09-30": 2537, "10-03": 332, "10-04": 4}


def test_thin_is_under_5pct_of_median_weekend_stays():
    assert thin_days(TOTALS, DAYS) == {"10-04"}
    assert usable_days(TOTALS, DAYS) == ["09-28", "09-29", "09-30", "10-03"]


def test_no_totals_keeps_all():
    assert thin_days(None, DAYS) == set()
    assert thin_days({}, DAYS) == set()


def test_zero_day_is_thin():
    assert thin_days({"a": 100, "b": 100}, ["a", "b", "c"]) == {"c"}


def test_week_ago_is_same_weekday_one_week_back():
    usable = ["2026-09-25", "2026-09-26", "2026-09-27", "2026-09-29", "2026-10-02", "2026-10-03", "2026-10-04"]
    assert week_ago_dates(["2026-10-02", "2026-10-03", "2026-10-04"], usable) == ["2026-09-25", "2026-09-26", "2026-09-27"]


def test_week_ago_drops_days_not_usable():
    # 1주 전 날이 얇아 빠졌거나 집계가 없으면 뺀다 — 셋 다 없으면 빈 목록(변화를 안 적는다).
    assert week_ago_dates(["2026-10-02", "2026-10-03", "2026-10-04"], ["2026-09-25", "2026-09-27"]) == ["2026-09-25", "2026-09-27"]
    assert week_ago_dates(["2026-10-02"], ["2026-10-01"]) == []


def test_week_ago_crosses_month_and_year():
    assert week_ago_dates(["2027-01-03"], ["2026-12-27"]) == ["2026-12-27"]
