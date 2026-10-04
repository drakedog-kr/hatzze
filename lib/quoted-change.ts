/**
 * 채널이 적은 미국 종목 등락률(quoted_change_rate)을 야후 일봉으로 맞춰 본다 — 순수 함수(tests/quoted-change.test.ts).
 *
 * 미장은 메시지 날짜(KST)와 미국 세션이 어긋나 '그날 종가'가 정의되지 않아(마이그레이션 069) 채널 숫자를 그대로 실었다.
 * 그랬더니 이유는 '기술주 랠리'인데 −3.00%, 엔비디아 하루 +22.10% 같은 값이 소수 둘째 자리 · 색까지 달고 섰다(2026-10-04 점검).
 * 그 글이 올라온 날 앞 며칠 세션 가운데 채널 숫자와 가까운 실제 등락이 있으면 그 **실제 값**을 쓰고, 없으면 비운다('-').
 */
import type { Bar } from "./mdd";

/** 글 날짜(KST)에서 며칠 앞 세션까지 볼까 — 주말 · 시차로 글은 세션 하루이틀 뒤에 온다. */
const LOOKBACK_DAYS = 4;

/** 가깝다고 볼 폭 — 1%p 또는 채널 값의 30% 가운데 큰 쪽. 채널은 반올림해 적는다(±1.00 · −3.00 꼴이 많다). */
function near(actual: number, quoted: number): boolean {
  return Math.abs(actual - quoted) <= Math.max(1, Math.abs(quoted) * 0.3);
}

/** quoted 에 가장 가까운 실제 세션 등락(%) — 그 글 날짜(포함)에서 LOOKBACK_DAYS 일 앞까지의 세션 가운데. 없으면 null. */
export function verifiedChange(quoted: number | null, msgDate: string, bars: Bar[] | null): number | null {
  if (quoted === null || !bars || bars.length < 2) return null;
  const from = new Date(Date.parse(`${msgDate}T00:00:00Z`) - LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10);
  let best: number | null = null;
  for (let i = 1; i < bars.length; i++) {
    const d = bars[i].date;
    if (d < from || d > msgDate) continue;
    const prev = bars[i - 1].close;
    if (!(prev > 0)) continue;
    const ch = (bars[i].close / prev - 1) * 100;
    if (near(ch, quoted) && (best === null || Math.abs(ch - quoted) < Math.abs(best - quoted))) best = ch;
  }
  return best;
}
