"""미장 테마 종목 일별 종가 · 거래량 — 야후 일봉을 받아 us_stock_price_daily 에 쌓는다.

미장 테마 화면(`/theme/us` · 테마 상세)의 '3일 평균 거래대금'이 이 표를 테마 사전으로 더한다
(마이그레이션 106 · lib/theme-trade.ts). 국장 짝은 fetch_krx_price_history.py 의 trade_value 다.

## 왜 야후인가

미국 종목은 KRX 일별매매정보처럼 전 종목을 한 번에 주는 무료 공식 원천이 없다. 미리보기가 쓰는 핀허브
무료 시세(/quote)엔 거래량이 없다. 야후 일봉은 종가와 거래량(주식 수)을 준다 — 거래대금은 둘을 곱한 값이다.
⚠️ 야후 약관 §2(e)(i)의 상자(자동 수집 · 상업 이용)다. 지수 종가 · 카더라 미장 시세가 이미 같은 상자다.

## 받는 것 · 쓰는 것

미장 테마 사전(config/us_stock_themes.py)의 티커 전부(200여 개)를 최근 WINDOW_DAYS 일치 일봉으로 받는다.
티커 하나에 요청 하나라 WORKERS 개씩 나란히 부른다(국내에서 20초 안팎).
쓰는 건 **표에 없는 (티커, 날)** 과 티커마다 **최근 REWRITE_SESSIONS 세션**뿐이다 — 날마다 6천 행을 다시 쓰지
않는다(카더라 블록이 전 기록을 매일 다시 써서 느려진 일). 최근 세션을 다시 쓰는 건 야후가 끝난 날의 맨 끝 바를
늦게 채워서다 — 그동안은 meta 값으로 메워 두고(common/yahoo_client.fetch_us_daily_bars) 다음 실행이 일봉 값으로 바꾼다.

⚠️ 표가 없으면(마이그레이션 106 전) 받지 않고 넘어간다 — 실패로 치지 않는다(화면도 거래대금 칸만 비운다).
⚠️ 절반 넘는 티커가 실패하면 실패로 끝낸다(배당 잡 알림이 센다). 몇 개 빠지는 건 다음 실행이 메운다.

실행:
    cd data-pipeline && source .venv/bin/activate
    python scripts/fetch_us_price_history.py
    python scripts/fetch_us_price_history.py --dry-run   # 받을 행 수만 찍는다(DB 에 안 쓴다)
"""

from __future__ import annotations

import argparse
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common.supabase_client import execute_with_retry, get_client, has_column  # noqa: E402
from common.timeutil import today_kst  # noqa: E402
from common.yahoo_client import fetch_us_daily_bars  # noqa: E402
from config.us_stock_themes import US_THEMES  # noqa: E402

TABLE = "us_stock_price_daily"
# 채워 두는 달력 일수 — 국장 짝(fetch_krx_price_history.WINDOW_DAYS)과 같다. 화면은 최근 3세션과 그 1주 앞을 본다.
WINDOW_DAYS = 45
# 이미 있어도 다시 쓰는 티커마다의 최근 세션 수(머리말).
REWRITE_SESSIONS = 3
WORKERS = 6
# 실패한 티커가 이 몫을 넘으면 실패로 끝낸다.
MAX_FAIL_FRAC = 0.5
PAGE = 1000

# 야후가 클래스까지 붙여야 주는 티커 — lib/yahoo-history.ts YAHOO_ALIAS 의 사본이다(한쪽만 알면 화면과 표가 다른 종목을 본다).
YAHOO_ALIAS = {"BRK": "BRK-B"}


def theme_tickers() -> list[str]:
    """미장 테마 사전의 티커(겹치면 한 번). 정렬해 둔다 — 로그와 테스트가 순서에 기대지 않게."""
    return sorted({t for names in US_THEMES.values() for t in names})


