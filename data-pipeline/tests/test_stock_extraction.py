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


def test_common_stock_whose_name_ends_in_u_stays_in_the_dictionary(monkeypatch):
    # 우선주는 이름(…우·…2우B)과 코드(끝자리가 0 이 아님)가 둘 다 그렇다. 이름만 보면 보통주 성우가 빠졌다.
    import extract_telegram_stocks as ets

    stocks = [
        {"code": "005930", "name": "삼성전자"}, {"code": "005935", "name": "삼성전자우"},
        {"code": "005387", "name": "현대차2우B"}, {"code": "00088K", "name": "한화3우B"},
        {"code": "458650", "name": "성우"}, {"code": "015750", "name": "성우하이텍"},
    ]
    monkeypatch.setattr(ets, "load_all", lambda *_a, **_k: stocks)
    match_to_code, method, ambiguous = ets.load_dictionary(None)
    assert not {"삼성전자우", "현대차2우B", "한화3우B"} & set(match_to_code)
    assert match_to_code["성우"] == "458650" and "성우" in ambiguous
    pattern, caseless = build_pattern(list(match_to_code))
    for text in ("성우(458650) 상한가", "(코스닥)성우 - 반기보고서"):
        assert set(extract(text, pattern, match_to_code, method, ambiguous, caseless)) == {"458650"}


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


# ── 증권사가 말하는 쪽으로 나온 자리 — method="house" ─────────────────────────────────
# 2026-09-28 급부상 카드의 유진투자증권 3건과, 증권사 이름 자리 전량을 읽으며 모은 실제 문장이다.
# 근거와 실측은 config/stock_extraction.py 의 HOUSE_METHOD 주석.

BROKER_DICT = {
    "유진투자증권": "001200", "미래에셋증권": "006800", "삼성증권": "016360", "키움증권": "039490",
    "NH투자증권": "005940", "현대차증권": "001500", "LS증권": "078020", "대신증권": "003540",
    "교보증권": "030610", "한양증권": "001750", "SK증권": "001510", "DB증권": "016610",
    "삼성전자": "005930", "산일전기": "062040", "한국금융지주": "071050",
}


def _broker(text: str) -> tuple[set[str], dict[str, str]]:
    """(종목 언급, 화자로만 나온 증권사 {코드: 표기})."""
    match_to_code = dict(BROKER_DICT)
    pattern, caseless = build_pattern(list(match_to_code))
    house: dict[str, str] = {}
    found = extract(text, pattern, match_to_code, {k: "dict" for k in match_to_code}, set(), caseless, house=house)
    return set(found), house


@pytest.mark.parametrize(
    "text, code",
    [
        # 2026-09-28 카드의 세 건
        ("2️⃣ 빅웨이브로보틱스 신규 상장\n- 주관사 : 유진투자증권,미래에셋증권\n- 시장구분 : 코스닥", "001200"),
        ("2️⃣ 빅웨이브로보틱스 신규 상장\n- 주관사 : 유진투자증권,미래에셋증권\n- 시장구분 : 코스닥", "006800"),
        ("🔹 증권가가 추산한 잠재 사업 규모\n유진투자증권은 UAE에서 창출될 수 있는 잠재 사업을 약 25.5조~26조원으로 추산.", "001200"),
        ("유진투자증권은 30조원 규모의 현금배당을 보통주와 우선주 각각 주당 4604원으로 환산했다. 이를 적용하면", "001200"),
        # ① 역할 머리표
        (" - 목표주가 : 78,000원(🔺14.71%)\n - 기관 : 현대차증권[하희지]\n\n📌 미스토홀딩스(081660)", "001500"),
        ("원문: 유진투자증권 「병목의 핑퐁 게임」 (2026-08-18)", "001200"),
        # ② 주어 + 분석 동사 · 목표가 조정 나열 · 나열된 주어 · 출처
        ("LS증권은 산일전기 목표주가를 25만원 → 29만원으로 16% 상향했습니다.", "078020"),
        ("하나증권은 기존 76만원에서 65만원으로, DB증권은 90만원에서 70만원으로 내렸다.", "016610"),
        ("4일 금융투자업계에 따르면 교보증권과 유진투자증권, 삼성증권은 LG이노텍이 MSCI 한국 지수에 새로 들어갈 것으로 예상했다.", "030610"),
        ("NH투자증권은 2028년 영업이익률 20% 수준을 전망\n\n✅자체 AIDC 개발", "005940"),
        # 목적격 을·를 뒤 '전망'은 그대로 화자다 — ㄹ 관형형 낱말(`적을`·`다를`)과 끝 음절이 같아도
        ("NH투자증권은 사상 최대 실적을 전망", "005940"),
        ("DB증권은 반도체 업황 강세를 전망", "016610"),
        ("3.대신증권에 따르면 2004~2025년 명절 연휴 직후 5거래일 코스피는 평균 1.34% 상승했고", "003540"),
        # ③ 속격 + 리서치 · ④ 괄호 귀속
        ("[투자] 07/21 달러, 중동 불안에 상승\n\n이 문서는 키움증권의 FICC 일일 분석 리포트로, 증권 종목 리포트가 아닙니다.", "039490"),
        ("- 두산밥캣: 대규모 관세 환입이 이끈 어닝 서프라이즈 (키움증권, BUY, 목표주가 9.6만원)", "039490"),
        ("완공 계획 중인 상황\n\n(2026.08.24 NH투자증권)", "005940"),
    ],
)
def test_brokerage_as_speaker_goes_to_house(text, code):
    found, house = _broker(text)
    assert code not in found
    assert code in house


