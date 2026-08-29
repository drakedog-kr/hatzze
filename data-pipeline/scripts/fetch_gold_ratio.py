"""yfinance의 국제 금 선물(GC=F) 종가와 저장된 kospi_close_raw로 "금 대비 코스피
상대강도" 비율(코스피 종가 / 금 종가)을 계산해 Supabase에 upsert.

금은 GC=F(COMEX 금 선물)를 사용한다 — XAU=X(현물 표기)는 이 환경에서 404로
데이터가 전혀 나오지 않아 제외했다. 코스피는 원화, 금은 달러 기준이라 엄밀히는
환율 보정이 필요하지만, 지금 단계에서는 단순 비율로 시작한다(정밀한 환헤지
계산은 추후 과제).

**날짜의 주인은 코스피다.** 행 날짜 = 코스피 종가 날짜이고, 금은 그날 이전의 마지막
확정 종가를 붙인다.

예전엔 두 시계열의 **공통 날짜**만 계산했다. 그런데 금 세션은 21:00 UTC에 끝나
오후 실행 시각에도 그날 바가 진행 중이라 버려지고(fetch_gold_prices 참고), 그러면
공통 날짜의 끝이 늘 어제가 된다. 그 결과 이 카드만 코스피 카드보다 하루 뒤에 서서
**한 화면에 코스피가 둘로 적혔다** — 2026-07-30 실측으로 이 카드가 "코스피 5,663",
같은 화면의 코스피 상승 속도 카드와 상단 티커가 5,594 였다. 카드에 기준일 배지도
없어 어느 쪽이 오늘인지 알 길이 없었다.

지수는 코스피 신고가 대비 괴리율(fetch_kospi_high_gap)이 쓰는 것과 같은
kospi_close_raw 한 벌이므로, 그쪽 날짜에 맞추면 화면의 코스피 숫자가 하나가 된다.
금 종가가 하루 묵는 것은 남지만, 그건 이 지표가 재는 '상대강도'의 분모라 하루 차이가
비율에 주는 영향이 지수 쪽 불일치보다 훨씬 작고, 눈에 보이는 모순도 아니다.
근거를 남겨 두려고 details.gold_date 에 실제 금 종가 날짜를 적는다.

매 실행마다 계산 가능한 날짜를 전량 다시 쓴다.
"""

from __future__ import annotations

import sys
from bisect import bisect_right
from datetime import date, timedelta
from pathlib import Path

import yfinance as yf

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common.yahoo_client import finite_close  # noqa: E402
from common.supabase_client import get_client  # noqa: E402
from common.indicator import ensure_indicator  # noqa: E402

GOLD_TICKER = "GC=F"
BACKFILL_DAYS = 365
# 코스피 종가에 붙일 금 종가가 며칠까지 묵어도 되나(달력 일수).
# 평소엔 1~3일(주말·미국 휴장)이면 충분하다. 이보다 벌어지면 금 수집이 멎은 것이라,
# 낡은 분모로 비율을 만드느니 그 날짜를 건너뛴다.
GOLD_MAX_STALE_DAYS = 7

KOSPI_RAW_SLUG = "kospi_close_raw"

INDICATOR_SLUG = "kospi_gold_ratio"
INDICATOR_META = {
    "slug": INDICATOR_SLUG,
    "name": "금 대비 코스피 상대강도",
    "headline": "안전자산 금과 견준 코스피 강도",
    "category": "시장",
    # 1칸 카드로 줄면서(2026-07-23 코스닥 칸 제거) 설명이 혼자 한 줄 더 길어졌다 —
    # 같은 행 카드들이 35~51자인데 이것만 54자였다. 뜻은 그대로 두고 길이만 맞춘다.
    "description_beginner": "높을수록 안전자산보다 주식에 돈이 몰렸습니다",
    "unit": "배",
}


def get_indicator_id(client, slug: str) -> str:
    result = client.table("indicators").select("id").eq("slug", slug).execute()
    if not result.data:
        raise RuntimeError(
            f"indicator '{slug}'가 존재하지 않습니다. 해당 fetch 스크립트를 먼저 실행하세요."
        )
    return result.data[0]["id"]


def fetch_gold_prices(start: date, end: date) -> dict[str, float]:
    """확정된 금 종가만 돌려준다. **진행 중인 `end` 날짜 바는 버린다.**

    yfinance 의 마지막 일봉은 그날 세션이 끝나기 전이면 `Close` 에 현재가가 앉는다.
    코스피 일봉과 같은 함정인데(common/yahoo_client.py 참고) 금은 더 오래 열려 있어
    **오후 실행(~10:50 UTC)에도 그날이 안 끝나 있다.** COMEX 금은 21:00 UTC 마감이다.

    그대로 쓰면 코스피 확정 종가와 금 장중값을 한 비율에 섞는다. 실측으로 그 시각
    값과 확정 종가의 격차가 11일 평균 0.57% · 최대 1.24% 였다(07-27 은 4,102 →
    4,074). 전량 재계산이라 다음 날 아침에 저절로 고쳐지긴 했지만, 저녁부터 다음 날
    오전까지 화면과 방송이 그 값을 들고 있었다.

    버리면 금 종가는 **전날 확정값**으로 확정된다. 오전 실행 시각(01:45 UTC)에는 전날
    금 세션이 이미 끝나 있으므로(21:00 UTC 마감) 받는 즉시 최종값이고, 그날 오후 실행이
    다시 계산해도 같은 숫자다.

    ⚠️ 그래서 금은 코스피보다 한 거래일 묵는다. 예전엔 그 때문에 **지표 전체**가 하루
    물러섰는데, 지금은 행 날짜를 코스피에 맞추고 금만 직전 값을 쓴다(모듈 docstring 참고).
    """
    history = yf.Ticker(GOLD_TICKER).history(
        start=start.isoformat(), end=(end + timedelta(days=1)).isoformat()
    )
    prices = {}
    for ts, close in history["Close"].items():
        d = ts.date()
        if d >= end:
            print(f"[yfinance] {GOLD_TICKER}: {d} 는 아직 세션 진행 중이라 버립니다 ({close:.2f})")
            continue
        # 거래가 없었거나 데이터가 안 붙은 날은 NaN 으로 온다(common/yahoo_client.finite_close).
        value = finite_close(close)
        if value is None:
            print(f"[yfinance] {GOLD_TICKER}: {d} 종가가 비어 건너뜁니다")
            continue
        prices[d.isoformat()] = value
    return prices


