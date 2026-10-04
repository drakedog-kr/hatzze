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
    assert r["growth_5y_pct"] is not None and r["growth_5y_pct"] > 0  # 예전엔 −11
    assert r["cut_years_5"] == 0  # 특별배당 다음 해의 하락은 줄인 해가 아니다
