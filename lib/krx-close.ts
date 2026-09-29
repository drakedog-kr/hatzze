/**
 * 야후가 준 국장 값이 그날의 **종가**인가 — 시각 도장과 지금 시각만으로 가른다.
 *
 * 국장 미리보기의 밤사이 카드(lib/kr-overnight.ts liveCloses)가 쓴다. 그 파일은 서버 전용이라
 * 테스트가 못 부르므로, fetch 없는 이 판정만 따로 둔다. 값 자체가 낡았는지(현재가가 당일 고가·저가
 * 밖)는 호출부가 lib/yahoo-quote.ts 의 priceContradictsDayRange 로 따로 본다.
 */

const KST_MS = 9 * 3600 * 1000;

/** ms → 한국 시각의 {날짜문자열, 자정부터의 분}. */
function kst(ms: number) {
  const d = new Date(ms + KST_MS);
  return { date: d.toISOString().slice(0, 10), min: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

/**
 * KRX 정규장 마감(15:30)에 여유 30분을 더한 값. 야후는 마감 직후 몇 분 동안 전날 값에 멈춘 응답을
 * 준다(2026-07-28 15:16~15:37 — lib/yahoo-quote.ts priceContradictsDayRange 머리말).
 * lib/yahoo-history.ts 의 MARKET_CLOSE_KST_MIN · data-pipeline/common/yahoo_client.py 의
 * MARKET_CLOSE_KST 와 **같은 값**이어야 한다 — 갈리면 같은 날 미리보기와 MDD 가 다른 종가를 쓴다.
 */
export const KRX_CLOSE_SETTLED_MIN = 16 * 60;

/**
 * 시각 도장이 `stampMs` 인 야후 국장 값을 지금(`nowMs`) 종가로 믿어도 되면 그 한국 날짜, 아니면 null.
 *
 * 도장이 오늘이고 16:00 전이면 장중의 진행 중인 값이거나 마감 직후의 낡은 값이다. 예전엔 장중
 * (평일 09:00~15:30)만 막아서 15:30~16:00 의 낡은 값이 오늘 종가로 들어갔다.
 */
export function settledKrxCloseDate(stampMs: number, nowMs: number): string | null {
  const now = kst(nowMs);
  const stamp = kst(stampMs);
  if (stamp.date === now.date && now.min < KRX_CLOSE_SETTLED_MIN) return null;
  return stamp.date;
}
