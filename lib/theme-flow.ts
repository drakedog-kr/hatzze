/* 테마 흐름 · 추이의 순수 셈 — 서버 전용인 lib/theme-page.ts 에서 떼어 테스트한다(tests/theme-flow.test.ts). */

/**
 * 판정용 흐름 — 마지막 날(기준일)을 그날 하루 순위가 아니라 **표의 순위(최근 3일 점유율)** 로 바꾼다.
 * 기준일은 아침이면 글이 거의 없어(2026-10-04 오전 국장 테마 언급 4건) 하루 순위가 흔들렸고, 그 바람에 표 3위 테마가
 * '상위에서 내려간 테마 · 3위'로, 표 상위 줄에 '상위 밖'이 붙었다(2026-10-04 점검). 그 전 날들은 하루 순위 그대로다.
 */
export function withTodayRank(flow: (number | null)[], rank: number): (number | null)[] {
  return flow.length ? [...flow.slice(0, -1), rank] : flow;
}

/** 하루 표본이 이보다 적으면(평소 하루 대화 총량의 이 비율 미만) 추이에서 '집계 없음'으로 둔다. 주말은 7% 이상이라 남는다. */
const THIN_DAY_FRAC = 0.05;

/**
 * 표본이 거의 없는 날 — 테마 대화 총량이 평소(집계가 있는 날의 중앙값)의 5% 미만인 날. 기준일 아침이 그렇다
 * (2026-10-04 오전 국장 4건 · 미장 11건 — 반도체 점유율이 100% 로 찍혀 '30일 최고 100%'가 됐다). 총량을 못 읽으면 빈 집합.
 */
export function thinDays(dayTotals: Map<string, number> | null, days: string[]): Set<string> {
  if (!dayTotals) return new Set();
  const vals = days.map((d) => dayTotals.get(d) ?? 0).filter((v) => v > 0).sort((a, b) => a - b);
  if (vals.length === 0) return new Set();
  const mid = vals.length % 2 ? vals[(vals.length - 1) / 2] : (vals[vals.length / 2 - 1] + vals[vals.length / 2]) / 2;
  return new Set(days.filter((d) => (dayTotals.get(d) ?? 0) < mid * THIN_DAY_FRAC));
}
