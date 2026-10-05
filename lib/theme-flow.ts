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

/**
 * 창을 고를 날 — 표본이 거의 없는 날(thinDays)을 뺀 날짜(오래된→최신). 테마 로테이션 · 테마 상세 · 이슈 키워드가 '최근 3일'을
 * 이 목록 끝에서 고른다. 날마다의 몫을 같은 무게로 평균하므로, 언급 4건짜리 아침(2026-10-04 국장)이 그대로 들어가면 그날 100% 가
 * 사흘 평균의 1/3 을 차지해 반도체가 66.7% 로 부풀었다(언급으로 재면 38%). 주말 하루(평소의 7% 이상)는 남는다 —
 * '오늘 뜬 테마는 오늘 보여야 한다'(2026-09-29, lib/theme-window.ts)는 그대로다.
 * ⚠️ 파이프라인 짝(common/thin_days.py)과 같은 문턱 · 같은 규칙이다. 한쪽만 고치면 화면과 문장이 다른 사흘을 말한다.
 */
export function usableDays(dayTotals: Map<string, number> | null, days: string[]): string[] {
  const thin = thinDays(dayTotals, days);
  return days.filter((d) => !thin.has(d));
}

/** 테마 점유율 변화가 견주는 간격(일) — 화면 글자 '1주 전 대비'. */
export const THEME_COMPARE_DAYS = 7;

/**
 * 테마 점유율 변화의 견줄 날 — 최근 창(recent)의 날마다 정확히 1주(THEME_COMPARE_DAYS) 앞, 같은 요일이다. 그 날이 쓸 날(usable,
 * 얇은 날을 뺀 날짜)에 없으면 뺀다 — 비면 변화를 안 적는다.
 * 예전엔 '5일 이상 전 평균'(5~14일 전)이라 화면이 '1~2주 전 대비'로 적었는데, 머리 근거로는 기간이 둘이라 헷갈렸고 '1주 전 대비'로
 * 통일했다(2026-10-05 운영자 판단). 2026-08-01~10-04 65일을 되돌려 보면 변화의 방향은 81%(국장) · 82%(미장)가 같고, 하루 사이 흔들림은
 * 20% 남짓 커진다(국장 중앙 0.81 → 1.03%p) — 견주는 날이 열흘에서 사흘로 준 값이다.
 * ⚠️ 파이프라인 짝(common/thin_days.py week_ago_dates)과 같은 규칙이다. 방송 테마 글이 같은 날 같은 테마의 변화를 적는다.
 */
export function weekAgoDates(recent: string[], usable: string[]): string[] {
  const have = new Set(usable);
  return recent
    .map((d) => new Date(Date.parse(`${d}T00:00:00Z`) - THEME_COMPARE_DAYS * 86_400_000).toISOString().slice(0, 10))
    .filter((d) => have.has(d));
}

/**
 * 하루 앞(쓸 날의 끝에서 둘째 날)에서 끝나는 n 일 평균 점유율 순위 — '5위 밖으로 밀린 테마'를 표 순위(최근 n 일 평균)와 같은 잣대로
 * 견주려고 낸다. 어제 **하루** 순위와 오늘 3일 순위를 견주면 표에서 오르는 중인 테마가 '밀렸다'로 떴다(2026-10-04 점검, 조선).
 * 그날 집계에 없는 테마는 0 으로 친다(창 전체 일수로 나눈다 — 테마 로테이션과 같다).
 */
export function prevWindowRanks(shareOn: Map<string, Map<string, number>>, dates: string[], themes: string[], n: number): Map<string, number> {
  const win = dates.slice(-(n + 1), -1);
  if (!win.length) return new Map();
  const avg = themes.map((t) => [t, win.reduce((a, d) => a + (shareOn.get(d)?.get(t) ?? 0), 0) / win.length] as const);
  return new Map([...avg].sort((a, b) => b[1] - a[1]).map(([t], i) => [t, i + 1]));
}

