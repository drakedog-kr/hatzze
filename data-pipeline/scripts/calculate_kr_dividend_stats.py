"""`kr_dividend`(배당 기록) × `stocks`(상장 종목·전일 종가) → 종목별 배당 요약 `kr_dividend_stock`.

배당 계산기 화면이 읽는 표다. 화면이 7만 행짜리 기록을 매 요청 읽지 않도록, 종목마다
"최근 12개월에 1주당 얼마를 줬나 · 수익률 · 어느 달에 입금되나 · 몇 해째 주나 · 줄인 적이
있나" 를 여기서 한 번 계산해 둔다. 상장 종목(`stocks`) 전부에 한 행씩 — 배당 기록이 없는
종목도 0 으로 들어간다. 화면의 검색 목록이 이 표 하나로 끝나게 하려는 것이다.

## ⭐⭐ 연도별 합은 **회계연도**로 묶고, 회계연도는 지급 달로 가른다

2024년부터 결산 배당의 기준일을 12월 31일에서 이듬해 2~3월로 옮긴 회사가 많다(KB금융·
SK텔레콤·KT&G 등, 배당절차 개선). 기준일의 달력 연도로 합치면 옮긴 해에 결산 배당이
사라져 **배당을 줄인 것처럼 보인다** — 2024년 합에 FY2023 결산(2023-12-31 기준)은 들어가고
FY2024 결산(2025-02-28 기준)은 빠진다. 세 가지를 차례로 재 봤다.

  · 기준일 4월 1일 창(Y-1 년 4월 ~ Y 년 3월)  KB금융처럼 분기 기준일 전부를 두 달씩 미룬
    회사(3·6·9·12월 말 → 2·5·8·11월)는 옮긴 해에 3번만 잡힌다(2025: 2,390 vs 2024: 3,334).
  · 지급일의 해  기준일이 옮겨도 지급 달은 그대로라(KB 4·5·8·11월) 위 문제는 없어지는데,
    KB 가 2024년에 분기 배당을 고르게 올리고 결산 몫을 줄인 것이 걸린다 — FY2023 결산
    1,530원은 2024년에, FY2024 결산 804원은 2025년에 들어가 2025 가 준 것으로 보인다
    (3,566 vs 3,900). 회사가 말하는 '연간 배당'(FY2024 = 3,174 > FY2023 = 3,060)과 다르다.
  · **회계연도**  12월 결산 회사의 결산 배당은 주총(3월) 뒤 **4월까지** 지급되고, 분기·중간
    배당은 5월 이후에 지급된다. 그래서 지급 달이 1~4월이면 전년도 회계연도, 5월 이후면
    그해 회계연도다. KB FY2023 3,060 → FY2024 3,174 → FY2025 4,367 로 회사 발표와 맞는다.

원천이 '분기/결산' 구분을 안 주니 이 규칙이 가장 회사 발표에 가깝다. 12월 결산이 아닌
회사(`fiscal_month` ≠ 12, 리츠 다수)는 지급일의 달력 해로 묶는다 — 반기 배당이라 결산
구분이 뜻이 없다. 지급일이 비어 있으면(1만 2천 행 중 48행, 대부분 아직 안 정해진 미래분)
기준일 + 100일(지급 간격 중앙값 103일)로 대신한다.

'가장 최근 끝난 해'는 결산 배당이 4월에 지급되므로 **5월부터 작년**이고, 1~4월에는 재작년이다.

## 무엇을 재나

    ttm_dps        최근 12개월(오늘 기준) 현금배당 합. 계산기의 분자다. 미래 기준일은 뺀다
    ttm_yield_pct  ttm_dps ÷ 전일 종가(`stocks.close_price`) × 100
    pay_months     최근 12개월 지급일의 달. "어느 달에 입금되나" 달력
    ttm_payments   최근 12개월 지급 건 하나하나 [{pay:"2026-04-17", amount:566}, …]. 달력이
                   달마다 얼마인지 그릴 때 쓴다(합을 달 수로 나누면 KB 처럼 결산 몫이 큰
                   회사가 틀린다)
    annual         배당 연도별 합 {"2022": 1234, …} — 화면이 증가율·꾸준함을 설명할 때 쓴다
    streak_years   가장 최근 **끝난** 회계연도부터 거슬러 몇 해 연속 현금배당이 있었나
    cut_years_5    최근 5년 안에서 전년보다 줄인 해의 수(0 이면 한 번도 안 줄임).
                   ⚠️ 특별배당이 있던 다음 해는 줄인 해로 잡힌다(삼성전자 2022). 원천이
                   특별배당을 따로 표시하지 않아 가를 수 없다
    growth_5y_pct  5년 연평균 증가율(최근 끝난 해 ÷ 그 5년 전, 둘 다 > 0 일 때)
    ttm_unusual    최근 12개월 합이 **그 전 회계연도의 두 배를 넘는가.** 특별배당·청산배당이
                   섞인 표시다(코람코더원리츠 2026-08 8,900원 · 이지홀딩스 2026-03 1,361원).
                   화면은 이 종목의 수익률 옆에 "평소보다 큰 배당이 섞였습니다"를 적고,
                   바스켓은 이 종목을 거른다
    next_record_date  오늘 뒤의 가장 가까운 배당기준일(원천이 미리 준다). 없으면 null

⚠️ 금액은 전부 `cash_per_share`(액면분할 소급값)다. 명목값(`cash_per_share_nominal`)을
   쓰면 분할 전 해가 50배로 부풀어 증가율이 거짓이 된다(fetch_kr_dividends.py 머리말).
⚠️ 동시배당(현금+주식)은 현금 몫만 센다. 주식배당은 0 이다.

실행:
    cd data-pipeline && source .venv/bin/activate
    python scripts/calculate_kr_dividend_stats.py --dry-run   # 계산·미리보기만
    python scripts/calculate_kr_dividend_stats.py
"""

