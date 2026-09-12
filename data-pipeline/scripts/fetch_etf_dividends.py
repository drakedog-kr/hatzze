"""ETF 분배금을 `etf_dividend` 에 upsert — 미국은 stockanalysis, 국내는 미래에셋 TIGER 연간 표. 둘 다 매일.

  미국 분배금  stockanalysis `/etf/{티커}/dividend/`(config/etf_dividends.py 의 목록). 못 받으면 설정의 `pays`
  국내 분배금  TIGER 연간 분배금 표(`distribution/annual/list.ajax`, 서버 렌더) — 232종목 전부
  국내 시세    KRX Open API `etp/etf_bydd_trd` — 최신 가용 거래일 하루치(1,168종목)에서 코드로 찾는다
  미국 시세    핀허브 `quote`
  환율         FRED `DEXKOUS`

'1년에 얼마' 규칙은 설정 파일 머리말에. 미국은 지급 건의 합, 국내는 지난해 합 또는 올해를 늘린 값.

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
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common.config import FINNHUB_API_KEY  # noqa: E402
from common.fred_client import FredUnavailableError, observations  # noqa: E402
from common.krx_client import krx_get  # noqa: E402
from common.stockanalysis import PageChanged, dividend_history, trailing  # noqa: E402
from common.supabase_client import get_client  # noqa: E402
from common.timeutil import today_kst  # noqa: E402
from config.etf_dividends import US_ETFS  # noqa: E402

TABLE = "etf_dividend"
KRX_URL = "http://data-dbg.krx.co.kr/svc/apis/etp/etf_bydd_trd"
TIGER_LIST = "https://investments.miraeasset.com/tigeretf/ko/distribution/annual/list.ajax"
TIGER_SRC = "https://www.tigeretf.com/ko/distribution/annual/list.do"
TIGER_UA = {
    "User-Agent": "hatzze/1.0 (+https://hatzze.fun; contact: support@hatzze.fun)",
    "Referer": TIGER_SRC,
    "X-Requested-With": "XMLHttpRequest",
}
# TIGER 월배당은 월말 기준일·다음 달 초 지급이라, 이달 5일이 지났으면 이달치까지 지급된 것으로 센다.
TIGER_PAY_DAY = 5
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


def tiger_list() -> list[dict]:
    """TIGER 전 종목의 연도별 분배금(원). [{code, name, y_ytd, y_prev}]. 못 받으면 빈 목록.

    표의 열은 종목명(코드·현재가 포함) · 올해 분배금 · 분배율 · 지난해 분배금 · 분배율 · … 순이다.
    '-' 는 그해 분배가 없었다는 뜻(새 상품이거나 무분배).
    """
    import html as _html
    import re
    body = urllib.parse.urlencode({"pageIndex": 1, "firstIndex": 0, "listCnt": 400}).encode()
    for attempt in (1, 2, 3):
        try:
            with urllib.request.urlopen(urllib.request.Request(TIGER_LIST, data=body, headers=TIGER_UA), timeout=40) as r:
                page = r.read().decode("utf-8", "ignore")
            break
        except (OSError, http.client.HTTPException):
            if attempt == 3:
                return []
            time.sleep(3)
    out: list[dict] = []
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", page, flags=re.S):
        cells = [_html.unescape(re.sub(r"<[^>]+>", "", c)).strip() for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", tr, flags=re.S)]
        if len(cells) < 5:
            continue
        m = re.match(r"(.+?)\s*\(([0-9A-Z]{6})\)\s*현재가\(원\)", cells[0].replace("\n", " ").replace("\t", ""))
        if not m:
            continue
        won = lambda s: float(s.replace(",", "")) if s and s != "-" else 0.0  # noqa: E731
        out.append({"code": m.group(2), "name": m.group(1).strip(), "y_ytd": won(cells[1]), "y_prev": won(cells[3])})
    return out


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
    tiger = tiger_list()
    months_paid = today.month if today.day >= TIGER_PAY_DAY else today.month - 1
    kr_count = 0
    for e in tiger:
        annual, est = kr_annual({"y_prev": e["y_prev"], "y_ytd": e["y_ytd"], "ytd_months": months_paid})
        if annual <= 0:
            continue  # 무분배 상품(레버리지·성장형)은 빼도 검색엔 KRX 종목 목록이 없으니 아예 안 뜬다
        px = latest[1].get(e["code"]) if latest else None
        close = float(px["TDD_CLSPRC"]) if px and px.get("TDD_CLSPRC") else None
        kr_count += 1
        rows.append({
            "code": e["code"], "market": "KR", "currency": "KRW",
            "name_ko": e["name"], "name_en": None,
            # 지급 주기는 표에 없다. 달력에는 못 들지만 '월' 이라고 적지도 않는다.
            "cadence": None, "ttm_dps": annual, "estimated": est,
            "payments": [], "pay_months": [],
            "as_of": today.isoformat(), "source": TIGER_SRC,
            "close": close, "price_date": latest[0] if latest and close else None,
            "ttm_yield_pct": round(annual / close * 100, 3) if close and annual else None,
            "computed_for": today.isoformat(),
        })
    print(f"[ETF] TIGER 표 {len(tiger)}종목 중 분배 있음 {kr_count} (올해 지급 {months_paid}달로 셈)")

    fx = usdkrw()
    key = FINNHUB_API_KEY or ""
    sa_fail = 0
    for e in US_ETFS:
        # 지급 건은 stockanalysis 가 먼저다. 못 받으면 설정의 `pays`(있을 때)로.
        pays: list[tuple[str, float]] = []
        as_of = today.isoformat()
        try:
            hist = dividend_history(e["code"], "etf")
        except PageChanged:
            hist = None
            sa_fail += 1
        if hist:
            paid, _ = trailing(hist, today)
            pays = [(p["pay"], float(p["amount"])) for p in paid]
        if not pays:
            pays = [(d, float(a)) for d, a in e.get("pays", [])]
        if not pays:
            print(f"  ⚠️ {e['code']}: 지급 건을 못 받았고 설정에도 없어 건너뜁니다")
            continue
        ttm = round(sum(a for _, a in pays), 4)
        q = quote(e["code"], key) if key else None
        rows.append({
            "code": e["code"], "market": "US", "currency": "USD",
            "name_ko": e["name_ko"], "name_en": e.get("name_en"),
            "cadence": e["cadence"], "ttm_dps": ttm, "estimated": False,
            "payments": [{"pay": d, "amount": a} for d, a in pays],
            "pay_months": sorted({int(d[5:7]) for d, _ in pays}),
            "as_of": as_of, "source": e["source"],
            "close": q[0] if q else None, "price_date": q[1] if q else None,
            "ttm_yield_pct": round(ttm / q[0] * 100, 3) if q and q[0] > 0 and ttm else None,
            "computed_for": today.isoformat(),
        })
    for r in rows:
        r["usdkrw"] = fx[0] if fx else None
        r["usdkrw_date"] = fx[1] if fx else None

    print(f"[ETF] {len(rows)}종목 (국내 {kr_count} · 미국 {len(rows) - kr_count}, stockanalysis 실패 {sa_fail}) · 시세 국내 {latest[0] if latest else '없음'}"
          + (f" · 환율 {fx[0]:,.2f}({fx[1]})" if fx else " · 환율 없음"))
    for r in [x for x in rows if x["currency"] == "USD"] + [x for x in rows if x["currency"] == "KRW"][:6]:
        unit = "$" if r["currency"] == "USD" else "원"
        print(f"  {r['name_ko']:28s} 1년 {r['ttm_dps']:>9,.4f}{unit} · 시세 {r['close']} · 수익률 {r['ttm_yield_pct']}%{' · 추정' if r['estimated'] else ''}")
    if dry_run:
        print("[ETF] --dry-run: DB 에 쓰지 않았습니다")
        return
    db = get_client()
    for i in range(0, len(rows), 200):
        db.table(TABLE).upsert(rows[i : i + 200], on_conflict="code").execute()
    print(f"[Supabase] {TABLE} upsert 완료: {len(rows)}행")


if __name__ == "__main__":
    main()
