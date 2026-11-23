"""KIND 가 막힌 날 스크립트 넷이 어떻게 끝나는가 — 마지막으로 받은 날이 이틀 안이면 저장 없이 정상 종료, 더 낡으면 실패.

알림은 스텝 결과(성공 · 실패)로 열린다. 막힌 하루로 이슈가 열리지 않고, 오래 막히면 열리는지를 본다. DB 와 KIND 는 흉내 낸다.
"""
from datetime import date

import pytest

import fetch_kr_dividend_notices as notices
import fetch_kr_dividend_payout as payout
import fetch_kr_high_dividend as high
import fetch_market_actions as ma
from common import kind

TODAY = date(2026, 11, 22)


@pytest.fixture
def blocked_kind(monkeypatch):
    """KIND 요청이 전부 막혀 None 을 주는 상태."""
    def blocked_request(*_a, **_k):
        kind._last_failure = "blocked"
        return None

    monkeypatch.setattr(kind, "request", blocked_request)
    monkeypatch.setattr(high, "post_list", lambda *a, **k: blocked_request())
    monkeypatch.setattr(payout, "post_list", lambda *a, **k: blocked_request())
    monkeypatch.setattr(notices, "post_list", lambda *a, **k: blocked_request())
    monkeypatch.setattr(ma, "kind_request", blocked_request)
    for m in (high, payout, notices):
        monkeypatch.setattr(m, "today_kst", lambda: TODAY)
        monkeypatch.setattr(m, "get_client", lambda: object())
    monkeypatch.setattr("sys.argv", ["x"])


def _last_ok(monkeypatch, d):
    for m in (high, payout, notices):
        monkeypatch.setattr(m, "latest_computed_for", lambda *a, **k: d)


@pytest.mark.parametrize("mod", [high, payout, notices], ids=["고배당", "배당성향", "배당공시"])
def test_recent_last_ok_skips_without_failing(blocked_kind, monkeypatch, mod):
    _last_ok(monkeypatch, date(2026, 11, 21))
    assert mod.main() is None


@pytest.mark.parametrize("mod", [high, payout, notices], ids=["고배당", "배당성향", "배당공시"])
def test_stale_last_ok_fails_like_before(blocked_kind, monkeypatch, mod):
    _last_ok(monkeypatch, date(2026, 11, 18))
    with pytest.raises(SystemExit) as e:
        mod.main()
    assert e.value.code == 1


class _Client:
    pass


@pytest.fixture
def ma_env(blocked_kind, monkeypatch):
    monkeypatch.setattr(ma, "get_client", lambda: _Client())
    monkeypatch.setattr(ma, "ensure_indicator", lambda *a, **k: "ind")
    monkeypatch.setattr(ma, "date", type("D", (date,), {"today": staticmethod(lambda: TODAY)}))


def test_market_actions_recent_row_skips(ma_env, monkeypatch):
    monkeypatch.setattr(ma, "_latest_row_date", lambda *a: date(2026, 11, 21))
    assert ma.main() is None


def test_market_actions_stale_row_raises(ma_env, monkeypatch):
    monkeypatch.setattr(ma, "_latest_row_date", lambda *a: date(2026, 11, 18))
    with pytest.raises(ma.KindUnavailable):
        ma.main()


def test_market_actions_not_blocked_raises_even_if_recent(ma_env, monkeypatch):
    def http_error(*_a, **_k):
        kind._last_failure = "http"
        return None

    monkeypatch.setattr(ma, "kind_request", http_error)
    monkeypatch.setattr(ma, "_latest_row_date", lambda *a: TODAY)
    with pytest.raises(ma.KindUnavailable):
        ma.main()
