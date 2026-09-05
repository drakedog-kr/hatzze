"""SEC Form 4(미국 임원 공시)를 받아 us_insider_txn · us_insider_daily 에 저장한다.

내부자 리포트(/insider)의 첫 재료다. 카더라에 오른 미국 종목 옆에 그 회사 임원이
무엇을 신고했는지를 붙인다.

## 시장 전체를 받지 않는다

EDGAR 의 Form 4 는 하루 700~2,100건이다. 우리는 그중 **us_stocks 에 있는 종목**만
받는다(2026-08 기준 162개). 일별 인덱스에 CIK 가 있으므로 XML 을 받기 **전에** 거른다.
실측으로 하루 30~100건만 내려받으면 된다. 이 필터가 없으면 요청이 20배로 늘고
GH Actions 러너에서 타임아웃 위험이 생긴다.

## ⚠️ 이 표에 쌓이는 것의 대부분은 "매수·매도"가 아니다

실측(카더라에 오른 종목 150건 표본): M 옵션행사 36% · S 매도 30% · F 세금 17% ·
A 무상취득 8% · **P 장내매수 0.7%(1건)**. 같은 날 시장 전체 무작위 150건에서는
P 가 17% 였다. 대형 기술주라 임원이 자기 돈으로 사는 일이 25배 드물다.

**P 가 0 인 날이 정상이다.** 화면에서 카드를 숨기지 말고 그 사실을 적을 것.

## ⚠️ 오늘 것은 오늘 없다

일별 인덱스는 그날 접수가 끝난 뒤 만들어진다. 한국 시각 기준 미국 거래일 D 의
공시는 **D+1 오전**에 잡힌다. 실측으로 8/19 22:48 KST(미 동부 09:48)에 8/19 인덱스는
0건이고 8/18 은 2,058건이었다. 그래서 오늘 날짜가 비어 있어도 고장이 아니다.

⛔ 되돌아보기 루프의 첫날이 비었다고 거기서 멈추면 안 된다. 예탁원 때 그렇게
열흘치를 잃었다. 빈 날은 건너뛰고 계속 본다.

## 비파생만 담는다

`nonDerivativeTransaction` 만 읽는다. 보통주가 실제로 오간 자리다. 파생
(`derivativeTransaction`)은 같은 옵션 행사의 반대편이라 같이 담으면 이중으로 센다.

## ⭐ 매일 조금씩 받고, 집계는 DB 에서 만든다

예전엔 매 실행 90일을 통째로 훑었다. 인덱스 65일 × 공시 수백 건이라 **20분이 넘어**
매일 돌릴 물건이 아니었다. 지금은 최근 며칠만 받아 upsert 하고, 집계(us_insider_daily)
는 **저장한 뒤 DB 의 창을 읽어** 만든다.

⚠️⚠️ 집계를 그 실행에서 받은 것으로 만들면 **훑는 날수가 창보다 짧은 순간 조용히
     거짓이 된다** — 저장 키가 (as_of, window, ticker) 라 90일 행을 며칠치 숫자로
     덮어쓴다. 실제로 `--days 5` 한 번에 73종목이 망가졌다. 그래서 DB 를 읽는다.

실행:
    cd data-pipeline && source .venv/bin/activate
    python scripts/fetch_us_insider.py --dry-run   # 측정만, DB 안 씀
    python scripts/fetch_us_insider.py            # 매일 (최근 5영업일)
    python scripts/fetch_us_insider.py --days 90  # 전량 재구성 (20분 넘는다)
"""

from __future__ import annotations

import argparse
import datetime as dt
import html
import json
import re
import sys
import time
import urllib.request
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common.supabase_client import get_client, load_all  # noqa: E402

# SEC 공정접근 정책: 연락처가 담긴 User-Agent 가 없으면 차단된다. 초당 10건 상한도 있다.
UA = {"User-Agent": "hatzze (contact: support@hatzze.fun)"}
SLEEP = 0.12