def rows_for(ticker: str, bars: list[dict]) -> list[dict]:
    """일봉 → 표의 행. 거래대금은 종가 × 거래량(달러, 소수 둘째 자리)."""
    return [
        {"ticker": ticker, "date": b["date"], "close": b["close"], "volume": b["volume"], "trade_value": round(b["close"] * b["volume"], 2)}
        for b in bars
    ]


def rows_to_write(rows: list[dict], existing: set[tuple[str, str]]) -> list[dict]:
    """표에 없는 (티커, 날) + 티커마다 최근 REWRITE_SESSIONS 세션(머리말)."""
    recent: dict[str, set[str]] = {}
    for r in rows:
        recent.setdefault(r["ticker"], set()).add(r["date"])
    keep = {t: set(sorted(ds)[-REWRITE_SESSIONS:]) for t, ds in recent.items()}
    return [r for r in rows if (r["ticker"], r["date"]) not in existing or r["date"] in keep[r["ticker"]]]


def stored_pairs(db, since: str) -> set[tuple[str, str]]:
    """표에 이미 있는 (티커, 날) — 기간 안만. 정렬 키는 (티커, 날)로 유일하게(페이지 경계에서 행이 빠지지 않게)."""
    out: set[tuple[str, str]] = set()
    start = 0
    while True:
        page = execute_with_retry(
            db.table(TABLE).select("ticker,date").gte("date", since).order("ticker").order("date").range(start, start + PAGE - 1)
        ).data
        for r in page or []:
            out.add((r["ticker"], str(r["date"])))
        if not page or len(page) < PAGE:
            return out
        start += PAGE


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="DB 에 쓰지 않고 받을 행 수만 찍는다")
    args = ap.parse_args()

    db = get_client()
    exists = has_column(db, TABLE, "trade_value")
    if not exists and not args.dry_run:
        print(f"[경고] {TABLE} 가 없습니다(마이그레이션 106 전) — 받지 않고 넘어갑니다")
        return

    tickers = theme_tickers()
    started = time.monotonic()
    with ThreadPoolExecutor(WORKERS) as ex:
        got = dict(zip(tickers, ex.map(lambda t: fetch_us_daily_bars(YAHOO_ALIAS.get(t, t), WINDOW_DAYS), tickers)))
    failed = [t for t, bars in got.items() if bars is None]
    empty = [t for t, bars in got.items() if bars == []]
    rows = [r for t, bars in got.items() if bars for r in rows_for(t, bars)]
    latest = max((r["date"] for r in rows), default=None)
    print(f"[야후] 티커 {len(tickers)}개 · 행 {len(rows):,} · 최근 세션 {latest} · 실패 {len(failed)} · 빈 {len(empty)} ({time.monotonic() - started:.0f}초)")
    if failed:
        print(f"[경고] 못 받은 티커: {', '.join(failed[:20])}{' …' if len(failed) > 20 else ''}")
    if empty:
        print(f"[경고] 바가 없는 티커(상장 폐지 · 심볼 바뀜?): {', '.join(empty[:20])}")

    since = (today_kst() - timedelta(days=WINDOW_DAYS)).isoformat()
    existing = stored_pairs(db, since) if exists else set()
    write = rows_to_write(rows, existing)
    if args.dry_run:
        print(f"[dry-run] 표에 있는 (티커, 날) {len(existing):,} · 쓸 행 {len(write):,}{'' if exists else ' — 표가 없다(마이그레이션 106 전)'}")
    else:
        for i in range(0, len(write), 500):
            execute_with_retry(db.table(TABLE).upsert(write[i : i + 500], on_conflict="ticker,date"))
        print(f"[Supabase] {TABLE} {len(write):,}행 씀(표에 있던 {len(existing):,})")

    if len(failed) > len(tickers) * MAX_FAIL_FRAC:
        print(f"[오류] 티커 {len(failed)}/{len(tickers)} 개를 못 받았습니다 — 야후가 막혔는지 볼 것")
        sys.exit(1)


if __name__ == "__main__":
    main()
