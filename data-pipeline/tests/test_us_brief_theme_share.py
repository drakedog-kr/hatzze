"""미장 총평 둘째 대목(테마 지형)이 받는 점유율(generate_us_telegram_narratives.theme_lines).

그 대목은 점유율 퍼센트를 하나 적는다. 화면에서 그 숫자를 확인할 곳은 테마 로테이션 표
(lib/us-telegram-data.ts getUsThemeRotation)뿐이고, 그 표는 **최근 3일 평균**을 찍는다. digest 가
기준일 하루 값을 주면 요약은 화면 어디에도 없는 숫자를, 표와 다른 값으로 적는다. 차례(어느 테마에
몰렸나)는 그대로 오늘 것이다 — 파일 머리의 '숫자는 창 것, 주제는 오늘 것'.
"""
import generate_us_telegram_narratives as US

END = "2026-09-29"


def _row(date, theme, share, rank):
    return {"date": date, "theme": theme, "share_pct": share, "rank": rank}


# AI반도체는 오늘 하루 40% 로 튀었지만 사흘 평균은 26.7%, 금융은 사흘 평균 28.3% 로 표 1위다.
ROWS = [
    _row("2026-09-27", "AI반도체", 20, 2), _row("2026-09-27", "금융", 30, 1),
    _row("2026-09-28", "AI반도체", 20, 2), _row("2026-09-28", "금융", 30, 1),
    _row("2026-09-29", "AI반도체", 40, 1), _row("2026-09-29", "금융", 25, 2),
]


def test_share_is_the_tables_three_day_average():
    text = "\n".join(US.theme_lines(ROWS, END))
    assert "AI반도체 · 최근 3일 점유율 26.7%" in text
    assert "금융 · 최근 3일 점유율 28.3%" in text
    assert "40.0%" not in text  # 오늘 하루 값은 화면에 없다


def test_order_stays_todays():
    items = [ln for ln in US.theme_lines(ROWS, END) if ln.startswith("- ")]
    assert [ln[2:].split(" · ")[0] for ln in items] == ["AI반도체", "금융"]


def test_no_theme_rows_today_gives_no_block():
    assert US.theme_lines(ROWS, "2026-09-30") == []


def test_window_shares_match_screen_rule():
    rows = [
        # 14일 창 밖(09-15)은 안 센다. 09-26 은 최근 사흘(09-27·28·29) 밖이라 평균에 안 든다.
        _row("2026-09-15", "A", 90, 1),
        _row("2026-09-26", "A", 60, 1),
        _row("2026-09-27", "A", 30, 1), _row("2026-09-27", "B", 10, 2),
        # B 는 09-28 에 안 떴다 — 0 으로 치고 창 날짜 수(3)로 나눈다.
        _row("2026-09-28", "A", 30, 1),
        _row("2026-09-29", "A", 30, 1), _row("2026-09-29", "B", 20, 2),
    ]
    shares = US.theme_window_shares(rows)
    assert abs(shares["A"] - 30.0) < 1e-9
    assert abs(shares["B"] - 10.0) < 1e-9


def test_window_is_last_three_dates_present():
    # 수집이 끊겨 09-27 이 비면 표는 날짜가 있는 마지막 셋(09-25·26·28)을 쓴다.
    rows = [_row(d, "A", s, 1) for d, s in [("2026-09-24", 90), ("2026-09-25", 10), ("2026-09-26", 20), ("2026-09-28", 30)]]
    assert abs(US.theme_window_shares(rows)["A"] - 20.0) < 1e-9


def test_share_rounds_like_the_table():
    """표는 날짜 오름차순으로 더해 toFixed(1) 로 찍는다. 행이 무작위 id 차례로 와도 같은 글자가 나와야 한다.

    27.84·25.68·21.63 은 그 차례로 더하면 25.049999… → "25.0" 인데, 다른 차례로 더하면 25.05 → "25.1" 이다.
    36.75 가 하루만 있으면 평균이 정확히 12.25 — toFixed(1) 은 "12.3", 파이썬 `:.1f` 는 "12.2" 였다.
    """
    rows = [
        _row("2026-09-29", "AI반도체", 21.63, 1), _row("2026-09-29", "금융", 36.75, 2),
        _row("2026-09-27", "AI반도체", 27.84, 1),
        _row("2026-09-28", "AI반도체", 25.68, 1),
    ]
    text = "\n".join(US.theme_lines(rows, END))
    assert "AI반도체 · 최근 3일 점유율 25.0%" in text
    assert "금융 · 최근 3일 점유율 12.3%" in text


def test_thin_base_day_is_left_out():
    # 기준일 아침 테마 언급이 11건뿐이면(2026-10-04) 그날 몫(우주·방산 31.6%)이 사흘 평균에 들지 않는다 — 화면 usableDays 와 같다.
    def r(d, t, s, m):
        return {"date": d, "theme": t, "share_pct": s, "rank": 1, "mention_count": m}

    rows = [
        r("2026-10-01", "A", 10, 140), r("2026-10-01", "B", 90, 1260),
        r("2026-10-02", "A", 10, 142), r("2026-10-02", "B", 90, 1279),
        r("2026-10-03", "A", 10, 51), r("2026-10-03", "B", 90, 457),
        r("2026-10-04", "A", 100, 11),
    ]
    shares = US.theme_window_shares(rows)
    assert abs(shares["A"] - 10.0) < 1e-9
    assert abs(shares["B"] - 90.0) < 1e-9
