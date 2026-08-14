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

2. **장중 값을 종가로 쓰면 안 된다.** 오후 실행(~18:40)은 마감 뒤라 괜찮지만, 게이트가
   없으면 다른 실행에서 장중 시세가 그날의 '종가'로 저장된다. (2026-08-14 이후 아침
   실행은 ~08:45 로 개장 전이라 애초에 오늘 바가 없다. 그래도 게이트는 유지한다 —
   실행 시각은 큐 사정으로 흔들리고, 이 방어는 시각이 아니라 값의 성질에 걸어야 한다.)
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


def fetch_index_closes(symbol: str, days: int) -> tuple[dict[str, float], list[str]]:
    """최근 `days` 일의 일별 종가와, **바가 존재한 날짜 전체**를 돌려준다(KST 기준).

    돌려주는 것이 둘인 이유: 맨 끝 바는 `close` 가 비어 와도 **timestamp 는 늘 있다**.
    그 날짜를 호출부가 알아야 `fetch_prev_session_close()` 가 값을 어느 날에 붙일지
    정할 수 있다(아래 함수 주석 참고).

    한 번의 요청으로 기간 전체를 받는다 — KRX 헬퍼처럼 날짜마다 따로 부르지 않는다.
    휴장일은 애초에 바가 없다.

    ⚠️ **이 경로로는 '가장 최근에 끝난 거래일'을 받을 수 없다.** 야후는 응답의 마지막
    바만 `close=None` 으로 준다. 장중이라서가 아니다 — 2026-07-28 종가는 마감 10.6시간
    뒤에도 비어 있었고, period2 를 그날 끝으로 끊어도 여전히 비었다(둘 다 실측). 야후의
    과거 데이터 정리가 늦는 것이고, 그동안 값은 `range=1d` 응답에만 있다.

    ⚠️⚠️ **그런데 '오늘' 바는 비어 오지 않는다. 장중 시세가 실려 온다.** 위 문장과
    모순처럼 보이지만 둘 다 맞다 — 비어 오는 건 **끝난** 날이고, 진행 중인 날은 현재가가
    `close` 자리에 앉는다. 2026-07-29 에 같은 필드가 10:29 KST 6076.65 · 14:24 KST
    5517.41 로 왔다(실측). 이걸 종가로 저장하면 지표가 오전 실행 시각의 호가로 굳는다.
    실제로 그 사고가 났다. 그래서 호출부가 오늘을 걸러낼 수 있도록 `all_dates` 를 같이
    돌려주는 것이고, **`fetch_index_close_series` 는 오늘을 통째로 버린다.** 오늘 값은
    16:00 게이트가 붙은 `fetch_last_session_close()` 만 만든다.

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
        return {}, []

    timestamps = result.get("timestamp") or []
    quote = ((result.get("indicators") or {}).get("quote") or [{}])[0]
    closes = quote.get("close") or []

    prices: dict[str, float] = {}
    all_dates: list[str] = []
    for ts, close in zip(timestamps, closes):
        d = _kst_date(ts)
        all_dates.append(d)
        if close is None:
            continue  # 위 주석 — 맨 끝 바는 비어 온다
        prices[d] = _round(close)
    return prices, all_dates


def fetch_session_close(symbol: str, day: date) -> float | None:
    """특정 거래일 하루의 **시간봉**을 받아 마지막 봉의 종가를 돌려준다.

    일봉의 맨 끝 바가 비어 오는 걸(위 주석) 메우는 용도다. 그 한 칸이 비면 아침
    실행(~08:45 KST, 개장 전)이 전 거래일 종가를 못 집는 날이 생기고, 그날 저녁까지
    화면이 이틀 전 값에 머문다. 워크플로는 초록불이라 아무도 모른다.

    ⚠️ **`meta.chartPreviousClose` 를 쓰면 안 된다.** 처음에 그걸로 짰다가 틀렸다 —
    코스피에선 맞는데(6755.75 = 07-27 종가) **코스닥에선 한 세션 밀린 값**을 준다
    (748.22 = 07-24 종가, 실제 07-27 은 764.86). 심볼 하나로 확인하고 일반화하면
    이렇게 조용히 틀린 값을 저장하게 된다. 시간봉은 두 지수에서 모두 맞았다
    (07-28: 코스피 6023.66 · 코스닥 705.85, 둘 다 meta 와 일치).

    하루를 KST 기준으로 잘라 부르므로 **어느 세션인지 모호하지 않다.** 마지막 시간봉은
    15:00~16:00 구간이라 정규장 마감(15:30)을 포함한다.

    ⚠️ 진행 중인 날에는 쓰지 말 것 — 그날의 마지막 시간봉은 종가가 아니라 장중값이다.
    호출부가 `day < today` 로만 부른다.
    """
    start = int(datetime.combine(day, dtime(0, 0), KST).timestamp())
    result = _get(
        symbol,
        {"interval": "1h", "period1": start, "period2": start + 24 * 60 * 60},
    )
    if result is None:
        return None

    timestamps = result.get("timestamp") or []
    quote = ((result.get("indicators") or {}).get("quote") or [{}])[0]
    closes = quote.get("close") or []

    filled = [c for t, c in zip(timestamps, closes) if c is not None]
    if not filled:
        return None  # 휴장일 등
    return _round(filled[-1])


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
    # 시세다(아침 실행 ~08:45 는 개장 전이라 여기 안 걸리지만, 시각은 흔들린다).
    # 어제 이전 세션이면 이미 끝난
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


def fetch_index_close_series(
    symbol: str, days: int, today: date, known: set[str] | None = None
) -> dict[str, float]:
    """세 소스를 합친 {'YYYY-MM-DD': close}. 하루 두 번 실행이 각자 제 몫을 채운다.

    소스가 셋인 건 야후 하나로는 어느 실행에서도 최신이 안 되기 때문이다.

      ① 히스토리(period1/period2) — 지난 1년. **끝난 날은 확정 종가, 오늘은 장중값.**
      ② 시간봉 — ①이 비워 둔 지난 날짜를 그 하루만 따로 받아 메운다. **근사치다.**
      ③ meta.regularMarketPrice — 오늘 종가. 16:00 KST 이후에만(장중값 방지).

    실행별로 이렇게 갈린다.

      아침 ~08:45 (개장 전) ①+② → **전 거래일 종가**가 확정된다. ③은 게이트에 걸려 빠진다.
      오후 ~19:50 (마감 후)  ①+③ → **당일 종가**까지 들어온다.

    ②가 없던 판(2026-07-29 최초 구현)에는 아침 실행이 전 거래일을 못 집는 날이 생겼다.
    평소엔 전날 **저녁** 실행이 그날 종가를 이미 넣어 두므로 티가 안 나지만, 저녁 실행이
    통째로 건너뛰는 날이 있다(07-24 실측). 그 다음 날 아침이 ②로 만회한다.

    ②는 ①이 실제로 바를 만든 날짜에만 건다. 휴장일 달력을 따로 들 필요가 없고, 비는
    칸이 맨 끝 하나뿐이라 추가 요청도 실행당 최대 1회다.

    ⚠️ **②는 '그 날짜에 아무것도 없을 때'만 쓰는 것이다.** `known` 에 이미 저장된 날짜를
    넘기면 그 날짜는 건너뛴다. 안 넘기면 이런 일이 난다 — 저녁 실행이 ③으로 받아 둔
    **정확한 종가**를 다음 날 아침 실행이 ②의 **근사치로 덮어쓴다.** ②가 보는 건 야후
    응답(`prices`)이지 DB가 아니라서, 일봉이 아직 안 익은 어제 날짜를 "비었다"고 읽기
    때문이다. 호출부가 최근 며칠을 덮어쓰게 되면서(`days_to_sync`) 이 조합이 실제로
    값을 되돌리는 경로가 됐다. 둘 중 하나만 보면 안 보이는 종류라 여기 적어 둔다.

    ⚠️ **②가 주는 값은 종가가 아니라 근사치다.** 마지막 시간봉이 동시호가(15:20~15:30)로
    확정되는 종가를 못 잡는다. 실측 격차: 코스피 07-27 6720.55 vs 6755.75(0.52%) ·
    07-28 6019.06 vs 6023.66(0.08%) · 코스닥 07-28 697.76 vs 705.85(**1.15%**). 시점
    문제가 아니라 계통 오차라 나중에 다시 불러도 같다. 그래도 남겨 둔 건 '하루 낡은 값'
    보다는 낫기 때문이고, **호출부가 최근 며칠을 매 실행 덮어쓰는 것을 전제로 한다** —
    일봉이 확정되면 그때 갈아치워진다. 덮어쓰기를 없앨 거면 ②도 같이 없앨 것.

    `today` 는 상한이자 **오늘 배제선**이다. ①이 오늘 칸에 실어 보내는 장중값을 여기서
    떨궈야 지표가 오전 실행 시각의 호가로 굳지 않는다(fetch_index_closes 주석 참고).
    오늘 값은 오직 ③만 만든다.
    """
    prices, all_dates = fetch_index_closes(symbol, days)

    # ①이 오늘 칸에 실어 보낸 장중값을 버린다. 여기가 유일하게 막는 자리다 —
    # ②는 애초에 오늘을 안 건드리고 ③에는 16:00 게이트가 있는데, ①만 무방비였다.
    intraday = prices.pop(today.isoformat(), None)
    if intraday is not None:
        print(f"[야후] {symbol}: 오늘({today}) 일봉의 {intraday} 는 장중값이라 버립니다")

    # ② 지난 날짜인데 ①도 비워 두고 DB에도 없는 칸만 시간봉으로 메운다. 오늘은 건드리지
    # 않는다 — 진행 중인 날의 마지막 시간봉은 종가가 아니라 장중값이고, 오늘은 ③ 담당이다.
    # `known` 을 안 보면 어제 받아 둔 정확한 종가를 오늘 아침이 근사치로 되돌린다(위 주석).
    stored = known or set()
    for d in all_dates:
        if d in prices or d in stored or d >= today.isoformat():
            continue
        close = fetch_session_close(symbol, date.fromisoformat(d))
        if close is not None:
            prices[d] = close
            print(f"[야후] {symbol}: 일봉이 비어 있던 {d} 를 시간봉으로 채웠습니다 ({close}, 근사치)")

    # ③ 오늘 종가(장 마감 뒤에만).
    last = fetch_last_session_close(symbol)
    if last is not None:
        session_date, close = last
        prices[session_date] = close

    return {d: v for d, v in prices.items() if d <= today.isoformat()}


def fetch_last_session_quote(symbol: str) -> tuple[str, float, float | None] | None:
    """개별 종목용 — 가장 최근에 **끝난** 거래일의 (날짜, 종가, 52주 고점).

    지수용 `fetch_last_session_close()` 와 게이트가 같다(장중이면 None, 자기모순이면
    None). 52주 고점만 더 얹는다 — 신고가 카드가 그 값을 쓰는데 KRX 일별매매정보에는
    그 필드가 없기 때문이다.

    **왜 파이프라인에서 부르나.** 예전엔 이걸 프론트(`lib/data.ts`)가 화면을 그릴 때마다
    실시간으로 불렀다. 그러면 카드가 장중에 움직이는데, 같은 카드 왼쪽의 지수 게이지와
    햇쩨 지수는 하루 두 번만 바뀐다 — 한 화면에서 시점이 갈린다. 지표는 온도와 같은
    시점이어야 하므로 조회를 파이프라인으로 옮기고 프론트는 저장값만 읽는다.
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
    if session_date == now.date().isoformat() and now.time() < MARKET_CLOSE_KST:
        return None  # 장중 — 종가가 아니다

    if _price_is_stale(meta, float(price)):
        print(f"[야후] {symbol}: 종가 {price} 가 당일 밴드 밖이라 버립니다")
        return None

    high52 = meta.get("fiftyTwoWeekHigh")
    return session_date, _round(price), _round(high52) if isinstance(high52, (int, float)) else None
