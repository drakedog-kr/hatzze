"""common/kind.request — KIND 요청의 서울 경유 · 직접 · 재시도.

해외 러너 IP 에 KIND 가 일시 차단 403 을 주는 날이 잦아(#815 · #819 · #820 · #823 · #831 · #832) 사이트의 /api/kind(서울)를
먼저 묻고, 그 길이 안 되면 같은 시도 안에서 직접 묻는다. KIND 에도 사이트에도 실제로 묻지 않고 응답을 흉내 낸다.
"""
import email.message
import urllib.error

import pytest

from common import kind

KIND_URL = "https://kind.krx.co.kr/disclosure/details.do"
RELAY = "https://relay.test/api/kind"


class _Body:
    def __init__(self, data: bytes):
        self._data = data

    def read(self):
        return self._data

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def _http_error(url: str, code: int, upstream: bool) -> urllib.error.HTTPError:
    hdrs = email.message.Message()
    if upstream:
        hdrs[kind.UPSTREAM_HEADER] = str(code)
    return urllib.error.HTTPError(url, code, "x", hdrs, None)


def serve(monkeypatch, plan):
    """plan(요청 주소, 머리) → bytes(성공) 또는 예외. 부른 기록과 기다린 초를 돌려준다."""
    calls: list[tuple[str, dict]] = []
    slept: list[float] = []

    def fake_urlopen(req, timeout=None):
        hdrs = {k.lower(): v for k, v in req.header_items()}
        calls.append((req.full_url, hdrs))
        out = plan(req.full_url, hdrs, len(calls))
        if isinstance(out, BaseException):
            raise out
        return _Body(out)

    monkeypatch.setattr(kind.urllib.request, "urlopen", fake_urlopen)
    monkeypatch.setattr(kind.time, "sleep", lambda s: slept.append(s))
    monkeypatch.setattr(kind, "_relay_off", False)
    monkeypatch.setattr(kind, "_relay_announced", False)
    return calls, slept


@pytest.fixture
def relay_env(monkeypatch):
    monkeypatch.setenv("KIND_PROXY_URL", RELAY + "/")
    monkeypatch.setenv("KIND_PROXY_SECRET", "s3cret")


@pytest.fixture
def no_relay_env(monkeypatch):
    monkeypatch.delenv("KIND_PROXY_URL", raising=False)
    monkeypatch.delenv("KIND_PROXY_SECRET", raising=False)


def test_relay_first_with_secret_and_same_form(monkeypatch, relay_env):
    calls, _ = serve(monkeypatch, lambda url, h, n: b"<tr>ok</tr>")
    body = kind.request(KIND_URL + "?method=x", data=b"a=1", headers={"Referer": "https://kind.krx.co.kr/r"})
    assert body == b"<tr>ok</tr>"
    assert len(calls) == 1
    url, hdrs = calls[0]
    assert url == RELAY + "/disclosure/details.do?method=x"
    assert hdrs["authorization"] == "Bearer s3cret"
    assert hdrs["referer"] == "https://kind.krx.co.kr/r"
    assert hdrs["user-agent"].startswith("hatzze/")


def test_relay_blocked_too_falls_back_to_direct_in_same_attempt(monkeypatch, relay_env):
    def plan(url, h, n):
        return _http_error(url, 403, upstream=True) if url.startswith(RELAY) else b"direct"

    calls, slept = serve(monkeypatch, plan)
    assert kind.request(KIND_URL) == b"direct"
    assert [u.startswith(RELAY) for u, _ in calls] == [True, False]
    assert "authorization" not in calls[1][1]  # 비밀은 KIND 로 새지 않는다
    assert slept == []


def test_relay_own_failure_turns_relay_off_for_this_run(monkeypatch, relay_env):
    def plan(url, h, n):
        return _http_error(url, 401, upstream=False) if url.startswith(RELAY) else b"direct"

    calls, _ = serve(monkeypatch, plan)
    assert kind.request(KIND_URL) == b"direct"
    assert kind.request(KIND_URL) == b"direct"
    assert [u.startswith(RELAY) for u, _ in calls] == [True, False, False]


def test_relay_unreachable_goes_direct_without_turning_off(monkeypatch, relay_env):
    def plan(url, h, n):
        return OSError("timed out") if url.startswith(RELAY) else b"direct"

    calls, _ = serve(monkeypatch, plan)
    assert kind.request(KIND_URL) == b"direct"
    assert kind.request(KIND_URL) == b"direct"
    assert [u.startswith(RELAY) for u, _ in calls] == [True, False, True, False]


def test_both_blocked_retries_six_times_with_backoff(monkeypatch, relay_env):
    calls, slept = serve(monkeypatch, lambda url, h, n: _http_error(url, 403, upstream=url.startswith(RELAY)))
    assert kind.request(KIND_URL) is None
    assert len(calls) == 12
    assert slept == [2, 4, 8, 16, 20]


def test_upstream_not_found_is_not_retried(monkeypatch, relay_env):
    calls, slept = serve(monkeypatch, lambda url, h, n: _http_error(url, 404, upstream=True))
    assert kind.request(KIND_URL) is None
    assert len(calls) == 1 and slept == []


def test_without_relay_env_only_direct(monkeypatch, no_relay_env):
    def plan(url, h, n):
        return _http_error(url, 403, upstream=False) if n < 6 else b"ok"

    calls, slept = serve(monkeypatch, plan)
    assert kind.request(KIND_URL) == b"ok"
    assert all(u.startswith("https://kind.krx.co.kr/") for u, _ in calls)
    assert slept == [2, 4, 8, 16, 20]


def test_non_kind_url_is_never_relayed(monkeypatch, relay_env):
    calls, _ = serve(monkeypatch, lambda url, h, n: b"x")
    assert kind.request("https://example.test/a") == b"x"
    assert calls[0][0] == "https://example.test/a"


def test_post_list_and_get_page_decode(monkeypatch, relay_env):
    serve(monkeypatch, lambda url, h, n: "상장회사".encode("euc-kr") if "corpList" in url else "<tr>표</tr>".encode())
    assert kind.post_list(KIND_URL, "https://kind.krx.co.kr/r", {"a": "1"}) == "<tr>표</tr>"
    assert kind.get_page("https://kind.krx.co.kr/corpgeneral/corpList.do?method=download", encoding="euc-kr") == "상장회사"
