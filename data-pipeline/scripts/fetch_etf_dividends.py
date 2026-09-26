"""ETF 분배금을 `etf_dividend` 에 upsert — 미국은 stockanalysis, 국내는 예탁결제원 SEIBro 분배금지급현황. 둘 다 매일.

  미국 분배금  stockanalysis `/etf/{티커}/dividend/`(config/etf_dividends.py 의 목록). 못 받으면 설정의 `pays`
  국내 분배금  SEIBro ETF > 권리행사정보 > 분배금지급현황(BIP_CNTS06030V) — 전 운용사, 건마다 기준일·실지급일·주당분배금
  국내 시세    KRX Open API `etp/etf_bydd_trd` — 최신 가용 거래일 하루치(1,171종목)에서 코드로 찾는다
  미국 시세    핀허브 `quote`
  환율         ECB 참조환율(common/fx.py) · 안 오면 FRED

'1년에 얼마'는 미국·국내 다 같다 — **지난 365일 안에 지급된 건의 합.** 지급 달은 그 건들의 달이라 달력에 든다.

## 국내 과표 — 운용사 공시(지금은 TIGER 만)

국내 ETF 분배금은 전액이 과세되지 않는다. 운용사가 지급 건마다 '과표'(과세되는 1주당 금액)를 공시한다 — TIGER 200 커버드콜
88원 중 5원, 배당커버드콜액티브 413원 중 6원, 미국배당다우존스 30원 중 30원(2026-09-17 실측 118건: 국내 커버드콜 0~9%,
국내 주식형 0~100% 들쭉날쭉, 해외·채권형 대부분 100% 인데 예외 있음). SEIBro 는 과표기준가만 주고 과표는 안 준다
(기준가 차이로 계산하면 공시값과 안 맞았다 — 미국배당다우존스 8월 계산 0원, 공시 30원). 그래서 TIGER '전체 분배 내역'
(`distribution/overall/list.ajax`, 열다섯 달 47회)의 '과표기준' 열을 받아 SEIBro 지급 건에 (코드, 기준일)로 붙인다.
payments[].taxable · taxable_dps. 못 붙인 운용사는 taxable_dps 가 null — 화면이 전액 과세로 센다.
⚠️ TIGER 사이트는 GitHub 러너(미국 IP)에서 안 열린다 — 못 받은 지급 건은 저장된 과표를 이어 쓴다(stored_taxable).
다른 운용사 사이트(KODEX·RISE·ACE·PLUS·SOL)는 아직 안 찔러 봤다.

## 국내 분배금지급현황(SEIBro)

WebSquare 화면이라 서비스 호출 하나로 온다 — `callServletService.jsp` 에 XML 을 POST 하면 XML 로 답한다(로그인·세션
없음). 조회 기간은 **기준일** 기준이고 한 번에 30건이 상한이라(END_PAGE 를 올려도 30) START_PAGE 를 30씩 올려 쪽을
넘긴다. 한 달치 카운트(`…PlistCnt`)를 먼저 받아 그 수만큼 채웠는지 맞춘다. 2026-09-16 실측: 열여섯 달 4,161건 · 161회
요청 · 90초 · 쪽마다 겹침·빠짐 없음. 한 달 143~563건, 지난 1년 지급이 있는 ETF 975개(TIGER 215 · KODEX 195 · RISE 131 ·
ACE 104 · PLUS 76 · SOL 70 · KIWOOM 63 · HANARO 34 …).
- `RGT_RSN_DTAIL_NM` 이 '청산분배'인 건은 뺀다 — 상장폐지 때 순자산을 돌려주는 것이라(마이티 특수채 107,478원) 배당이 아니다.
- 단축코드는 ISIN 의 4~9번째 글자다(KR7069500007 → 069500, KR70094M0005 → 0094M0). KRX 시세의 ISU_CD 와 같은 값.
- 기준일에 이미 실리므로(지급일 전) 다음 지급 건도 온다 — trailing() 이 nxt 로 돌려준다.
- 2026-09-16 에 TIGER 사이트 '전체 분배 내역'과 네 달(2025-12·2026-04·07·08)을 맞대어 지급일·금액이 전부 같았다. 다른 건
  상장폐지된 ETF 한 건뿐(TIGER 사이트는 지운다, SEIBro 는 남긴다 — 시세 목록에 없어 어차피 빠진다).
⚠️ 2026-09-13~16 은 미래에셋 TIGER 사이트만 받았다(운용사 열 곳 페이지가 JS·502 라 못 넣는다고 적었던 것은 SEIBro 를 안 찔러
   본 탓이다). 공개 화면의 공시 사실(분배금·지급일)을 옮기는 것이고 출처(한국예탁결제원)는 푸터에 적혀 있다.

실행:
    cd data-pipeline && source .venv/bin/activate
    python scripts/fetch_etf_dividends.py --dry-run [--dump rows.json]
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
from common.fx import usdkrw  # noqa: E402
from common.krx_client import krx_get  # noqa: E402
from common.stockanalysis import PageChanged, dividend_history, trailing  # noqa: E402
from common.supabase_client import get_client, load_all  # noqa: E402
from common.timeutil import today_kst  # noqa: E402
from config.etf_dividends import US_ETFS  # noqa: E402

TABLE = "etf_dividend"
KRX_URL = "http://data-dbg.krx.co.kr/svc/apis/etp/etf_bydd_trd"
TIGER_LIST = "https://investments.miraeasset.com/tigeretf/ko/distribution/overall/list.ajax"
TIGER_SRC = "https://investments.miraeasset.com/tigeretf/ko/distribution/overall/list.do"
TIGER_UA = {"User-Agent": "hatzze/1.0 (+https://hatzze.fun; contact: support@hatzze.fun)", "Referer": TIGER_SRC, "X-Requested-With": "XMLHttpRequest"}
TIGER_PAGE = 20
TIGER_PAUSE_SEC = 0.7
SEIBRO_URL = "https://seibro.or.kr/websquare/engine/proworks/callServletService.jsp"
SEIBRO_SRC = "https://seibro.or.kr/websquare/control.jsp?w2xPath=/IPORTAL/user/etf/BIP_CNTS06030V.xml&menuNo=179"
SEIBRO_HEADERS = {
    "User-Agent": "hatzze/1.0 (+https://hatzze.fun; contact: support@hatzze.fun)",
    "Referer": SEIBRO_SRC,
    "Content-Type": "application/xml; charset=UTF-8",
}
SEIBRO_TASK = "ksd.safe.bip.cnts.etf.process.EtfExerInfoPTask"
# 한 번에 주는 상한(END_PAGE 를 올려도 30). 쪽 사이 간격은 stockanalysis 와 같다.
SEIBRO_PAGE = 30
SEIBRO_PAUSE_SEC = 0.3
# 몇 달치를 받나. '지난 365일에 지급된 건'을 기준일 달로 거르므로 13달이면 되지만, 기준일과 지급일이
# 달을 넘기는 건(12/29 기준 → 1/3 지급)이 있어 두 달 여유를 둔다.
SEIBRO_MONTHS = 15
# 지난달까지의 한 달치가 이보다 적으면 서비스가 바뀐 것이다(실측 최소 143건 · 2025-08). 그때는 국내를 통째로 건너뛴다.
# 이달은 뺀다 — 기준일이 지나야 실리므로 월초엔 몇 건이 정상이다.
SEIBRO_MIN_ROWS_PER_MONTH = 50
# 배당이 아닌 구분. 청산분배는 상장폐지 때 순자산을 돌려주는 것.
SEIBRO_SKIP_KINDS = {"청산분배"}
QUOTE = "https://finnhub.io/api/v1/quote?symbol={t}&token={k}"
ET = ZoneInfo("America/New_York")
MAX_LOOKBACK_DAYS = 10
# 이 수보다 적게 모였으면 표에서 남는 행을 안 지운다(원천이 반쯤 죽은 날 표를 비우지 않게). 국내 실측 975(2026-09-16).
MIN_ROWS_TO_PRUNE = 600


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


def seibro_call(action: str, start: int, frm: date, to: date) -> str | None:
    """분배금지급현황 서비스 한 번. 못 받으면 None. 날짜는 기준일 범위(양끝 포함)."""
    body = (
        f'<reqParam action="{action}" task="{SEIBRO_TASK}">'
        f'<START_PAGE value="{start}"/><END_PAGE value="{start + SEIBRO_PAGE - 1}"/>'
        '<etf_sort_cd value=""/><etf_big_sort_cd value=""/><isin value=""/><mngco_custno value=""/><RGT_RSN_DTAIL_SORT_CD value=""/>'
        f'<fromRGT_STD_DT value="{frm:%Y%m%d}"/><toRGT_STD_DT value="{to:%Y%m%d}"/>'
        '<MENU_NO value="179"/><W2XPATH value="/IPORTAL/user/etf/BIP_CNTS06030V.xml"/></reqParam>'
    )
    for attempt in (1, 2, 3):
        try:
            with urllib.request.urlopen(urllib.request.Request(SEIBRO_URL, data=body.encode("utf-8"), headers=SEIBRO_HEADERS), timeout=40) as r:
                return r.read().decode("utf-8", "ignore")
        except (OSError, http.client.HTTPException):
            if attempt == 3:
                return None
            time.sleep(3)
    return None


def _ymd(v: str) -> str:
    return f"{v[:4]}-{v[4:6]}-{v[6:]}"


def seibro_month(year: int, month: int) -> list[dict] | None:
    """한 달치 지급 건(기준일 기준). [{code, name, record, pay, amount, kind, issuer}]. 못 받았거나 카운트만큼 못 채우면 None.

    응답은 <result> 마다 <ISIN value=""/> 꼴의 속성 한 줄씩이다. 열: ISIN · KOR_SECN_NM(종목명) · RGT_STD_DT(지급기준일) ·
    TH1_PAY_TERM_BEGIN_DT(실지급일) · ESTM_STDPRC(주당분배금, 원) · RGT_RSN_DTAIL_NM(배당구분) · REP_SECN_NM(운용사) ·
    ETF_SORT_NM(유형) · TAXSTD(과표기준가) · BUNBE(시가 대비 분배율).
    """
    frm = date(year, month, 1)
    to = date(year + (month == 12), month % 12 + 1, 1) - timedelta(days=1)
    head = seibro_call("exerInfoDtramtPayStatPlistCnt", 1, frm, to)
    m = re.search(r'LIST_CNT value="(\d+)"', head or "")
    if m is None:
        return None
    total = int(m.group(1))
    out: list[dict] = []
    seen: set[tuple[str, str, str]] = set()
    start = 1
    while len(out) < total:
        page = seibro_call("exerInfoDtramtPayStatPlist", start, frm, to)
        if page is None:
            return None
        time.sleep(SEIBRO_PAUSE_SEC)
        results = re.findall(r"<result>(.*?)</result>", page, flags=re.S)
        if not results:
            break
        for r in results:
            d = {k: html.unescape(v) for k, v in re.findall(r'<([A-Z_0-9]+) value="([^"]*)"', r)}
            isin, rec, pay, amt = d.get("ISIN", ""), d.get("RGT_STD_DT", ""), d.get("TH1_PAY_TERM_BEGIN_DT", ""), d.get("ESTM_STDPRC", "")
            key = (isin, rec, d.get("RGT_RSN_DTAIL_NM", ""))
            if key in seen:
                continue
            seen.add(key)
            if len(isin) != 12 or len(rec) != 8 or len(pay) != 8 or not amt:
                continue
            try:
                date.fromisoformat(_ymd(rec)), date.fromisoformat(_ymd(pay))
                amount = float(amt)
            except ValueError:
                continue
            out.append({
                "code": isin[3:9], "name": d.get("KOR_SECN_NM", "").strip(), "record": _ymd(rec), "pay": _ymd(pay),
                "amount": amount, "kind": d.get("RGT_RSN_DTAIL_NM", ""), "issuer": d.get("REP_SECN_NM", ""),
            })
        start += SEIBRO_PAGE
        if start > total + SEIBRO_PAGE:
            break
    if len(seen) != total:
        print(f"  ⚠️ SEIBro {year}-{month:02d}: 카운트 {total}건인데 {len(seen)}건 — 쪽 넘김이 어긋났습니다")
        return None
    return out


def seibro_history(today: date) -> list[dict] | None:
    """최근 SEIBRO_MONTHS 달의 지급 건 전부(청산분배 제외). 한 달이라도 못 받거나 비정상으로 적으면 None — 반쪽 합은 틀린 값이다."""
    out: list[dict] = []
    y, m = today.year, today.month
    for i in range(SEIBRO_MONTHS):
        rows = seibro_month(y, m)
        if rows is None or (i > 0 and len(rows) < SEIBRO_MIN_ROWS_PER_MONTH):
            print(f"  ⚠️ SEIBro {y}-{m:02d}: {'못 받음' if rows is None else f'{len(rows)}건뿐'} — 국내 ETF 를 건너뜁니다")
            return None
        out.extend(r for r in rows if r["kind"] not in SEIBRO_SKIP_KINDS)
        m -= 1
        if m == 0:
            y, m = y - 1, 12
    return out


def tiger_taxable(today: date, months: int = SEIBRO_MONTHS) -> dict[tuple[str, str], float]:
    """TIGER 지급 건의 과표 — (코드, 기준일) → 과세되는 1주당 금액. 못 받은 달은 건너뛴다(그 달 건은 과표 없음 = 전액 과세)."""
    out: dict[tuple[str, str], float] = {}
    y, m = today.year, today.month
    for _ in range(months):
        idx = 1
        while True:
            q = urllib.parse.urlencode({"pageIndex": idx, "firstIndex": (idx - 1) * TIGER_PAGE, "listCnt": TIGER_PAGE, "selectYear": y, "selectMonth": m})
            page = None
            err = None
            for attempt in (1, 2, 3):
                try:
                    with urllib.request.urlopen(urllib.request.Request(f"{TIGER_LIST}?{q}", headers=TIGER_UA), timeout=40) as r:
                        page = r.read().decode("utf-8", "ignore")
                    break
                except (OSError, http.client.HTTPException) as exc:
                    err = exc
                    if attempt == 3:
                        break
                    time.sleep(3)
            time.sleep(TIGER_PAUSE_SEC)
            if page is None:
                # 이유를 남긴다 — 러너에서 막힌 것이 403(차단)인지 시간 초과인지에 따라 다음 처방(국내 리전 중계 등)이 갈린다.
                why = f"{type(err).__name__}: {str(err)[:80]}" if err else "?"
                print(f"  ⚠️ TIGER 과표 {y}-{m:02d} 못 받음({why}) — 그 달은 이전에 받은 과표를 쓰고, 없으면 전액 과세로 둡니다")
                break
            rows = re.findall(r"<tr[^>]*>(.*?)</tr>", page, flags=re.S)
            tot = re.search(r'data-tot-cnt="(\d+)"', page)
            for tr in rows:
                cells = [html.unescape(re.sub(r"<[^>]+>", "", c)).strip() for c in re.findall(r"<td[^>]*>(.*?)</td>", tr, flags=re.S)]
                code = re.search(r'<p class="code">\((.*?)\)</p>', tr, flags=re.S)
                if not code or len(cells) < 7:
                    continue
                try:
                    date.fromisoformat(cells[2])
                    out[(code.group(1).strip(), cells[2])] = float(cells[5].replace(",", "") or 0)
                except ValueError:
                    continue
            if not rows or tot is None or idx * TIGER_PAGE >= int(tot.group(1)):
                break
            idx += 1
        m -= 1
        if m == 0:
            y, m = y - 1, 12
    return out


def stored_taxable(db) -> dict[tuple[str, str], float]:
    """이미 저장된 국내 ETF 지급 건의 과표 — (코드, 기준일) → 과세되는 1주당 금액. 못 읽으면 빈 dict.

    ⚠️ **TIGER 사이트는 GitHub 러너(미국 IP)에서 한 번도 안 열렸다.** 과표를 넣은 09-17 첫 CI 실행부터 09-26 까지
    매번 "TIGER 과표 0건"이었고(국내 IP 에선 200 · 827건), 이 스크립트가 그때마다 과표 칸을 빈 값으로 덮어써 로컬에서
    채운 값까지 지웠다. 그 사이 TIGER 212개가 전액 과세로 세어져 일부만 과세되는 73개의 세후가 중앙 13.8%·최대 18.2%
    낮게 나갔다(과세 0% 인 것 31개).
    한 지급 건의 과표는 공시된 뒤 바뀌지 않으므로 **이번에 못 받은 건은 저장된 값을 쓴다.** 새로 생긴 지급 건은
    다음에 국내 IP 에서 받을 때까지 과표 없이(전액 과세로) 남는다 — 모자라게 세는 쪽이지 없는 비과세를 만들지는 않는다.
    """
    try:
        rows = load_all(db, TABLE, "code,market,payments", order_by="code")
    except Exception as exc:  # noqa: BLE001
        print(f"[ETF] 저장된 과표를 못 읽었습니다 — 이번에 받은 것만 씁니다: {exc}")
        return {}
    out: dict[tuple[str, str], float] = {}
    for r in rows:
        if r.get("market") != "KR":
            continue
        for p in r.get("payments") or []:
            if p.get("taxable") is not None and p.get("record"):
                out[(r["code"], p["record"])] = float(p["taxable"])
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
    kr_hist = seibro_history(today)
    # 이번에 받은 과표가 먼저고, 못 받은 지급 건은 저장된 값으로 채운다(stored_taxable 주석). 읽기만 하므로 --dry-run 에서도 부른다.
    db = get_client()
    fresh = tiger_taxable(today) if kr_hist is not None else {}
    kept = stored_taxable(db) if kr_hist is not None else {}
    taxable = {**kept, **fresh}
    print(f"[ETF] TIGER 과표 이번에 받은 것 {len(fresh)}건 · 저장된 값으로 채운 것 {len(taxable) - len(fresh)}건")
    kr_count = 0
    if kr_hist is not None:
        by_code: dict[str, list[dict]] = {}
        for r in kr_hist:
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
            # 과표는 지급 건마다. 하나라도 있으면 없는 건은 분배금 전액으로 쳐서 합을 낸다(그 달 페이지를 못 받은 것).
            tx = [taxable.get((code, p["record"])) for p in paid]
            has_tx = any(t is not None for t in tx)
            rows.append({
                "code": code, "market": "KR", "currency": "KRW",
                "name_ko": max(recs, key=lambda p: p["record"])["name"], "name_en": None,  # 이름이 바뀐 ETF 는 최근 건의 이름
                "cadence": cadence_of(len(paid)), "ttm_dps": ttm, "estimated": False,
                "payments": [{"record": p["record"], "pay": p["pay"], "amount": p["amount"], **({"taxable": t} if t is not None else {})} for p, t in zip(paid, tx)],
                "taxable_dps": round(sum(min(p["amount"], t) if t is not None else p["amount"] for p, t in zip(paid, tx)), 2) if has_tx else None,
                "pay_months": sorted({int(p["pay"][5:7]) for p in paid}),
                "next_pay_date": nxt["pay"] if nxt else None, "next_pay_amount": nxt["amount"] if nxt else None,
                "as_of": today.isoformat(), "source": SEIBRO_SRC,
                "close": close, "price_date": latest[0] if latest and close else None,
                "ttm_yield_pct": round(ttm / close * 100, 3) if close and ttm else None,
                "computed_for": today.isoformat(),
            })
        issuers = sorted({r["issuer"] for r in kr_hist})
        with_tx = [r for r in rows if r["market"] == "KR" and r["taxable_dps"] is not None]
        partial = [r for r in with_tx if r["taxable_dps"] < r["ttm_dps"] * 0.99]
        print(f"[ETF] SEIBro 분배 내역 {len(kr_hist)}건 · {len(by_code)}종목 중 지난 1년 지급 있음 {kr_count} · 운용사 {len(issuers)}곳" + (f" · 시세 없어 뺀 것 {no_price}" if no_price else ""))
        print(f"[ETF] 과표 붙은 국내 ETF {len(with_tx)} · 그중 일부만 과세 {len(partial)}")
        for r in sorted(partial, key=lambda r: r["taxable_dps"] / r["ttm_dps"])[:6]:
            print(f"  {r['name_ko']:34s} 분배금 {r['ttm_dps']:>8,.0f} 과표 {r['taxable_dps']:>8,.0f} ({r['taxable_dps'] / r['ttm_dps'] * 100:.0f}%)")

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
            "taxable_dps": None,
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
    if "--dump" in sys.argv[1:]:
        # 화면 쪽 검증용 — 이 행들을 그대로 lib/dividend.ts 의 EtfRow 로 읽어 바스켓을 미리 볼 수 있다.
        out = Path(sys.argv[sys.argv.index("--dump") + 1])
        out.write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
        print(f"[ETF] {out} 에 {len(rows)}행 적었습니다")
    if dry_run:
        print("[ETF] --dry-run: DB 에 쓰지 않았습니다")
        return
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
