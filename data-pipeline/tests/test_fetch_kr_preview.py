"""scripts/fetch_kr_preview.py — 밤사이 미장이 열렸는지 가르는 night_state.

휴장 달력은 2026-09-23 에 핀허브에서 받은 응답에서 필요한 줄만 옮겼다.
"""
from datetime import date

import pytest

from fetch_kr_preview import accumulate, night_state

HOLIDAYS = [
    {"eventName": "Labor Day", "atDate": "2026-09-07", "tradingHour": ""},
    {"eventName": "Thanksgiving Day", "atDate": "2026-11-26", "tradingHour": ""},
    {"eventName": "Thanksgiving Day", "atDate": "2026-11-27", "tradingHour": "09:30-13:00"},
    {"eventName": "Christmas", "atDate": "2026-12-24", "tradingHour": "09:30-13:00"},
    {"eventName": "Christmas", "atDate": "2026-12-25", "tradingHour": ""},
    {"eventName": "Good Friday", "atDate": "2027-03-26", "tradingHour": ""},
]


def never():
    raise AssertionError("세션이 있는 날에는 휴장 달력을 부르지 않는다")


@pytest.mark.parametrize(
    "today, session, name",
    [
        # 노동절 다음 날. 2026-09-08 에 실제로 09-04 카드가 다시 떴던 자리다.
        ("2026-09-08", "2026-09-04", "노동절"),
        ("2026-11-27", "2026-11-25", "추수감사절"),
        # 성금요일 뒤 월요일. 국장은 금요일에 열렸고 그 뒤 미장은 한 번도 안 열렸다.
        ("2027-03-29", "2027-03-25", "성금요일"),
        # 주말에 여는 화면도 같은 판정을 받는다.
        ("2027-03-27", "2027-03-25", "성금요일"),
    ],
)
def test_closed_night_is_named(today, session, name):
    assert night_state(date.fromisoformat(today), session, lambda: HOLIDAYS) == ("holiday", name)


@pytest.mark.parametrize(
    "today, session",
    [
        ("2026-09-23", "2026-09-22"),
        # 주말은 휴장이 아니다. 월요일 아침의 금요일 세션은 국장이 아직 못 본 움직임이다.
        ("2026-09-07", "2026-09-04"),
        ("2026-09-06", "2026-09-04"),
        # 추석(09-24·25 국장 휴장) 중에도 미장은 열린다.
        ("2026-09-25", "2026-09-24"),
        # 12-25 는 미장이 쉬었지만 국장도 쉬었다. 12-24 반일장이 국장이 아직 못 본 세션이다.
        ("2026-12-28", "2026-12-24"),
        # 추수감사절 다음 날 반일장도 세션이다.
        ("2026-11-30", "2026-11-27"),
    ],
)
def test_open_night_does_not_call_calendar(today, session):
    assert night_state(date.fromisoformat(today), session, never) == ("open", None)


def test_old_session_without_holiday_is_stale():
    state, why = night_state(date(2026, 9, 23), "2026-09-21", lambda: HOLIDAYS)
    assert state == "stale" and "2026-09-21" in why


def test_calendar_failure_is_stale_not_holiday():
    state, _ = night_state(date(2026, 9, 8), "2026-09-04", lambda: None)
    assert state == "stale"


def test_unknown_holiday_name_still_marks_holiday():
    got = night_state(date(2026, 9, 8), "2026-09-04",
                      lambda: [{"eventName": "Something New", "atDate": "2026-09-07", "tradingHour": ""}])
    assert got == ("holiday", "미국 공휴일")


# ── accumulate: 연휴 뒤 누적 ─────────────────────────────────────────────

def q(session, c, pc):
    return {"session": session, "c": c, "pc": pc}


def test_chuseok_accumulates_three_sessions():
    # 09-24 줄의 pc 가 09-22 종가 — 추석 누적의 기준점이다.
    stored = [
        {"date": "2026-09-24", "quotes": {"SPY": q("2026-09-23", 100, 98), "NVDA": q("2026-09-23", 50, 49)}},
        {"date": "2026-09-25", "quotes": {"SPY": q("2026-09-24", 101, 100), "NVDA": q("2026-09-24", 52, 50)}},
        {"date": "2026-09-26", "quotes": {"SPY": q("2026-09-25", 103, 101), "NVDA": q("2026-09-25", 55, 52)}},
        {"date": "2026-09-27", "quotes": {"SPY": q("2026-09-25", 103, 101), "NVDA": q("2026-09-25", 55, 52)}},
    ]
    today = {"SPY": q("2026-09-25", 103, 101), "NVDA": q("2026-09-25", 55, 52)}
    start, cum, skipped = accumulate(date(2026, 9, 23), today, stored)
    assert start == "2026-09-23" and skipped == []
    assert cum["SPY"] == pytest.approx((103 / 98 - 1) * 100)
    assert cum["NVDA"] == pytest.approx((55 / 49 - 1) * 100)


