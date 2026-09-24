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


# ── 2026-09-25: 오로라(039830) ← 오로라 이노베이션(AUR)·영문 병기·붙여 쓴 남의 이름 ──────────


def _aurora(text: str) -> set[str]:
    match_to_code = {"오로라": "039830"}
    pattern, caseless = build_pattern(list(match_to_code))
    ambiguous = {"오로라"} & AMBIGUOUS_NAMES  # 실제 목록을 따른다 — 빠지면 붙여 쓴 꼴이 샌다
    return set(extract(text, pattern, match_to_code, {"오로라": "dict"}, ambiguous, caseless))


@pytest.mark.parametrize(
    "text",
    [
        "제목 : 오로라 이노베이션, '2030 비전' 발표…무인 트럭 3만 대 운영 목표 *이데일리FX*",
        "• 오로라 이노베이션 (AUR) — 2030년까지 무인 트럭 3만 대 이상과 수십억 달러 규모 매출을 목표로 제시.",
        "제목 : [AI시그널] 오로라, 과매수 주의 속 상승세 지속 가능 *이데일리FX*",
        "올드 세컨드 뱅코프는 미국 일리노이주 오로라(Aurora)에 본사를 두고 있다.",
        "반면 자율주행 기업 오로라(Aurora) 지분 가치는 12억 5200만 달러에서 17억 6300만 달러로 증가했다.",
        "쿨링(방열) 부품 업계인 AVC(奇鋐), 오로라스(雙鴻), 젠텍(健策)을 비롯해",
        "전문가들의 평가는 엇갈린다. 오로라매크로스트래티지스는 “이번 지진이",
        "개발하는 기업이다.   오로라(039830)이노베이션 AUR 자율주행 무인트럭 하드웨어",
    ],
)
def test_aurora_innovation_and_other_auroras_are_not_the_stock(text):
    assert _aurora(text) == set()


@pytest.mark.parametrize(
    "text",
    [
        "오로라 (2,249억) +19.4%\n- 글로벌 시장에서 캐릭터 완구 수요 증가에 따른 매출 성장 기대감",
        "13. 오로라 (11.76%) : 레저용품관련주, 시총2100억대, 완구사업",
        "[+13.5%] 오로라/ 2,362억",
        "[실적속보]오로라, 올해 2Q 매출액 912억(+18%) 영업이익 122억(+39%) (연결)",
        "기업명: 오로라(시가총액: 2,481억) A039830\n보고서명: 반기보고서 (2026.06)",
        "(코스닥)오로라 - 기업설명회(IR)개최",
        "오로라의 2분기 영업이익은 122억원으로 컨센서스 147.9억원을 하회했으나",
        "실적관련주\n매드업, 오로라 등 (2)",
        "❤️ [알고리즘 관심주] 오로라 (2026년8월5일)",
        "✅  Amazon에서 판매중인 Palm Pals 인형 (2026년8월5일)\n\n\n#오로라\n#팜팔스",
    ],
)
def test_aurora_stock_mentions_survive(text):
    assert _aurora(text) == {"039830"}
