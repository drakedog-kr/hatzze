"""미국 배당주 요약을 SEC 공시(XBRL)와 핀허브 시세로 만들어 `us_dividend_stock` 에 upsert.

배당으로 살기(/dividend)의 미국 쪽 재료다. 국내(`kr_dividend_stock`)와 같은 모양으로 종목
한 줄씩 — 최근 12개월 1주당 배당(달러)·수익률·회계연도별 합·연속 배당·증가율.

## 원천 셋

  배당   SEC `companyfacts` (data.sec.gov/api/xbrl/companyfacts/CIK##########.json). 미국 정부
         저작물이라 약관 제약이 없고 키도 없다. User-Agent 만 요구한다(없으면 403).
         초당 10회 한도라 0.15초씩 쉰다.
  시세   핀허브 `quote`(FINNHUB_API_KEY). fetch_kr_preview.py 와 같은 창(분당 60회).
  환율   FRED `DEXKOUS`(원/달러, 뉴욕 정오). 화면이 달러를 원으로 옮길 때 쓴다. 1~2영업일 늦다.

## ⚠️⚠️ XBRL 배당 태그는 회사마다 다르게 쓴다 — 2026-09-12 에 12곳을 열어 본 결과

태그가 둘이다: `CommonStockDividendsPerShareDeclared`(선언) · `CommonStockDividendsPerShareCashPaid`
(지급). 어느 쪽을 쓰는지가 회사마다 다르고 한 회사 안에서도 바뀐다(코카콜라는 선언 태그가
2018년에 끊기고 지급 태그만 이어진다). 그래서 **더 최근까지 이어지는 태그**를 주로 삼고, 거기 없는 기간만 다른 태그로 채운다
(P&G 는 선언 태그가 2022년부터, 지급 태그가 그 전 15년을 갖고 있다).

기간 모양도 제각각이다. 같은 값이 10-Q 와 10-K 에 거듭 실리고(같은 start·end 가 여러 번),
분기 행 대신 **누적 행**(1~6월, 1~9월)만 주는 회사가 있고(엑슨모빌은 분기와 반기만),
리얼티인컴은 **월별** 행을 준다. 그래서 이렇게 푼다.

  1. (start, end) 가 같은 행은 가장 늦게 제출한 것 하나만 남긴다.
  2. 기간 길이로 가른다 — 달(25~35일)·분기(80~100)·반기(170~190)·9개월(255~285)·연(350~380).
  3. 분기가 빈 자리는 누적 행의 차로 채운다(2분기 = 반기 − 1분기, 3분기 = 9개월 − 반기,
     4분기 = 연 − 9개월). 같은 회계연도 시작일을 가진 행끼리만 뺀다.
  4. 최근 12개월 합(ttm):  월별 행이 있으면 **마지막 열두 달**의 합(`monthly`) →
     아니면 **마지막 네 분기**의 합(`quarters`). 둘 다 마지막 행이 200일 안쪽일 때만 —
     공시가 분기 뒤 한 달 반에 나오므로 '오늘 기준 365일 창'으로 자르면 늘 두세 달이 빈다 →
     분기가 하나라도 있으면 마지막 분기 × 4(`annualized`, 화면이 '추정'이라 적는다) →
     연 행뿐이면 그 값(`fy`, 400일 안쪽일 때만) → 없으면 0.
  5. 회계연도별 합(annual)은 연 행(10-K)에서. 6월 결산(P&G·마이크로소프트)·9월 결산(애플)은
     끝나는 해로 적는다.

⚠️ **지급 달은 못 낸다.** XBRL 은 기간만 있고 지급일이 없다. 화면 달력에서 미국 종목은 뺀다.
⚠️ 외국 회사(20-F, ifrs-full 태그)와 ETF 는 이 태그가 없어 0 으로 나온다. 목록에 안 넣는다
   (config/us_dividend_universe.py 머리말).

실행:
    cd data-pipeline && source .venv/bin/activate
    python scripts/fetch_us_dividends.py --dry-run --only KO,O,XOM   # 몇 종목만 계산·미리보기
    python scripts/fetch_us_dividends.py
"""

from __future__ import annotations

import argparse
import http.client
import json
import sys
import time
import urllib.request
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common.config import FINNHUB_API_KEY  # noqa: E402
from common.fred_client import FredUnavailableError, observations  # noqa: E402
from common.supabase_client import get_client, load_all  # noqa: E402
from common.timeutil import today_kst  # noqa: E402
from config.us_dividend_universe import EXTRA_US_DIVIDEND  # noqa: E402

