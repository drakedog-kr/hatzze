/**
 * 히어로 인기 테마 막대의 툴팁 — 그 테마가 **평소보다** 밝은지 어두운지를 한 마디로 말한다.
 * 국장·미장 두 화면이 같이 쓴다.
 *
 * 막대는 낙관도 그대로 나눈다(낙관 67% 면 주황 67%). 한때(2026-09-29) 막대가 나뉘는 지점을
 * 평소 대비로 옮겼는데, 두 색 막대는 누구나 비율로 읽는다 — 낙관 126건 · 비관 59건인 테마가
 * 평소(80%)보다 낮다는 이유로 파랑 76% 로 그려져 "낙관이 더 많은데 비관이 훨씬 길다"는 말을
 * 들었다(2026-09-30). 그래서 막대는 비율로 되돌리고 평소와 견준 말은 툴팁 첫마디가 맡는다.
 *
 * 평소와 견주는 까닭은 그대로다 — 테마 글은 회사 호재가 대부분이라 절대 낙관도는 늘 밝다
 * (lib/telegram-data loadThemeUsual 주석). 막대만 보면 다 주황이니 툴팁이 차이를 짚는다.
 */
type ThemeRow = { pos: number; usual: number | null };

/** 평소와 이만큼 안쪽이면 '평소와 비슷'.
 *  ⚠️ data-pipeline/scripts/generate_telegram_narratives.py 의 THEME_USUAL_BAND 와 **같은 값**이어야
 *  한다. 국장 총평이 바로 옆에서 같은 테마를 "평소보다 비관 쪽"이라고 말하는데, 툴팁이 "평소와
 *  비슷"이라고 하면 어느 쪽이 맞는지 확인할 길이 없다(손 사본 관례, THEME_TOP_N 주석). */
export const THEME_USUAL_BAND = 5;

/** 막대 줄의 툴팁. 데이터 툴팁이라 15자 규칙 밖이다.
 *  건수(언급 273건 중 비관 59 · 낙관 126)는 뺐다 — 중립이 빠져 합이 안 맞고, 평활 때문에
 *  건수로 나눈 값과 낙관도가 1%p 갈려 읽는 사람이 계산을 맞춰 보다 막혔다. */
export function themeTip(t: ThemeRow): string {
  const pos = `낙관 ${t.pos}%`;
  if (t.usual === null) return `${pos} · 평소 기록이 아직 적어요`;
  const diff = t.pos - t.usual;
  const word =
    diff >= THEME_USUAL_BAND ? "평소보다 더 낙관적이에요"
      : -diff >= THEME_USUAL_BAND ? "평소보다 덜 낙관적이에요"
        : "평소와 비슷해요";
  return `${word} · ${pos} (평소 ${t.usual}%)`;
}
