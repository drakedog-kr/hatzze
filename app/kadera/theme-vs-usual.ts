import type { CSSProperties } from "react";

/**
 * 히어로의 인기 테마 막대 — 그 테마의 평소 낙관도(lib/telegram-data loadThemeUsual)에서 얼마나
 * 벗어났는지를 가운데 선(=평소)에서 좌우로 그린다. 왼쪽은 평소보다 비관, 오른쪽은 평소보다 낙관.
 * 국장·미장 두 화면이 같이 쓴다.
 *
 * 절대 낙관도로 그리면 늘 밝다 — 테마 글은 회사 호재가 대부분이라 78일 동안 국장 막대 95%가
 * 낙관 구간이었다(2026-09-29 실측). 그래서 '평소보다'를 그린다.
 */
type ThemeRow = { name: string; pos: number; usual: number | null; total: number };

/** 평소와 이만큼 차이 나면 반쪽을 다 채운다. 78일 실측: 차이 ±5 안이 국장 47%·미장 29%,
 *  가장 크게 벗어난 값이 국장 27·미장 37 이다. 넘치면 끝에서 멈춘다. */
export const THEME_DIFF_FULL = 25;

/** 막대 줄의 툴팁. 데이터 툴팁이라 15자 규칙 밖이다. */
export function themeTip(t: ThemeRow): string {
  return t.usual === null
    ? `${t.name} 언급 ${t.total}건 · 낙관도 ${t.pos}% · 평소 기록이 적어 견주지 않습니다`
    : `${t.name} 언급 ${t.total}건 · 낙관도 ${t.pos}% · 평소 ${t.usual}%`;
}

/** 가운데에서 뻗는 조각의 style. 평소가 없거나 평소와 같으면 null — 가운데 선만 남는다. */
export function themeDiffStyle(t: ThemeRow): CSSProperties | null {
  if (t.usual === null || t.pos === t.usual) return null;
  const up = t.pos > t.usual;
  const half = (Math.min(Math.abs(t.pos - t.usual), THEME_DIFF_FULL) / THEME_DIFF_FULL) * 50;
  return {
    position: "absolute",
    top: 0,
    bottom: 0,
    ...(up ? { left: "50%" } : { right: "50%" }),
    width: `${half}%`,
    background: up ? "var(--c-warm-3)" : "var(--c-blue-3)",
  };
}
