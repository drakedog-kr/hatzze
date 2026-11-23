"""수집이 건너뛰는 미국 종목의 옛 줄을 지우는 규칙(fetch_us_dividends.stale_tickers · prunable).

SEC 티커 표에서 빠진 종목(인수 · 상장폐지 · 티커 변경)은 "CIK 없음"으로 건너뛰어 그 종목의 옛 줄이 표에 남는다.
2026-11-23 에 넷(KVUE · PSKY · WBD · QRVO)이 길게는 다섯 주 전 값으로 배당 화면에 실려 있었다.
지울 것은 이번 실행이 안 썼고 PRUNE_AFTER_DAYS 넘게 다시 안 쓰인 줄뿐이다 — 하루 이틀 못 받은 종목과 날짜를 모르는 줄은 둔다.
한 번에 PRUNE_MAX 보다 많으면 종목 몇이 아니라 목록이 어긋난 것이라 지우지 않는다.
"""
from datetime import date, timedelta

import fetch_us_dividends as us

TODAY = date(2026, 11, 23)


def row(ticker, computed_for):
    return {"ticker": ticker, "computed_for": computed_for}


def test_picks_only_rows_not_rewritten_for_long():
    # 그날 표에 있던 넷의 마지막으로 쓴 날 그대로.
    table = [row("KO", "2026-11-23"), row("KVUE", "2026-11-14"), row("PSKY", "2026-10-23"), row("QRVO", "2026-10-18"), row("WBD", "2026-10-23")]
    assert us.stale_tickers(table, {"KO"}, TODAY) == ["KVUE", "PSKY", "QRVO", "WBD"]


def test_keeps_rows_written_this_run():
    # 표를 읽은 때가 저장 앞이라 날짜가 아직 옛것이어도, 이번 실행이 쓰는 줄은 지우지 않는다.
    assert us.stale_tickers([row("KO", "2026-10-01")], {"KO"}, TODAY) == []


def test_keeps_rows_missed_for_a_few_days():
    # SEC 한 종목 실패처럼 며칠 빠진 줄은 다음 실행이 다시 쓴다. 경계는 PRUNE_AFTER_DAYS 를 '넘긴' 날부터다.
    edge = (TODAY - timedelta(days=us.PRUNE_AFTER_DAYS)).isoformat()
    over = (TODAY - timedelta(days=us.PRUNE_AFTER_DAYS + 1)).isoformat()
    assert us.stale_tickers([row("A", "2026-11-22"), row("B", edge), row("C", over)], set(), TODAY) == ["C"]


def test_leaves_rows_without_a_date_alone():
    assert us.stale_tickers([row("A", None), {"ticker": "B"}, row(None, "2026-01-01")], set(), TODAY) == []


def test_refuses_to_prune_too_many_at_once(monkeypatch, capsys):
    many = [row(f"T{i:02d}", "2026-01-01") for i in range(us.PRUNE_MAX + 1)]
    monkeypatch.setattr(us, "load_all", lambda *a, **k: many)
    assert us.prunable(object(), set(), TODAY) == []
    assert "지우지 않습니다" in capsys.readouterr().out
    # 상한까지는 지운다.
    monkeypatch.setattr(us, "load_all", lambda *a, **k: many[: us.PRUNE_MAX])
    assert len(us.prunable(object(), set(), TODAY)) == us.PRUNE_MAX


def test_skips_pruning_when_the_table_cannot_be_read(monkeypatch, capsys):
    def boom(*a, **k):
        raise RuntimeError("down")

    monkeypatch.setattr(us, "load_all", boom)
    assert us.prunable(object(), set(), TODAY) == []
    assert "건너뜁니다" in capsys.readouterr().out
