"""미장 테마마다 '3일 전보다 언급이 가장 많이 는 종목' 하나 — 미장 테마 목록(/theme/us)의 '테마별 급부상 종목' 카드.

국장 짝은 common/theme_risers.py 이고 규칙(문턱·줄 세우기)은 그대로다. 다른 점은 둘.
  표      telegram_us_stock_daily(ticker) · 사전은 config/us_stock_themes.py(키가 티커라 이름 대조가 없다)
  창      **기준일을 포함한** 여섯 날. 미장은 창마다 기준일을 넣는다(generate_us_telegram_narratives.window_dates —
          화면 getUsSentiment·getUsThemeRotation 도 같다). 국장은 기준일을 뺀다.
고른 것은 generate_us_theme_briefs.py 가 까닭과 함께 telegram_us_theme_brief.riser 에 넣고, 화면
(lib/us-theme-page.ts listUsThemeRisers)은 그 행을 읽어 줄만 세운다.
"""

from __future__ import annotations

from datetime import date, timedelta
from functools import cmp_to_key

from common.supabase_client import load_all, load_keyset
from common.theme_risers import RISER_MAX, RISER_MIN_MENTIONS, RISER_MIN_RATIO, WINDOW_DAYS, _better
from config.us_stock_themes import US_THEMES


def us_theme_risers(db, base_date: str) -> list[dict]:
    """[{theme, code(티커), name, recent, prior, ratio}] — 화면과 같은 순서."""
    end = date.fromisoformat(base_date)
    days = [(end - timedelta(days=i)).isoformat() for i in range(WINDOW_DAYS * 2 - 1, -1, -1)]
    recent = set(days[-WINDOW_DAYS:])

    name_of = {s["ticker"]: s["name_ko"] for s in load_all(db, "us_stocks", "ticker,name_ko", order_by="ticker")}
    themes_of: dict[str, list[str]] = {}
    for theme, tickers in US_THEMES.items():
        for t in tickers:
            themes_of.setdefault(t, []).append(theme)

    rows = load_keyset(
        db, "telegram_us_stock_daily", "id,date,ticker,mention_count",
        narrow=lambda q: q.in_("date", days),
    )
    agg: dict[str, dict] = {}
    for r in rows:
        t = r["ticker"]
        if t not in themes_of:
            continue
        a = agg.setdefault(t, {"recent": 0, "prior": 0})
        a["recent" if r["date"] in recent else "prior"] += r["mention_count"] or 0

    best: dict[str, dict] = {}
    for t, a in agg.items():
        if a["recent"] < RISER_MIN_MENTIONS:
            continue
        ratio = None if a["prior"] == 0 else a["recent"] / a["prior"]
        if ratio is not None and ratio < RISER_MIN_RATIO:
            continue
        for theme in themes_of[t]:
            cand = {"theme": theme, "code": t, "name": name_of.get(t, t), "recent": a["recent"], "prior": a["prior"], "ratio": ratio}
            cur = best.get(theme)
            if cur is None or _better(cand, cur):
                best[theme] = cand

    out = list(best.values())
    out.sort(key=cmp_to_key(lambda a, b: -1 if _better(a, b) else (1 if _better(b, a) else 0)))
    return out[:RISER_MAX]
