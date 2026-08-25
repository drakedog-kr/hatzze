"""미 하원의원의 주식 매매 신고(STOCK Act PTR)를 받아 us_congress_trade 에 저장한다.

내부자 리포트(/insider)의 세 번째 축이다. **세 축 가운데 카더라와 가장 잘 겹친다** —
실측(2026-08-19)으로 PTR 70건의 주식 거래 860건 중 220건(26%)이 카더라에 오른 종목이었다.

## 원천

    색인  disclosures-clerk.house.gov/public_disc/financial-pdfs/{연}FD.ZIP  (56KB, txt+xml)
    본문  disclosures-clerk.house.gov/public_disc/ptr-pdfs/{연}/{문서번호}.pdf

색인의 `FilingType == "P"` 가 정기 거래 보고(PTR)다. 2026년치는 8/17 기준 353건으로
하루 1.5건꼴이다. 임원 공시(하루 700~2,100건)와 견주면 사실상 없는 볼륨이다.

## ⚠️⚠️ 티커는 소괄호, 대괄호는 자산유형 코드다

    Chevron Corporation Common Stock (CVX) [ST]   ← CVX 가 티커, ST 는 Stock
    Treasury Bill (3-Month) [GS]                   ← GS 는 Government Security. **골드만삭스가 아니다**

처음 뽑아 본 공시가 정확히 그 형태였다. 대괄호를 티커로 읽었으면 국채 매매가 골드만삭스
매매로 태어났을 것이다. 그래서 `[ST]`(주식)만 담고 나머지 자산유형은 버린다.

## ⚠️ 스캔 공시는 못 읽는다 — 몇 건을 버렸는지 반드시 찍는다

문서번호가 8자리면 전자제출이라 PDF 에 텍스트 층이 있고 그냥 읽힌다. 7자리는 스캔
이미지라 추출이 0자다. 2026년치 353건 중 312건(88%)이 전자제출, 41건(12%)이 스캔이다.
스캔분은 OCR 이 필요한데 월 5~6건이라 지금은 **건너뛰고 그 수를 찍는다.**
⛔조용히 빠뜨리지 말 것 — 화면이 "전부 봤다"고 말하게 된다.

## ⚠️ 같은 종목이 여러 줄이어도 중복이 아니다

계좌가 다르면 따로 신고한다(같은 날 ABT 를 IRA 와 Roth IRA 에서 각각). 실측으로 확인했다.
합치거나 지우지 말 것.

## ⭐ 증분으로 읽는다

색인이 **연도 단위**라 돌 때마다 317건이 다 나오는데, 하루에 새로 올라오는 건 한두 건이다.
DB 에 있는 문서번호를 건너뛰면 5~8분이 몇 초가 된다. 임원·발굴 수집기는 날짜로 창을
잡아서 이 문제가 없고, 하원만 연도 색인이라 이 장치가 필요하다.

⚠️ 정정본은 새 문서번호로 올라오므로 증분으로도 잡힌다. 그래도 **주 1회는 `--full`** 로
전수를 돌려 어긋난 게 없는지 확인할 것.

## ⚠️ 하원 서버는 연속 요청에 연결을 끊는다

curl 로 http=000 이 연달아 났다. 재시도와 사이 쉼이 필수다.

실행:
    cd data-pipeline && source .venv/bin/activate
    python scripts/fetch_us_congress.py --dry-run     # 측정만
    python scripts/fetch_us_congress.py --limit 60    # 최근 60건만
    python scripts/fetch_us_congress.py               # 증분(이미 읽은 건 건너뜀)
    python scripts/fetch_us_congress.py --full        # 전수 재수집(주 1회 권장)
"""

from __future__ import annotations

import argparse
import datetime as dt
import io
import re
import sys
import time
import urllib.request
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common.supabase_client import get_client, load_all  # noqa: E402

# ⚠️ 기본 파이썬 UA 로는 하원 서버가 자주 끊는다. 브라우저 UA 로 간다.
UA = {"User-Agent": "Mozilla/5.0 (compatible; hatzze/1.0; +https://hatzze.fun)"}
SLEEP = 0.35

# 거래 한 줄. PDF 표가 칸 없이 붙어 나오므로 통째로 정규식으로 집는다.
#   (CVX) [ST] S (partial) 12/22/202512/22/2025$15,001 - $50,000
TXN_RE = re.compile(
    r"\(([A-Z][A-Z.\-]{0,5})\)\s*\[(\w{2,4})\]\s*(P|S|E)?\s*(?:\(partial\))?\s*"
    r"(\d{2}/\d{2}/\d{4})\s*(\d{2}/\d{2}/\d{4})\s*\$?([\d,]+)\s*-\s*\$?([\d,]+)"
)
# 담을 자산유형. ST 는 주식이다. 나머지(국채 GS · 펀드 · 부동산 …)는 이 화면의 재료가 아니다.
KEEP_ASSET = {"ST"}


