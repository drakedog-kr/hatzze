"""KIND '현금·현물배당 결정' 공시를 `kr_dividend_notice` 에 upsert — 국내 주식의 **확정 배당**과 **감액배당(비과세)** 원천.

배당으로 살기(/dividend)의 국내 주식 숫자는 예탁결제원 기록(지난 1년 실제 지급)이라 앞으로 받을 돈은 어림값이다.
회사가 이사회에서 "다음 배당 1주에 500원, 기준일·지급일"을 정하면 거래소에 이 공시를 내고, 그게 확정값이다
(2026-09-17 피드백: 확정 배당은 MTS 로 보기 불편하다). 같은 공시 본문에 자본준비금을 감액해 주는 배당(감액배당,
소액주주 비과세)이라는 문장이 글로 적혀 있어 그것도 여기서 잡는다(같은 날 피드백). 공식 칸은 없다 — 서식 61500 의
항목은 배당구분·종류·1주당 배당금·기준일·지급예정일·이사회결의일까지고, 감액배당은 "11. 기타 투자판단과 관련한
중요사항"에 회사마다 다른 문장으로 온다(대신증권 "자본준비금에서 이익잉여금으로 전입한 금액의 일부… 비과세 대상",
메리츠 "자본준비금을 감액하여 전입한 비과세 이익잉여금을 재원으로 하여 과세소득이 아닙니다").

## 어떻게 받나 (2026-09-17 실측)

세 번 요청이다. ① 공시 목록 검색(`disclosure/details.do`, reportNm=현금ㆍ현물배당 결정, 날짜 범위 · 100건씩)에서
접수번호(acptno)와 회사 코드 앞 5자리를 얻고, ② 뷰어(`common/disclsviewer.do?method=search&acptno=`)에서 본문
문서번호(docNo)를, ③ `method=searchContents&docNo=` 에서 본문 HTML 주소(`/external/…/61500.htm`)를 얻어 받는다.
올해 1~9월 1,871건. 매일은 최근 열흘(수십 건), 처음 한 번은 `--since 2025-06-01`(열다섯 달, 3,000건 안팎 · 한 시간).

⚠️ 회사 코드는 KIND 가 앞 5자리만 준다('02182'). 보통주 = 그 값 + '0', 우선주는 같은 5자리에 5·7·9 — 그래서
   표의 키는 5자리(corp_prefix)이고 계산 쪽(calculate_kr_dividend_stats.py)이 앞 5자리로 맞춘다.
⚠️ [정정] 공시는 제목 앞에 붙는다. 같은 회사·같은 기준일에 여러 건이면 접수번호가 큰 것이 최신이다 — 계산 쪽 규칙.
⚠️ KIND 는 거래소 사이트다(비상업 상자, common/kind.py). 페이지가 바뀌면 깨지므로 목록 행 수·본문 항목 수를 검사한다.

실행:
    cd data-pipeline && source .venv/bin/activate
    python scripts/fetch_kr_dividend_notices.py --dry-run
    python scripts/fetch_kr_dividend_notices.py --since 2025-06-01
"""

from __future__ import annotations

import html
import http.client
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common.kind import UA, post_list  # noqa: E402
from common.supabase_client import get_client  # noqa: E402
from common.timeutil import today_kst  # noqa: E402

TABLE = "kr_dividend_notice"
LIST_URL = "https://kind.krx.co.kr/disclosure/details.do"
LIST_REFERER = "https://kind.krx.co.kr/disclosure/details.do?method=searchDetailsMain"
VIEWER_URL = "https://kind.krx.co.kr/common/disclsviewer.do"
REPORT_NM = "현금ㆍ현물배당 결정"
PAGE = 100
PAUSE_SEC = 0.4
DEFAULT_DAYS = 10
# 목록이 이보다 적으면(열흘에 보통 20~80건, 12~3월엔 수백) 페이지가 바뀐 것으로 보고 저장하지 않는다. 처음 백필은 예외.
MIN_ROWS_DAILY = 3

# 감액배당 문장 — 재원(자본준비금·감액)과 결과(비과세·과세소득 아님)가 같은 본문에 다 있어야 한다. 한쪽만이면 안 잡는다.
SOURCE_RE = re.compile(r"자본준비금|자본 준비금|감액")
TAXFREE_RE = re.compile(r"비과세|과세소득이 아닙|과세 소득이 아닙|과세대상이 아닙|과세 대상이 아닙|배당소득세가 과세되지|배당소득으로 보지")


