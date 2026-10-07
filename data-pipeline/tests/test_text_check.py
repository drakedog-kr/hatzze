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


def _latin(text, source=None):
    return [p for p in problems(text, source, slips=False) if "한글 사이 라틴" in p]


def test_latin_inside_dictionary_name_passes():
    # 2026-10-07 미장 테마 요약 '우주·방산'이 '스X를' · '스X가'로 재시도 셋을 다 썼다. 원문이 없어도 사전으로 통과한다.
    assert _latin("스페이스X를 두고 스타십 시험 비행 이야기가 오갔습니다.") == []
    assert _latin("스페이스X의 발사 소식과 스페이스X가 맺은 거래가 화제였습니다.") == []
    assert _latin("한화가 한국판 스페이스X와의 협업을 예고했습니다.") == []


def test_latin_names_come_from_dictionary():
    from common.text_check import _LATIN_NAMES
    from config.us_stock_extraction import US_NAMES

    assert "스페이스X" in _LATIN_NAMES
    # 사전에서 이 꼴이 되는 미장 이름은 빠짐없이 통과한다 — 새 종목이 들어와도 손으로 이을 필요가 없다.
    for name in US_NAMES:
        if name in _LATIN_NAMES:
            assert _latin(f"오늘은 {name}가 화제였습니다.") == [], name
    # 라틴이 두 자 넘게 이어지는 이름은 애초에 안 걸려 목록에 없다.
    assert "SK하이닉스" not in _LATIN_NAMES


def test_typo_still_caught_next_to_name():
    # 이름이 같은 문장에 있어도 이름 밖의 라틴은 잡는다. 원문을 줘도 같다.
    src = "[상위 종목] 스페이스X(SPCX) 245건"
    assert _latin("스페이스X를 두고 이야기가 들a었습니다.") == ["한글 사이 라틴(들a었)"]
    assert _latin("스페이스X를 두고 이야기가 들a었습니다.", src) == ["한글 사이 라틴(들a었)"]
    assert _latin("메모리a반도체가 화제였습니다.", "메모리 반도체 이야기") != []


def test_latin_word_in_source_passes():
    # 사전 밖 이름(국장 우선주 · 제품 · 단위)은 원문에 그대로 있으면 통과한다.
    src = "- 현대차2우B 배당 · 테슬라 모델Y 인도량 · 연 300만t 증설"
    assert _latin("현대차2우B가 화제였습니다.", src) == []
    assert _latin("모델Y가 화제였습니다.", src) == []
    assert _latin("300만t의 증설이 화제였습니다.", src) == []
    # 원문이 없거나 원문에 없으면 건다.
    assert _latin("모델Y가 화제였습니다.") != []
    assert _latin("모델Y가 화제였습니다.", "테슬라 인도량") != []


def test_latin_source_match_needs_three_chars():
    # 어절 머리가 두 자('들a')면 원문 대조에 넣지 않는다 — 짧으면 아무 데나 걸린다(MIN_STEM).
    assert _latin("지표가 초고온 구간에 들a었습니다.", "문들a 들a었") != []


def test_control_char_is_caught():
    assert any("제어문자" in p for p in problems("지표가\x07 올랐습니다."))


def test_fix_glued_josa_latin():
    from common.text_check import fix_glued_josa_latin

    assert fix_glued_josa_latin("삼성전자와SK하이닉스를") == "삼성전자와 SK하이닉스를"
    assert fix_glued_josa_latin("결과AI 투자") == "결과 AI 투자"
    # 라틴 글자 뒤 조사는 그대로(붙여 쓰는 게 맞다)
    assert fix_glued_josa_latin("SK하이닉스와 삼성전자") == "SK하이닉스와 삼성전자"
    assert fix_glued_josa_latin("엔비디아와 AMD") == "엔비디아와 AMD"
