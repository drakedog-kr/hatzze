"""종목 요약·테마 요약 창의 아래 경계(posted_since) — posted_at(UTC)을 KST 날짜로 재나.

since 는 KST 날짜인데 posted_at[:10] 은 UTC 날짜라, 창 첫날 00~09시(KST)에 올라온 글이
빠졌다. build_stock_digests 의 [언급 톤]·발췌 후보와 generate_theme_briefs 의 재료가 이 판정을 쓴다.
"""
import generate_telegram_narratives as KR

SINCE = "2026-09-26"


def test_first_day_early_morning_kst_is_inside():
    # 전부 KST 09-26 00:00 ~ 08:59 — UTC 로는 09-25 다.
    for posted_at in (
        "2026-09-25T15:00:00+00:00",
        "2026-09-25T20:30:00+00:00",
        "2026-09-25T23:59:59+00:00",
        "2026-09-25T23:59:59Z",
    ):
        assert KR.kst_date(posted_at) == SINCE
        assert KR.posted_since(posted_at, SINCE), posted_at


def test_day_before_window_is_outside():
    # KST 09-25 23:59 — UTC 로 09-25 14:59. 창 밖이다.
    assert not KR.posted_since("2026-09-25T14:59:59+00:00", SINCE)
    assert not KR.posted_since("2026-09-24T20:00:00+00:00", SINCE)


def test_later_days_are_inside():
    assert KR.posted_since("2026-09-26T00:00:01+00:00", SINCE)
    assert KR.posted_since("2026-09-28T16:00:00+00:00", SINCE)  # KST 09-29 01:00 — 위 경계는 두지 않는다
