"""fetch_etf_snapshots — 지난 달들의 말일 고르기 · 응답을 표의 행으로."""

from datetime import date

import fetch_etf_snapshots as m


def test_month_ends_skip_current_month_oldest_first():
    ends = m.month_ends(date(2026, 10, 11), 3)
    assert ends == [date(2026, 7, 31), date(2026, 8, 31), date(2026, 9, 30)]


def test_month_ends_cross_year_and_february():
    ends = m.month_ends(date(2026, 3, 5), 3)
    assert ends == [date(2025, 12, 31), date(2026, 1, 31), date(2026, 2, 28)]


def test_parse_snapshot():
    rows = m.parse_snapshot(
        [{"ISU_CD": "122630", "ISU_NM": "KODEX 레버리지", "TDD_CLSPRC": "34,070", "NAV": "34,317.56", "OBJ_STKPRC_IDX": "506.97"}, {"ISU_CD": ""}],
        "2025-10-10",
    )
    assert rows == [{"code": "122630", "trade_date": "2025-10-10", "name": "KODEX 레버리지", "close_price": 34070.0, "nav": 34317.56, "index_value": 506.97}]