@pytest.mark.parametrize(
    "text, code",
    [
        # 증권주 강세(2026-09-12~14 같은 날의 꼴) — 그 회사 주가 얘기다
        ("증권: 삼성증권(+8.7%), 미래에셋증권(+4.0%), 키움증권(+3.8%)", "016360"),
        ("증권주 강세 … 한국금융지주 +6%, 미래에셋증권 +5%", "006800"),
        ("#증권\n[+29.8%] SK증권\n[+14.2%] 상상인증권", "001510"),
        ("▷이에 금일 SK증권, 미래에셋증권, 대신증권, 한양증권 등 증권 테마가 하락.", "003540"),
        # 증권사 자신의 소식 — 명사형 '전망치'·'예상보다', ㄹ 받침 뒤 '전망', 자기 계획·문서
        ("키움증권이 올해 2분기 시장 전망치를 대폭 뛰어넘는 '어닝 서프라이즈'를 기록했다.", "039490"),
        ("삼성증권은 2분기 역대 최대 분기 실적을 기록했으나 예상보다 큰 인건비 증가로 컨센서스를 소폭 하회했다.", "016360"),
        ("한양증권은 곧바로 중앙그룹 익스포저의 87%를 연내 회수할 전망이라며 진화에 나섰다.", "001750"),
        # ㄹ 관형형이 '을'·'를'로 끝나는 꼴(받침 있는 줄기 `있을`·`높을`, 르 불규칙 `이를`)과
        # 증권사 사업 이름 `발행어음`(리서치의 '발행'이 아니다)
        ("키움증권은 거래대금 증가로 이익 증가 효과가 있을 전망.", "039490"),
        ("미래에셋증권은 자사주 소각으로 배당 여력이 높을 전망.", "006800"),
        ("키움증권은 올해 순이익이 1조원에 이를 전망.", "039490"),
        ("삼성증권이 발행어음 사업 확대로 수혜를 입을 전망.", "016360"),
        ("키움증권은 별도 순이익 30% 이상 환원 계획을 제시했다.", "039490"),
        ("NH투자증권이 최근 발간한 2026 지속가능통합보고서는 지난해와 비교해 분위기가 확연히 달라졌다.", "005940"),
        ("삼성증권이 9년 만에 숙원사업인 발행어음 사업에 진출한다.", "016360"),
        ("4일 삼성증권에 따르면 회사는 지난 2분기 영업이익과 당기순이익이 모두 늘었다.", "016360"),
        # 자사주 공시의 중개 증권사는 센다 — 2026-08-19 SK하이닉스 40조 공시의 이 칸이 SK증권 상한가를 불렀다
        ("취득방법 : 장내매수\n중개업자 : SK증권(SK Securities Co., Ltd.)\n결정일자 : 2026-08-19", "001510"),
        ("취득목적 : 자기주식 소각을 통한 주주가치 제고\n신탁기관 : SK증권\n\n※ 시총 : 1,096 조원", "001510"),
        # 공시·목록에서 그 회사가 주인공인 자리
        ("(유가)미래에셋증권 - 투자설명서(일괄신고)", "006800"),
        ("기업명: 대신증권(시가총액: 1조 3,084억) A003540\n보고서명: 주식소각결정", "003540"),
        # 괄호 귀속의 발행처와 그 리포트의 주인공이 한 줄에 있다 — 주인공은 산다
        ("- 미래에셋증권 (현대차증권, 상향, BUY/목표주가 4.2만원)", "006800"),
    ],
)
def test_brokerage_stock_mentions_survive(text, code):
    found, house = _broker(text)
    assert code in found
    assert code not in house


def test_paren_publisher_beside_its_subject_goes_to_house():
    found, house = _broker("- 미래에셋증권 (현대차증권, 상향, BUY/목표주가 4.2만원)")
    assert "001500" not in found and house == {"001500": "현대차증권"}


def test_one_real_spot_keeps_the_brokerage_as_a_mention():
    # 한 글에 화자 자리와 주가 자리가 같이 있으면 종목 언급이다(미장 은행과 같은 규칙).
    text = "유진투자증권은 UAE 잠재 사업을 26조원으로 추산했다.\n증권주 강세 … 유진투자증권 +5.2%"
    found, house = _broker(text)
    assert "001200" in found and house == {}


def test_other_companies_as_speakers_still_count():
    # 증권사가 아닌 회사는 제 전망을 말해도 그 회사 언급이다.
    found, house = _broker("삼성전자는 3분기 영업이익이 늘 것으로 전망했다")
    assert found == {"005930"} and house == {}


