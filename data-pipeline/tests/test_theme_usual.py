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


# 화면 tests/theme-vs-usual.test.ts 의 USUAL_CASES 와 **같은 표**다. 두 언어가 같은 답을 내는지 이 표로 묶는다.
# (낙관, 비관, 평소, 기대 라벨)
USUAL_CASES = [
    (850, 150, 79, "평소보다 낙관 쪽"),   # 표본이 크면 폭 5 — 85 vs 79
    (730, 270, 79, "평소보다 비관 쪽"),   # 73 vs 79
    (820, 180, 79, "평소와 비슷"),        # 82 vs 79 — 폭 5 안
    (760, 240, 79, "평소와 비슷"),
    (126, 59, 80, "평소보다 비관 쪽"),    # 2026-09-30 미장 AI반도체: 68 vs 80, 폭 5.9
    (16, 4, 80, "평소와 비슷"),           # 평소와 똑같은 80%. 예전(평활값 70 vs 80)엔 '비관 쪽'이었다
    (15, 5, 85, "평소와 비슷"),           # 75 vs 85 — 20건이면 폭 16 이라 잡음으로 본다
    (10, 10, 85, "평소보다 비관 쪽"),     # 50 vs 85 — 20건이어도 이만큼이면 말한다
    (0, 0, 80, "평소와 비슷"),
]


def test_usual_label_cases():
    for pos, neg, usual, want in USUAL_CASES:
        assert KR.usual_label(pos, neg, usual) == want, (pos, neg, usual)


def test_usual_label_band_widens_with_small_samples():
    # 같은 12 차이(68 vs 80)라도 표본이 작으면 '비슷'이다.
    assert KR.usual_label(68, 32, 80) == "평소보다 비관 쪽"   # 100건 — 폭 8
    assert KR.usual_label(17, 8, 80) == "평소와 비슷"          # 25건 — 폭 16
