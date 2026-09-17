"""common/text_check.py — LLM 문장의 깨진 글자·정해진 꼴의 실수를 잡는 검사."""
from common.text_check import is_clean, problems


def test_empty_is_a_problem():
    assert problems("") == ["빈 문장"]
    assert problems("   ") == ["빈 문장"]


def test_clean_sentence_passes_without_source():
    text = "오늘은 시장 지표 2개, 감성 지표 1개가 초고온 구간에 들었습니다."
    assert problems(text, slips=False) == []
    assert is_clean(text, slips=False)


def test_replacement_char_and_lone_jamo_are_caught():
    assert any("대체문자" in p for p in problems("지수가 �로 올랐습니다."))
    assert any("고립 자모" in p for p in problems("지수가 ㅇ올랐습니다."))


def test_latin_between_hangul_is_caught():
    assert any("한글 사이 라틴" in p for p in problems("지표가 초고온 구간에 들a었습니다."))


def test_control_char_is_caught():
    assert any("제어문자" in p for p in problems("지표가\x07 올랐습니다."))
