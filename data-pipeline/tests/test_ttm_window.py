"""지난 1년 배당 창(common.ttm_window) — 날짜 창 + 끝점 여유(2026-10-04 점검).

횟수 셈(최근 간격으로 한 해 n 건)은 주간 ETF · 분기배당을 새로 시작한 회사 · 반년 전 배당한 회사를 망가뜨려 되돌렸다.
"""
from datetime import date, timedelta

from common.ttm_window import ttm_window

TODAY = date(2026, 10, 4)


def _monthly(day: int, months: list[tuple[int, int]]):
    return [(date(y, m, day), f"{y}-{m:02d}") for y, m in months]


def test_monthly_edge_kept_when_anniversary_not_paid_yet():
    # JEPI — 매달 3~5일 지급. 2025-10-03 은 창 끝(2025-10-04) 하루 밖, 2026-10 건은 아직.
    months = [(2025, m) for m in range(10, 13)] + [(2026, m) for m in range(1, 10)]
    got = ttm_window(_monthly(3, months), TODAY)
    assert len(got) == 12 and got[0] == "2025-10"


def test_monthly_edge_dropped_after_anniversary_paid():
    months = [(2025, m) for m in range(10, 13)] + [(2026, m) for m in range(1, 11)]
    got = ttm_window(_monthly(3, months), date(2026, 10, 6))
    assert len(got) == 12 and got[0] == "2025-11"


def test_weekly_not_capped():
    d0 = date(2025, 9, 1)
    items = [(d0 + timedelta(days=7 * i), i) for i in range(58)]
    assert len(ttm_window(items, TODAY)) == 52


def test_quarterly_started_recently_counts_all_paid_in_year():
    # 연 1회였다가 분기배당 시작(LG 꼴) — 지난 1년 지급은 전부.
    items = [(date(2024, 4, 20), 1500), (date(2025, 4, 18), 2000), (date(2026, 4, 17), 2100), (date(2026, 9, 11), 1000)]
    assert sum(ttm_window(items, TODAY)) == 3100


def test_paid_half_year_ago_not_zero():
    # 대교 꼴 — 반기 이력이 있어도 지난 1년 안에 지급했으면 센다.
    items = [(date(2021, 8, 20), 50), (date(2022, 4, 20), 70), (date(2026, 4, 20), 120)]
    assert ttm_window(items, TODAY) == [120]


def test_same_day_two_payments_no_typeerror():
    d = date(2026, 6, 30)
    got = ttm_window([(d, {"a": 0.15}), (d, {"a": 0.18})], TODAY)
    assert len(got) == 2


def test_supplemental_kept():
    # MAIN — 월배당 + 보충배당. 날짜 창이라 보충배당도 그대로 든다.
    items = _monthly(15, [(2025, m) for m in range(11, 13)] + [(2026, m) for m in range(1, 10)]) + [(date(2026, 3, 27), "sup1"), (date(2026, 6, 27), "sup2")]
    assert len(ttm_window(items, TODAY)) == 13


def test_quarterly_suspended_not_revived():
    # 분기 지급인데 1년 안에 지급이 없다 — 끊은 것. 끝점 여유로 마지막 건을 살리지 않는다.
    items = [(date(2024, 12, 20), 1), (date(2025, 3, 20), 1), (date(2025, 6, 20), 1), (date(2025, 9, 25), 1)]
    assert ttm_window(items, TODAY) == []


def test_annual_late_payment_kept():
    # 연 1회 — 작년 지급일(2025-04-18)은 지났고 올해 건(04-22)은 아직. 그 사이 0 이 되지 않는다.
    items = [(date(2024, 4, 19), 1000), (date(2025, 4, 18), 1100)]
    assert ttm_window(items, date(2026, 4, 20)) == [1100]


def test_this_years_twin_paid_a_day_earlier_not_double():
    # 반박 검증 사례 — 올해 지급이 작년보다 하루 이르면 작년 건(오늘 − 379일)과 올해 건(오늘 − 15일)이 함께 들었다.
    today = date(2026, 10, 20)
    items = [(date(2025, 10, 6), "y1"), (date(2026, 1, 6), "q"), (date(2026, 4, 6), "q"), (date(2026, 7, 6), "q"), (date(2026, 10, 5), "y2")]
    got = ttm_window(items, today)
    assert "y1" not in got and len(got) == 4