def test_extract_without_house_arg_keeps_old_signature():
    # 이벤트 추출·데일리 노트처럼 house 를 안 주는 호출은 화자 자리를 그냥 건너뛴다.
    match_to_code = dict(BROKER_DICT)
    pattern, caseless = build_pattern(list(match_to_code))
    found = extract("유진투자증권은 30조원을 4604원으로 환산했다.", pattern, match_to_code,
                    {k: "dict" for k in match_to_code}, set(), caseless)
    assert found == {}


def test_is_house_is_shared_by_both_markets():
    from config.stock_extraction import HOUSE_METHOD, is_house
    from config.us_stock_extraction import is_house as us_is_house

    assert us_is_house is is_house
    assert is_house({"stock_code": "001200", "method": HOUSE_METHOD})
    assert not is_house({"stock_code": "001200", "method": "dict"})
    assert not is_house({"stock_code": "001200", "method": "alias"})
    assert not is_house({"stock_code": "001200"})


def test_phantom_check_counts_what_the_card_counts(monkeypatch):
    # 유령 감시는 카드와 같은 언급만 센다 — 화자 행은 빼고 본다.
    import check_phantom_stocks as cp

    rows = [
        {"channel_handle": "a", "message_id": 1, "posted_at": "2026-09-26T13:23:00+09:00", "text": "유진투자증권은 … 추산",
         "telegram_message_stocks": [{"stock_code": "001200", "match_text": "유진투자증권", "method": "house"}]},
        {"channel_handle": "b", "message_id": 2, "posted_at": "2026-09-26T14:00:00+09:00", "text": "유진투자증권 +5%",
         "telegram_message_stocks": [{"stock_code": "001200", "match_text": "유진투자증권", "method": "dict"}]},
    ]
    monkeypatch.setattr(cp, "load_window_keyset", lambda *_a, **_k: rows)
    got = cp.load_mentions(None, ["001200"], "2026-09-25", "2026-09-27")
    assert [m["channel"] for m in got["001200"]] == ["b"]


# ── 2026-10-03 주간 점검 3회차(09-27~10-03) ─────────────────────────────────────────────
# 사례는 그 주(일부는 전 기간) 코퍼스의 실제 문장이다. 근거와 전량 재현 수치는 config/stock_extraction.py 주석.

WEEK3_DICT = {
    "에코프로": "086520", "에코프로에이치엔": "383310", "신세계": "004170", "신세계 I&C": "035510",
    "SK증권": "001510", "에스케이증권제11호스팩": "472230", "HRS": "036640", "CS": "065770",
    "SK": "034730", "KT": "030200", "CJ": "001040", "STX": "011810", "NICE": "034310", "GS": "078930",
    "제우스": "079370", "DL": "000210", "DMS": "068790", "대모": "317850", "넵튠": "217270",
    "오로라": "039830", "모비스": "250060", "한화": "000880", "오텍": "067170", "카카오페이": "377300",
    "웅진": "016880", "한국경제TV": "039340", "아시아경제": "127710", "YTN": "040300", "SBS": "034120",
}


def _week3(text: str) -> set[str]:
    from config.stock_extraction import ALIASES

    match_to_code = dict(WEEK3_DICT)
    method = {k: "dict" for k in match_to_code}
    for alias, official in ALIASES.items():
        if official in WEEK3_DICT and alias not in match_to_code:
            match_to_code[alias] = WEEK3_DICT[official]
            method[alias] = "alias"
    pattern, caseless = build_pattern(list(match_to_code))
    ambiguous = set(match_to_code) & AMBIGUOUS_NAMES
    return set(extract(text, pattern, match_to_code, method, ambiguous, caseless))


