"""13F 와 TIC 을 접어 seohak_quarterly_returns 를 채운다.

화면이 `seohak_institution_13f` 23,356행을 통째로 읽지 않게 하는 게 첫째 목적이고,
둘째는 **두 수익률을 서로 다른 방법으로 내야 한다**는 사실을 한곳에 가둬 두는 것이다.

## 기관 수익률 — 앞 분기 수량을 고정한 재평가

13F 는 종목별 수량과 평가액을 주므로 `평가액 ÷ 수량` 으로 분기말 단가가 역산된다.
앞 분기 수량 × 이번 분기 단가로 다시 매기면 매매 효과가 빠진 순수 보유 수익률이다.

⚠️⚠️ **CUSIP 단위로 합산한 뒤에 단가를 내야 한다.** 처음에 기관별 행을 그대로
사전에 넣었더니 한 기관의 보유수량에 다른 기관의 단가가 곱해져 2024Q4 가 **+35.31%**
로 나왔다(실제 +2.15%). 같은 종목을 여러 기관이 들면 마지막 행이 이기는 구조였다.

역산 단가는 실제 종가와 대조해 확인했다(2024-09-30 TSLA $261.30 / 실제 $261.63 ·
NVDA $121.35 / $121.44 · AMZN $186.35 / $186.33).

## 전체 수익률 — 폐합식

TIC 은 종목이 없고 잔고와 순매수만 있어 `r = (잔고 − 앞잔고 − 순매수) ÷ 앞잔고` 를
쓴다. 잔고는 실측이고 순매수만 추정이라 잔차가 수익 쪽으로 흡수돼 닫힌다.

⚠️ 분기 단위에서는 이 값이 시장을 크게 밑돈다(2025Q2 나스닥 +17.8% 인데 +7.15%).
TIC 순매수가 연준 추정 분해값이라 상승 분기에 수익을 거래로 흡수하기 때문이다.
오차 방향이 랜덤이라 **누적에서 상쇄된다** — 7분기 복리 +20.89% vs 한 번에 닫으면
+22.21%. 그래서 이 표는 분기 값을 담되 화면은 누적을 크게 쓴다.

## 아직 다 안 낸 분기

13F 마감은 분기말 +45일이라 최근 분기는 한두 곳만 낸 상태로 보인다(실측: 2026-06-30
을 처음 조회했을 때 2곳, 며칠 뒤 다시 받으니 7곳). `filer_count` 를 같이 저장해
화면이 그런 분기를 빼고 그리게 한다.

실행:
    cd data-pipeline && source .venv/bin/activate
    python scripts/calculate_seohak_quarterly.py --dry-run
    python scripts/calculate_seohak_quarterly.py
"""

from __future__ import annotations

import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common.supabase_client import get_client  # noqa: E402

F13_TABLE = "seohak_institution_13f"
FLOW_TABLE = "seohak_country_flows"
OUT_TABLE = "seohak_quarterly_returns"

# TIC 의 한국 코드. 'KR' 이 아니다 — FRED 시리즈 접미사를 그대로 쓴다.
KOREA_CODE = "43001"
# 앞 분기와 겹치는 종목이 이보다 적으면 수익률을 안 낸다. 2024-06 이전 분기는
# 제출 기관이 한둘이라 겹침이 두 자리로 떨어진다.
MIN_OVERLAP = 200


def load_all(db, table: str, columns: str, **filters) -> list[dict]:
    """1000행 캡을 넘겨 전부 받는다. 파이프라인 안이라 전량조회가 허용되는 자리다."""
    out: list[dict] = []
    start = 0
    while True:
        q = db.table(table).select(columns)
        for key, value in filters.items():
            q = q.eq(key, value)
        page = q.range(start, start + 999).execute()
        rows = page.data or []
        out.extend(rows)
        if len(rows) < 1000:
            return out
        start += 1000