def fetch(url: str, tries: int = 4, timeout: int = 45) -> bytes | None:
    for i in range(tries):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout).read()
        except Exception:
            if i == tries - 1:
                return None
            time.sleep(1.5 * (i + 1))
    return None


def index_rows(year: int) -> list[dict]:
    raw = fetch(f"https://disclosures-clerk.house.gov/public_disc/financial-pdfs/{year}FD.ZIP", timeout=90)
    if not raw:
        raise SystemExit("하원 색인 ZIP 을 못 받았다")
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        name = next(n for n in z.namelist() if n.endswith(".txt"))
        text = z.read(name).decode("latin-1")
    # ⚠️ CRLF 다. \r 을 안 떼면 마지막 칸(문서번호)에 붙어 자릿수 판정이 한 칸씩 틀린다.
    lines = text.replace("\r", "").splitlines()
    out = []
    for line in lines[1:]:
        p = line.split("\t")
        if len(p) < 9 or p[4] != "P":
            continue
        out.append(
            {
                "last": p[1], "first": p[2], "state_dst": p[5],
                "filed": p[7], "doc_id": p[8],
            }
        )
    return out


def parse_pdf(blob: bytes) -> tuple[bool, list[tuple]]:
    """(텍스트를 읽었나, 거래 목록).

    ⚠️ 둘을 갈라 돌려준다. 하나로 합치면 **스캔이라 못 읽은 것**과 **읽었는데 주식
    거래가 없는 것**(국채·펀드만 신고한 공시)이 같은 통에 들어가, 로그가 "못 읽었다"고
    거짓말한다. 실제로 40건 중 12건이 그렇게 뭉뚱그려져 있었다.
    """
    from pypdf import PdfReader

    try:
        reader = PdfReader(io.BytesIO(blob))
        text = "".join((page.extract_text() or "") for page in reader.pages)
    except Exception:
        return False, []
    if not text.strip():
        return False, []  # 스캔 이미지다
    return True, TXN_RE.findall(" ".join(text.split()))


