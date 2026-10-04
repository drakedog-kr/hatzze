/**
 * 히어로 인기 테마 줄 — 그 테마가 **평소보다** 밝은지 어두운지. 국장·미장 두 화면이 같이 쓴다.
 *
 * 줄은 **평소 대비 막대**다(2026-10-01). 가운데 눈금이 그 테마의 평소이고, 오늘이 평소보다 낙관이
 * 적으면 왼쪽(파랑)·많으면 오른쪽(주황)으로 뻗는다. 낙관도 그대로 나누던 두 색 막대를 걷은 까닭은
 * 높이다 — 테마 글은 회사 호재가 대부분이라 늘 25~35점 위에 떠 있다. 6/29~9/30 실측(임시 측정,
 * 숫자 전부는 커밋 '🧪 임시 측정을 걷는다' 메시지에): 지수가 1% 넘게 내린 날 큰 숫자 평균 28 ·
 * 반도체 막대 64 · 지주·밸류업 85. 오늘+어제 값이 비관 구간에 든 날은 큰 숫자 31% · 화면 4테마 0%.
 * 그래서 큰 숫자가 '비관 우세'인 날에도 네 줄이 다 주황으로 섰다.
 *
 * 높이만 문제지 움직임은 맞다 — 하루 낙관 비율과 그 테마 주가 등락의 상관이 반도체 +0.63 · 자동차
 * +0.43 · 미장 메모리 +0.61 · AI반도체 +0.47 이고, 평소 대비로 바꿔도 거의 같다(반도체 +0.65). 평소를
 * 빼면 떠 있던 높이만 걷힌다. 주가를 안 따라오는 테마(지주·밸류업 +0.06)도 줄에서 빼지 않는다 —
 * 이 칸은 인기 테마 자리다. 그런 테마는 하루 값이 잘 안 움직여 가운데 근처에 머문다.
 *
 * ⚠️ 두 색 막대로 평소 대비를 그리면 안 된다. 2026-09-29 에 나뉘는 지점만 평소 대비로 옮겼다가
 *    "낙관이 더 많은데 비관이 훨씬 길다"는 말을 들었다(2026-09-30). 두 색 막대는 누구나 비율로 읽는다.
 *    가운데에서 뻗는 막대는 비율로 읽히지 않는다.
 */
export type ThemeRow = { pos: number; usual: number | null; positive: number; negative: number };

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

// 서비스 말투는 합쇼체(~니다)다 — 해요체로 남아 있었다(2026-10-04 문구 점검, 국장 · 미장 카더라 테마별 낙관도 툴팁).
const SHIFT_WORD = { up: "평소보다 더 낙관적입니다", down: "평소보다 덜 낙관적입니다", same: "평소와 비슷합니다" } as const;

/** 막대 반쪽을 다 채우는 평소와의 차이(%p). 넘으면 끝까지 채운다. 실측상 큰 테마의 흔들림이 ±20 안팎이다. */
export const THEME_LEAN_FULL = 20;

export type ThemeLean = { shift: "up" | "down" | "same"; side: "left" | "right"; width: number };

/**
 * 평소 대비 막대의 방향·길이. width 는 **트랙 전체 대비 %**(반쪽이 50).
 *
 * 길이는 평활 전 비율(낙관 ÷ 낙관+비관)과 평소의 차이다 — 판정(usualShift)과 같은 값이라 방향이 판정과
 * 어긋나지 않는다. 평활값(pos)으로 재면 글이 적은 테마가 50 쪽으로 당겨져, 평소와 같은 비율인데도
 * 왼쪽으로 뻗는다(usualShift 주석의 2026-09-30 실측과 같은 함정).
 * 평소가 없거나 글이 없으면 null — 막대 없이 눈금만 그린다.
 */
export function themeLean(t: ThemeRow): ThemeLean | null {
  const n = t.positive + t.negative;
  if (t.usual === null || n === 0) return null;
  const diff = (t.positive / n) * 100 - t.usual;
  const shift = usualShift(t.positive, t.negative, t.usual);
  // 판정 폭이 5 이상이라(THEME_USUAL_BAND) '덜·더' 줄은 반쪽의 1/4 아래로 짧아지지 않는다 — 따로 최소 길이를 둘 일이 없다.
  const width = (Math.min(Math.abs(diff), THEME_LEAN_FULL) / THEME_LEAN_FULL) * 50;
  return { shift, side: diff < 0 ? "left" : "right", width: Math.round(width * 10) / 10 };
}

/** 줄 끝의 한마디. '비관'이라 하지 않는다 — 낙관이 과반인 테마가 평소보다 낮을 뿐인 날이 대부분이다. */
export const LEAN_WORD = { up: "더 낙관", down: "덜 낙관", same: "평소 수준", none: "기록 적음" } as const;

/** 막대 줄의 툴팁. 데이터 툴팁이라 15자 규칙 밖이다.
 *  건수(언급 273건 중 비관 59 · 낙관 126)는 뺐다 — 중립이 빠져 합이 안 맞아 읽는 사람이 계산을 맞춰 보다 막혔다.
 *  적는 숫자는 **판정 · 막대와 같은 평활 전 비율**(낙관 ÷ 낙관+비관)이다. 평활값(pos)을 적으면 평소가 80~90% 대인 테마가
 *  늘 평소보다 낮게 읽혀, 30건 모두 낙관(막대는 오른쪽)인 전자·부품이 '낙관 88% (평소 92%)'로 떴다(2026-10-04 점검). */
export function themeTip(t: ThemeRow): string {
  const n = t.positive + t.negative;
  const pos = `낙관 ${n > 0 ? Math.round((t.positive / n) * 100) : t.pos}%`;
  if (t.usual === null) return `${pos} · 평소 기록이 아직 적습니다`;
  return `${SHIFT_WORD[usualShift(t.positive, t.negative, t.usual)]} · ${pos} (평소 ${t.usual}%)`;
}
