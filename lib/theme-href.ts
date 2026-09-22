import { THEMES } from "./stock-themes.ts";

/**
 * 테마 실주소 — `server-only` 가 **아니다.** 셸(AppShell, 클라이언트 컴포넌트)이 테마 26장의
 * 제목을 DEEP_PAGES 에 올리려고 읽는다. DB 를 읽는 것은 lib/theme-page.ts 에 있다.
 *
 * ## 주소는 영문 슬러그다(2026-09-22)
 *
 * 처음엔 사전의 한글 키가 곧 주소였다(/theme/반도체). 검색엔진은 둘 다 읽지만, 한글 주소는 복사·공유될 때
 * 퍼센트 부호로 풀려(/theme/%EB%B0%98%EB%8F%84%EC%B2%B4, 반도체 세 글자가 27자) 메신저·게시판에서 길고
 * 낯설게 보인다. 제목·h1·설명이 한글이라 검색어 매칭은 거기서 되고, 주소는 짧고 안정된 영문이 낫다(Hun).
 * 열기 전이라 색인된 옛 주소는 없다. 그래도 한글 이름으로 들어오면 슬러그로 301 보낸다(page.tsx).
 *
 * ⚠️ 사전의 26개와 슬러그 26개가 1:1 이어야 한다 — 모듈을 읽을 때 검사한다. 테마를 더하면 여기도 더한다.
 */
export const THEME_SLUGS: Record<string, string> = {
  반도체: "semiconductor",
  방산: "defense",
  "2차전지": "battery",
  조선: "shipbuilding",
  원전: "nuclear",
  바이오: "bio",
  자동차: "auto",
  금융: "finance",
  "인터넷·플랫폼": "internet-platform",
  "엔터·미디어": "entertainment-media",
  "지주·밸류업": "holdings-valueup",
  "전력기기·전선": "power-grid",
  로봇: "robot",
  "전자·부품": "electronics",
  신재생에너지: "renewable-energy",
  "화장품·뷰티": "beauty",
  "건설·부동산": "construction",
  "AI·소프트웨어": "ai-software",
  "화학·정유": "chemical-refining",
  "유통·소비재": "retail-consumer",
  음식료: "food",
  "의료기기·진단": "medical-device",
  통신: "telecom",
  "해운·물류": "shipping-logistics",
  "철강·비철금속": "steel-metals",
  "기계·산업장비": "machinery",
};

/** 사전의 테마 이름 전부(사전 순서). 목록 화면·사이트맵·셸이 같은 목록을 본다. */
export const THEME_NAMES: string[] = Object.keys(THEMES);

const THEME_OF_SLUG = new Map<string, string>();
for (const name of THEME_NAMES) {
  const slug = THEME_SLUGS[name];
  if (!slug) throw new Error(`테마 "${name}" 의 슬러그가 lib/theme-href.ts THEME_SLUGS 에 없습니다`);
  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error(`테마 슬러그 "${slug}" 는 소문자·숫자·붙임표만 됩니다`);
  if (THEME_OF_SLUG.has(slug)) throw new Error(`테마 슬러그 "${slug}" 가 둘입니다`);
  THEME_OF_SLUG.set(slug, name);
}

/** 테마의 주소 조각(슬러그). */
export const themeSlug = (theme: string): string => THEME_SLUGS[theme];

/** 테마 실주소. 링크·사이트맵·셸이 한 곳에서 만든다 — 어긋나면 안 된다. */
export const themeHref = (theme: string) => `/theme/${themeSlug(theme)}`;

/**
 * 주소 조각을 사전의 이름으로 되돌린다. 슬러그가 먼저고, 옛 꼴(한글 이름, 퍼센트 부호화 포함)도 받는다 —
 * 그 경우 화면이 슬러그 주소로 301 보낸다(themeSlug(name) !== param 이면). 사전에 없으면 null(404).
 */
export function themeFromParam(param: string): string | null {
  const bySlug = THEME_OF_SLUG.get(param);
  if (bySlug) return bySlug;
  let name: string;
  try {
    name = decodeURIComponent(param);
  } catch {
    return null;
  }
  return name in THEMES ? name : null;
}
