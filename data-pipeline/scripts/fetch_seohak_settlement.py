"""한국예탁결제원 외화증권 결제 통계를 `seohak_settlement_daily` 에 upsert.

서학개미 장부의 **일별 뼈대**다. 달력 히어로·'평소와의 차이'·'얼마나 오래 들고 있나'가
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

## ⚠️⚠️ 러너에서 이 호스트가 간헐적으로 안 열린다

2026-08-19 리허설에서 GitHub 러너가 `apis.data.go.kr` 에 **연결 타임아웃 30초를 네 번**
내리 맞고 죽었다. 키 문제가 아니다(`KSD_API_KEY` 는 스텝까지 잘 갔다). TCP 핸드셰이크
자체가 안 됐다.

지역 차단은 아니다. 같은 주소를 미국 IP 에서 부르면 **HTTP 403 이 곧바로 온다**(더미
키라 403 이 맞는 응답이다). 국내에서는 41ms 에 붙는다. 그러니 이 호스트가 바깥을
막는 게 아니라, 러너가 앉은 대역이 그때 막힌 것이다.

그래서 이 스크립트는 **못 받는 것을 정상 상태의 하나로 친다.**

    한 날이 막힘      → 그 날만 건너뛴다. 나머지 아홉 날은 계속 받는다
    연속 세 날 막힘   → 원천이 안 열린 것으로 보고 그만둔다(25분 낭비 방지)
    하나도 못 받음    → 표가 8일 안쪽이면 **성공으로 끝낸다**. 넘으면 실패

⛔ 예전엔 첫날 하나가 막히면 열흘치가 통째로 날아갔다. 하필 맨 먼저 부르는 게
**오늘**인데, 결제일은 T+2 라 오늘은 어차피 빈 날이다. 즉 **가장 안 중요한 날의
실패가 가장 중요한 날들을 데려갔다.**

⛔ 하루 실패마다 알람을 켜지 않는다. 열흘을 되돌아보므로 하루 빠져도 다음 실행이
메운다. 그런 알람은 며칠이면 아무도 안 보게 되고, 그때 진짜 고장이 묻힌다.
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
# (연결, 읽기). 연결은 국내에서 41ms 라 10초도 넘치게 넉넉하다. 여기서 30초를 기다리는
# 상황은 "닿는데 느린" 게 아니라 **패킷이 버려지는** 경우뿐이라 기다릴 값어치가 없다.
REQUEST_TIMEOUT_SEC = (10, 30)
MAX_RETRIES = 4
# 첫 며칠이 내리 막히면 그날은 원천이 안 열린 것이다. 그런데도 열흘을 다 두드리면
# 러너에서 25분을 버린다(30초 × 4회 × 10일). 연속 이만큼 실패하면 그만둔다.
CIRCUIT_BREAK_DAYS = 3
# 표가 이만큼(달력일) 낡아야 알람을 켠다. 결제일은 T+2 이고 최장 연휴가 닷새라
# **정상인데도 이레까지 안 움직일 수 있다.** 하루 실패마다 알람을 켜면 며칠 만에
# 아무도 그 알람을 안 보게 된다.
STALE_ALERT_DAYS = 8
# 하루에 24행쯤이라(시장×종류) 100이면 넉넉하다. 넘치면 아래에서 알아채고 죽는다.
ROWS_PER_DAY = 200
LOOKBACK_DAYS = 10
CHUNK = 500


class Unreachable(RuntimeError):
    """그날 자료를 못 받았다. 남은 날은 계속 두드려 본다."""


class DateFilterIgnored(RuntimeError):
    """날짜 필터가 무시돼 전량이 왔다.

    ⛔ 이것만은 절대 안 삼킨다. 네트워크 사고는 하루 쉬면 그만이지만 이건 저장하는
    순간 표가 오염된다(10만 행이 하루치로 들어앉는다).
    """


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
                raise DateFilterIgnored(
                    f"{day} 하루에 {total}행 — 날짜 필터가 무시된 것으로 보인다"
                )
            item = body.get("items", {}).get("item") or []
            return item if isinstance(item, list) else [item]
        except DateFilterIgnored:
            raise
        except Exception as exc:  # noqa: BLE001
            last = exc
            # ⚠️ 마지막 시도 뒤에는 안 잔다. 예전엔 4번째 실패 뒤에도 15초를 자고
            #    나서 예외를 던져 하루마다 15초씩 그냥 버렸다.
            if attempt + 1 >= MAX_RETRIES:
                break
            delay = backoff_delay(attempt + 1, base_sec=2, max_sec=15)
            print(f"[예탁원] {day} 조회 실패({exc}) — {delay:.0f}초 뒤 재시도")
            time.sleep(delay)
    raise Unreachable(f"{day} 조회 실패: {last}")


def newest_settle_date(db) -> date | None:
    """표에 든 가장 최근 결제일. 하나도 못 받았을 때 알람을 켤지 가르는 잣대다."""
    res = (
        db.table("seohak_settlement_daily")
        .select("settle_date")
        .order("settle_date", desc=True)
        .limit(1)
        .execute()
    )
    return date.fromisoformat(res.data[0]["settle_date"]) if res.data else None


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
    missed: list[date] = []
    streak = 0
    for back in range(LOOKBACK_DAYS):
        day = today - timedelta(days=back)
        try:
            items = fetch_day(day)
        except Unreachable as exc:
            # ⭐⭐ 한 날이 막혔다고 나머지 아홉 날을 데려가지 않는다. 결제일은 T+2 라
            #     정작 필요한 건 **어제·그제 것**인데, 예전 코드는 맨 먼저 부르는
            #     오늘(아직 안 올라온 날)에서 죽어 한 줄도 못 가져왔다. 2026-08-19
            #     리허설에서 실제로 그랬다 — 러너가 오늘 하루에서 타임아웃 나자
            #     열흘치가 통째로 날아갔다.
            missed.append(day)
            streak += 1
            print(f"[예탁원] {day} 못 받음({exc}) — 건너뜁니다")
            if streak >= CIRCUIT_BREAK_DAYS:
                left = LOOKBACK_DAYS - back - 1
                print(
                    f"[예탁원] {streak}일 내리 막혔습니다 — 원천이 안 열린 것으로 보고 "
                    f"남은 {left}일은 두드리지 않습니다"
                )
                break
            continue
        streak = 0
        if not items:
            continue
        days_with_data += 1
        rows.extend(to_row(x) for x in items)

    db = get_client()

    if not rows:
        # ⚠️⚠️ "못 받았다"와 "받았는데 없다"는 다른 사건이다. 예전엔 둘 다 같은 예외로
        #      죽었는데, 앞쪽은 대개 하루짜리 네트워크 사고라 다음 실행이 만회한다
        #      (열흘을 되돌아보니까). 그래서 **표가 실제로 낡았을 때만** 알람을 켠다.
        newest = newest_settle_date(db)
        if newest is None:
            raise RuntimeError("결제 자료를 하나도 못 받았고 표도 비어 있다")
        stale = (today - newest).days
        if stale <= STALE_ALERT_DAYS:
            print(
                f"[예탁원] 새로 받은 게 없습니다(못 받은 날 {len(missed)}일). "
                f"표는 {newest} 까지 있어 {stale}일 됐고 {STALE_ALERT_DAYS}일 안쪽이라 "
                "다음 실행이 만회합니다."
            )
            return
        raise RuntimeError(
            f"결제 자료를 하나도 못 받았고 표가 {newest} 에서 {stale}일 멈춰 있다"
        )
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
    if missed:
        days = ", ".join(str(d) for d in missed)
        print(f"  ⚠️ 못 받은 날 {len(missed)}일: {days} (다음 실행이 다시 두드립니다)")
    for r in sorted(us, key=lambda r: r["settle_date"])[-3:]:
        net = (r["buy_amount"] - r["sell_amount"]) / 1e6
        print(
            f"  {r['settle_date']} 미국 주식  순매수 ${net:,.0f}M "
            f"(매수 {r['buy_count']:,}건 · 매도 {r['sell_count']:,}건)"
        )


if __name__ == "__main__":
    main()
