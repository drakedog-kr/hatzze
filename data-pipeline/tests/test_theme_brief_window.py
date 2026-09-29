"""국장 테마 요약의 창(generate_theme_briefs.brief_window).

화면(lib/theme-window.ts themeDetailWindow)은 기준일을 넣은 사흘을 센다 — 히어로 점유율(테마 로테이션)이
그 사흘이라서다. 요약 문장이 다른 사흘을 읽으면 화면 창 밖인 날의 이야기가 문장에 섞인다. TS 쪽은
tests/theme-window.test.ts 가 같은 예제(기준일 2026-09-29 → 09-27~09-29)로 확인한다.
"""
import generate_theme_briefs as TB
import generate_us_telegram_narratives as US


def test_brief_window_includes_base():
    assert TB.brief_window("2026-09-29") == ("2026-09-27", "2026-09-29")


def test_brief_window_crosses_month_and_year():
    assert TB.brief_window("2026-03-01") == ("2026-02-27", "2026-03-01")
    assert TB.brief_window("2027-01-01") == ("2026-12-30", "2027-01-01")


def test_same_rule_as_us_theme_brief():
    # 미장 테마 요약(generate_us_theme_briefs)은 US.window_dates 로 읽는다. 두 시장 테마 화면이 한 벌이라 창도 같다.
    for base in ("2026-09-29", "2026-03-01", "2027-01-01"):
        assert TB.brief_window(base) == US.window_dates(base)
