"""ETF 분배금 표(config/etf_dividends.py, 손으로 옮긴 값)에 **시세와 환율을 붙여** `etf_dividend` 에 upsert.

분배금 자체는 매일 안 바뀐다(설정 파일이 원천이다). 바뀌는 건 시세와 환율이라 그것만 매일 붙인다.
  국내  KRX Open API `etp/etf_bydd_trd` — 최신 가용 거래일 하루치(1,168종목)에서 코드로 찾는다
  미국  핀허브 `quote`
  환율  FRED `DEXKOUS`

'1년에 얼마' 규칙은 설정 파일 머리말에. 미국은 `pays` 의 합, 국내는 지난해 합 또는 올해를 늘린 값.

실행:
    cd data-pipeline && source .venv/bin/activate
    python scripts/fetch_etf_dividends.py --dry-run
    python scripts/fetch_etf_dividends.py
"""

from __future__ import annotations

import http.client
import json
import sys
import time
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common.config import FINNHUB_API_KEY  # noqa: E402
from common.fred_client import FredUnavailableError, observations  # noqa: E402
from common.krx_client import krx_get  # noqa: E402
from common.supabase_client import get_client  # noqa: E402
from common.timeutil import today_kst  # noqa: E402
from config.etf_dividends import AS_OF, KR_ETFS, US_ETFS  # noqa: E402

TABLE = "etf_dividend"
KRX_URL = "http://data-dbg.krx.co.kr/svc/apis/etp/etf_bydd_trd"
QUOTE = "https://finnhub.io/api/v1/quote?symbol={t}&token={k}"
ET = ZoneInfo("America/New_York")
MAX_LOOKBACK_DAYS = 10
# 올해를 늘린 값이 지난해와 이만큼 갈리면 올해 쪽을 쓴다(설정 파일 머리말).
YTD_DEVIATION = 0.25


def krx_latest() -> tuple[str, dict[str, dict]] | None:
    """최신 가용 거래일의 ETF 전 종목. (거래일, 코드→행)."""
    day = today_kst()
    for _ in range(MAX_LOOKBACK_DAYS):
        bas_dd = day.strftime("%Y%m%d")
        res = krx_get(KRX_URL, bas_dd)
        if res is not None and res.status_code == 200:
            items = res.json().get("OutBlock_1") or []
            # 휴장일에도 행이 온다 — 거래대금 합으로 가른다(fetch_seohak_etf.py).
            if items and sum(float(x.get("ACC_TRDVAL") or 0) for x in items) > 0:
                return f"{bas_dd[:4]}-{bas_dd[4:6]}-{bas_dd[6:]}", {x["ISU_CD"]: x for x in items}
        day -= timedelta(days=1)
    return None


def quote(ticker: str, key: str) -> tuple[float, str] | None:
    for attempt in (1, 2):
        try:
            with urllib.request.urlopen(QUOTE.format(t=ticker, k=key), timeout=15) as r:
                d = json.load(r)
            break
        except (OSError, http.client.HTTPException, json.JSONDecodeError):
            if attempt == 1:
                time.sleep(2)
                continue
            return None
    if not d.get("c") or not d.get("t"):
        return None
    return float(d["c"]), datetime.fromtimestamp(int(d["t"]), timezone.utc).astimezone(ET).strftime("%Y-%m-%d")


def usdkrw() -> tuple[float, str] | None:
    try:
        obs = observations("DEXKOUS", start=(date.today() - timedelta(days=20)).isoformat())
    except FredUnavailableError:
        return None
    return (obs[-1][1], obs[-1][0]) if obs else None


def kr_annual(e: dict) -> tuple[float, bool]:
    """(1년 분배금, 추정인가). 지난해 합이 기본, 올해를 늘린 값이 크게 갈리면 그쪽."""
    prev = float(e.get("y_prev") or 0)
    ytd, months = float(e.get("y_ytd") or 0), int(e.get("ytd_months") or 0)
    run = ytd * 12 / months if months else 0
    if prev <= 0:
        return round(run, 2), True
    if run > 0 and abs(run - prev) / prev > YTD_DEVIATION:
        return round(run, 2), True
    return prev, False


def main() -> None:
    dry_run = "--dry-run" in sys.argv[1:]
    today = today_kst()
    rows: list[dict] = []

    latest = krx_latest()
    if latest is None:
        print("[ETF] KRX 시세를 못 받았습니다 — 국내 ETF 는 시세 없이 넣습니다")
    for e in KR_ETFS:
        annual, est = kr_annual(e)
        px = latest[1].get(e["code"]) if latest else None
        close = float(px["TDD_CLSPRC"]) if px and px.get("TDD_CLSPRC") else None
        rows.append({
            "code": e["code"], "market": "KR", "currency": "KRW",
            "name_ko": e["name_ko"], "name_en": e.get("name_en"),
            "cadence": e["cadence"], "ttm_dps": annual, "estimated": est,
            "payments": [], "pay_months": list(range(1, 13)) if e["cadence"] == "월" else [],
            "as_of": AS_OF, "source": e["source"],
            "close": close, "price_date": latest[0] if latest and close else None,
            "ttm_yield_pct": round(annual / close * 100, 3) if close and annual else None,
            "computed_for": today.isoformat(),
        })

    fx = usdkrw()
    key = FINNHUB_API_KEY or ""
    for e in US_ETFS:
        pays = [(d, float(a)) for d, a in e["pays"]]
        ttm = round(sum(a for _, a in pays), 4)
        q = quote(e["code"], key) if key else None
        rows.append({
            "code": e["code"], "market": "US", "currency": "USD",
            "name_ko": e["name_ko"], "name_en": e.get("name_en"),
            "cadence": e["cadence"], "ttm_dps": ttm, "estimated": False,
            "payments": [{"pay": d, "amount": a} for d, a in pays],
            "pay_months": sorted({int(d[5:7]) for d, _ in pays}),
            "as_of": AS_OF, "source": e["source"],
            "close": q[0] if q else None, "price_date": q[1] if q else None,
            "ttm_yield_pct": round(ttm / q[0] * 100, 3) if q and q[0] > 0 and ttm else None,
            "computed_for": today.isoformat(),
        })
    for r in rows:
        r["usdkrw"] = fx[0] if fx else None
        r["usdkrw_date"] = fx[1] if fx else None

    print(f"[ETF] {len(rows)}종목 (국내 {len(KR_ETFS)} · 미국 {len(US_ETFS)}) · 분배금 기준일 {AS_OF} · 시세 국내 {latest[0] if latest else '없음'}"
          + (f" · 환율 {fx[0]:,.2f}({fx[1]})" if fx else " · 환율 없음"))
    for r in rows:
        unit = "$" if r["currency"] == "USD" else "원"
        print(f"  {r['name_ko']:28s} 1년 {r['ttm_dps']:>9,.4f}{unit} · 시세 {r['close']} · 수익률 {r['ttm_yield_pct']}%{' · 추정' if r['estimated'] else ''}")
    if dry_run:
        print("[ETF] --dry-run: DB 에 쓰지 않았습니다")
        return
    db = get_client()
    db.table(TABLE).upsert(rows, on_conflict="code").execute()
    print(f"[Supabase] {TABLE} upsert 완료: {len(rows)}행")


if __name__ == "__main__":
    main()
