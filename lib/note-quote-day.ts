/**
 * 데일리 노트 '언급된 종목'이 **글 날짜의 시세**를 고르는 규칙(lib/daily-note.ts getNoteStocks). 계산만 있어 테스트가 직접 부른다.
 *
 * 글마다 그 글을 올린 날의 최신 시세가 남는다(2026-10-17 운영자 "데일리노트는 항상 발행하는 날의 최신 시세를 넣어야 해").
 *   - 국내: 글 날짜 이하의 마지막 거래일 종가. 토요일 · 일요일 글은 금요일 종가.
 *   - 미국: 글 날짜(KST) **전날** 이하의 마지막 뉴욕장. 글을 쓰는 한국 저녁엔 그 날짜의 뉴욕장이 아직 안 열렸다.
 * 예전엔 지난 글도 `stocks` 표의 가장 최근 값을 보여 날마다 바뀌었고, 토요일 글에 목요일 등락이 날짜 없이 섰다(10월 17일 글의
 * SK하이닉스 −11.06%, 실제 금요일 +0.79%).
 */

/** YYYY-MM-DD 에 날수를 더한다(달력 날). */
export function shiftDate(date: string, days: number): string {
  const t = Date.parse(`${date}T00:00:00Z`) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * 국내 야후 실시간 값을 쓸까. 저장된 KRX 종가가 아직 글 날짜의 거래일에 못 미쳤을 때만 — KRX 는 그날 종가를 다음 날 아침에 준다.
 * 야후 세션 날짜가 글 날짜를 넘으면(다음 날 장이 열린 뒤 어제 글) 그건 다른 날의 시세라 안 쓴다. 세션 날짜를 모르면 안 쓴다.
 */
export function takeLiveKr(liveDate: string | null, storedDate: string | null, noteDate: string): boolean {
  if (liveDate == null || liveDate > noteDate) return false;
  return storedDate == null || liveDate > storedDate;
}

/** 미국 현재가가 글 날짜의 장인가 — 세션 날짜(뉴욕)가 글 날짜보다 앞이면 그게 가장 최근에 끝난, 글 날짜 전날 이하의 장이다. */
export function liveUsIsNoteSession(sessionDate: string | null, noteDate: string): boolean {
  return sessionDate != null && sessionDate < noteDate;
}

export type DayBar = { date: string; close: number };

/**
 * 일봉(오래된→최신)에서 글 날짜 전날 이하의 마지막 봉과 그 앞 봉으로 종가 · 등락률을 낸다. 앞 봉이 없으면 등락률은 null.
 * 봉 날짜는 거래소 현지(뉴욕) 날짜다(lib/yahoo-history exchangeDate).
 */
export function usCloseBefore(bars: DayBar[], noteDate: string): { price: number; changeRate: number | null; date: string } | null {
  let i = bars.length - 1;
  while (i >= 0 && bars[i].date >= noteDate) i--;
  if (i < 0) return null;
  const cur = bars[i];
  const prev = i > 0 ? bars[i - 1] : null;
  const changeRate = prev && prev.close !== 0 ? (cur.close / prev.close - 1) * 100 : null;
  return { price: cur.close, changeRate, date: cur.date };
}
