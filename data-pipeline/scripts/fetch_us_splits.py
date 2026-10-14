"""13F 보유 종목의 액면분할을 받아 us_stock_split 에 저장한다(migration_099).

## 왜

13F 주식 수는 분할을 보정하지 않는다. 2026 Q2 에 카바나(5:1) · 부킹(25:1) · KLA(10:1)가 거의 모든
보유자에서 '늘림'으로 섰다 — 카바나는 /insider '늘린 종목' 5위(늘림 8 · 줄임 1)였는데 분할을 빼면
늘림 5 · 줄임 4 다. 화면(lib/insider-13f.ts splitAdjOf)이 이 표의 분할 배수로 주식 수를 나눠 견준다.

## 어떻게

1. us_manager_holding 전부를 읽어 (티커, 분기)마다 주당 값(13F 금액 ÷ 주식 수 · 운용사 중앙값)을 낸다.
   주당 값은 그 분기말 주가라 운용사가 달라도 같다.
2. 이웃 분기 사이 주당 값이 SUSPECT 배 넘게 벌어진 종목만 후보로 삼는다(2026 Q2 후보 75개 중 실제 분할 셋).
3. 후보마다 yfinance 의 분할 기록에서 (직전 분기말, 이번 분기말] 사이 분할을 받아 넣는다.

⛔ 주당 값 비율만으로 배수를 어림하지 않는다. GTX(주가 2배 · 큰손 절반 매도)를 1:2 역분할로,
   KLA(10:1 + 주가 2배)를 5:1 로 잘못 본다. 비율은 후보를 고르는 데만 쓴다.

13F 와 같은 창(2·5·8·11월 10~25일)에 fetch_us_13f.py 바로 뒤에서 돈다. 이미 받은 분할은 다시 묻지 않는다.

실행:
    cd data-pipeline && source .venv/bin/activate
    python scripts/fetch_us_splits.py --dry-run   # 후보와 받은 분할만 찍는다, DB 안 씀
    python scripts/fetch_us_splits.py
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path
from statistics import median

import yfinance as yf

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common.supabase_client import get_client  # noqa: E402

# 이웃 분기 주당 값이 이 배수보다 벌어지면 분할 후보로 본다. 2:1 분할도 주가가 조금만 올라도 1.8 을 넘는다.
SUSPECT = 1.8
PAGE = 1000
SLEEP = 0.3


def load_holdings(db) -> list[dict]:
    """us_manager_holding 전부. 정렬은 기본키 (cik, ticker, report_date) 전부 — 하나만 걸면 쪽 경계에서 빠지거나 겹친다."""
    out: list[dict] = []
    start = 0
    while True:
        res = (
            db.table("us_manager_holding")
            .select("cik,ticker,report_date,shares,value")
            .order("cik")
            .order("ticker")
            .order("report_date")
            .range(start, start + PAGE - 1)
            .execute()
        )
        out.extend(res.data or [])
        if len(res.data or []) < PAGE:
            return out
        start += PAGE


def candidates(rows: list[dict]) -> list[tuple[str, str, str, float]]:
    """(티커, 직전 분기말, 이번 분기말, 직전 ÷ 이번 주당 값) — 이웃 분기 주당 값이 SUSPECT 배 넘게 벌어진 것."""
    per: dict[tuple[str, str], list[float]] = {}
    for r in rows:
        if r.get("shares") and r.get("value"):
            per.setdefault((r["ticker"], r["report_date"]), []).append(float(r["value"]) / float(r["shares"]))
    by_ticker: dict[str, list[tuple[str, float]]] = {}
    for (t, d), vals in per.items():
        by_ticker.setdefault(t, []).append((d, median(vals)))
    out: list[tuple[str, str, str, float]] = []
    for t, pts in by_ticker.items():
        pts.sort()
        for (d0, p0), (d1, p1) in zip(pts, pts[1:]):
            if p1 <= 0:
                continue
            k = p0 / p1
            if k > SUSPECT or k < 1 / SUSPECT:
                out.append((t, d0, d1, k))
    return sorted(out)


def splits_between(ticker: str, after: str, upto: str) -> list[tuple[str, float]]:
    """yfinance 분할 기록 중 (after, upto] 에 든 것 — (분할일, 새 주식 수 ÷ 옛 주식 수)."""
    s = yf.Ticker(ticker).splits
    out: list[tuple[str, float]] = []
    for ts, ratio in s.items():
        d = ts.date().isoformat()
        if after < d <= upto and float(ratio) > 0:
            out.append((d, float(ratio)))
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="DB 에 안 쓰고 찍기만")
    args = ap.parse_args()

    db = get_client()
    rows = load_holdings(db)
    cands = candidates(rows)
    try:
        known = {(r["ticker"], r["ex_date"]) for r in (db.table("us_stock_split").select("ticker,ex_date").execute().data or [])}
    except Exception as e:  # noqa: BLE001 — 표가 아직 없으면(migration_099 전) dry-run 은 그대로 돈다
        if not args.dry_run:
            raise
        print(f"[dry-run] us_stock_split 을 못 읽었다({e}) — 받아 둔 분할 없이 본다")
        known = set()
    print(f"[13F] 보유 {len(rows):,}행 · 분할 후보 {len(cands)}개(이웃 분기 주당 값 {SUSPECT}배 넘게 벌어짐) · 받아 둔 분할 {len(known)}건")

    found: list[dict] = []
    failed = 0
    for t, d0, d1, k in cands:
        if any(kt == t and d0 < kd <= d1 for kt, kd in known):
            continue
        try:
            got = splits_between(t, d0, d1)
        except Exception as e:  # noqa: BLE001 — 한 종목 실패로 나머지를 버리지 않는다
            failed += 1
            print(f"  ✗ {t} 분할 기록을 못 받았다: {e}")
            continue
        finally:
            time.sleep(SLEEP)
        for d, ratio in got:
            found.append({"ticker": t, "ex_date": d, "ratio": ratio})
            print(f"  ✓ {t} {d} 분할 {ratio:g}배 (주당 값 {d0} → {d1} {k:.2f}배)")

    if failed and failed == len(cands):
        print("후보를 하나도 못 받았다 — yfinance 원천을 볼 것")
        sys.exit(1)
    if args.dry_run:
        print(f"[dry-run] 새 분할 {len(found)}건 (쓰지 않음)")
        return
    if found:
        db.table("us_stock_split").upsert(found, on_conflict="ticker,ex_date").execute()
    print(f"[Supabase] us_stock_split 새 분할 {len(found)}건 upsert")


if __name__ == "__main__":
    main()
