"""신용융자 잔고 — 한 달(20영업일) 증가율 계산(build_rows)과 눈금.

지키는 것:
- 견주는 날은 정확히 LAG_DAYS 영업일 전이다(달력 날짜가 아니라 자료의 행 수로 센다).
- 그만큼 앞이 없는 날은 값을 안 낸다.
- 차트 점은 최신 행에만, 끝점은 최신 날이다. 점선(w_prev)은 각 점의 한 달 전 잔고다.
- 눈금: 잔고 제자리(0%)는 상온, 한 달 새 +10% 에서 초고온 진입(75), −10% 에서 0.
"""

from __future__ import annotations

from config.indicator_thresholds import INDICATOR_THRESHOLDS
from scripts.calculate_score import compute_progress
from scripts.fetch_credit_loan import INDICATOR_SLUG, LAG_DAYS, SERIES_KEYS, SERIES_STEP, build_rows


def _series(values: list[float]) -> list[tuple[str, float]]:
    return [(f"d{i:04d}", v) for i, v in enumerate(values)]


def test_compares_with_exactly_lag_rows_before():
    vals = [30e12] * LAG_DAYS + [33e12]
    rows = build_rows(_series(vals))
    assert len(rows) == 1
    assert rows[0]["raw_value"] == 10.0
    assert (rows[0]["details"]["loan_jo"], rows[0]["details"]["prev_jo"]) == (33.0, 30.0)


def test_chart_series_on_latest_row_only():
    rows = build_rows(_series([30e12 + i * 1e10 for i in range(LAG_DAYS + 300)]))
    last = rows[-1]["details"]
    assert last["w_dates"][-1] == rows[-1]["date"]
    assert len(last["w_dates"]) == 250 // SERIES_STEP
    # 점선은 각 점의 한 달 전 잔고다 — 그 점의 행이 가진 prev_jo 와 같다
    by_date = {r["date"]: r for r in rows}
    assert last["w_prev"] == [by_date[d]["details"]["prev_jo"] for d in last["w_dates"]]
    assert not any(k in rows[-2]["details"] for k in SERIES_KEYS)


def test_scale_meaning():
    cfg = INDICATOR_THRESHOLDS[INDICATOR_SLUG]
    p = lambda raw: compute_progress(INDICATOR_SLUG, raw, cfg["threshold"], cfg)  # noqa: E731
    assert 25 <= p(0.0) < 50          # 잔고 제자리면 상온
    assert round(p(10.0), 6) == 75.0  # 한 달 새 +10% 에서 초고온 진입
    assert p(-10.0) == 0.0
