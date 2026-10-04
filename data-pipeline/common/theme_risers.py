"""테마마다 '앞 사흘보다 언급이 가장 많이 는 종목' 하나 — 테마 목록(/theme)의 '갑자기 많이 언급된 종목' 카드.

여기서 고른 것을 generate_theme_briefs.py 가 까닭과 함께 telegram_theme_brief.riser 에 넣고, 화면
(lib/theme-page.ts listThemeRisers)은 그 행을 읽어 줄만 세운다. 처음엔 TS 에도 같은 규칙이 있어 화면이
따로 골랐는데, 두 벌이 갈리면 까닭 없는 줄이 나간다(급부상 한 줄 요약이 겪은 사고 —
generate_surging_oneliners.py 머리 주석). 지금은 **고르는 규칙이 여기 한 벌**이다(pick_risers — 미장
common/us_theme_risers.py 도 이걸 부른다). 문턱 상수는 화면의 도움말 글에도 적혀 있으니(lib/theme-risers.ts
RISER_*) 값을 바꾸면 거기도 맞춘다. 규칙:

  창      기준일을 **포함한** 여섯 날. 뒤 사흘이 '최근', 앞 사흘이 '앞'. 미장과 같다.
  배수    언급 수가 아니라 **테마 대화 총량에서 차지한 몫**으로 견준다.
            몫   = 종목 언급 합 ÷ 같은 날들의 테마 대화 총량
            배수 = 최근 사흘 몫 ÷ 앞 사흘 몫
          테마 대화 총량은 그날 사전 종목의 언급을 **테마마다 센 합**이다 — telegram_theme_daily.mention_count 의
          그날 합과 같고, 화면의 '평소 대비'(lib/theme-page.ts buildHotStocks)도 같은 분모를 쓴다.
  후보    최근 사흘 언급 ≥ RISER_MIN_MENTIONS(이건 절대 수 — 두세 번 스친 작은 종목을 거른다).
          앞 사흘 0회면 '새로 등장'(배수 없음). 배수 < RISER_MIN_RATIO(1.5) 는 '말이 는 종목'이 아니다(요동).
  줄 세우기  새로 등장 > 배수 > 최근 언급 수. 테마마다 하나. 테마 사이도 같은 잣대로. 최대 RISER_MAX(10).

## 왜 몫으로 견주나 (2026-09-30)

예전엔 절대 언급 수를 사흘 대 사흘로 견줬다. 주말엔 대화가 평일의 1/10 로 준다(calculate_theme_daily.py 머리 주석
실측 — 테마 점유율을 비중으로 재는 이유가 이것이다). 그래서 관심이 늘 같은 종목(평일 10회·주말 1회)도 기준일이
목·금이면 최근(월화수)/앞(금토일)이 약 2.5배로 문턱 1.5 를 넘어 '급부상'이 됐고, 월·화면 0.4배라 거의 아무것도
못 떴다. 카드가 관심이 아니라 **요일**을 보여 준 셈이다. 몫으로 견주면 같은 종목의 배수는 요일과 상관없이 1 이다.

진행 중인 기준일(아침 실행 — 오늘이 몇 시간치뿐)도 같은 이치로 흡수된다. 분자·분모가 같이 작아 몫이 흔들리지 않는다.
그래서 국장도 미장처럼 기준일을 넣는다 — 예전엔 기준일을 빼서 같은 화면의 '최근 3일'(지도·흐름·히어로)과
날이 하루 어긋났다(theme#3). 까닭 digest 도 같은 창으로 만든다(generate_theme_briefs.py 의 end=기준일).

화면은 몫 배수 옆에 **언급 수**(최근 N회 · 그 전 M회)를 그대로 찍는다. 둘을 나누면 배수와 다를 수 있다 — 도움말이
"배수는 테마 대화 가운데 몫으로 견준다"고 적는다(app/theme/ThemeIndexView.tsx).
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from functools import cmp_to_key

from common.supabase_client import load_all, load_keyset
from config.stock_themes import THEMES

WINDOW_DAYS = 3
RISER_MIN_MENTIONS = 5
RISER_MIN_RATIO = 1.5
RISER_MAX = 10


def _better(a: dict, b: dict) -> bool:
    if (a["ratio"] is None) != (b["ratio"] is None):
        return a["ratio"] is None
    if a["ratio"] is not None and b["ratio"] is not None and a["ratio"] != b["ratio"]:
        return a["ratio"] > b["ratio"]
    return a["recent"] > b["recent"]


def window_days(base_date: str) -> tuple[list[str], set[str]]:
    """(여섯 날, 그중 최근 사흘). 기준일을 포함한다 — 국장·미장이 같다."""
    end = date.fromisoformat(base_date)
    days = [(end - timedelta(days=i)).isoformat() for i in range(WINDOW_DAYS * 2 - 1, -1, -1)]
    return days, set(days[-WINDOW_DAYS:])


def pick_risers(
    rows: list[dict],
    key: str,
    themes_of: dict[str, list[str]],
    name_of: dict[str, str],
    recent: set[str],
) -> list[dict]:
    """[{theme, code, name, recent, prior, ratio}] — 화면과 같은 순서. DB 없이 부르는 순수 함수(테스트가 부른다).

    `rows` 는 창 안 여섯 날의 종목 일별 집계 [{date, <key>, mention_count}] 다. 사전 밖 종목 행은 무시한다.
    `recent` 에 든 날이 최근 사흘이고 나머지가 앞 사흘이다.
    """
    agg: dict[str, dict] = {}
    # 테마 대화 총량 — 최근·앞 창 각각. 사전 종목의 언급을 테마마다 센다(telegram_theme_daily.mention_count 의 합과 같다).
    total = {"recent": 0.0, "prior": 0.0}
    for r in rows:
        c = r[key]
        th = themes_of.get(c)
        if not th:
            continue
        m = r["mention_count"] or 0
        side = "recent" if r["date"] in recent else "prior"
        total[side] += m * len(th)
        a = agg.setdefault(c, {"recent": 0, "prior": 0})
        a[side] += m

    # ⛔ 한쪽 창의 대화가 아예 없으면(수집 공백) 견줄 수 없다. 그대로 두면 앞 사흘이 통째로 0 이라 모든 종목이
    #    '새로 등장'이 되거나 몫이 0 으로 나뉜다. 그날은 카드를 비운다 — 틀린 급부상보다 빈 카드가 낫다.
    if total["recent"] <= 0 or total["prior"] <= 0:
        return []

    best: dict[str, dict] = {}
    for c, a in agg.items():
        if a["recent"] < RISER_MIN_MENTIONS:
            continue
        # 횟수가 그대로거나 준 종목은 '급부상'이 아니다 — 몫으로만 고르면 주말이 낀 창에서 19회 → 12회로 준 종목이 1.6배로 섰다
        # (2026-10-04 점검, 미장 슈퍼마이크로). 화면 오른쪽 칸이 횟수(최근 · 그 전)를 적으니 횟수도 늘어야 한다.
        if a["recent"] <= a["prior"]:
            continue
        ratio = None if a["prior"] == 0 else (a["recent"] / total["recent"]) / (a["prior"] / total["prior"])
        if ratio is not None and ratio < RISER_MIN_RATIO:
            continue
        for theme in themes_of[c]:
            cand = {"theme": theme, "code": c, "name": name_of.get(c, c), "recent": a["recent"], "prior": a["prior"], "ratio": ratio}
            cur = best.get(theme)
            if cur is None or _better(cand, cur):
                best[theme] = cand

    out = list(best.values())
    out.sort(key=cmp_to_key(lambda a, b: -1 if _better(a, b) else (1 if _better(b, a) else 0)))
    return out[:RISER_MAX]


def theme_risers(db, base_date: str) -> list[dict]:
    """[{theme, code, name, recent, prior, ratio}] — 화면과 같은 순서."""
    days, recent = window_days(base_date)

    stocks = load_all(db, "stocks", "code,name", order_by="code")
    code_of = {s["name"]: s["code"] for s in stocks}
    name_of = {s["code"]: s["name"] for s in stocks}
    themes_of: dict[str, list[str]] = defaultdict(list)
    for theme, names in THEMES.items():
        for n in names:
            c = code_of.get(n)
            if c:
                themes_of[c].append(theme)

    rows = load_keyset(
        db, "telegram_stock_daily", "id,date,stock_code,mention_count",
        narrow=lambda q: q.in_("date", days),
    )
    return pick_risers(rows, "stock_code", dict(themes_of), name_of, recent)
