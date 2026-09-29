"""배당을 끊은 미국 종목의 12개월 합이 SEC 값으로 되살아나지 않는지(fetch_us_dividends.apply_payments).

SEC 요약은 '마지막 네 분기'(FRESH_DAYS 400일 안쪽)라 배당을 끊고 1년이 지나도 끊기 전 분기로 합이 나온다.
stockanalysis 가 지난 365일 지급이 없고 선언된 다음 건도 없다고 하면 0 이어야 한다. 기록이 아예 없거나
(안 주는 종목 · 표를 못 읽은 날) 다음 건이 선언돼 있으면 예전처럼 SEC 값을 둔다.
"""
from datetime import date

import fetch_us_dividends as us

TODAY = date(2026, 9, 29)


def _sec_quarters():
    # 2025 년 3분기까지 분기마다 0.5 — 10-K·10-Q 에 실린 모양.
    spans = [("2024-10-01", "2024-12-31"), ("2025-01-01", "2025-03-31"), ("2025-04-01", "2025-06-30"), ("2025-07-01", "2025-09-30")]
    return [{"start": s, "end": e, "val": 0.5, "filed": "2025-11-01"} for s, e in spans]


def _row():
    return {"ticker": "XYZ", "cik": 1, **us.summarize(_sec_quarters(), TODAY)}


def _pay(day, amount=0.5):
    return {"ex": day, "record": day, "pay": day, "amount": amount}


def test_sec_still_counts_quarters_before_the_suspension():
    # 전제: SEC 쪽은 지금도 끊기 전 네 분기를 센다 — 그래서 SA 가 0 이라고 할 때 물러나면 안 된다.
    r = _row()
    assert (r["ttm_dps"], r["ttm_method"]) == (2.0, "quarters")


def test_suspended_dividend_is_zero():
    r = _row()
    hist = [_pay("2025-09-15"), _pay("2025-06-15"), _pay("2025-03-15"), _pay("2024-12-15")]
    gap = us.apply_payments(r, hist, TODAY)
    assert (r["ttm_dps"], r["ttm_method"]) == (0.0, "sa")
    assert r.get("ttm_payments", []) == [] and r.get("pay_months", []) == []
    assert gap == "XYZ SA 0.0 vs SEC 2.0"


def test_declared_next_payment_keeps_sec():
    # 연 1회 지급이 작년보다 며칠 늦은 경우 — 선언은 됐고 아직 안 줬다. 끊은 게 아니다.
    r = _row()
    assert us.apply_payments(r, [_pay("2026-10-02", 2.0), _pay("2025-09-26", 2.0)], TODAY) is None
    assert (r["ttm_dps"], r["ttm_method"]) == (2.0, "quarters")


def test_no_history_keeps_sec():
    r = _row()
    assert us.apply_payments(r, [], TODAY) is None
    assert (r["ttm_dps"], r["ttm_method"]) == (2.0, "quarters")


def test_recent_payments_use_sa():
    r = _row()
    hist = [_pay("2026-09-15", 0.55), _pay("2026-06-15", 0.55), _pay("2026-03-15"), _pay("2025-12-15")]
    assert us.apply_payments(r, hist, TODAY) is None
    assert (r["ttm_dps"], r["ttm_method"]) == (2.1, "sa")
    assert r["pay_months"] == [3, 6, 9, 12]