def get_indicator_values(client, indicator_id: str, start: date) -> dict[str, float]:
    result = (
        client.table("indicator_values")
        .select("date,raw_value")
        .eq("indicator_id", indicator_id)
        .gte("date", start.isoformat())
        .execute()
    )
    return {row["date"]: float(row["raw_value"]) for row in result.data}


def pair_with_latest_gold(
    kospi_prices: dict[str, float], gold_prices: dict[str, float]
) -> list[tuple[str, float, str]]:
    """코스피 종가 날짜마다 그날 이전의 마지막 금 종가를 붙인다.

    반환: (코스피 날짜, 금 종가, 그 금 종가의 날짜) 를 날짜순으로.
    금 종가가 GOLD_MAX_STALE_DAYS 보다 묵었거나 아예 앞에 없으면 그 날짜는 뺀다.
    """
    gold_dates = sorted(gold_prices)
    out: list[tuple[str, float, str]] = []
    for d in sorted(kospi_prices):
        # d 이하인 마지막 금 날짜. 코스피 날짜가 늘어나는 순서라 bisect 로 곧장 찾는다.
        i = bisect_right(gold_dates, d) - 1
        if i < 0:
            continue
        g = gold_dates[i]
        if (date.fromisoformat(d) - date.fromisoformat(g)).days > GOLD_MAX_STALE_DAYS:
            continue
        out.append((d, gold_prices[g], g))
    return out


def main() -> None:
    client = get_client()
    indicator_id = ensure_indicator(client, INDICATOR_META)
    kospi_indicator_id = get_indicator_id(client, KOSPI_RAW_SLUG)
    print(f"[Supabase] indicator '{INDICATOR_SLUG}' id: {indicator_id}")

    today = date.today()
    start = today - timedelta(days=BACKFILL_DAYS)

    gold_prices = fetch_gold_prices(start, today)
    print(f"[yfinance] {GOLD_TICKER} 종가 {len(gold_prices)}건 조회")

    kospi_prices = get_indicator_values(client, kospi_indicator_id, start)
    print(f"[Supabase] {KOSPI_RAW_SLUG} {len(kospi_prices)}건 조회")

    pairs = pair_with_latest_gold(kospi_prices, gold_prices)

    if not pairs:
        print("[kospi_gold_ratio] 코스피 종가에 붙일 금 종가가 없습니다")
        return

    # 계산 가능한 날짜 전체를 매번 다시 쓴다(fetch_kosdaq_ratio·fetch_upbit_speculation과
    # 같은 이유) — 파생값이라 공식이나 details 스키마가 바뀌면 옛 행이 낡은 채로 남는다.
    # 실제로 2026-07-23 카드에 "코스피 6,798 ÷ 금 4,147"을 띄우려고 details를 새로 넣을 때,
    # '없는 날짜만 채우기' 방식이라 과거 행에 details가 안 들어가는 문제가 있었다.
    rows = [
        {
            "indicator_id": indicator_id,
            "date": d,
            "raw_value": kospi_prices[d] / gold,
            # 카드가 "1.65배"의 근거를 그대로 보여줄 수 있게 두 원값을 남긴다.
            # gold_date 는 화면에 안 쓰지만, 분모가 며칠 것인지 되짚을 수 있게 남긴다.
            "details": {
                "kospi_close": round(kospi_prices[d], 2),
                "gold_close": round(gold, 2),
                "gold_date": gold_date,
            },
        }
        for d, gold, gold_date in pairs
    ]
    client.table("indicator_values").upsert(
        rows, on_conflict="indicator_id,date"
    ).execute()
    print(f"[Supabase] indicator_values upsert 완료: {len(rows)}건 (전량 재계산)")

    latest_date, latest_gold, latest_gold_date = pairs[-1]
    lag = " (전일 금 종가)" if latest_gold_date != latest_date else ""
    print(
        f"[kospi_gold_ratio] 최신값 ({latest_date} 기준): "
        f"코스피 {kospi_prices[latest_date]:.2f} / 금 {latest_gold:.2f}"
        f"[{latest_gold_date}]{lag} = {kospi_prices[latest_date] / latest_gold:.4f}"
    )


if __name__ == "__main__":
    main()
