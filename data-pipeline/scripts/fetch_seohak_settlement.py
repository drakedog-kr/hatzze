"""예탁결제원 국제거래 외화증권 결제 통계를 seohak_settlement_daily 에 upsert.

TIC(월별)·13F(분기별)가 못 하는 **일별 층**을 맡는다. 거래일 대비 T+1 영업일이라
오늘 실행하면 직전 영업일까지 들어온다.

원천: 공공데이터포털 금융위원회_국제거래외화증권예탁결제정보
      GetDrForeSecuSettInfoService_V2 / getMarkForeSecuSettStat_V2

## 함정 셋 (전부 실측으로 밟았다)

1. **경로에 `_V2` 가 한 번 더 붙는다.** 상세페이지의 host 문자열이
   `…/GetDrForeSecuSettInfoService_V2` 라 오퍼레이션을 `getMarkForeSecuSettStat` 로
   부르기 쉬운데, 실제 경로는 `getMarkForeSecuSettStat_V2` 다. 틀리면
   `NO_OPENAPI_SERVICE_ERROR`(코드 12)가 오는데 **키가 틀렸을 때와 구분이 안 돼**
   키 문제로 오진하게 된다.

2. ⚠️⚠️ **날짜 범위 필터가 조용히 무시된다.** `beginFrcrScrtDpsgStlDt`/`end…` 를 넣으면
   에러 없이 **전체 101,676행**을 준다. 필터가 먹은 줄 알고 1994년 자료를 오늘 것으로
   읽게 되는 종류의 실패다. 먹는 건 단일일 `frcrScrtDpsgStlDt=YYYYMMDD` 뿐이라
   하루씩 돈다.

3. **금액은 Stat 쪽에만 있다.** 같은 서비스의 `getForeSecuSettInfo_V2` 는 건수만 준다.

## 왜 미국만 안 담나

"해외주식 매수 중 미국이 몇 %인가"가 이 표에서 가장 센 값인데, 그건 분모가 있어야
나온다. 하루 25행이라 32년을 다 담아도 30만 행 언저리다.

## 트래픽

개발계정이 일 10,000회다. 첫 적재는 8,000영업일이라 **하루에 다 못 채운다** —
`--from` 으로 나눠 돌리거나 며칠에 걸쳐 이어 받는다(이미 저장된 날은 건너뛴다).
매일 실행에서는 새 영업일 한둘만 받으므로 트래픽이 사실상 안 든다.

실행:
    cd data-pipeline && source .venv/bin/activate
    python scripts/fetch_seohak_settlement.py --dry-run          # 조회만
    python scripts/fetch_seohak_settlement.py                    # 최근 구간 채우기
    python scripts/fetch_seohak_settlement.py --from 1994-08-01  # 소급 적재
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

TABLE = "seohak_settlement_daily"
UPSERT_CHUNK = 500

BASE_URL = (
    "https://apis.data.go.kr/1160100/GetDrForeSecuSettInfoService_V2"
    "/getMarkForeSecuSettStat_V2"
)
TIMEOUT_SEC = 40
MAX_ATTEMPTS = 4
REQUEST_INTERVAL_SEC = 0.05

# 이 원천의 첫 결제일. 이보다 앞을 물으면 빈 응답이 온다.
FIRST_DATE = date(1994, 8, 16)
# 한 실행에서 받을 최대 일수. 개발계정 트래픽(일 10,000)에 여유를 두고, 소급 적재가
# 실수로 하루 한도를 다 태우지 않게 막는다.
MAX_DAYS_PER_RUN = 4000
# ⚠️ 상한에 걸리면 **조용히 그 지점에서 멈춘다**(끝 줄에 그렇게 찍기는 한다). 1994년부터
# 한 번에 돌리면 2009년쯤에서 끊기는데, 연도 롤업이 "2009 다음이 2026" 이라는 이상한
# 표를 만들 때까지 눈치채기 어렵다. 소급 적재는 **끝 줄을 확인하고 다시 돌릴 것.**


def fetch_day(day: date) -> list[dict] | None:
    """하루치 전 시장. 자료가 없는 날(휴일 등)은 빈 목록이고, 조회 실패는 None 이다.

    빈 목록과 실패를 구분하는 이유: 빈 날을 '받았다'고 기록해야 다음 실행이 같은 날을
    다시 묻지 않는데, 실패까지 그렇게 다루면 구멍이 영구히 남는다.
    """
    params = {
        "serviceKey": KSD_API_KEY,
        "numOfRows": 200,
        "pageNo": 1,
        "resultType": "json",
        "frcrScrtDpsgStlDt": day.strftime("%Y%m%d"),
    }
    last_error: Exception | None = None
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            resp = requests.get(BASE_URL, params=params, timeout=TIMEOUT_SEC)
            resp.raise_for_status()
            payload = resp.json()
            body = payload.get("response", {}).get("body")
            if body is None:
                # 인증 오류·서비스 경로 오류는 OpenAPI_ServiceResponse 로 온다.
                head = payload.get("OpenAPI_ServiceResponse", {}).get("cmmMsgHeader", {})
                raise RuntimeError(head.get("errMsg") or str(payload)[:200])
            items = body.get("items") or {}
            rows = items.get("item") or []
            return rows if isinstance(rows, list) else [rows]
        except (requests.Timeout, requests.ConnectionError, requests.HTTPError) as exc:
            last_error = exc
            if attempt < MAX_ATTEMPTS:
                time.sleep(backoff_delay(attempt))
        except RuntimeError as exc:
            # 재시도해도 안 바뀌는 종류(키·경로)라 바로 올린다.
            raise SystemExit(f"예탁원 API 오류: {exc}")
    print(f"  ! {day} 조회 실패: {last_error}")
    return None


def to_rows(day: date, items: list[dict]) -> list[dict]:
    out = []
    for it in items:
        code = (it.get("scrsMrktNtnlDcd") or "").strip()
        kind = (it.get("scrsDcdNm") or "").strip()
        if not code or not kind:
            continue
        out.append(
            {
                "settle_date": day.isoformat(),
                "market_code": code,
                "market_name": (it.get("scrsMrktNtnlDcdNm") or code).strip(),
                "security_type": kind,
                "buy_count": int(float(it.get("buynCcnt") or 0)),
                "buy_amount": float(it.get("buynAmt") or 0),
                "sell_count": int(float(it.get("dpsgScrtSlngCcnt") or 0)),
                "sell_amount": float(it.get("dpsgScrtSlngAmt") or 0),
            }
        )
    return out


def stored_dates(db, since: date) -> set[str]:
    """이미 저장된 결제일. 하루씩 도는 원천이라 이게 없으면 매 실행 전체를 다시 받는다."""
    seen: set[str] = set()
    start = 0
    while True:
        page = (
            db.table(TABLE)
            .select("settle_date")
            .gte("settle_date", since.isoformat())
            .order("settle_date")
            .range(start, start + 999)
            .execute()
        )
        rows = page.data or []
        seen.update(r["settle_date"] for r in rows)
        if len(rows) < 1000:
            return seen
        start += 1000


def main() -> None:
    if not KSD_API_KEY:
        raise SystemExit("KSD_API_KEY 가 없습니다(.env.local 확인). Decoding 키를 넣으세요.")

    dry_run = "--dry-run" in sys.argv
    since = FIRST_DATE
    if "--from" in sys.argv:
        since = date.fromisoformat(sys.argv[sys.argv.index("--from") + 1])
    elif not dry_run:
        # 기본은 최근 40일만 훑는다. 매일 실행에서 새 영업일 한둘을 채우는 게 목적이라
        # 32년을 매번 확인할 이유가 없다(소급은 --from 으로 따로 돌린다).
        since = date.today() - timedelta(days=40)

    db = None if dry_run else get_client()
    done = set() if dry_run else stored_dates(db, since)

    day = since
    today = date.today()
    fetched = saved = skipped = 0
    while day <= today and fetched < MAX_DAYS_PER_RUN:
        if day.weekday() >= 5 or day.isoformat() in done:
            day += timedelta(days=1)
            continue

        items = fetch_day(day)
        fetched += 1
        time.sleep(REQUEST_INTERVAL_SEC)
        if items is None:
            day += timedelta(days=1)
            continue
        rows = to_rows(day, items)
        if not rows:
            skipped += 1
            day += timedelta(days=1)
            continue

        if dry_run:
            us = next((r for r in rows if r["market_code"] == "US" and r["security_type"] == "주식"), None)
            if us:
                print(
                    f"  {day} · {len(rows):>2}행 · 미국 주식 매수 {us['buy_count']:>7,}건 "
                    f"${us['buy_amount']/1e9:>5,.2f}B · 매도 {us['sell_count']:>7,}건 ${us['sell_amount']/1e9:>5,.2f}B"
                )
        else:
            for i in range(0, len(rows), UPSERT_CHUNK):
                db.table(TABLE).upsert(
                    rows[i : i + UPSERT_CHUNK],
                    on_conflict="settle_date,market_code,security_type",
                ).execute()
            saved += len(rows)
        day += timedelta(days=1)

    tail = " (한 실행 상한에 걸렸습니다 — 다시 돌리면 이어 받습니다)" if fetched >= MAX_DAYS_PER_RUN else ""
    print(
        f"{'[dry-run] ' if dry_run else ''}완료 · 조회 {fetched}일 · 저장 {saved}행 · 자료 없는 날 {skipped}일{tail}"
    )


if __name__ == "__main__":
    main()
