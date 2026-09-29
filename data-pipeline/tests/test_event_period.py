"""일정 추출이 '지난 일'을 기간의 끝으로 가르는지 — 달·분기·해 단위 일정은 그 기간 첫날로 적힌다.

SYSTEM 프롬프트가 "달만 있으면 그 달 1일 · 분기만 있으면 그 분기 첫날 · 해만 있으면 1월 1일"로
적게 한다. 그 첫날을 작성일과 견주면 09-15 에 올라온 "연말 합병 기일"(01-01 year)·"하반기 양산"
(07-01 quarter)·"9월 말 상장"(09-01 month)이 전부 '지난 날짜'로 버려졌다.
"""
from datetime import date

import extract_telegram_events as E

POSTED = date(2026, 9, 15)


def test_period_end_by_precision():
    assert E.period_end(date(2026, 9, 20), "day") == date(2026, 9, 20)
    assert E.period_end(date(2026, 9, 1), "month") == date(2026, 9, 30)
    assert E.period_end(date(2026, 2, 1), "month") == date(2026, 2, 28)
    assert E.period_end(date(2026, 12, 1), "month") == date(2026, 12, 31)
    assert E.period_end(date(2026, 7, 1), "quarter") == date(2026, 9, 30)
    assert E.period_end(date(2026, 10, 1), "quarter") == date(2026, 12, 31)
    assert E.period_end(date(2026, 1, 1), "year") == date(2026, 12, 31)


def test_running_period_is_kept():
    assert E.date_ok(date(2026, 9, 1), "month", POSTED)    # 9월 말 상장 예정
    assert E.date_ok(date(2026, 7, 1), "quarter", POSTED)  # 하반기 양산(프롬프트가 3분기 첫날로 적는다)
    assert E.date_ok(date(2026, 1, 1), "year", POSTED)     # 연말 합병 기일
    assert E.date_ok(date(2026, 9, 15), "day", POSTED)
    assert E.date_ok(date(2026, 10, 1), "month", POSTED)


def test_finished_period_and_past_day_are_dropped():
    assert not E.date_ok(date(2026, 8, 1), "month", POSTED)
    assert not E.date_ok(date(2026, 4, 1), "quarter", POSTED)
    assert not E.date_ok(date(2025, 1, 1), "year", POSTED)
    assert not E.date_ok(date(2026, 9, 14), "day", POSTED)


def test_lookahead_still_counts_from_the_start():
    assert not E.date_ok(POSTED.replace(year=2028), "day", POSTED)
    assert not E.date_ok(date(2028, 1, 1), "year", POSTED)