# 집계 창. **둘을 다 써 넣는다.** 화면의 자리마다 필요한 창이 다르기 때문이다.
#
#   90일 → 히어로의 규모("기업 임원 1,731명"). 길수록 커버리지를 정직하게 말한다.
#    7일 → 오늘의 업데이트와 블록 다섯. 짧아야 소식이다.
#
# ⭐ 하나로 두면 둘 중 하나가 반드시 거짓말한다. 90일 하나만 쓰던 동안 "임원이 자기
#   돈으로 산 것" 블록이 **3개월치 목록**이 됐고, "오늘의 업데이트"에 90일 누적이 실렸다.
#
# ⚠️ 이 목록은 lib/insider-data.ts 의 INSIDER_WINDOW_DAYS(90) · INSIDER_RECENT_DAYS(7)
#    와 반드시 같아야 한다. 한쪽만 고치면 화면이 파이프라인이 안 만든 창을 조회해 빈다.
#
# 창 길이와 사람 수의 실측 곡선(2026-08-20): 7일 243명 · 14일 426명 · 30일 557명 ·
# 90일 1,731명. 같은 임원이 반복 신고해서 늘어나는 속도가 꺾인다.
WINDOW_DAYS = 90
RECENT_DAYS = 7

# 코드 묶음. option 은 보상 제도에 딸린 기계적 흐름이라 매도와 같이 세면 안 된다.
BUY_CODES = {"P"}
SELL_CODES = {"S"}
OPTION_CODES = {"M", "A", "F"}


def fetch(url: str, tries: int = 3) -> str | None:
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            return urllib.request.urlopen(req, timeout=40).read().decode("latin-1")
        except Exception:
            if i == tries - 1:
                return None
            time.sleep(1.5 * (i + 1))
    return None


# SEC 목록은 **클래스까지** 적는다(BRK-A/BRK-B). 우리 사전은 클래스 없는 티커를 쓰므로
# 그대로는 안 잡힌다. 같은 별칭이 이미 두 군데 있는데 여기만 빠져 있었다 —
# `lib/yahoo-history.ts` 의 YAHOO_ALIAS, `extract_telegram_us_stocks.py` 의 SEC_TICKER_ALIAS.
#
# ⚠️ 그 탓에 **버크셔 임원 공시가 한 건도 안 들어왔다**(2026-09-05 확인: us_insider_txn·
#    us_insider_daily 에 BRK 행 0). 로그는 "못 잡은 것 1개" 한 줄만 찍어서, 세지 않으면
#    안 보인다. 카더라 쪽은 별칭이 있어 멀쩡히 잡히고 있었다(09-03 언급 12회).
# ⚠️ 세 번째 사본이다. 클래스가 나뉜 종목을 사전에 더 넣으면 **세 곳을 같이** 고칠 것.
SEC_TICKER_ALIAS = {"BRK": "BRK-B"}

# SEC 표기 → 우리 티커. **위 사전만으로는 반쪽이다.**
#
# CIK 는 위에서 찾지만, 거래를 담을 때 쓰는 티커는 공시 안 `<issuerTradingSymbol>` 에서
# 온다(parse_filing 주석의 54건 사고 참고). 거기 값이 `BRK.B` 라 우리 사전의 `BRK` 와
# 안 맞고, 저장 직전 `our_tickers` 걸러내기에서 통째로 버려졌다 — 인덱스도 잡히고
# 파싱도 됐는데 마지막 한 줄에서 사라지니 로그에도 안 남는다(2026-09-05 실측:
# 08-13 공시 두 건에서 거래 3건이 파싱됐는데 표에는 0건).
#
# ⚠️ **구분자가 자리마다 다르다.** company_tickers.json 은 하이픈(BRK-B), Form 4 XML 은
#    점(BRK.A)이다. 둘 다 적어 둔다. 클래스도 A·B 둘 다 우리 `BRK` 로 모은다.
OURS_BY_SEC = {"BRK-A": "BRK", "BRK-B": "BRK", "BRK.A": "BRK", "BRK.B": "BRK"}


def ticker_by_cik(db) -> dict[int, str]:
    """us_stocks 의 티커를 SEC 의 티커↔CIK 표에 이어 붙인다.

    ⚠️ us_stocks 는 티커만 갖고 CIK 는 없다. SEC 의 company_tickers.json 이 그 다리다.
    사전이 자랄 수 있으므로 load_all 로 읽는다(1,000행 상한).
    """
    ours = {r["ticker"].upper() for r in load_all(db, "us_stocks", "ticker", order_by="ticker")}
    # SEC 쪽 표기 → 우리 표기. 별칭을 거친 종목도 결과에는 **우리 티커**로 담아야
    # 아래 집계·저장이 us_stocks 와 같은 열쇠를 쓴다.
    sec_to_ours = {SEC_TICKER_ALIAS.get(t, t): t for t in ours}
    raw = fetch("https://www.sec.gov/files/company_tickers.json")
    if not raw:
        raise SystemExit("SEC 티커 표를 못 받았다")
    out: dict[int, str] = {}
    for v in json.loads(raw).values():
        t = v["ticker"].upper()
        if t in sec_to_ours:
            out[int(v["cik_str"])] = sec_to_ours[t]
    missing = len(ours) - len(out)
    print(f"[사전] us_stocks {len(ours)}종목 중 CIK 가 잡힌 것 {len(out)}개 (못 잡은 것 {missing}개)")
    return out


