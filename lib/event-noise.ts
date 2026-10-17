/**
 * 카더라 '다가오는 일정' 카드에서 뺄 기계적 공시 — 추가상장 · 변경상장 · 주식매수선택권 행사 · 전환청구 같은 것.
 *
 * ⚠️ 텔레그램 발송의 '다가오는 일정'(data-pipeline/common/broadcast_digest.py EVENT_NOISE)과 **같은 정규식**이다.
 *    한쪽만 고치면 채널 글과 화면이 다른 일정을 꼽는다 — tests/event-noise.test.ts 가 두 사본을 맞대 본다.
 *    보호예수 해제는 일부러 안 넣었다(물량이 풀리는 날이라 읽는 사람에게 쓸모가 있다 · 발송과 같은 판단).
 */
export const EVENT_NOISE = /추가상장|변경상장|주식매수선택권|전환청구|신주인수권|자기주식매매|CB ?전환|BW ?행사|재공시/;

/**
 * 카드 한 날짜의 최대 줄 수. 평일엔 그날 공시 알림이 카드를 다 채워 앞날 일정이 안 보였다
 * (2026-10-15 점검: 19:50 /kadera 아홉 줄이 전부 '오늘', 그중 추가상장 넷). 날짜당 셋이면 다음 날 큰 일정이 들어온다.
 */
export const EVENTS_PER_DAY_CARD = 3;

/** 카드에 실을 일정 — 잡음 공시를 빼고, 날짜순 · 같은 날은 채널 수 순으로 날짜당 EVENTS_PER_DAY_CARD 줄, 앞에서 limit 줄. */
export function cardEvents<T extends { date: string; channels: number; event: string }>(events: T[], today: string, limit: number): T[] {
  const perDate = new Map<string, number>();
  return events
    .filter((e) => e.date >= today && !EVENT_NOISE.test(e.event))
    .sort((a, b) => a.date.localeCompare(b.date) || b.channels - a.channels)
    .filter((e) => {
      const n = perDate.get(e.date) ?? 0;
      if (n >= EVENTS_PER_DAY_CARD) return false;
      perDate.set(e.date, n + 1);
      return true;
    })
    .slice(0, limit);
}
