"""미장 추출의 은행(RESEARCH_HOUSES) 판정 — '주식으로 다뤄진' 자리만 센다."""
import pytest

import extract_telegram_us_stocks as ex
from common.quoted_move import own_move_after
from config.us_stock_extraction import RESEARCH_HOUSES, sanity_check


@pytest.fixture(scope="module")
def tagger():
    mt = ex.build_dictionary()
    pattern, caseless = ex.build_pattern(list(mt))
    return lambda text: ex.extract(text, pattern, mt, caseless)


def test_houses_are_in_the_dictionary():
    assert RESEARCH_HOUSES == {"JPM", "GS", "MS", "BAC", "C"}
    assert sanity_check() == []


@pytest.mark.parametrize("text", [
    "골드만삭스는 하이퍼스케일러 AI 투자가 내년 50% 늘 것으로 전망했다",
    "JP모건) 한미반도체; HBM 적층 단수 하향과 신규 사업 기회의 시사점",
    "» SiTime(+9.1%) 모건스탠리가 비중확대로 커버리지 개시",
    "이번 공모의 공동 주관사는 JP모건, 모건스탠리, 씨티그룹이 맡았다",
    "젠슨 황은 골드만삭스 컨퍼런스에서 사이버 보안을 다음 적용 분야로 지목했다",
    "뱅크오브아메리카의 월간 펀드매니저 설문조사에 따르면 현금 비중이 낮아졌다",
])
def test_bank_as_speaker_or_role_is_not_a_mention(tagger, text):
    assert not set(tagger(text)) & RESEARCH_HOUSES


@pytest.mark.parametrize("text,ticker", [
    ("씨티그룹(-1.90%), JP모건(-1.71%), 웰스파고(-1.75%) 등 금융주 하락", "JPM"),
    ("골드만삭스 9% 급등하며 금융주 강세 주도", "GS"),
    ("제목 : 뱅크오브아메리카 주가 급락 과도 - MS", "BAC"),
    ("• 골드만삭스 (GS) — ETF 운용사 NEOS 를 인수하기로 합의", "GS"),
])
def test_bank_treated_as_stock_is_a_mention(tagger, text, ticker):
    assert ticker in tagger(text)


def test_one_message_with_both_spots_keeps_the_stock_spot(tagger):
    text = "골드만삭스는 유가 전망을 올렸다.\n[금융] 골드만삭스 (-3.96%) CEO가 FICC 둔화를 전망하자 하락"
    assert tagger(text).get("GS") == "골드만삭스"


def test_other_tickers_still_count_as_speakers(tagger):
    # 은행이 아닌 회사는 제 가이던스를 말해도 그 회사 언급이다.
    assert "NVDA" in tagger("엔비디아는 다음 분기 매출이 늘 것으로 전망했다")


def test_own_move_after_reads_only_after_the_name():
    t = "GE Vernova(+4.8%) 모건스탠리 컨퍼런스에서 가스터빈 계약 확대를 밝혔다"
    end = t.index("모건스탠리") + len("모건스탠리")
    assert not own_move_after(t, end)
    t2 = "은행주 약세\n모건스탠리\n-2.88%"
    assert own_move_after(t2, t2.index("모건스탠리") + len("모건스탠리"))
    # 이름 뒤 공백이 길어도 표기를 놓치지 않는다(원문을 먼저 자르면 창 밖으로 밀린다).
    t3 = "골드만삭스" + " " * 200 + "-3.96%"
    assert own_move_after(t3, len("골드만삭스"))
