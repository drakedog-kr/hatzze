"""fetch_us_price_history · yahoo_client.fetch_us_daily_bars — 미장 테마 거래대금(마이그레이션 106).

막는 것: 진행 중인 날의 덜 찬 거래량 · 비어 오는 맨 끝 바 · 날마다 전 기간을 다시 쓰기.
"""

from datetime import datetime

import fetch_us_price_history as m
from common import yahoo_client as y

# 2026-10-19(월) · 10-20(화) 09:30 ET 바 — 야후 미국 일봉의 timestamp 는 세션 시작 시각이다.
MON = 1792416600
TUE = 1792503000


def _chart(closes, volumes, meta=None, stamps=(MON, TUE)):
    return {"meta": meta or {}, "timestamp": list(stamps), "indicators": {"quote": [{"close": closes, "volume": volumes}]}}


def test_bars_use_new_york_dates(monkeypatch):
    monkeypatch.setattr(y, "_get", lambda s, p: _chart([217.09, 216.47], [98684700, 78967900]))
    bars = y.fetch_us_daily_bars("NVDA", 10, now=datetime(2026, 10, 21, 6, 30, tzinfo=y.NY))
    # KST 로 옮기면 10-20 세션이 10-21 로 밀린다 — 뉴욕 날짜 그대로여야 한다.
    assert bars == [
        {"date": "2026-10-19", "close": 217.09, "volume": 98684700},
        {"date": "2026-10-20", "close": 216.47, "volume": 78967900},
    ]


def test_bars_drop_open_day(monkeypatch):
    # 뉴욕 10-20 15:00 — 장중이라 그날 바의 거래량이 덜 찼다. 버린다.
    monkeypatch.setattr(y, "_get", lambda s, p: _chart([217.09, 216.0], [98684700, 40000000]))
    bars = y.fetch_us_daily_bars("NVDA", 10, now=datetime(2026, 10, 20, 15, 0, tzinfo=y.NY))
    assert [b["date"] for b in bars] == ["2026-10-19"]


def test_bars_fill_blank_last_bar_from_meta(monkeypatch):
    meta = {"regularMarketTime": TUE + 6 * 3600 + 1800, "regularMarketPrice": 216.47, "regularMarketVolume": 77454645,
            "regularMarketDayHigh": 218.0, "regularMarketDayLow": 214.0}
    monkeypatch.setattr(y, "_get", lambda s, p: _chart([217.09, None], [98684700, None], meta))
    bars = y.fetch_us_daily_bars("NVDA", 10, now=datetime(2026, 10, 21, 6, 30, tzinfo=y.NY))
    assert bars[-1] == {"date": "2026-10-20", "close": 216.47, "volume": 77454645}


def test_bars_skip_blank_last_bar_when_meta_is_other_day_or_stale(monkeypatch):
    # meta 가 다른 날(전 세션)이면 그 값을 이 바에 붙이지 않는다.
    meta = {"regularMarketTime": MON + 6 * 3600, "regularMarketPrice": 217.09, "regularMarketVolume": 1}
    monkeypatch.setattr(y, "_get", lambda s, p: _chart([217.09, None], [98684700, None], meta))
    assert [b["date"] for b in y.fetch_us_daily_bars("NVDA", 10, now=datetime(2026, 10, 21, 6, 30, tzinfo=y.NY))] == ["2026-10-19"]
    # 밴드 밖(낡은 값)이면 버린다.
    meta = {"regularMarketTime": TUE + 6 * 3600, "regularMarketPrice": 230.0, "regularMarketVolume": 1,
            "regularMarketDayHigh": 218.0, "regularMarketDayLow": 214.0}
    monkeypatch.setattr(y, "_get", lambda s, p: _chart([217.09, None], [98684700, None], meta))
    assert [b["date"] for b in y.fetch_us_daily_bars("NVDA", 10, now=datetime(2026, 10, 21, 6, 30, tzinfo=y.NY))] == ["2026-10-19"]


def test_bars_failure_is_none(monkeypatch):
    monkeypatch.setattr(y, "_get", lambda s, p: None)
    assert y.fetch_us_daily_bars("NVDA", 10) is None


def test_rows_for_multiplies_close_and_volume():
    assert m.rows_for("NVDA", [{"date": "2026-10-20", "close": 216.47, "volume": 78967900}]) == [
        {"ticker": "NVDA", "date": "2026-10-20", "close": 216.47, "volume": 78967900, "trade_value": 17094181313.0}
    ]


def test_rows_to_write_only_missing_and_recent():
    rows = [{"ticker": "NVDA", "date": f"2026-10-{d:02d}"} for d in (14, 15, 16, 19, 20)] + [{"ticker": "AMD", "date": "2026-10-14"}]
    existing = {("NVDA", f"2026-10-{d:02d}") for d in (14, 15, 16, 19, 20)} | {("AMD", "2026-10-14")}
    # 다 있으면 티커마다 최근 세 세션만 다시 쓴다(AMD 는 하나뿐이라 그 하나).
    got = {(r["ticker"], r["date"]) for r in m.rows_to_write(rows, existing)}
    assert got == {("NVDA", "2026-10-16"), ("NVDA", "2026-10-19"), ("NVDA", "2026-10-20"), ("AMD", "2026-10-14")}
    # 표에 없는 날은 오래돼도 쓴다.
    got = {(r["ticker"], r["date"]) for r in m.rows_to_write(rows, existing - {("NVDA", "2026-10-14")})}
    assert ("NVDA", "2026-10-14") in got


def test_theme_tickers_unique_sorted():
    ts = m.theme_tickers()
    assert ts == sorted(set(ts)) and "NVDA" in ts and "BRK" in ts
