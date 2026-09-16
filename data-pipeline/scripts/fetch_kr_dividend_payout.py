"""KRX KIND '배당정보'(상장법인 배당 관련 공시 요약)를 `kr_dividend_payout` 에 upsert — 배당성향. 매일.

## 무엇인가

배당성향 = 배당금 총액 ÷ 당기순이익. 이익의 몇 %를 배당으로 주는지라 "계속 줄 수 있나"의 첫 잣대다 —
100% 를 넘으면 번 것보다 많이 준 것이고, 적자면 셀 수 없다. 화면은 이 수치를 줄에 적고 100% 초과에 주의를 붙인다.
KIND 가 '주식배당결정'·'정기주주총회 결과' 공시에서 뽑아 회사마다 한 줄로 준다 — 사업연도·결산월·주당배당금·
배당성향(%)·총배당금액·시가배당률. 배당성향 뒤의 `*` 는 개별(별도) 당기순이익 기준이란 뜻이다(기본은 연결).

## 원천

    POST https://kind.krx.co.kr/disclosureinfo/dividendinfo.do
         method=searchDividendInfoSub&forward=dividendinfo_sub&selYear=<연도>&selYearCnt=1&currentPageSize=3000

2026-09-13 실측 FY2025 2,733곳(배당 있음 1,245). 12월 결산이 대부분이라 그해 값은 이듬해 3~4월 주총 뒤에 찬다 —
연도는 오늘 기준으로 "지난 사업연도"(1~4월엔 두 해 전)를 부르고, 행이 하한 아래면 그 전 해를 한 번 더 부른다.
회사명은 법인명이라 코드 찾기는 common/kind.py.

실행:
    cd data-pipeline && source .venv/bin/activate
    python scripts/fetch_kr_dividend_payout.py --dry-run
    python scripts/fetch_kr_dividend_payout.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common.kind import code_lookup, norm, num, post_list, rows_of  # noqa: E402
from common.supabase_client import get_client, load_all_keyset  # noqa: E402
from common.timeutil import today_kst  # noqa: E402

TABLE = "kr_dividend_payout"
URL = "https://kind.krx.co.kr/disclosureinfo/dividendinfo.do"
PAGE_URL = "https://kind.krx.co.kr/disclosureinfo/dividendinfo.do?method=searchDividendInfoMain"
# 한 해치가 이보다 적으면 아직 안 찼거나 페이지가 바뀐 것이다(실측 2,733).
MIN_ROWS = 1500
# 주총이 3~4월이라 4월까지는 지난해 값이 덜 찼을 수 있다 — 그때는 두 해 전을 먼저 본다.
STALE_UNTIL_MONTH = 4


def fetch_year(year: int) -> list[dict] | None:
    page = post_list(URL, PAGE_URL, {
        "method": "searchDividendInfoSub", "forward": "dividendinfo_sub", "pageIndex": 1, "currentPageSize": 3000,
        "orderMode": "", "orderStat": "", "searchCodeType": "", "searchCorpName": "", "repIsuSrtCd": "", "chkOrgData": "",
        "marketType": "", "settlementMonth": "", "selYear": year, "selYearCnt": 1,
    })
    if page is None:
        return None
    out: list[dict] = []
    # 칸: 회사명 · 사업연도 · 결산월 · 업종 · 업종별배당률 · 주식배당 · 액면가 · 기말주식수 · 주당배당금 · 배당성향 · 총배당금액 · 시가배당률
    for cells, _tr in rows_of(page, 12):
        out.append({
            "corp_name": cells[0],
            "biz_year": int(cells[1]) if cells[1].isdigit() else None,
            "settle_month": int(cells[2]) if cells[2].isdigit() else None,
            "sector": cells[3] or None,
            "dps": num(cells[8]),
            "payout_pct": num(cells[9]),
            "individual_basis": "*" in cells[9],
            "total_dividend": num(cells[10]),
            "market_yield_pct": num(cells[11]),
        })
    return out


def main() -> None:
    dry_run = "--dry-run" in sys.argv[1:]
    today = today_kst()
    year = today.year - (2 if today.month <= STALE_UNTIL_MONTH else 1)
    items = fetch_year(year)
    if items is not None and len(items) < MIN_ROWS:
        print(f"[배당성향] {year}년 표가 {len(items)}곳뿐 — 한 해 전을 봅니다")
        year -= 1
        items = fetch_year(year)
    if items is None:
        print("[배당성향] KIND 배당정보를 못 받았습니다")
        sys.exit(1)
    if len(items) < MIN_ROWS:
        print(f"[배당성향] {year}년 표가 {len(items)}곳뿐 — 페이지가 바뀐 것 같아 저장하지 않습니다")
        sys.exit(1)
    db = get_client()
    lookup = code_lookup(db, today.year)
    rows: list[dict] = []
    unmatched: list[str] = []
    for it in items:
        if it["dps"] is None:
            continue  # 배당이 없는 해는 담지 않는다 — 화면이 쓰는 건 성향이고, 없는 건 배당 표가 이미 말한다
        hit = lookup.get(norm(it["corp_name"]))
        if not hit:
            unmatched.append(it["corp_name"])
            continue
        rows.append({"code": hit[0], "name": hit[1], **it, "computed_for": today.isoformat()})
    over = [r for r in rows if (r["payout_pct"] or 0) > 100]
    print(f"[배당성향] KIND {year}년 {len(items)}곳 · 배당 있음 {sum(1 for i in items if i['dps'] is not None)} → 코드 찾음 {len(rows)} · 못 찾음 {len(unmatched)} {unmatched[:8]} · 100% 초과 {len(over)}")
    for r in rows[:5]:
        print(f"  {r['name']:12s} {r['biz_year']}년 주당 {r['dps']:,.0f}원 · 배당성향 {r['payout_pct']}%{' (개별)' if r['individual_basis'] else ''} · 시가배당률 {r['market_yield_pct']}%")
    if dry_run:
        print("[배당성향] --dry-run: DB 에 쓰지 않았습니다")
        return
    for i in range(0, len(rows), 200):
        db.table(TABLE).upsert(rows[i : i + 200], on_conflict="code").execute()
    keep = {r["code"] for r in rows}
    stale = [r["code"] for r in load_all_keyset(db, TABLE, "code", key="code") if r["code"] not in keep]
    if stale:
        for i in range(0, len(stale), 200):
            db.table(TABLE).delete().in_("code", stale[i : i + 200]).execute()
    print(f"[Supabase] {TABLE} upsert {len(rows)}행 · 이번 표에 없는 {len(stale)}행 삭제")


if __name__ == "__main__":
    main()
