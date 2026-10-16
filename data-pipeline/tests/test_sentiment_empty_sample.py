"""감성 표본이 비면(0건) 0.0 을 정상 값으로 저장하지 않는지 — 디시 0.0 은 과열도 75(초고온)다.

지키는 것:
- 풀링은 0건인 날의 원자를 건너뛰고 pool_days 에 세지 않는다(카드가 'N일 합산'을 이 값으로 적는다).
- 오늘 표본이 0건이면 풀링하지 않는다.
- 디시 · 뉴스 수집기는 오늘 표본이 0건이면 아무것도 안 쓰고 끝난다(LLM 분류 불가와 같은 처리).
"""
import pytest

import fetch_dcinside_stock as dc
import fetch_news_sentiment as nw
from common.details import pooled_sentiment_details


class Prior:
    """pooled_sentiment_details 의 앞 행 조회만 흉내 낸다."""

    def __init__(self, rows):
        self.rows = rows

    def __getattr__(self, _name):
        return lambda *a, **k: self

    def limit(self, n):
        self.n = n
        return self

    def execute(self):
        class R:
            pass

        r = R()
        r.data = self.rows[: self.n]
        return r


def atom(pos, neg, neu):
    return {"details": {"pos_count_1d": pos, "neg_count_1d": neg, "neu_count_1d": neu, "total_count_1d": pos + neg + neu}}


TODAY = {"positive": 30, "negative": 50, "neutral": 20, "total": 100}


def test_empty_prior_day_is_skipped():
    score, d = pooled_sentiment_details(Prior([atom(0, 0, 0), atom(40, 40, 20)]), "i", "2026-10-16", TODAY)
    assert d["pool_days"] == 2
    assert d["total_count"] == 200
    assert score == -10.0


def test_empty_today_is_not_pooled():
    with pytest.raises(ValueError):
        pooled_sentiment_details(Prior([atom(0, 0, 0), atom(0, 0, 0)]), "i", "2026-10-16", {**TODAY, "positive": 0, "negative": 0, "neutral": 0, "total": 0})


class NoWrite:
    """ensure_indicator 만 통과시키고 indicator_values 에 쓰면 실패한다."""

    def __init__(self):
        self.name = None

    def table(self, name):
        self.name = name
        return self

    def __getattr__(self, op):
        def f(*a, **k):
            assert not (self.name == "indicator_values" and op in ("upsert", "insert", "update")), "빈 표본을 저장했다"
            return self

        return f

    def execute(self):
        class R:
            data = [{"id": "ind-1"}]

        return R()


def test_dcinside_skips_empty_sample(monkeypatch):
    monkeypatch.setattr(dc, "get_client", NoWrite)
    monkeypatch.setattr(dc, "collect_recent_titles", lambda: ([], {"sample_capped_1d": False}))
    monkeypatch.setattr(dc, "classify_titles", lambda *a, **k: pytest.fail("LLM 을 불렀다"))
    dc.main()


def test_news_skips_empty_sample(monkeypatch):
    monkeypatch.setattr(nw, "get_client", NoWrite)
    monkeypatch.setattr(nw, "collect_today_titles", lambda: [])
    monkeypatch.setattr(nw, "classify_titles", lambda *a, **k: pytest.fail("LLM 을 불렀다"))
    nw.main()
