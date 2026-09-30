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
type ThemeRow = { pos: number; usual: number | null; positive: number; negative: number };

/** 평소와 이만큼 안쪽이면 '평소와 비슷'. 표본이 커도 이 폭은 넘어야 '다르다'고 말한다.
 *  ⚠️ data-pipeline/scripts/generate_telegram_narratives.py 의 THEME_USUAL_BAND · THEME_USUAL_Z 와
 *  **같은 값·같은 식**이어야 한다. 국장 총평이 바로 옆에서 같은 테마를 "평소보다 비관 쪽"이라고
 *  말하는데, 툴팁이 "평소와 비슷"이라고 하면 어느 쪽이 맞는지 확인할 길이 없다(손 사본 관례). */
export const THEME_USUAL_BAND = 5;
/** 표본이 작을 때의 폭 — 우연한 흔들림(표준오차)의 이 배수를 넘어야 '다르다'고 말한다. */
export const THEME_USUAL_Z = 2;

/**
 * 평소와 견준 방향. **글이 적으면 웬만해선 '비슷'이다**(2026-09-30).
 *
 * 예전엔 화면 낙관도(평활값)와 평소의 차이가 5 이상이면 바로 '덜·더'라고 했다. 두 가지가 틀렸다.
 *  - 낙관+비관 20건이면 우연만으로도 ±10 가까이 흔들린다(p=75% 의 표준오차 9.7). 5 차이는 잡음이다.
 *  - 평활(양쪽 +5건)은 작은 표본을 50 쪽으로 당기는데 테마 평소는 늘 50 위(중앙값 79)라,
 *    평소와 **똑같은** 비율이어도 20건짜리는 10 안팎 낮게 나와 '덜 낙관적'이 됐다(평소 79 기준).
 * 그래서 평활 전 비율(낙관 ÷ 낙관+비관)을 평소와 견주고, 폭은 max(5, 2 × 표준오차)로 잡는다.
 * 185건(표준오차 3)이면 폭 6, 20건이면 폭 18 안팎이다. 표준오차는 '평소와 같다'고 볼 때의 값
 * (평소 비율로 계산)이라 평소가 극단일수록 좁아진다.
 *
 * 실측(2026-09-30, 최근 30일 날마다 상위 4테마의 판정): 예전 규칙은 '덜'이 '더'보다 훨씬 잦았다 —
 * 국장 덜 42% · 더 13%, 미장 41% · 27%. 새 규칙은 국장 21% · 22%, 미장 28% · 25% 로 한쪽에 안 쏠린다.
 */
export function usualShift(positive: number, negative: number, usual: number): "up" | "down" | "same" {
  const n = positive + negative;
  if (n === 0) return "same";
  const u = usual / 100;
  const diff = (positive / n - u) * 100;
  const band = Math.max(THEME_USUAL_BAND, THEME_USUAL_Z * Math.sqrt((u * (1 - u)) / n) * 100);
  if (diff >= band) return "up";
  if (-diff >= band) return "down";
  return "same";
}

const SHIFT_WORD = { up: "평소보다 더 낙관적이에요", down: "평소보다 덜 낙관적이에요", same: "평소와 비슷해요" } as const;

/** 막대 줄의 툴팁. 데이터 툴팁이라 15자 규칙 밖이다.
 *  건수(언급 273건 중 비관 59 · 낙관 126)는 뺐다 — 중립이 빠져 합이 안 맞고, 평활 때문에
 *  건수로 나눈 값과 낙관도가 1%p 갈려 읽는 사람이 계산을 맞춰 보다 막혔다.
 *  판정은 건수로(usualShift), 적는 숫자는 막대와 같은 평활값(pos)이다. */
export function themeTip(t: ThemeRow): string {
  const pos = `낙관 ${t.pos}%`;
  if (t.usual === null) return `${pos} · 평소 기록이 아직 적어요`;
  return `${SHIFT_WORD[usualShift(t.positive, t.negative, t.usual)]} · ${pos} (평소 ${t.usual}%)`;
}
