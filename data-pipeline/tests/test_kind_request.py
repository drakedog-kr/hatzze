"""common/kind.request · blocked · skip_blocked — KIND 가 클라우드 IP 를 막은 날의 처리.

KIND 앞의 Akamai 가 클라우드 IP 를 막다 말다 한다(#815 · #819 · #820 · #823 · #831 · #832). 매 실행 다시 받는 표라 하루 이틀은
잃는 것이 없어, 막혀서 못 받은 날은 마지막으로 받은 날이 이틀 안이면 건너뛰고 더 낡으면 실패로 끝낸다.
KIND 에 실제로 묻지 않고 응답을 흉내 낸다. 기다리는 시간도 건너뛴다.
"""
import email.message
import urllib.error
from datetime import date

import pytest

from common import kind

URL = "https://kind.krx.co.kr/disclosure/details.do"
TODAY = date(2026, 11, 22)


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
    """차례로 그 결과(int 는 그 상태의 HTTPError · 예외 · bytes)를 준다. 마지막 것은 계속. 부른 수와 기다린 초를 돌려준다."""
    calls: list[str] = []
    slept: list[float] = []

    def fake_urlopen(req, timeout=None):
        r = results[min(len(calls), len(results) - 1)]
        calls.append(req.full_url)
        if isinstance(r, int):
            raise urllib.error.HTTPError(req.full_url, r, "x", email.message.Message(), None)
        if isinstance(r, BaseException):
            raise r
        return _Body(r)

    monkeypatch.setattr(kind.urllib.request, "urlopen", fake_urlopen)
    monkeypatch.setattr(kind.time, "sleep", lambda s: slept.append(s))
    return calls, slept


def test_retries_blocks_with_backoff_then_gets_it(monkeypatch):
    calls, slept = serve(monkeypatch, [403, 403, 503, OSError("reset"), 403, b"ok"])
    assert kind.request(URL) == b"ok"
    assert len(calls) == 6 and slept == [2, 4, 8, 16, 20]
    assert not kind.blocked()


def test_all_blocked_is_blocked(monkeypatch):
    calls, _ = serve(monkeypatch, [403])
    assert kind.request(URL) is None
    assert len(calls) == 6 and kind.blocked()


def test_other_client_error_is_not_blocked_and_not_retried(monkeypatch):
    calls, slept = serve(monkeypatch, [404])
    assert kind.request(URL) is None
    assert len(calls) == 1 and slept == [] and not kind.blocked()


def test_success_clears_previous_block(monkeypatch):
    serve(monkeypatch, [403])
    kind.request(URL)
    assert kind.blocked()
    serve(monkeypatch, [b"ok"])
    kind.request(URL)
    assert not kind.blocked()


@pytest.fixture
def blocked(monkeypatch):
    monkeypatch.setattr(kind, "_last_failure", "blocked")


def test_skip_when_blocked_and_recent(blocked, monkeypatch, capsys):
    monkeypatch.setenv("GITHUB_ACTIONS", "true")
    assert kind.skip_blocked("고배당기업", TODAY, lambda: date(2026, 11, 20)) is True
    out = capsys.readouterr().out
    assert "::warning title=KIND 일시 차단::고배당기업" in out and "2026-11-20(2일 전)" in out


def test_fail_when_blocked_and_stale(blocked):
    assert kind.skip_blocked("고배당기업", TODAY, lambda: date(2026, 11, 19)) is False


def test_fail_when_blocked_and_never_got_it(blocked):
    assert kind.skip_blocked("고배당기업", TODAY, lambda: None) is False


def test_fail_when_not_blocked(monkeypatch):
    monkeypatch.setattr(kind, "_last_failure", "http")
    assert kind.skip_blocked("고배당기업", TODAY, lambda: TODAY) is False
    monkeypatch.setattr(kind, "_last_failure", None)
    assert kind.skip_blocked("고배당기업", TODAY, lambda: TODAY) is False


def test_past_issues_would_all_have_been_skipped(blocked):
    # 11-14 21:11 ~ 11-16 08:31 UTC 네 실행 연속 막힘이 가장 길었다. 그 앞 성공은 11-14(KST) 아침 실행 — 11-16(KST) 에도 건너뛴다.
    assert kind.skip_blocked("배당성향", date(2026, 11, 16), lambda: date(2026, 11, 14)) is True


class _FakeDb:
    def __init__(self, dates: dict):
        self.dates = dates

    def table(self, name):
        dates = self.dates

        class Q:
            def select(self, *_):
                return self

            def order(self, *_a, **_k):
                return self

            def limit(self, *_):
                return self

            def execute(self):
                v = dates[name]
                if isinstance(v, Exception):
                    raise v
                return type("R", (), {"data": [{"computed_for": v}] if v else []})()

        return Q()


def test_latest_computed_for_takes_the_newest_and_skips_unreadable():
    db = _FakeDb({"kr_high_dividend": "2026-11-21", "kr_dividend_payout": "2026-11-22", "broken": RuntimeError("x"), "empty": None})
    assert kind.latest_computed_for(db, "kr_high_dividend", "kr_dividend_payout") == date(2026, 11, 22)
    assert kind.latest_computed_for(db, "broken", "kr_high_dividend") == date(2026, 11, 21)
    assert kind.latest_computed_for(db, "empty") is None


def test_last_ok_is_not_read_unless_blocked(monkeypatch):
    def boom():
        raise AssertionError("막히지 않았는데 마지막 날짜를 읽었다")

    monkeypatch.setattr(kind, "_last_failure", "http")
    assert kind.skip_blocked("고배당기업", TODAY, boom) is False
