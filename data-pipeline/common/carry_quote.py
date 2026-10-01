"""오늘 못 받은 시세·환율을 표에 있던 **바로 전 값**으로 물려받는다(fetch_us_dividends.py · fetch_etf_dividends.py).

두 스크립트는 날마다 행을 통째로 upsert 한다. 그래서 핀허브 시세나 환율을 못 받은 날 그 칸을 None 으로 쓰면
**어제 값까지 지워졌다.**
  · 시세 — '종가 없음'이 붙고 투자금·수익률·비중이 빠졌다. 바스켓도 종가를 요구해 그 종목이 하루 동안 빠졌다(dividend#7).
  · 환율 — 화면은 환율이 없으면 미국 주식·ETF 를 통째로 뺀다(lib/dividend.ts). 조회 자체는 성공이라 실패 안내도
    안 떴다(dividend#6).

물려받은 종가는 **그 종가의 날짜(price_date)를 그대로 둔다** — 오늘 날짜로 바꾸면 낡은 값이 새 값인 척한다.
수익률은 오늘의 1년 배당 ÷ 물려받은 종가로 다시 낸다(배당 쪽은 오늘 받은 값이라서).
"""

from __future__ import annotations

from .supabase_client import load_all

QUOTE_COLUMNS = "close,price_date,usdkrw,usdkrw_date"


def load_last_quotes(db, table: str, key: str) -> dict[str, dict]:
    """표에 있던 종가·환율 — key → 행. 못 읽으면 빈 dict(그날은 물려받을 것 없이 예전처럼 간다)."""
    try:
        rows = load_all(db, table, f"{key},{QUOTE_COLUMNS}", order_by=key)
    except Exception as exc:  # noqa: BLE001
        print(f"[물려받기] {table} 의 어제 시세·환율을 못 읽었습니다 — 오늘 못 받은 칸은 비웁니다: {type(exc).__name__}")
        return {}
    return {r[key]: r for r in rows if r.get(key)}


def last_fx(rows) -> tuple[float, str] | None:
    """표에 있던 원/달러 가운데 날짜가 가장 늦은 것 — (환율, 기준 날짜). 없으면 None."""
    best: tuple[float, str] | None = None
    for r in rows:
        rate, day = r.get("usdkrw"), r.get("usdkrw_date")
        if not rate or not day:
            continue
        if best is None or str(day) > best[1]:
            best = (float(rate), str(day))
    return best


def fx_or_last(fx: tuple[float, str] | None, prev: dict[str, dict]) -> tuple[tuple[float, str] | None, bool]:
    """(쓸 환율, 물려받았나). 오늘 받았으면 그것, 아니면 표에 있던 바로 전 값."""
    if fx:
        return fx, False
    old = last_fx(prev.values())
    return old, old is not None


def carry_close(row: dict, prev: dict | None) -> bool:
    """오늘 종가가 없으면 표에 있던 종가·날짜를 물려받고 수익률을 다시 낸다. 물려받았으면 True.

    row 에는 `close`·`price_date`·`ttm_yield_pct`·`ttm_dps` 가 있어야 한다(없으면 None 으로 본다).
    """
    if row.get("close"):
        return False
    if not prev or not prev.get("close"):
        return False
    close = float(prev["close"])
    if close <= 0:
        return False
    row["close"] = close
    row["price_date"] = prev.get("price_date")
    ttm = row.get("ttm_dps")
    row["ttm_yield_pct"] = round(float(ttm) / close * 100, 3) if ttm else None
    return True