TABLE = "us_dividend_stock"
SEC_UA = "hatzze.fun dividend page (hatzze@proton.me)"
SEC_TICKERS = "https://www.sec.gov/files/company_tickers.json"
SEC_FACTS = "https://data.sec.gov/api/xbrl/companyfacts/CIK{cik:010d}.json"
SEC_PAUSE_SEC = 0.15
TAGS = ("CommonStockDividendsPerShareDeclared", "CommonStockDividendsPerShareCashPaid")
QUOTE = "https://finnhub.io/api/v1/quote?symbol={t}&token={k}"
FINNHUB_BATCH = 55  # 분당 60회 한도. 여유를 둔다
FINNHUB_WINDOW_SEC = 62
ET = ZoneInfo("America/New_York")
CHUNK = 200
# 미수집이 이 비율을 넘으면 죽인다(반쪽짜리 표가 '배당 없음'으로 위장한다).
FAIL_PCT_MAX = 25

# 기간 길이(일) → 종류
DUR = {"month": (25, 35), "quarter": (80, 100), "half": (170, 190), "nine": (255, 285), "year": (350, 380)}


def kind_of(days: int) -> str | None:
    for k, (lo, hi) in DUR.items():
        if lo <= days <= hi:
            return k
    return None


def sec_get(url: str):
    for attempt in (1, 2, 3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": SEC_UA, "Accept-Encoding": "gzip"})
            with urllib.request.urlopen(req, timeout=40) as r:
                raw = r.read()
                if r.headers.get("Content-Encoding") == "gzip":
                    import gzip
                    raw = gzip.decompress(raw)
                return json.loads(raw)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            if attempt == 3:
                raise
            time.sleep(2 * attempt)
        except (OSError, http.client.HTTPException, json.JSONDecodeError):
            if attempt == 3:
                raise
            time.sleep(2 * attempt)
    return None


def cik_map() -> dict[str, tuple[int, str]]:
    d = sec_get(SEC_TICKERS) or {}
    return {v["ticker"].upper(): (int(v["cik_str"]), v["title"]) for v in d.values()}


def pick_rows(facts: dict) -> list[dict]:
    """두 태그를 합친 행. 더 최근까지 이어지는 태그가 주(主)이고, 거기 없는 기간만 다른 태그로
    채운다 — P&G 는 선언 태그가 2022년부터, 지급 태그가 그 전 15년을 갖고 있다. (start, end)
    중복은 늦게 제출한 것만 남긴다."""
    gaap = (facts.get("facts") or {}).get("us-gaap") or {}
    per_tag: list[tuple[str, list[dict]]] = []
    for tag in TAGS:
        rows = [r for r in ((gaap.get(tag) or {}).get("units") or {}).get("USD/shares", []) if r.get("start") and r.get("end")]
        if rows:
            per_tag.append((max(r["end"] for r in rows), rows))
    per_tag.sort(key=lambda x: (x[0], len(x[1])), reverse=True)
    latest: dict[tuple[str, str], dict] = {}
    for _, rows in per_tag:
        seen_here: dict[tuple[str, str], dict] = {}
        for r in rows:
            key = (r["start"], r["end"])
            if key not in seen_here or (r.get("filed") or "") > (seen_here[key].get("filed") or ""):
                seen_here[key] = r
        for key, r in seen_here.items():
            latest.setdefault(key, r)  # 주 태그가 먼저라 같은 기간은 주 태그 값이 남는다
    return list(latest.values())


def summarize(rows: list[dict], today: date) -> dict:
    by_kind: dict[str, list[tuple[date, date, float]]] = defaultdict(list)
    for r in rows:
        s, e = date.fromisoformat(r["start"]), date.fromisoformat(r["end"])
        k = kind_of((e - s).days)
        if k and r.get("val") is not None:
            by_kind[k].append((s, e, float(r["val"])))

    # 분기 — 직접 행 + 누적 행의 차로 채운 것. 끝 날짜로 하나씩.
    quarters: dict[date, float] = {e: v for _, e, v in by_kind["quarter"]}
    by_start: dict[date, dict[str, tuple[date, float]]] = defaultdict(dict)
    for k in ("quarter", "half", "nine", "year"):
        for s, e, v in by_kind[k]:
            # 같은 시작일에 같은 종류가 둘이면(드묾) 늦게 끝나는 쪽은 다른 회계연도다 — 먼저 것만.
            by_start[s].setdefault(k, (e, v))
    for s, parts in by_start.items():
        q1 = parts.get("quarter")
        half, nine, year = parts.get("half"), parts.get("nine"), parts.get("year")
        if half and q1 and half[0] not in quarters:
            quarters[half[0]] = round(half[1] - q1[1], 6)
        if nine and half and nine[0] not in quarters:
            quarters[nine[0]] = round(nine[1] - half[1], 6)
        if year and nine and year[0] not in quarters:
            quarters[year[0]] = round(year[1] - nine[1], 6)

    months = sorted((e, v) for _, e, v in by_kind["month"] if e <= today)
    annual = {e.year: v for _, e, v in sorted(by_kind["year"]) if e <= today}

    ttm, method = 0.0, "none"
    # ⚠️ '오늘 기준 365일 창'이 아니라 **마지막 열두 달·마지막 네 분기**다. 공시는 분기가 끝나고
    #    한 달 반 뒤에 나오므로 창으로 자르면 최근 두세 달이 늘 빈다 — 리얼티인컴이 10달 합
    #    2.70 으로 나왔었다(실제 연 3.24).
    fresh = today - timedelta(days=200)
    ended = sorted((e, v) for e, v in quarters.items() if e <= today and v >= 0)
    if len(months) >= 12 and months[-1][0] >= fresh:
        ttm, method = sum(v for _, v in months[-12:]), "monthly"
    elif len(ended) >= 4 and ended[-1][0] >= today - timedelta(days=200):
        ttm, method = sum(v for _, v in ended[-4:]), "quarters"
    elif ended and ended[-1][0] >= today - timedelta(days=200):
        ttm, method = ended[-1][1] * 4, "annualized"
    elif annual:
        last_end = max(e for _, e, _ in by_kind["year"])
        if last_end >= today - timedelta(days=400):
            ttm, method = annual[max(annual)], "fy"

    # 연속·줄임·증가율 — 국내 요약과 같은 규칙(calculate_kr_dividend_stats.py).
    last_year = max(annual) if annual else None
    streak = 0
    if last_year is not None:
        y = last_year
        while annual.get(y, 0) > 0:
            streak += 1
            y -= 1
    cuts = 0
    growth = None
    if last_year is not None:
        for yy in range(last_year - 4, last_year + 1):
            prev, cur = annual.get(yy - 1, 0), annual.get(yy, 0)
            if prev > 0 and cur < prev:
                cuts += 1
        base, top = annual.get(last_year - 5, 0), annual.get(last_year, 0)
        if base > 0 and top > 0:
            growth = round(((top / base) ** (1 / 5) - 1) * 100, 2)
    last_period = max((e for e, _ in ended), default=None)
    return {
        "ttm_dps": round(ttm, 4),
        "ttm_method": method,
        "annual": {str(k): round(v, 4) for k, v in sorted(annual.items())},
        "streak_years": streak,
        "cut_years_5": cuts,
        "growth_5y_pct": growth,
        "last_period_end": last_period.isoformat() if last_period else None,
    }


def quote(ticker: str, key: str) -> tuple[float, str] | None:
    """(마지막 체결가 달러, 미국 장 날짜). fetch_kr_preview.py 의 같은 함수와 같은 그물."""
    for attempt in (1, 2):
        try:
            with urllib.request.urlopen(QUOTE.format(t=ticker, k=key), timeout=15) as r:
                d = json.load(r)
            break
        except (OSError, http.client.HTTPException, json.JSONDecodeError) as e:
            if attempt == 1:
                time.sleep(2)
                continue
            print(f"[핀허브] {ticker}: {type(e).__name__}")
            return None
    if not d.get("c") or not d.get("t"):
        return None
    day = datetime.fromtimestamp(int(d["t"]), timezone.utc).astimezone(ET).strftime("%Y-%m-%d")
    return float(d["c"]), day


def usdkrw() -> tuple[float, str] | None:
    try:
        obs = observations("DEXKOUS", start=(date.today() - timedelta(days=20)).isoformat())
    except FredUnavailableError:
        return None
    return (obs[-1][1], obs[-1][0]) if obs else None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--only", help="쉼표로 구분한 티커 몇 개만(시험용)")
    args = ap.parse_args()
    if not FINNHUB_API_KEY and not args.dry_run:
        raise SystemExit("[중단] FINNHUB_API_KEY 가 없습니다")

    db = get_client()
    today = today_kst()
    master = {r["ticker"].upper(): r for r in load_all(db, "us_stocks", "ticker,name_ko,name_en", order_by="ticker")}
    names: dict[str, tuple[str, str | None]] = {t: (r["name_ko"] or t, r.get("name_en")) for t, r in master.items()}
    for t, ko in EXTRA_US_DIVIDEND.items():
        names.setdefault(t.upper(), (ko, None))
    tickers = sorted(names)
    if args.only:
        tickers = [t.strip().upper() for t in args.only.split(",") if t.strip()]
    ciks = cik_map()
    print(f"[SEC] 대상 {len(tickers)}종목 (카더라 사전 {len(master)} + 배당 목록 {len(EXTRA_US_DIVIDEND)}) · CIK 표 {len(ciks):,}")

    rows: list[dict] = []
    missing_cik: list[str] = []
    failed: list[str] = []
    for i, t in enumerate(tickers, 1):
        ck = ciks.get(t) or ciks.get(t.replace(".", "-"))
        if not ck:
            missing_cik.append(t)
            continue
        cik, title = ck
        try:
            facts = sec_get(SEC_FACTS.format(cik=cik))
        except Exception as exc:  # noqa: BLE001
            print(f"[SEC] {t} 실패 {type(exc).__name__}")
            failed.append(t)
            continue
        time.sleep(SEC_PAUSE_SEC)
        summ = summarize(pick_rows(facts) if facts else [], today)
        ko, en = names.get(t, (t, None))
        rows.append({
            "ticker": t,
            "cik": cik,
            "name_ko": ko,
            "name_en": en or title,
            **summ,
            "computed_for": today.isoformat(),
        })
        if i % 50 == 0:
            print(f"[SEC] {i}/{len(tickers)}")

    fail_pct = (len(failed) + len(missing_cik)) / max(len(tickers), 1) * 100
    print(f"[SEC] 요약 {len(rows)}종목 · CIK 없음 {len(missing_cik)} {missing_cik[:8]} · 실패 {len(failed)} ({fail_pct:.0f}%)")
    if fail_pct > FAIL_PCT_MAX:
        raise SystemExit(f"[중단] 못 받은 종목이 {fail_pct:.0f}% 입니다")

    # 시세. 배당이 있는 종목만 부른다 — 없는 종목은 수익률이 없어 시세가 필요 없다.
    fx = usdkrw()
    print(f"[FRED] 원/달러 {fx[0]:,.2f} ({fx[1]})" if fx else "[FRED] 환율을 못 받았습니다 — 화면이 원화 환산을 접습니다")
    paying = [r for r in rows if r["ttm_dps"] > 0]
    if args.dry_run and not args.only:
        print(f"[핀허브] --dry-run 이라 시세 {len(paying)}종목은 건너뜁니다")
        paying = []
    key = FINNHUB_API_KEY or ""
    for i, r in enumerate(paying, 1):
        if not key:
            break
        if i % FINNHUB_BATCH == 0:
            print(f"[핀허브] 분당 한도 때문에 {FINNHUB_WINDOW_SEC}초 쉽니다 ({i}/{len(paying)})")
            time.sleep(FINNHUB_WINDOW_SEC)
        q = quote(r["ticker"], key)
        if q:
            r["close"], r["price_date"] = q
            r["ttm_yield_pct"] = round(r["ttm_dps"] / q[0] * 100, 3) if q[0] > 0 else None
    for r in rows:
        r.setdefault("close", None)
        r.setdefault("price_date", None)
        r.setdefault("ttm_yield_pct", None)
        r["usdkrw"] = fx[0] if fx else None
        r["usdkrw_date"] = fx[1] if fx else None

    priced = [r for r in paying if r.get("close")]
    print(f"[요약] 배당 있음 {len(paying)}종목 · 시세 받음 {len(priced)} · 방법: "
          + " · ".join(f"{m} {sum(1 for r in rows if r['ttm_method'] == m)}" for m in ("quarters", "monthly", "annualized", "fy", "none")))
    for r in sorted(priced, key=lambda r: -(r["ttm_yield_pct"] or 0))[:6]:
        print(f"  {r['name_ko']:12s} ${r['ttm_dps']:.2f}/yr · ${r['close']:.2f} · {r['ttm_yield_pct']:.2f}% · {r['ttm_method']} · 연속 {r['streak_years']}년 · 증가율 {r['growth_5y_pct']}%")
    for t in ("KO", "O", "XOM", "MSFT", "JNJ"):
        r = next((x for x in rows if x["ticker"] == t), None)
        if r:
            print(f"  {t}: ttm ${r['ttm_dps']} ({r['ttm_method']}) · annual {dict(list(r['annual'].items())[-4:])} · 연속 {r['streak_years']} · 줄임 {r['cut_years_5']}")

    if args.dry_run:
        print("[SEC] --dry-run: DB 에 쓰지 않았습니다")
        return
    for i in range(0, len(rows), CHUNK):
        db.table(TABLE).upsert(rows[i : i + CHUNK], on_conflict="ticker").execute()
    print(f"[Supabase] {TABLE} upsert 완료: {len(rows)}행 (기준일 {today})")


if __name__ == "__main__":
    main()