def business_days(days: int) -> list[dt.date]:
    out: list[dt.date] = []
    d = dt.date.today()
    while len(out) < days:
        if d.weekday() < 5:
            out.append(d)
        d -= dt.timedelta(days=1)
    return sorted(out)


def index_rows(day: dt.date, cik2ticker: dict[int, str]) -> list[tuple[int, str, str]]:
    """그날 접수된 Form 4 중 우리 종목 것만 (CIK, 접수번호, 경로) 로 돌려준다."""
    q = (day.month - 1) // 3 + 1
    txt = fetch(f"https://www.sec.gov/Archives/edgar/daily-index/{day.year}/QTR{q}/form.{day:%Y%m%d}.idx")
    if not txt:
        return []
    # ⚠️⚠️ **같은 공시가 인덱스에 두 줄로 실린다** — 발행사 CIK 폴더와 신고자 CIK 폴더에
    #      각각 실려서 경로는 다르고 접수번호는 같다. 보통은 신고자 CIK 가 화이트리스트
    #      밖이라 저절로 하나만 남는데, **둘 다 우리 종목이면 같은 공시를 두 번 읽는다**
    #      (한 상장사가 다른 상장사의 10% 주주인 경우). 그러면 upsert 가
    #      "ON CONFLICT DO UPDATE command cannot affect row a second time" 로 죽는다.
    #      실제로 창을 7일 → 90일로 넓히자마자 터졌다. 접수번호로 지운다.
    seen: set[str] = set()
    out = []
    for line in txt.splitlines():
        if not line.startswith("4 "):
            continue
        parts = re.split(r"\s{2,}", line.strip())
        if len(parts) < 5:
            continue
        try:
            cik = int(parts[2])
        except ValueError:
            continue
        if cik not in cik2ticker:
            continue
        path = parts[4]
        acc = path.rsplit("/", 1)[-1].replace(".txt", "")
        if acc in seen:
            continue
        seen.add(acc)
        out.append((cik, acc, path))
    return out


def _val(block: str, tag: str) -> str | None:
    """``<tag><value>X</value></tag>`` 와 ``<tag>X</tag>`` 를 모두 받는다.

    ## ⚠️⚠️ 각주가 붙은 값을 놓치지 말 것

    Form 4 는 값에 주석을 달 때 ``<value>`` **뒤에 형제로** 각주를 붙인다::

        <transactionPricePerShare>
            <value>14.0453</value>
            <footnoteId id="F1"/>
        </transactionPricePerShare>

    닫는 태그가 ``</value>`` 바로 뒤에 온다고 못박은 정규식은 이걸 통째로 못 읽었다.
    가격에 각주를 다는 건 예외가 아니라 **관행**이다 — 여러 가격에 나눠 체결한 매도의
    가중평균을 그렇게 고지한다.

    실측(2026-08-22): 저장된 15,633건 중 10,767건(68%)이 가격을 잃은 상태였고, 장내
    매도만 보면 10,809건 중 9,321건(86%)이었다. 화면에는 그게 전부 "금액 미상"으로
    떴다 — **조용한 고장이라 숫자가 틀린 게 아니라 없어 보였다.** 표본 25공시를
    다시 열어 재보니 거래 116건 중 가격 80건(68%)·주식 수 35건(30%)을 되찾는다.

    ⚠️ 태그 안을 통째로 집은 뒤 그 안에서 ``<value>`` 를 찾는다. ``<value>`` 가 없는
       꼴(``<transactionCode>P</transactionCode>``)은 예전처럼 본문을 그대로 쓰되,
       다른 태그가 섞여 있으면 값이 아니므로 버린다.
    """
    m = re.search(rf"<{tag}>(.*?)</{tag}>", block, re.S)
    if not m:
        return None
    inner = m.group(1)
    v = re.search(r"<value>([^<]*)</value>", inner)
    if v:
        return v.group(1).strip() or None
    text = inner.strip()
    return text if text and "<" not in text else None


