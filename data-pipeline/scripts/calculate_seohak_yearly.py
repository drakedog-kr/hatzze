"""seohak_settlement_daily 을 연도로 접어 seohak_settlement_yearly 에 저장.

화면의 '해외주식 매수 중 미국 비중' 카드는 32년 전체를 봐야 나오는 값인데, 원자료는
25만 행이다. 매 렌더가 그걸 읽으면 예전에 Egress 를 태운 전량조회가 되므로 여기서
미리 접는다(자세한 근거는 supabase/migration_032 주석).

## 평소엔 올해만 다시 센다

원자료에서 바뀌는 건 올해뿐이다. 지난 해를 매일 다시 세면 25만 행을 매일 읽게 되어
이 스크립트가 막으려던 바로 그 일을 하게 된다. `--all` 은 표를 처음 채울 때와,
소급 적재를 새로 돌린 뒤에만 쓴다.

## 주식만 담는다

원천은 주식·채권을 함께 주는데 이 화면의 어느 카드도 채권을 안 쓴다. 담아 두면
분모가 조용히 달라져서(미국 비중의 분모가 '해외 주식'인지 '해외 증권'인지) 나중에
읽는 사람이 틀린 해석을 하게 된다.

실행:
    cd data-pipeline && source .venv/bin/activate
    python scripts/calculate_seohak_yearly.py --dry-run
    python scripts/calculate_seohak_yearly.py            # 올해만
    python scripts/calculate_seohak_yearly.py --all      # 전 구간(처음 한 번)
"""

from __future__ import annotations

import sys
from collections import defaultdict
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common.supabase_client import get_client  # noqa: E402

SOURCE = "seohak_settlement_daily"
TABLE = "seohak_settlement_yearly"
UPSERT_CHUNK = 500
STOCK = "주식"
US = "US"

# ⚠️ 1996~2002년 일부 기록은 금액이 달러가 아니라 **결제 통화**로 실린 것으로 보인다.
# 1999년 인도네시아가 55건에 $49.07B(1건당 $8.9억)인데 그해 한국 GDP 가 $4,900억이다.
# 엔·루피아로 읽으면 1건당 금액이 정상으로 돌아온다.
#
# 그 시장-연도를 분모에 그대로 두면 미국 비중이 통째로 거짓이 된다(1999년이 0.6% 로
# 찍힌다). 그래서 빼고, **뺐다는 사실을 표에 남긴다** — 조용히 지우면 나중에 읽는
# 사람이 그 해를 정상으로 오해한다.
#
# 문턱 $10M 은 자의적이지 않다. 전 구간 187개 시장-연도의 1건당 매수액 중앙값이
# $39,469 · 90분위 $1.2M 이고, 미국은 역대 최대가 1999년 $1,003,960 이다. 이 문턱을
# 넘는 건 7개뿐이고 전부 1996~2002년 일본·인도네시아다.
MAX_PER_TRADE_USD = 10_000_000


def load_year(db, year: int) -> list[dict]:
    """한 해의 주식 결제 행 전부. 1년이 25행 × 250일 = 6,250행이라 페이지를 이어 받는다."""
    rows: list[dict] = []
    start = 0
    while True:
        page = (
            db.table(SOURCE)
            .select("settle_date, market_code, market_name, buy_amount, buy_count, sell_amount, sell_count")
            .eq("security_type", STOCK)
            .gte("settle_date", f"{year}-01-01")
            .lte("settle_date", f"{year}-12-31")
            # ⚠️ 정렬 키가 유일해야 페이지 경계에서 행이 빠지거나 겹치지 않는다.
            # settle_date 만으로는 하루에 25행이라 유일하지 않다(common/supabase_client.py 주석).
            .order("settle_date")
            .order("market_code")
            .range(start, start + 999)
            .execute()
        )
        got = page.data or []
        rows += got
        if len(got) < 1000:
            return rows
        start += 1000


