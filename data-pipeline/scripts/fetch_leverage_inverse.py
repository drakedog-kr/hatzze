"""레버리지 ETF 와 인버스 ETF 의 거래대금 비율을 froth 지표로 저장 — '레버리지 대 인버스'.

비율 = 최근 20영업일 레버리지 거래대금 합 ÷ 인버스 거래대금 합
원값 = 그 비율 ÷ 앞 250영업일 비율의 중앙값('평소') (단위 배 · 1 이면 평소)

평소와 견주는 건 비율 수준이 해마다 옮겨 다녀서다 — 하락장을 겪은 해엔 인버스가 늘 많이 돈다(해마다 중앙값 2017 1.99 ·
2022 0.64 · 2026 1.82). 고정 눈금이면 그 무렵 고점이 차갑게 읽힌다. 매주 표본 '고점 > 바닥' 그대로 0.88 → 1년 평소 대비 0.96.

오른다에 건 돈과 내린다에 건 돈의 비율이다. 레버리지 ETF 거래대금 크기만 보면(레버리지 지표의 ETF 반쪽) 2016~2026
고점 6·바닥 8 에서 '고점 > 바닥' 0.54 였는데, 인버스와 견주면 1.00 이었다(2026-10-06, 매주 하루 표본 · 4주 평균).

## 무엇을 넣나 — 코스피200 · 코스닥150 대표지수만

KRX OPEN API ETF 일별매매정보(etp/etf_bydd_trd)에서 추종 지수(IDX_IND_NM)가 코스피 200 · 코스피 200 선물지수 · 코스닥 150 ·
F-코스닥150 지수인 것만 고른다. 이름에 '인버스'가 들면 인버스(곱버스 포함), '레버리지'·'2X'가 들면 레버리지다.
⚠️ 이름으로 고르면 KODEX 레버리지 · KODEX 인버스 같은 대표 상품이 빠진다 — 추종 지수 칸으로 고를 것.
빼는 것(2026-10-07 하루 거래대금): 단일종목·업종 레버리지(레버리지 거래의 35% · 2026-05 말에 생겨 넣으면 그날부터 비율이
계단처럼 뛴다) · 해외 지수 · 원자재 · 채권 · 통화(합쳐 170억 남짓).

## 받는 법

하루치가 한 번 호출이다. 그날 거래대금은 내부용 원본(leverage_inverse_raw · 공개 안 함)에 남기고, 빠진 날만 새로 받는다
(LOOKBACK_DAYS 안에서 한 번에 MAX_CALLS 까지 · 처음엔 2년치 500여 번). 공개 지표에는 평소가 찬 날만 쓴다.
KRX 는 그날치를 다음 날 아침에 준다 — 빈 응답은 저장하지 않고 다음 실행이 다시 받는다.

실행:
    cd data-pipeline && source .venv/bin/activate && python scripts/fetch_leverage_inverse.py
"""

from __future__ import annotations

import sys
import time
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common.indicator import ensure_indicator, upsert_merged  # noqa: E402
from common.krx_client import krx_get  # noqa: E402
from common.supabase_client import get_client, load_keyset  # noqa: E402
from common.timeutil import krx_trading_days, today_kst  # noqa: E402

URL = "https://data-dbg.krx.co.kr/svc/apis/etp/etf_bydd_trd"
INDEXES = {"코스피 200", "코스피 200 선물지수", "코스닥 150", "F-코스닥150 지수"}
WINDOW = 20  # 영업일
BASE_DAYS = 250  # '평소' = 앞 250영업일 비율의 중앙값
MIN_BASE_DAYS = 120
LOOKBACK_DAYS = 800  # 카드 차트 1년 + 평소 1년 + 20일 합
MAX_CALLS = 600
# 카드가 차트 대신 두 줄 막대라 날짜별 점을 싣지 않는다. 키만 남겨 둬 지난 행에 실렸던 점을 upsert_merged 가 걷게 한다.
SERIES_KEYS = ("w_dates", "w_ratio", "w_base")

RAW_META = {
    "slug": "leverage_inverse_raw",
    "name": "레버리지·인버스 하루 거래대금 (내부용 원본)",
    "category": "시장",
    "description_beginner": "레버리지 대 인버스 지표가 쓰는 하루 거래대금입니다.",
    "unit": "배",
    "is_public": False,
}

INDICATOR_SLUG = "leverage_inverse_ratio"
INDICATOR_META = {
    "slug": INDICATOR_SLUG,
    "name": "레버리지 대 인버스",
    "category": "시장",
    "headline": "레버리지 거래대금 ÷ 인버스 거래대금",
    "description_beginner": "평소보다 레버리지 쪽으로 쏠리면 과열 신호입니다",
    "unit": "배",
}


