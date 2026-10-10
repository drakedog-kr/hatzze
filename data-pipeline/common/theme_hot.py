"""테마 상세 '언급 상위 종목' 줄 — 화면(lib/theme-page.ts buildHotStocks · getThemePage)과 같은 규칙의 파이썬 짝.

테마 요약 스크립트가 이 줄마다 '요즘 도는 얘기' 한 줄을 써 telegram_theme_brief.talk 에 넣는다(마이그레이션 092).
화면은 그 행을 읽어 종목 코드로 붙이기만 하므로 **줄을 고르는 규칙이 두 벌**이다 — 어긋나면 그 줄만 빈다. 그래서
화면이 보이는 열 줄보다 둘을 더 써 둔다(theme briefs 의 TALK_ROWS).

  추이 기간  기준일을 넣은 30일(THEME_TREND_DAYS) — 얇은 날(common/thin_days)을 가를 표본이다.
  최근      그 30일 가운데 얇은 날을 뺀 끝 3일(lib/theme-page.ts recentDays). 기준일 아침(몇 시간치)은 대개 빠진다.
  줄 세우기  최근 언급 합 내림 → 주목도 합 내림 → 코드 오름. 최근 언급이 0 인 종목은 뺀다.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta

from common.supabase_client import load_keyset
from common.thin_days import usable_days

# lib/theme-page.ts THEME_TREND_DAYS · lib/telegram-data.ts KADERA_WINDOW_DAYS 와 같은 값.
TREND_DAYS = 30
RECENT_DAYS = 3


def trend_days(base: str) -> list[str]:
    end = date.fromisoformat(base)
    return [(end - timedelta(days=i)).isoformat() for i in range(TREND_DAYS - 1, -1, -1)]


def recent_days(day_totals: dict[str, float] | None, base: str) -> list[str]:
    """화면의 '최근 3일' — 추이 30일에서 얇은 날을 뺀 끝 3일(오래된 → 최신)."""
    return usable_days(day_totals, trend_days(base))[-RECENT_DAYS:]


def pick_hot(rows: list[dict], key: str, members: dict[str, list[str]], recent: set[str], n: int) -> dict[str, list[str]]:
    """{테마: [코드, …]} — 테마마다 화면과 같은 차례로 n 개. DB 없이 부르는 순수 함수(테스트가 부른다).

    `rows` 는 종목 일별 집계 [{date, <key>, mention_count, weighted_score}] 다. `recent` 밖 날의 행은 무시한다.
    """
    m: dict[str, int] = defaultdict(int)
    w: dict[str, float] = defaultdict(float)
    for r in rows:
        if r["date"] not in recent:
            continue
        m[r[key]] += r.get("mention_count") or 0
        w[r[key]] += float(r.get("weighted_score") or 0)
    out = {}
    for theme, codes in members.items():
        hot = [c for c in dict.fromkeys(codes) if m.get(c, 0) > 0]
        hot.sort(key=lambda c: (-m[c], -w[c], c))
        out[theme] = hot[:n]
    return out


def day_totals(db, table: str, first: str, last: str) -> dict[str, float]:
    """날짜 → 그날 테마 대화 총량(모든 테마의 mention_count 합). lib/theme-page.ts themeDayTotals 와 같다."""
    rows = load_keyset(db, table, "id,date,mention_count", narrow=lambda q: q.gte("date", first).lte("date", last))
    out: dict[str, float] = defaultdict(float)
    for r in rows:
        out[r["date"]] += r.get("mention_count") or 0
    return dict(out)


def theme_hot(db, base: str, members: dict[str, list[str]], stock_table: str, theme_table: str, key: str, n: int) -> tuple[list[str], dict[str, list[str]]]:
    """(최근 3일, {테마: [코드, …]}). 국장은 stock_table=telegram_stock_daily · key=stock_code, 미장은 telegram_us_stock_daily · ticker."""
    days = trend_days(base)
    recent = recent_days(day_totals(db, theme_table, days[0], days[-1]), base)
    if not recent:
        return [], {t: [] for t in members}
    rows = load_keyset(
        db, stock_table, f"id,date,{key},mention_count,weighted_score",
        narrow=lambda q: q.in_("date", recent),
    )
    return recent, pick_hot(rows, key, members, set(recent), n)
