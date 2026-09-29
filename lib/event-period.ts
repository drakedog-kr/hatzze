/**
 * 채널이 짚은 일정의 **기간** — 달·분기·해 단위 일정이 아직 안 지났는지 가른다.
 *
 * 파이프라인이 그 일정을 기간 **첫날**로 적는다(extract_telegram_events.py SYSTEM: 달만 있으면
 * 그 달 1일, 분기만 있으면 그 분기 첫날, 해만 있으면 1월 1일). 그래서 `event_date >= 오늘` 로 거르면
 * 이미 시작된 기간이 다 빠진다 — 09-29 에 "9월 중"(09-01)·"3분기"(07-01)·올해 "2026년"(01-01)이
 * 안 보이고, "10월 중"(10-01)은 10-02 에 사라진다. 지났는지는 **기간의 끝**으로 본다
 * (파이프라인 date_ok 와 같은 잣대).
 *
 * 순수 함수만 둔다 — lib/kadera-why.ts 는 서버 전용이라 테스트가 못 부른다(tests/event-period.test.ts).
 */

export type DatePrecision = "day" | "month" | "quarter" | "year";

type Dated = { date: string; precision: DatePrecision };

/** 정밀도가 가리키는 기간의 마지막 날(YYYY-MM-DD). day 는 그날이다. */
export function periodEnd(date: string, precision: DatePrecision): string {
  if (precision === "day") return date;
  const y = Number(date.slice(0, 4));
  if (precision === "year") return `${y}-12-31`;
  const m = Number(date.slice(5, 7));
  const last = precision === "month" ? m : Math.ceil(m / 3) * 3;
  const d = new Date(Date.UTC(y, last, 0)).getUTCDate(); // 다음 달 0일 = 그 달 말일
  return `${y}-${String(last).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** 오늘(YYYY-MM-DD) 기준으로 아직 안 끝난 일정인가. */
export function stillAhead(e: Dated, today: string): boolean {
  return periodEnd(e.date, e.precision) >= today;
}

/**
 * 안 끝난 일정을 읽을 때 `event_date` 의 아래 경계. 기간은 모두 한 해 안에 있으니 가장 이른 첫날은
 * 올해 1월 1일(해 단위)이다. day 는 이 경계 대신 오늘부터 읽는다(호출부의 `.or`).
 */
export function periodFloor(today: string): string {
  return `${today.slice(0, 4)}-01-01`;
}

/**
 * 먼저 끝나는 것부터. 같은 날 끝나면 좁은 것(늦게 시작한 것)부터, 그다음 채널 많은 순.
 * ⚠️ 첫날로 세우면 올해 "2026년"(01-01)이 이번 주 일정보다 위에 선다.
 */
export function byPeriodEnd(a: Dated & { channels: number }, b: Dated & { channels: number }): number {
  const ea = periodEnd(a.date, a.precision);
  const eb = periodEnd(b.date, b.precision);
  if (ea !== eb) return ea < eb ? -1 : 1;
  if (a.date !== b.date) return a.date > b.date ? -1 : 1;
  return b.channels - a.channels;
}
