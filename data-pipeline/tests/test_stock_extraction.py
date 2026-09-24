"""scripts/extract_telegram_stocks.py 의 경계 규칙 — 유령 종목을 막는 자리.

config/stock_extraction.py 의 AMBIGUOUS_NAMES 에 든 이름은 뒤에 붙은 한글이 조사가 아니면
종목이 아니다. 실제로 났던 오탐(유니크←유니크레딧, 하이브←하이브로자임, 아스트←아스트로노바)을
그대로 사례로 둔다.
"""
import pytest

from config.stock_extraction import AMBIGUOUS_NAMES
from extract_telegram_stocks import boundary_ok, build_pattern, extract


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


# ── 2026-09-19 주간 유령 점검 첫 회에서 막은 자리 ─────────────────────────────


@pytest.mark.parametrize(
    "text,name",
    [
        ("대산 LNG 발전소에 HRSG 공급", "HRS"),  # 배열회수보일러
        ("미래대응기금 OCIO 위탁", "OCI"),
        ("UNIST·DGIST 지원자", "DGI"),
    ],
)
def test_latin_name_followed_by_latin_is_rejected_even_when_not_ambiguous(text, name):
    assert _ok(text, name, ambiguous=False) is False


def test_hangul_name_followed_by_latin_is_still_accepted():
    assert _ok("SK하이닉스ADR 강세", "SK하이닉스", ambiguous=False) is True


def test_hyphen_pairs_survive():
    # 붙임표 뒤를 거부하는 규칙은 접었다 — 짝 표기가 같은 자리를 쓴다.
    assert _ok("한화-EDGE 통합대공망", "한화") is True
    assert _ok("아스트-거래재개", "아스트") is True


def test_short_acronym_must_match_dictionary_case():
    # 3글자 이하 라틴 약자는 표기가 사전과 다르면 다른 뜻(`SbS` 패키징, `New`). 긴 이름은 그대로.
    match_to_code = {"SBS": "034120", "NEW": "160550", "NAVER": "035420"}
    method = {k: "dict" for k in match_to_code}
    pattern, caseless = build_pattern(list(match_to_code))
    text = "엑시노스 SbS 구조 (New!!) Naver 제휴, SBS Biz"
    found = extract(text, pattern, match_to_code, method, {"NEW"}, caseless)
    assert set(found) == {"035420", "034120"}


# ── 2026-09-24: 띄어 쓴 외국 지명·선박명 뒤의 케이프(064820) ──────────────────────


def _cape(text: str) -> set[str]:
    match_to_code = {"케이프": "064820"}
    pattern, caseless = build_pattern(list(match_to_code))
    return set(extract(text, pattern, match_to_code, {"케이프": "dict"}, {"케이프"}, caseless))


@pytest.mark.parametrize(
    "text",
    [
        "발사 장소: 플로리다주 케이프 커내버럴 우주군 기지 40번 발사대",
        "그들은 자신들만의 '케이프 커내버럴'을 건설하고 있다",
        "아랍에미리트 소유 화물선 MV 케이프 다오가 이날 오전 호르무즈 해협을",
        "퍼보 에너지의 케이프 스테이션 1단계 연내 가동",
        "아일랜드 빌리지, 로어 케이프 피어 수자원공사 등이다.",
    ],
)
def test_cape_before_spaced_foreign_place_is_not_the_stock(text):
    assert _cape(text) == set()


@pytest.mark.parametrize(
    "text",
    [
        "· 한화오션·현대힘스·케이프 등 조선·기자재주 강세",
        "케이프(064820) 상한가",
        "케이프 +5%",
        "(코스닥)케이프 - 반기보고서 (2026.06)",
        "#삼성중공업 #한화오션 #케이프 #동성화인텍",
        "[실적속보]케이프, 올해 2Q 매출액 16억",
    ],
)
def test_cape_stock_mentions_survive(text):
    assert _cape(text) == {"064820"}