def fold(year: int, rows: list[dict]) -> dict | None:
    if not rows:
        return None
    by_market: dict[str, dict] = defaultdict(lambda: {"name": "", "buy": 0.0, "count": 0})
    us = {"buy": 0.0, "sell": 0.0, "bc": 0, "sc": 0}
    days = set()
    for r in rows:
        days.add(r["settle_date"])
        code = r["market_code"]
        entry = by_market[code]
        entry["name"] = r.get("market_name") or code
        entry["buy"] += float(r.get("buy_amount") or 0)
        entry["count"] += int(r.get("buy_count") or 0)
        if code == US:
            us["buy"] += float(r.get("buy_amount") or 0)
            us["sell"] += float(r.get("sell_amount") or 0)
            us["bc"] += int(r.get("buy_count") or 0)
            us["sc"] += int(r.get("sell_count") or 0)

    # 1건당 금액이 상식을 벗어나는 시장은 분모에서 뺀다(MAX_PER_TRADE_USD 주석).
    excluded = []
    for code, v in by_market.items():
        if code == US or not v["count"]:
            continue
        if v["buy"] / v["count"] > MAX_PER_TRADE_USD:
            excluded.append(v["name"])
    keep = {
        k: v
        for k, v in by_market.items()
        if k == US or not v["count"] or v["buy"] / v["count"] <= MAX_PER_TRADE_USD
    }

    others = sorted(
        ((v["buy"], k, v["name"]) for k, v in keep.items() if k != US), reverse=True
    )
    second = others[0] if others else None
    return {
        "year": year,
        "us_buy_amount": us["buy"],
        "us_sell_amount": us["sell"],
        "us_buy_count": us["bc"],
        "us_sell_count": us["sc"],
        "all_stock_buy_amount": sum(v["buy"] for v in keep.values()),
        "second_market_code": second[1] if second else None,
        "second_market_name": second[2] if second else None,
        "second_buy_amount": second[0] if second else None,
        "trading_days": len(days),
        "excluded_markets": sorted(excluded) or None,
    }


def known_years(db) -> list[int]:
    """원자료에 있는 연도. 하드코딩하면 소급 적재 범위를 넓혔을 때 조용히 빠진다."""
    lo = db.table(SOURCE).select("settle_date").order("settle_date").limit(1).execute()
    hi = db.table(SOURCE).select("settle_date").order("settle_date", desc=True).limit(1).execute()
    if not lo.data or not hi.data:
        return []
    return list(range(int(lo.data[0]["settle_date"][:4]), int(hi.data[0]["settle_date"][:4]) + 1))


def main() -> None:
    dry_run = "--dry-run" in sys.argv
    db = get_client()

    years = known_years(db) if ("--all" in sys.argv or dry_run) else [date.today().year]
    if not years:
        print("원자료가 비어 있습니다 — fetch_seohak_settlement.py 를 먼저 돌리세요.")
        return

    out = []
    for year in years:
        folded = fold(year, load_year(db, year))
        if not folded:
            continue
        out.append(folded)
        share = (
            folded["us_buy_amount"] / folded["all_stock_buy_amount"] * 100
            if folded["all_stock_buy_amount"]
            else 0
        )
        per = folded["us_buy_amount"] / folded["us_buy_count"] if folded["us_buy_count"] else 0
        print(
            f"  {year}  미국 ${folded['us_buy_amount']/1e9:>7,.1f}B / 전체 "
            f"${folded['all_stock_buy_amount']/1e9:>7,.1f}B = {share:>5.1f}%  "
            f"· {folded['us_buy_count']:>10,}건 · 1건당 ${per:>8,.0f}  "
            f"· 2위 {folded['second_market_name'] or '-'}  ({folded['trading_days']}일)"
            + (f"  ⚠제외 {','.join(folded['excluded_markets'])}" if folded["excluded_markets"] else "")
        )

    if dry_run:
        print(f"[dry-run] {len(out)}개 연도")
        return
    for i in range(0, len(out), UPSERT_CHUNK):
        db.table(TABLE).upsert(out[i : i + UPSERT_CHUNK], on_conflict="year").execute()
    print(f"완료 · {len(out)}개 연도 저장")


if __name__ == "__main__":
    main()
