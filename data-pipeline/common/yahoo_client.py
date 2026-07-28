"""야후 파이낸스 차트 JSON에서 지수 종가를 받는 공통 헬퍼.

**왜 KRX 대신 야후인가.** KRX Open API 는 T일 종가를 T+1 오전(실측 07:40~10:44 KST)에야
올린다. 그래서 오후 실행(~19:50 KST)조차 그날 종가를 못 받고, 화면·방송이 늘 하루 늦은
값을 들고 있었다 — 2026-07-28 코스피가 -10.8% 로 밀린 날 저녁 리포트가 그 폭락을 통째로
놓쳤다. 야후는 같은 값을 장 마감 직후에 준다(7/27 종가가 KRX 와 소수점까지 일치:
코스피 6755.75 · 코스닥 764.86). 지수 종가에 한해 소스를 야후로 옮긴 이유다.

⚠️ **야후로 대체할 수 있는 건 '종가'뿐이다.** 거래대금(원)·VKOSPI·옵션 풋콜·시가총액·
선물 미결제약정·전종목 거래대금은 야후에 아예 없다(`^VKOSPI` 는 404, 차트 JSON 의
`volume` 은 거래대금이 아니라 주식 수다). 그 지표들은 KRX Open API 를 그대로 쓴다.

## 이 파일이 막는 함정 셋

1. **오늘 바의 `close` 는 `None` 이다.** 일봉 배열은 장이 끝나도 한동안(실측 7/28 종가가
   7/29 01:0x 에도) 안 채워지고, 당일 값은 `meta.regularMarketPrice` 에만 실린다.
   `close[-1]` 을 그냥 읽으면 그날이 조용히 빈다. 그래서 **과거는 배열, 오늘은 meta** 로
   출처를 나눈다.

2. **장중 값을 종가로 쓰면 안 된다.** 아침 실행은 ~10:45 KST 로 정규장(09:00~15:30)
   한복판이라, meta 를 그대로 받으면 장중 시세가 그날의 '종가'로 저장된다.
   `kospi_high_gap` 은 그 값으로 52주 전고점까지 판정하므로 장중 스파이크가 전고점으로
   굳을 수 있다(다음 실행이 덮어쓰긴 하나 그때까진 화면이 틀린다). MARKET_CLOSE_KST
   이후에만 오늘 값을 인정한다.

3. **야후가 낡은 값을 확신에 차서 준다.** `lib/yahoo-quote.ts` 와 같은 사고다 — 2026-07-28
   15:16~15:37 KST 에 삼성전자 `regularMarketPrice` 가 254,000(전일 종가)에 멈춘 채
   `regularMarketDayHigh` 는 240,000 이었다. 현재가가 그날 고가보다 높은 건 나올 수 없는
   조합이고, 그게 낡았다는 결정적 신호다. 화면이면 "—" 로 끝나지만 여기서 통과시키면
   **점수에 틀린 종가가 박힌다.** 그래서 같은 자기검증을 여기에도 둔다.

프론트(`lib/yahoo-quote.ts`)와 규칙이 둘로 갈리면 같은 지수가 화면 두 곳에서 다르게
보인다. 밴드 여유(0.5%)와 "필드가 없으면 통과" 원칙을 그쪽과 맞춰 두었으니, 한쪽을
고치면 다른 쪽도 같이 볼 것.
"""

from __future__ import annotations

import time
from datetime import date, datetime, time as dtime
from urllib.parse import quote

import requests

from common.retry import backoff_delay
from common.timeutil import KST

CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"

# 해외 러너에서도 야후는 안정적인 편이지만, KRX 헬퍼와 같은 이유로 재시도를 둔다.
REQUEST_TIMEOUT_SEC = 20
MAX_RETRIES = 4
RETRY_BASE_DELAY_SEC = 2
RETRY_MAX_DELAY_SEC = 10

# KRX 정규장 마감은 15:30 KST 다. 여기에 30분을 더 얹는 이유는 야후가 마감 직후 몇 분
# 동안 낡은 값을 주는 걸 실제로 봤기 때문이다(2026-07-28 15:16~15:37). 오후 실행이
# ~19:50 KST 라 이 여유로 잃는 건 없다.
MARKET_CLOSE_KST = dtime(16, 0)