def split(rows: list[dict]) -> tuple[float, float]:
    """그날 대표지수 레버리지 · 인버스 거래대금(원)."""
    lev = inv = 0.0
    for x in rows:
        if x.get("IDX_IND_NM") not in INDEXES:
            continue
        name, val = x["ISU_NM"], float(x.get("ACC_TRDVAL") or 0)
        if "인버스" in name:
            inv += val
        elif "레버리지" in name or "2X" in name.upper():
            lev += val
    return lev, inv


def build_rows(days: dict[str, tuple[float, float]]) -> list[dict]:
    """날짜마다 20영업일 합의 비율을 앞 BASE_DAYS 영업일 비율의 중앙값과 견준다. 평소가 MIN_BASE_DAYS 일 안 찼으면 건너뛴다."""
    from statistics import median

    keys = sorted(days)
    ratios: list[tuple[str, float, float, float]] = []
    for i in range(WINDOW - 1, len(keys)):
        win = keys[i - WINDOW + 1 : i + 1]
        lev = sum(days[k][0] for k in win)
        inv = sum(days[k][1] for k in win)
        if inv:
            ratios.append((keys[i], lev / inv, lev, inv))
    rows = []
    for j in range(len(ratios)):
        prior = ratios[max(0, j - BASE_DAYS) : j]
        if len(prior) < MIN_BASE_DAYS:
            continue
        d, ratio, lev, inv = ratios[j]
        base = median(r[1] for r in prior)
        rows.append(
            {
                "date": d,
                "raw_value": round(ratio / base, 3),
                "details": {
                    "ratio": round(ratio, 3),
                    "base": round(base, 3),
                    "lev_20d_jo": round(lev / 1e12, 1),
                    "inv_20d_jo": round(inv / 1e12, 1),
                    # 카드 '1년 평소' 막대의 말풍선 — 앞 1년 20일 거래대금 합계의 중앙값을 평소 몫(base)으로 나눈 것.
                    # 레버리지 · 인버스를 따로 중앙값 내면 둘의 비율이 base 와 달라 막대 %와 말풍선이 어긋난다(10-08 53.1 · 30.5 = 64% vs 막대 61%).
                    "lev_base_jo": round(median(r[2] + r[3] for r in prior) * base / (1 + base) / 1e12, 1),
                    "inv_base_jo": round(median(r[2] + r[3] for r in prior) / (1 + base) / 1e12, 1),
                },
            }
        )
    return rows


def main() -> None:
    client = get_client()
    indicator_id = ensure_indicator(client, INDICATOR_META)
    raw_id = ensure_indicator(client, RAW_META)

    stored = load_keyset(client, "indicator_values", "id,date,details", narrow=lambda q: q.eq("indicator_id", raw_id))
    days = {r["date"]: (r["details"]["lev"] * 1e8, r["details"]["inv"] * 1e8) for r in stored if (r.get("details") or {}).get("lev")}
    today = today_kst()
    todo = [d for d in krx_trading_days(today - timedelta(days=LOOKBACK_DAYS), today) if d.isoformat() not in days]
    todo = sorted(todo, reverse=True)[:MAX_CALLS]  # 최근 날부터
    fresh = []
    for d in todo:
        resp = krx_get(URL, d.strftime("%Y%m%d"))
        if resp is None or resp.status_code != 200:
            continue
        lev, inv = split(resp.json().get("OutBlock_1") or [])
        if lev and inv:
            days[d.isoformat()] = (lev, inv)
            fresh.append({"indicator_id": raw_id, "date": d.isoformat(), "raw_value": round(lev / inv, 3), "details": {"lev": round(lev / 1e8), "inv": round(inv / 1e8)}})
        time.sleep(0.05)
    for i in range(0, len(fresh), 500):
        client.table("indicator_values").upsert(fresh[i : i + 500], on_conflict="indicator_id,date").execute()
    print(f"[KRX] ETF {len(todo)}일 조회 · {len(fresh)}일 새로 받음 · 모은 날 {len(days)}일")

    rows = build_rows(days)
    if not rows:
        print(f"[레버리지 대 인버스] 평소를 낼 만큼 안 모였습니다({WINDOW}+{MIN_BASE_DAYS}영업일) — 다음 실행이 이어 받습니다")
        return
    last = rows[-1]["details"]
    print(f"[레버리지 대 인버스] 최신 {rows[-1]['date']} 평소의 {rows[-1]['raw_value']}배 (20일 비율 {last['ratio']} · 평소 {last['base']})")
    n = upsert_merged(client, indicator_id, rows, SERIES_KEYS)
    print(f"[Supabase] {n}일 upsert 완료")


if __name__ == "__main__":
    main()
