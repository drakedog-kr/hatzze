"""레버리지·선물 종합 지수의 미결제약정 평균이 날짜마다 '그날까지 1년'인지(fetch_leverage_etf_volume).

예전엔 불러온 1년치 전체 평균 하나를 모든 날짜에 썼다. 지난 행에 그 뒤의 미결제약정이 섞여,
06-01 부터 약정이 두 배가 되자 03-02 행이 그날 58.33 에서 09-29 재실행 50.02 로 바뀌었다.
그 모양을 그대로 박아 둔다. 최신 행(점수·카드가 읽는 값)은 예전과 같아야 한다.
"""
from datetime import date, timedelta

import fetch_leverage_etf_volume as m


class _Q:
    def __init__(self, db):
        self.db, self.id, self.since = db, None, None

    def select(self, *_a, **_k):
        return self

    def eq(self, _col, value):
        self.id = value
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
            for d, v in self.db.series.get(self.id, {}).items()
            if d >= self.since
        ]
        return r


class _DB:
    def __init__(self, series):
        self.series, self.upserted = series, []

    def table(self, _name):
        return _Q(self)


def _weekdays(start, end):
    d = start
    while d <= end:
        if d.weekday() < 5:
            yield d.isoformat()
        d += timedelta(days=1)


# 약정 원본은 2025-07-14 부터 있다(2026-07-13 승인 뒤 1년 백필). 06-01 부터 두 배.
DAYS = list(_weekdays(date(2025, 7, 14), date(2026, 9, 29)))
OI = {d: 200_000.0 if d >= "2026-06-01" else 100_000.0 for d in DAYS}
ETF = {d: 20_000.0 for d in DAYS}


def _run(monkeypatch, today):
    class _Today(date):
        @classmethod
        def today(cls):
            return cls.fromisoformat(today)

    db = _DB({
        m.ETF_RAW_SLUG: {d: v for d, v in ETF.items() if d <= today},
        m.OI_RAW_SLUG: {d: v for d, v in OI.items() if d <= today},
        m.COMPOSITE_SLUG: {},
    })
    monkeypatch.setattr(m, "date", _Today)
    monkeypatch.setattr(m, "get_client", lambda: db)
    monkeypatch.setattr(m, "ensure_indicator", lambda _c, meta: meta["slug"])
    monkeypatch.setattr(m, "backfill_daily", lambda *_a, **_k: None)
    m.main()
    return {r["date"]: r for r in db.upserted}


def test_past_row_does_not_see_later_open_interest(monkeypatch):
    on_its_day = _run(monkeypatch, "2026-03-02")["2026-03-02"]
    later = _run(monkeypatch, "2026-09-29")["2026-03-02"]
    assert on_its_day["details"]["oi_vs_avg"] == 100.0
    assert later["raw_value"] == on_its_day["raw_value"]
    assert later["details"]["oi_vs_avg"] == on_its_day["details"]["oi_vs_avg"]
    assert later["details"]["futures_progress"] == on_its_day["details"]["futures_progress"]


def test_latest_row_matches_one_year_average(monkeypatch):
    rows = _run(monkeypatch, "2026-09-29")
    year = [v for d, v in OI.items() if d >= "2025-09-29"]
    expected = OI["2026-09-29"] / (sum(year) / len(year)) * 100
    assert rows["2026-09-29"]["details"]["oi_vs_avg"] == round(expected, 1)


def test_thin_average_is_not_written(monkeypatch):
    # 약정 원본이 쌓이기 시작한 직후는 평균 표본이 몇 개 안 돼 늘 100% 근처로 나온다.
    rows = _run(monkeypatch, "2025-11-28")
    assert min(rows) > "2025-07-14"
    first = min(rows)
    assert sum(1 for d in OI if d <= first) >= m.OI_AVG_MIN_SAMPLE
