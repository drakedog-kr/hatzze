"""scripts/bestseller_missing_days.py — 베스트셀러 실패를 알림에 셀지 가르는 '그날 행이 빈 날' 수(2026-10-25 #793)."""
import importlib.util
from datetime import date
from pathlib import Path

spec = importlib.util.spec_from_file_location("b", Path(__file__).resolve().parent.parent / "scripts" / "bestseller_missing_days.py")
B = importlib.util.module_from_spec(spec)
spec.loader.exec_module(B)

TODAY = date(2026, 10, 25)


class _Q:
    def __init__(self, rows):
        self.rows, self.f = rows, []

    def select(self, *_):
        return self

    def eq(self, c, v):
        self.f.append(lambda r: r.get(c) == v)
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
    def __init__(self, tables):
        self.tables = tables

    def table(self, name):
        return _Q(list(self.tables.get(name, [])))


def test_today_row_is_zero():
    # 저녁 실행만 실패한 날 — 아침 행이 있다(#793 의 10-25 가 그랬다)
    assert B.missing_days("2026-10-25", TODAY) == 0


def test_counts_today_as_missing():
    assert B.missing_days("2026-10-24", TODAY) == 1
    assert B.missing_days("2026-10-22", TODAY) == 3


def test_no_row_alerts():
    assert B.missing_days(None, TODAY) >= 3


def test_latest_row_is_own_indicator():
    db = _DB({
        "indicators": [{"id": 7, "slug": "bestseller_finance_ratio"}, {"id": 8, "slug": "gold_ratio"}],
        "indicator_values": [
            {"indicator_id": 7, "date": "2026-10-22"},
            {"indicator_id": 7, "date": "2026-10-21"},
            {"indicator_id": 8, "date": "2026-10-25"},
        ],
    })
    assert B.latest_row_date(db) == "2026-10-22"


def test_main_prints_only_the_number(monkeypatch, capsys):
    db = _DB({"indicators": [{"id": 7, "slug": "bestseller_finance_ratio"}], "indicator_values": [{"indicator_id": 7, "date": "2026-10-23"}]})
    monkeypatch.setattr(B, "get_client", lambda: db)
    monkeypatch.setattr(B, "today_kst", lambda: TODAY)
    assert B.main() == 0
    assert capsys.readouterr().out == "2\n"


def test_main_unreadable_prints_nothing(monkeypatch, capsys):
    def boom():
        raise RuntimeError("down")

    monkeypatch.setattr(B, "get_client", boom)
    assert B.main() == 1
    assert capsys.readouterr().out == ""
