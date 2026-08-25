"""월가 거물 62명의 13F 보유를 받아 us_manager · us_manager_holding 에 저장한다.

내부자 리포트(/insider)의 세 번째 축이다. 임원(Form 4)·의원(STOCK Act)과 달리
**분기 자료**라 매일 돌릴 필요가 없다.

명단과 "왜 이 사람들인지 · 왜 지수형을 뺐는지"는 `config/us_managers.py` 에 있다.

## 언제 돌리나

13F 마감은 분기말 + 45일이다(2/14 · 5/15 · 8/14 · 11/14, 주말이면 다음 영업일).
마감 며칠 전부터 제출이 몰리므로 그 주에는 매일 돌려 새 제출을 주워야 한다.
평소에는 돌릴 이유가 없다 — 값이 안 바뀐다.

## ⚠️ 13F 는 티커를 안 준다 — CUSIP 으로 잇는다

CUSIP 과 회사명만 준다. 예전엔 **회사명으로** 이었다. 그 길은 두 군데서 조용히 틀린다.

  ① 겹치는 이름. SEC 티커 표 10,387개를 정규화하면 **1,447개 키가 겹친다**
     (`JPM`/`JPM-PC` 우선주 · `ASML`/`ASMLF` 해외 OTC 쌍둥이 · `GOOG`/`GOOGL`
      주식 종류 · `AMJB`·`VYLD` 은행 이름을 얹은 ETN). 먼저 온 놈이 이겨서
     알파벳이 `GOOGL` 아니라 `GOOG` 로 붙는 식이었다.
  ② 전환사채. 소로스가 든 `LUMENTUM HLDGS INC` 전환사채(CUSIP 55024UAF6)는
     이름이 보통주와 같아서 **LITE 보통주 물량에 합산됐다.**

CUSIP↔티커 표는 SEC 가 낸다 — **fails-to-deliver 파일**이다(반달마다, 1.7MB).
CUSIP·SYMBOL·DESCRIPTION 이 그대로 들어 있고, 알파벳 A 형(02079K305)과 C 형
(02079K107)을 정확히 갈라 준다.

실측(2026-08-21): 반달치 6개를 합치면 CUSIP 16,898개. 거물 6명의 보유 1,519종목 중
**1,503개(99%)가 이어졌다.** 못 이은 16개는 전부 전환사채였다 — 빠지는 게 맞다.

⚠️ fails 파일은 티커를 붙여 쓴다(`BRKB`). SEC 티커 표는 `BRK-B` 다. 영숫자만 남겨
   맞춘다(실측 18건: CRD-A · GEF-B · MOG-A · LEN-B · UHAL-B …).

## ⚠️ us_stocks 외래키를 뗐다 (migration_051)

예전엔 보유를 **카더라에 오른 종목만** 담았다. 그 필터가 62명 중 8명(칼 아이칸 ·
넬슨 펠츠 · 가이 스파이어 …)의 보유를 통째로 0건으로 만들고 있었다. 아이칸은
IEP·CVI 를 드는데 그게 카더라에 안 오르기 때문이다.

⛔ us_stocks 에 티커를 더해 푸는 길은 없다. 그 표는 카더라 추출 사전
   (`config/us_stock_extraction.py`)이 **매 실행 통째로 덮어쓴다.** 사전에 이름을
   더하면 본문 매칭 규칙이 늘어 오탐이 들어온다("비자"→H-1B 비자 297건).
   의원 축이 같은 이유로 migration_049 에서 이미 외래키를 뗐다.

## ⚠️ 두 분기를 쌓는다 (migration_050)

"늘린 종목 / 줄인 종목"은 직전 분기와 견줘야 나온다. 그래서 분기를 쌓고, **그
운용사의 그 분기만** 지우고 새로 넣는다. 통째로 지우면 과거가 또 날아간다.

⚠️ 운용사마다 기준 분기가 다르다(퍼싱 스퀘어가 한 분기 늦다). 화면이 운용사별
   최신 분기를 골라 읽는다 — 전체 최신 분기로 자르면 늦은 곳이 통째로 빠진다.

실행:
    cd data-pipeline && source .venv/bin/activate
    python scripts/fetch_us_13f.py --dry-run   # 측정만, DB 안 씀
    python scripts/fetch_us_13f.py             # 저장
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import io
import urllib.request
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common.supabase_client import get_client  # noqa: E402
from config.us_managers import US_MANAGERS  # noqa: E402

UA = {"User-Agent": "hatzze (contact: support@hatzze.fun)"}
SLEEP = 0.12

# fails-to-deliver 목록 페이지. 반달마다 파일 하나가 새로 걸린다.
FAILS_INDEX = "https://www.sec.gov/data-research/sec-markets-data/fails-deliver-data"
# 합칠 반달치 개수. 6개(약 3개월)로 커버율 99%를 실측했다. 늘려도 손해는 없지만
# 파일당 1.7MB 라 받는 시간만 는다.
FAILS_FILES = 6
# 사전이 이보다 작으면 원천이 바뀐 것이다. 조용히 0건을 쓰느니 죽는 게 낫다.
FAILS_FLOOR = 8_000
# 상장 거래소. OTC·미상장은 뺀다 — 시세도 로고도 못 붙이고, 카드에 올릴 것도 아니다.
LISTED = {"NYSE", "Nasdaq", "CBOE"}


def fetch(url: str, tries: int = 3, timeout: int = 60) -> str | None:
    for i in range(tries):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout).read().decode(
                "utf-8", "replace"
            )
        except Exception:
            if i == tries - 1:
                return None
            time.sleep(1.5 * (i + 1))
    return None


def _alnum(t: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", t.upper())


def ticker_by_cusip() -> dict[str, str]:
    """CUSIP → 티커. SEC 의 fails-to-deliver 파일에서 만든다(머리말 참고).

    ⚠️ 최신 파일부터 넣고 `setdefault` 로 굳힌다. 티커가 바뀐 종목은 **최신 표기**가
       이겨야 한다 — 옛 파일이 이기면 상장폐지된 옛 티커로 붙는다.
    """
    page = fetch(FAILS_INDEX)
    if not page:
        raise SystemExit("fails-to-deliver 목록 페이지를 못 받았다")
    # 파일명에 연월이 박혀 있어 그걸로 정렬한다. 페이지의 링크 순서는 믿지 않는다.
    links = sorted(set(re.findall(r'href="([^"]*cnsfails(\d{6})[ab]\.zip)"', page)), key=lambda x: x[1])
    if not links:
        raise SystemExit("fails-to-deliver 링크를 못 찾았다 — 페이지 구조가 바뀌었다")

    out: dict[str, str] = {}
    for path, _ in reversed(links[-FAILS_FILES:]):
        url = path if path.startswith("http") else "https://www.sec.gov" + path
        try:
            raw = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120).read()
            zf = zipfile.ZipFile(io.BytesIO(raw))
            body = zf.read(zf.namelist()[0]).decode("latin-1")
        except Exception as exc:
            print(f"  ! {path.split('/')[-1]} 를 못 읽었다({exc}). 나머지로 잇는다.")
            continue
        # SETTLEMENT DATE|CUSIP|SYMBOL|QUANTITY (FAILS)|DESCRIPTION|PRICE
        for line in body.splitlines()[1:]:
            p = line.split("|")
            if len(p) >= 3 and p[1].strip() and p[2].strip():
                out.setdefault(p[1].strip().upper(), p[2].strip().upper())
    if len(out) < FAILS_FLOOR:
        raise SystemExit(f"CUSIP 사전이 {len(out)}개뿐이다(기대 {FAILS_FLOOR}+). 원천이 바뀌었다")

    # SEC 티커 표에 맞춰 표기를 고르고, 상장된 것만 남긴다.
    raw = fetch("https://www.sec.gov/files/company_tickers_exchange.json")
    if not raw:
        raise SystemExit("SEC 티커 표를 못 받았다")
    tbl = json.loads(raw)
    ti, xi = tbl["fields"].index("ticker"), tbl["fields"].index("exchange")
    sec: dict[str, list] = {}
    for r in tbl["data"]:
        sec.setdefault(_alnum(r[ti]), []).append(r)

    fixed: dict[str, str] = {}
    dropped = 0
    for cusip, sym in out.items():
        rows = sec.get(_alnum(sym))
        if not rows:
            continue  # SEC 등록사가 아니다 — ETF·수익증권 따위
        live = [r for r in rows if r[xi] in LISTED]
        if not live:
            dropped += 1
            continue
        fixed[cusip] = live[0][ti]
    print(f"[사전] CUSIP {len(out):,}개 → 상장 종목으로 이어진 것 {len(fixed):,}개 (미상장 제외 {dropped:,})")
    return fixed


def _one_filing(cik: int, acc: str) -> str | None:
    listing = fetch(f"https://www.sec.gov/Archives/edgar/data/{cik}/{acc}/index.json", timeout=40)
    if not listing:
        return None
    # ⚠️⚠️ **대소문자를 가리면 안 된다.** 바이킹 글로벌의 2026-03-31 제출은 정보표가
    #      `MSFS13F033126.XML`(대문자)이라 `.xml` 검사에 안 걸렸다. 그러면 이 함수가
    #      None 을 주고, 부르는 쪽이 그 분기를 건너뛰어 **한 분기 더 과거와 견준다** —
    #      3개월 비교가 조용히 6개월 비교가 됐다. 경고도 안 났다.
    xmls = [
        it["name"]
        for it in json.loads(listing)["directory"]["item"]
        if it["name"].lower().endswith(".xml") and it["name"].lower() != "primary_doc.xml"
    ]
    if not xmls:
        return None  # 오래된 제출은 XML 이 아니라 txt/html 이다
    return fetch(f"https://www.sec.gov/Archives/edgar/data/{cik}/{acc}/{xmls[0]}")


def recent_13f(cik: int, want: int = 2) -> list[tuple[str, str]]:
    """[(기준 분기말, 정보표 XML)] 을 최신 순으로 최대 want 개.

    ⭐ **두 분기를 받는다.** "가장 많이 산/판 종목"은 직전 분기와 견줘야 나온다 —
    3월 31일에 없던 종목이 6월 30일에 생겼으면 신규 매수, 주식 수가 늘었으면 추가 매수다.

    ⚠️ 같은 분기를 두 번 담지 않는다. 정정 제출(13F-HR/A 가 아니라 같은 분기 재제출)이
    섞이면 분기가 중복돼 비교가 자기 자신과의 비교가 된다.
    """
    j = fetch(f"https://data.sec.gov/submissions/CIK{cik:010d}.json", timeout=40)
    if not j:
        return []
    rec = json.loads(j)["filings"]["recent"]
    out: list[tuple[str, str]] = []
    seen_q: set[str] = set()
    for i, form in enumerate(rec["form"]):
        if form != "13F-HR":
            continue
        report = rec["reportDate"][i]
        if report in seen_q:
            continue
        doc = _one_filing(cik, rec["accessionNumber"][i].replace("-", ""))
        time.sleep(SLEEP)
        if not doc:
            # ⚠️ 조용히 넘기면 그만큼 더 과거와 견주게 된다. 반드시 알린다.
            print(f"    ! {report} 제출({rec['accessionNumber'][i]})을 못 읽었다 — 한 분기 더 과거로 간다")
            continue
        seen_q.add(report)
        out.append((report, doc))
        if len(out) >= want:
            break
    return out


def holdings_of(doc: str) -> list[dict]:
    out = []
    for b in re.findall(r"<(?:\w+:)?infoTable>(.*?)</(?:\w+:)?infoTable>", doc, re.S):
        g = lambda t: (re.search(rf"<(?:\w+:)?{t}>([^<]*)<", b).group(1).strip() if re.search(rf"<(?:\w+:)?{t}>([^<]*)<", b) else None)  # noqa: E731
        num = lambda t: (float(g(t).replace(",", "")) if g(t) else None)  # noqa: E731
        name = g("nameOfIssuer")
        if not name:
            continue
        out.append({"name": name, "cusip": (g("cusip") or "").upper(), "value": num("value"), "shares": num("sshPrnamt")})
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="DB 에 안 쓰고 측정만")
    ap.add_argument("--dump", metavar="경로", help="받은 보유를 JSON 으로 떨군다(화면 재료를 DB 없이 재 볼 때)")
    ap.add_argument("--only", metavar="CIK", help="쉼표로 구분한 CIK 만 다시 받는다(한 곳을 고칠 때)")
    args = ap.parse_args()

    db = get_client()
    by_cusip = ticker_by_cusip()

    managers: list[dict] = []
    holdings: list[dict] = []
    prior_rows: dict[tuple, dict] = {}
    targets = US_MANAGERS
    if args.only:
        want = {int(x) for x in args.only.split(",")}
        targets = {k: v for k, v in US_MANAGERS.items() if k in want}
        print(f"[일부만] {', '.join(v[0] for v in targets.values())}")
    for cik, (person, firm) in targets.items():
        filings = recent_13f(cik)
        time.sleep(SLEEP)
        if not filings:
            print(f"  ✗ {person:<16} 최신 13F 를 못 읽었다 (CIK {cik})")
            continue
        # 첫 번째가 최신 분기다. 나머지는 비교용으로 담기만 한다.
        report, doc = filings[0]
        for q_report, q_doc in filings[1:]:
            for h in holdings_of(q_doc):
                t = by_cusip.get(h["cusip"])
                if not t:
                    continue
                prior = prior_rows.setdefault(
                    (cik, t, q_report),
                    {"cik": cik, "ticker": t, "report_date": q_report, "shares": 0.0, "value": 0.0, "cusip": h["cusip"]},
                )
                prior["shares"] += h["shares"] or 0
                prior["value"] += h["value"] or 0
        rows = holdings_of(doc)
        # ⚠️ 이제 **전부** 담는다(migration_051 로 us_stocks 외래키를 뗐다). 이어지지
        #    않는 것은 전환사채·미상장이라 빠지는 게 맞다 — 머리말 참고.
        mine: dict[str, dict] = {}
        for h in rows:
            t = by_cusip.get(h["cusip"])
            if not t:
                continue
            # 같은 종목을 여러 줄로 신고하기도 한다(계좌·재량 구분). 합친다.
            cur = mine.setdefault(t, {"cik": cik, "ticker": t, "report_date": report, "shares": 0.0, "value": 0.0, "cusip": h["cusip"]})
            cur["shares"] += h["shares"] or 0
            cur["value"] += h["value"] or 0
        # ⚠️ 서로 다른 종목 수로 센다. 한 종목을 계좌별로 여러 줄에 신고하기도 해서
        #    원시 행 수로 세면 코튜가 211(실제 63)이 되어 '지수형' 잣대가 어긋난다.
        #
        # ⚠️ **회사명이 아니라 CUSIP 으로 센다.** 이름으로 세면 주식 종류가 뭉쳐서
        #    실제보다 적게 나온다 — 버핏이 26(실제 29) · 게이너가 127(실제 129)이었다.
        #    이 수가 '지수형 300 초과' 잣대라 적게 세면 지수형이 명단에 남는다.
        distinct = len({h["cusip"] for h in rows if h["cusip"]})
        managers.append({"cik": cik, "person": person, "firm": firm, "report_date": report, "holding_count": distinct})
        holdings.extend(mine.values())
        flag = "  ← 지수형(300 초과)" if distinct > 300 else ""
        print(f"  ✓ {person:<16} 전체 {distinct:>5}종목 · 이어짐 {len(mine):>4}개 · {report}{flag}")

    if not managers:
        print("읽은 운용사가 없다.")
        return

    if args.dump:
        Path(args.dump).write_text(
            json.dumps({"managers": managers, "holdings": holdings, "prior": list(prior_rows.values())}),
            encoding="utf-8",
        )
        print(f"[dump] {args.dump}")

    # ⚠️⚠️ 13F 의 value 는 예전엔 **천 달러**, 2023년부터 달러다. 그런데 지금도 천 달러로
    #      내는 곳이 있다 — 실측으로 **세스 클라먼(바우포스트)이 그렇다**(주당 $0.35).
    #      값이 1000배 작으니 금액 순 정렬에서 늘 꼴찌로 밀리고, 화면이 "가장 크게 건
    #      사람"을 앞에 적으므로 **조용히 틀린 이름이 나간다.**
    #
    #      주당 금액으로 판별한다. 미국 상장주를 담는 13F 제출자의 포트폴리오 주당
    #      중앙값이 $5 아래일 수는 없다. 고치고 나서도 이상하면 그때는 경고만 남긴다.
    #
    # ⚠️⚠️ **신고서 하나하나를 따로 본다.** 예전엔 운용사 단위로 보면서 최신 분기만
    #      훑었는데, 그러면 비교용 직전 분기가 통째로 보정 밖에 남는다. 실측으로 클라먼과
    #      드러켄밀러가 2026-03-31 은 천 달러로, 2026-06-30 은 달러로 냈다 — **같은 곳이
    #      분기마다 단위를 바꾼다.** 한쪽만 보정되면 분기 대비 증감이 +161,142% 가 되고,
    #      화면은 그 숫자를 의심 없이 그대로 낸다.
    per_share: dict[tuple[int, str], list[float]] = {}
    for h in [*holdings, *prior_rows.values()]:
        if h["shares"] and h["value"]:
            per_share.setdefault((h["cik"], h["report_date"]), []).append(h["value"] / h["shares"])
    scale_of: dict[tuple[int, str], float] = {}
    for (cik, report), vals in sorted(per_share.items()):
        mid = sorted(vals)[len(vals) // 2]
        who = US_MANAGERS.get(cik, ("?", "?"))[0]
        if mid < 5:
            scale_of[(cik, report)] = 1000.0
            print(f"  ↺ {who} {report}: 천 달러 단위로 신고했다(주당 ${mid:,.2f}). 1,000배 해서 맞춘다")
        elif mid > 5000:
            print(f"  ⚠️ {who} {report}: 주당 ${mid:,.2f} 로 이상하다. 정렬이 뒤집힐 수 있으니 확인할 것")
    for h in [*holdings, *prior_rows.values()]:
        s = scale_of.get((h["cik"], h["report_date"]))
        if s and h["value"]:
            h["value"] *= s

    reports = {m["report_date"] for m in managers}
    print(
        f"\n운용사 {len(managers)}곳 · 최신 분기 보유 {len(holdings)}행 · 비교용 직전 분기 {len(prior_rows)}행"
        f" · 기준 분기 {sorted(reports)}"
    )
    if len(reports) > 1:
        print("  ⚠️ 기준 분기가 섞여 있다. 화면은 운용사마다 자기 분기를 적어야 한다.")

    from collections import Counter

    top = Counter(h["ticker"] for h in holdings).most_common(8)
    print("  많이 보유된 종목: " + ", ".join(f"{t} {c}/{len(managers)}" for t, c in top))

    if args.dry_run:
        print(f"[dry-run] us_manager {len(managers)}행 · us_manager_holding {len(holdings)}행 (쓰지 않음)")
        return

    # ⚠️ --only 로 일부만 받았어도 upsert 라 나머지 행은 그대로 남는다.
    for i in range(0, len(managers), 500):
        db.table("us_manager").upsert(managers[i : i + 500], on_conflict="cik").execute()
    print(f"[Supabase] us_manager {len(managers)}행 upsert 완료")

    # ⚠️⚠️ **그 운용사의 그 분기만** 지우고 넣는다(migration_050). 예전처럼 cik 로 통째로
    #      지우면 비교용 과거 분기가 같이 날아가 "가장 많이 산/판 종목"이 만들어지지 않는다.
    #      분기 안에서 빠진 종목은 지워져야 하므로(청산) 분기 단위 삭제는 유지한다.
    all_rows = holdings + list(prior_rows.values())
    quarters = {(r["cik"], r["report_date"]) for r in all_rows}
    for cik, report in quarters:
        db.table("us_manager_holding").delete().eq("cik", cik).eq("report_date", report).execute()
    for i in range(0, len(all_rows), 500):
        db.table("us_manager_holding").upsert(all_rows[i : i + 500], on_conflict="cik,ticker,report_date").execute()
    print(
        f"[Supabase] us_manager_holding {len(all_rows)}행 재적재 완료"
        f" (최신 {len(holdings)} · 직전 분기 {len(prior_rows)})"
    )


if __name__ == "__main__":
    main()
