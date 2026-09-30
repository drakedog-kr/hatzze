"""common/theme_risers.pick_risers — 테마 급부상 배수를 언급 수가 아니라 테마 대화 가운데 몫으로 견준다.

주말엔 대화가 평일의 1/10 이라 절대 수로 사흘 대 사흘을 견주면 요일이 배수를 정했다(목·금 약 2.5배로 문턱을 넘고
월·화 0.4배). 관심이 늘 같은 종목은 요일과 상관없이 배수 1 이어야 하고, 진짜로 몫이 는 종목만 뜬다.
화면 쪽 짝은 tests/theme-risers.test.ts 의 같은 요일 예제다(평일 10회 · 주말 1회).
"""
from datetime import date, timedelta

from common.theme_risers import RISER_MIN_RATIO, pick_risers, window_days

THEMES_OF = {"A": ["로봇"], "B": ["원전"], "BIG": ["반도체", "AI"]}
NAMES = {"A": "에이", "B": "비", "BIG": "빅"}


def _rows(base: str, per_day) -> list[dict]:
    """per_day(날짜) → {코드: 언급}. 창 여섯 날의 행을 만든다."""
    days, _ = window_days(base)
    out = []
    for d in days:
        for code, m in per_day(date.fromisoformat(d)).items():
            out.append({"date": d, "stock_code": code, "mention_count": m})
    return out


def _weekday_volume(d: date) -> dict:
    """평일 10회 · 주말 1회 — 모두가 같은 비율로 요일을 탄다(관심 변화 없음)."""
    k = 10 if d.weekday() < 5 else 1
    return {"A": k, "B": k, "BIG": 20 * k}


def test_steady_interest_is_not_a_riser_on_any_weekday():
    # 2026-09-28(월) ~ 2026-10-04(일) — 기준일 요일을 한 바퀴 돈다.
    for i in range(7):
        base = (date(2026, 9, 28) + timedelta(days=i)).isoformat()
        rows = [dict(r, mention_count=r["mention_count"] * 5) for r in _rows(base, _weekday_volume)]  # 문턱(5회)을 넘게
        _, recent = window_days(base)
        assert pick_risers(rows, "stock_code", THEMES_OF, NAMES, recent) == [], base


def test_share_increase_is_a_riser_with_share_ratio():
    base = "2026-10-01"  # 수요일 — 최근 9/29~10/1(평일 셋), 앞 9/26~9/28(금·토·일)
    days, recent = window_days(base)

    def vol(d: date) -> dict:
        v = {k: m * 5 for k, m in _weekday_volume(d).items()}
        if d.isoformat() in recent:
            v["A"] *= 3  # A 만 최근 사흘에 몫이 세 배
        return v

    rows = _rows(base, vol)
    got = pick_risers(rows, "stock_code", THEMES_OF, NAMES, recent)
    assert [r["code"] for r in got] == ["A"]
    r = got[0]
    assert r["theme"] == "로봇"
    # 몫 배수는 3 보다 조금 작다 — A 가 늘면서 분모(테마 대화 총량)도 같이 는다. 절대 수 비율(recent/prior)과는 다르다.
    assert 2.5 < r["ratio"] < 3.0
    assert r["ratio"] >= RISER_MIN_RATIO
    assert r["recent"] > r["prior"] * 5  # 절대 수로는 평일/주말 차이까지 섞여 훨씬 크다


def test_new_appearance_and_empty_window():
    base = "2026-10-01"
    _, recent = window_days(base)
    rows = [{"date": d, "stock_code": "A", "mention_count": 6} for d in sorted(recent)]
    rows += [{"date": "2026-09-27", "stock_code": "B", "mention_count": 3}]
    got = pick_risers(rows, "stock_code", THEMES_OF, NAMES, recent)
    assert got[0]["code"] == "A" and got[0]["ratio"] is None  # 앞 사흘 0회 = 새로 등장

    # 앞 사흘에 대화가 아예 없으면(수집 공백) 견줄 수 없다 — 모두 '새로 등장'으로 세우지 않는다.
    only_recent = [{"date": d, "stock_code": "A", "mention_count": 6} for d in sorted(recent)]
    assert pick_risers(only_recent, "stock_code", THEMES_OF, NAMES, recent) == []


def test_window_includes_base_date():
    days, recent = window_days("2026-10-01")
    assert days[-1] == "2026-10-01" and "2026-10-01" in recent
    assert days[0] == "2026-09-26" and len(days) == 6 and len(recent) == 3
