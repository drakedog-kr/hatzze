"""투자자예탁금 — 1년 평소 대비 % 계산(build_rows)과 눈금.

지키는 것:
- 기준선은 **직전** 250영업일 중앙값이다. 오늘을 넣으면 불어난 날이 제 기준선을 스스로 올린다.
- 기준선이 덜 찬 날은 값을 안 낸다(짧은 기준선으로 계산한 값이 앞쪽 기록에 섞이지 않게).
- 눈금: 평소(0%)는 상온, +40%(평소의 1.4배)에서 초고온 진입(75), −30% 에서 0.
"""

from __future__ import annotations

from config.indicator_thresholds import INDICATOR_THRESHOLDS
from scripts.calculate_score import compute_progress
from scripts.fetch_investor_deposit import BASELINE_DAYS, INDICATOR_SLUG, build_rows


def _series(values: list[float]) -> list[tuple[str, float]]:
    return [(f"d{i:04d}", v) for i, v in enumerate(values)]


def test_skips_days_without_full_baseline():
    rows = build_rows(_series([100e12] * (BASELINE_DAYS + 3)))
    assert len(rows) == 3
    assert rows[0]["date"] == f"d{BASELINE_DAYS:04d}"


def test_today_is_not_in_its_own_baseline():
    # 직전 250일이 전부 100조이고 오늘만 140조면 기준선은 100조 그대로 → +40%.
    rows = build_rows(_series([100e12] * BASELINE_DAYS + [140e12]))
    assert rows[-1]["raw_value"] == 40.0
    d = rows[-1]["details"]
    assert (d["deposit_jo"], d["median_jo"]) == (140.0, 100.0)


def test_baseline_is_median_not_mean():
    # 앞 249일 100조 + 하루 1,000조(튀는 날)여도 중앙값은 100조다.
    rows = build_rows(_series([100e12] * (BASELINE_DAYS - 1) + [1000e12, 100e12]))
    assert rows[-1]["raw_value"] == 0.0


def test_scale_meaning():
    cfg = INDICATOR_THRESHOLDS[INDICATOR_SLUG]
    p = lambda raw: compute_progress(INDICATOR_SLUG, raw, cfg["threshold"], cfg)  # noqa: E731
    assert 25 <= p(0.0) < 50          # 평소 그대로면 상온
    assert round(p(40.0), 6) == 75.0  # 평소의 1.4배에서 초고온 진입
    assert p(-30.0) == 0.0


def test_chart_series_only_on_latest_row_and_ends_today():
    from scripts.fetch_investor_deposit import SERIES_KEYS, SERIES_STEP

    rows = build_rows(_series([100e12 + i * 1e10 for i in range(BASELINE_DAYS + 300)]))
    last = rows[-1]["details"]
    assert all(k in last for k in SERIES_KEYS)
    assert last["w_dates"][-1] == rows[-1]["date"]      # 끝점은 최신 날
    assert len(last["w_dates"]) == 250 // SERIES_STEP    # 1년 = 50점
    assert len(last["w_dep"]) == len(last["w_med"]) == len(last["w_dates"])
    assert not any(k in rows[-2]["details"] for k in SERIES_KEYS)
