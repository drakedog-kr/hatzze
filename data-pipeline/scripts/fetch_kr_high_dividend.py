"""KRX KIND '고배당기업 현황'을 `kr_high_dividend` 에 upsert — 배당소득 분리과세 대상 기업 목록. 매일.

## 무엇인가

2026-01-01~2028-12-31 에 지급되는 배당 가운데 **고배당기업**(조세특례제한법 104조의27)의 배당은 2,000만원을
넘어도 종합과세에 합치지 않고 분리과세(2,000만원 이하 14% · 3억 이하 20% · 50억 이하 25% · 초과 30%,
지방소득세 별도)를 신청할 수 있다. 요건은 배당성향 40% 이상이거나, 25% 이상이면서 배당을 전년보다 10% 넘게
늘린 곳. **국내 주식 직접 보유만** — ETF·펀드·리츠·해외주식은 대상이 아니다.

어느 회사가 해당하는지는 회사가 '기업가치 제고 계획' 공시에 '고배당기업 여부: 해당'으로 스스로 적고, KIND 가
그 공시들을 모아 목록으로 보여 준다. 우리는 그 목록을 그대로 옮긴다 — 판정하지 않는다.

## 원천

    POST https://kind.krx.co.kr/valueup/dividend.do
         method=valueupHighDividendSub&forward=valueupHighDividend_sub&currentPageSize=3000

서버가 표를 그려서 준다(2026-09-13 실측 635곳, 유가 286 · 코스닥 349). 열은 회사명 · 공시 제목 · 사업연도 ·
결산월 · 배당성향(%) · 이익배당금 증가율(%). 회사명은 **법인명**이라(케이티·삼성화재해상보험·롯데칠성음료)
종목명과 다른 곳이 스무 곳쯤 있다 — 코드 찾기는 common/kind.py(종목명 → 발행사명 → 별칭). 못 찾으면 찍고 뺀다.
⚠️ KIND 는 거래소 사이트다. KRX Open API 와 같은 상자(비상업)로 본다.
⚠️ 페이지라 저쪽이 바뀌면 깨진다. 표가 300곳 아래로 줄면 저쪽이 바뀐 것으로 보고 저장하지 않는다.

실행:
    cd data-pipeline && source .venv/bin/activate
    python scripts/fetch_kr_high_dividend.py --dry-run
    python scripts/fetch_kr_high_dividend.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common.kind import code_lookup, norm, num, post_list, rows_of  # noqa: E402
from common.supabase_client import get_client, load_all_keyset  # noqa: E402
from common.timeutil import today_kst  # noqa: E402

TABLE = "kr_high_dividend"
URL = "https://kind.krx.co.kr/valueup/dividend.do"
PAGE_URL = "https://kind.krx.co.kr/valueup/dividend.do?method=valueupHighDividendMain"
# 이보다 적으면 페이지가 바뀐 것이다(실측 635). 저장도, 삭제도 안 한다.
MIN_ROWS = 300


def parse_list(page: str) -> list[dict]:
    """[{corp_name, market, kind_id, disclosure_id, title, biz_year, settle_month, payout_pct, div_growth_pct}]"""
    out: list[dict] = []
    for cells, tr in rows_of(page, 7):
        kid = re.search(r"companysummary_open\('(\w+)'\)", tr)
        disc = re.search(r"openDisclsViewer\('(\d+)'", tr)
        mkt = re.search(r"alt='(유가증권|코스닥|코넥스)'", tr)
        out.append({
            "corp_name": cells[1],
            "market": {"유가증권": "KOSPI", "코스닥": "KOSDAQ"}.get(mkt.group(1) if mkt else "", None),
            "kind_id": kid.group(1) if kid else None,
            "disclosure_id": disc.group(1) if disc else None,
            "disclosure_title": cells[2],
            "biz_year": int(cells[3]) if cells[3].isdigit() else None,
            "settle_month": int(cells[4]) if cells[4].isdigit() else None,
            "payout_pct": num(cells[5]),
            "div_growth_pct": num(cells[6]),
        })
    return out


def main() -> None:
    dry_run = "--dry-run" in sys.argv[1:]
    today = today_kst()
    page = post_list(URL, PAGE_URL, {
        "method": "valueupHighDividendSub", "forward": "valueupHighDividend_sub",
        "pageIndex": 1, "currentPageSize": 3000, "orderMode": 0, "orderStat": "D",
        "marketType": "", "selYear": "", "searchCorpName": "", "repIsuSrtCd": "", "isurCd": "", "acntclsMm": "",
    })
    if page is None:
        print("[고배당] KIND 목록을 못 받았습니다")
        sys.exit(1)
    items = parse_list(page)
    if len(items) < MIN_ROWS:
        print(f"[고배당] 표가 {len(items)}곳뿐 — 페이지가 바뀐 것 같아 저장하지 않습니다")
        sys.exit(1)
    db = get_client()
    lookup = code_lookup(db, today.year)
    rows: list[dict] = []
    unmatched: list[str] = []
    for it in items:
        hit = lookup.get(norm(it["corp_name"]))
        if not hit:
            unmatched.append(it["corp_name"])
            continue
        rows.append({"code": hit[0], "name": hit[1], **it, "computed_for": today.isoformat()})
    print(f"[고배당] KIND 고배당기업 {len(items)}곳 → 코드 찾음 {len(rows)} · 못 찾음 {len(unmatched)} {unmatched[:10]}")
    for r in rows[:6]:
        print(f"  {r['name']:12s} {r['market']} 배당성향 {r['payout_pct']}% · 증가율 {r['div_growth_pct']}% · {r['disclosure_title']}")
    if dry_run:
        print("[고배당] --dry-run: DB 에 쓰지 않았습니다")
        return
    for i in range(0, len(rows), 200):
        db.table(TABLE).upsert(rows[i : i + 200], on_conflict="code").execute()
    keep = {r["code"] for r in rows}
    stale = [r["code"] for r in load_all_keyset(db, TABLE, "code", key="code") if r["code"] not in keep]
    if stale:
        for i in range(0, len(stale), 200):
            db.table(TABLE).delete().in_("code", stale[i : i + 200]).execute()
    print(f"[Supabase] {TABLE} upsert {len(rows)}행 · 목록에서 빠진 {len(stale)}행 삭제")


if __name__ == "__main__":
    main()
