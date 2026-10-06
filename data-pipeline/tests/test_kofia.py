"""금투협 공용 조각(common/kofia.py) — 저쪽에 못 닿을 때와 고쳐야 하는 오류를 가르는가.

지키는 것:
- 연결 끊김 · 타임아웃 · 재시도를 다 쓴 5xx 는 KofiaUnavailableError 다(수집 스크립트가 경고만 남기고 넘어간다).
- 403(활용신청 안 됨)은 PermissionError 그대로다 — 다시 걸어도 같은 답이 오는, 사람이 고칠 오류다.
- 수집 스크립트 둘은 KofiaUnavailableError 에 실패로 끝나지 않고, 아무것도 쓰지 않는다.
"""

from __future__ import annotations

import sys

import pytest
import requests

import common.kofia as kofia
import scripts.fetch_credit_loan as credit
import scripts.fetch_investor_deposit as deposit


class _Resp:
    def __init__(self, status: int, text: str = ""):
        self.status_code = status
        self.text = text


def _raise(exc: Exception):
    def f(*_a, **_k):
        raise exc

    return f


@pytest.mark.parametrize(
    "exc",
    [
        requests.exceptions.ConnectTimeout("Connection to apis.data.go.kr timed out"),
        requests.exceptions.ConnectionError("reset"),
        requests.exceptions.ReadTimeout("read timed out"),
        requests.exceptions.HTTPError("503 Service Unavailable"),
    ],
)
def test_network_failures_are_unavailable(monkeypatch, exc):
    monkeypatch.setattr(kofia, "get_with_retry", _raise(exc))
    with pytest.raises(kofia.KofiaUnavailableError):
        kofia.fetch_daily("getGrantingOfCreditBalanceInfo", "crdTrFingWhl", "금투협 신용공여")


def test_403_is_not_unavailable(monkeypatch):
    monkeypatch.setattr(kofia, "get_with_retry", lambda *_a, **_k: _Resp(403, "SERVICE_KEY_IS_NOT_REGISTERED_ERROR"))
    with pytest.raises(PermissionError):
        kofia.fetch_daily("getGrantingOfCreditBalanceInfo", "crdTrFingWhl", "금투협 신용공여")


@pytest.mark.parametrize("mod", [credit, deposit])
def test_fetch_scripts_skip_quietly_when_unavailable(monkeypatch, tmp_path, mod):
    out = tmp_path / "preview.json"
    monkeypatch.setattr(mod, "KSD_API_KEY", "dummy")
    monkeypatch.setattr(mod, "fetch_all", _raise(kofia.KofiaUnavailableError("금투협: 연결 실패")))
    monkeypatch.setattr(sys, "argv", [mod.__file__, "--preview", str(out)])
    mod.main()  # 예외 없이 끝나야 한다 — 워크플로 스텝이 실패로 안 찍힌다
    assert not out.exists()
