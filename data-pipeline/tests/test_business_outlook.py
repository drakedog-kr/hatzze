"""기업 체감 경기 — 업황전망 BSI 의 1년 새 변화 계산(build_rows)과 눈금.

지키는 것:
- 견주는 달은 정확히 12달 전 같은 달이다. 그 달이 없으면(빈 달) 값을 안 낸다.
- 행 날짜는 조사한 달(전망하는 달의 앞 달) 1일이다. 전망하는 달은 details.month 에 남는다.
- 차트 점은 최신 행에만, 끝점은 최신 달이다. 점선(w_prev)은 각 점의 1년 전 같은 달 값이다.
- 눈금: 1년 전과 같으면(0p) 상온, +10p 에서 초고온 진입(75), −10p 에서 0.
"""

from __future__ import annotations

from config.indicator_thresholds import INDICATOR_THRESHOLDS
from scripts.calculate_score import compute_progress
from scripts.fetch_business_outlook import INDICATOR_SLUG, SERIES_KEYS, SERIES_MONTHS, build_rows, month_add


def _series(start: str, values: list[float]) -> list[tuple[str, float]]:
    return [(month_add(start, i), v) for i, v in enumerate(values)]


def test_month_add_crosses_years():
    assert month_add("2025-11", 2) == "2026-01"
    assert month_add("2026-01", -1) == "2025-12"
    assert month_add("2026-10", -12) == "2025-10"


def test_compares_with_same_month_a_year_before():
    rows = build_rows(_series("2024-10", [67.0] + [70.0] * 11 + [77.0]))
    assert len(rows) == 1
    r = rows[0]
    assert r["raw_value"] == 10.0
    assert (r["details"]["month"], r["details"]["bsi"], r["details"]["prev"]) == ("2025-10", 77.0, 67.0)
    # 2025-10 전망은 2025-09 에 조사해 그달 말에 나온다
    assert r["date"] == "2025-09-01"


def test_skips_month_without_year_before():
    # 2024-10 이 빠진 계열 — 2025-10 만 견줄 달이 없다(앞뒤 달은 낸다)
    series = [("2024-09", 70.0), ("2024-11", 70.0)] + _series("2024-12", [70.0] * 10) + [("2025-10", 77.0), ("2025-11", 72.0)]
    rows = build_rows(series)
    assert [r["details"]["month"] for r in rows] == ["2025-09", "2025-11"]


def test_chart_series_on_latest_row_only():
    rows = build_rows(_series("2020-01", [60.0 + (i % 7) for i in range(60)]))
    last = rows[-1]["details"]
    assert len(last["w_months"]) == SERIES_MONTHS
    assert last["w_months"][-1] == last["month"]
    by_month = {r["details"]["month"]: r for r in rows}
    assert last["w_prev"] == [by_month[m]["details"]["prev"] for m in last["w_months"]]
    assert not any(k in rows[-2]["details"] for k in SERIES_KEYS)


def test_scale_meaning():
    cfg = INDICATOR_THRESHOLDS[INDICATOR_SLUG]
    p = lambda raw: compute_progress(INDICATOR_SLUG, raw, cfg["threshold"], cfg)  # noqa: E731
    assert 25 <= p(0.0) < 50          # 1년 전과 같으면 상온
    assert round(p(10.0), 6) == 75.0  # 1년 새 +10p 에서 초고온 진입
    assert p(-10.0) == 0.0
