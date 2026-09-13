"""ETF 분배금을 `etf_dividend` 에 upsert — 미국은 stockanalysis, 국내는 미래에셋 TIGER 분배 내역. 둘 다 매일.

  미국 분배금  stockanalysis `/etf/{티커}/dividend/`(config/etf_dividends.py 의 목록). 못 받으면 설정의 `pays`
  국내 분배금  TIGER '전체 분배 내역'(`distribution/overall/list.ajax`, 서버 렌더) — 지급 건마다 기준일·지급일·금액
  국내 시세    KRX Open API `etp/etf_bydd_trd` — 최신 가용 거래일 하루치(1,168종목)에서 코드로 찾는다
  미국 시세    핀허브 `quote`
  환율         FRED `DEXKOUS`

'1년에 얼마'는 미국·국내 다 같다 — **지난 365일 안에 지급된 건의 합.** 지급 달은 그 건들의 달이라 달력에 든다.

## 국내 분배 내역 페이지

`selectYear`·`selectMonth` 로 한 달치씩 준다(월은 **기준일** 기준). 한 쪽 20건이 상한이라(listCnt 를 올려도
20) 쪽을 넘긴다 — 한 달에 30~90건, 열다섯 달이면 47회 요청(2026-09-13 실측 817건·212종목). 미래 지급 건은
안 실린다(지급 뒤에 붙는다). 2022년까지 거슬러 올라갈 수 있다.
연간 표(`distribution/annual/list.ajax`)를 쓰던 때는 달을 몰라 달력에서 빠졌다 — 그래서 이걸로 바꿨다(2026-09-13).
⚠️ 운용사 사이트를 자동으로 받는 것이다. 회원 약관 13조에 "서비스로 얻은 정보를 복제·제공할 수 없다"가 있다.
   비회원 공개 페이지의 공시 사실(분배금·지급일)을 옮기는 것이고 출처를 화면에 적는다.

실행:
    cd data-pipeline && source .venv/bin/activate
    python scripts/fetch_etf_dividends.py --dry-run
    python scripts/fetch_etf_dividends.py
"""

from __future__ import annotations

import html
import http.client
import json
import re
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
TIGER_LIST = "https://investments.miraeasset.com/tigeretf/ko/distribution/overall/list.ajax"
TIGER_SRC = "https://investments.miraeasset.com/tigeretf/ko/distribution/overall/list.do"
TIGER_UA = {
    "User-Agent": "hatzze/1.0 (+https://hatzze.fun; contact: support@hatzze.fun)",
    "Referer": TIGER_SRC,
    "X-Requested-With": "XMLHttpRequest",
}
# 페이지가 한 번에 주는 최대 건수(listCnt 를 올려도 20). 쪽 사이 간격은 stockanalysis 와 같다.
TIGER_PAGE = 20
TIGER_PAUSE_SEC = 0.7
# 몇 달치를 받나. '지난 365일에 지급된 건'을 기준일 달로 거르므로 13달이면 되지만, 기준일과 지급일이
# 달을 넘기는 건(12/29 기준 → 1/3 지급)이 있어 두 달 여유를 둔다.
TIGER_MONTHS = 15
# 지난달까지의 한 달치가 이보다 적으면 페이지가 바뀐 것이다(실측 최소 18건 · 2022-12). 그때는 국내를 통째로
# 건너뛴다. 이달은 뺀다 — 지급 뒤에야 실리므로 월초엔 0건이 정상이다(09-13 실측 0).
TIGER_MIN_ROWS_PER_MONTH = 5
QUOTE = "https://finnhub.io/api/v1/quote?symbol={t}&token={k}"
ET = ZoneInfo("America/New_York")
MAX_LOOKBACK_DAYS = 10
# 이 수보다 적게 모였으면 표에서 남는 행을 안 지운다(원천이 반쯤 죽은 날 표를 비우지 않게).
MIN_ROWS_TO_PRUNE = 150


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


def tiger_month(year: int, month: int) -> list[dict] | None:
    """한 달치 지급 건(기준일 기준). [{code, name, record, pay, amount}]. 못 받으면 None.

    표의 열은 종목명(코드) · 유형 · 기준일 · 지급일 · 분배금(원) · 과표기준 · 분배율 순이다.
    코드는 `<p class="code">(472150)</p>` 에 있고 새 형식(0177R0)도 그대로 쓴다 — KRX 시세도 같은 코드다.
    """
    out: list[dict] = []
    idx = 1
    while True:
        q = urllib.parse.urlencode({"pageIndex": idx, "firstIndex": (idx - 1) * TIGER_PAGE, "listCnt": TIGER_PAGE, "selectYear": year, "selectMonth": month})
        page = None
        for attempt in (1, 2, 3):
            try:
                with urllib.request.urlopen(urllib.request.Request(f"{TIGER_LIST}?{q}", headers=TIGER_UA), timeout=40) as r:
                    page = r.read().decode("utf-8", "ignore")
                break
            except (OSError, http.client.HTTPException):
                if attempt == 3:
                    return None
                time.sleep(3)
        time.sleep(TIGER_PAUSE_SEC)
        rows = re.findall(r"<tr[^>]*>(.*?)</tr>", page or "", flags=re.S)
        tot = re.search(r'data-tot-cnt="(\d+)"', page or "")
        for tr in rows:
            cells = [html.unescape(re.sub(r"<[^>]+>", "", c)).strip() for c in re.findall(r"<td[^>]*>(.*?)</td>", tr, flags=re.S)]
            m = re.search(r'<p class="title">(.*?)</p>.*?<p class="code">\((.*?)\)</p>', tr, flags=re.S)
            if not m or len(cells) < 7:
                continue
            try:
                amount = float(cells[4].replace(",", ""))
                date.fromisoformat(cells[2]), date.fromisoformat(cells[3])
            except ValueError:
                continue
            out.append({"code": m.group(2).strip(), "name": html.unescape(m.group(1)).strip(), "record": cells[2], "pay": cells[3], "amount": amount})
        if not rows or tot is None or idx * TIGER_PAGE >= int(tot.group(1)):
            break
        idx += 1
    return out


