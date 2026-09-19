import { THEMES } from "./stock-themes";

/**
 * 테마 실주소 — `server-only` 가 **아니다.** 셸(AppShell, 클라이언트 컴포넌트)이 테마 26장의
 * 제목을 DEEP_PAGES 에 올리려고 읽는다. DB 를 읽는 것은 lib/theme-page.ts 에 있다.
 *
 * 사전(lib/stock-themes.ts)의 키가 곧 주소다. 이름에 든 가운뎃점(전력기기·전선)은 퍼센트
 * 부호화되어 오가고, 화면은 themeFromParam 으로 되돌려 사전을 찾는다.
 */

/** 테마 실주소. 링크·사이트맵·셸이 한 곳에서 만든다 — 어긋나면 안 된다. */
export const themeHref = (theme: string) => `/theme/${encodeURIComponent(theme)}`;

/** 사전의 테마 이름 전부(사전 순서). 목록 화면·사이트맵·셸이 같은 목록을 본다. */
export const THEME_NAMES: string[] = Object.keys(THEMES);

/** 주소 조각을 사전의 이름으로 되돌린다. 사전에 없으면 null(404). */
export function themeFromParam(param: string): string | null {
  let name: string;
  try {
    name = decodeURIComponent(param);
  } catch {
    return null;
  }
  return name in THEMES ? name : null;
}
