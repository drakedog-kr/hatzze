"""한국예탁결제원 외화증권 결제 통계를 `seohak_settlement_daily` 에 upsert.

서학개미 해부도의 **일별 뼈대**다. 달력 히어로·'평소와의 차이'·'얼마나 오래 들고 있나'가
전부 이 표를 읽는다. 개인과 기관을 가르는 유일한 미국장 자료이기도 하다 — 국내 증권사를
거친 결제만 잡히므로 수탁은행을 직접 쓰는 대형 기관이 빠진다.

## 원천

공공데이터포털 `금융위원회_국제거래외화증권예탁결제정보`.

    https://apis.data.go.kr/1160100/GetDrForeSecuSettInfoService_V2/getMarkForeSecuSettStat_V2

⚠️⚠️ **주소에 `/service/` 가 없고 끝에 `_V2` 가 붙는다.** 다른 금융위 API 는 거의 다
`/1160100/service/<Service>/<op>` 꼴이라 그 관례대로 찍으면 안 나온다. 그때 돌아오는
응답이 `SERVICE_KEY_IS_NOT_REGISTERED_ERROR`(등록되지 않은 서비스키)인데, **키 문제가
아니라 없는 주소를 불렀다는 뜻**이다. 실제로 그 메시지를 키 문제로 읽고 며칠 헤맸다.

## ⚠️⚠️ 날짜 범위 필터가 **조용히 무시된다**

    frcrScrtDpsgStlDt=20260814                     → 24행   ✅ 먹는다
    basDt=20260814                                 → 101,818행 (전체)
    beginFrcrScrtDpsgStlDt=…&endFrcrScrtDpsgStlDt=… → 101,818행 (전체)

뒤의 둘은 **에러도 안 내고 전량을 준다.** 범위로 받는 줄 알고 쓰면 10만 행을 받아 놓고
"많이 왔네" 하고 넘어가게 된다. 그래서 이 스크립트는 **날짜 하나씩** 부른다.

## 며칠을 다시 받나

기본 10일이다. 하루치만 받으면 러너가 실패한 날의 구멍이 영영 남는다(이 표는 1994년부터
7,059 결제일인데 미국 휴장이면 행 자체가 없거나 0 이라, 빠진 날을 나중에 알아채기 어렵다).
열흘이면 연휴를 건너뛰고도 메워지고, 요청은 하루 10회뿐이다.

⭐ 결제일 기준이라 **거래일보다 1영업일 늦다.** 오늘 새벽 실행에서 어제 거래분이 아직
안 올라와 있을 수 있는데, 열흘을 훑으므로 다음 실행이 저절로 만회한다.
"""

from __future__ import annotations

import sys
import time
from datetime import date, timedelta
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common.config import KSD_API_KEY  # noqa: E402
from common.retry import backoff_delay  # noqa: E402
from common.supabase_client import get_client  # noqa: E402

ENDPOINT = (
    "https://apis.data.go.kr/1160100/GetDrForeSecuSettInfoService_V2"
    "/getMarkForeSecuSettStat_V2"
)
REQUEST_TIMEOUT_SEC = 30
MAX_RETRIES = 4
# 하루에 24행쯤이라(시장×종류) 100이면 넉넉하다. 넘치면 아래에서 알아채고 죽는다.
ROWS_PER_DAY = 200
LOOKBACK_DAYS = 10
CHUNK = 500


def fetch_day(day: date) -> list[dict]:
    """그 결제일의 모든 시장·종류 행. 없으면 빈 목록."""
    params = {
        "serviceKey": KSD_API_KEY,
        "resultType": "json",
        "numOfRows": ROWS_PER_DAY,
        "pageNo": 1,
        "frcrScrtDpsgStlDt": day.strftime("%Y%m%d"),
    }
    last: Exception | None = None
    for attempt in range(MAX_RETRIES):
        try:
            res = requests.get(ENDPOINT, params=params, timeout=REQUEST_TIMEOUT_SEC)
            res.raise_for_status()
            body = res.json()["response"]["body"]
            total = int(body.get("totalCount") or 0)
            if total == 0:
                return []
            # ⚠️ 필터가 먹었는지 여기서 확인한다. 무시되면 10만이 온다 — 그걸 그대로
            # 저장하면 표가 통째로 오염된다.
            if total > ROWS_PER_DAY:
                raise RuntimeError(
                    f"{day} 하루에 {total}행 — 날짜 필터가 무시된 것으로 보인다"
                )
            item = body.get("items", {}).get("item") or []
            return item if isinstance(item, list) else [item]
        except Exception as exc:  # noqa: BLE001
            last = exc
            delay = backoff_delay(attempt + 1, base_sec=2, max_sec=15)
            print(f"[예탁원] {day} 조회 실패({exc}) — {delay:.0f}초 뒤 재시도")
            time.sleep(delay)
    raise RuntimeError(f"{day} 조회 실패: {last}")


def to_row(x: dict) -> dict:
    d = x["frcrScrtDpsgStlDt"]
    return {
        "settle_date": f"{d[:4]}-{d[4:6]}-{d[6:]}",
        "market_code": x["scrsMrktNtnlDcd"],
        "market_name": x["scrsMrktNtnlDcdNm"],
        "security_type": x["scrsDcdNm"],
        # ⚠️ 원천이 전부 문자열이고 금액엔 소수점이 있다(811473491.62). 건수만 int.
        "buy_count": int(x["buynCcnt"] or 0),
        "buy_amount": float(x["buynAmt"] or 0),
        "sell_count": int(x["dpsgScrtSlngCcnt"] or 0),
        "sell_amount": float(x["dpsgScrtSlngAmt"] or 0),
    }


def main() -> None:
    if not KSD_API_KEY:
        print("[예탁원] KSD_API_KEY 없음 — 건너뜁니다")
        sys.exit(1)

    today = date.today()
    rows: list[dict] = []
    days_with_data = 0
    for back in range(LOOKBACK_DAYS):
        day = today - timedelta(days=back)
        items = fetch_day(day)
        if not items:
            continue
        days_with_data += 1
        rows.extend(to_row(x) for x in items)

    if not rows:
        raise RuntimeError(f"최근 {LOOKBACK_DAYS}일에 결제 자료가 하나도 없다")

    db = get_client()
    for i in range(0, len(rows), CHUNK):
        db.table("seohak_settlement_daily").upsert(
            rows[i : i + CHUNK],
            on_conflict="settle_date,market_code,security_type",
        ).execute()

    us = [r for r in rows if r["market_code"] == "US" and r["security_type"] == "주식"]
    latest = max(r["settle_date"] for r in rows)
    print(
        f"[Supabase] seohak_settlement_daily upsert 완료: {len(rows)}행 "
        f"· 결제일 {days_with_data}일 · 최신 {latest}"
    )
    for r in sorted(us, key=lambda r: r["settle_date"])[-3:]:
        net = (r["buy_amount"] - r["sell_amount"]) / 1e6
        print(
            f"  {r['settle_date']} 미국 주식  순매수 ${net:,.0f}M "
            f"(매수 {r['buy_count']:,}건 · 매도 {r['sell_count']:,}건)"
        )


if __name__ == "__main__":
    main()