def tiger_history(today: date) -> list[dict] | None:
    """최근 TIGER_MONTHS 달의 지급 건 전부. 한 달이라도 못 받거나 비정상으로 적으면 None — 반쪽 합은 틀린 값이다."""
    out: list[dict] = []
    y, m = today.year, today.month
    for i in range(TIGER_MONTHS):
        rows = tiger_month(y, m)
        if rows is None or (i > 0 and len(rows) < TIGER_MIN_ROWS_PER_MONTH):
            print(f"  ⚠️ TIGER {y}-{m:02d}: {'못 받음' if rows is None else f'{len(rows)}건뿐'} — 국내 ETF 를 건너뜁니다")
            return None
        out.extend(rows)
        m -= 1
        if m == 0:
            y, m = y - 1, 12
    return out


def cadence_of(n: int) -> str | None:
    """지난 1년 지급 건수 → 주기. 열한 번도 월(빠진 달 하나는 상장 첫해거나 지급일이 밀린 것)."""
    if n >= 11:
        return "월"
    if n in (3, 4):
        return "분기"
    if n == 2:
        return "반기"
    if n == 1:
        return "연"
    return None


def main() -> None:
    dry_run = "--dry-run" in sys.argv[1:]
    today = today_kst()
    rows: list[dict] = []

    latest = krx_latest()
    if latest is None:
        print("[ETF] KRX 시세를 못 받았습니다 — 국내 ETF 는 시세 없이 넣습니다")
    tiger = tiger_history(today)
    kr_count = 0
    if tiger is not None:
        by_code: dict[str, list[dict]] = {}
        for r in tiger:
            by_code.setdefault(r["code"], []).append(r)
        no_price = 0
        for code, recs in by_code.items():
            paid, nxt = trailing(recs, today)
            if not paid:
                continue  # 지난 1년 지급이 없으면 지금은 분배가 없는 상품이다
            px = latest[1].get(code) if latest else None
            if latest and px is None:
                no_price += 1
                continue  # 시세 목록에 없으면 상장폐지·코드 변경 — 화면에 못 세운다
            close = float(px["TDD_CLSPRC"]) if px and px.get("TDD_CLSPRC") else None
            ttm = round(sum(p["amount"] for p in paid), 2)
            kr_count += 1
            rows.append({
                "code": code, "market": "KR", "currency": "KRW",
                "name_ko": max(recs, key=lambda p: p["record"])["name"], "name_en": None,  # 이름이 바뀐 ETF 는 최근 건의 이름
                "cadence": cadence_of(len(paid)), "ttm_dps": ttm, "estimated": False,
                "payments": [{"record": p["record"], "pay": p["pay"], "amount": p["amount"]} for p in paid],
                "pay_months": sorted({int(p["pay"][5:7]) for p in paid}),
                "next_pay_date": nxt["pay"] if nxt else None, "next_pay_amount": nxt["amount"] if nxt else None,
                "as_of": today.isoformat(), "source": TIGER_SRC,
                "close": close, "price_date": latest[0] if latest and close else None,
                "ttm_yield_pct": round(ttm / close * 100, 3) if close and ttm else None,
                "computed_for": today.isoformat(),
            })
        print(f"[ETF] TIGER 분배 내역 {len(tiger)}건 · {len(by_code)}종목 중 지난 1년 지급 있음 {kr_count}" + (f" · 시세 없어 뺀 것 {no_price}" if no_price else ""))

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
        nxt = None
        if hist:
            paid, nxt = trailing(hist, today)
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
            "next_pay_date": nxt["pay"] if nxt else None, "next_pay_amount": float(nxt["amount"]) if nxt else None,
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
    for r in [x for x in rows if x["currency"] == "USD"] + [x for x in rows if x["currency"] == "KRW"][:8]:
        unit = "$" if r["currency"] == "USD" else "원"
        print(f"  {r['name_ko']:28s} 1년 {r['ttm_dps']:>9,.4f}{unit} · {r['cadence'] or '?'} {r['pay_months']} · 시세 {r['close']} · 수익률 {r['ttm_yield_pct']}%")
    if dry_run:
        print("[ETF] --dry-run: DB 에 쓰지 않았습니다")
        return
    db = get_client()
    for i in range(0, len(rows), 200):
        db.table(TABLE).upsert(rows[i : i + 200], on_conflict="code").execute()
    print(f"[Supabase] {TABLE} upsert 완료: {len(rows)}행")
    # 이번에 안 나온 행은 지운다 — 지난 1년 지급이 끊긴 국내 ETF, 목록에서 뺀 미국 ETF. 원천 한쪽이 죽은 날은
    # (국내 0 · 미국만) 지우면 안 되므로 시장별로, 그 시장이 이번에 채워졌을 때만.
    for market, got in (("KR", kr_count), ("US", len(rows) - kr_count)):
        if got < (MIN_ROWS_TO_PRUNE if market == "KR" else 10):
            continue
        keep = {r["code"] for r in rows if r["market"] == market}
        stale = [r["code"] for r in db.table(TABLE).select("code").eq("market", market).execute().data if r["code"] not in keep]
        if stale:
            db.table(TABLE).delete().in_("code", stale).execute()
            print(f"[Supabase] {market} 에서 이번에 안 나온 {len(stale)}행 삭제: {stale[:8]}{' …' if len(stale) > 8 else ''}")


if __name__ == "__main__":
    main()
