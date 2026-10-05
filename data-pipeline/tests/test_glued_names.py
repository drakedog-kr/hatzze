"""common/text_check.glued_names — 원문 낱말 앞에 한 음절이 붙은 어절('오삼성전자의')을 잡는다(2026-10-04 테마 요약 오타)."""
from common.text_check import glued_names, problems

SRC = "오킨스전자는 삼성전자의 DDR5 후공정 외주를 맡았다. 반도체 업종이 강했다."


def test_glued_name_is_caught():
    assert glued_names("오삼성전자의 DDR5 후공정 외주 확대", SRC) == ["붙은 이름 '오삼성전자'(원문은 '삼성전자')"]
    assert any("붙은 이름" in p for p in problems("오삼성전자의 DDR5 후공정 외주 확대가 화제였습니다.", SRC))


def test_real_words_pass():
    assert glued_names("오킨스전자는 삼성전자의 외주를 맡았습니다", SRC) == []
    assert glued_names("전반도체 업종이 강했습니다", SRC) == []  # 흔한 접두 '전'


def test_theme_brief_drops_only_glued_sentence():
    import generate_theme_briefs as B

    text = "반도체 업종 이야기가 많았습니다. 오삼성전자의 외주 확대가 화제였습니다.\n\n둘째 문단입니다."
    assert B.drop_glued_sentences(text, SRC) == "반도체 업종 이야기가 많았습니다.\n\n둘째 문단입니다."


def test_common_endings_are_not_glued_names():
    # 원문의 '좋았었습니다' 안 '었습니다'에 '늘었습니다'가 걸리던 것(2026-10-05 머지 전 점검) — 떼어 낸 낱말은 원문의 낱말 머리여야 한다.
    src = "주가가 떨어졌습니다. 거래가 많았습니다. 분위기가 좋았었습니다. 오킨스전자는 삼성전자의 협력사입니다."
    for t in ["언급이 크게 늘었습니다.", "관심이 모였습니다.", "이야기가 이어졌습니다."]:
        assert glued_names(t, src) == []
    assert glued_names("오삼성전자의 DDR5 후공정이 화제였습니다.", src)