@pytest.mark.parametrize(
    "text",
    [
        "노보 노디스크가 Hengrui의 주 1회 경구 GLP-1/GIP 이중작용제 HRS-1596 글로벌 권리를 확보했습니다.",
        "또한 CBRS의 차세대 CS-4 플랫폼은 4Q26에 램프업되며 2배 빠른 토큰 속도를 제공",
        "인도네시아는 T-50i 22대, KT-1 20대를 운용 중으로",
        "이 사업을 이끌기 위해 Chirantan “CJ” Desai가 Meta에 합류해",
        "STX -10%, WDC -7%  도시바는 AI 데이터센터용 HDD 생산능력을 2배로 확대",
        "• 나이스 (NICE) — D.A. 데이비슨이 투자의견 ‘매수’를 유지하면서",
        "GS에 따르면 S&P 500은 연초 이후 13% 상승했지만",
        "TTA로부터 GS(Good Software) 인증 1등급을 획득",
        "국산 신작 MMORPG '제우스' 및 '이클립스' 흥행 소식 등에 상승",
        "SCL사이언스, ‘이노씰 플러스 DL’ 태국 진출 교두보 마련",
        "ITER 핵융합 플라즈마 디스럽션 완화시스템(DMS) 계측제어 공급계약",
        "AMD, ‘AI 대모’ 페이페이 리의 월드랩스 82억 달러에 인수",
        "제목 : 넵튠 인슈어런스 홀딩스, 이사회 7명으로 확대",
        "트룰리브 캐너비스(-12.17%), 틸레이 브랜즈(-5.06%), 오로라 캐나비스(-3.23%)",
        "'신차 부품 개발 못한다'...모비스 주요 협력사, 보이콧 통보",
        "차 부품서 로봇 근육으로…모비스·만도, 영토 확장 본격화",
        "<한화 임혜윤 오늘 개장전 꼭 알아야 할 5가지_9/29 Bloomberg>  ① 미·이란 합의 기대 후퇴",
        "17. 한섬: 26년 연말의 주식이 될 상인가? (한화 이진협)",
        "장기금리에도 영향을 주는 변수로 커지고 있다는 의견 (26.09.28 한화)",
        '"POSCO홀딩스, 3분기 실적 컨센서스 밑돌 전망…목표가↓"-한화 https://www.hankyung.com/article/1',
        "[아이뉴스24] 오텍캐리어, 엔비디아 검증 CDU에 AI 유지관리 결합",
        "삼성전자도 토큰으로 해외서 거래 될까…카카오페이증권·온도파이낸스 맞손",
        "과자·음료값 10월부터 줄인상…해태제과·웅진식품 가격 올린다",
        "📡 한국경제TV 특별 생방송 ON AIR 추석 이후 시장의 방향과",
        "HLB, 담관암 뚫고 상한가 직행…간암 신약은 언제? / 한국경제TV뉴스",
        "• 삼성전자 — 와이스트릿(긍정), 한국경제TV(긍정)",
        "금융위, 은행 부동산PF 신용공여 20% 제한 예고 <아시아경제> https://alie.kr/7x9IBT0",
        "英서 1871억 추가 수주…단일 전선사업 최대 '잭폿' (아시아경제 · 2026-10-02)",
        "YTN 취재 결과, 지난 21일 비무장지대 수색로 개척 임무 도중",
        "SBS 취재에 따르면 오늘(30일) 북한산국립공원 안에 있는 구천폭포 인근",
    ],
)
def test_week3_phantoms_are_not_stocks(text):
    assert _week3(text) == set()


@pytest.mark.parametrize(
    "text, code",
    [
        # 별칭이 제자리를 찾는다
        ("마이크론 뚫은 에코프로HN, 수주 2500억 쌓았다", "383310"),
        ("신세계아이앤씨, ‘메타 글래스’ 국내 총판", "035510"),
        ("메타 AI 글래스 신제품 韓 상륙…신세계I&C, 9개 모델 국내 판매 시작", "035510"),
        ("(코스닥)SK증권제11호스팩 - 반기보고서 (2026.06)", "472230"),
        # 등락률은 붙임표 뒤 숫자라도 진짜다
        ("관련 자회사 비중 높은 SK-4.4%, SK스퀘어 -4.1%", "034730"),
        ("HRS (036640) ( +3.1% ) 실리콘 고무 국산화", "036640"),
        # 같은 이름의 진짜 언급
        ("(유가)STX - 최대주주변경 보고자:STX", "011810"),
        ("2026.09.29 14:15:13 기업명: 모비스(시가총액: 980억) A250060 보고서명: 단일판매ㆍ공급계약체결", "250060"),
        ("[특징주] 모비스, 네오텍과 4.2억 스마트공장 계약…제조 AI 수주 확대", "250060"),
        ("YTN 최대주주 변경승인 취소되나…방미통위, 청문 의결", "040300"),
        ("(코스닥)아시아경제 - 주식등의대량보유상황보고서(일반)", "127710"),
        # 한화는 그룹 이름 자리 규칙만 탄다 — 리포트 제목·기사 제목·제품 귀속은 산다
        ("[한화/지주회사/통신서비스] 제목: 쪼갠 후 증가한 시가총액, 실적 개선과 주주환원 기대", "000880"),
        ("[한화, KAI 지분 15% 넘겨…기업결합심사 신청 예정] • 한화시스템이 KAI 지분을 매입", "000880"),
        ("라인메탈+LIG D&A의 지대공 JV, 레드백(한화)+대드론포탑(록히드마틴UK)", "000880"),
        ("1.9조 '한국판 미티어' 누가 품나…한화 vs 현대로템·LIG, 수주전 치열", "000880"),
        ("[관련 종목] 롯데쇼핑 | 두산밥캣 | SK | 한화", "000880"),
        ("카카오페이, 해외배송 199개국으로 넓힌다", "377300"),
        ("(유가)오텍 - 단일판매ㆍ공급계약체결", "067170"),
    ],
)
def test_week3_real_mentions_survive(text, code):
    assert code in _week3(text)


