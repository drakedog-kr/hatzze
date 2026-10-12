"""ETF 달마다 마지막 거래일 하루치를 `etf_price_snapshot` 에 쌓는다 — 1년 가격 변화의 기준점(마이그레이션 096).

ETF 자금 흐름 화면의 두 비교가 쓴다.
    커버드콜   1년 동안 받은 분배금 대 가격 변화 — 열두 달 전 말일 종가가 기준
    레버리지   1년 동안 '지수 × 배수' 대 실제 NAV — 열두 달 전 말일 NAV · 추적 지수 값이 기준

KRX OPEN API ETF 일별매매정보(etp/etf_bydd_trd)는 날짜 하나에 전 ETF 를 준다. 그래서 한 달에 한 번 호출이다 — 일별 표(etf_flow_daily)를
1년치로 늘리면 29만 행인데 쓰는 건 열세 날뿐이라 따로 둔다.

## 어느 날을 받나

지난 SNAPSHOT_MONTHS 달(이번 달 빼고)의 말일부터 거꾸로 거래일을 찾는다. 휴장일에도 행이 오므로(fetch_etf_flows.py 머리말)
거래대금 합계가 0 이면 하루 앞으로 간다(최대 열흘). 표에 이미 있는 달은 건너뛴다 — 지난 달 말일 값은 바뀌지 않는다.

실행:
    cd data-pipeline && source .venv/bin/activate
    python scripts/fetch_etf_snapshots.py
    python scripts/fetch_etf_snapshots.py --dry-run
"""

from __future__ import annotations

import argparse
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common.krx_client import krx_get  # noqa: E402
from common.supabase_client import execute_with_retry, get_client  # noqa: E402
from common.timeutil import today_kst  # noqa: E402

from fetch_etf_flows import KRX_URL, is_holiday, num  # noqa: E402

TABLE = "etf_price_snapshot"
SNAPSHOT_MONTHS = 13
# 말일부터 거꾸로 거래일을 찾는 최대 일수 — 가장 긴 연휴(설·추석 + 주말)도 열흘 안쪽이다.
MAX_BACK_DAYS = 10
CHUNK = 500


def month_ends(today: date, months: int) -> list[date]:
    """이번 달을 뺀 지난 months 달의 말일(오래된 달부터)."""
    out: list[date] = []
    first = today.replace(day=1)
    for _ in range(months):
        last = first - timedelta(days=1)
        out.append(last)
        first = last.replace(day=1)
    return list(reversed(out))


def parse_snapshot(items: list[dict], day: str) -> list[dict]:
    rows = []
    for x in items:
        code = (x.get("ISU_CD") or "").strip()
        if not code:
            continue
        rows.append({
            "code": code,
            "trade_date": day,
            "name": (x.get("ISU_NM") or "").strip() or None,
            "close_price": num(x.get("TDD_CLSPRC")),
            "nav": num(x.get("NAV")),
            "index_value": num(x.get("OBJ_STKPRC_IDX")),
        })
    return rows


def stored_months(db) -> set[str]:
    """표에 이미 있는 달(YYYY-MM). 날짜만 받는다 — 달마다 1,100여 행이라 날짜 하나씩 세면 된다."""
    have: set[str] = set()
    for ym in {d.strftime("%Y-%m") for d in month_ends(today_kst(), SNAPSHOT_MONTHS)}:
        y, m = map(int, ym.split("-"))
        start = date(y, m, 1)
        end = (start + timedelta(days=32)).replace(day=1)
        res = execute_with_retry(
            db.table(TABLE).select("code", count="exact", head=True).gte("trade_date", start.isoformat()).lt("trade_date", end.isoformat())
        )
        if res.count:
            have.add(ym)
    return have


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="DB 에 쓰지 않고 받을 날과 행 수만 찍는다")
    args = ap.parse_args()

    db = get_client()
    try:
        have = stored_months(db)
    except Exception as exc:  # noqa: BLE001 — 표가 없을 때(마이그레이션 전)
        print(f"[오류] {TABLE} 를 못 읽었습니다(마이그레이션 096 을 실행했는지 확인): {exc}")
        if not args.dry_run:
            sys.exit(1)
        have = set()

    targets = [d for d in month_ends(today_kst(), SNAPSHOT_MONTHS) if d.strftime("%Y-%m") not in have]
    print(f"[스냅샷] 지난 {SNAPSHOT_MONTHS}달 중 받을 달 {len(targets)}개")
    for end in targets:
        got = None
        for back in range(MAX_BACK_DAYS):
            day = end - timedelta(days=back)
            if day.weekday() >= 5:
                continue
            res = krx_get(KRX_URL, day.strftime("%Y%m%d"))
            if res is None:
                print(f"[중단] {day} KRX 호출 실패 — 남은 달은 다음 실행이 받습니다")
                return
            if res.status_code == 401:
                raise RuntimeError("KRX 401 — ETF 일별매매정보 승인이 풀렸다(만료일 확인)")
            res.raise_for_status()
            items = res.json().get("OutBlock_1") or []
            if items and not is_holiday(items):
                got = (day, items)
                break
        if got is None:
            print(f"[경고] {end:%Y-%m} 말일 앞 {MAX_BACK_DAYS}일에서 거래일을 못 찾았습니다")
            continue
        day, items = got
        rows = parse_snapshot(items, day.isoformat())
        if args.dry_run:
            print(f"[dry-run] {day} {len(rows)}종목")
            continue
        for i in range(0, len(rows), CHUNK):
            execute_with_retry(db.table(TABLE).upsert(rows[i : i + CHUNK], on_conflict="code,trade_date"))
        print(f"[Supabase] {day} {len(rows)}종목")


if __name__ == "__main__":
    main()
