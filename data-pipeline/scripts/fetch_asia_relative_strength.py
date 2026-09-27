"""yfinance의 니케이225(^N225)·항셍(^HSI)·대만가권(^TWII) 종가와 저장된
kospi_close_raw로 "아시아 3국 대비 코스피 상대강도"를 계산해 Supabase에 upsert.

각 지수(코스피 포함)마다 자기 자신의 거래일 기준으로 "최근 20거래일 수익률"을
따로 계산한다 — 시장마다 휴장일이 달라서 "20일 전"을 달력일이 아니라 그 지수
자체의 20번째 이전 거래일로 잡아야 정확하다(compute_20d_return). 그 다음
**코스피 거래일마다** 세 나라 각각의 "그날 이전 가장 최근 값"을 붙여(asof_value)
아시아 3국 평균 수익률과 코스피 초과 수익률(코스피 - 아시아 평균)을 계산한다.

⚠️ 처음엔 네 시계열의 **날짜 교집합**만 썼다. 그러면 한 나라만 쉬어도 그날 값이 비고,
나라마다 휴장이 번갈아 겹치면 지표가 며칠씩 멈춘다. 2026-09 에 일본 연휴(09-21~23)와
추석·대만 휴장이 이어져 09-18 값에 열흘 넘게 멈춰 있었고, 화면은 그 값을 오늘 값처럼
보여 줬다. 지금은 코스피가 연 날이면 값이 나온다. 다른 나라 값을 앞 거래일에서 가져온
날은 details.asof 에 그 날짜를 남긴다.

가져오는 값은 MAX_ASOF_DAYS(달력일) 안으로 제한한다. 2015~2026 야후 종가에서 잰 시장별
최장 휴장이 대만 13일(2023 설) · 일본 11일(2019 골든위크) · 홍콩 6일이라 14일이면 휴장은
다 덮고, 그보다 길게 비면 수집이 죽은 것이니 값을 만들지 않는다(그러면 check_freshness 가
기본 허용치로 잡는다).

kospi_close_raw가 가진 1년치 범위 안에서 계산 가능한 구간(각 시계열의 최초
20거래일 이후부터)을 매 실행마다 전부 다시 upsert한다 — raw_value는 동일하지만
카드용 세부값(각국 20일 수익률)을 details(JSONB)에 채워 넣기 위해서다.
normalized_score는 payload에 없어 보존되고, yfinance 조회는 어차피 매 실행마다
하므로 추가 비용은 없다.
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

TICKERS = {
    "일본(니케이225)": "^N225",
    "홍콩(항셍)": "^HSI",
    "대만(가권)": "^TWII",
}
RETURN_WINDOW = 20  # 최근 20거래일 수익률
BACKFILL_DAYS = 365
# 다른 나라 값을 앞 거래일에서 가져올 수 있는 최대 간격(달력일). 머리말 참고.
MAX_ASOF_DAYS = 14

KOSPI_RAW_SLUG = "kospi_close_raw"

INDICATOR_SLUG = "kospi_asia_relative_strength"
INDICATOR_META = {
    "slug": INDICATOR_SLUG,
    # "…상대강도" 를 뗐다. 카드 부제("일본·홍콩·대만 증시와 견준 코스피")가 이미 무엇과
    # 견주는지 말하고, 카드 안의 큰 수치도 "코스피 초과수익률"이라 적혀 있어서 제목의
    # '상대강도'는 같은 말을 세 번째로 하는 자리였다. 시트에서 제목이 두 줄로 접히던 것도
    # 이 카드뿐이었다.
    "name": "아시아 3국 대비 코스피",
    "headline": "일본·홍콩·대만 증시와 견준 코스피",
    "category": "시장",
    "description_beginner": "한국만 유독 앞서가면 쏠림이 심하다는 뜻입니다",
    "unit": "%p",
    # kospi_volume_surge/vkospi와 비슷한 급의 보조-시장 지표라 기본값(1)보다
    # 높게 잡는다. 지정하지 않으면 다른 새 지표들처럼 안전하게 1로 들어간다.
}


def get_indicator_id(client, slug: str) -> str:
    result = client.table("indicators").select("id").eq("slug", slug).execute()
    if not result.data:
        raise RuntimeError(
            f"indicator '{slug}'가 존재하지 않습니다. 해당 fetch 스크립트를 먼저 실행하세요."
        )
    return result.data[0]["id"]


def get_indicator_values(client, indicator_id: str, start: date) -> dict[str, float]:
    result = (
        client.table("indicator_values")
        .select("date,raw_value")
        .eq("indicator_id", indicator_id)
        .gte("date", start.isoformat())
        .execute()
    )
    return {row["date"]: float(row["raw_value"]) for row in result.data}


def fetch_prices(ticker: str, start: date, end: date) -> dict[str, float]:
    history = yf.Ticker(ticker).history(
        start=start.isoformat(), end=(end + timedelta(days=1)).isoformat()
    )
    # NaN 종가는 버린다 — 그대로 담으면 Supabase 저장에서 죽거나 지표가 조용히 NaN 이 된다
    # (common/yahoo_client.finite_close 주석).
    out: dict[str, float] = {}
    for ts, close in history["Close"].items():
        value = finite_close(close)
        if value is not None:
            out[ts.date().isoformat()] = value
    return out


def compute_20d_return(prices: dict[str, float]) -> dict[str, float]:
    """날짜순 정렬 기준 자기 자신의 20번째 이전 거래일 대비 수익률(%)을 계산한다."""
    dates = sorted(prices.keys())
    result = {}
    for i in range(RETURN_WINDOW, len(dates)):
        d, d_prev = dates[i], dates[i - RETURN_WINDOW]
        result[d] = (prices[d] / prices[d_prev] - 1) * 100
    return result


def asof_value(returns: dict[str, float], d: str) -> tuple[str, float] | None:
    """returns 에서 d 이하의 가장 최근 날짜와 값. 없거나 MAX_ASOF_DAYS 보다 오래되면 None."""
    dates = sorted(returns)
    i = bisect_right(dates, d)
    if i == 0:
        return None
    found = dates[i - 1]
    if (date.fromisoformat(d) - date.fromisoformat(found)).days > MAX_ASOF_DAYS:
        return None
    return found, returns[found]


def build_rows(
    kospi_returns: dict[str, float], asia_returns: dict[str, dict[str, float]]
) -> list[dict]:
    """코스피 거래일마다 한 행. 세 나라 중 하나라도 값을 못 붙이면 그날은 뺀다.

    반환: [{date, raw_value, details}] — details 는 카드가 그리는 네 나라 20일 수익률과,
    앞 거래일 값을 가져온 나라가 있으면 asof({키: 날짜}).
    """
    keys = {"^N225": "nikkei", "^HSI": "hangseng", "^TWII": "taiex"}
    rows = []
    for d in sorted(kospi_returns):
        picked = {t: asof_value(asia_returns.get(t, {}), d) for t in keys}
        if any(v is None for v in picked.values()):
            continue
        asia_avg = sum(v[1] for v in picked.values()) / len(keys)
        details: dict = {"kospi": round(kospi_returns[d], 2)}
        details.update({keys[t]: round(v[1], 2) for t, v in picked.items()})
        carried = {keys[t]: v[0] for t, v in picked.items() if v[0] != d}
        if carried:
            details["asof"] = carried
        rows.append(
            {"date": d, "raw_value": round(kospi_returns[d] - asia_avg, 2), "details": details}
        )
    return rows


def main() -> None:
    client = get_client()
    indicator_id = ensure_indicator(client, INDICATOR_META)
    kospi_raw_id = get_indicator_id(client, KOSPI_RAW_SLUG)
    print(f"[Supabase] indicator '{INDICATOR_SLUG}' id: {indicator_id}")

    today = date.today()
    start = today - timedelta(days=BACKFILL_DAYS)

    kospi_prices = get_indicator_values(client, kospi_raw_id, start)
    print(f"[Supabase] {KOSPI_RAW_SLUG} {len(kospi_prices)}건 조회")
    kospi_returns = compute_20d_return(kospi_prices)

    asia_returns: dict[str, dict[str, float]] = {}
    for name, ticker in TICKERS.items():
        prices = fetch_prices(ticker, start, today)
        returns = compute_20d_return(prices)
        print(f"[yfinance] {name}({ticker}) 종가 {len(prices)}건 → 20일 수익률 {len(returns)}건")
        asia_returns[ticker] = returns

    built = build_rows(kospi_returns, asia_returns)
    if not built:
        print(f"[{INDICATOR_SLUG}] 계산할 수 있는 코스피 거래일이 없습니다")
        return

    # 계산 가능한 날 전체를 매 실행마다 다시 upsert한다 — raw_value는 동일하지만 카드용
    # 세부값(각국 수익률)을 details에 채워 넣기 위해서다. normalized_score는 payload에
    # 없어 보존되고, yfinance 조회는 어차피 매 실행마다 하므로 추가 비용은 없다.
    rows = [{"indicator_id": indicator_id, **r} for r in built]
    client.table("indicator_values").upsert(
        rows, on_conflict="indicator_id,date"
    ).execute()
    carried_days = sum(1 for r in built if "asof" in r["details"])
    print(
        f"[Supabase] indicator_values upsert 완료: {len(rows)}건 (details 포함 · "
        f"다른 나라 값을 앞 거래일에서 가져온 날 {carried_days}건)"
    )

    latest = built[-1]
    dt = latest["details"]
    asia_avg = (dt["nikkei"] + dt["hangseng"] + dt["taiex"]) / 3
    note = ""
    if "asof" in dt:
        note = " · 앞 거래일 값: " + ", ".join(f"{k} {v}" for k, v in dt["asof"].items())
    print(
        f"[{INDICATOR_SLUG}] 최신값 ({latest['date']} 기준): "
        f"코스피 20일 수익률 {dt['kospi']:.2f}%, "
        f"아시아 3국 평균 {asia_avg:.2f}% "
        f"(일본 {dt['nikkei']:.2f}%, 홍콩 {dt['hangseng']:.2f}%, 대만 {dt['taiex']:.2f}%), "
        f"초과 수익률 {latest['raw_value']:.2f}%p{note}"
    )


if __name__ == "__main__":
    main()
