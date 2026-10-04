"""common/ttm_count — 지난 1년 배당을 횟수로 고른다(2026-10-04 점검: 삼성전자 세 분기 · JEPI 11달)."""
from datetime import date

from common.ttm_count import last_n_year, per_year


def test_quarterly_takes_four_even_if_latest_quarter_unknown():
    # 9/30 기준일은 지났지만 금액이 아직 없다 — 최근 넷은 작년 9/30 부터다.
    recs = [(date(2025, 3, 31), "q1"), (date(2025, 6, 30), "q2"), (date(2025, 9, 30), "q3"), (date(2025, 12, 31), "q4"),
            (date(2026, 3, 31), "q1'"), (date(2026, 6, 30), "q2'")]
    assert per_year([d for d, _ in recs]) == 4
    assert last_n_year(recs, date(2026, 10, 4)) == ["q3", "q4", "q1'", "q2'"]


def test_monthly_takes_twelve_across_the_window_edge():
    pays = [(date(2025, m, 5), m) for m in range(9, 13)] + [(date(2026, m, 3), 100 + m) for m in range(1, 10)]
    got = last_n_year(pays, date(2026, 10, 4))
    assert len(got) == 12 and got[0] == 10  # 2025-10-05 가 하루 차이로 빠지지 않는다


def test_too_few_payments_falls_back():
    assert last_n_year([(date(2026, 4, 1), "a"), (date(2026, 9, 1), "b")], date(2026, 10, 4)) is None


def test_stopped_payer_does_not_drag_old_ones():
    old = [(date(2023, m, 1), m) for m in (3, 6, 9, 12)] + [(date(2024, 3, 1), 99)]
    assert last_n_year(old, date(2026, 10, 4)) == []


def test_suspended_payer_counts_nothing():
    # 분기마다 주다가 2025-09-15 를 끝으로 끊었다 — 2026-09-29 에는 지난 1년 지급이 없다(여유 창이 마지막 건을 끌고 오지 않는다).
    pays = [(date(2024, 12, 15), 1), (date(2025, 3, 15), 2), (date(2025, 6, 15), 3), (date(2025, 9, 15), 4)]
    assert last_n_year(pays, date(2026, 9, 29)) == []
