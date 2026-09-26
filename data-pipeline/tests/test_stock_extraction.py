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
    text = "엑시노스 SbS 구조 (New!!) Naver 제휴, SBS(034120)"  # `SBS Biz` 는 2026-09-26 부터 매체 귀속이다
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


# ── 2026-09-25 저녁: `(GS)` 뒤에도 남은 골드만 표기 ─────────────────────────────────────
# GS 태그 전량 863건 중 `(GS)` 가 78건을 막고 남은 785건을 다 읽어 골드만 85건을 찾았다. 여러 채널에
# 복붙된 묶음 자리를 그대로 둔다(근거는 config.US_TICKER_COLLISION 주석).


@pytest.mark.parametrize(
    "text",
    [
        "순이익 528억 (est. 303억)\n※단위 : 위안\n※est는 GS의 추정치(26.08.24)",
        "GS 8월 APAC Conviction buy list에 삼성전자 신규편입",
        "자사주 매입/소각 발표에 대한 글로벌 5대 IB(JPM, 노무라, Citi, BofA, GS)의 보고서.",
        "Sandisk 인베스터 데이 주요 포인트 (GS, 미즈호, 에버코어 종합)\n\n1. 장기 재무 목표",
        "HBM Sell side 컨센서스 (vs. GSe)\n\n1. 2026년 전망\n• GS의 HBM 출하량 성장률 전망치는",
        "GS DRAM 센티먼트 지표: 강세/약세 논쟁 지속\n• 3분기 15~20% 성장이라는 컨센서스가 GS 전망치와 부합",
        "삼성전자, 메모리 리더십과 주주환원 기대 (GS, JPM)\n\n1. 실적 부합 및 견조한 메모리 업황",
        "AI 시대(2023년 1월 이후) 통틀어 가장 낮은 수준. <차트 출처: GS, Bloomberg>",
        "한국 주주환원\n\n골드만\n\nGS는 한국 이익 성장을 올해 +350%, 2027년 +35%로 재차 상향",
        "골드만 투자의견: Buy (Conviction List) 유지\nS-Oil은 GS 아시아 커버리지 내 정유 플레이 중 하나.",
    ],
)
def test_goldman_residual_forms_are_not_gs(text):
    assert _gs(text) == set()


@pytest.mark.parametrize(
    "text",
    [
        # IB 이름을 혼자 단서로 쓰면 죽는 진짜 언급 — 국내 다이제스트에 IB 전망이 같이 실린다.
        "뱅크오브아메리카(BofA)는 하이퍼스케일러 자본지출 전망을 올렸다.\n"
        "1단계 8.4GW는 SK, GS, 네이버가 참여할 예정(SK 5GW, GS 2.4GW, 네이버 1GW)",
        "• Interactive Brokers(IBKR) +5.52% — 금융주 신고가\n• 현대해상, GS +6.28%",
        # `GS 컨퍼런스` 를 단서로 못 쓰는 까닭 — 지주사 실적 발표.
        "GS 컨퍼런스콜 주요 내용: 동해 AIDC 1.2GW",
    ],
)
def test_gs_mentions_beside_ib_names_survive(text):
    assert _gs(text) == {"078930"}


# ── 2026-09-26 주간 점검 2회차(09-20~26) ─────────────────────────────────────────────
# 사례는 그 주 코퍼스의 실제 문장이다. 근거와 전량 재현 수치는 config/stock_extraction.py 주석.

WEEK2_DICT = {
    "캐리": "313760", "DB": "012030", "제우스": "079370", "KD": "044180", "이지스": "261520",
    "선진": "136490", "오스템": "031510", "에이전트AI": "060900", "한화": "000880",
    "STX": "011810", "제이오": "418550", "삼성생명": "032830", "HDC": "012630",
    "IPARK현대산업개발": "294870", "한국콜마": "161890", "콜마홀딩스": "024720",
    "KG모빌리티": "003620", "케이카": "381970", "뉴트리": "270870", "덱스터": "206560",
    "SBS": "034120", "아시아경제": "127710", "한국경제TV": "039340", "KNN": "058400",
    "에프앤가이드": "064850", "삼성증권": "016360",
}


def _week2(text: str) -> set[str]:
    from config.stock_extraction import ALIASES

    match_to_code = dict(WEEK2_DICT)
    method = {k: "dict" for k in match_to_code}
    for alias, official in ALIASES.items():
        if official in WEEK2_DICT and alias not in match_to_code:
            match_to_code[alias] = WEEK2_DICT[official]
            method[alias] = "alias"
    pattern, caseless = build_pattern(list(match_to_code))
    ambiguous = set(match_to_code) & AMBIGUOUS_NAMES
    return set(extract(text, pattern, match_to_code, method, ambiguous, caseless))


