"""common/surging.score_surging · common/us_surging.score_us_surging — 국장·미장 급부상 배수.

화면 사본(lib/surging-score.ts)이 tests/surging-score.test.ts 에서 **같은 예제로 같은 값**을 확인한다.
한쪽만 고치면 둘 중 하나가 깨진다.
"""
from common.surging import SHARE_SMOOTHING, score_surging
from common.us_surging import score_us_surging

DATES = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05"]


def _rows(key, data):
    return [{"date": d, key: c, "weighted_score": w, "mention_count": m} for d, c, w, m in data]


# 평일 넷(전체 1,000)과 조용한 하루(09-04, 전체 50). B 는 그 조용한 날에만 2건 나왔다.
QUIET_RECENT = _rows("stock_code", [
    ("2026-09-01", "A", 100, 5), ("2026-09-01", "C", 900, 45),
    ("2026-09-02", "A", 100, 5), ("2026-09-02", "C", 900, 45),
    ("2026-09-03", "A", 300, 15), ("2026-09-03", "C", 700, 35),
    ("2026-09-04", "B", 25, 2), ("2026-09-04", "C", 25, 1),
    ("2026-09-05", "A", 300, 15), ("2026-09-05", "C", 700, 35),
])

# 앞 기간의 조용한 날(09-01, 전체 100)에 H 몫이 25%로 치솟았다 — 2026-09-24 추석 당일 HLB 꼴.
QUIET_PRIOR = _rows("stock_code", [
    ("2026-09-01", "H", 25, 10), ("2026-09-01", "X", 75, 5),
    ("2026-09-02", "H", 10, 2), ("2026-09-02", "X", 990, 50),
    ("2026-09-03", "H", 60, 6), ("2026-09-03", "X", 940, 47),
    ("2026-09-04", "H", 60, 6), ("2026-09-04", "X", 940, 47),
    ("2026-09-05", "H", 60, 6), ("2026-09-05", "X", 940, 47),
])


def _close(a, b):
    assert abs(a - b) < 1e-12, (a, b)


def test_recent_is_last_three_days():
    recent, _ = score_surging(QUIET_RECENT, DATES)
    assert recent == ["2026-09-03", "2026-09-04", "2026-09-05"]


def test_matches_ts_copy():
    _, s = score_surging(QUIET_RECENT, DATES)
    _close(s["A"]["ratio"], 1.9803921568627447)
    _close(s["B"]["ratio"], 84.33333333333333)
    _close(s["C"]["ratio"], 0.704360679970436)
    assert s["A"]["mentions"] == 30
    assert s["B"]["is_new"] is True


def test_recent_is_daily_mean():
    _, s = score_surging(QUIET_RECENT, DATES)
    _close(s["B"]["ratio"], (25 / 50 / 3 + SHARE_SMOOTHING) / SHARE_SMOOTHING)


def test_baseline_is_pooled():
    _, s = score_surging(QUIET_PRIOR, DATES)
    _close(s["H"]["ratio"], 1.8333333333333335)
    recent = 0.06
    old_mean = (recent + SHARE_SMOOTHING) / ((25 / 100 + 10 / 1000) / 2 + SHARE_SMOOTHING)
    pooled = (recent + SHARE_SMOOTHING) / ((25 + 10) / 1100 + SHARE_SMOOTHING)
    assert old_mean < 0.5  # 예전엔 '평소보다 줄었다'로 나왔다
    _close(s["H"]["ratio"], pooled)


def test_us_filters_and_order_match_ts_copy():
    rows = _rows("ticker", [
        ("2026-09-01", "T1", 10, 1), ("2026-09-01", "Z", 990, 50),
        ("2026-09-02", "T1", 10, 1), ("2026-09-02", "Z", 990, 50),
        ("2026-09-03", "T1", 50, 3), ("2026-09-03", "T2", 20, 2), ("2026-09-03", "T3", 30, 4), ("2026-09-03", "Z", 900, 45),
        ("2026-09-04", "T1", 40, 2), ("2026-09-04", "Z", 60, 3),
        ("2026-09-05", "T1", 50, 3), ("2026-09-05", "Z", 950, 45),
    ])
    ranked = score_us_surging(rows, DATES)
    assert [t for t, _m, _n in ranked] == ["T3", "T1"]
    _close(ranked[0][1], 17.666666666666668)
    _close(ranked[1][1], 15.779874213836477)
    assert ranked[1][2] == 8
