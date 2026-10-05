"""종목 흐름 요약 그물(common/stock_framing.py · generate_telegram_narratives.pick_narrative).

예문은 2026-10-05 에 저장돼 화면에 나간 흐름 요약 그대로다.
"""
from common.stock_framing import drop_trade_sentences, price_hits, trade_hits, trend_hits
from generate_telegram_narratives import LEN_MAX, LEN_MIN, narrative_problems, pick_narrative

TRADE = [
    "반도체 패키징 산업 호황에 따른 실적 성장 전망이 화제였습니다. 한국투자증권의 산업 분석 자료에서 OSAT 업종 강세와 함께 매수 의견이 제시되었습니다.",
    "한투증권의 OSAT 산업 호황 보고서에서 두산테스나가 추천 종목으로 지목되며 낙관적 평가가 계속 이어졌습니다.",
    "AI 하드웨어 수혜 관련 전기전자 업종 분석 재개와 비중 확대 소식이 화제를 모으며 관심이 집중됐습니다.",
]
PRICE = ["3분기 실적과 DDR5 후공정 외주 확대 관련 화제가 이어졌습니다. 저평가 구간이라는 분석도 함께 회자되었습니다."]
TREND = [
    "증권사 보고서에서 AI 반도체 수혜 종목으로 언급되며 화제였으나 최근 3일 사이 관심이 급격히 줄어들었습니다.",
    "최태원 회장의 지분 매각 소식이 화제였습니다. 최근 3일 사이 관련 언급이 부쩍 줄어들었습니다.",
    "최근 3일 사이 언급이 크게 줄었으나, 수주 모멘텀 지속과 실적 호전에 대한 긍정적 평가가 계속 이어졌습니다.",
    "3분기 인도량이 예상치를 웃돈 소식과 AI칩 사양 조정 계획이 화제였습니다. 최근 사흘 중 초반에 언급이 집중했습니다.",
    "도시바의 AI 데이터센터용 HDD 생산능력 확대 계획이 화제였습니다. 초반에는 언급이 많았으나 최근 사흘 사이 급감했습니다.",
    "AI 하드웨어 수혜와 기판 사업 확대에 대한 언급이 늘었습니다. 패키지기판 증설 공시가 화제였습니다.",
]
# 같은 날 걸리면 안 되는 문장 — '증가'·'확대'·'부족'이 내용 낱말로 들어 있다.
CLEAN = [
    "메모리 밸류에이션과 공급 부족 장기화가 주요 화제였습니다. 본주와 ADR 괴리율, 협력사 수주 소식도 함께 회자됐습니다.",
    "반도체 패키징 업체들의 호황기 진입과 메모리 생산량 증가에 따른 국내 IDM 외주 물량 증가 소식이 화제였습니다.",
    "CPU 수요 증가 기대와 AI PC 신제품 출시 소식이 함께 거론되면서 관심이 이어졌습니다.",
    "최근 화제는 APR1400의 미국 진출입니다. 한미 원전 프레임워크와 한국 기업의 참여 가능성이 회자됐습니다.",
    "80억달러 규모의 엔비디아 칩을 특수목적회사에 이전한 뒤 재임차하는 금융구조를 검토 중이라는 소식이 화제였습니다.",
]


def test_trade_framing_caught():
    for t in TRADE:
        assert trade_hits(t), t


def test_price_words_caught():
    for t in PRICE:
        assert price_hits(t), t


def test_mention_trend_caught():
    for t in TREND:
        assert trend_hits(t), t


def test_content_words_pass():
    for t in CLEAN:
        assert not trade_hits(t) and not price_hits(t) and not trend_hits(t), t


def test_problems_name_each_kind():
    found = " ".join(narrative_problems(TRADE[0] + " " + TREND[0], ""))
    assert "매수·매도 표현" in found and "시세 표현" in found and "추이 표현" in found


def test_drop_trade_sentence_keeps_the_rest():
    assert drop_trade_sentences(TRADE[0]) == "반도체 패키징 산업 호황에 따른 실적 성장 전망이 화제였습니다."
    assert drop_trade_sentences(TRADE[1]) == ""


def test_pick_never_takes_trade_framing():
    ok = "패키지기판 증설 공시와 AI 가속기용 기판 수요 이야기가 함께 화제였습니다. 해외 고객사 검증 소식도 돌았습니다."
    assert pick_narrative([TRADE[2], ok], "", "t") == ok


def test_pick_cuts_sentence_when_every_candidate_frames():
    got = pick_narrative([TRADE[0]], "", "t")
    assert got == "반도체 패키징 산업 호황에 따른 실적 성장 전망이 화제였습니다."
    assert pick_narrative([TRADE[1]], "", "t") is None


def test_pick_prefers_no_trend_over_length():
    no_trend = CLEAN[0]
    assert LEN_MIN <= len(no_trend) <= LEN_MAX
    assert pick_narrative([TREND[1], no_trend], "", "t") == no_trend
