/**
 * 미장 종목 상세의 **카더라 언급 추이**. DB 를 안 만지는 순수 계산이라 단위 테스트
 * (tests/insider-trend.test.ts)가 그대로 부른다. 조회는 lib/insider-detail.ts 가 한다.
 */

export type MentionPoint = { date: string; mentions: number; channels: number };

/** 표에 없는 날을 0 으로 메운다. 안 메우면 막대가 주말을 건너뛰어 추이가 거짓말한다. */
function fillDays(rows: MentionPoint[], end: string, days: number): MentionPoint[] {
  const have = new Map(rows.map((r) => [r.date, r]));
  const out: MentionPoint[] = [];
  const d = new Date(`${end}T00:00:00Z`);
  for (let i = days - 1; i >= 0; i--) {
    const t = new Date(d);
    t.setUTCDate(t.getUTCDate() - i);
    const key = t.toISOString().slice(0, 10);
    out.push(have.get(key) ?? { date: key, mentions: 0, channels: 0 });
  }
  return out;
}

/**
 * `days` 일치 막대와 그 마지막 날("오늘"). 한 번도 언급되지 않은 종목은 빈 추이다.
 *
 * ⚠️ 끝점은 **언급 표 전체의 가장 최근 날**(`latest`)이다. 이 종목의 마지막 행으로 잡으면
 *    안 된다 — 표는 언급된 (날짜, 종목)만 적어서, 몇 주 전에 마지막으로 오른 종목은 그날의
 *    급등이 맨 오른쪽 막대가 되고 히어로가 "40회 언급"이라 적었다. 그 뒤 0 인 날들이 사실이다.
 * ⚠️ `latest` 를 못 읽었으면(null) 이 종목의 마지막 날로 물러난다. 빈 추이보다는 낫다.
 */
export function mentionTrend(
  rows: MentionPoint[],
  latest: string | null,
  days: number,
): { trend: MentionPoint[]; today: MentionPoint | null; date: string | null } {
  if (!rows.length) return { trend: [], today: null, date: null };
  const last = rows.reduce((m, r) => (r.date > m ? r.date : m), rows[0].date);
  const end = latest && latest > last ? latest : last;
  const trend = fillDays(rows, end, days);
  return { trend, today: trend[trend.length - 1], date: end };
}