# 현재가가 그날 [저가, 고가] 밴드를 벗어났는지 볼 때 두는 여유. lib/yahoo-quote.ts 의
# DAY_RANGE_SLACK 과 같은 값이어야 한다.
DAY_RANGE_SLACK = 0.005


def _get(symbol: str, params: dict) -> dict | None:
    """차트 JSON 을 받아 result[0] 을 돌려준다. 실패하면 None."""
    last_error: str | None = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = requests.get(
                CHART_URL.format(symbol=quote(symbol)),
                params=params,
                headers={"User-Agent": "Mozilla/5.0"},
                timeout=REQUEST_TIMEOUT_SEC,
            )
        except requests.exceptions.RequestException as e:
            last_error = str(e)
            print(f"[야후] {symbol} 요청 실패 ({attempt}/{MAX_RETRIES}): {e}")
        else:
            if resp.status_code < 400:
                result = (resp.json().get("chart") or {}).get("result") or []
                return result[0] if result else None
            # 404 는 심볼이 없다는 뜻이라 재시도해도 안 바뀐다.
            if resp.status_code == 404:
                print(f"[야후] {symbol}: 심볼 없음(404)")
                return None
            last_error = f"HTTP {resp.status_code}"
            print(f"[야후] {symbol} {last_error} ({attempt}/{MAX_RETRIES})")

        if attempt < MAX_RETRIES:
            time.sleep(backoff_delay(attempt, RETRY_BASE_DELAY_SEC, RETRY_MAX_DELAY_SEC))

    print(f"[WARNING] 야후 {symbol} 조회가 {MAX_RETRIES}번 모두 실패했습니다: {last_error}")
    return None


def _kst_date(epoch_sec: int) -> str:
    return datetime.fromtimestamp(epoch_sec, KST).date().isoformat()


# 야후는 종가를 float32 로 실어 보낸다 — KRX 가 4121.74 로 준 값이 4121.740234375 로 온다
# (전 구간 대조 결과 격차는 0.0000%, 순수 표현 오차다). 그대로 저장하면 소스가 바뀐
# 날부터 소수점이 길어져 한 시계열에 이음매가 생기고, kospi_speed_60d 의 details 처럼
# 반올림 없이 그대로 싣는 자리에서 화면까지 새어 나온다. 지수는 소수점 둘째 자리까지
# 호가되므로 여기서 맞춰 두면 옛 KRX 행과 완전히 같은 모양이 된다.
def _round(value) -> float:
    return round(float(value), 2)


def _price_is_stale(meta: dict, price: float) -> bool:
    """현재가가 그날 고가·저가 밴드 밖이면 낡은 값으로 본다.

    고가·저가가 없거나 0 이면 **통과시킨다** — 검사를 못 하는 것과 값이 틀린 것은 다르다
    (lib/yahoo-quote.ts 와 같은 판단).
    """
    high = meta.get("regularMarketDayHigh")
    low = meta.get("regularMarketDayLow")
    if not isinstance(high, (int, float)) or not isinstance(low, (int, float)):
        return False
    if high <= 0 or low <= 0:
        return False
    return price > high * (1 + DAY_RANGE_SLACK) or price < low * (1 - DAY_RANGE_SLACK)