# ── 2026-10-06: 미장 레딧(RDDT) ← 게시판 레딧 이야기 ─────────────────────────────────────────
# 채널은 게시판 레딧을 남의 종목 관심을 재는 출처로 쓴다(정형 글 `미국 레딧 게시물 분석` · `레딧 관심도`). 10-05 미장 테마
# '소프트웨어'의 말 많은 종목에 레딧이 올랐는데 최근 사흘 근거 글 8건이 전부 이 꼴이었다. 회사 자리는 남는다.
# 규칙은 config.us_stock_extraction.NEGATIVE_CONTEXT["레딧"].

@pytest.fixture(scope="module")
def us_tagger():
    import extract_telegram_us_stocks as us

    mt = us.build_dictionary()
    pattern, caseless = us.build_pattern(list(mt))
    return lambda text: set(us.extract(text, pattern, mt, caseless))


@pytest.mark.parametrize(
    "text",
    [
        "2026년 10월 4일 미국 레딧 베스트 게시물 분석\n\n🤖 NVDA / AI 반도체\n\n· 반도체만 계속 시장 주도",
        "미국 레딧 게시물 분석\n(2026년 9월 11일 00:00~06:00 기준)",
        "레딧 관심도 현황\n\n유가, 브로드컴 그리고 금",
        "레딧 관심도는 마이크론, 나이키에 집중",
        "미국 레딧 최대 관심사는 유가..;;;",
        "현시간 레딧에서 많이 언급되는 종목 및 워딩\n\n1위 유가, 2위 타코",
        "미국 최대 온라인 커뮤니티 ‘레딧’에선 ‘사이버캡이 우버를 무너트릴 수 있을까?’",
        "▸ 2,000달러 이상 가격과 스펙 타협 우려: 레딧(r/apple) 유저들은 \"2,000달러가 넘는 기기인데\"",
        "레딧 베플글 번역:\n\n한국 증시? 솔직히 지금 정상적인 시장이라고 보기 어렵다.",
        "레딧서 화제인 태국 16세 소녀 ㄷㄷ...mp4",
        "레딧에 도는짤....",
        "아모레퍼시픽: 레딧 최다(447건 net +0.33)·COSRX 기반 견조하나",
    ],
)
def test_reddit_board_is_not_rddt(us_tagger, text):
    assert "RDDT" not in us_tagger(text)


def test_reddit_board_post_keeps_the_stocks_it_talks_about(us_tagger):
    # 게시판 글이 다루는 종목은 그대로 센다 — 빠지는 건 레딧 자리 하나다.
    assert us_tagger("레딧 관심도 현황\n\n유가, 브로드컴 그리고 금") == {"AVGO"}


@pytest.mark.parametrize(
    "text",
    [
        # 등락 · 실적 · 광고 매출 · 지수 편입 · 티커 표기
        "레딧(+5.22%)은 법원이 앤트로픽에 대한 데이터 무단수집 소송에서 레딧의 계약상 주장을 계속 심리할 수 있다고 판단",
        "제목 : 레딧, 2분기 매출 8억 490만 달러 기록… 전년비 큰 폭 성장",
        "레딧은 2분기 광고 매출이 61% 성장하며 미국 광고 사업에서 높은 성장세를 보였다",
        "레딧, 상장 2년 만에 S&P500 편입 확정",
        "구글이 레딧(NYS: RDDT)과의 AI 라이선스 계약을 재협상하는 과정에서",
        # 앞 문맥이 '커뮤니티'여도 회사 소식이다 — 그래서 앞은 안 본다
        "美 온라인 커뮤니티 레딧, S&P500 편입...시간외 12% 폭등",
        # `에는` · `게시판` 은 규칙에 없다 — 둘 다 회사(주가) 이야기로 왔다
        "이번 보도가 사실이라면 레딧에는 상당한 후퇴가 될 수 있다",
        "하락 배경은 AI 모델이 레딧 게시판 트래픽을 잠식할 것이라는 우려",
        # 한 글에 게시판 자리와 회사 자리가 같이 있으면 회사 자리가 남긴다
        "레딧 관심도는 메타에 몰빵...\n[레딧(+3.0%)] S&P500 편입. 시간외 +10%",
    ],
)
def test_reddit_company_mentions_survive(us_tagger, text):
    assert "RDDT" in us_tagger(text)


# ── 2026-10-06: 대교(019680) ← 다리 이름 ─────────────────────────────────────────────────────
# 사례는 전 기간 코퍼스의 실제 문장이다. 근거와 전량 재현 수치는 config/stock_extraction.py 의 HOMONYM_CUES["대교"] 주석.


def _daegyo(text: str) -> set[str]:
    match_to_code = {"대교": "019680"}
    pattern, caseless = build_pattern(list(match_to_code))
    ambiguous = {"대교"} & AMBIGUOUS_NAMES
    return set(extract(text, pattern, match_to_code, {"대교": "dict"}, ambiguous, caseless))


