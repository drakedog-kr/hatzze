"""까닭 생성기의 '빈 날 다시 잡기'와 휴장 판정 — 그날 저녁이 못 만든 날을 다음 실행이 메우는지.

2026-10-08(목) 저녁에 종목 추출이 DB 연결 끊김으로 죽어 그날 국장 집계가 아침분(3채널 이상 6종목)뿐이었다.
생성기는 등락 표기 0 을 '장이 안 열린 날'로 읽고 국장 까닭을 건너뛰었고, 다음 실행부터 집계는 돌아왔지만
까닭은 아무도 다시 만들지 않아 테마 화면 '등락의 이유'에서 그날이 빠졌다(generate_move_reasons.py 머리 주석).
DB·LLM 은 부르지 않는다 — 가짜 표와 가짜 함수로 갈림길만 본다.
"""
import types
from datetime import date

import generate_move_reasons as M

KR, US = M.MARKETS["kr"], M.MARKETS["us"]


# ── 장이 열린 날인가 ─────────────────────────────────────────────────────────────

def test_krx_session_reads_the_holiday_table():
    assert M.krx_session(date(2026, 10, 8)) is True    # 목 · 개장
    assert M.krx_session(date(2026, 10, 9)) is False   # 한글날
    assert M.krx_session(date(2026, 10, 5)) is False   # 개천절 대체공휴일
    assert M.krx_session(date(2026, 10, 10)) is False  # 토
    # 표가 없는 해의 평일은 모른다 — 예전처럼 표기 수가 가른다.
    assert M.krx_session(date(2031, 3, 3)) is None


# ── 빈 날 고르기 ─────────────────────────────────────────────────────────────────

def test_kr_gap_is_only_the_missed_trading_day():
    # 10-11(일) 아침 기준 앞 7일. 개장일은 10-06 · 10-07 · 10-08 이고 10-08 만 비었다.
    have = {"2026-10-06", "2026-10-07"}
    assert M.catch_up_days(have, date(2026, 10, 11), krx_calendar=True) == ["2026-10-08"]


def test_kr_nothing_missing_after_a_long_weekend():
    have = {"2026-10-06", "2026-10-07", "2026-10-08"}
    assert M.catch_up_days(have, date(2026, 10, 11), krx_calendar=True) == []


def test_us_looks_at_every_day():
    # 미장 까닭은 주말에도 선다(16~34행). 비면 그날이 빈 것이다.
    days = [f"2026-10-{d:02d}" for d in range(4, 11)]
    have = set(days) - {"2026-10-09"}
    assert M.catch_up_days(have, date(2026, 10, 11), krx_calendar=False) == ["2026-10-09"]


def test_today_is_left_to_the_evening_run():
    # 아침엔 그날 글이 몇백 건뿐이다 — 오늘은 다시 잡기가 안 본다.
    assert "2026-10-08" not in M.catch_up_days(set(), date(2026, 10, 8), krx_calendar=True)


def test_gaps_come_oldest_first():
    # 10-09(한글날) 기준 앞 7일 = 10-02(금) ~ 10-08(목). 10-05 는 대체공휴일이다.
    assert M.catch_up_days(set(), date(2026, 10, 9), krx_calendar=True) == ["2026-10-02", "2026-10-06", "2026-10-07", "2026-10-08"]


class _DatesQ:
    def __init__(self, dates):
        self.dates, self.lo, self.hi = dates, None, None

    def select(self, _cols):
        return self

    def gte(self, _c, v):
        self.lo = v
        return self

    def lt(self, _c, v):
        self.hi = v
        return self

    def range(self, *_a):
        return self

    def execute(self):
        return types.SimpleNamespace(data=[{"date": d} for d in self.dates if self.lo <= d < self.hi])


def test_missing_days_reads_the_window_from_the_table():
    rows = ["2026-10-02", "2026-10-06", "2026-10-07"] + ["2026-10-07"] * 39
    db = types.SimpleNamespace(table=lambda _n: _DatesQ(rows))
    assert M.missing_days(db, KR, date(2026, 10, 11)) == ["2026-10-08"]


# ── 개장일인데 재료가 얇다 ──────────────────────────────────────────────────────