def test_middle_run_missing_still_exact():
    # 09-25 아침 실행이 실패해도 양 끝(09-24 줄의 pc · 오늘 c)만 있으면 같은 값이다.
    stored = [{"date": "2026-09-24", "quotes": {"SPY": q("2026-09-23", 100, 98)}}]
    start, cum, _ = accumulate(date(2026, 9, 23), {"SPY": q("2026-09-25", 103, 101)}, stored)
    assert start == "2026-09-23" and cum["SPY"] == pytest.approx((103 / 98 - 1) * 100)


def test_monday_after_holiday_accumulates_friday_and_monday():
    # 10-05(월) 대체공휴일 뒤 10-06: 창 [10-02, 10-05] 에 금·월 두 세션.
    stored = [{"date": d, "quotes": {"SPY": q("2026-10-02", 100, 99)}} for d in ("2026-10-03", "2026-10-04", "2026-10-05")]
    start, _, _ = accumulate(date(2026, 10, 2), {"SPY": q("2026-10-05", 102, 100)}, stored)
    assert start == "2026-10-02"


@pytest.mark.parametrize(
    "prev, stored, today",
    [
        # 평범한 월요일: 토·일 줄도 세션이 금요일이라 하루치다.
        ("2026-09-18", [{"date": "2026-09-19", "quotes": {"SPY": q("2026-09-18", 100, 99)}}], q("2026-09-18", 100, 99)),
        # 평범한 화요일: 사이 줄이 없다.
        ("2026-09-21", [], q("2026-09-22", 100, 99)),
        # 084 전 줄이나 미장 휴장 줄은 quotes 가 비어 있다.
        ("2026-09-23", [{"date": "2026-09-24", "quotes": None}], q("2026-09-24", 100, 99)),
    ],
)
def test_single_session_returns_none(prev, stored, today):
    assert accumulate(date.fromisoformat(prev), {"SPY": today}, stored) is None


def test_ticker_without_matching_window_is_dropped():
    # NVDA 는 09-24 아침에 못 받아 첫 세션이 09-24 다. SPY 창(09-23~)과 어긋나니 뺀다.
    # AMD 는 오늘 받은 값이 옛 세션이다. 역시 뺀다.
    stored = [
        {"date": "2026-09-24", "quotes": {"SPY": q("2026-09-23", 100, 98), "AMD": q("2026-09-23", 10, 9)}},
        {"date": "2026-09-25", "quotes": {"SPY": q("2026-09-24", 101, 100), "NVDA": q("2026-09-24", 52, 50)}},
    ]
    today = {"SPY": q("2026-09-25", 103, 101), "NVDA": q("2026-09-25", 55, 52), "AMD": q("2026-09-24", 11, 10)}
    _, cum, skipped = accumulate(date(2026, 9, 23), today, stored)
    assert set(cum) == {"SPY"} and sorted(skipped) == ["AMD", "NVDA"]


# ── 움직임 크기 칸 · EWY 괴리 · 다음 개장일(2026-10-15) ─────────────────────────

from fetch_kr_preview import ewy_premium, next_open_day, pick_leg  # noqa: E402
import fetch_kr_preview as fkp  # noqa: E402
from config.us_kr_pairs import PAIRS, Z_LEGS, Z_SPLIT  # noqa: E402


def test_pick_leg_follows_move_size():
    """평소의 1.5배(Z_SPLIT) 미만이면 작은 칸, 이상이면 큰 칸 — 방향별로."""
    p = next(p for p in PAIRS if (p.ticker, p.stock) in Z_LEGS)
    small_up, big_up, small_down, big_down = Z_LEGS[(p.ticker, p.stock)]
    assert pick_leg(p.ticker, p.stock, True, Z_SPLIT - 0.01, p.up) == small_up
    assert pick_leg(p.ticker, p.stock, True, Z_SPLIT, p.up) == big_up
    assert pick_leg(p.ticker, p.stock, False, 1.2, p.down) == small_down
    assert pick_leg(p.ticker, p.stock, False, 3.0, p.down) == big_down


