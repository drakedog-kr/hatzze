"""calculate_kr_dividend_stats.summarize — 특별배당 해를 5년 증가율 · 줄인 해의 기준으로 쓰지 않는다(2026-10-04 삼성전자)."""
from datetime import date

import calculate_kr_dividend_stats as K

TODAY = date(2026, 10, 4)


def _rec(y: int, amt: float) -> dict:
    return {"record_date": f"{y}-12-31", "pay_date": f"{y + 1}-04-15", "kind": "현금배당", "cash_per_share": amt, "fiscal_month": "12"}


def test_special_base_year_is_skipped():
    # 2019 1,416 · 2020 2,994(특별) · 2021~2025 정기 1,444 · 1,444 · 1,444 · 1,446 · 1,668
    annual = {2019: 1416, 2020: 2994, 2021: 1444, 2022: 1444, 2023: 1444, 2024: 1446, 2025: 1668}
    recs = [_rec(y, a) for y, a in annual.items()]
    r = K.summarize("005930", recs, TODAY, 70000)
    # 기준 해(2020)가 특별배당이 낀 해라 증가율을 안 낸다(예전엔 −11%). 기준을 옮기면 6년이 돼 '5년 연평균'과 어긋난다.
    assert r["growth_5y_pct"] is None
    assert r["cut_years_5"] == 0  # 특별배당 다음 해의 하락은 줄인 해가 아니다


def test_permanent_raise_is_not_special():
    # 씨젠 꼴 — 2020 에 크게 올리고 이듬해 절반 아래로 안 돌아왔다(영구 증액). 특별로 보면 +47% 로 부풀었다.
    annual = {2019: 100, 2020: 1500, 2021: 1000, 2022: 800, 2023: 800, 2024: 800, 2025: 1000}
    r = K.summarize("096530", [_rec(y, a) for y, a in annual.items()], TODAY, 20000)
    assert r["growth_5y_pct"] is not None and r["growth_5y_pct"] < 0
    assert r["cut_years_5"] == 2  # 2021 · 2022 에 줄였다


def test_ttm_by_pay_date_counts_last_years_q3():
    # 삼성전자 꼴 — 2025-09-30 기준 · 11-19 지급은 지급일로 1년 안이다. 2026-09-30 기준은 금액이 아직 없다(0 은 안 든다).
    recs = [
        {"record_date": "2025-09-30", "pay_date": "2025-11-19", "kind": "현금배당", "cash_per_share": 370, "fiscal_month": "12"},
        {"record_date": "2025-12-31", "pay_date": "2026-04-17", "kind": "현금배당", "cash_per_share": 566, "fiscal_month": "12"},
        {"record_date": "2026-03-31", "pay_date": "2026-05-29", "kind": "현금배당", "cash_per_share": 372, "fiscal_month": "12"},
        {"record_date": "2026-06-30", "pay_date": "2026-08-28", "kind": "현금배당", "cash_per_share": 374, "fiscal_month": "12"},
        {"record_date": "2026-09-30", "pay_date": None, "kind": "현금배당", "cash_per_share": 0, "fiscal_month": "12"},
    ]
    r = K.summarize("005930", recs, TODAY, 70000)
    assert r["ttm_count"] == 4 and r["ttm_dps"] == 1682


def test_annual_before_declaration_keeps_last_year():
    # 12/31 결산배당 — 1월엔 올해 금액이 아직 없다(0). 작년 결산배당을 그대로 센다(예전엔 0 이었다).
    recs = [
        {"record_date": "2024-12-31", "pay_date": "2025-04-18", "kind": "현금배당", "cash_per_share": 1000, "fiscal_month": "12"},
        {"record_date": "2025-12-31", "pay_date": None, "kind": "현금배당", "cash_per_share": 0, "fiscal_month": "12"},
    ]
    r = K.summarize("000001", recs, date(2026, 2, 10), 50000)
    assert r["ttm_count"] == 1 and r["ttm_dps"] == 1000


def test_declared_annual_not_double_counted():
    # 올해 결산배당 금액이 정해지면 작년 것은 빠진다.
    recs = [
        {"record_date": "2024-12-31", "pay_date": "2025-04-18", "kind": "현금배당", "cash_per_share": 1000, "fiscal_month": "12"},
        {"record_date": "2025-12-31", "pay_date": None, "kind": "현금배당", "cash_per_share": 1200, "fiscal_month": "12"},
    ]
    r = K.summarize("000001", recs, date(2026, 2, 10), 50000)
    assert r["ttm_count"] == 1 and r["ttm_dps"] == 1200


def test_pay_date_shift_not_double_counted():
    # 영원무역 꼴 — 중간배당 지급일이 9/30 → 9/18 로 당겨졌다. 같은 차례를 두 번 세지 않는다.
    recs = [
        {"record_date": "2025-09-09", "pay_date": "2025-09-30", "kind": "현금배당", "cash_per_share": 700, "fiscal_month": "12"},
        {"record_date": "2025-12-31", "pay_date": "2026-04-15", "kind": "현금배당", "cash_per_share": 1400, "fiscal_month": "12"},
        {"record_date": "2026-08-28", "pay_date": "2026-09-18", "kind": "현금배당", "cash_per_share": 1050, "fiscal_month": "12"},
    ]
    r = K.summarize("111770", recs, TODAY, 50000)
    assert r["ttm_dps"] == 2450


def test_record_date_moved_to_march_not_double_counted():
    # 대한항공 꼴 — 결산 기준일을 12/31 → 이듬해 3/31 로 옮긴 해. 작년 결산과 올해 결산을 둘 다 세지 않는다(반박 검증).
    recs = [
        {"record_date": "2024-12-31", "pay_date": "2025-04-25", "kind": "현금배당", "cash_per_share": 750, "fiscal_month": "12"},
        {"record_date": "2026-03-31", "pay_date": "2026-04-24", "kind": "현금배당", "cash_per_share": 750, "fiscal_month": "12"},
    ]
    r = K.summarize("003490", recs, date(2026, 4, 15), 25000)
    assert r["ttm_dps"] == 750


def test_old_undeclared_row_not_filled():
    # 기준일이 90일 넘게 지났는데 금액이 0 이면(취소 · 자료 누락) 작년 것으로 채우지 않는다.
    recs = [
        {"record_date": "2025-03-31", "pay_date": "2025-05-20", "kind": "현금배당", "cash_per_share": 100, "fiscal_month": "12"},
        {"record_date": "2026-03-31", "pay_date": None, "kind": "현금배당", "cash_per_share": 0, "fiscal_month": "12"},
    ]
    r = K.summarize("000002", recs, TODAY, 10000)
    assert r["ttm_dps"] == 0


def test_first_dividend_declared_counts_before_paid():
    # 첫 배당 — 기준일은 지났고 지급 전이다. 0 으로 두지 않는다(효성오앤비 2026-06-30 기준 · 10-14 지급).
    recs = [{"record_date": "2026-06-30", "pay_date": "2026-10-14", "kind": "현금배당", "cash_per_share": 200, "fiscal_month": "12"}]
    r = K.summarize("097870", recs, TODAY, 10000)
    assert r["ttm_dps"] == 200