def fetch_index_closes(symbol: str, days: int) -> dict[str, float]:
    """최근 `days` 일의 일별 종가를 {'YYYY-MM-DD': close} 로 돌려준다(KST 날짜 기준).

    한 번의 요청으로 기간 전체를 받는다 — KRX 헬퍼처럼 날짜마다 따로 부르지 않는다.
    휴장일은 애초에 바가 없고, 진행 중인 오늘 바는 `close` 가 None 이라 자연히 빠진다.
    오늘 종가는 `fetch_index_today()` 가 따로 붙인다.

    ⚠️ `range` 파라미터를 쓰지 않고 period1/period2 를 못박는다. 야후는 `range=365d` 를
    '365 거래일'로 읽어 365개(≈17개월)를 주는데 `range=1y` 는 244개다 — 같은 뜻으로
    적은 두 표기가 다른 기간을 낸다. `lib/yahoo-history.ts` 가 `range=max` 에서
    interval 이 조용히 월봉으로 바뀌는 걸 겪고 내린 결론과 같다.
    """
    now = int(time.time())
    result = _get(
        symbol,
        {
            "interval": "1d",
            "period1": now - max(days, 1) * 24 * 60 * 60,
            "period2": now,
        },
    )
    if result is None:
        return {}

    timestamps = result.get("timestamp") or []
    quote = ((result.get("indicators") or {}).get("quote") or [{}])[0]
    closes = quote.get("close") or []

    prices: dict[str, float] = {}
    for ts, close in zip(timestamps, closes):
        if close is None:
            continue  # 진행 중인 오늘 바
        prices[_kst_date(ts)] = _round(close)
    return prices


def fetch_last_session_close(symbol: str) -> tuple[str, float] | None:
    """가장 최근에 **끝난** 거래일의 (날짜, 종가). 아직 장중이거나 못 믿으면 None.

    '오늘'이 아니라 '최근 끝난 세션'을 묻는 이유는 일봉 배열이 늦게 차기 때문이다.
    2026-07-28 종가는 7/29 01:27 KST 에도 `close` 배열에 안 들어와 있었고 meta 에만
    있었다(regularMarketTime 07-28 18:05, price 6023.66). '오늘만' 보는 함수였다면
    그 사이에 도는 실행이 7/28 을 통째로 놓친다.

    meta 의 기준일(`regularMarketTime`)을 그대로 날짜로 삼으므로 휴장일 처리가 공짜로
    따라온다 — 휴장일에는 meta 가 직전 거래일을 가리키고, 그 날짜는 이미 저장돼 있어
    호출부가 자연히 건너뛴다.
    """
    result = _get(symbol, {"interval": "1d", "range": "5d"})
    if result is None:
        return None

    meta = result.get("meta") or {}
    price = meta.get("regularMarketPrice")
    market_time = meta.get("regularMarketTime")
    if not isinstance(price, (int, float)) or not isinstance(market_time, (int, float)):
        return None

    session_date = _kst_date(int(market_time))
    now = datetime.now(KST)

    # 그 세션이 오늘이면 아직 진행 중일 수 있다. 마감 전이면 이건 종가가 아니라 장중
    # 시세다(아침 실행이 ~10:45 KST 로 정규장 한복판이다). 어제 이전 세션이면 이미 끝난
    # 것이라 이 검사가 필요 없다.
    if session_date == now.date().isoformat() and now.time() < MARKET_CLOSE_KST:
        print(f"[야후] {symbol}: 아직 장 마감 전({now:%H:%M} KST)이라 오늘 값을 쓰지 않습니다")
        return None

    if _price_is_stale(meta, float(price)):
        print(
            f"[야후] {symbol}: 종가 {price} 가 당일 밴드"
            f"[{meta.get('regularMarketDayLow')}, {meta.get('regularMarketDayHigh')}] 밖이라 "
            f"낡은 값으로 보고 버립니다"
        )
        return None

    return session_date, _round(price)


def fetch_index_close_series(symbol: str, days: int, today: date) -> dict[str, float]:
    """과거 일봉 + (가능하면) 최근 끝난 세션의 종가를 합친 {'YYYY-MM-DD': close}.

    호출부는 이 맵에서 필요한 날짜만 꺼내 쓴다. `today` 는 미래 날짜를 막는 상한으로만
    쓴다 — 야후가 시간대 경계에서 앞선 날짜를 줄 여지를 없앤다.
    """
    prices = fetch_index_closes(symbol, days)

    last = fetch_last_session_close(symbol)
    if last is not None:
        session_date, close = last
        if session_date <= today.isoformat():
            prices[session_date] = close

    return {d: v for d, v in prices.items() if d <= today.isoformat()}
