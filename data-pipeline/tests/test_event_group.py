"""common/event_group — lib/event-group.ts 의 사본. 텔레그램 📌 일정 블록과 카더라 '다가오는 일정'이 같은 날을 말해야 한다.

2026-10-08 저녁 '내일 일정'에 '10월 9일 삼성전자 · 3분기 잠정실적 발표'가 실렸다. 34곳이 10/8 로, 5곳이 10/9 로 적었는데
발송이 내일 하루치만 읽어서 34곳 줄을 못 봤다(10/8 아침 발표 · 10/9 한글날 휴장).
"""
import re
from datetime import date
from pathlib import Path

from common.event_group import KINDS, NEAR_DAYS, ONE_SHOT, PAST_DAYS, event_kind, settle_rows

LIB = Path(__file__).resolve().parents[2] / "lib"


def rows(code, n, day, event, posted="2026-10-01T00:00:00+00:00", prefix="c"):
    return [
        {"channel_handle": f"{prefix}{i}", "stock_code": code, "event_date": day, "event": event, "posted_at": posted}
        for i in range(n)
    ]


def kept(rs, lo, hi):
    return sorted({(r["stock_code"], r["event_date"]) for r in settle_rows(rs, "stock_code", date.fromisoformat(lo), date.fromisoformat(hi))})


SAMSUNG = rows("005930", 34, "2026-10-08", "3분기 잠정실적 발표") + rows("005930", 5, "2026-10-09", "3분기 잠정실적 발표")


def test_tomorrow_line_loses_to_today_with_more_channels():
    # 10/8 저녁 '내일 일정'(10/9 하루) — 고치기 전엔 5곳 줄이 실렸다.
    assert kept(SAMSUNG, "2026-10-09", "2026-10-09") == []
    # 10/8 아침 '오늘 일정'은 34곳 줄이 그대로 선다.
    assert kept(SAMSUNG, "2026-10-08", "2026-10-08") == [("005930", "2026-10-08")]


def test_today_line_loses_to_tomorrow_with_more_channels():
    # 3곳이 10/7 로 적은 것도 같은 이야기다 — 10/7 아침 '오늘 일정'에 서면 안 된다.
    rs = rows("005930", 3, "2026-10-07", "3분기 잠정실적 발표") + SAMSUNG
    assert kept(rs, "2026-10-07", "2026-10-07") == []


def test_far_or_procedural_or_outnumbered_past_stays():
    rs = (
        rows("005930", 3, "2026-10-07", "3분기 잠정실적 발표") + rows("005930", 5, "2026-10-09", "3분기 실적 발표", prefix="d")
        + rows("000660", 9, "2026-10-01", "잠정실적 발표") + rows("000660", 2, "2026-10-09", "실적 발표", prefix="d")
        + rows("207940", 9, "2026-10-08", "배당 기준일") + rows("207940", 2, "2026-10-09", "배당금 지급", prefix="d")
    )
    assert kept(rs, "2026-10-09", "2026-10-09") == [("000660", "2026-10-09"), ("005930", "2026-10-09"), ("207940", "2026-10-09")]


def test_tie_goes_to_first_seen_like_lib():
    past = rows("MU", 2, "2026-10-07", "실적 발표", posted="2026-10-01T00:00:00+00:00")
    later = rows("MU", 2, "2026-10-09", "실적 발표", posted="2026-10-02T00:00:00+00:00", prefix="d")
    earlier = rows("MU", 2, "2026-10-09", "실적 발표", posted="2026-09-30T00:00:00+00:00", prefix="d")
    assert kept(past + later, "2026-10-09", "2026-10-09") == []
    assert kept(past + earlier, "2026-10-09", "2026-10-09") == [("MU", "2026-10-09")]


def test_single_channel_after_many_in_past_days_is_dropped():
    # lib dropAlreadyHappened — 10/1 여러 채널 실적 뒤 한 채널의 10/13 '실적 발표'(NEAR_DAYS 밖).
    rs = rows("MU", 3, "2026-10-01", "4분기 실적 발표") + rows("MU", 1, "2026-10-13", "실적 발표", prefix="d")
    rs += rows("000660", 3, "2026-10-01", "자사주 재공시 기한") + rows("000660", 1, "2026-10-13", "자사주 매입 및 소각 완료", prefix="d")
    assert kept(rs, "2026-10-13", "2026-10-13") == [("000660", "2026-10-13")]


def test_other_events_on_the_same_day_survive():
    rs = SAMSUNG + rows("005930", 2, "2026-10-09", "자사주 매입 종료", prefix="d")
    out = settle_rows(rs, "stock_code", date(2026, 10, 9), date(2026, 10, 9))
    assert {r["event"] for r in out} == {"자사주 매입 종료"}


def test_kind_matches_lib_examples():
    assert event_kind("3분기 잠정 실적 발표") == event_kind("잠정실적발표") == "실적"
    assert event_kind("TSMC 9월 매출 실적 공개") == "매출"
    assert event_kind("신주 상장") == "상장"
    assert event_kind("DGX Spark 64GB/128GB 판매 개시") == "출시"
    assert event_kind("Meta Connect Keynote") == "공개"
    assert event_kind("용인 Y1 첫 클린룸 개설") == "용인y1첫클린룸개설"


def test_copy_matches_lib_source():
    """KINDS(차례 · 낱말) · ONE_SHOT · NEAR_DAYS · PAST_DAYS 가 화면 원본과 같은가."""
    src = (LIB / "event-group.ts").read_text()
    body = src[src.index("const KINDS"):src.index("];", src.index("const KINDS"))]
    lib_kinds = re.findall(r'^\s*\["([^"]+)", /(.+)/i?\],', body, re.M)
    assert lib_kinds == KINDS
    one_shot = re.search(r"const ONE_SHOT = new Set\(\[(.*?)\]\)", src).group(1)
    assert set(re.findall(r'"([^"]+)"', one_shot)) == ONE_SHOT
    assert int(re.search(r"const NEAR_DAYS = (\d+);", src).group(1)) == NEAR_DAYS
    for f in ("kadera-why.ts", "kadera-us-why.ts"):
        assert int(re.search(r"const PAST_DAYS = (\d+);", (LIB / f).read_text()).group(1)) == PAST_DAYS
