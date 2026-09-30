/**
 * 종목 언급의 **'평소 대비'** — 테마 화면 '이 테마의 주인공' 표의 태그, 종목 지도의 칸 색, 테마 목록 '테마별 급부상'
 * 태그 색이 같이 쓴다. DB 를 안 만지는 순수 함수라 단위 테스트(tests/stock-usual.test.ts)가 그대로 부른다.
 *
 * ## 평소는 언급 수가 아니라 몫으로 잰다 (2026-09-30)
 *
 * 예전 '평소'는 앞 27일 하루 평균 언급 × 최근 일수였다. 주말엔 대화가 평일의 1/10 이라(calculate_theme_daily.py 머리
 * 주석) 관심이 늘 같은 종목(평일 10회 · 주말 1회)도 기준일 요일에 따라 월 −48% · 화 −9% · 수~금 +36% · 일 −45% 로
 * 찍혔다. 월요일 표는 모든 종목이 파란 '평소 대비 −45%'였다(theme#0). 게다가 아침 실행 땐 오늘이 몇 시간치뿐이라
 * 최근 창이 더 눌렸다.
 *
 * 지금은 **테마 대화 총량에서 차지한 몫**으로 잰다 — 평소 몫(앞 27일 언급 합 ÷ 그날들 총량 합)이 최근 사흘에도
 * 그대로였다면 나왔을 언급 수가 '평소'다. 총량은 그날 테마마다 센 언급 합(telegram_theme_daily.mention_count 의
 * 날짜별 합)이고, 파이프라인의 테마 급부상(data-pipeline/common/theme_risers.py)이 같은 분모로 배수를 낸다.
 * 요일·진행 중인 오늘은 분자·분모가 같이 움직여 몫에서 지워진다.
 */

/**
 * 평소 몫으로 본 **최근 창의 기대 언급 수**. 표·지도·태그가 이 값과 최근 언급을 견준다.
 *
 * `dayTotals` 가 없거나 한쪽 창의 총량이 0 이면 예전 식(하루 평균 × 최근 일수)으로 물러선다 — 총량 조회가 실패한
 * 날에도 표는 선다(그날의 값은 요일을 탄다).
 */
export function expectedUsualMentions({
  usualSum,
  recentDays,
  usualDays,
  dayTotals,
}: {
  /** 평소 창(최근 사흘을 뺀 앞날들)의 이 종목 언급 합. */
  usualSum: number;
  recentDays: string[];
  usualDays: string[];
  /** 날짜 → 그날 테마 대화 총량. */
  dayTotals: Map<string, number> | null;
}): number {
  if (dayTotals) {
    const sum = (days: string[]) => days.reduce((s, d) => s + (dayTotals.get(d) ?? 0), 0);
    const recentT = sum(recentDays);
    const usualT = sum(usualDays);
    if (recentT > 0 && usualT > 0) return (usualSum / usualT) * recentT;
  }
  return usualDays.length > 0 ? (usualSum / usualDays.length) * recentDays.length : 0;
}

/**
 * 배수 → 색 단계(kadera.css 의 .is-up-N · .is-down-N · .is-flat). `ratio` 가 null 이면 새로 등장이라 언급 수로 단을 고른다.
 * 문턱: 1.5배 이상·2.5배 이상·5배 이상. 줄어든 쪽도 같은 비율.
 */
export function toneForRatio(ratio: number | null, mentions: number): string {
  if (ratio === null) return mentions >= 5 ? "is-up-3" : mentions >= 2 ? "is-up-2" : "is-up-1";
  if (ratio >= 5) return "is-up-3";
  if (ratio >= 2.5) return "is-up-2";
  if (ratio >= 1.5) return "is-up-1";
  if (ratio <= 1 / 5) return "is-down-3";
  if (ratio <= 1 / 2.5) return "is-down-2";
  if (ratio <= 1 / 1.5) return "is-down-1";
  return "is-flat";
}

/** 종목의 색 단계 — 최근 언급과 평소(expectedUsualMentions)를 견준다. 지도 칸과 표의 이름 옆 태그가 같은 색을 쓴다. */
export function stockTone(mentions: number, usual: number): string {
  return toneForRatio(usual === 0 ? null : mentions / usual, mentions);
}

/**
 * 평소와 견준 변화의 짧은 꼴 — 지도 칸 글자("+60%" · "−42%" · "3배" · "10배 넘게" · "새로 등장" · "평소만큼").
 *
 * ⚠️ 세 배부터는 %가 아니라 배로 적고 **열 배에서 멈춘다.** 27일에 한 번 스친 종목은 평소가 0.1회라 최근 10회면
 *    "+8900%"가 찍혔다(theme#15). 그런 자리의 숫자는 뜻보다 잡음이 크다.
 */
export function usualDeltaShort(mentions: number, usual: number): string {
  if (usual === 0) return "새로 등장";
  const ratio = mentions / usual;
  if (ratio >= 10) return "10배 넘게";
  if (ratio >= 3) return `${Math.round(ratio)}배`;
  const pct = Math.round((ratio - 1) * 100);
  if (pct === 0) return "평소만큼";
  return `${pct > 0 ? "+" : "−"}${Math.abs(pct)}%`;
}

/** 평소와 견준 언급 변화 한 마디 — "평소 대비 +60% 언급" · "평소의 3배 언급" · "새로 등장". 표 태그와 지도 툴팁이 같이 쓴다. */
export function usualDeltaText(mentions: number, usual: number): string {
  const short = usualDeltaShort(mentions, usual);
  if (short === "새로 등장") return short;
  if (short === "평소만큼") return "평소만큼 언급";
  return short.endsWith("%") ? `평소 대비 ${short} 언급` : `평소의 ${short} 언급`;
}
