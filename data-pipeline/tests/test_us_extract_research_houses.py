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
    # 국장 증권사 화자 규칙(config.stock_extraction HOUSE_METHOD)과 같은 꼴이 미장 은행에도 house 로 가는지
    "- 주관사 : 모건스탠리,골드만삭스\n- 시장구분 : 나스닥",
    "골드만삭스는 30조원 규모의 현금배당을 주당 4604원으로 환산했다",
    "(모건스탠리, Overweight, 목표주가 $250)",
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


# ── 화자 자리는 지우지 않고 표시한다(method="house") ──────────────────────────

def test_speaker_only_bank_goes_to_house():
    mt = ex.build_dictionary()
    pattern, caseless = ex.build_pattern(list(mt))
    house = {}
    found = ex.extract("골드만삭스는 하이퍼스케일러 AI 투자가 늘 것으로 전망했다", pattern, mt, caseless, house)
    assert "GS" not in found and house == {"GS": "골드만삭스"}
    house = {}
    found = ex.extract("골드만삭스는 유가 전망을 올렸다. 골드만삭스(-3.96%) 하락", pattern, mt, caseless, house)
    assert "GS" in found and house == {}


def test_is_house():
    from config.us_stock_extraction import HOUSE_METHOD, is_house
    assert is_house({"ticker": "GS", "method": HOUSE_METHOD})
    assert not is_house({"ticker": "GS", "method": "dict"})
    assert not is_house({"ticker": "GS"})  # 국장 행·예전 행은 method 가 dict·alias·None 이다


def test_event_linker_still_links_bank_names():
    import extract_telegram_events as ev
    link = ev.UsLinker()
    assert link.ticker_of("JP모건") == "JPM"
    assert link.ticker_of("골드만삭스") == "GS"
    assert link.ticker_of("엔비디아") == "NVDA"


class _Resp:
    def __init__(self, data):
        self.data = data


class _Q:
    def __init__(self, rows):
        self.rows, self.ids = rows, None

    def select(self, *_a, **_k):
        return self

    def in_(self, _col, vals):
        self.ids = set(vals)
        return self

    def order(self, *_a, **_k):
        return self

    def range(self, a, b):
        self.rows = self.rows[a : b + 1]
        return self

    def execute(self):
        return _Resp([r for r in self.rows if self.ids is None or r.get("message_id", r.get("ticker", r.get("code"))) in self.ids])


class _DB:
    def __init__(self, tables):
        self.tables = tables

    def table(self, name):
        return _Q(list(self.tables.get(name, [])))


def test_broadcast_tags_skip_house_but_keep_us_talk():
    from datetime import datetime

    import common.broadcast_digest as bd

    e1 = bd.Excerpt(n=1, channel="a", message_id=1, text="골드만삭스는 AI CapEx 전망", views=1, forwards=0, posted_at=datetime(2026, 9, 25))
    e2 = bd.Excerpt(n=2, channel="a", message_id=2, text="엔비디아 급등", views=1, forwards=0, posted_at=datetime(2026, 9, 25))
    e3 = bd.Excerpt(n=3, channel="a", message_id=3, text="코스피 마감", views=1, forwards=0, posted_at=datetime(2026, 9, 25))
    db = _DB({
        "telegram_message_us_stocks": [
            {"channel_handle": "a", "message_id": 1, "ticker": "GS", "method": "house"},
            {"channel_handle": "a", "message_id": 2, "ticker": "NVDA", "method": "dict"},
        ],
        # 국장 증권사 화자 행(config.stock_extraction HOUSE_METHOD)도 발췌 태그로 안 단다.
        "telegram_message_stocks": [
            {"channel_handle": "a", "message_id": 3, "stock_code": "001200", "method": "house"},
            {"channel_handle": "a", "message_id": 3, "stock_code": "005930", "method": "dict"},
        ],
        "us_stocks": [{"ticker": "NVDA", "name_ko": "엔비디아"}],
        "stocks": [{"code": "005930", "name": "삼성전자"}, {"code": "001200", "name": "유진투자증권"}],
    })
    kr_names, _ = bd.tag_stocks(db, [e1, e2, e3])
    assert (e1.us, e1.us_talk) == ([], True)      # 미장 몫 재료로는 고르되 골드만삭스 태그는 안 단다
    assert (e2.us, e2.us_talk) == (["NVDA"], True)
    assert (e3.us, e3.us_talk) == ([], False)
    assert e3.kr == ["005930"] and kr_names == {"005930": "삼성전자"}
