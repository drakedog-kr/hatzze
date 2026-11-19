"""KIND 시장조치 검색(fetch_market_actions._search_page)이 일시 차단 403 을 다른 KIND 스크립트만큼 버티는지.

http_client 기본값(네 번)을 쓰던 때 이 스크립트만 혼자 403 에 죽었다(2026-11-15 #815 · 11-19 #820).
common/kind.py 와 같은 여섯 번이다. KIND 에 실제로 묻지 않고 응답을 흉내 낸다. 기다리는 시간도 건너뛴다.
"""
from datetime import date

import pytest
import requests

import fetch_market_actions as ma
from common import http_client


class _Resp:
    def __init__(self, status: int, text: str = ""):
        self.status_code = status
        self.reason = "Forbidden" if status == 403 else "OK"
        self.text = text

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.exceptions.HTTPError(f"{self.status_code}", response=self)


def serve(monkeypatch, statuses: list[int]) -> list[float]:
    """차례로 그 상태 코드를 준다(마지막 것은 계속). 기다린 초를 모아 돌려준다."""
    calls = {"n": 0}
    slept: list[float] = []

    def fake_request(method, url, **kw):
        i = min(calls["n"], len(statuses) - 1)
        calls["n"] += 1
        return _Resp(statuses[i], "<html>ok</html>")

    monkeypatch.setattr(http_client.requests, "request", fake_request)
    monkeypatch.setattr(http_client.time, "sleep", lambda s: slept.append(s))
    return slept


def test_survives_five_blocks_like_other_kind_scripts(monkeypatch):
    slept = serve(monkeypatch, [403, 403, 403, 403, 403, 200])
    assert ma._search_page("사이드카", date(2026, 1, 1), date(2026, 11, 19), 1) == "<html>ok</html>"
    assert slept == [2, 4, 8, 16, 20]


def test_gives_up_after_six(monkeypatch):
    slept = serve(monkeypatch, [403])
    with pytest.raises(requests.exceptions.HTTPError):
        ma._search_page("사이드카", date(2026, 1, 1), date(2026, 11, 19), 1)
    assert len(slept) == 5