from __future__ import annotations

import sys
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common.supabase_client import execute_with_retry, get_client, load_all  # noqa: E402
from common.timeutil import today_kst  # noqa: E402

TABLE = "kr_dividend_stock"
CASH_KINDS = ("현금배당", "동시배당")
# 몇 해를 읽나. 5년 증가율·cut_years_5 는 6개 연도면 되지만 `streak_years`("몇 해째 주나")는
# 읽은 만큼만 셀 수 있다 — 7년만 읽으니 큰 회사가 전부 "7년째"로 같아져 뜻이 없었다.
# 15년이면 2011년부터라 1만 행쯤 더 읽고(페이지 48장) 은행·통신·KT&G 가 제 햇수를 갖는다.
YEARS_BACK = 15
CHUNK = 500
PAGE = 1000


PAY_LAG_FALLBACK_DAYS = 100  # 지급일이 비었을 때 기준일에 더하는 날수(실측 중앙값 103)
YEAR_END_PAY_LAST_MONTH = 4  # 12월 결산 회사의 결산 배당은 이 달까지 지급된다(머리말)


def fiscal_year(record: date, pay: date | None, fiscal_month: str | None) -> int:
    """연도별 합을 묶는 회계연도(머리말). 12월 결산이면 1~4월 지급분은 전년도다."""
    d = pay or record + timedelta(days=PAY_LAG_FALLBACK_DAYS)
    if (fiscal_month or "12").strip() == "12" and d.month <= YEAR_END_PAY_LAST_MONTH:
        return d.year - 1
    return d.year


def latest_complete_year(today: date) -> int:
    """이미 끝난 가장 최근 회계연도. 결산 배당이 4월에 지급되므로 5월부터 작년이다."""
    return today.year - 1 if today.month > YEAR_END_PAY_LAST_MONTH else today.year - 2


