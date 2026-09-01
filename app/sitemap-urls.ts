import { SITE_URL } from "./brand";
import { INSIDER_LIST_SLUGS } from "./insider/lists";

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
};

export const SITEMAP_ENTRIES: SitemapEntry[] = [
  { path: "/", changeFrequency: "daily", priority: 1 },
  { path: "/kadera", changeFrequency: "daily", priority: 0.8 },
  { path: "/kadera/us", changeFrequency: "daily", priority: 0.8 },
  { path: "/mdd", changeFrequency: "daily", priority: 0.7 },
  { path: "/seohak", changeFrequency: "daily", priority: 0.7 },
  // 내부자 리포트는 2026-08-26 에 열렸는데 이 줄이 없어 색인이 0건이었다.
  { path: "/insider", changeFrequency: "daily", priority: 0.7 },
  // 카드 여덟 장의 '전체보기'. 화면 안에서만 링크가 걸려 있어 크롤러가 닿기 어렵다 —
  // 목록이 매일 바뀌는 실제 콘텐츠라 사이트맵에 직접 올린다.
  // (종목·투자자 상세는 수가 많고 DB 를 읽어야 해서 아직 없다. 종목별 실주소 작업에서 다룬다.)
  ...INSIDER_LIST_SLUGS.map((slug) => ({
    path: `/insider/list/${slug}`,
    changeFrequency: "daily" as const,
    priority: 0.5,
  })),
  // 법정 고지라 내용이 거의 안 바뀐다. 지표 페이지와 같은 daily 로 두면 크롤러가
  // 매일 헛걸음하므로 yearly·낮은 우선순위로 둔다.
  { path: "/terms", changeFrequency: "yearly", priority: 0.3 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
  // 버전을 올릴 때만 바뀐다. 법정 고지보다는 자주, 지표 화면보다는 훨씬 드물다.
  { path: "/changelog", changeFrequency: "monthly", priority: 0.3 },
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
