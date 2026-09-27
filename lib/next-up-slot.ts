/**
 * 시장 브리핑 히어로 바닥 첫 칩이 **지금 이 시각에** 어디로 보낼지 고른다.
 *
 * 서버(사본을 만드는 순간)와 브라우저(보는 순간)가 같은 함수를 부른다. 홈은 사본으로 나가서
 * 서버가 고른 칩이 한 시간 가까이 묵을 수 있는데, 브라우저가 깨어나면 제 시계로 다시 고른다
 * (app/home/HeroSpotlights.tsx). 그래서 이 파일은 서버 전용 모듈을 불러오지 않는다.
 *
 * ## 규칙(한국 시각)
 *
 *   평일 06:30~10:00  국장 미리보기(간밤 미장) — 그날 미리보기가 만들어졌고(06:30~07:00 실행) 밤사이
 *                     크게 움직인 종목이 있을 때만. 개장(09:00) 뒤 한 시간까지 둔다 — 장 초반엔 간밤 미장과
 *                     엮인 종목이 여전히 궁금한 때라서(2026-09-28 요청으로 09:00 → 10:00).
 *   그 밖             카더라 급부상 종목.
 *
 * 근거는 방문 시각이다(2026-08-14~09-10 GA4, 스파이크 3일 뺀 평균). 평일 8시가 하루 최강인데
 * 개장 직전이라 간밤 미장이 가장 쓸모 있는 때다. 한국 휴장일은 따로 가리지 않는다 — 미리보기는 그날
 * 거래일 날짜로 만들어져서 휴장일 아침엔 날짜가 안 맞아 저절로 빠진다.
 * 저녁엔 데일리 노트로 보냈었는데 카더라·테마 쪽이 낫다고 해서 뺐다(2026-09-28).
 */

export type NextUpSlot = "preview" | "kadera";

export type NextUpClock = {
  /** 미리보기가 가리키는 국내 거래일(YYYY-MM-DD). 그날 칩을 쓸 수 없으면 null. */
  previewDate: string | null;
};

const KST_MS = 9 * 3600 * 1000;
const PREVIEW_FROM = 6 * 60 + 30; // 06:30 — 미리보기 실행이 06:30~07:00 에 끝난다.
const PREVIEW_UNTIL = 10 * 60; // 10:00 — 개장 뒤 한 시간(위 주석).

/** nowMs(UTC 에포크 ms)의 한국 날짜 · 요일(0=일) · 하루 중 분. */
export function kstParts(nowMs: number): { date: string; dow: number; min: number } {
  const k = new Date(nowMs + KST_MS);
  return {
    date: k.toISOString().slice(0, 10),
    dow: k.getUTCDay(),
    min: k.getUTCHours() * 60 + k.getUTCMinutes(),
  };
}

export function pickNextUpSlot(nowMs: number, clock: NextUpClock): NextUpSlot {
  const { date, dow, min } = kstParts(nowMs);
  const weekday = dow >= 1 && dow <= 5;
  if (weekday && min >= PREVIEW_FROM && min < PREVIEW_UNTIL && clock.previewDate === date) return "preview";
  return "kadera";
}
