"""코스피 상승 속도(fetch_kospi_high_gap.compute_speed)가 종가 캐시가 1,000행을 넘어도 최신 날짜까지 나오는지.

kospi_close_raw 는 지우는 곳 없이 해마다 약 245행씩 자란다. 예전엔 날짜 창 없이 오름차순 전부를
받아서, 1,000행을 넘는 순간(2029년께) PostgREST 가 에러 없이 가장 오래된 1,000행만 주고
kospi_speed_60d 가 그 날짜에 멈춘다. PostgREST 처럼 1,000행에서 자르는 가짜 표로 박아 둔다.
"""
from datetime import date, timedelta

import fetch_kospi_high_gap as m


class _Q:
    def __init__(self, closes):
        self.closes, self.since = closes, None

    def select(self, *_a, **_k):
        return self

    def eq(self, *_a, **_k):
        return self

    def gte(self, _col, value):
        self.since = value
        return self

    def order(self, *_a, **_k):
        return self

    def execute(self):
        class R:
            pass

        r = R()
        rows = [
            {"date": d, "raw_value": v}
            for d, v in sorted(self.closes.items())
            if self.since is None or d >= self.since
        ]
        r.data = rows[:1000]  # PostgREST 상한 — 에러 없이 자른다
        return r


class _DB:
    def __init__(self, closes):
        self.closes = closes

    def table(self, _name):
        return _Q(self.closes)


def _weekdays(start, n):
    out, d = [], start
    while len(out) < n:
        if d.weekday() < 5:
            out.append(d.isoformat())
        d += timedelta(days=1)
    return out


def test_speed_reaches_newest_close_past_1000_rows(monkeypatch):
    days = _weekdays(date(2025, 7, 1), 1100)
    closes = {d: 3000.0 + i for i, d in enumerate(days)}
    monkeypatch.setattr(m, "today_kst", lambda: date.fromisoformat(days[-1]))
    rows = m.compute_speed(_DB(closes), "id")
    assert rows[-1]["date"] == days[-1]
    # 창을 잘라 읽어도 각 행은 60거래일 앞 종가와 견준 값 그대로다.
    last = len(days) - 1
    assert rows[-1]["from_close"] == closes[days[last - m.SPEED_WINDOW]]
    assert rows[-1]["to_close"] == closes[days[last]]
