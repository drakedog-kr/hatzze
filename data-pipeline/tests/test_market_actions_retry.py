"""KIND 시장조치 검색(fetch_market_actions._search_page)이 다른 KIND 스크립트와 같은 길(common/kind.request)을 타는지.

http_client 기본값(네 번)을 쓰던 때 이 스크립트만 혼자 403 에 죽었다(2026-11-15 #815 · 11-19 #820). 여섯 번으로 맞춘 뒤(#821)에도
같은 러너라 못 넘는 날이 있어(11-22 #832) 서울 경유를 먼저 묻는다. KIND 에 실제로 묻지 않고 응답을 흉내 낸다. 기다리는 시간도 건너뛴다.
"""
import email.message
import urllib.error
from datetime import date

import pytest

import fetch_market_actions as ma
from common import kind


class _Body:
    def __init__(self, data: bytes):
        self._data = data

    def read(self):
        return self._data

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def serve(monkeypatch, results):
    """차례로 그 결과를 준다(마지막 것은 계속). int 면 그 상태 코드의 HTTPError. 부른 주소와 기다린 초를 돌려준다."""
    calls: list[str] = []
    slept: list[float] = []

    def fake_urlopen(req, timeout=None):
        i = min(len(calls), len(results) - 1)
        calls.append(req.full_url)
        r = results[i]
        if isinstance(r, int):
            hdrs = email.message.Message()
            if req.full_url.startswith("https://relay.test"):
                hdrs[kind.UPSTREAM_HEADER] = str(r)
            raise urllib.error.HTTPError(req.full_url, r, "x", hdrs, None)
        return _Body(r)

    monkeypatch.setattr(kind.urllib.request, "urlopen", fake_urlopen)
    monkeypatch.setattr(kind.time, "sleep", lambda s: slept.append(s))
    monkeypatch.setattr(kind, "_relay_off", False)
    monkeypatch.setattr(kind, "_relay_announced", False)
    return calls, slept


@pytest.fixture(autouse=True)
def _no_relay(monkeypatch):
    monkeypatch.delenv("KIND_PROXY_URL", raising=False)
    monkeypatch.delenv("KIND_PROXY_SECRET", raising=False)


def test_survives_five_blocks_like_other_kind_scripts(monkeypatch):
    _, slept = serve(monkeypatch, [403, 403, 403, 403, 403, b"<html>ok</html>"])
    assert ma._search_page("사이드카", date(2026, 1, 1), date(2026, 11, 19), 1) == "<html>ok</html>"
    assert slept == [2, 4, 8, 16, 20]


def test_gives_up_after_six(monkeypatch):
    calls, slept = serve(monkeypatch, [403])
    with pytest.raises(RuntimeError):
        ma._search_page("사이드카", date(2026, 1, 1), date(2026, 11, 19), 1)
    assert len(calls) == 6 and len(slept) == 5


def test_goes_through_seoul_relay_when_set(monkeypatch):
    monkeypatch.setenv("KIND_PROXY_URL", "https://relay.test/api/kind")
    monkeypatch.setenv("KIND_PROXY_SECRET", "s")
    calls, slept = serve(monkeypatch, [b"<html>seoul</html>"])
    assert ma._search_page("사이드카", date(2026, 1, 1), date(2026, 11, 19), 1) == "<html>seoul</html>"
    assert calls == ["https://relay.test/api/kind/disclosure/searchtotalinfo.do"]
    assert slept == []
