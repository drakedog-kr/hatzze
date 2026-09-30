import { SITE_URL } from "./brand";
import { DIVIDEND_PAGE } from "./dividend/copy";
import { INSIDER_LIST_SLUGS } from "./insider/lists";
import { RELEASES } from "./releases";
import { DIVIDEND_PUBLIC, THEME_PUBLIC } from "./screen-flags";
import { THEME_PAGE, US_THEME_PAGE } from "./theme/copy";
// ⚠️ 상대 경로다 — scripts/check-routes.mjs 가 이 파일을 맨 node 로 읽어서 `@/` 별칭을 못 푼다.
import { THEME_NAMES, US_THEME_NAMES, themeHref, usThemeHref } from "../lib/theme-href";

/**
 * 사이트맵에 실을 주소 **한 벌**. `/sitemap.xml` 과 `/sitemap-pages.xml` 이 이걸 나눠 쓴다.
 *
 * 두 사이트맵이 각자 목록을 들면 언젠가 어긋나는데, 그 어긋남은 화면에서 안 보인다.
 * 사이트맵을 두 번 빠뜨린 이력이 있어서(`/seohak`·`/insider`) 목록은 한 곳에만 둔다.
 *
 * ## ⚠️ 화면을 새로 열면 여기부터 본다
 *
 * 새 화면을 열 때 챙길 것은 셋이다. ①여기 한 줄 ②`opengraph-image` ③사이드바 NAV.
 * 빠뜨리면 `npm run check:routes` 가 막는다(scripts/check-routes.mjs).
 */
export type SitemapEntry = {
  /** 사이트 루트 기준 경로. 홈은 "/" 다. */
  path: string;
  changeFrequency: "daily" | "monthly" | "yearly";
  priority: number;
  /**
   * 마지막으로 바뀐 날(YYYY-MM-DD). **아는 곳에만** 적는다.
   *
   * 예전엔 모든 줄이 '지금'이었다. 그런데 `/sitemap.xml` 은 요청 시각 API 를 안 쓰는 규약 파일이라 **빌드 때
   * 굳는다**(Next 문서 sitemap.md) — 배포할 때마다 약관까지 "방금 바뀜"이었고, 요청마다 그리는 `/sitemap-pages.xml`
   * 과도 값이 달랐다. 틀린 수정일이 쌓이면 검색엔진은 그 사이트맵의 lastmod 를 통째로 안 믿는다. 매일 바뀌는
   * 화면의 진짜 날짜는 DB 에 있어 이 목록(DB 를 안 읽는다)이 모르므로 비운다. IndexNow 도 이 값으로 고른다
   * (scripts/indexnow-urls.mjs — 비어 있으면 changefreq 로 판단한다).
   */
  lastmod?: string;
};

export const SITEMAP_ENTRIES: SitemapEntry[] = [
  { path: "/", changeFrequency: "daily", priority: 1 },
  { path: "/kadera", changeFrequency: "daily", priority: 0.8 },
  { path: "/kadera/us", changeFrequency: "daily", priority: 0.8 },
  { path: "/mdd", changeFrequency: "daily", priority: 0.7 },
  // 내부자 리포트는 2026-08-26 에 열렸는데 이 줄이 없어 색인이 0건이었다.
  { path: "/insider", changeFrequency: "daily", priority: 0.7 },
  // 국장 미리보기(2026-09-04 오픈). 07~09시에만 쓸모가 있는 화면이지만 내용은 매일
  // 새로 쌓이므로 daily 다.
  { path: "/preview", changeFrequency: "daily", priority: 0.7 },
  // 데일리 노트(/daily)는 싣지 않는다. 본문이 가장 최근 글 그대로라 canonical 이 그 글의 날짜 주소이고
  // (app/daily/page.tsx), 사이트맵에는 canonical 주소만 싣는다. 날짜별 글은 app/sitemap-notes.xml 이 펼친다.
  // 배당 계산기. 안 연 동안은 싣지 않는다(noindex 와 어긋나면 안 된다). 종가·배당이 매일 갱신되므로 daily.
  ...(DIVIDEND_PUBLIC ? [{ path: DIVIDEND_PAGE.href, changeFrequency: "daily" as const, priority: 0.7 }] : []),
  // 테마 리포트 — 목록 한 장 + 테마 26장. 안 연 동안은 싣지 않는다(noindex 와 어긋나면 안 된다).
  // 테마 목록은 사전(lib/stock-themes.ts)이라 정적이고 DB 없이 펼친다. 언급이 매일 쌓이므로 daily.
  ...(THEME_PUBLIC
    ? [
        { path: THEME_PAGE.href, changeFrequency: "daily" as const, priority: 0.7 },
        ...THEME_NAMES.map((t) => ({ path: themeHref(t), changeFrequency: "daily" as const, priority: 0.6 })),
        // 미장 — 목록 한 장 + 테마 16장(lib/us-stock-themes.ts). 같은 플래그로 같이 열린다.
        { path: US_THEME_PAGE.href, changeFrequency: "daily" as const, priority: 0.7 },
        ...US_THEME_NAMES.map((t) => ({ path: usThemeHref(t), changeFrequency: "daily" as const, priority: 0.6 })),
      ]
    : []),
  // 카드 여덟 장의 '전체보기'. 화면 안에서만 링크가 걸려 있어 크롤러가 닿기 어렵다 —
  // 목록이 매일 바뀌는 실제 콘텐츠라 사이트맵에 직접 올린다.
  // (종목·투자자 상세는 DB 를 읽어야 해서 app/sitemap-insider.xml 이 따로 펼친다.)
  ...INSIDER_LIST_SLUGS.map((slug) => ({
    path: `/insider/list/${slug}`,
    changeFrequency: "daily" as const,
    priority: 0.5,
  })),
  // 법정 고지라 내용이 거의 안 바뀐다. 지표 페이지와 같은 daily 로 두면 크롤러가
  // 매일 헛걸음하므로 yearly·낮은 우선순위로 둔다.
  { path: "/terms", changeFrequency: "yearly", priority: 0.3 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
  // 버전을 올릴 때만 바뀐다. 법정 고지보다는 자주, 지표 화면보다는 훨씬 드물다. 수정일은 최신 판의 배포일이다.
  // (약관·개인정보는 시행일이 적혀 있지만 고친 판이 시행일보다 먼저 올라가 수정일로 못 쓴다 — app/legal.tsx.)
  { path: "/changelog", changeFrequency: "monthly", priority: 0.3, lastmod: RELEASES[0].date },
];

/**
 * 경로를 절대 주소로. **홈은 `https://hatzze.fun/` 로 슬래시를 붙인다.**
 *
 * 예전엔 홈이 `https://hatzze.fun` 이었다(경로가 아예 없는 주소). 사이트맵 규격의 예시는
 * 전부 경로가 있고, 서치콘솔 속성도 `https://hatzze.fun/` 라 접두어가 슬래시로 끝난다.
 * 구글이 두 표기를 같은 주소로 정규화하므로 어느 쪽이든 색인은 같지만, 규격에 가까운
 * 쪽으로 맞춰 둔다 — 사이트맵이 "읽을 수 없음" 으로 잡혀 있는 동안 의심할 자리를 하나
 * 줄이는 뜻도 있다.
 */
export const absolute = (path: string) => (path === "/" ? `${SITE_URL}/` : `${SITE_URL}${path}`);
