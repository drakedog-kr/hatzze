import "server-only";

import type { Bar } from "@/lib/mdd";
import { priceContradictsDayRange } from "@/lib/yahoo-quote";

/**
 * 야후 파이낸스 일봉 히스토리 조회 — MDD 분석용(server-only).
 *
 * 상단 티커·카더라의 현재가 조회(lib/yahoo-quote.ts)와 달리, 여기는 과거 수년치
 * 일봉 종가 배열이 필요하다. 두 가지 함정을 피한다:
 *
 *  1) `range=max` 로 부르면 야후가 interval 을 **조용히 무시하고 월봉**을 준다
 *     (355개월=356포인트). 그걸로 MDD 를 내면 −60% 처럼 그럴듯하지만 틀린 값이
 *     나온다(일봉 실제 −64.7%). 그래서 range 가 아니라 period1/period2 를 명시해
 *     일봉을 강제한다.
 *  2) close 는 수정주가(분할·감자 소급 반영)라 그대로 쓰고, adjclose 는 감자에서
 *     음수가 나오는 등 깨져 있어 쓰지 않는다(lib/mdd.ts 주석 참고).
 */

const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
/**
 * KRX 정규장 마감(15:30 KST)에 여유 30분을 더한 값. 야후가 마감 직후 몇 분 동안 낡은
 * 값을 주는 걸 실측했다(2026-07-28 15:16~15:37). 파이프라인 쪽
 * data-pipeline/common/yahoo_client.py 의 MARKET_CLOSE_KST 와 같은 기준이어야 한다 —
 * 갈리면 같은 날 지수 카드와 MDD 가 다른 거래일을 그린다.
 */
const MARKET_CLOSE_KST_MIN = 16 * 60;

/** epoch(초) → KST 기준 YYYY-MM-DD. */
function kstDate(epochSec: number): string {
  return new Date(epochSec * 1000 + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * 야후 일봉은 **응답의 맨 끝 바만 `close` 를 비워서 준다.** 장중이라서가 아니다 —
 * 2026-07-28 종가는 마감 10.6시간 뒤에도 비어 있었고, period2 를 그날 끝으로 끊어도
 * 여전히 비었다(둘 다 실측). 야후의 과거 데이터 정리가 늦는 것이다.
 *
 * 위 루프가 그 봉을 건너뛰므로, 그대로 두면 MDD 가 **가장 최근에 끝난 거래일을 통째로
 * 못 본다.** 지수 카드는 그날 종가를 그리는데 MDD 만 하루 뒤처지는 어긋남이 된다.
 *
 * 값은 같은 응답의 `meta.regularMarketPrice` 에 이미 실려 있다 — 추가 호출이 없다.
 *
 * 두 가지를 확인하고 붙인다.
 *  ⑴ 그 세션이 끝났는가. 오늘 세션이고 아직 16:00 KST 전이면 이건 종가가 아니라
 *     장중 시세다. 붙이면 MDD 낙폭이 장중에 출렁인다.
 *  ⑵ 값이 자기모순인가. 현재가가 당일 고가·저가 밴드 밖이면 낡은 값이다
 *     (lib/yahoo-quote 의 같은 판정을 그대로 쓴다 — 규칙이 둘로 갈리면 티커와 MDD 가
 *     또 어긋난다. 2026-07-28 에 실제로 15.7% 어긋났었다).
 */
function appendLastSession(bars: Bar[], meta: Record<string, unknown> | undefined): void {
  const price = meta?.regularMarketPrice;
  const marketTime = meta?.regularMarketTime;
  if (typeof price !== "number" || typeof marketTime !== "number") return;
  if (priceContradictsDayRange(price, meta)) return;

  const sessionDate = kstDate(marketTime);
  const now = new Date(Date.now() + KST_OFFSET_MS);
  const todayKst = now.toISOString().slice(0, 10);
  if (sessionDate === todayKst && now.getUTCHours() * 60 + now.getUTCMinutes() < MARKET_CLOSE_KST_MIN) {
    return; // ⑴ 아직 장중
  }

  // 일봉이 이미 그 날짜를 채웠으면(야후가 뒤늦게 정리한 경우) 그대로 둔다.
  if (bars.length > 0 && bars[bars.length - 1].date >= sessionDate) return;
  bars.push({ date: sessionDate, close: price });
}

/**
 * @param symbol 야후 심볼(예: "005930.KS", "000660.KS", "247540.KQ")
 * @param years  조회 기간(년). 넉넉히 받아와도 상장 이후만 돌아온다.
 * @returns 오래된→최신 순서의 일봉 종가. 실패(네트워크·비정상 응답·데이터 없음)면 null.
 */
export async function fetchDailyHistory(
  symbol: string,
  years: number,
): Promise<Bar[] | null> {
  const now = Math.floor(Date.now() / 1000);
  // 전체(years 아주 큼)여도 야후는 상장 이후만 준다. 여유로 하루 더 뺀다.
  const period1 = years >= 100 ? 0 : Math.max(0, now - Math.ceil(years * SECONDS_PER_YEAR) - 86_400);
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?period1=${period1}&period2=${now}&interval=1d`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      // 일봉은 하루 한 번 바뀐다. 라우트가 CDN s-maxage 로도 감싸지만, 데이터
      // 캐시로도 15분 재검증을 걸어 같은 심볼 반복 조회의 야후 왕복을 줄인다.
      next: { revalidate: 900 },
    });
    if (!res.ok) return null;

    const result = (await res.json())?.chart?.result?.[0];
    const timestamps: unknown = result?.timestamp;
    const closes: unknown = result?.indicators?.quote?.[0]?.close;
    if (!Array.isArray(timestamps) || !Array.isArray(closes)) return null;

    const bars: Bar[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const t = timestamps[i];
      const c = closes[i];
      if (typeof t !== "number" || typeof c !== "number") continue; // 휴장·결측 봉은 건너뛴다
      bars.push({ date: kstDate(t), close: c });
    }

    appendLastSession(bars, result?.meta);
    return bars.length >= 2 ? bars : null;
  } catch {
    return null;
  }
}

/** KRX 시장 구분 → 야후 심볼 접미사. */
export function yahooSymbol(code: string, market: string | null | undefined): string {
  const suffix = market === "KOSDAQ" ? ".KQ" : ".KS";
  return `${code}${suffix}`;
}