def _num(block: str, tag: str) -> float | None:
    v = _val(block, tag)
    if v is None:
        return None
    try:
        return float(v.replace(",", ""))
    except ValueError:
        return None


def parse_filing(doc: str, ticker: str, cik: int, acc: str, filed: dt.date, path: str) -> list[dict]:
    """⚠️⚠️ `ticker` 는 **폴더 CIK 로 찍은 짐작**일 뿐이다. 진짜는 공시 안에 있다.

    EDGAR 일별 인덱스는 같은 Form 4 를 두 줄로 싣는다 — 발행사 CIK 폴더와 **신고자**
    CIK 폴더. 접수번호로 중복은 지웠지만, 그때 **신고자 쪽 줄이 이기면 티커가 신고자
    회사 것이 된다.** 신고자도 상장사인 경우가 있어서다.

    실측(2026-08-21, 의심 공시 209건을 열어 대조): **54건이 어긋나 있었다.**

        HOOD ← 로빈후드가 자회사 펀드(RVI)를 신고   20건
        BAC  ← BofA 가 뉴빈·블랙록 지방채펀드를 신고 14건
        BX   ← 블랙스톤 계열이 브리저·코어브리지를    9건
        UBER ← 우버가 오로라(AUR)를 신고             2건
        GS   ← 골드만이 애토비아(ATTO)를 신고         1건 (주당 $21 — GS 주가가 아니다)

    화면엔 "골드만삭스 임원이 장내 매수 $10.3M"으로 떴다. 실제로는 골드만이 **다른
    회사를** 산 것이다. 그래서 이제 **`<issuerTradingSymbol>` 을 읽어** 그걸 쓴다.
    """
    # ⚠️ XML 이라 `&amp;` 같은 실체 참조가 들어 있다. 안 풀면 화면에 "Chairman &amp; CEO"
    #    가 그대로 찍힌다(실제로 그랬다). 파싱 전에 한 번 푼다.
    doc = html.unescape(doc)

    sym = (_val(doc, "issuerTradingSymbol") or "").upper().strip()
    issuer_cik = _num(doc, "issuerCik")
    # 심볼이 비었거나 "NONE"·"N/A" 인 제출이 있다. 그때만 폴더 CIK 의 짐작으로 돌아간다.
    if sym and sym not in ("NONE", "N/A", "NA", "-"):
        # 클래스가 나뉜 종목은 우리 표기로 되돌린다(BRK.B → BRK). 안 되돌리면 아래
        # our_tickers 걸러내기에서 조용히 버려진다(OURS_BY_SEC 주석).
        ticker = OURS_BY_SEC.get(sym, sym)
    if issuer_cik:
        cik = int(issuer_cik)
    owner_block = re.search(r"<reportingOwner>(.*?)</reportingOwner>", doc, re.S)
    ob = owner_block.group(1) if owner_block else ""
    owner = _val(ob, "rptOwnerName")
    title = _val(ob, "officerTitle")
    flag = lambda t: (_val(ob, t) or "0") in ("1", "true")  # noqa: E731

    url = "https://www.sec.gov/Archives/" + path
    rows = []
    for i, b in enumerate(re.findall(r"<nonDerivativeTransaction>(.*?)</nonDerivativeTransaction>", doc, re.S)):
        code = _val(b, "transactionCode")
        tdate = _val(b, "transactionDate")
        rows.append(
            {
                "accession_no": acc,
                "seq": i,
                "ticker": ticker,
                "issuer_cik": cik,
                "filed_date": filed.isoformat(),
                "transaction_date": tdate,
                "transaction_code": code,
                "shares": _num(b, "transactionShares"),
                "price": _num(b, "transactionPricePerShare"),
                "shares_after": _num(b, "sharesOwnedFollowingTransaction"),
                "acquired_disposed": _val(b, "transactionAcquiredDisposedCode"),
                "owner_name": owner,
                "owner_title": title,
                "is_director": flag("isDirector"),
                "is_officer": flag("isOfficer"),
                "is_ten_percent": flag("isTenPercentOwner"),
                "source_url": url,
            }
        )
    return rows


