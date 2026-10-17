"""common/theme_risers.pick_risers — 테마 급부상 배수를 언급 수가 아니라 테마 대화 가운데 몫으로 견준다.

주말엔 대화가 평일의 1/10 이라 절대 수로 사흘 대 사흘을 견주면 요일이 배수를 정했다(목·금 약 2.5배로 문턱을 넘고
월·화 0.4배). 관심이 늘 같은 종목은 요일과 상관없이 배수 1 이어야 하고, 진짜로 몫이 는 종목만 뜬다.
화면 쪽 짝은 tests/theme-risers.test.ts 의 같은 요일 예제다(평일 10회 · 주말 1회).
"""
from datetime import date, timedelta

from common.theme_risers import RISER_MAX, RISER_MIN_RATIO, RISER_SPARE, pick_risers, window_days

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


def test_fewer_mentions_is_not_a_riser_even_if_share_grew():
    # 주말이 낀 최근 사흘 — 몫은 늘었지만 횟수는 줄었다(19회 → 12회, 2026-10-04 미장 슈퍼마이크로). 급부상이 아니다.
    base = "2026-10-04"  # 일요일 — 최근 10/2~10/4(금·토·일), 앞 9/29~10/1(평일 셋)
    _, recent = window_days(base)

    def vol(d: date) -> dict:
        weekend = d.weekday() >= 5
        if d.isoformat() in recent:
            return {"A": 4, "BIG": 6 if weekend else 60}
        return {"A": 6, "BIG": 300}

    got = pick_risers(_rows(base, vol), "stock_code", THEMES_OF, NAMES, recent)
    assert [r["code"] for r in got] == []


def test_limit_keeps_spare_candidates():
    """이유를 쓰는 쪽은 RISER_MAX + RISER_SPARE 까지 받는다 — 이유를 못 쓴 종목 자리를 다음 후보가 채운다(2026-10-13)."""
    base = "2026-10-01"
    _, recent = window_days(base)
    themes_of = {f"S{i}": [f"테마{i}"] for i in range(RISER_MAX + RISER_SPARE + 2)}
    themes_of["BIG"] = ["앞 사흘"]  # 앞 사흘 대화를 까는 종목(최근 사흘 0회라 후보가 아니다)
    names = {c: c for c in themes_of}
    # 모두 앞 사흘 0회 · 최근 사흘 언급(새로 등장). 최근 언급 수가 다 달라 차례가 정해진다. 앞 사흘 대화가 0 이면 카드를 비우므로 다른 종목을 깐다.
    rows = [{"date": d, "stock_code": c, "mention_count": 6 + i} for i, c in enumerate(themes_of) if c != "BIG" for d in sorted(recent)]
    rows += [{"date": "2026-09-27", "stock_code": "BIG", "mention_count": 3}]
    assert len(pick_risers(rows, "stock_code", themes_of, names, recent)) == RISER_MAX
    assert len(pick_risers(rows, "stock_code", themes_of, names, recent, RISER_MAX + RISER_SPARE)) == RISER_MAX + RISER_SPARE



def test_new_entry_no_longer_beats_large_ratio():
    """'새로 등장'이 배수를 늘 이기던 꼴(10-15 2차전지: 에코프로머티 5회 새로 등장 > 엘앤에프 76회 · 앞 2회). 평활 배수로 세운다."""
    themes_of = {"NEW": ["2차전지"], "BIG": ["2차전지"], "BASE": ["2차전지"]}
    names = {"NEW": "새로", "BIG": "크게", "BASE": "바탕"}
    days, recent = window_days("2026-10-15")
    rows = []
    for d in days:
        r = d in recent
        rows += [
            {"date": d, "stock_code": "NEW", "mention_count": 2 if r else 0},
            {"date": d, "stock_code": "BIG", "mention_count": 25 if r else (1 if d == days[0] else 0)},
            {"date": d, "stock_code": "BASE", "mention_count": 40},
        ]
    got = pick_risers(rows, "stock_code", themes_of, names, recent)
    assert [g["code"] for g in got] == ["BIG"]
    assert got[0]["ratio"] is not None and got[0]["score"] > 0
    # 새로 등장 꼬리표(ratio 없음)는 그대로 남는다.
    only_new = [r for r in rows if r["stock_code"] != "BIG"]
    got = pick_risers(only_new, "stock_code", themes_of, names, recent)
    assert got[0]["code"] == "NEW" and got[0]["ratio"] is None
