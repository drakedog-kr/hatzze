"""fetch_etf_flows — KRX 응답을 표의 행으로 옮기는 자리 · 휴장일 거르기 · 직전 거래일 고르기."""

from datetime import date

import fetch_etf_flows as m


def _item(code, shares, nav, value="1,000", name=None):
    return {
        "ISU_CD": code,
        "ISU_NM": name or f"ETF {code}",
        "LIST_SHRS": shares,
        "NAV": nav,
        "ACC_TRDVAL": value,
        "TDD_CLSPRC": nav,
        "FLUC_RT": "0.10",
        "INVSTASST_NETASST_TOTAMT": "1,000,000",
        "IDX_IND_NM": "코스피 200",
        "OBJ_STKPRC_IDX": "1,073.63",
    }


def test_flow_is_share_change_times_today_nav():
    rows, shares = m.parse_day(
        [_item("069500", "1,200", "40,000.5"), _item("102110", "900", "39,000")],
        "2026-10-07",
        {"069500": 1000.0, "102110": 1000.0},
    )
    by = {r["isu_cd"]: r for r in rows}
    assert by["069500"]["net_flow"] == 200 * 40000.5
    assert by["102110"]["net_flow"] == -100 * 39000
    assert shares == {"069500": 1200.0, "102110": 900.0}
    assert by["069500"]["index_value"] == 1073.63


def test_first_day_or_new_listing_has_no_flow():
    # 직전 거래일에 없던 코드(상장일 · 적재 첫날)는 0 이 아니라 None — 0 이면 '안 움직였다'로 읽힌다.
    rows, _ = m.parse_day([_item("0094M0", "500", "10,000")], "2026-10-07", {})
    assert rows[0]["net_flow"] is None


def test_blank_nav_keeps_row_without_flow():
    rows, shares = m.parse_day([_item("451060", "12,600,000", "")], "2026-10-07", {"451060": 12_000_000.0})
    assert rows[0]["net_flow"] is None
    assert shares == {"451060": 12_600_000.0}


def test_zero_net_asset_falls_back_to_shares_times_nav():
    # 가장 최근 거래일은 순자산 칸이 전 종목 '0' 으로 온다 — 0 을 그대로 두면 화면 순자산 합이 0억이 된다.
    item = {**_item("451060", "12,600,000", "33,866.72"), "INVSTASST_NETASST_TOTAMT": "0"}
    rows, _ = m.parse_day([item], "2026-10-08", {})
    assert rows[0]["net_asset"] == 12_600_000 * 33866.72
    rows, _ = m.parse_day([_item("069500", "1,200", "40,000")], "2026-10-07", {})
    assert rows[0]["net_asset"] == 1_000_000  # 값이 있으면 그대로


def test_holiday_is_zero_trade_value_even_with_rows():
    # 휴장일에도 전 종목이 좌수와 함께 실려 온다 — 거래대금 합계로만 가른다.
    assert m.is_holiday([_item("069500", "1,200", "", value=""), _item("102110", "900", "", value="0")])
    assert not m.is_holiday([_item("069500", "1,200", "40,000", value="0"), _item("102110", "900", "39,000", value="5")])


def test_prev_day_too_far_back_is_not_used():
    assert m.usable_prev("2026-10-02", date(2026, 10, 6))  # 개천절 대체 휴일을 건넌 나흘
    assert not m.usable_prev("2026-09-20", date(2026, 10, 6))  # 파이프라인이 오래 멈췄던 날
    assert not m.usable_prev(None, date(2026, 10, 6))


def test_refresh_year_failure_does_not_stop_run(capsys):
    """1년 합 뷰가 아직 없어도(마이그레이션 097 전) 일별 쓰기를 마친 실행은 죽지 않는다 — 경고만 남긴다."""

    class DB:
        def rpc(self, name):
            raise RuntimeError(f"function {name} does not exist")

    m.refresh_year(DB())
    assert "경고" in capsys.readouterr().out


class _Query:
    """표 읽기 흉내 — stored_shares 가 부르는 select · eq · order · range · execute 만."""

    def __init__(self, rows):
        self.rows = rows
        self.day = None
        self.lo = 0
        self.hi = 0

    def select(self, *_):
        return self

    def eq(self, _col, day):
        self.day = day
        return self

    def order(self, *_, **__):
        return self

    def range(self, lo, hi):
        self.lo, self.hi = lo, hi
        return self

    def execute(self):
        picked = [r for r in self.rows if r["trade_date"] == self.day]
        return type("R", (), {"data": picked[self.lo : self.hi + 1]})()


class _DB:
    def __init__(self, rows):
        self.rows = rows

    def table(self, _name):
        return _Query(self.rows)


def test_stored_shares_pages_past_1000_rows():
    """하루 1,172행 — 1,000행 캡을 넘어도 그날 좌수를 다 읽는다. 다른 날 행은 섞이지 않는다."""
    rows = [{"trade_date": "2026-10-08", "isu_cd": f"{i:06d}", "list_shares": i + 1} for i in range(1172)]
    rows += [{"trade_date": "2026-10-07", "isu_cd": "000001", "list_shares": 999}]
    got = m.stored_shares(_DB(rows), "2026-10-08")
    assert len(got) == 1172
    assert got["000001"] == 2.0


def test_stored_shares_empty_when_day_not_in_table():
    """표에 없는 날(진짜 휴장)은 빈 dict — 수집기는 그때만 '휴장'으로 건너뛴다."""
    assert m.stored_shares(_DB([]), "2026-10-09") == {}
