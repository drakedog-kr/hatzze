import type { MetadataRoute } from "next";

import { INSIDER_LIST_SLUGS } from "./insider/lists";

const SITE_URL = "https://hatzze.fun";

/**
 * /sitemap.xml 자동 생성 — 공개 라우트 목록.
 *
 * ## ⚠️ 화면을 새로 열면 여기부터 본다
 *
 * 사이트맵과 공유 카드는 **화면 안에서 안 보인다.** 빠뜨려도 티가 안 나서, 실제로 두 번
 * 빠졌다. `/seohak` 이 한 번(색인이 안 됐다), `/insider` 가 또 한 번이다 — 2026-09-01
 * 서치콘솔을 열었더니 색인된 43건이 홈·`/kadera`·`/mdd`·법률 문서뿐이고
 * **`/kadera/us`·`/seohak`·`/insider` 는 한 건도 없었다.**
 *
 * 새 화면을 열 때 챙길 것은 셋이다. ①여기 한 줄 ②`opengraph-image` ③사이드바 NAV.
 *
 * ## lastModified 는 요청 시각이다
 *
 * 실제 데이터 갱신 시각이 아니라 이 함수가 도는 시각이라, 크롤러에게는 "늘 방금 바뀐
 * 사이트"로 보인다. 정직한 값은 아니지만 **지금은 그 편이 낫다** — 색인이 모자란 쪽이
 * 문제라 크롤링을 부르는 게 이득이다. 색인이 붙고 나면 `daily_score` 의 실제 날짜로
 * 바꾸는 게 맞다.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const daily = (path: string, priority: number) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency: "daily" as const,
    priority,
  });

  return [
    { url: SITE_URL, lastModified: now, changeFrequency: "daily", priority: 1 },
    daily("/kadera", 0.8),
    daily("/kadera/us", 0.8),
    daily("/mdd", 0.7),
    daily("/seohak", 0.7),
    // 내부자 리포트는 2026-08-26 에 열렸는데 이 줄이 없어 색인이 0건이었다.
    daily("/insider", 0.7),
    // 카드 여덟 장의 '전체보기'. 화면 안에서만 링크가 걸려 있어 크롤러가 닿기 어렵다 —
    // 목록이 매일 바뀌는 실제 콘텐츠라 사이트맵에 직접 올린다.
    // (종목·투자자 상세 `/insider/stock/*`·`/insider/investor/*` 는 수가 많고 DB 를
    //  읽어야 해서 여기 넣지 않았다. 그건 사이트맵을 동적으로 만들 때 같이 다룬다.)
    ...INSIDER_LIST_SLUGS.map((slug) => daily(`/insider/list/${slug}`, 0.5)),
    // 법정 고지라 내용이 거의 안 바뀐다. 지표 페이지와 같은 daily 로 두면 크롤러가
    // 매일 헛걸음하므로 yearly·낮은 우선순위로 둔다.
    { url: `${SITE_URL}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    // 버전을 올릴 때만 바뀐다. 법정 고지보다는 자주, 지표 화면보다는 훨씬 드물다.
    { url: `${SITE_URL}/changelog`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
  ];
}
