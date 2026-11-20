"""scripts/extract_telegram_stocks.py 의 KeyPattern — 통짜 패턴(joined_pattern)과 같은 자리를 같은 순서로 내는가.

KeyPattern 은 빠르게 하려고 만든 것이라 결과가 한 자리라도 다르면 안 된다. 다르면 종목 태그 표가 조용히
달라진다. 기준은 늘 `joined_pattern(ordered).finditer(text)` 다.
"""
import random
import string

import pytest

from extract_telegram_stocks import KeyPattern, build_pattern, is_caseless, joined_pattern

KEYS = [
    "삼성전자", "삼성전기", "삼성SDI", "삼성", "성전", "SK하이닉스", "SK이노베이션", "SK텔레콤", "SK", "LG전자", "LG",
    "LS ELECTRIC", "LS", "NAVER", "NEW", "New", "HRS", "HMM", "SBS", "KTB", "KT&G", "KT", "한화에어로스페이스",
    "한화오션", "한화", "F&F", "E1", "S-Oil", "POSCO홀딩스", "KB금융", "카카오뱅크", "카카오", "DB하이텍", "DB",
    "GS건설", "GS", "CJ ENM", "CJ", "3S", "AB", "BCD", "나노신소재", "나노", "하이브", "아스트", "유니크",
]


def _ordered(keys: list[str]) -> list[str]:
    return sorted(keys, key=len, reverse=True)


def _spans(pattern, text: str) -> list[tuple[int, int, str]]:
    return [(m.start(), m.end(), m.group(0)) for m in pattern.finditer(text)]


def _same(keys: list[str], text: str) -> None:
    ordered = _ordered(keys)
    assert _spans(KeyPattern(ordered), text) == _spans(joined_pattern(ordered), text)


@pytest.mark.parametrize(
    "text",
    [
        "삼성전자와 삼성전기, 삼성SDI 그리고 삼성 그룹",
        "SK하이닉스 SK 하이닉스 sk하이닉스 SKhynix SK이노베이션SK텔레콤",
        "LS Electric 과 ls electric, LS ELECTRIC, LS일렉트릭",
        "Naver naver NAVER nAvEr 네이버",
        "New!! new NEW SbS sbs HRSG HRS-1596 HMM(모델)",
        "ABCD ABBCD BCDAB AABCDD",  # 앞 키가 맞으면 그 끝에서 잇는다 — 겹친 BCD 는 안 나온다
        "삼성전 성전 삼성전자성전",  # 긴 키가 못 맞은 자리에서 짧은 키 · 안쪽에서 시작하는 키
        "한화에어로스페이스한화오션한화 KT&G KT& KT F&F E1 S-Oil s-oil 3S 3s",
        "ſbs ſBS Ktb KTB KT&G neſ",  # 긴 s · 켈빈 기호 — 엔진은 s · k 로 본다
        "İSTANBUL ıstanbul ＮＡＶＥＲ ＳＫ",  # 터키어 i · 전각 글자
        "",
        "종목 이름이 하나도 없는 글 1234 !!!",
    ],
)
def test_same_spans_as_joined_pattern(text):
    _same(KEYS, text)


def test_build_pattern_returns_the_fast_pattern_and_the_same_reverse_index():
    pattern, caseless = build_pattern(list(KEYS))
    assert isinstance(pattern, KeyPattern)
    assert caseless["ls electric"] == "LS ELECTRIC"
    assert caseless["naver"] == "NAVER"
    assert "sk" not in caseless  # 두 글자 약자는 대소문자를 가린다
    text = "LS Electric 과 Naver, sk 는 아니다"
    assert _spans(pattern, text) == _spans(joined_pattern(_ordered(KEYS)), text)


def test_random_texts_give_the_same_spans():
    rng = random.Random(20261120)
    pieces = KEYS + [k.lower() for k in KEYS] + [k.title() for k in KEYS if not any("가" <= c <= "힣" for c in k)]
    pieces += [k[:-1] for k in KEYS if len(k) > 1] + [k[1:] for k in KEYS if len(k) > 1]
    pieces += [" ", " ", "\n", ",", "(", ")", "-", "&", "의", "는", "가", "와", "ſ", "K", "S", "K", "s", "k", "1", "%"]
    ordered = _ordered(KEYS)
    fast, joined = KeyPattern(ordered), joined_pattern(ordered)
    for _ in range(3000):
        text = "".join(rng.choice(pieces) for _ in range(rng.randint(1, 30)))
        assert _spans(fast, text) == _spans(joined, text), text


def test_every_codepoint_that_can_start_a_caseless_key_is_tried():
    """후보 자리를 찾는 문자 집합이 좁으면 그 글자로 시작하는 매치를 통째로 놓친다. 유니코드 전 글자로 본다.

    대소문자를 무시하는 키의 첫 글자가 될 수 있는 것은 라틴 글자 · 숫자 · 기호다(is_caseless 는 한글이 든 이름을 뺀다).
    그 글자마다 키를 하나씩 두고, 모든 글자 뒤에 같은 꼬리를 붙인 본문에서 통짜 패턴과 대조한다.
    """
    firsts = string.ascii_letters + string.digits + "&-.+"
    keys = [c + "zz" for c in firsts]
    assert all(is_caseless(k) for k in keys)
    ordered = _ordered(keys)
    text = "".join(chr(cp) + "zz\n" for cp in range(0x110000) if not 0xD800 <= cp <= 0xDFFF)
    want = _spans(joined_pattern(ordered), text)
    assert _spans(KeyPattern(ordered), text) == want
    # 맞는 자리가 첫 글자 가짓수(66)보다 많아야 이 시험이 뜻이 있다 — 엔진이 s 로 보는 `ſ` 같은 글자가 들어 있다는 뜻이다.
    assert len(want) > len(firsts)
    assert any(got == "ſzz" for _s, _e, got in want)


@pytest.mark.parametrize("keys", [[], [""], ["AB", ""], ["삼성", "", "SK"]])
def test_degenerate_dictionaries_behave_like_the_joined_pattern(keys):
    ordered = _ordered(keys)
    for text in ("", "xABx", "삼성 SK"):
        assert _spans(KeyPattern(ordered), text) == _spans(joined_pattern(ordered), text)
