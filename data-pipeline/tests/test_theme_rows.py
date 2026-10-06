"""총평이 볼 테마(generate_telegram_narratives.top_themes) — 화면 줄(lib/theme-rows.ts pickThemeRows)과 같은 넷인가.

표본 하한이 없어진 뒤로(2026-10-06) 얇은 날엔 4위 자리에 같은 건수가 몰린다. 두 언어가 동점을 다르게 풀면
총평이 옆 줄에 없는 테마를 말하므로, 아래 PICK_CASE 표를 화면 tests/theme-rows.test.ts 도 그대로 읽는다.
"""
from collections import Counter

import generate_telegram_narratives as KR

# (테마, 언급, 낙관, 비관) — 2026-10-06 창(10-03~10-06, 개천절 연휴 사흘과 10-06 새벽치) 실측 상위 여덟.
# 예전 하한(낙관+비관 20건)이면 반도체 한 줄만 섰다. 4위 자리는 26건 셋이 같아 낙관+비관으로 가른다.
PICK_CASE = [
    ("반도체", 203, 95, 25),
    ("인터넷·플랫폼", 32, 11, 2),
    ("자동차", 26, 8, 4),
    ("지주·밸류업", 26, 12, 4),
    ("2차전지", 26, 13, 4),
    ("전자·부품", 20, 17, 0),
    ("조선", 20, 12, 5),
    ("바이오", 19, 12, 0),
]
PICK_WANT = ["반도체", "인터넷·플랫폼", "2차전지", "지주·밸류업"]


def window_of(rows):
    w = {"overall": Counter(positive=900, negative=100, total=2453)}
    for name, total, pos, neg in rows:
        w[name] = Counter(positive=pos, negative=neg, total=total)
    return w


def test_always_four_even_when_thin():
    assert [s for s, _ in KR.top_themes(window_of(PICK_CASE))] == PICK_WANT


def test_tie_falls_to_name_after_decided():
    w = window_of([("조선", 10, 3, 3), ("방산", 10, 3, 3), ("원전", 10, 3, 3), ("금융", 10, 3, 3), ("건설·부동산", 10, 3, 3)])
    assert [s for s, _ in KR.top_themes(w)] == sorted(["조선", "방산", "원전", "금융", "건설·부동산"])[:4]


def test_skips_overall_and_empty_themes():
    w = window_of([("반도체", 5, 0, 0), ("통신", 0, 0, 0)])
    assert [s for s, _ in KR.top_themes(w)] == ["반도체"]


def test_digest_lists_theme_with_no_decided_messages():
    # 중립 글만 있는 테마도 화면 줄에 선다(막대 없이 '기록 적음'). digest 가 그 테마를 조용히 빼면 안 된다.
    assert "낙관·비관 글이 없어 견줄 수 없음" in open(KR.__file__, encoding="utf-8").read()
