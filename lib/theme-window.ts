/**
 * 테마 상세(국장 `/theme/[테마]` · 미장 `/theme/us/[테마]`)의 날짜 창. lib/theme-page.ts · lib/us-theme-page.ts 가
 * 부르는 순수 계산이다(DB 없이 테스트하려고 뗐다 — tests/theme-window.test.ts).
 *
 * **기준일을 포함한다.** 히어로의 점유율·순위·증감은 테마 로테이션(getThemeRotation · getUsThemeRotation)이 기준일을
 * 넣은 사흘로 낸다 — 오늘 뜬 테마가 오늘 보여야 한다(2026-09-29 결정. 다음 날 아침에야 보이면 안 된다). 30일 막대의
 * 진한 칸·말 많은 종목·총 언급 횟수·채널에 오른 종목 수도 같은 사흘을 세야 한 칸 안의 숫자가 같은 날을 말한다.
 * 국장은 한동안 여기서 기준일을 빼(windowBefore) 히어로와 하루 어긋났다(#622 에서 찾음). 미장은 처음부터 이 규칙이었다.
 *
 * ⚠️ 테마 요약 문장(data-pipeline/scripts/generate_theme_briefs.py brief_window · generate_us_theme_briefs.py)도
 *    같은 사흘을 읽는다. 창을 바꾸면 그쪽도 같이 바꾼다.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** "YYYY-MM-DD" 기준일을 **포함한** 마지막 n 일(오래된→최신). */
export function daysEndingAt(base: string, n: number): string[] {
  const end = Date.parse(`${base}T00:00:00Z`);
  return Array.from({ length: n }, (_, i) => new Date(end - (n - 1 - i) * DAY_MS).toISOString().slice(0, 10));
}

/**
 * 테마 상세의 창 — 추이 막대 `trendLen` 일, 그 끝 `recentLen` 일(최근), 그 앞 일수(평소).
 * 말 많은 종목의 '평소 대비'가 평소 창의 **몫**을 최근 창에 옮긴 기대 언급 수와 견준다(buildHotStocks · lib/stock-usual.ts).
 */
export function themeDetailWindow(base: string, trendLen: number, recentLen: number) {
  const trendDays = daysEndingAt(base, trendLen);
  return { trendDays, recentDays: trendDays.slice(-recentLen), usualDayCount: trendDays.length - recentLen };
}
