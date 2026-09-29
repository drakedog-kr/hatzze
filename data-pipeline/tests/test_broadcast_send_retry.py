"""채널 발송이 '닿았는지 모르는' 실패를 다시 보내지 않는지 — 같은 글이 공개 채널에 두 번 올라가지 않게.

sendMessage 에는 멱등 키가 없다. 응답 읽기가 20초를 넘기거나(ReadTimeout) 게이트웨이가 HTML 로
502 를 주면(res.json() 이 JSONDecodeError) 텔레그램은 이미 글을 올렸을 수 있는데, 옛 루프는 2초
뒤 같은 글을 또 보냈다. 연결조차 못 한 실패와 텔레그램이 ok:false 로 답한 실패만 다시 보낸다.
"""
import types

import pytest
import requests
from urllib3.exceptions import MaxRetryError, NewConnectionError, ProtocolError

import send_telegram_broadcast as S


def _refused():
    reason = NewConnectionError(None, "Failed to establish a new connection: [Errno 111] Connection refused")
    return requests.ConnectionError(MaxRetryError(None, "/sendMessage", reason=reason))


def test_never_reached_only_when_no_connection_was_made():
    assert S.never_reached(requests.ConnectTimeout())
    assert S.never_reached(_refused())
    assert not S.never_reached(requests.ReadTimeout())
    assert not S.never_reached(requests.ConnectionError(ProtocolError("Connection aborted.", ConnectionResetError())))
    assert not S.never_reached(requests.exceptions.JSONDecodeError("Expecting value", "<html>502</html>", 0))


def _ok():
    return types.SimpleNamespace(status_code=200, json=lambda: {"ok": True, "result": {"message_id": 7}})


def _run(monkeypatch, answers):
    """answers 를 차례로 돌려주거나 던지는 requests.post 로 send 를 돌리고 호출 수를 센다."""
    calls = []

    def post(*_a, **_k):
        calls.append(1)
        a = answers[len(calls) - 1]
        if isinstance(a, Exception):
            raise a
        return a

    monkeypatch.setattr(S.requests, "post", post)
    monkeypatch.setattr(S.time, "sleep", lambda _s: None)
    return calls


@pytest.mark.parametrize("first", [
    requests.ReadTimeout(),
    requests.exceptions.JSONDecodeError("Expecting value", "<html>502 Bad Gateway</html>", 0),
    requests.ConnectionError(ProtocolError("Connection aborted.", ConnectionResetError())),
])
def test_unknown_outcome_is_not_sent_again(monkeypatch, first):
    calls = _run(monkeypatch, [first, _ok()])
    with pytest.raises(RuntimeError):
        S.send("TOKEN", "@chan", "글")
    assert len(calls) == 1


@pytest.mark.parametrize("first", [
    requests.ConnectTimeout(),
    _refused(),
    types.SimpleNamespace(status_code=429, json=lambda: {"ok": False, "error_code": 429, "description": "Too Many Requests"}),
])
def test_certain_failures_are_retried(monkeypatch, first):
    calls = _run(monkeypatch, [first, _ok()])
    S.send("TOKEN", "@chan", "글")
    assert len(calls) == 2