def to_iso(mdy: str) -> str | None:
    """`4/15/2026` → `2026-04-15`.

    ⚠️ **0 을 채워야 한다.** 하원 색인은 월·일을 안 채워서 준다(`4/15/2026`). 안 채우면
    `2026-4-15` 가 되는데, Postgres 는 이걸 날짜로 잘 파싱하지만 **파이썬 문자열 비교가
    깨진다** — `"2026-8-13" >= "2026-08-10"` 이 참이 되어 증분 기준선이 무력해진다.
    실제로 그 탓에 매번 105건을 다시 읽고 있었다.
    """
    try:
        m, d, y = mdy.split("/")
        return f"{y}-{m.zfill(2)}-{d.zfill(2)}"
    except ValueError:
        return None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--year", type=int, default=dt.date.today().year)
    ap.add_argument("--limit", type=int, default=None, help="최근 N건만(생략하면 그 해 전부)")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--full", action="store_true", help="이미 읽은 공시도 다시 읽는다(주 1회 권장)")
    args = ap.parse_args()

    db = get_client()
    # ⭐ 2026-08-20: 카더라 화이트리스트를 풀었다. 그 필터가 신고 의원을 106명 → 52명으로
    #    깎고 있었다(올해 PTR 을 낸 하원의원 전원이 106명이다). 화면이 "미 하원의원 N명"을
    #    규모로 내세우므로, 신고한 사람은 전부 담고 카더라와의 겹침은 화면에서 가른다.
    #    ⚠️ us_congress_trade.ticker 의 us_stocks 외래키를 뗐다(migration_049).

    rows = index_rows(args.year)
    rows.sort(key=lambda r: tuple(reversed(r["filed"].split("/"))))
    scanned = [r for r in rows if len(r["doc_id"]) != 8]
    electronic = [r for r in rows if len(r["doc_id"]) == 8]
    print(f"{args.year}년 PTR {len(rows)}건 · 전자제출 {len(rows) - len(scanned)}건 · 스캔 {len(scanned)}건(건너뜀)")

    # ── 증분 ──────────────────────────────────────────────────────────
    # ⭐ 색인은 **연도 단위**라 돌 때마다 317건이 다 나온다. 그런데 하루에 새로 올라오는
    #   건 한두 건이다. 이미 읽은 문서번호를 건너뛰면 5~8분이 몇 초가 된다.
    #   (임원·발굴 수집기는 날짜로 창을 잡아서 이 문제가 없다. 하원만 연도 색인이다.)
    #
    # ⚠️ 정정본은 새 문서번호로 올라오므로 이 방식으로도 잡힌다. 그래도 무언가 어긋났을
    #   때를 대비해 **주 1회는 --full 로 전수**를 돌리는 것을 권한다.
    if not args.full:
        stored = load_all(db, "us_congress_trade", "doc_id,filed_date", order_by="doc_id")
        known = {str(r["doc_id"]) for r in stored}
        # ⚠️⚠️ **문서번호만으로는 부족하다.** 주식 거래가 없는 공시(채권·펀드만 신고한
        #      것)는 담을 행이 없어 DB 에 안 남고, 그래서 **매번 다시 읽힌다.** 실측으로
        #      317건 중 105건을 다시 읽었고 그중 94건이 이 경우였다(46초).
        #      그래서 **접수일 기준선**을 하나 더 둔다 — 이미 훑은 날짜대는 통째로 건너뛴다.
        #      기준선에서 7일을 빼는 건 늦게 올라오는 것을 놓치지 않기 위해서다.
        newest = max((str(r["filed_date"]) for r in stored if r["filed_date"]), default=None)
        cutoff = None
        if newest:
            d = dt.date.fromisoformat(newest) - dt.timedelta(days=7)
            cutoff = d.isoformat()
        before = len(electronic)
        electronic = [
            r
            for r in electronic
            if r["doc_id"] not in known and (cutoff is None or (to_iso(r["filed"]) or "9999") >= cutoff)
        ]
        print(
            f"증분: 이미 읽은 문서 {len(known)}개 + 접수일 {cutoff or '전체'} 이전을 건너뛴다"
            f" → {before}건 중 {len(electronic)}건만 읽는다"
        )
    else:
        print("전수 모드(--full): 이미 읽은 것도 다시 읽는다")

    if args.limit:
        electronic = electronic[-args.limit :]
    print(f"이번에 읽을 것 {len(electronic)}건")
    if not electronic:
        print("새로 올라온 공시가 없다.")
        return

    out: list[dict] = []
    stats = {"read": 0, "scan": 0, "no_stock": 0, "txn": 0, "asset_skip": 0}
    for n, r in enumerate(electronic, 1):
        url = f"https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/{args.year}/{r['doc_id']}.pdf"
        blob = fetch(url)
        time.sleep(SLEEP)
        if not blob:
            continue
        readable, hits = parse_pdf(blob)
        if not readable:
            stats["scan"] += 1
            continue
        stats["read"] += 1
        if not hits:
            stats["no_stock"] += 1
            continue
        member = f"{r['first']} {r['last']}".strip()
        seq = 0
        for ticker, asset, kind, tdate, ndate, low, high in hits:
            stats["txn"] += 1
            if asset not in KEEP_ASSET:
                stats["asset_skip"] += 1
                continue
            out.append(
                {
                    "doc_id": r["doc_id"], "seq": seq, "ticker": ticker.upper(),
                    "member": member, "state_dst": r["state_dst"],
                    "transaction_type": kind or None,
                    "transaction_date": to_iso(tdate), "notification_date": to_iso(ndate),
                    "amount_low": float(low.replace(",", "")), "amount_high": float(high.replace(",", "")),
                    "filed_date": to_iso(r["filed"]), "source_url": url,
                }
            )
            seq += 1
        if n % 50 == 0:
            print(f"  … {n}/{len(electronic)}건 · 우리 종목 거래 {len(out)}건")

    print(
        f"\n텍스트를 읽은 공시 {stats['read']}건 · 스캔이라 못 읽음 {stats['scan']}건 · "
        f"읽었지만 주식 거래 없음 {stats['no_stock']}건 · 뽑은 거래 {stats['txn']}건\n"
        f"  주식 아님으로 버림 {stats['asset_skip']}건\n"
        f"  → 담을 것 {len(out)}건 · 종목 {len({o['ticker'] for o in out})}개 · 의원 {len({o['member'] for o in out})}명"
    )
    if out:
        from collections import Counter

        top = Counter(o["ticker"] for o in out).most_common(10)
        print("  많은 종목: " + ", ".join(f"{t} {c}" for t, c in top))
        kinds = Counter(o["transaction_type"] or "?" for o in out)
        print("  거래 종류: " + " · ".join(f"{k} {v}" for k, v in kinds.most_common()))

    if args.dry_run:
        print(f"[dry-run] us_congress_trade {len(out)}행 (쓰지 않음)")
        return
    for i in range(0, len(out), 500):
        db.table("us_congress_trade").upsert(out[i : i + 500], on_conflict="doc_id,seq").execute()
    print(f"[Supabase] us_congress_trade {len(out)}행 upsert 완료")


if __name__ == "__main__":
    main()
