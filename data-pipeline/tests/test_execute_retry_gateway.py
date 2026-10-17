"""common.supabase_client.execute_with_retry — 게이트웨이 5xx 도 다시 던진다(2026-10-15 #734 · #735)."""
import httpx
import pytest
from postgrest.exceptions import APIError

import common.supabase_client as sc


class _Q:
    def __init__(self, errors):
        self.errors = list(errors)
        self.calls = 0

    def execute(self):
        self.calls += 1
        if self.errors:
            raise self.errors.pop(0)
        return "ok"


@pytest.fixture(autouse=True)
def _no_sleep(monkeypatch):
    monkeypatch.setattr(sc.time, "sleep", lambda _s: None)


def _api(code):
    return APIError({"message": "JSON could not be generated", "code": code, "hint": None, "details": "<!DOCTYPE html>"})


def test_gateway_502_is_retried():
    q = _Q([_api(502), _api(503)])
    assert sc.execute_with_retry(q) == "ok" and q.calls == 3


def test_transport_error_still_retried():
    q = _Q([httpx.RemoteProtocolError("ConnectionTerminated")])
    assert sc.execute_with_retry(q) == "ok" and q.calls == 2


def test_postgrest_errors_are_not_retried():
    q = _Q([_api("57014")])
    with pytest.raises(APIError):
        sc.execute_with_retry(q)
    assert q.calls == 1


def test_gives_up_after_retries():
    q = _Q([_api(502)] * (sc.TRANSPORT_RETRIES + 1))
    with pytest.raises(APIError):
        sc.execute_with_retry(q)
    assert q.calls == sc.TRANSPORT_RETRIES + 1
