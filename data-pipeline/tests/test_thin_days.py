"""common/thin_days — lib/theme-flow.ts thinDays · usableDays 의 사본. 같은 입력에 같은 답을 내야 한다(tests/theme-flow.test.ts 와 같은 값)."""
from common.thin_days import thin_days, usable_days

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