def fetch(url: str, data: dict | None = None, referer: str | None = None) -> str | None:
    headers = {"User-Agent": UA}
    if referer:
        headers["Referer"] = referer
    body = urllib.parse.urlencode(data).encode() if data else None
    for attempt in (1, 2, 3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, data=body, headers=headers), timeout=60) as r:
                return r.read().decode("utf-8", "ignore")
        except (OSError, http.client.HTTPException):
            if attempt == 3:
                return None
            time.sleep(3 * attempt)
    return None


def list_filings(frm: date, to: date) -> list[dict] | None:
    """[{acptno, prefix, corp_name, filed_at, title}] — 최신순. 못 받으면 None."""
    out: list[dict] = []
    for idx in range(1, 200):
        page = post_list(LIST_URL, LIST_REFERER, {
            "method": "searchDetailsSub", "currentPageSize": PAGE, "pageIndex": idx, "orderMode": 1, "orderStat": "D",
            "forward": "details_sub", "fromDate": frm.isoformat(), "toDate": to.isoformat(), "reportNm": REPORT_NM,
            "repIsuSrtCd": "", "searchCorpName": "", "marketType": "",
        })
        if page is None:
            return None
        rows = re.findall(r"<tr[^>]*>(.*?)</tr>", page, flags=re.S)
        got = 0
        for tr in rows:
            a = re.search(r"openDisclsViewer\('(\d{14})'", tr)
            c = re.search(r"companysummary_open\('(\d{5})'", tr)
            cells = [re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", x))).strip() for x in re.findall(r"<td[^>]*>(.*?)</td>", tr, flags=re.S)]
            if not a or not c or len(cells) < 5:
                continue
            try:
                filed = datetime.strptime(cells[1], "%Y-%m-%d %H:%M")
            except ValueError:
                continue
            out.append({"acptno": a.group(1), "prefix": c.group(1), "corp_name": cells[2], "filed_at": filed, "title": cells[3]})
            got += 1
        time.sleep(PAUSE_SEC)
        if got < PAGE:
            break
    return out


def doc_url(acptno: str) -> str | None:
    """뷰어에서 본문 문서번호를 찾고, 그 문서의 HTML 주소를 얻는다."""
    viewer = fetch(f"{VIEWER_URL}?method=search&acptno={acptno}")
    m = re.search(r"<option value='(\d{14})\|[YN]'\s*selected", viewer or "")
    if not m:
        return None
    time.sleep(PAUSE_SEC)
    contents = fetch(VIEWER_URL, {"method": "searchContents", "docNo": m.group(1)}, referer=f"{VIEWER_URL}?method=search&acptno={acptno}")
    u = re.search(r"https://kind\.krx\.co\.kr/external/[^'\"]+\.htm", contents or "")
    return u.group(0) if u else None


def _ymd(s: str | None) -> str | None:
    return s if s and re.fullmatch(r"\d{4}-\d{2}-\d{2}", s) else None


def _num(s: str | None) -> float | None:
    if not s:
        return None
    m = re.match(r"[\d,]*\.?\d+", s.replace(",", ""))
    return float(m.group(0)) if m else None


def parse_doc(page: str) -> dict | None:
    """서식 61500 본문. 항목이 넷 넘게 안 잡히면 None(서식이 바뀐 것)."""
    t = html.unescape(re.sub(r"<[^>]+>", " ", page))
    t = re.sub(r"\s+", " ", t)
    body = t[t.find("1. 배당구분") :] if "1. 배당구분" in t else t
    g = lambda pat: (re.search(pat, body) or [None, None])[1]  # noqa: E731
    div_kind = g(r"1\. ?배당구분 (\S+)")
    div_type = g(r"2\. ?배당종류 (\S+)")
    dps_common = _num(g(r"1주당 ?배당금\(원\) ?보통주식 ([\d,\.]+|-)"))
    dps_pref = _num(g(r"1주당 ?배당금\(원\) ?보통주식 (?:[\d,\.]+|-) ?종류주식 ([\d,\.]+|-)"))
    record = _ymd(g(r"6\. ?배당기준일 (\d{4}-\d{2}-\d{2}|-)"))
    pay = _ymd(g(r"7\. ?배당금 ?지급 ?예정일자 (\d{4}-\d{2}-\d{2}|-)"))
    decided = _ymd(g(r"10\. ?이사회결의일\(결정일\) (\d{4}-\d{2}-\d{2})"))
    if sum(x is not None for x in (div_kind, div_type, record, decided)) < 3:
        return None
    # 11. 기타 — 관련공시 앞까지. 감액배당 문장은 여기 있다.
    i = body.find("11. 기타")
    other = body[i:] if i >= 0 else ""
    j = other.find("※ 관련공시")
    other = other[:j] if j >= 0 else other
    taxfree = bool(SOURCE_RE.search(other) and TAXFREE_RE.search(other))
    note = None
    taxfree_amount = None
    if taxfree:
        # 문장 단위로 잘라 재원과 비과세가 같이 든 첫 문장. 없으면 비과세가 든 문장.
        sents = re.split(r"(?<=[.다])\s+(?=[-※①②③④⑤가-힣(])", other)
        pick = next((s for s in sents if SOURCE_RE.search(s) and TAXFREE_RE.search(s)), None) or next((s for s in sents if TAXFREE_RE.search(s)), None)
        note = re.sub(r"^\s*[-※]\s*", "", pick or "").strip()[:400] or None
        # "1주당 배당금 1,150원 중 800원은 …" 처럼 일부만 감액배당인 경우의 금액. 못 읽으면 전액.
        m = re.search(r"1주당[^.]{0,40}?([\d,]+)원 ?중 ?([\d,]+)원", other)
        if m:
            taxfree_amount = _num(m.group(2))
    return {
        "div_kind": div_kind, "div_type": div_type, "dps_common": dps_common, "dps_pref": dps_pref,
        "record_date": record, "pay_date": pay, "decided_on": decided,
        "taxfree": taxfree, "taxfree_amount": taxfree_amount, "taxfree_note": note,
    }


def main() -> None:
    args = sys.argv[1:]
    dry_run = "--dry-run" in args
    today = today_kst()
    since = date.fromisoformat(args[args.index("--since") + 1]) if "--since" in args else today - timedelta(days=DEFAULT_DAYS)
    backfill = "--since" in args

    filings = list_filings(since, today)
    if filings is None:
        print("[KIND 배당공시] 목록을 못 받았습니다")
        sys.exit(1)
    if not backfill and len(filings) < MIN_ROWS_DAILY:
        print(f"[KIND 배당공시] {since}~{today} 목록이 {len(filings)}건뿐 — 페이지가 바뀐 것 같아 저장하지 않습니다")
        sys.exit(1)
    print(f"[KIND 배당공시] {since}~{today} 목록 {len(filings)}건")

    db = None if dry_run else get_client()
    known: set[str] = set()
    if db and backfill:
        # 백필은 이미 받은 접수번호를 건너뛴다 — 끊겼다 다시 돌려도 처음부터 안 한다.
        for frm in range(0, 100_000, 1000):
            chunk = db.table(TABLE).select("acptno").order("acptno").range(frm, frm + 999).execute().data
            known.update(r["acptno"] for r in chunk)
            if len(chunk) < 1000:
                break
    rows: list[dict] = []
    failed = 0
    for i, f in enumerate(filings, 1):
        if f["acptno"] in known:
            continue
        url = doc_url(f["acptno"])
        time.sleep(PAUSE_SEC)
        page = fetch(url) if url else None
        parsed = parse_doc(page) if page else None
        if parsed is None:
            failed += 1
            print(f"  ⚠️ {f['acptno']} {f['corp_name']} {f['title']}: {'주소 못 찾음' if not url else '본문 못 읽음'}")
            continue
        rows.append({
            "acptno": f["acptno"], "corp_prefix": f["prefix"], "corp_name": f["corp_name"], "filed_at": f["filed_at"].isoformat(),
            "title": f["title"], "corrected": f["title"].startswith("[정정]"), "doc_url": url, **parsed,
        })
        if i % 50 == 0:
            print(f"  … {i}/{len(filings)}")
        time.sleep(PAUSE_SEC)
        if db and len(rows) >= 100:
            db.table(TABLE).upsert(rows, on_conflict="acptno").execute()
            rows = []
    tf = [r for r in rows if r["taxfree"]]
    print(f"[KIND 배당공시] 읽음 {len(rows)}건(이미 있던 것 {len(known & {f['acptno'] for f in filings})} 건너뜀) · 못 읽음 {failed} · 감액배당 문장 {len(tf)}건")
    for r in tf[:8]:
        print(f"  {r['corp_name']:12s} 기준일 {r['record_date']} 1주 {r['dps_common']} · {(r['taxfree_note'] or '')[:70]}")
    for r in rows[:5]:
        print(f"  {r['corp_name']:12s} {r['div_kind']} 기준일 {r['record_date']} 지급 {r['pay_date']} 1주 {r['dps_common']}/{r['dps_pref']}")
    if dry_run:
        print("[KIND 배당공시] --dry-run: DB 에 쓰지 않았습니다")
        return
    if rows:
        db.table(TABLE).upsert(rows, on_conflict="acptno").execute()
    print(f"[Supabase] {TABLE} upsert 완료")


if __name__ == "__main__":
    main()