def window_txns(db, as_of: dt.date, window: int) -> list[dict]:
    """집계에 쓸 거래를 **DB 에서** 창 단위로 읽는다.

    ⚠️⚠️ 예전엔 이 실행에서 받은 것만 셌다. 그러면 **훑는 날수가 창보다 짧은 순간
         집계가 조용히 거짓이 된다** — 저장 키가 (as_of, window, ticker) 라 90일 행을
         5일치 숫자로 덮어쓴다. 실제로 `--days 5` 한 번에 73종목이 망가졌다.

    DB 에서 읽으면 그 함정이 사라지고, 덤으로 **매일 조금씩만 받아도 된다.** 90일을
    매 실행 훑으면 인덱스 65일 × 공시 수백 건이라 20분이 넘는다.
    """
    start = (as_of - dt.timedelta(days=window - 1)).isoformat()
    rows: list[dict] = []
    step = 1000
    off = 0
    while True:
        got = (
            db.table("us_insider_txn")
            .select("accession_no,ticker,transaction_code,owner_name,filed_date")
            .gte("filed_date", start)
            .lte("filed_date", as_of.isoformat())
            # ⚠️ 정렬 키가 유일해야 페이징이 행을 건너뛰지 않는다(accession_no 만으로는
            #    한 공시에 여러 줄이라 유일하지 않다).
            .order("accession_no")
            .order("seq")
            .range(off, off + step - 1)
            .execute()
            .data
        )
        rows += got
        if len(got) < step:
            break
        off += step
    return rows