def _thin_day(monkeypatch):
    """10-08 저녁의 꼴 — 집계는 몇 종목뿐이고 그날 글에 등락 표기가 없다."""
    monkeypatch.setattr(M, "load_keyset", lambda db, t, cols, narrow=None: [
        {"id": i, "stock_code": f"00{i:04d}", "mention_count": 9, "channel_count": 4, "weighted_score": 10} for i in range(6)
    ])
    monkeypatch.setattr(M, "load_day_messages", lambda db, d: {})
    monkeypatch.setattr(M, "load_all_keyset", lambda db, t, cols: [])
    monkeypatch.setattr(M, "attach_texts", lambda db, rows: None)


def test_thin_trading_day_warns_instead_of_calling_it_a_holiday(monkeypatch, capsys):
    _thin_day(monkeypatch)
    assert M.run_market(object(), None, KR, "2026-10-08", dry_run=False) == 0
    out = capsys.readouterr().out
    assert "::warning::" in out and "개장일" in out
    assert "장이 열리지 않은 날" not in out


def test_unknown_year_keeps_the_old_quoted_gate(monkeypatch, capsys):
    _thin_day(monkeypatch)
    assert M.run_market(object(), None, KR, "2031-03-03", dry_run=False) == 0
    out = capsys.readouterr().out
    assert "장이 열리지 않은 날" in out and "::warning::" not in out


def test_holiday_is_skipped_before_reading_anything(monkeypatch, capsys):
    def boom(*_a, **_k):
        raise AssertionError("휴장일에 집계를 읽었다")

    monkeypatch.setattr(M, "load_keyset", boom)
    assert M.run_market(object(), None, KR, "2026-10-09", dry_run=False) == 0
    assert "휴장일" in capsys.readouterr().out


# ── main: 슬롯 · 날짜 · 건너뛸 시장 ─────────────────────────────────────────────

def _main(monkeypatch, argv, gaps, llm=lambda _k: "llm"):
    calls = []
    monkeypatch.setattr(M, "HAS_LLM_CREDENTIAL", True)
    monkeypatch.setattr(M, "get_client", lambda: object())
    monkeypatch.setattr(M, "get_llm_client", llm)
    monkeypatch.setattr(M, "today_kst", lambda: date(2026, 10, 11))
    monkeypatch.setattr(M, "missing_days", lambda db, cfg, today: gaps.get(cfg["label"], []))
    monkeypatch.setattr(M, "run_market", lambda db, client, cfg, day, dry_run: calls.append((cfg["label"], day, client)) or 0)
    monkeypatch.setattr(M, "fill_krx", lambda db, dry_run: 0)
    monkeypatch.setattr(M.sys, "argv", ["generate_move_reasons.py", *argv])
    M.main()
    return calls


def test_morning_run_fills_only_the_gap(monkeypatch):
    calls = _main(monkeypatch, ["--slot", "morning"], {"국장": ["2026-10-08"]})
    assert calls == [("국장", "2026-10-08", "llm")]


def test_morning_without_gaps_never_builds_a_client(monkeypatch):
    def no_llm(_k):
        raise AssertionError("빈 날이 없는 아침에 LLM 클라이언트를 만들었다")

    assert _main(monkeypatch, ["--slot", "morning"], {}, llm=no_llm) == []


def test_evening_makes_today_then_the_gap(monkeypatch):
    calls = _main(monkeypatch, ["--slot", "evening"], {"국장": ["2026-10-08"]})
    assert [(m, d) for m, d, _c in calls] == [("국장", "2026-10-11"), ("국장", "2026-10-08"), ("미장", "2026-10-11")]


def test_skip_catchup_leaves_that_market_alone(monkeypatch):
    # 이번 실행에서 국장 일별 집계가 실패했다 — 낡은 집계로 지난 날을 만들지 않는다.
    calls = _main(monkeypatch, ["--slot", "morning", "--skip-catchup", "kr"], {"국장": ["2026-10-08"], "미장": ["2026-10-09"]})
    assert [(m, d) for m, d, _c in calls] == [("미장", "2026-10-09")]


def test_rerun_of_one_date_does_not_wander(monkeypatch):
    # move-reasons-rerun.yml 은 짚은 날만 다시 만든다.
    calls = _main(monkeypatch, ["--date", "2026-10-08", "--kr-only"], {"국장": ["2026-10-07"]})
    assert [(m, d) for m, d, _c in calls] == [("국장", "2026-10-08")]