def test_pick_leg_falls_back_to_whole_leg():
    """사전에 새로 넣고 아직 크기 칸을 안 잰 쌍은 전체 성적."""
    p = PAIRS[0]
    assert pick_leg("NO_SUCH", p.stock, True, 2.0, p.up) == p.up


def test_every_pair_has_size_legs():
    """사전 쌍마다 크기 칸이 있다 — 백테스트가 PAIRS 와 같은 실행에서 낸다."""
    assert {(p.ticker, p.stock) for p in PAIRS} <= set(Z_LEGS)


class _Rows:
    """kr_preview_day 조회 흉내 — 체인 끝 execute().data 만 쓴다."""

    def __init__(self, rows):
        self._rows = rows

    def __getattr__(self, name):
        return lambda *a, **k: self

    @property
    def not_(self):
        return self

    def execute(self):
        return type("R", (), {"data": self._rows})()


class _Db:
    def __init__(self, rows):
        self.rows = rows

    def table(self, name):
        assert name == "kr_preview_day"
        return _Rows(self.rows)


def test_ewy_premium_against_median_of_five_sessions(monkeypatch):
    """괴리 = 오늘 비율 ÷ 직전 미장 세션 다섯 번의 비율 중앙값 − 1. 주말 · 연휴로 되풀이된 세션은 한 번만 센다."""
    monkeypatch.setattr(fkp, "ecos_fx_close", lambda d: 1000.0)
    monkeypatch.setattr(fkp, "kospi_close", lambda db, d: 100.0)
    hist = [  # 최신이 앞(date desc) — 금요일 세션이 토 · 일 · 월 줄에 되풀이된다
        {"us_session": "2026-10-09", "ewy_ratio": 1000.0},
        {"us_session": "2026-10-09", "ewy_ratio": 1000.0},
        {"us_session": "2026-10-09", "ewy_ratio": 1000.0},
        {"us_session": "2026-10-08", "ewy_ratio": 990.0},
        {"us_session": "2026-10-07", "ewy_ratio": 1010.0},
        {"us_session": "2026-10-06", "ewy_ratio": 980.0},
        {"us_session": "2026-10-05", "ewy_ratio": 1020.0},
    ]
    ratio, prem = ewy_premium(_Db(hist), date(2026, 10, 12), 10.2, "2026-10-12")
    assert ratio == pytest.approx(102.0)  # 10.2 × 1000 ÷ 100
    # 다섯 세션 [1000, 990, 1010, 980, 1020] 의 중앙값은 1000 이다(되풀이된 10-09 는 한 번만 센다).
    assert prem == pytest.approx((102.0 / 1000.0 - 1) * 100, abs=0.01)


def test_ewy_premium_waits_for_five_sessions(monkeypatch):
    """기록이 다섯 번 쌓이기 전에는 괴리 없이 비율만 — 화면은 EWY 줄을 안 그린다."""
    monkeypatch.setattr(fkp, "ecos_fx_close", lambda d: 1000.0)
    monkeypatch.setattr(fkp, "kospi_close", lambda db, d: 100.0)
    hist = [{"us_session": f"2026-10-0{i}", "ewy_ratio": 1000.0} for i in (5, 6, 7)]
    ratio, prem = ewy_premium(_Db(hist), date(2026, 10, 12), 10.0, "2026-10-12")
    assert ratio == pytest.approx(100.0) and prem is None


def test_ewy_premium_drops_when_fx_missing(monkeypatch):
    """원/달러 종가를 못 받은 날은 그 줄만 빠진다(ECOS 는 해외 러너에서 가끔 막힌다)."""
    monkeypatch.setattr(fkp, "ecos_fx_close", lambda d: None)
    monkeypatch.setattr(fkp, "kospi_close", lambda db, d: 100.0)
    assert ewy_premium(_Db([]), date(2026, 10, 12), 10.0, "2026-10-12") == (None, None)


@pytest.mark.parametrize(
    "today, expect",
    [
        ("2026-10-15", "2026-10-15"),  # 개장일은 그날
        ("2026-10-17", "2026-10-19"),  # 토요일 → 월요일
        ("2026-10-09", "2026-10-12"),  # 한글날(금) → 월요일
    ],
)
def test_next_open_day(today, expect):
    assert next_open_day(date.fromisoformat(today)).isoformat() == expect
