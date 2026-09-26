"""배당 결정 공시 수집의 '목록이 적다' 검사 — 공시가 뜸한 때와 페이지가 바뀐 때를 가른다(PROBE_DAYS 주석)."""
import sys

import pytest

import fetch_kr_dividend_notices as notices


def filing(i):
    return {"acptno": f"2026091500{i:04d}", "prefix": "00000", "corp_name": "가", "filed_at": None, "title": "현금ㆍ현물배당 결정"}


def run(monkeypatch, window, probe):
    """list_filings 가 처음엔 열흘치(window), 두 번째엔 긴 기간(probe)을 돌려주게 하고 --dry-run 으로 main 을 돈다."""
    answers = iter([window, probe])
    monkeypatch.setattr(notices, "list_filings", lambda frm, to: next(answers))
    monkeypatch.setattr(sys, "argv", ["x", "--dry-run"])
    notices.main()


def test_quiet_period_passes(monkeypatch):
    run(monkeypatch, [], [filing(i) for i in range(5)])  # 열흘 0건이어도 90일에 읽히면 통과


def test_broken_page_still_stops(monkeypatch):
    with pytest.raises(SystemExit) as e:
        run(monkeypatch, [], [])
    assert e.value.code == 1


def test_probe_failure_stops(monkeypatch):
    with pytest.raises(SystemExit) as e:
        run(monkeypatch, [filing(1)], None)
    assert e.value.code == 1
