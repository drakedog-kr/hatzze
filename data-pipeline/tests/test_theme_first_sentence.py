"""테마 요약 첫 문장(generate_theme_briefs.first_sentence) — 목록 화면 lib/theme-page.ts briefFirstSentence 와 같은 규칙.

목록(테마 흐름 '요즘 도는 얘기')은 첫 문장만 한 줄로 세운다. 2026-10-05 오늘 요약 41개로 TS 와 길이가 다 같았다.
"""
from generate_theme_briefs import FIRST_SENTENCE_MAX, first_sentence


def test_first_sentence_cuts_after_da():
    text = "삼성전기 기판 증설 소식이 화제였습니다. 이어서 다른 이야기가 돌았습니다.\n\n둘째 문단입니다."
    assert first_sentence(text) == "삼성전기 기판 증설 소식이 화제였습니다."


def test_short_first_piece_joins_next():
    text = "말이 돌았습니다. 엔비디아 납품 기대가 함께 거론됐습니다. 셋째 문장."
    assert first_sentence(text) == "말이 돌았습니다. 엔비디아 납품 기대가 함께 거론됐습니다."


def test_limit_fits_one_line_at_1440():
    # 1440 에서 '요즘 도는 얘기' 칸 한 줄이 59자 남짓이다.
    assert FIRST_SENTENCE_MAX <= 59
