/**
 * ETF 분배금을 수익률 · 분배금 칸에 넣는 규칙 — DB 를 안 만지는 순수 계산이라 단위 테스트(tests/etf-pay.test.ts)가 그대로 부른다.
 * 메인(lib/etf-flow.ts) · 커버드콜(lib/etf-extras.ts) · 상세(lib/etf-detail.ts)가 같이 쓴다.
 */

/** 분배금 한 번(배당 화면의 분배금 표 etf_dividend.payments 한 칸). est 는 신규 ETF 의 앞날 예상치(배당 달력용 · 지난 분배가 아니다). */
export type EtfPayment = { pay?: string | null; record?: string | null; amount?: number | string | null; est?: boolean };

/** 다음 평일(YYYY-MM-DD) — 거래일 목록 끝 다음 날이 기준일인지 가를 때만 쓴다(휴장일은 모른다). */
function nextWeekday(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  do d.setUTCDate(d.getUTCDate() + 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return d.toISOString().slice(0, 10);
}

/**
 * 분배락일 — 국내는 T+2 결제라 기준일 **앞 거래일** 종가부터 분배금이 빠진다(RISE 국고채3년 기준일 9/9 · 592원: 9/7 106,610 → 9/8
 * 106,055). 기준일로 가르면 하루 어긋나 9/8 에서 잰 1달이 이미 빠진 종가에 592원을 더해 +0.92%(정확히 +0.36%)였다.
 * cal 은 거래일 오름차순. 기준일이 목록 끝 뒤면 다음 평일일 때만 마지막 거래일이 분배락일이다(그 밖은 아직 안 빠졌다).
 */
function exDate(record: string, cal: string[]): string {
  const last = cal[cal.length - 1];
  if (!last) return record;
  if (record > last) return record <= nextWeekday(last) ? last : record;
  let ex: string | null = null;
  for (const d of cal) {
    if (d >= record) break;
    ex = d;
  }
  return ex ?? record;
}

/**
 * 기간(start, end] 에 기준일이 든 분배금 합과 횟수. 기준일이 없으면 지급일로 본다.
 * cal(거래일 목록)을 주면 기준일 대신 분배락일로 가른다 — 종가에 분배금을 더하는 수익률은 이쪽이어야 한다. 분배금 합 · 횟수 칸은
 * 기준일로 세는 편이 사람 말과 맞아 cal 없이 부른다.
 */
export function paidBetween(pays: EtfPayment[] | undefined, start: string, end: string, cal?: string[]) {
  let sum = 0;
  let count = 0;
  for (const p of pays ?? []) {
    if (p.est) continue;
    const day = p.record ? (cal?.length ? exDate(p.record, cal) : p.record) : p.pay;
    if (!day || day <= start || day > end) continue;
    sum += Number(p.amount ?? 0);
    count += 1;
  }
  return { sum, count };
}