def rollup(txns: list[dict], as_of: dt.date, window: int) -> list[dict]:
    """창 안의 거래를 종목별로 센다. 메인 표가 읽는 값이다."""
    start = as_of - dt.timedelta(days=window - 1)
    by: dict[str, list[dict]] = defaultdict(list)
    for t in txns:
        fd = dt.date.fromisoformat(t["filed_date"])
        if start <= fd <= as_of:
            by[t["ticker"]].append(t)
    out = []
    for ticker, rows in by.items():
        codes = [r["transaction_code"] for r in rows]
        out.append(
            {
                "as_of_date": as_of.isoformat(),
                "window_days": window,
                "ticker": ticker,
                "filing_count": len({r["accession_no"] for r in rows}),
                "txn_count": len(rows),
                "buy_count": sum(1 for c in codes if c in BUY_CODES),
                "sell_count": sum(1 for c in codes if c in SELL_CODES),
                "option_count": sum(1 for c in codes if c in OPTION_CODES),
                "other_count": sum(1 for c in codes if c not in BUY_CODES | SELL_CODES | OPTION_CODES),
                "person_count": len({r["owner_name"] for r in rows if r["owner_name"]}),
                "latest_filed_date": max(r["filed_date"] for r in rows),
            }
        )
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    # ⭐ 기본이 5영업일이다. 집계가 DB 를 읽으므로 매일 조금씩만 받으면 된다.
    #    주말·공휴일과 하루쯤 거른 실행까지 덮으라고 5로 뒀다(하루면 한 번 건너뛰는
    #    순간 그날 공시가 영영 안 들어온다).
    ap.add_argument("--days", type=int, default=5, help="며칠치 인덱스를 훑을지(기본 5영업일)")
    ap.add_argument("--window", type=int, default=WINDOW_DAYS, help="긴 집계 창(규모용)")
    ap.add_argument("--dry-run", action="store_true", help="DB 에 안 쓰고 측정만")
    ap.add_argument("--dump", type=str, default=None, help="결과를 JSON 으로 떨굴 경로")
    args = ap.parse_args()

    db = get_client()
    cik2ticker = ticker_by_cik(db)
    our_tickers = set(cik2ticker.values())

    txns: list[dict] = []
    empty_days = []
    dropped: dict[str, int] = defaultdict(int)
    for day in business_days(args.days):
        rows = index_rows(day, cik2ticker)
        if not rows:
            # ⛔ 여기서 멈추지 말 것. 오늘 것은 미국 장이 끝나야 생긴다.
            empty_days.append(day)
            print(f"  {day}  인덱스 비었음(오늘이거나 휴장일)")
            time.sleep(SLEEP)
            continue
        got = 0
        for cik, acc, path in rows:
            doc = fetch("https://www.sec.gov/Archives/" + path)
            time.sleep(SLEEP)
            if not doc:
                continue
            parsed = parse_filing(doc, cik2ticker[cik], cik, acc, day, path)
            # ⚠️ 발행사 티커가 우리 종목이 아니면 버린다. 이 축은 카더라 종목만 담는다
            #    안 버리면 신고자 쪽 줄로 들어온 남의 회사가 우리 표에 섞인다
            #    (로빈후드가 신고한 자회사 펀드 RVI 가 HOOD 로 들어온 식).
            # ⭐ 버린 것도 세어 둔다. 인덱스 CIK 는 우리 종목인데 발행사 티커가 우리
            #    사전에 없으면 둘 중 하나다 — 신고자 쪽 줄로 들어온 남의 회사(정상)이거나,
            #    **표기가 어긋나 제 종목을 못 알아본 것**(BRK.B 사고). 뒤엣것은 소리 없이
            #    사라지므로 심볼을 찍어 둔다.
            for r in parsed:
                if r["ticker"] not in our_tickers:
                    dropped[r["ticker"]] += 1
            parsed = [r for r in parsed if r["ticker"] in our_tickers]
            txns.extend(parsed)
            got += len(parsed)
        print(f"  {day}  공시 {len(rows):3d}건 → 거래 {got:3d}건")

    if not txns:
        print("가져온 거래가 없다. 인덱스가 아직 안 올라왔을 수 있다.")
        return

    as_of = max(dt.date.fromisoformat(t["filed_date"]) for t in txns)
    codes: dict[str, int] = defaultdict(int)
    for t in txns:
        codes[t["transaction_code"] or "?"] += 1
    total = sum(codes.values())
    print(f"\n거래 {len(txns)}건 · 종목 {len({t['ticker'] for t in txns})}개 · 창 끝점 {as_of}")
    if dropped:
        top = sorted(dropped.items(), key=lambda x: -x[1])[:8]
        print("  사전 밖이라 버린 발행사: " + " · ".join(f"{t} {n}건" for t, n in top))
        print("    ↳ 남의 회사면 정상이다. 우리 종목이 여기 보이면 표기가 어긋난 것이다(OURS_BY_SEC).")
    print("  코드: " + " · ".join(f"{c} {n}({n / total:.0%})" for c, n in sorted(codes.items(), key=lambda x: -x[1])))
    buys = [t for t in txns if t["transaction_code"] in BUY_CODES]
    print(f"  장내 매수(P): {len(buys)}건" + (f" — {', '.join(sorted({b['ticker'] for b in buys}))}" if buys else " (없음. 우리 종목에선 정상이다)"))

    if args.dry_run:
        if args.dump:
            Path(args.dump).write_text(json.dumps({"txns": txns}, ensure_ascii=False), encoding="utf-8")
            print(f"  → {args.dump} 에 떨굼")
        print(f"[dry-run] us_insider_txn {len(txns)}행 (쓰지 않음 · 집계는 DB 를 읽어야 해서 건너뛴다)")
        return

    # 날짜를 넘나들며 같은 공시가 또 실릴 수 있으므로 저장 직전에 한 번 더 지운다.
    uniq: dict[tuple[str, int], dict] = {}
    for t in txns:
        uniq[(t["accession_no"], t["seq"])] = t
    txns = list(uniq.values())
    for i in range(0, len(txns), 500):
        db.table("us_insider_txn").upsert(txns[i : i + 500], on_conflict="accession_no,seq").execute()
    print(f"[Supabase] us_insider_txn {len(txns)}행 upsert 완료")

    # ⭐ 집계는 **저장한 뒤 DB 에서** 만든다. 그래야 이번에 5일치만 받았어도 90일 창이
    #    제대로 나온다. 긴 창(규모)과 짧은 창(소식)을 둘 다 만든다 — 표의 기본키에
    #    window_days 가 있어 한 날짜에 두 벌이 나란히 산다.
    daily = rollup(window_txns(db, as_of, args.window), as_of, args.window) + rollup(
        window_txns(db, as_of, RECENT_DAYS), as_of, RECENT_DAYS
    )
    long_n = sum(1 for d in daily if d["window_days"] == args.window)
    short_n = sum(1 for d in daily if d["window_days"] == RECENT_DAYS)
    print(f"  집계(DB 기준): {args.window}일 창 {long_n}종목 · {RECENT_DAYS}일 창 {short_n}종목")
    if args.dump:
        Path(args.dump).write_text(json.dumps({"txns": txns, "daily": daily}, ensure_ascii=False), encoding="utf-8")
        print(f"  → {args.dump} 에 떨굼")

    for i in range(0, len(daily), 500):
        db.table("us_insider_daily").upsert(daily[i : i + 500], on_conflict="as_of_date,window_days,ticker").execute()
    print(f"[Supabase] us_insider_daily {len(daily)}행 upsert 완료")


if __name__ == "__main__":
    main()