@pytest.mark.parametrize(
    "text",
    [
        "우크라이나 키이우의 드니프로강을 가로지르는 북부 대교를 러시아의 S8000 반데롤 순항 미사일이 타격하는 장면",
        "북한 신의주와 중국 단둥을 잇는 신압록강대교가 조만간 개통할 것이라는 관측이 나온다. "
        "북·중 수교 기념일 개통설은 실현되지 않았지만 대교 주변 시설 정비와 차량 이동 등 준비 움직임이 관측되고 있다.",
        "러시아 하산과 북한 나선시를 잇는 '하산 두만강 대교'가 곧 개통될 예정이다.",
        "🎯 크림반도 방공망 무력화와 케르치 대교 고립 전략",
        "상하이는 도시 고속도로가 현재 정상 교통을 재개했으나 양쯔강 대교는 시속 60km의 제한 속도를 유지하고 있으며",
        "샤먼시 ‘양안 교류 12개항 조치’ 발표 중 진먼-샤먼 대교 건설 계획 밝혀",
        "* 대교 이어 목화·시범까지 … 여의도 래미안 벨트",
        "46. '해상 랜드마크' 어디 가고 '다리 없는 대교'...갈팡질팡 영일만대교 노선",
    ],
)
def test_bridges_are_not_daegyo(text):
    assert _daegyo(text) == set()


@pytest.mark.parametrize(
    "text",
    [
        "(유가)대교 - 주요사항보고서(자기주식처분결정) http://dart.fss.or.kr/api/link.jsp?rcpNo=1",
        "2026.10.06 14:52:54 기업명: 대교(시가총액: 653억) A019680 보고서명: 주요사항보고서(자기주식처분결정)",
        "[실적속보]대교, 올해 2Q 매출액 1586억(-2.4%) 영업이익 -37.2억(적자전환) (연결)",
        "- [편출] 대교(019680), 진흥기업(002780), 케어젠(214370), 외 9개",
        "28. 대교 거래정지(주식병합)",
        "대교·교원·웅진이 '시니어 학습지' 공들이는 까닭",
        "'눈높이' 대교의 반전…학원 대신 '이 사업'에 꽂혔다",
        "* MLCC 슈퍼사이클…다시 뛰는 삼성전기·삼화콘덴서\n\n* 사업 다각화 속도내는 대교\n\n* 국내 유일 기체분리막 기술로",
    ],
)
def test_daegyo_stock_mentions_survive(text):
    assert _daegyo(text) == {"019680"}


# ── 2026-10-10: SDN(099220) ← 미국 제재 명단 · 말레이시아 법인 접미사 · 다른 기술 약어 ─────────────
# 사례는 전 기간 코퍼스의 실제 문장이다. 근거와 전량 수치는 config/stock_extraction.py 의 HOMONYM_CUES["SDN"] 주석.


def _sdn(text: str) -> set[str]:
    match_to_code = {"SDN": "099220", "테크윙": "089030"}
    pattern, caseless = build_pattern(list(match_to_code))
    ambiguous = set(match_to_code) & AMBIGUOUS_NAMES
    return set(extract(text, pattern, match_to_code, {k: "dict" for k in match_to_code}, ambiguous, caseless))


@pytest.mark.parametrize(
    "text",
    [
        "미국 재무부 해외자산통제국(OFAC)도 이날 아카네 소장 등 2명을 제재 대상인 특별지정국민(SDN) 명단에추가했다.",
        "이란 금속 산업과 연계된 다수의 기업을 특별지정제재대상(SDN, Specially Designated Nationals)으로 지정했다.",
        "선박 22척과 법인 27개, 개인 6명을 제재 명단(SDN)에 올렸다.",
        "대상 기업들은 OFAC의 Specially Designated Nationals(SDN) 명단에 추가돼 미국 금융시스템 접근이 사실상 차단",
        "미 우주군의 우주 데이터 네트워크 백본(SDN-B) 사업자로 선정됐다고 발표했다.",
        "글로벌 소프트웨어 정의 네트워크(SDN)를 활용해 지연 시간을 줄이며 기업들의 AI 추론 수요를 지원",
        "취득회사 : NEXILIS MANAGEMENT MALAYSIA SDN. BHD.(말레이시아) 주요사업 : 투자업",
    ],
)
def test_sdn_sanctions_list_and_other_acronyms_are_not_the_stock(text):
    assert "099220" not in _sdn(text)


def test_sdn_bhd_mask_keeps_the_real_mention_in_the_same_message():
    text = "테크윙(089030)은 Micron Memory Malaysia SDN. BHD.와 약 106억6810만원 규모의 반도체 검사장비 공급계약 체결"
    assert _sdn(text) == {"089030"}


@pytest.mark.parametrize(
    "text",
    [
        "(코스닥)SDN - 임원ㆍ주요주주특정증권등소유상황보고서 보고자:박춘용",
        "기업명: SDN(시가총액: 412억) A099220 보고서명: 기타시장안내(관리종목지정우려종목)",
        "에스에너지 [+25.5%] 한화솔루션 [+18.0%] OCI홀딩스 [+17.4%] SDN [+12.7%] HD현대에너지솔루션 [ +8.3%]",
        "태양광: 한화솔루션>HD현대에너지솔루션>신성이엔지>한솔테크닉스>에스에너지>SDN  배터리: 셀 3사",
        "[실적속보]SDN, 3년 중 최고 매출 달성, 영업이익은 전년동기 대비 -89%",
        "△제이엠아이  △SDN  △옴니시스템  △이노인스트루먼트",
        "27. SDN 거래정지(주식병합) 28. 한울앤제주 추가상장(유상증자)",
    ],
)
def test_sdn_stock_mentions_survive(text):
    assert "099220" in _sdn(text)


