"""급부상 창의 끝날 판정(common/surging.window_end_from).

저녁 실행 뒤엔 기준일을 넣고, 아침 실행 뒤엔 뺀다. 가르는 것은 가장 늦게 올라온 글의 시각이다.
"""
from common.surging import load_stock_daily, window_end_from

BASE = "2026-09-24"


def test_evening_collection_includes_base():
    # 2026-09-24 저녁 실행이 받아 온 가장 늦은 글은 17:48 KST 였다.
    assert window_end_from(BASE, "2026-09-24T08:48:53+00:00") == BASE


def test_cutoff_is_inclusive_at_17():
    assert window_end_from(BASE, "2026-09-24T08:00:00+00:00") == BASE  # 17:00 KST
    assert window_end_from(BASE, "2026-09-24T07:59:59+00:00") == "2026-09-23"  # 16:59:59 KST


def test_morning_collection_excludes_new_base():
    # 아침 실행 뒤 기준일은 그날이고 글은 06시대까지다 → 전날 끝(예전 규칙과 같다).
    assert window_end_from("2026-09-25", "2026-09-24T21:40:00+00:00") == BASE


def test_stale_base_never_runs_past_base():
    # 수집은 다음 날까지 됐는데 기준일이 안 넘어간 경우(센티먼트 집계 실패) — 기준일에서 멈춘다.
    assert window_end_from(BASE, "2026-09-25T09:00:00+00:00") == BASE


def test_no_messages_falls_back_to_previous_day():
    assert window_end_from(BASE, None) == "2026-09-23"


def test_utc_date_differs_from_kst_date():
    # 23:30 KST 는 UTC 로 같은 날 14:30 이다. KST 로 읽어야 한다.
    assert window_end_from(BASE, "2026-09-24T14:30:00+00:00") == BASE
    # 00:30 KST(다음 날)는 UTC 로 전날 15:30 이다 — 기준일 글은 다 찼다.
    assert window_end_from(BASE, "2026-09-24T15:30:00+00:00") == BASE


class _Query:
    def __init__(self, rows):
        self.rows = rows

    def select(self, *_a, **_k):
        return self

    def gte(self, *_a, **_k):
        return self

    def order(self, *_a, **_k):
        return self

    def range(self, start, end):
        self._page = self.rows[start : end + 1]
        return self

    def execute(self):
        class R:
            pass

        r = R()
        r.data = self._page
        return r


class _DB:
    def __init__(self, rows):
        self.rows = rows

    def table(self, _name):
        return _Query(self.rows)


def _rows(dates):
    return [{"stock_code": "000001", "date": d, "weighted_score": 1.0, "mention_count": 1} for d in dates]


def test_end_date_window_includes_end_and_spans_14_days():
    all_dates = [f"2026-09-{d:02d}" for d in range(5, 26)]
    rows, dates = load_stock_daily(_DB(_rows(all_dates)), end_date=BASE)
    assert dates[-1] == BASE
    assert dates[0] == "2026-09-11"
    assert len(dates) == 14


def test_base_date_window_is_unchanged():
    all_dates = [f"2026-09-{d:02d}" for d in range(5, 26)]
    rows, dates = load_stock_daily(_DB(_rows(all_dates)), base_date=BASE)
    assert dates[-1] == "2026-09-23"
    assert dates[0] == "2026-09-10"
    assert len(dates) == 14
