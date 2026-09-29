"""증권 앱 순위(fetch_brokerage_app_rank)가 비었거나 잘린 앱스토어 차트를 '증권 앱 0점'으로 저장하지 않는지.

금융 무료앱 상위 100 차트는 비는 일이 없다. 차트가 비었으면 증권 앱이 빠진 게 아니라 응답이 잘못 온 것이다.
"""
import pytest

import fetch_brokerage_app_rank as app


class _Resp:
    def __init__(self, payload):
        self.payload = payload

    def raise_for_status(self):
        pass

    def json(self):
        return self.payload


def entry(name, artist="은행"):
    return {"im:name": {"label": name}, "im:artist": {"label": artist}}


def feed(monkeypatch, payload):
    monkeypatch.setattr(app, "get_with_retry", lambda url, **kw: _Resp(payload))
    return app.fetch_brokerage_froth()


@pytest.mark.parametrize("payload", [{}, {"feed": {"author": {}, "updated": {}}}, {"feed": {"entry": []}}])
def test_empty_chart_raises(monkeypatch, payload):
    with pytest.raises(RuntimeError):
        feed(monkeypatch, payload)


def test_truncated_chart_raises(monkeypatch):
    with pytest.raises(RuntimeError):
        feed(monkeypatch, {"feed": {"entry": [entry("토스증권", "Viva Republica")] + [entry(f"앱{i}") for i in range(19)]}})


def test_full_chart_scores(monkeypatch):
    entries = [entry(f"앱{i}") for i in range(app.LIMIT)]
    entries[9] = entry("토스증권", "Viva Republica")  # 10위 = 91점
    score, charted = feed(monkeypatch, {"feed": {"entry": entries}})
    assert score == 91.0
    assert charted == [{"name": "토스증권", "rank": 10}]


def test_full_chart_without_brokerage_is_a_real_zero(monkeypatch):
    score, charted = feed(monkeypatch, {"feed": {"entry": [entry(f"앱{i}") for i in range(app.LIMIT)]}})
    assert (score, charted) == (0.0, [])
