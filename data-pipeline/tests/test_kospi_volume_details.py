"""거래대금 급증도 details(fetch_kospi_volume.store_rolling_average_details)가 나중 실행에 흔들리지 않는지.

level_pct 는 '그날 직전 250영업일 중 몇 %보다 높았나'다. 예전엔 매 실행 오늘-365일부터만 읽고 그 안의
모든 행을 다시 써서, 행이 늙을수록 창이 짧아지고(2026-02-02: 그날 64.8 → 09-29 재실행 100.0)
창이 60행 밑으로 줄면 level_pct 가 아예 지워졌다. 그 모양을 그대로 박아 둔다.
"""
from datetime import date, timedelta

import fetch_kospi_volume as m


class _Q:
    def __init__(self, db):
        self.db, self.since = db, None

    def select(self, *_a, **_k):
        return self

    def eq(self, *_a, **_k):
        return self

    def gte(self, _col, value):
        self.since = value
        return self

    def upsert(self, rows, **_k):
        self.db.upserted = rows
        return self

    def execute(self):
        class R:
            pass

        r = R()
        r.data = [
            {"date": d, "raw_value": v}
            for d, v in self.db.values.items()
            if self.since is None or d >= self.since
        ]
        return r


class _DB:
    def __init__(self, values):
        self.values, self.upserted = values, []

    def table(self, _name):
        return _Q(self)


def _weekdays(start, end):
    d = start
    while d <= end:
        if d.weekday() < 5:
            yield d
        d += timedelta(days=1)


# 2024-09 부터 2년치. 2025-04~07 에 거래가 두 배로 몰린 구간이 있고, 2026-02-02 는 그 중간값이다.
TARGET = "2026-02-02"
VALUES = {}
for _d in _weekdays(date(2024, 9, 2), date(2026, 9, 29)):
    _k = _d.isoformat()
    VALUES[_k] = 200.0 if "2025-04-01" <= _k <= "2025-07-31" else 100.0
VALUES[TARGET] = 150.0


def _run(monkeypatch, today, values):
    class _Today(date):
        @classmethod
        def today(cls):
            return cls.fromisoformat(today)

    monkeypatch.setattr(m, "date", _Today)
    db = _DB({d: v for d, v in values.items() if d <= today})
    m.store_rolling_average_details(db, "id")
    return {r["date"]: r["details"] for r in db.upserted}


def test_old_row_keeps_its_own_day_level(monkeypatch):
    on_its_day = _run(monkeypatch, TARGET, VALUES)[TARGET]
    later = _run(monkeypatch, "2026-09-29", VALUES)
    assert on_its_day["level_pct"] == 64.8  # 직전 250영업일 중 몰린 구간 88일만 더 높았다
    assert later[TARGET] == on_its_day


def test_rewritten_rows_never_lose_level_pct(monkeypatch):
    out = _run(monkeypatch, "2026-09-29", VALUES)
    assert out
    assert all("level_pct" in det for det in out.values())


def test_rows_older_than_backfill_are_left_alone(monkeypatch):
    out = _run(monkeypatch, "2026-09-29", VALUES)
    oldest = (date(2026, 9, 29) - timedelta(days=m.BACKFILL_DAYS)).isoformat()
    assert min(out) >= oldest
