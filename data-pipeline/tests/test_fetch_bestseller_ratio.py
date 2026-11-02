"""scripts/fetch_bestseller_ratio.py — 예스24 주간 베스트로 바꾼 셈(2026-11-02 이슈 #798 · 알라딘 OpenAPI 종료)."""
from datetime import date

import pytest

import fetch_bestseller_ratio as bs


def test_week_number_and_dates():
    # 화면의 주 고르기 목록: 1192 = 10월 26일 ~ 11월 01일 · 1149 = 12월 29일 ~ 01월 04일
    assert bs.week_monday(1192) == date(2026, 10, 26)
    assert bs.week_monday(1149) == date(2025, 12, 29)


@pytest.mark.parametrize(
    "day, week",
    [
        (date(2026, 11, 2), 1192),   # 월요일 — 어제(일) 끝난 주
        (date(2026, 11, 1), 1191),   # 일요일 — 그 주는 아직 안 끝났다
        (date(2026, 10, 29), 1191),
        (date(2026, 1, 1), 1148),    # 해가 바뀌어도 번호는 이어진다
    ],
)
def test_last_finished_week(day, week):
    assert bs.last_finished_week(day) == week


def test_economy_share_counts_only_top_100():
    all_goods = [str(i) for i in range(120)]
    economy = ["3", "40", "99", "100", "119", "x"]  # 100위 밖(100 · 119)은 안 센다
    assert bs.economy_share(all_goods, economy) == (3.0, 3)


def test_economy_share_needs_100_books():
    with pytest.raises(RuntimeError):
        bs.economy_share(["1"] * 50, [])


def test_parse_goods_keeps_first_place():
    html = '<li data-goods-no="9"></li><a data-goods-no="9"></a><li data-goods-no="7"></li>'
    assert bs.parse_goods(html) == ["9", "7"]


def test_week_label_must_match_count():
    ok = '<option value="1192" selected="selected">10월 26일 ~ 11월 01일</option>'
    bs.check_week_label(ok, 1192)
    bs.check_week_label(ok, 1100)  # 목록에 없는 주(지난해)는 넘어간다
    with pytest.raises(RuntimeError):
        bs.check_week_label('<option value="1192">10월 19일 ~ 10월 25일</option>', 1192)


def test_latest_week_falls_back_when_last_week_not_open(monkeypatch):
    seen = []

    def fake_fetch_week(wk):
        seen.append(wk)
        return None if wk == 1192 else (11.0, 11)

    monkeypatch.setattr(bs, "fetch_week", fake_fetch_week)
    monkeypatch.setattr(bs.time, "sleep", lambda *_: None)
    assert bs.latest_week(date(2026, 11, 2)) == (1191, 11.0, 11)
    assert seen == [1192, 1191]


def test_row_carries_week_sunday_as_source_date():
    row = bs.row_for("ind", date(2026, 11, 3), 1192, 10.0)
    assert row["date"] == "2026-11-03"
    assert row["details"] == {"source": "yes24_week", "week_no": 1192, "source_date": 20261101}


def test_since_fills_each_day_with_its_week(monkeypatch):
    # 빈 날을 메우는 길(--since). 지난날은 그날 기준 지난주, 오늘은 실시간과 같은 규칙이다.
    upserts, fetched = [], []

    class FakeClient:
        def table(self, _):
            return self

        def upsert(self, rows, **_):
            upserts.extend(rows)
            return self

        def execute(self):
            return self

    def fake_fetch_week(wk):
        fetched.append(wk)
        return (float(wk - 1180), wk - 1180)

    monkeypatch.setattr(bs, "get_client", lambda: FakeClient())
    monkeypatch.setattr(bs, "ensure_indicator", lambda *_: "ind")
    monkeypatch.setattr(bs, "today_kst", lambda: date(2026, 11, 3))
    monkeypatch.setattr(bs, "fetch_week", fake_fetch_week)
    monkeypatch.setattr(bs.time, "sleep", lambda *_: None)
    bs.main(since="2026-10-31")
    assert [(r["date"], r["details"]["week_no"], r["raw_value"]) for r in upserts] == [
        ("2026-10-31", 1191, 11.0),  # 토 — 그 주(1192)는 아직 안 끝났다
        ("2026-11-01", 1191, 11.0),  # 일 — 같다
        ("2026-11-02", 1192, 12.0),  # 월 — 어제 끝난 주
        ("2026-11-03", 1192, 12.0),  # 오늘
    ]
    assert fetched == [1191, 1192]  # 한 주는 한 번만 받는다
