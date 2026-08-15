"""국내 상장 **미국 ETF** 의 일별 시세·순자산을 seohak_etf_daily 에 upsert.

서학개미가 미국에 가는 길은 둘이다. 직접 사거나(예탁원 = fetch_seohak_settlement.py),
국내에 상장된 미국 ETF 를 사거나. 이 스크립트가 두 번째 길을 맡는다.

원천: KRX Open API `etp/etf_bydd_trd` (헤더 `AUTH_KEY`)

## 이 원천이 여는 것

- **괴리율** — 종가와 순자산가치(NAV)가 같은 행에 있다. 예측이 아니라 산수다.
- **실제로 남은 돈** — 상장좌수의 하루 변화 × NAV. 거래대금과 전혀 다른 값이다.
- **환헤지 여부로 갈린 흐름** — (H) 붙은 것만 자금이 빠지는 날이 있다.

## ⚠️ 미국 판정은 종목명으로 한다. 기초지수명으로 하면 안 된다

2026-08-13 실측: 기초지수명에 미국 지수사업자 이름이 든 **비미국 상품이 43건**이다 —
`S&P GSCI GOLD`(금선물) · `S&P Korea 저변동성` · `S&P ASIA50` · `Dow Jones Target
2030`(TDF). 반대로 종목명 규칙은 `KODEX 미국서학개미`(기초지수는 iSelect) 나
`TIGER 구글밸류체인`(Akros) 처럼 지수명만으로는 못 잡는 것도 제대로 잡는다.

그래서 **US_PATTERN 으로 뽑고 NOT_US_PATTERN 으로 걷어낸다.** 뒤엣것이 없으면
`미국달러선물지수`(환율 상품 11종)와 `대만테크고배당다우존스`가 섞여 들어온다.

## 저장 범위

하루 1,163종목 중 미국 273종목만 담는다. 전량을 담으면 이 화면이 안 쓰는 890행이
매일 쌓인다 — [[project_supabase_free_tier_capacity]] 의 전송량 문제와 같은 형태다.

## net_flow 는 직전 거래일이 있어야 계산된다

`(오늘 좌수 − 직전 거래일 좌수) × 오늘 NAV`. 그래서 **하루씩 순서대로** 받아야 하고,
소급 적재의 첫날은 null 이 된다. 이미 저장된 날은 건너뛰되, 건너뛴 날도 다음 날의
기준으로 써야 하므로 **직전 거래일 좌수는 DB 에서 읽어 온다.**

실행:
    cd data-pipeline && source .venv/bin/activate
    python scripts/fetch_seohak_etf.py --dry-run           # 조회만
    python scripts/fetch_seohak_etf.py                     # 빠진 날 채우기
    python scripts/fetch_seohak_etf.py --from 2025-08-01   # 소급 적재
"""

from __future__ import annotations

import re
import sys
import time
from datetime import date, timedelta
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common.config import KRX_API_KEY  # noqa: E402
from common.retry import backoff_delay  # noqa: E402
from common.supabase_client import get_client  # noqa: E402

TABLE = "seohak_etf_daily"
UPSERT_CHUNK = 500

BASE_URL = "http://data-dbg.krx.co.kr/svc/apis/etp/etf_bydd_trd"
TIMEOUT_SEC = 40
MAX_ATTEMPTS = 4
REQUEST_INTERVAL_SEC = 0.15

# 기본 적재 깊이(달력일). 주간 카드가 5영업일, '평소 괴리율' 비교가 그보다 길다.
DEFAULT_LOOKBACK_DAYS = 400
# 한 실행에서 받을 최대 일수. 상한에 걸리면 **끝 줄에 그렇게 찍고 멈춘다** —
# 예탁원 소급 적재에서 이걸 두 번 놓쳤으므로(2009년·2025년 중반) 끝 줄을 볼 것.
MAX_DAYS_PER_RUN = 500