# ── 2026-10-10 주간 점검 4회차(10-04~10-10) ─────────────────────────────────────────────────
# 사례는 그 주 코퍼스의 실제 문장이다. 근거와 수치는 config/stock_extraction.py 의 같은 날짜 주석.
WEEK4_DICT = {
    "카카오": "035720", "신세계": "004170", "한국전력": "015760", "솔루엠": "248070", "이녹스": "088390",
    "잉글우드랩": "950140", "바이오솔루션": "086820", "스피어": "347700", "CJ": "001040", "와이씨": "232140",
    "BGF": "027410", "BGF에코머티리얼즈": "126600", "광전자": "017900", "디바이스": "187870", "머큐리": "100590", "오로라": "039830",
    "OCI": "456040", "에프앤가이드": "064850", "한국경제TV": "039340", "YTN": "040300", "SBS": "034120",
    "아시아경제": "127710", "STX": "011810", "GS": "078930", "DB": "012030", "효성": "004800",
    "효성중공업": "298040", "두산": "000150", "두산에너빌리티": "034020", "LS": "006260",
}


def _week4(text: str) -> set[str]:
    from config.stock_extraction import ALIASES

    match_to_code = dict(WEEK4_DICT)
    method = {k: "dict" for k in match_to_code}
    for alias, official in ALIASES.items():
        if official in WEEK4_DICT and alias not in match_to_code:
            match_to_code[alias] = WEEK4_DICT[official]
            method[alias] = "alias"
    pattern, caseless = build_pattern(list(match_to_code))
    ambiguous = set(match_to_code) & AMBIGUOUS_NAMES
    return set(extract(text, pattern, match_to_code, method, ambiguous, caseless))


@pytest.mark.parametrize(
    "text",
    [
        "제작자 : 투행 텔레그램, 블로그, 카카오톡 오픈채팅방에서 '투행'을 검색해주세요.",
        "합병 법인은 Skydance Corporation으로 출범 - 신세계프라퍼티(이마트 100% 자회사)는 합병 법인에 $1bn 투자",
        "7일 부산 동래 호텔농심에서 열린 한국전력소자산업협회 전력반도체 지산학 K-포럼에서",
        "보고자:솔루엠코스메틱 http://dart.fss.or.kr/api/link.jsp?rcpNo=1",
        "이녹스리튬, 트라피구라와 2029년까지 최대 3만톤 수산화리튬 장기 마케팅 계약 체결",
        "잉글우드랩코리아 매출액 211억원(YoY -33%)으로 전분기 수준 정체",
        "이머전트 바이오솔루션스($EBS) 등 방역 물자 조달 관련 기업들의 주가가 주목받았으나",
        "제목 : 스피어엔터테인먼트, ‘오즈의 마법사’ 수요 둔화에 투자의견 하향",
        "최근 '브리쎄 레빗텅 틴트 필름'이 CJ 올리브영의 10월 '올영픽'으로 선정되며",
        "와이씨코스닥벤처일반사모투자신탁제7호 와이씨코스닥벤처일반사모투자신탁제8호",
        "인공지능(AI) 데이터센터 증설 경쟁으로 인해 광전자 부품 공급 물량이 2029년 초까지 사실상 전량 매진",
        "LG전자 - 3Q26 잠정실적: \"디바이스 수요 vs AI 신사업\" [ SK증권 박형우, 정영환 ]",
        "제목 : 애틀랜티쿠스 홀딩스, '머큐리' 상표권 2750만 달러에 매각",
        "제목 : 큐라리프, 오로라 캐너비스 인수 조건 상향…주당 5달러 상당",
        "인텔은 EIC+PIC를 통합한 OCI 칩렛으로 CPU·GPU 패키지 내부 광연결을 겨냥",
        "에프앤가이드 컨센서스는 영업이익 약 108조원·매출 약 202조원으로",
        "한국경제TV에 출연한 박세익 체슬리투자자문 대표 발언 요약",
        "→ YTN 인터뷰에서 석병훈 이화여대 교수는 한국부동산원 9월 넷째 주 자료를 근거로",
        "제도를 대폭 손볼 때가 됐다.(아시아경제, 사설) 3. 산부인과 진료받는",
        "제시된 보다 평범한 해결책은 토시바/STX가 시장 수요를 충족하기 위해 TDK의 HDD 헤드 캐파 2배 확대에",
        "다음 주 주요 실적 발표 예고: • 미국 주요 은행(C, GS, JNJ, JPM, UNH, WFC, BAC, BLK, MS 등)",
        "부채와 재정적자를 유지하면서 경제가 이를 버텨내는 상태가 지속될 것 DB 설문이 말하는 미국 부채의 미래",
    ],
)
def test_week4_phantoms_are_not_stocks(text):
    assert _week4(text) == set()