@pytest.mark.parametrize(
    "text",
    [
        "[FI Weekly] 캐리 관점에서 본 미 국채  ▶ 미 국채, 캐리만 보면 OK",
        "미국 4.782% 한국 4.350%  차 0.432%p  일본 2.918%  캐리 청산 3.00%",
        "-유통시장: 캐리 수요 견조. 운용사 적극 순매수 유입 -회사채 금리",
        "기존 컨트롤러 겸 최고회계책임자인 리처드 C. 캐리(Richard C. Cary, 63세)의 은퇴",
        "AI 에이전트는 외부 툴 호출, DB 접근, 재추론 등 복잡한 연산 과정을 거치며",
        "▶️ 국내 게임 매출 순위(구글)  1위 제우스(컴투스, 유지) 2위 이클립스(스마일게이트, 유지)",
        "“멈출 수가 없다” 컴투스 신작 ‘제우스’ 얼마나 재밌길래…목표주가도 40% 뛰었다",
        "계획 물량의 80% 이상이 중국에서 부품을 수출해서 현지 조립하는 KD 방식으로",
        "연내 출시 예정인 [프로젝트 이지스]가 아직 베일 속에 있기에",
        ">>TSMC, 선진 패키징 검증센터 설립…AI 칩 빠른 세대교체 대응",
        "돌아온 임플란트 1위 오스템, 상반기 영업이익 두 배 '껑충'",
        "미국 증시는 혼조세로 마감했네요.  에이전트AI 시장 성장 기대감에 따른 마이크론(+5.0%)",
        "에이전트AI 흥행에 메타 뿐만 아니라 CPU관련주인 인텔/AMD도 급등",
        "약 22억 달러(한화 약 3조 원) 투자 계획 발표",
        "▶️한수위: 헝리중공업, 옛 STX대련의 역습",
        "제이오션중공업, 탱커 6척 수주 https://www.hankyung.com/",
        "이엔셀, 삼성생명공익재단과 줄기세포 배양기술 美 특허 등록",
        "인트레피드 포타시($IPI)는 4.5%, 뉴트리엔($NTR)은 4%",
        "유니트리는 신형 덱스터러스 핸드 Dex5-S 출시",
        "[SBS Biz] 고려아연, '프로젝트 크루서블' 美 환경평가 최종 통과",
        "파키스탄, 사우디 군사개입 시사 출처 : SBS | 네이버 https://naver.me/50BDJ1iY",
        "원료망·제련 기술로 뚫는다(아시아경제) https://han.gl/DpURE",
        "[한국경제TV] 대한항공, 세계 10대 항공사 선정…14개 부문 수상",
        "① 에프앤가이드 집계 기준 삼성전자의 3분기 컨센서스는 매출 204조원",
        "제목: 반도체 업종 중심으로 상승 작성자: 서정훈, 삼성증권 [입법 불확실성]",
    ],
)
def test_week2_phantoms_are_not_stocks(text):
    assert _week2(text) == set()


@pytest.mark.parametrize(
    "text, code",
    [
        ("(코스닥)캐리 - 반기보고서 (2026.06)", "313760"),
        ("[실적속보]캐리, 올해 2Q 매출액 2300만(-99%) 영업이익 -5.3억(적자지속)", "313760"),
        ("(코스닥)에이전트AI - 단일판매ㆍ공급계약체결", "060900"),
        ("18. 에이전트AI 추가상장(유상증자) 19. 코퍼스코리아", "060900"),
        ("제우스 (3,970억) +14.8% - AI 시대에 필수적인 보안 기술로 양자암호 수요 확대 전망", "079370"),
        ("한화, 美 아칸소 탄약공장 사업 구체화…방산 공급망 확대 속도", "000880"),
        ("(유가)STX - 최대주주변경 보고자:STX", "011810"),
        ("(코스닥)아시아경제 - 최대주주변경을수반하는주식양수도계약체결", "127710"),
        ("[경제] 코리아써키트, LG전자, 삼성증권, SBS, 아모텍, 티엘비", "034120"),
        ("덱스터 수주공시 - 드라마 <L(가제)> VFX 계약 85억원", "206560"),
        ("[DOC_POOL] [HDC현대산업개발] 제목: 자체도 좋고 도급도 좋고", "294870"),
        ("한국콜마홀딩스(콜마홀딩스)와 KDB인베스트먼트 컨소시엄", "024720"),
        ("케이카 상호변경(KG모빌리티플랫폼)", "381970"),
        # 매체 이름은 발행처 자리 ⑤(뒤에 띄어 쓴 낱말)를 안 탄다 — 뒤에 그 회사 소식이 온다.
        ("사들의 구조조정으로 턴어라운드 기반을 마련함. · CJ ENM과 SBS 등 주요 방송사", "034120"),
        ("SBS 기상캐스터 AI 캐릭터 도입", "034120"),
        ("YTN을 비롯해 iMBC, CJ ENM, 아시아경제 등 일부 미디어주", "127710"),
        ("20. 소룩스 상호변경(아리바이오홀딩스) 21. KNN 변경상장", "058400"),
        ("ETF 시장 확대로 최대 실적 기대…에프앤가이드 10%↑[특징주]", "064850"),
        ("[에프앤가이드(064850,KQ) / 유진투자증권 코스닥벤처팀 박종선]", "064850"),
    ],
)
def test_week2_real_mentions_survive(text, code):
    assert code in _week2(text)
