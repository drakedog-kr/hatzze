"""yfinance의 USD/KRW(KRW=X) 종가로 원/달러 환율 변동성을 계산해 Supabase에 upsert.

변동성 = 최근 VOLATILITY_WINDOW(20)일 일별 변동률(%)의 표준편차. VKOSPI와
마찬가지로 "낮을수록 과열(방심)" 방향이다 — calculate_score.py에서
direction: "low"로 다뤄야 한다.

최초 실행 시 1년치를 백필하고, 이후에도 매 실행마다 계산 가능한 날짜 전체를 다시
계산해 upsert 한다(형제 스크립트들과 같은 방식). **진행 중인 오늘 바는 쓰지 않는다** —
자세한 이유는 fetch_volatility_series 주석에 있다.
"""

from __future__ import annotations

import sys
from datetime import date, timedelta
from pathlib import Path

import pandas as pd
import yfinance as yf

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common.supabase_client import get_client  # noqa: E402
from common.indicator import ensure_indicator  # noqa: E402

FX_TICKER = "KRW=X"
BACKFILL_DAYS = 365
VOLATILITY_WINDOW = 20  # 최근 20일 일별 변동률의 표준편차

INDICATOR_SLUG = "usdkrw_volatility"
INDICATOR_META = {
    "slug": INDICATOR_SLUG,
    "name": "원/달러 환율 변동성",
    "headline": "최근 30일 원/달러 환율 출렁임",
    "category": "시장",
    "description_beginner": "환율 출렁임이 너무 잔잔하면, 위험을 잊고 방심했다는 신호입니다",
    "unit": "%",
}


def fetch_volatility_series(start: date, end: date) -> dict[str, float]:
    """확정된 환율 종가만으로 20일 변동성을 낸다. **진행 중인 `end` 날짜는 버린다.**

    yfinance 의 마지막 일봉은 그날이 안 끝났으면 `Close` 에 현재가가 앉는다. 원/달러는
    24시간 돌아서 오전·오후 실행 **둘 다** 진행 중인 값을 받는다.

    그대로 두면 "확정 종가 19개 + 장중 1개"로 표준편차를 낸다. 재는 대상(일간 등락
    0.3~0.5%)과 그 오차(그 시각 값 vs 확정 종가, 13일 평균 0.39% · 최대 0.89%)가
    같은 크기라 결과가 크게 흔들렸다 — 저장값을 정상 재계산과 대조하니 **최대 7.1%**
    어긋나 있었다(07-27 0.4728 vs 0.5087).

    게다가 아래 upsert 가 '없는 날짜만' 쓰던 탓에 그 값이 **영영 안 고쳐졌다.**
    kospi_close_raw 가 당한 것과 같은 조합이다(common/timeutil.days_to_sync 참고).

    버리면 오전 실행 시점에 이미 확정된 자료만 쓰게 되므로 **하루 한 번, 쓰는 순간
    최종값**이다. 오후 실행이 다시 계산해도 같은 숫자라 카드가 안 흔들린다.
    """
    # 20일 이동 표준편차를 구하려면 start보다 더 이전 데이터가 필요하다.
    fetch_start = start - timedelta(days=VOLATILITY_WINDOW * 3)  # 주말/휴일 감안 여유치
    history = yf.Ticker(FX_TICKER).history(
        start=fetch_start.isoformat(), end=(end + timedelta(days=1)).isoformat()
    )
    closes = history["Close"]
    in_progress = [ts for ts in closes.index if ts.date() >= end]
    if in_progress:
        print(f"[yfinance] {FX_TICKER}: {in_progress[-1].date()} 는 아직 진행 중이라 버립니다")
        closes = closes[[ts.date() < end for ts in closes.index]]
    pct_change = closes.pct_change() * 100
    rolling_std = pct_change.rolling(window=VOLATILITY_WINDOW).std()

    result = {}
    for ts, value in rolling_std.items():
        if pd.isna(value):
            continue
        d = ts.date()
        if start <= d <= end:
            result[d.isoformat()] = float(value)
    return result


def main() -> None:
    client = get_client()
    indicator_id = ensure_indicator(client, INDICATOR_META)
    print(f"[Supabase] indicator '{INDICATOR_SLUG}' id: {indicator_id}")

    today = date.today()
    start = today - timedelta(days=BACKFILL_DAYS)

    volatility_series = fetch_volatility_series(start, today)
    print(f"[yfinance] {FX_TICKER} 변동성 {len(volatility_series)}건 계산")

    if not volatility_series:
        print("[usdkrw_volatility] 계산된 값이 없습니다")
        return

    # '없는 날짜만' 쓰던 것을 **전량 재계산**으로 바꾼다. 형제 스크립트 셋
    # (fetch_gold_ratio · fetch_asia_relative_strength · fetch_upbit_speculation)이
    # 이미 그렇게 하고 있었고, 이것만 예외였다. 빈 칸만 채우면 한 번 잘못 들어간 값을
    # 고칠 경로가 없어서, 장중 환율로 계산된 값이 그대로 굳어 있었다(최대 7.1% 왜곡).
    # 이제 진행 중인 날을 안 쓰므로 재계산해도 같은 숫자가 나온다 — 즉 평소엔 무해하고,
    # 과거에 잘못 든 값만 이 실행에서 한 번에 제자리를 찾는다.
    existing = (
        client.table("indicator_values")
        .select("date,raw_value")
        .eq("indicator_id", indicator_id)
        .gte("date", start.isoformat())
        .execute()
    )
    stored = {row["date"]: float(row["raw_value"]) for row in existing.data}

    rows = [
        {"indicator_id": indicator_id, "date": d, "raw_value": v}
        for d, v in volatility_series.items()
    ]
    client.table("indicator_values").upsert(rows, on_conflict="indicator_id,date").execute()
    fresh = sum(1 for r in rows if r["date"] not in stored)
    fixed = sum(
        1
        for r in rows
        if r["date"] in stored and abs(stored[r["date"]] - r["raw_value"]) > 1e-9
    )
    print(
        f"[Supabase] indicator_values upsert 완료: {len(rows)}건 (전량 재계산) "
        f"— 신규 {fresh}건 · 값이 바뀐 것 {fixed}건"
    )

    latest_date = max(volatility_series)
    print(
        f"[usdkrw_volatility] 최신값 ({latest_date} 기준): "
        f"{volatility_series[latest_date]:.4f}%"
    )


if __name__ == "__main__":
    main()
