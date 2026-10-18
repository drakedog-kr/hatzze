"""scripts/move_reason_rates_pending.py — 아침 국장 카더라가 KRX 등락률 채우기를 기다릴지(2026-10-18)."""
import importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location("p", Path(__file__).resolve().parent.parent / "scripts" / "move_reason_rates_pending.py")
P = importlib.util.module_from_spec(spec)
spec.loader.exec_module(P)


class _Q:
    def __init__(self, rows):
        self.rows, self.f = rows, []

    def select(self, *_):
        return self

    def lt(self, c, v):
        self.f.append(lambda r: r[c] < v)
        return self

    def eq(self, c, v):
        self.f.append(lambda r: r[c] == v)
        return self

    def is_(self, c, v):
        self.f.append(lambda r: r[c] is None)
        return self

    def order(self, c, desc=False):
        self.rows = sorted(self.rows, key=lambda r: r[c], reverse=desc)
        return self

    def limit(self, n):
        self.n = n
        return self

    def execute(self):
        out = [r for r in self.rows if all(f(r) for f in self.f)][: self.n]
        return type("R", (), {"data": out})()


class _DB:
    def __init__(self, rows):
        self.rows = rows

    def table(self, _):
        return _Q(list(self.rows))


def run(rows, today, monkeypatch):
    from datetime import date
    monkeypatch.setattr(P, "today_kst", lambda: date.fromisoformat(today))
    return P.pending(_DB(rows))


def test_tuesday_morning_waits_for_monday_rates(monkeypatch):
    rows = [{"date": "2026-10-19", "stock_code": "005930", "change_rate": None}, {"date": "2026-10-16", "stock_code": "005930", "change_rate": 1.2}]
    assert run(rows, "2026-10-20", monkeypatch) is True


def test_sunday_and_monday_mornings_do_not_wait(monkeypatch):
    rows = [{"date": "2026-10-16", "stock_code": "005930", "change_rate": 1.2}, {"date": "2026-10-16", "stock_code": "000660", "change_rate": -0.5}]
    assert run(rows, "2026-10-18", monkeypatch) is False
    assert run(rows, "2026-10-19", monkeypatch) is False


def test_todays_rows_are_not_yesterday(monkeypatch):
    rows = [{"date": "2026-10-20", "stock_code": "005930", "change_rate": None}, {"date": "2026-10-19", "stock_code": "005930", "change_rate": 0.3}]
    assert run(rows, "2026-10-20", monkeypatch) is False
