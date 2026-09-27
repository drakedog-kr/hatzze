"""미장 일별 집계가 이번 계산에 없는 (날짜, 종목) 옛 행을 지우는지 — 안전장치 포함."""
import calculate_us_stock_daily as m


class _Q:
    def __init__(self, log):
        self.log, self.deleting = log, False

    def delete(self):
        self.deleting = True
        return self

    def in_(self, _col, ids):
        if self.deleting:
            self.log.extend(ids)
        return self

    def execute(self):
        return self


class _DB:
    def __init__(self):
        self.deleted = []

    def table(self, _name):
        return _Q(self.deleted)


def _run(monkeypatch, existing, fresh):
    monkeypatch.setattr(m, "load_all_keyset", lambda db, t, cols: existing)
    db = _DB()
    m.drop_stale_stock_rows(db, fresh)
    return db.deleted


def _rows(n, ticker="NVDA"):
    return [{"id": f"{ticker}{i}", "date": f"2026-09-{i + 1:02d}", "ticker": ticker} for i in range(n)]


def test_deletes_rows_missing_from_this_run(monkeypatch):
    fresh = _rows(20)
    existing = fresh + [{"id": "gs1", "date": "2026-09-05", "ticker": "GS"}]
    assert _run(monkeypatch, existing, fresh) == ["gs1"]


def test_keeps_everything_when_this_run_is_empty(monkeypatch):
    assert _run(monkeypatch, _rows(5), []) == []


def test_refuses_when_too_many_would_go(monkeypatch):
    # 입력이 잘린 날 멀쩡한 과거 행을 쓸어 내지 않는다(STALE_MAX_RATIO).
    fresh = _rows(10)
    existing = fresh + _rows(5, "GS")
    assert _run(monkeypatch, existing, fresh) == []