@pytest.mark.parametrize(
    "text, code",
    [
        # 별칭이 제자리를 찾는다
        ("순환매 :전력기기(효성重 -5.6%) 부진 속 LS에코에너지(+3.1%)", "298040"),
        ("📌 두산중공업 주식, 베트남 발전소 수주 확보", "034020"),
        ("제목 : BGF에코머티, 818억 규모 KNW지분 지주사에 매각", "126600"),
        ("BGF에코머티리얼즈, 자사주 공개매수·소각 소식에 12%대 급등", "126600"),
        # 같은 이름의 진짜 언급은 산다
        ("[리포트 브리핑]카카오, '밸류에이션 저감' 목표가 44,000원 - 키움증권", "035720"),
        ("인스타그램, 총 사용시간서 카카오톡 첫 추월…두 달 연속 우위", "035720"),
        ("[주요주주 지분공시]국민연금공단, 신세계의 지분율 1.38% 축소", "004170"),
        ("광소자·레이저: 빛과전자, 광전자, 우리로 광섬유·케이블: 대한광통신", "017900"),
        ("#반도체/소부장 [+16.4%] 디바이스 [+15.9%] 다원넥스뷰", "187870"),
        ("(코스닥)YTN - 기타시장안내", "040300"),
        ("KBS·YTN 등 방송사 11곳에 시정명령···\"편성위·편성규약 법적 의무\"", "040300"),
        ("정유: 후티 반군-사우디 등 교전에 WTI 90$ 재돌파(S-Oil +3.2%, GS +3.9%)", "078930"),
        ("OCI, 642억 투입…전북대와 반도체 소재 R&D 산학협력 추진", "456040"),
    ],
)
def test_week4_real_mentions_survive(text, code):
    assert code in _week4(text)


# ── 2026-10-10: 예스24(053280) ← 책 출간 홍보의 서점 구매 링크 · 공연장 ─────────────────────────────
# 사례는 전 기간 코퍼스의 실제 문장이다. 근거와 전량 수치는 config/stock_extraction.py 의 HOMONYM_CUES["예스24"] 주석.


def _yes24(text: str) -> set[str]:
    match_to_code = {"예스24": "053280", "카카오": "035720"}
    pattern, caseless = build_pattern(list(match_to_code))
    ambiguous = set(match_to_code) & AMBIGUOUS_NAMES
    return set(extract(text, pattern, match_to_code, {k: "dict" for k in match_to_code}, ambiguous, caseless))


@pytest.mark.parametrize(
    "text",
    [
        "📚책 구매와 주변에 포워딩해 주시는 것 모두 저에게 정말 큰 힘이 됩니다! 감사합니다\n\n교보문고\n"
        "https://product.kyobobook.co.kr/detail/S000221518506\n\n예스24\nhttps://m.yes24.com/goods/detail/197293320\n\n"
        "알라딘\nhttps://www.aladin.co.kr/m/mproduct.aspx",
        "🛒 [구매링크]\n교보문고 https://siglab.short.gy/kyobo\n예스24 https://siglab.short.gy/yes24\n"
        "알라딘 https://siglab.short.gy/aladin\n\n- SignalLab Research",
        "교보문고 : https://gdrb.kr/k000pa\n예스24 : https://gdrb.kr/y000pd\n알라딘 : https://gdrb.kr/a000pb",
        "아래 링크 공유드립니다.\n\n예스24: https://m.yes24.com/goods/detail/193052366\n\n"
        "알라딘: https://www.aladin.co.kr/m/mproduct.aspx?ItemId=397175707",
        "⬇️ 교보문고 ⬇️\nhttps://vo.la/gLuKdAK\n\n예스24, 알라딘, 쿠팡, 카카오 선물하기 등에서도 찾아보실 수 있습니다.",
        "네오위즈는 오는 10월 10일 오후 7시 서울 광진구 예스24 라이브홀에서 ‘MIRACLE 10.10’ 공연을 개최한다고 21일 밝혔다.",
    ],
)
def test_yes24_bookstore_links_and_venue_are_not_the_stock(text):
    assert "053280" not in _yes24(text)


@pytest.mark.parametrize(
    "text",
    [
        "(코스닥)예스24 - 반기보고서 (2026.06)\nhttp://dart.fss.or.kr/api/link.jsp?rcpNo=20260814002825",
        "(코스닥)예스24 - 단기차입금증가결정\nhttp://dart.fss.or.kr/api/link.jsp?rcpNo=20260929900899",
        "[실적속보]예스24, 3년 중 최저 매출 기록, 영업이익은 적자지속 (연결)\n\nhttp://spot.rassiro.com/rd/20260814/1007673",
        "기업명: 예스24(시가총액: 815억) A053280\n보고서명: 반기보고서 (2026.06)",
    ],
)
def test_yes24_stock_mentions_survive(text):
    assert "053280" in _yes24(text)
