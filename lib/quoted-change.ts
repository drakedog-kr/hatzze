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

/**
 * quoted 에 가장 가까운 실제 세션(봉 날짜 · 등락 %) — 그 글 날짜(포함)에서 LOOKBACK_DAYS 일 앞까지의 세션 가운데. 없으면 null.
 * 글 날짜와 같은 뉴욕 날짜 세션은 KST 로 그날 밤 22:30 에 열려 낮에 쓴 글보다 뒤다 — 앞 세션에 후보가 없을 때만 쓴다.
 * `used` 의 세션은 건너뛴다(이미 다른 날 글이 가져간 세션 · 아래 verifiedChangesOnce).
 */
export function verifiedSession(quoted: number | null, msgDate: string, bars: Bar[] | null, used?: Set<string>): { date: string; change: number } | null {
  if (quoted === null || !bars || bars.length < 2) return null;
  const from = new Date(Date.parse(`${msgDate}T00:00:00Z`) - LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10);
  const pick = (sameDay: boolean) => {
    let best: { date: string; change: number } | null = null;
    for (let i = 1; i < bars.length; i++) {
      const d = bars[i].date;
      if (d < from || d > msgDate || (d === msgDate) !== sameDay || used?.has(d)) continue;
      const prev = bars[i - 1].close;
      if (!(prev > 0)) continue;
      const ch = (bars[i].close / prev - 1) * 100;
      if (near(ch, quoted) && (best === null || Math.abs(ch - quoted) < Math.abs(best.change - quoted))) best = { date: d, change: ch };
    }
    return best;
  };
  return pick(false) ?? pick(true);
}

/** quoted 에 가장 가까운 실제 세션 등락(%). 없으면 null. */
export function verifiedChange(quoted: number | null, msgDate: string, bars: Bar[] | null): number | null {
  return verifiedSession(quoted, msgDate, bars)?.change ?? null;
}

/**
 * 한 종목의 여러 날 이유에 세션을 붙인다 — 같은 세션은 한 번만(가장 이른 글이 가져간다). 나머지 날은 null('-').
 * 글 날짜 앞 나흘을 보니 같은 세션이 날마다 다시 뽑혀 TSMC +0.90% 가 나흘 연속 섰고, 읽는 사람은 그날 등락으로 읽었다(2026-10-05 점검).
 * rows 는 같은 종목의 것만 넘긴다. 돌려주는 배열은 rows 와 같은 차례다.
 */
export function verifiedChangesOnce(rows: { quoted: number | null; date: string }[], bars: Bar[] | null): (number | null)[] {
  const used = new Set<string>();
  const out: (number | null)[] = rows.map(() => null);
  const order = rows.map((r, i) => ({ r, i })).sort((a, b) => (a.r.date < b.r.date ? -1 : a.r.date > b.r.date ? 1 : a.i - b.i));
  for (const { r, i } of order) {
    // 이미 쓴 세션은 빼고 고른다 — 가장 가까운 세션을 앞 날 글이 가져갔다고 비우면, 채널 숫자가 조금 어긋난 앞 날 글이 다음 날
    // 세션을 가져가 정작 그 세션을 말한 다음 날 줄이 '-'가 됐다(2026-10-05 머지 전 점검).
    const s = verifiedSession(r.quoted, r.date, bars, used);
    if (!s) continue;
    used.add(s.date);
    out[i] = s.change;
  }
  return out;
}
