"""scripts/extract_telegram_stocks.py 의 경계 규칙 — 유령 종목을 막는 자리.

config/stock_extraction.py 의 AMBIGUOUS_NAMES 에 든 이름은 뒤에 붙은 한글이 조사가 아니면
종목이 아니다. 실제로 났던 오탐(유니크←유니크레딧, 하이브←하이브로자임, 아스트←아스트로노바)을
그대로 사례로 둔다.
"""
import pytest

from config.stock_extraction import AMBIGUOUS_NAMES
from extract_telegram_stocks import boundary_ok


def _ok(text: str, name: str, ambiguous: bool = True) -> bool:
    start = text.index(name)
    return boundary_ok(text, start, start + len(name), ambiguous)


@pytest.mark.parametrize("name", ["유니크", "하이브", "아스트", "한화", "미래산업"])
def test_known_phantoms_are_in_the_ambiguous_set(name):
    assert name in AMBIGUOUS_NAMES


@pytest.mark.parametrize(
    "text",
    [
        "유럽 은행주 유니크레딧(+0.57%)이 올랐다",
        "유니크레디트와 인테사가",
        "알테오젠의 하이브로자임 플랫폼",
        "아스트로노바가 신제품을",
    ],
)
def test_longer_word_prefix_is_rejected(text):
    name = next(n for n in ("유니크", "하이브", "아스트") if n in text)
    assert _ok(text, name) is False


@pytest.mark.parametrize(
    "text",
    [
        "유니크 - 자동차부품",
        "유니크(011320) 상한가",
        "유니크의 지분",
        "유니크, 3분기",
        "하이브는 오늘",
        "한화(000880)의 자회사",
    ],
)
def test_real_mentions_survive(text):
    name = next(n for n in ("유니크", "하이브", "한화") if n in text)
    assert _ok(text, name) is True


def test_code_annotation_inside_a_word_does_not_fool_the_boundary():
    # 원천이 낱말 한복판에 종목코드 주석을 박은 경우(결 ⑦) — 주석을 건너뛰고 뒤를 본다.
    assert _ok("아스트(067390)로노바", "아스트") is False


def test_front_boundary_rejects_mid_word_even_for_plain_names():
    assert _ok("삼성전자우", "삼성전자", ambiguous=False) is True  # 뒤는 안 본다(오탐 위험군 아님)
    assert _ok("신삼성전자", "삼성전자", ambiguous=False) is False  # 앞이 한글이면 남의 낱말
