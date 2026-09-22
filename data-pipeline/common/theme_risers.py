"""테마마다 '앞 사흘보다 언급이 가장 많이 는 종목' 하나 — 테마 목록(/theme)의 '갑자기 많이 언급된 종목' 카드.

여기서 고른 것을 generate_theme_briefs.py 가 까닭과 함께 telegram_theme_brief.riser 에 넣고, 화면
(lib/theme-page.ts listThemeRisers)은 그 행을 읽어 줄만 세운다. 처음엔 TS 에도 같은 규칙이 있어 화면이
따로 골랐는데, 두 벌이 갈리면 까닭 없는 줄이 나간다(급부상 한 줄 요약이 겪은 사고 —
generate_surging_oneliners.py 머리 주석). 지금은 **고르는 규칙이 여기 한 벌**이다. 문턱 상수는 화면의
도움말 글에도 적혀 있으니(lib/theme-page.ts RISER_*) 값을 바꾸면 거기도 맞춘다. 규칙:

  창      기준일을 뺀 앞 여섯 날. 뒤 사흘이 '최근', 앞 사흘이 '앞'.
  후보    최근 사흘 언급 ≥ RISER_MIN_MENTIONS. 앞 사흘 0회면 '새로 등장'(배수 없음), 아니면 배수 = 최근/앞.
          배수 < RISER_MIN_RATIO(1.5) 는 '말이 는 종목'이 아니다(요동).
  줄 세우기  새로 등장 > 배수 > 최근 언급 수. 테마마다 하나. 테마 사이도 같은 잣대로. 최대 RISER_MAX(10).
"""

from __future__ import annotations

from datetime import date, timedelta

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


def theme_risers(db, base_date: str) -> list[dict]:
    """[{theme, code, name, recent, prior, ratio}] — 화면과 같은 순서."""
    end = date.fromisoformat(base_date) - timedelta(days=1)
    days = [(end - timedelta(days=i)).isoformat() for i in range(WINDOW_DAYS * 2 - 1, -1, -1)]
    recent = set(days[-WINDOW_DAYS:])

    stocks = load_all(db, "stocks", "code,name", order_by="code")
    code_of = {s["name"]: s["code"] for s in stocks}
    name_of = {s["code"]: s["name"] for s in stocks}
    themes_of: dict[str, list[str]] = {}
    for theme, names in THEMES.items():
        for n in names:
            c = code_of.get(n)
            if c:
                themes_of.setdefault(c, []).append(theme)

    rows = load_keyset(
        db, "telegram_stock_daily", "id,date,stock_code,mention_count",
        narrow=lambda q: q.in_("date", days),
    )
    agg: dict[str, dict] = {}
    for r in rows:
        c = r["stock_code"]
        if c not in themes_of:
            continue
        a = agg.setdefault(c, {"recent": 0, "prior": 0})
        a["recent" if r["date"] in recent else "prior"] += r["mention_count"] or 0

    best: dict[str, dict] = {}
    for c, a in agg.items():
        if a["recent"] < RISER_MIN_MENTIONS:
            continue
        ratio = None if a["prior"] == 0 else a["recent"] / a["prior"]
        if ratio is not None and ratio < RISER_MIN_RATIO:
            continue
        for theme in themes_of[c]:
            cand = {"theme": theme, "code": c, "name": name_of.get(c, c), "recent": a["recent"], "prior": a["prior"], "ratio": ratio}
            cur = best.get(theme)
            if cur is None or _better(cand, cur):
                best[theme] = cand

    out = list(best.values())
    # 정렬: _better 를 비교 함수로.
    from functools import cmp_to_key

    out.sort(key=cmp_to_key(lambda a, b: -1 if _better(a, b) else (1 if _better(b, a) else 0)))
    return out[:RISER_MAX]