def load_records(db, since: date) -> list[dict]:
    """since 이후 기록. 기본키(isin, record_date)로 정렬해 페이지를 잇는다 — 단일 유일
    키가 없어 load_all 을 못 쓴다."""
    rows: list[dict] = []
    start = 0
    while True:
        page = execute_with_retry(
            db.table("kr_dividend")
            .select("code,record_date,kind,cash_per_share,pay_date,issuer_name,share_kind,fiscal_month")
            .gte("record_date", since.isoformat())
            .order("isin")
            .order("record_date")
            .range(start, start + PAGE - 1)
        ).data or []
        rows += page
        if len(page) < PAGE:
            return rows
        start += PAGE


def summarize(code: str, recs: list[dict], today: date, close: float | None) -> dict:
    ttm_from = today - timedelta(days=365)
    last_year = latest_complete_year(today)
    annual: dict[int, float] = defaultdict(float)
    ttm_dps = 0.0
    ttm_count = 0
    pay_months: set[int] = set()
    payments: list[dict] = []
    last_record: date | None = None
    last_pay: date | None = None
    next_record: date | None = None
    share_kind = None
    is_reit = False
    for r in recs:
        rd = date.fromisoformat(r["record_date"])
        share_kind = share_kind or r.get("share_kind")
        if "부동산투자회사" in (r.get("issuer_name") or ""):
            is_reit = True
        if rd > today:
            if r["kind"] != "무배당" and (next_record is None or rd < next_record):
                next_record = rd
            continue
        if r["kind"] not in CASH_KINDS:
            continue
        amt = float(r["cash_per_share"] or 0)
        if amt <= 0:
            continue
        pd = date.fromisoformat(r["pay_date"]) if r.get("pay_date") else None
        annual[fiscal_year(rd, pd, r.get("fiscal_month"))] += amt
        if last_record is None or rd > last_record:
            last_record = rd
        if pd and (last_pay is None or pd > last_pay):
            last_pay = pd
        if rd > ttm_from:
            ttm_dps += amt
            ttm_count += 1
            if pd:
                pay_months.add(pd.month)
            payments.append({"record": rd.isoformat(), "pay": pd.isoformat() if pd else None, "amount": round(amt, 2)})

    # 연속 배당 연수 — 가장 최근 끝난 회계연도부터 거슬러 센다.
    streak = 0
    y = last_year
    while annual.get(y, 0) > 0:
        streak += 1
        y -= 1
    # 최근 5년(last_year-4 … last_year) 각각을 전년과 견줘 줄인 해를 센다.
    cuts = 0
    for yy in range(last_year - 4, last_year + 1):
        prev, cur = annual.get(yy - 1, 0), annual.get(yy, 0)
        if prev > 0 and cur < prev:
            cuts += 1
    base, top = annual.get(last_year - 5, 0), annual.get(last_year, 0)
    growth = ((top / base) ** (1 / 5) - 1) * 100 if base > 0 and top > 0 else None
    # 12개월 합이 그 전 회계연도의 두 배를 넘으면 특별·청산배당이 섞인 것으로 본다.
    # 견주는 해가 '가장 최근 끝난 해'가 아니라 **그 전 해**인 까닭: 4월 결산 배당이 크게
    # 뛴 해는 최근 끝난 해 자체가 그 배당을 품고 있어 견줘도 안 걸린다(노바텍 2025).
    prev_fy = annual.get(last_year - 1, 0)
    unusual = prev_fy > 0 and ttm_dps > 2 * prev_fy

    return {
        "code": code,
        "share_kind": share_kind,
        "is_reit": is_reit,
        "ttm_dps": round(ttm_dps, 2),
        "ttm_count": ttm_count,
        "ttm_yield_pct": round(ttm_dps / close * 100, 3) if close and ttm_dps > 0 else None,
        "pay_months": sorted(pay_months),
        "ttm_payments": sorted(payments, key=lambda x: x["record"]),
        "annual": {str(k): round(v, 2) for k, v in sorted(annual.items()) if k <= last_year + 1},
        "streak_years": streak,
        "cut_years_5": cuts,
        "growth_5y_pct": round(growth, 2) if growth is not None else None,
        "ttm_unusual": bool(unusual),
        "last_record_date": last_record.isoformat() if last_record else None,
        "last_pay_date": last_pay.isoformat() if last_pay else None,
        "next_record_date": next_record.isoformat() if next_record else None,
    }


