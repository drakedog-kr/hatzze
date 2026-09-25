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


# ── 2026-09-25: 나노(187790) ← 띄어 쓴 합성어의 앞자리(결 ⑧) ──────────────────────────────
# 급부상 카드 3~4위에 오른 사흘 창(09-10~14)의 유령이 `나노 바나나`·`‘나노 장벽’`·`‘나노 숫자’`였다.


def _nano(text: str, extra: dict[str, str] | None = None) -> set[str]:
    match_to_code = {"나노": "187790", **(extra or {})}
    pattern, caseless = build_pattern(list(match_to_code))
    ambiguous = set(match_to_code) & AMBIGUOUS_NAMES
    return set(extract(text, pattern, match_to_code, {k: "dict" for k in match_to_code}, ambiguous, caseless))


@pytest.mark.parametrize(
    "text",
    [
        "✅ Google Pics 간략 정리\n- 나노 바나나 기반의 생성 모델의 편집 도구로의 전환",
        "65조 쏟아 팹 골조 세운 TSMC, 1.4나노 ‘나노 장벽’ 앞엔 멈춰 섰다",
        "📉 TSMC (-20)\n1.4나노 '나노 장벽'에 직면, 생산 멈춤 우려",
        "선단공정 경쟁의 축이 ‘나노 숫자’에서 ‘설계 최적화 능력’으로 이동 중",
        "현대차그룹, 경찰버스에 온도 낮춰주는 ‘나노 쿨링 필름’ 시범 적용",
        "뉴스케일파워(+15.26%), 나노 뉴클리어 에너지(+9.20%), 오클로(+4.94%) 등 美 원자력발전 관련주가",
        "제목 : 나노 디멘션, 본사 임대 조기 해지 합의…2500만 달러 순절감 예상 *이데일리FX*",
        # kwtok 태거가 박은 종목코드 주석(결 ⑦)은 건너뛰고 본다.
        "경영 사무소를 둔 기업이다.   나노(187790) 디멘션 NNDM 나다브 키드론",
    ],
)
def test_nano_as_front_of_a_spaced_compound_is_not_the_stock(text):
    assert _nano(text) == set()


@pytest.mark.parametrize(
    "text",
    [
        "✅ 나노, 신공장 기반 발전설비 시장 확대 수요 대응",
        "• 한솔제지\n• 양지사\n• 인터지스\n• 나노\n• 미래에셋증권우",
        "나노(187790) | +29.97% | 3,730원\n→ KOSDAQ 장중 상한가입니다.",
        "6. 나노 (29.97%) : 화학관련주, 시총1100억대, SCR탈질촉매사업",
        "✅️ 나노 : +30.0% 상승 중",
        "(코스닥)나노 - 반기보고서 (2026.06)",
        "· 지난 4월 16일 리포트 발간했던 SCR 촉매 기업 '나노' 입니다.",
        "[나노/소재/대기오염방지]\n제목: SCR 탈질촉매 기술 통합을 통한 대기환경 전문기업으로",
    ],
)
def test_nano_stock_mentions_survive(text):
    assert _nano(text) == {"187790"}


def test_nano_promotion_to_a_longer_name_comes_first():
    # 뒷말을 붙여 더 긴 종목명이 되면 그 종목이다. 승격 뒤에 거르므로 나노신소재는 산다.
    assert _nano("나노 신소재 강세", {"나노신소재": "121600"}) == {"121600"}


# ── 2026-09-25: 디바이스(187870) ← 무라타 사업부 이름 · GS(078930) ← 골드만삭스 출처 표기 ──────
# 이슈 #572. 같은 골드만 리포트 요약 한 편(`무라타 컨퍼런스콜 후기 … (GS)`)이 여섯 채널에 복붙돼
# 급부상 카드의 디바이스(2위)와 GS(3위)를 함께 띄웠다.


def _device(text: str) -> set[str]:
    match_to_code = {"디바이스": "187870"}
    pattern, caseless = build_pattern(list(match_to_code))
    ambiguous = {"디바이스"} & AMBIGUOUS_NAMES
    return set(extract(text, pattern, match_to_code, {"디바이스": "dict"}, ambiguous, caseless))


@pytest.mark.parametrize(
    "text",
    [
        "• BBU/AI 전원 사업은 계획대로 순항 중\n\n• 디바이스/모듈 부문의 28년 실적 개선 가시성이 높아지고 있다는 인상",
        "손실 30억 엔이 계상되었고, 디바이스 모듈은 실적이 악화되어 연간 손익분기점 달성을 목표로 하고 있습니다.",
    ],
)
def test_murata_device_module_segment_is_not_the_stock(text):
    assert _device(text) == set()


@pytest.mark.parametrize(
    "text",
    [
        "미래산업/ 단일판매ㆍ공급계약/  상세보기 \n디바이스/ 단일판매ㆍ공급계약/  상세보기 ",
        "(코스닥)디바이스 - 단일판매ㆍ공급계약체결",
        "기업명: 디바이스(시가총액: 1,238억) A187870\n보고서명: 단일판매ㆍ공급계약체결",
        "[실적속보]디바이스, 올해 2Q 매출액 233억(+153%) 영업이익 77.5억(+251%)",
        "디바이스 수주공시 - 반도체 세정장비 86.7억원 (매출액대비  10.31 %)",
        "첫 번째, 디바이스는 반도체 및 OLED 세정 장비 전문기업입니다.",
        "• 디바이스 8.05 → 6.26 (8/4)",
    ],
)
def test_device_stock_mentions_survive(text):
    assert _device(text) == {"187870"}


def _gs(text: str) -> set[str]:
    match_to_code = {"GS": "078930", "GS건설": "006360"}
    pattern, caseless = build_pattern(list(match_to_code))
    ambiguous = {"GS"} & AMBIGUOUS_NAMES
    return set(extract(text, pattern, match_to_code, {k: "dict" for k in match_to_code}, ambiguous, caseless))


@pytest.mark.parametrize(
    "text",
    [
        "무라타 컨퍼런스콜 후기 : MLCC 단기·장기 강세 및 경쟁력 재확인, Buy 유지 (GS)\n\n1. MLCC 수주 상황",
        "2026년 이후 5대 하이퍼스케일러 Capex 전망치 상향 추이 (GS)\n\n1. Capex 상향 규모",
        "· Eric Sheridan(GS) : 인프라 투자 회수 시점에 대한 질문",
        "① 가계 주식자산 = GDP 대비 급팽창 (GS)\n연말 대비 약 +15%p 뛴 것으로 GS가 추정함",
    ],
)
def test_goldman_attribution_is_not_gs(text):
    assert _gs(text) == set()


@pytest.mark.parametrize(
    "text",
    [
        "(유가)GS - 현금ㆍ현물배당결정",
        "LS / 10.2조원(+1.2%) / 20.6조원(+1.1%)\nGS / 10.3조원(-2.4%) / 4.4조원(+0.2%)",
        "GS(078930) 강세",
    ],
)
def test_gs_stock_mentions_survive(text):
    assert _gs(text) == {"078930"}


def test_gs_affiliate_survives_goldman_attribution():
    # 단서는 '승격 뒤에' 본다 — `GS 건설`은 GS건설이지 지주사 GS 가 아니라 단서와 무관하다.
    assert _gs("GS 건설 수주 전망 (GS)") == {"006360"}
