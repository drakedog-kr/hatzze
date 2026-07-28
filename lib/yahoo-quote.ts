import "server-only";

/**
 * 야후 파이낸스 시세 조회 — 상단 티커와 카더라 리포트가 함께 쓴다.
 *
 * 두 곳에 같은 코드가 복붙돼 있었는데, 실제로 한 번 어긋난 적이 있다(종목 리포트의
 * 등락률이 상단 티커와 달라 보였다). 같은 종목이 화면 두 곳에서 다른 등락률로 보이면
 * 그 자체가 버그라, 전일 종가 판정 규칙을 여기 한 곳에만 둔다.
 */

export type YahooQuote = {
  price: number;
  /** 전일 종가. 판정 불가면 null — 등락률을 못 낸다는 뜻. */
  prevClose: number | null;
  /** 최근 52주 최고가. 응답에 없으면 null. */
  fiftyTwoWeekHigh: number | null;
};

/** Next 의 fetch 확장(next.revalidate)까지 받는 init 타입. */
type FetchInit = RequestInit & { next?: { revalidate?: number } };

/**
 * 밴드 밖 판정에 두는 여유. 장중에는 새 체결가가 고가·저가 갱신보다 반 박자 먼저 실릴 수
 * 있어, 한 틱만큼 삐져나온 값이 정상적으로 나온다(KRX 25만원대 호가 단위 500원 = 0.2%).
 * 0.5% 는 그 틱 잡음보다 넉넉히 위, 실제로 본 어긋남(5.8%)보다는 한참 아래다.
 */
const DAY_RANGE_SLACK = 0.005;

/**
 * 시세가 제 응답 안에서 모순인지 본다 — 야후가 공짜로 실어 보내는 자기검증이다.
 *
 * 야후는 가끔 meta.regularMarketPrice 만 갱신이 밀린 응답을 준다. 코스피가 -10.8% 로
 * 밀리고 장중 서킷브레이커가 걸린 2026-07-28, 마감 직후(15:16~15:37 KST) 삼성전자
 * 응답이 그랬다:
 *
 *   regularMarketPrice   = 254,000   ← 전 거래일 종가에 멈춰 있다
 *   regularMarketDayHigh = 240,000
 *   regularMarketDayLow  = 219,000
 *
 * 현재가가 그날 고가보다 높다. 나올 수 없는 조합이고, 그 값이 낡았다는 결정적 신호다.
 * 그 사이 상단 티커는 "254,000 ▲0.00%", 같은 순간 MDD 정밀분석은 219,500원을 그려
 * 두 화면이 15.7% 어긋났다. 야후는 16:00 무렵 스스로 -13.58% 로 복구했다.
 *
 * 두 필드가 없으면 통과시킨다 — 검사를 **못 하는** 것과 검사에 **떨어진** 것은 다르다.
 * 장 시작 전처럼 아직 체결이 없어 고가·저가가 0인 응답도 판정 대상이 아니다.
 */
export function priceContradictsDayRange(price: number, meta: Record<string, unknown> | undefined): boolean {
  const low = meta?.regularMarketDayLow;
  const high = meta?.regularMarketDayHigh;
  if (typeof low !== "number" || typeof high !== "number") return false;
  if (!(low > 0) || !(high > 0) || low > high) return false;
  return price < low * (1 - DAY_RANGE_SLACK) || price > high * (1 + DAY_RANGE_SLACK);
}

/**
 * 전일 종가 판정: 일봉 배열이 심볼마다 오늘 바를 다르게 반영한다 — 선물은 마지막 바가
 * 진행 중인 현재 세션(close == 현재가)이고, KR 지수는 오늘 바가 늦게 붙어 마지막 바가
 * 어제인 경우도 있다. 그래서 "마지막 종가가 현재가와 (거의) 같으면 그건 현재 세션이므로
 * 그 직전 종가를, 다르면 마지막 종가를" 전일로 삼는다.
 *
 * 전일 종가가 price 와 같은 값으로 나오는 경우(= 등락률 0.00%)는 **그대로 둔다**.
 * 2026-07-28 화면에 박힌 "254,000 ▲0.00%" 가 이 모양이었지만, 그때도 전일 종가
 * 254,000 은 맞는 값이었다(07-27 실제 종가). 틀린 건 price 뿐이었고 그건 위
 * priceContradictsDayRange 가 막는다. 여기서까지 null 을 내면 멀쩡한 보합을 지운다 —
 * 최근 2년 일봉에서 종가가 전일과 정확히 같은 날은 삼성전자 20/483(4.2%) · 네이버
 * 15/483(3.1%) · 알테오젠 16/483(3.3%) 로 한 달에 한 번꼴이고, 그날 "—" 를 띄우면
 * 그게 더 큰 거짓말이다. (종목은 호가 단위가 아래 판정 폭보다 커서 — 25만원대면 500원
 * = 0.2% — 이 조건이 사실상 '정확히 같은 값'이다.)
 *
 * 반대로 지수·환율에서는 이 0.0005 폭이 헐겁다(하루 변동이 0.05% 안쪽인 날이 코스피
 * 484일 중 18일). 오늘 바가 아직 안 붙은 날과 겹치면 전일을 하루 앞으로 당겨 잡는다.
 * 일봉 타임스탬프로 갈라야 하는 별건이라 여기서는 손대지 않는다.
 */
function resolvePrevClose(closes: number[], price: number, chartPreviousClose: unknown): number | null {
  let prev: number | null = null;
  if (closes.length >= 1) {
    const last = closes[closes.length - 1];
    const lastIsCurrent = Math.abs(last - price) / price < 0.0005;
    prev = lastIsCurrent ? (closes.length >= 2 ? closes[closes.length - 2] : null) : last;
  }
  if (prev === null && typeof chartPreviousClose === "number") prev = chartPreviousClose;
  return prev;
}

/** 시세를 가져온다. 실패(네트워크·비정상 응답·가격 없음)면 null. */
export async function fetchYahooQuote(symbol: string, init: FetchInit): Promise<YahooQuote | null> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`,
      { headers: { "User-Agent": "Mozilla/5.0" }, ...init },
    );
    if (!res.ok) return null;
    const result = (await res.json())?.chart?.result?.[0];
    const price = result?.meta?.regularMarketPrice;
    if (typeof price !== "number") return null;
    // 낡은 시세는 '값이 없음'과 똑같이 취급한다 — 호출부가 이미 null 을 "—" 나 저장 종가
    // 폴백으로 받아 준다. 틀린 숫자를 확신에 차서 그리는 것보다 그쪽이 낫다.
    if (priceContradictsDayRange(price, result?.meta)) return null;

    const closes: number[] = (result?.indicators?.quote?.[0]?.close ?? []).filter(
      (x: unknown): x is number => typeof x === "number",
    );
    const high52 = result?.meta?.fiftyTwoWeekHigh;
    return {
      price,
      prevClose: resolvePrevClose(closes, price, result?.meta?.chartPreviousClose),
      fiftyTwoWeekHigh: typeof high52 === "number" ? high52 : null,
    };
  } catch {
    return null;
  }
}

/** 등락률(%). 전일 종가를 못 구했으면 null. */
export function changeRateOf(q: YahooQuote): number | null {
  return typeof q.prevClose === "number" && q.prevClose !== 0 ? (q.price / q.prevClose - 1) * 100 : null;
}
