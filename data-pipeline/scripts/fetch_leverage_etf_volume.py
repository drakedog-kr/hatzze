"""KRX Open API(ETF 시세, etp/etf_bydd_trd)로 KODEX 레버리지(122630) 일별
거래대금을 받아와 Supabase에 upsert.

kospi_dd_trd(지수 시세)와는 별개로 개별 서비스 이용신청이 필요할 수 있다. 401이
나면 KRX 정보데이터시스템에서 'ETF 시세정보' 서비스를 신청/승인받아야 한다.

주의: 이 엔드포인트는 아직 승인받지 못해 실제 응답 필드를 검증하지 못했다.
종목 단위 KRX API는 지수 API(CLSPRC_IDX 등)와 다르게 TDD_CLSPRC(종가),
ACC_TRDVAL(거래대금), ISU_CD(종목코드) 필드명을 쓰는 것으로 알려져 있어
그 관례를 따랐다 — 승인 후 실제 응답을 보고 다르면 필드명만 고치면 된다.

최초 실행 시 1년치를 백필하고, 이후 실행부터는 아직 없는 날짜만 채운다.
"""

from __future__ import annotations

import sys
import time
from datetime import date, timedelta
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common.config import KRX_API_KEY  # noqa: E402
from common.supabase_client import get_client  # noqa: E402

KRX_URL = "http://data-dbg.krx.co.kr/svc/apis/etp/etf_bydd_trd"
BACKFILL_DAYS = 365
REQUEST_DELAY_SEC = 0.05
TRADING_VALUE_KEY = "ACC_TRDVAL"
ISU_CODE_KEY = "ISU_CD"
TARGET_ISU_CODE = "122630"  # KODEX 레버리지
WON_PER_EOK = 100_000_000  # 1억원 = 1e8원

INDICATOR_SLUG = "leverage_etf_volume"
INDICATOR_META = {
    "slug": INDICATOR_SLUG,
    "name": "레버리지 ETF 거래대금",
    "category": "정통",
    "description_beginner": "2배로 베팅하는 레버리지 상품 거래가 급증하면, 개인들이 공격적으로 베팅하고 있다는 신호예요",
    "unit": "억원",
}


def ensure_indicator(client) -> str:
    existing = (
        client.table("indicators").select("id").eq("slug", INDICATOR_SLUG).execute()
    )
    if existing.data:
        return existing.data[0]["id"]

    inserted = client.table("indicators").insert(INDICATOR_META).execute()
    return inserted.data[0]["id"]


def fetch_leverage_etf_trading_value(bas_dd: str) -> float | None:
    resp = requests.get(
        KRX_URL,
        params={"basDd": bas_dd},
        headers={"AUTH_KEY": KRX_API_KEY},
        timeout=10,
    )
    if resp.status_code == 401:
        raise PermissionError(
            "KRX API가 401을 반환했습니다. data.krx.co.kr(정보데이터시스템)에서 "
            "'ETF 시세정보'(etp/etf_bydd_trd) 개별 서비스 API 이용신청 및 승인이 "
            "됐는지 확인하세요 (코스피 지수 시세와는 별도 승인이 필요합니다)."
        )
    resp.raise_for_status()

    records = resp.json().get("OutBlock_1", [])
    record = next(
        (r for r in records if TARGET_ISU_CODE in (r.get(ISU_CODE_KEY) or "")),
        None,
    )
    if record is None:
        return None

    value = record.get(TRADING_VALUE_KEY)
    if value in (None, ""):
        return None  # 휴장일 등으로 값이 비어있는 경우
    won = float(str(value).replace(",", ""))
    return won / WON_PER_EOK


def business_days(start: date, end: date):
    current = start
    while current <= end:
        if current.weekday() < 5:  # 0=Mon ... 4=Fri
            yield current
        current += timedelta(days=1)


def main() -> None:
    client = get_client()
    indicator_id = ensure_indicator(client)
    print(f"[Supabase] indicator '{INDICATOR_SLUG}' id: {indicator_id}")

    today = date.today()
    start = today - timedelta(days=BACKFILL_DAYS)

    existing = (
        client.table("indicator_values")
        .select("date")
        .eq("indicator_id", indicator_id)
        .gte("date", start.isoformat())
        .execute()
    )
    existing_dates = {row["date"] for row in existing.data}

    missing_days = [
        d for d in business_days(start, today) if d.isoformat() not in existing_dates
    ]
    if not missing_days:
        print("[leverage_etf_volume] 백필할 신규 날짜 없음 (이미 최신 상태)")
        return

    print(f"[KRX] 백필 대상 {len(missing_days)}일 조회 시작")
    rows = []
    for d in missing_days:
        value = fetch_leverage_etf_trading_value(d.strftime("%Y%m%d"))
        if value is not None:
            rows.append(
                {"indicator_id": indicator_id, "date": d.isoformat(), "raw_value": value}
            )
        time.sleep(REQUEST_DELAY_SEC)

    if rows:
        client.table("indicator_values").upsert(
            rows, on_conflict="indicator_id,date"
        ).execute()
    skipped = len(missing_days) - len(rows)
    print(f"[KRX] 백필 완료: {len(rows)}건 저장 (휴장일 등 {skipped}건 제외)")


if __name__ == "__main__":
    try:
        main()
    except PermissionError as e:
        print(f"[ERROR] {e}")
        sys.exit(1)
