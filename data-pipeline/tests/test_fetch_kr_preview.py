"""scripts/fetch_kr_preview.py — 밤사이 미장이 열렸는지 가르는 night_state.

휴장 달력은 2026-09-23 에 핀허브에서 받은 응답에서 필요한 줄만 옮겼다.
"""
from datetime import date

import pytest

from fetch_kr_preview import night_state

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