EMPTY = {
    "share_kind": None, "is_reit": False, "ttm_dps": 0, "ttm_count": 0, "ttm_yield_pct": None,
    "pay_months": [], "ttm_payments": [], "annual": {}, "streak_years": 0, "cut_years_5": 0, "growth_5y_pct": None,
    "ttm_unusual": False, "last_record_date": None, "last_pay_date": None, "next_record_date": None,
}


def main() -> None:
    dry_run = "--dry-run" in sys.argv[1:]
    db = get_client()
    today = today_kst()

    stocks = load_all(db, "stocks", "code,name,market,close_price,price_date,market_cap", order_by="code")
    if not stocks:
        raise RuntimeError("stocks 가 비어 있다 — 종목 마스터부터 채울 것(fetch_krx_stocks.py)")
    since = date(today.year - YEARS_BACK, 4, 1)
    recs = load_records(db, since)
    by_code: dict[str, list[dict]] = defaultdict(list)
    for r in recs:
        by_code[r["code"]].append(r)
    print(f"[배당 요약] 상장 {len(stocks):,}종목 · {since} 이후 기록 {len(recs):,}행 · 기록 있는 코드 {len(by_code):,}")

    rows: list[dict] = []
    for s in stocks:
        close = float(s["close_price"]) if s.get("close_price") else None
        code = s["code"]
        base = summarize(code, by_code[code], today, close) if code in by_code else {"code": code, **EMPTY}
        rows.append({
            **base,
            "name": s["name"],
            "market": s.get("market"),
            "close": close,
            "price_date": s.get("price_date"),
            "market_cap": float(s["market_cap"]) if s.get("market_cap") else None,
            "computed_for": today.isoformat(),
        })

    paying = [r for r in rows if r["ttm_dps"] > 0]
    with_yield = [r for r in paying if r["ttm_yield_pct"] is not None]
    print(
        f"[배당 요약] 최근 12개월 배당 있음 {len(paying):,}종목 · 5년 연속 {sum(1 for r in rows if r['streak_years'] >= 5):,}"
        f" · 그중 안 줄임 {sum(1 for r in rows if r['streak_years'] >= 5 and r['cut_years_5'] == 0):,}"
        f" · 다가오는 기준일 있음 {sum(1 for r in rows if r['next_record_date']):,}"
        f" · 평소보다 큰 배당 섞임 {sum(1 for r in rows if r['ttm_unusual']):,}"
    )
    for r in sorted(with_yield, key=lambda r: -r["ttm_yield_pct"])[:5]:
        print(f"  수익률 상위  {r['name']:14s} {r['ttm_yield_pct']:5.2f}%  12개월 {r['ttm_dps']:,.0f}원 · 지급월 {r['pay_months']}{' · 평소보다 큼' if r['ttm_unusual'] else ''}")
    for c in ("005930", "105560", "033780"):
        r = next((x for x in rows if x["code"] == c), None)
        if r:
            print(f"  {r['name']:8s} 12개월 {r['ttm_dps']:,.0f}원 · 수익률 {r['ttm_yield_pct']}% · 연속 {r['streak_years']}년 · 5년 중 줄임 {r['cut_years_5']} · 증가율 {r['growth_5y_pct']}% · 연도별 {r['annual']}")

    if dry_run:
        print("[배당 요약] --dry-run: DB 에 쓰지 않았습니다")
        return
    for i in range(0, len(rows), CHUNK):
        db.table(TABLE).upsert(rows[i : i + CHUNK], on_conflict="code").execute()
    print(f"[Supabase] {TABLE} upsert 완료: {len(rows):,}행 (기준일 {today})")


if __name__ == "__main__":
    main()
