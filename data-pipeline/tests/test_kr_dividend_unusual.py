"""calculate_kr_dividend_stats.summarize — 특별·청산배당 판정(ttm_unusual). 직전 두 해가 0인 회사(2026-10-15 점검)."""
from datetime import date

import calculate_kr_dividend_stats as K

TODAY = date(2026, 10, 4)


def _rec(y: int, amt: float, record: str | None = None, pay: str | None = None) -> dict:
    return {
        "record_date": record or f"{y}-12-31",
        "pay_date": pay or f"{y + 1}-04-15",
        "kind": "현금배당",
        "cash_per_share": amt,
        "fiscal_month": "12",
    }


def test_no_history_high_yield_is_unusual():
    # 진흥기업우B 꼴 — 2019~2025 무배당 뒤 2026-09-30 기준 5,750원(종가 6,080원 · 94.6%). 견줄 배당 해가 없다.
    recs = [{"record_date": f"{y}-12-31", "pay_date": None, "kind": "무배당", "cash_per_share": 0, "fiscal_month": "12"} for y in range(2019, 2026)]
    r = K.summarize("002785", recs + [_rec(2026, 5750, "2026-09-30", "2026-10-21")], TODAY, 6080)
    assert r["ttm_unusual"] is True


def test_long_gap_compares_with_last_paid_year():
    # 예림당 꼴 — 2014년 150원 뒤 쉬다가 662원. 마지막으로 준 해(150원)의 두 배를 넘는다.
    recs = [_rec(2014, 150), _rec(2026, 662, "2026-06-30", "2026-07-23")]
    r = K.summarize("036000", recs, TODAY, 2770)
    assert r["ttm_unusual"] is True


def test_long_gap_similar_amount_is_not_unusual():
    recs = [_rec(2018, 300), _rec(2026, 350, "2026-06-30", "2026-07-23")]
    assert K.summarize("000001", recs, TODAY, 10000)["ttm_unusual"] is False


def test_first_regular_dividend_low_yield_is_not_unusual():
    # 처음 배당을 시작한 회사 — 견줄 해가 없고 수익률이 상한 아래면 평범한 수익률이다.
    r = K.summarize("000002", [_rec(2026, 100, "2026-06-30", "2026-07-23")], TODAY, 5000)
    assert r["ttm_unusual"] is False


def test_prev_year_rule_unchanged():
    # 전년이 있으면 예전 그대로 12개월 합 대 전년 두 배.
    recs = [_rec(2023, 500), _rec(2024, 500), _rec(2025, 1500, "2026-03-31", "2026-04-20")]
    assert K.summarize("000003", recs, TODAY, 20000)["ttm_unusual"] is True
    recs = [_rec(2023, 500), _rec(2024, 500), _rec(2025, 600, "2026-03-31", "2026-04-20")]
    assert K.summarize("000004", recs, TODAY, 20000)["ttm_unusual"] is False