# 미국 기초자산 판정. 종목명 기준이다(위 머리말 참고).
US_PATTERN = re.compile(
    r"미국|나스닥|NASDAQ|S&P\s*500|필라델피아|다우존스|러셀|FANG|빅테크"
    r"|테슬라|엔비디아|애플|마이크로소프트|메타버스|알파벳|구글|아마존"
    r"|브로드컴|팔란티어|코인베이스"
)
# 위에 걸리지만 미국 시장 노출이 아닌 것들. 환율·원자재·타국 상품이다.
NOT_US_PATTERN = re.compile(
    r"달러선물|달러[^\s]*금리|SOFR|골드|금선물|원유|농산물"
    r"|코리아|한국|코스피|코스닥|아시아|일본|중국|인도|대만|유럽|글로벌"
    r"|TDF\d|채권혼합"
)
HEDGED_PATTERN = re.compile(r"\(H\)|\(합성\s*H\)|합성\s*H")
LEVERAGE_PATTERN = re.compile(r"레버리지|인버스|2X|3X")


def is_us(name: str) -> bool:
    return bool(US_PATTERN.search(name)) and not NOT_US_PATTERN.search(name)


def num(value: str | None) -> float:
    """KRX 는 빈 칸을 '-' 나 '' 로 준다. 0 과 구분할 필요가 없는 자리라 0 으로 접는다."""
    if value is None:
        return 0.0
    text = str(value).replace(",", "").strip()
    if not text or text == "-":
        return 0.0
    try:
        return float(text)
    except ValueError:
        return 0.0


def fetch_day(day: date) -> list[dict] | None:
    """하루치 전 ETF. 휴장일은 빈 목록이고, 조회 실패는 None 이다.

    빈 목록과 실패를 구분하는 이유는 예탁원 페처와 같다 — 실패를 '받았다'로 기록하면
    구멍이 영구히 남는다.
    """
    params = {"basDd": day.strftime("%Y%m%d")}
    headers = {"AUTH_KEY": KRX_API_KEY}
    last_error: Exception | None = None
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            resp = requests.get(BASE_URL, params=params, headers=headers, timeout=TIMEOUT_SEC)
            resp.raise_for_status()
            payload = resp.json()
            rows = payload.get("OutBlock_1")
            if rows is None:
                # 승인 만료·키 오류는 여기로 온다. 재시도해도 안 바뀐다.
                raise SystemExit(f"KRX ETF API 응답에 OutBlock_1 이 없습니다: {str(payload)[:200]}")
            return rows
        except (requests.Timeout, requests.ConnectionError, requests.HTTPError) as exc:
            last_error = exc
            if attempt < MAX_ATTEMPTS:
                time.sleep(backoff_delay(attempt))
    print(f"  ! {day} 조회 실패: {last_error}")
    return None


def to_rows(day: date, items: list[dict], prev_shares: dict[str, float]) -> list[dict]:
    out = []
    for it in items:
        name = (it.get("ISU_NM") or "").strip()
        code = (it.get("ISU_CD") or "").strip()
        if not code or not name or not is_us(name):
            continue
        nav = num(it.get("NAV"))
        close = num(it.get("TDD_CLSPRC"))
        shares = num(it.get("LIST_SHRS"))
        before = prev_shares.get(code)
        out.append(
            {
                "trade_date": day.isoformat(),
                "isu_cd": code,
                "isu_nm": name,
                "close_price": close,
                "nav": nav,
                # 괴리율은 저장할 때 계산한다. 화면이 매번 다시 재면 반올림 자리가 갈린다.
                "premium_pct": round((close - nav) / nav * 100, 4) if nav else None,
                "fluc_rate": num(it.get("FLUC_RT")),
                "trade_value": num(it.get("ACC_TRDVAL")),
                "list_shares": shares,
                "net_asset": num(it.get("INVSTASST_NETASST_TOTAMT")),
                "net_flow": round((shares - before) * nav) if before is not None else None,
                "index_name": (it.get("IDX_IND_NM") or "").strip() or None,
                "is_hedged": bool(HEDGED_PATTERN.search(name)),
                "is_leverage": bool(LEVERAGE_PATTERN.search(name)),
            }
        )
    return out


def stored_dates(db, since: date) -> set[str]:
    """이미 저장된 거래일. 없으면 매 실행이 전체를 다시 받는다."""
    seen: set[str] = set()
    start = 0
    while True:
        page = (
            db.table(TABLE)
            .select("trade_date")
            .gte("trade_date", since.isoformat())
            .order("trade_date")
            .range(start, start + 999)
            .execute()
        )
        rows = page.data or []
        seen.update(r["trade_date"] for r in rows)
        if len(rows) < 1000:
            return seen
        start += 1000


