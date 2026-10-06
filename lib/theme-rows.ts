/**
 * 카더라 히어로 '인기 테마' 줄에 세울 테마를 고른다. 국장(lib/telegram-data.ts getEcosystemSentiment)·
 * 미장(lib/us-telegram-data.ts getUsSentiment)이 같이 쓰는 순수 계산이다(DB 없이 테스트하려고 뗐다 — tests/theme-rows.test.ts).
 *
 * ⚠️ 국장 총평 digest(data-pipeline/scripts/generate_telegram_narratives.py top_themes)와 **같은 순서**여야 한다.
 *    총평은 이 줄 바로 옆에서 같은 테마를 말한다(lib/telegram-data.ts THEME_TOP_N 주석).
 */

/**
 * 테마 줄에 세울 테마 — 언급(total) 많은 순으로 n 개. **표본 하한은 없다**(2026-10-06).
 *
 * 예전엔 낙관+비관이 20건(2026-09-29 에 8 → 20) 아래인 테마를 줄에서 뺐다. 그랬더니 연휴 끝엔 하한을
 * 넘는 테마가 반도체 하나라 10-05·10-06 이틀 동안 한 줄만 섰다. 10-06 창(개천절 연휴 사흘과 10-06 새벽치,
 * 2,453건)에서 반도체가 120건이고 그다음이 17건이었다. 07-20~10-06 기준일 80일 중 넷이 안 찬 날이
 * 5일이고 전부 연휴 끝이다. 운영자 결정은 "기간은 그대로, 건수가 적어도 넷은 항상"이다.
 *
 * 하한을 올리던 때의 줄은 낙관도를 그대로 나누는 두 색 막대라, 몇 건에 길이가 크게 흔들려 실제보다
 * 단정적으로 보였다. 지금 줄은 평소 대비 막대이고 판정이 표본 크기를 본다 — usualShift 가 표본이
 * 작을수록 '평소와 다르다'의 폭을 넓혀(20건이면 18 안팎) 얇은 테마는 대개 '평소 수준'에 머문다
 * (app/kadera/theme-vs-usual.ts). 낙관·비관이 0건인 테마는 막대 없이 '기록 적음'이다.
 *
 * 동점은 낙관+비관이 많은 쪽, 그다음 이름(코드 포인트) 순이다. 하한이 없으니 얇은 날엔 4위 자리에
 * 같은 건수가 몰린다(10-06: 2차전지·자동차·지주·밸류업 모두 26건). 조회 순서에 맡기면 총평과 옆 줄이
 * 다른 테마를 고를 수 있어, 파이썬 top_themes 와 같은 순서로 못 박는다.
 */
export function pickThemeRows<T extends { pos: number; neg: number; total: number }>(
  entries: Iterable<[string, T]>,
  n: number,
): [string, T][] {
  return [...entries]
    .filter(([scope, a]) => scope !== "overall" && a.total > 0)
    .sort(([xn, x], [yn, y]) => y.total - x.total || y.pos + y.neg - (x.pos + x.neg) || (xn < yn ? -1 : xn > yn ? 1 : 0))
    .slice(0, n);
}
