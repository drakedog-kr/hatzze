"""미장 테마마다 '3일 전보다 언급이 가장 많이 는 종목' 하나 — 미장 테마 목록(/theme/us)의 '테마별 급부상 종목' 카드.

국장 짝은 common/theme_risers.py 이고 **규칙(창·몫 배수·문턱·줄 세우기)은 그쪽 pick_risers 한 벌**을 부른다.
다른 점은 표와 사전뿐이다.
  표      telegram_us_stock_daily(ticker) · 사전은 config/us_stock_themes.py(키가 티커라 이름 대조가 없다)
  창      기준일을 **포함한** 여섯 날(generate_us_telegram_narratives.window_dates — 화면 getUsSentiment·
          getUsThemeRotation 도 같다). 2026-09-30 부터 국장도 같다(theme_risers 머리 주석).
고른 것은 generate_us_theme_briefs.py 가 까닭과 함께 telegram_us_theme_brief.riser 에 넣고, 화면
(lib/us-theme-page.ts listUsThemeRisers)은 그 행을 읽어 줄만 세운다.
"""

from __future__ import annotations

from collections import defaultdict

from common.supabase_client import load_all, load_keyset
from common.theme_risers import pick_risers, window_days
from config.us_stock_themes import US_THEMES


def us_theme_risers(db, base_date: str) -> list[dict]:
    """[{theme, code(티커), name, recent, prior, ratio}] — 화면과 같은 순서."""
    days, recent = window_days(base_date)

    name_of = {s["ticker"]: s["name_ko"] for s in load_all(db, "us_stocks", "ticker,name_ko", order_by="ticker")}
    themes_of: dict[str, list[str]] = defaultdict(list)
    for theme, tickers in US_THEMES.items():
        for t in tickers:
            themes_of[t].append(theme)

    rows = load_keyset(
        db, "telegram_us_stock_daily", "id,date,ticker,mention_count",
        narrow=lambda q: q.in_("date", days),
    )
    return pick_risers(rows, "ticker", dict(themes_of), name_of, recent)
