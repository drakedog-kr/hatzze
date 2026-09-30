"""테마 톤에 글을 어느 테마로 넣나(common/theme_tone) — 나열 글은 테마 톤에서 뺀다."""
from collections import Counter

from common.theme_tone import THEME_TONE_MAX_THEMES, list_effect_lines, theme_tone_targets


def test_few_themes_are_kept():
    assert theme_tone_targets({"반도체"}) == {"반도체"}
    assert theme_tone_targets({"반도체", "자동차", "방산"}) == {"반도체", "자동차", "방산"}


def test_list_post_is_dropped_from_theme_tone():
    # "오늘의 특징주" — 네 테마 이상을 건드리면 그 톤을 어느 테마에도 넣지 않는다.
    themes = {"반도체", "조선", "바이오", "방산"}
    assert len(themes) > THEME_TONE_MAX_THEMES
    assert theme_tone_targets(themes) == set()


def test_no_themes_is_empty():
    assert theme_tone_targets(set()) == set()


def test_list_effect_lines_show_before_and_after():
    kept = {("2026-09-30", "반도체"): Counter(positive=60, negative=20, neutral=20),
            ("2026-09-30", "overall"): Counter(positive=5000)}  # 전체 줄 — 테마가 아니라 안 찍는다
    dropped = {("2026-09-30", "반도체"): Counter(positive=30, negative=0, neutral=10),
               ("2026-09-29", "반도체"): Counter(positive=999)}  # 창 밖 — 안 센다
    (line,) = list_effect_lines(kept, dropped, ["2026-09-30"])
    # 넣었을 때 90:20 → 79, 뺀 뒤 60:20 → 72
    assert "반도체: 140건 중 나열 글 40건(28%) 뺌 · 낙관도 79 → 72" in line
