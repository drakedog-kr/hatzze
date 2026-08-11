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

/**
 * epoch(초) → **거래소 현지** YYYY-MM-DD.
 *
 * 예전엔 KST 고정(+9h)이었다. 국장만 볼 때는 그게 곧 거래소 시간이라 맞았지만,
 * 미국 종목이 들어오면서 틀린 값이 된다 — 미국장 마감(16:00 ET)은 KST 로 **다음 날
 * 새벽**이라, 8/10 세션이 8/11 로 붙는다(실측: NVDA regularMarketTime 이 거래소 기준
 * 08-10 16:00 인데 KST 로 옮기면 08-11).
 *
 * 시간대는 응답의 `meta.gmtoffset` 이 알려 준다(KRX 32400 · 미국 EDT −14400).
 * 국장은 offset 이 +9h 라 **예전과 한 글자도 다르지 않다.**
 */
function exchangeDate(epochSec: number, gmtOffsetSec: number): string {
  return new Date((epochSec + gmtOffsetSec) * 1000).toISOString().slice(0, 10);
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

  const offset = typeof meta?.gmtoffset === "number" ? (meta.gmtoffset as number) : KST_OFFSET_MS / 1000;
  const sessionDate = exchangeDate(marketTime, offset);

  // ⑴ 그 세션이 끝났는가. 판정 기준이 시장마다 다르다.
  //
  //   국장(+9h)  16:00 KST 고정. **야후가 마감(15:30) 직후 몇 분 동안 낡은 값을 주는 걸
  //              실측해서** 30분 여유를 붙인 값이다. 이 규칙은 손대지 않는다.
  //   그 외      `currentTradingPeriod.regular.end` + 30분. 미국장은 서머타임으로 UTC
  //              기준 마감이 한 시간씩 움직여서 고정 시각을 못 쓴다.
  //
  // ⚠️ 국장에도 regular.end 를 쓰고 싶어지지만 쓰면 안 된다 — 야후가 KRX 마감을
  //    15:00 으로 준다(실측). 실제 마감은 15:30 이라 30분 이른 값을 종가로 붙이게 된다.
  const isKrx = offset === 32_400;
  if (isKrx) {
    const nowKst = new Date(Date.now() + KST_OFFSET_MS);
    const todayKst = nowKst.toISOString().slice(0, 10);
    if (sessionDate === todayKst && nowKst.getUTCHours() * 60 + nowKst.getUTCMinutes() < MARKET_CLOSE_KST_MIN) {
      return;
    }
  } else {
    const period = meta?.currentTradingPeriod as { regular?: { end?: unknown } } | undefined;
    const end = period?.regular?.end;
    if (typeof end !== "number") return; // 마감 시각을 모르면 붙이지 않는다
    if (Date.now() / 1000 < end + 30 * 60) return;
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

    // 봉의 날짜는 **거래소 현지 기준**이다(exchangeDate 주석). 국장은 +9h 라 예전과 같다.
    const gmtOffset = typeof result?.meta?.gmtoffset === "number" ? result.meta.gmtoffset : KST_OFFSET_MS / 1000;

    const bars: Bar[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const t = timestamps[i];
      const c = closes[i];
      if (typeof t !== "number" || typeof c !== "number") continue; // 휴장·결측 봉은 건너뛴다
      bars.push({ date: exchangeDate(t, gmtOffset), close: c });
    }

    appendLastSession(bars, result?.meta);
    return bars.length >= 2 ? bars : null;
  } catch {
    return null;
  }
}

/** KRX 시장 구분 → 야후 심볼 접미사. */
/**
 * 우리 티커 → 야후 심볼 예외표.
 *
 * 야후는 **클래스가 나뉜 종목을 클래스까지 붙여야** 준다(BRK 는 없고 BRK-B 가 있다).
 * 사전의 티커는 사람들이 글에서 실제로 쓰는 표기라 그대로 두고, 야후에 물을 때만 바꾼다 —
 * `us_stocks.ticker` 를 바꾸면 그걸 참조하는 표들까지 손대야 한다.
 *
 * 사전 178종목을 야후에 전수로 물어 **실제로 안 되는 건 이 하나뿐이었다**(2026-08-11).
 * 사전에 새 종목을 넣을 때 시세가 빈칸이면 여기를 먼저 볼 것.
 */
const YAHOO_ALIAS: Record<string, string> = { BRK: "BRK-B" };

export function yahooSymbol(code: string, market: string | null | undefined): string {
  // 미국 상장은 접미사가 없다(NVDA · AAPL). 국내만 .KS/.KQ 를 붙인다.
  if (market === "US") return YAHOO_ALIAS[code] ?? code;
  const suffix = market === "KOSDAQ" ? ".KQ" : ".KS";
  return `${code}${suffix}`;
}