def main() -> None:
    dry_run = "--dry-run" in sys.argv
    db = get_client()

    f13 = load_all(db, F13_TABLE, "report_date, filer_name, cusip, value_usd, shares, suspect")
    flows = load_all(
        db, FLOW_TABLE, "month, holdings_usd_mn, net_purchase_usd_mn", country_code=KOREA_CODE
    )

    # ── 13F 를 분기 × CUSIP 으로 접는다 (합산이 먼저, 단가는 그다음)
    by_q: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(lambda: [0.0, 0.0]))
    filers: dict[str, set[str]] = defaultdict(set)
    for r in f13:
        filers[r["report_date"]].add(r["filer_name"])
        if r["suspect"]:
            continue
        value = float(r["value_usd"] or 0)
        shares = float(r["shares"] or 0)
        if value > 0 and shares > 0:
            slot = by_q[r["report_date"]][r["cusip"]]
            slot[0] += value
            slot[1] += shares

    # ── TIC 은 월별이다. 분기말 달의 잔고를 쓰고 순매수는 세 달을 더한다.
    tic = {
        r["month"][:7]: (
            float(r["holdings_usd_mn"] or 0) * 1e6,
            float(r["net_purchase_usd_mn"] or 0) * 1e6,
        )
        for r in flows
    }

    quarters = sorted(q for q in by_q if q[:7] in tic)
    rows: list[dict] = []
    prev: str | None = None
    for q in quarters:
        month = q[:7]
        inst = sum(v for v, _ in by_q[q].values())
        total = tic[month][0]
        row = {
            "quarter_end": q,
            "institution_usd": round(inst),
            "total_usd": round(total),
            "institution_share": round(inst / total, 6) if total else None,
            "institution_return": None,
            "total_return": None,
            "rest_return": None,
            "overlap_count": None,
            "filer_count": len(filers[q]),
        }

        if prev and tic.get(prev[:7]):
            a, b = by_q[prev], by_q[q]
            common = set(a) & set(b)
            row["overlap_count"] = len(common)
            base = sum(a[c][0] for c in common)
            if len(common) >= MIN_OVERLAP and base > 0:
                # 앞 분기 수량 × 이번 분기 역산 단가
                repriced = sum(a[c][1] * (b[c][0] / b[c][1]) for c in common)
                r_inst = repriced / base - 1

                prev_month = prev[:7]
                v0 = tic[prev_month][0]
                net = sum(v for m, (_, v) in tic.items() if prev_month < m <= month)
                r_all = (total - v0 - net) / v0 if v0 else None

                row["institution_return"] = round(r_inst, 6)
                if r_all is not None:
                    prev_share = sum(v for v, _ in a.values()) / v0 if v0 else 0
                    row["total_return"] = round(r_all, 6)
                    if 0 < prev_share < 1:
                        # 전체 = 기관몫 × 기관 + 나머지몫 × 나머지 → 나머지를 푼다
                        row["rest_return"] = round(
                            (r_all - prev_share * r_inst) / (1 - prev_share), 6
                        )
        rows.append(row)
        prev = q

    usable = [r for r in rows if r["institution_return"] is not None and r["filer_count"] >= 5]
    print(f"분기 {len(rows)}개 (수익률을 낸 분기 {len(usable)}개)\n")
    print("분기         기관몫   기관      전체      나머지   겹침  제출")
    for r in rows:
        pct = lambda k: f"{r[k]*100:+7.2f}%" if r[k] is not None else "      —"
        share = f"{r['institution_share']*100:5.1f}%" if r["institution_share"] else "    —"
        print(
            f"  {r['quarter_end']}  {share}  {pct('institution_return')}  "
            f"{pct('total_return')}  {pct('rest_return')}  "
            f"{r['overlap_count'] or 0:5,}  {r['filer_count']:2}"
        )

    if usable:
        c_i = c_r = 1.0
        for r in usable:
            c_i *= 1 + r["institution_return"]
            if r["rest_return"] is not None:
                c_r *= 1 + r["rest_return"]
        print(
            f"\n누적({usable[0]['quarter_end']} ~ {usable[-1]['quarter_end']}) · "
            f"기관 {(c_i-1)*100:+.2f}%  나머지 {(c_r-1)*100:+.2f}%"
        )

    if dry_run:
        print("\n--dry-run 이라 저장하지 않았습니다.")
        return
    db.table(OUT_TABLE).upsert(rows, on_conflict="quarter_end").execute()
    print(f"\n완료 · 저장 {len(rows)}행")


if __name__ == "__main__":
    main()
