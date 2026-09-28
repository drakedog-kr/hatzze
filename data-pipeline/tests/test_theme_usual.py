"""테마 막대의 '평소'(generate_telegram_narratives.theme_usual) — 화면 loadThemeUsual 과 같은 규칙인가."""
import generate_telegram_narratives as KR


def row(d, scope, pos, neg):
    return {"date": d, "scope": scope, "positive_count": pos, "negative_count": neg}


def test_usual_uses_30_days_before_window_start_only():
    rows = [
        row("2026-08-28", "반도체", 40, 10),  # 창 첫날(09-27) 30일 전 — 넣는다
        row("2026-08-27", "반도체", 900, 0),  # 31일 전 — 뺀다
        row("2026-09-26", "반도체", 40, 10),  # 전날 — 넣는다
        row("2026-09-27", "반도체", 0, 900),  # 창 안 — 뺀다
        row("2026-09-20", "바이오", 900, 0),  # 다른 테마 — 뺀다
    ]
    assert KR.theme_usual(rows, "반도체", "2026-09-27") == KR.optimism(80, 20)


def test_usual_is_none_when_thin():
    rows = [row("2026-09-20", "원전", 50, 9)]  # 59건 < 60
    assert KR.theme_usual(rows, "원전", "2026-09-27") is None


def test_usual_label_band():
    assert KR.usual_label(84, 79) == "평소보다 낙관 쪽"
    assert KR.usual_label(74, 79) == "평소보다 비관 쪽"
    assert KR.usual_label(83, 79) == "평소와 비슷"
    assert KR.usual_label(75, 79) == "평소와 비슷"