def latest_shares(db, before: date) -> dict[str, float]:
    """`before` 직전에 저장된 종목별 상장좌수.

    건너뛴 날도 다음 날 net_flow 의 기준이 되므로, 메모리에 든 값이 아니라 DB 에서
    읽는다. 이어 받기로 나눠 돌려도 좌수 기준선이 안 끊긴다.
    """
    page = (
        db.table(TABLE)
        .select("trade_date")
        .lt("trade_date", before.isoformat())
        .order("trade_date", desc=True)
        .limit(1)
        .execute()
    )
    rows = page.data or []
    if not rows:
        return {}
    day = rows[0]["trade_date"]
    out: dict[str, float] = {}
    start = 0
    while True:
        page = (
            db.table(TABLE)
            .select("isu_cd, list_shares")
            .eq("trade_date", day)
            .range(start, start + 999)
            .execute()
        )
        chunk = page.data or []
        for r in chunk:
            if r["list_shares"] is not None:
                out[r["isu_cd"]] = float(r["list_shares"])
        if len(chunk) < 1000:
            return out
        start += 1000


def main() -> None:
    if not KRX_API_KEY:
        raise SystemExit("KRX_API_KEY 가 없습니다(.env.local 확인).")

    dry_run = "--dry-run" in sys.argv
    db = None if dry_run else get_client()

    today = date.today()
    if "--from" in sys.argv:
        since = date.fromisoformat(sys.argv[sys.argv.index("--from") + 1])
    else:
        since = today - timedelta(days=DEFAULT_LOOKBACK_DAYS)

    seen = stored_dates(db, since) if db else set()
    prev_shares = latest_shares(db, since) if db else {}

    day = since
    fetched = saved = empty = 0
    # 이미 저장된 날을 건너뛰면 메모리의 좌수 기준선이 낡는다. 그 상태로 다음 날의
    # net_flow 를 계산하면 몇 달치 좌수 변화가 하루 유입으로 찍힌다. 건너뛸 때
    # 깃발을 세워 두고, 실제로 받을 날이 오면 그때 DB 에서 기준선을 다시 읽는다
    # (건너뜀→받음 경계에서만 한 번 도므로 질의가 거의 안 는다).
    shares_stale = False
    while day <= today and fetched < MAX_DAYS_PER_RUN:
        key = day.isoformat()
        if day.weekday() >= 5 or key in seen:
            if key in seen:
                shares_stale = True
            day += timedelta(days=1)
            continue

        items = fetch_day(day)
        fetched += 1
        time.sleep(REQUEST_INTERVAL_SEC)
        if items is None:
            day += timedelta(days=1)
            continue
        if not items:
            empty += 1
            day += timedelta(days=1)
            continue

        if shares_stale and db:
            prev_shares = latest_shares(db, day)
            shares_stale = False

        rows = to_rows(day, items, prev_shares)
        if rows:
            flow = sum(r["net_flow"] or 0 for r in rows)
            print(
                f"  {key}  전체 {len(items):>4} → 미국 {len(rows):>3}종목  "
                f"순유입 {flow/1e8:>+8,.0f}억"
            )
            if not dry_run:
                for i in range(0, len(rows), UPSERT_CHUNK):
                    db.table(TABLE).upsert(
                        rows[i : i + UPSERT_CHUNK], on_conflict="trade_date,isu_cd"
                    ).execute()
            saved += len(rows)
            # 다음 날의 기준선을 오늘 좌수로 갈아 끼운다.
            prev_shares = {r["isu_cd"]: r["list_shares"] for r in rows}
        day += timedelta(days=1)

    tail = " (한 실행 상한에 걸렸습니다 — 다시 돌리면 이어 받습니다)" if fetched >= MAX_DAYS_PER_RUN else ""
    print(f"완료 · 조회 {fetched}일(휴장 {empty}일) · 저장 {saved:,}행{tail}")


if __name__ == "__main__":
    main()
