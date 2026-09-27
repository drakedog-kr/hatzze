"""fetch_asia_relative_strength 의 날짜 맞추기 — 한 나라가 쉬어도 코스피가 연 날이면 값이 나오는지.

2026-09 에 일본 연휴(09-21~23)로 네 시계열 교집합이 09-18 에 멈췄다. 그 모양을 그대로 박아 둔다.
"""
from fetch_asia_relative_strength import MAX_ASOF_DAYS, asof_value, build_rows


def test_asof_takes_latest_on_or_before():
    r = {"2026-09-17": 1.0, "2026-09-18": 2.0}
    assert asof_value(r, "2026-09-18") == ("2026-09-18", 2.0)
    assert asof_value(r, "2026-09-23") == ("2026-09-18", 2.0)
    assert asof_value(r, "2026-09-16") is None


def test_asof_gives_up_past_max_gap():
    r = {"2026-01-01": 1.0}
    assert asof_value(r, "2026-01-15") is not None  # 14일
    assert MAX_ASOF_DAYS == 14
    assert asof_value(r, "2026-01-16") is None


def test_japan_holiday_does_not_stop_the_indicator():
    kospi = {"2026-09-18": 1.0, "2026-09-21": 4.0, "2026-09-22": 5.0}
    asia = {
        "^N225": {"2026-09-18": 1.0},  # 09-21~23 휴장
        "^HSI": {"2026-09-18": 2.0, "2026-09-21": 2.0, "2026-09-22": 2.0},
        "^TWII": {"2026-09-18": 3.0, "2026-09-21": 3.0, "2026-09-22": 3.0},
    }
    rows = build_rows(kospi, asia)
    assert [r["date"] for r in rows] == ["2026-09-18", "2026-09-21", "2026-09-22"]
    assert "asof" not in rows[0]["details"]
    assert rows[1]["details"]["asof"] == {"nikkei": "2026-09-18"}
    assert rows[2]["raw_value"] == round(5.0 - (1.0 + 2.0 + 3.0) / 3, 2)


def test_same_day_values_match_old_intersection():
    # 네 나라가 다 연 날은 예전(교집합) 계산과 같은 값이어야 한다.
    kospi = {"2026-09-18": 1.234}
    asia = {"^N225": {"2026-09-18": -1.0}, "^HSI": {"2026-09-18": 0.5}, "^TWII": {"2026-09-18": 2.0}}
    (row,) = build_rows(kospi, asia)
    assert row["raw_value"] == round(1.234 - (-1.0 + 0.5 + 2.0) / 3, 2)
    assert row["details"] == {"kospi": 1.23, "nikkei": -1.0, "hangseng": 0.5, "taiex": 2.0}


def test_missing_market_skips_the_day():
    kospi = {"2026-09-18": 1.0}
    asia = {"^N225": {"2026-09-18": 1.0}, "^HSI": {"2026-09-18": 1.0}, "^TWII": {}}
    assert build_rows(kospi, asia) == []
