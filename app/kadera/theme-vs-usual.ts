/**
 * 히어로의 인기 테마 막대가 나뉘는 지점 — 그 테마의 평소 낙관도(lib/telegram-data loadThemeUsual)를
 * 가운데(50:50)로 옮겨 그린다. 평소와 같으면 반반, 평소보다 낙관 쪽이면 주황이 길어진다.
 * 막대 모양·제목은 예전 그대로이고 기준만 바뀌었다. 국장·미장 두 화면이 같이 쓴다.
 *
 * 절대 낙관도로 나누면 늘 밝다 — 테마 글은 회사 호재가 대부분이라 78일 동안 국장 막대 95%가
 * 낙관 구간이었다(2026-09-29 실측). 그래서 '평소보다'를 그린다.
 */
type ThemeRow = { name: string; pos: number; usual: number | null; positive: number; negative: number; total: number };

/** 평소와 이만큼 차이 나면 한쪽 끝까지 간다. 78일 실측: 차이 ±5 안이 국장 47%·미장 29%,
 *  가장 크게 벗어난 값이 국장 27·미장 37 이다. 넘치면 끝 조금 앞(THEME_SHOWN_EDGE)에서 멈춘다. */
export const THEME_DIFF_FULL = 25;
const THEME_SHOWN_EDGE = 3; // 한쪽 색이 통째로 사라지면 막대가 한 색 띠로 보인다

/** 막대의 낙관(주황) 쪽 폭(%). 평소가 없으면 예전처럼 그 테마의 낙관도 그대로다. */
export function themeShownPos(t: ThemeRow): number {
  if (t.usual === null) return t.pos;
  const shown = 50 + ((t.pos - t.usual) / THEME_DIFF_FULL) * 50;
  return Math.round(Math.min(100 - THEME_SHOWN_EDGE, Math.max(THEME_SHOWN_EDGE, shown)));
}

/** 막대 줄의 툴팁. 데이터 툴팁이라 15자 규칙 밖이다. */
export function themeTip(t: ThemeRow): string {
  const counts = `${t.name} 언급 ${t.total}건 중 비관 ${t.negative}건 · 낙관 ${t.positive}건`;
  return t.usual === null
    ? `${counts} (평소 기록이 적어 낙관도 ${t.pos}% 그대로)`
    : `${counts} (낙관도 ${t.pos}% · 평소 ${t.usual}%)`;
}
