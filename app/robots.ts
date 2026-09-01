import type { MetadataRoute } from "next";

import { SITE_URL } from "./brand";

/**
 * /robots.txt 자동 생성.
 *
 * ## 왜 전체 허용이 아닌가 (2026-09-01)
 *
 * 서치콘솔 "크롤링됨 - 현재 색인이 생성되지 않음" 77건을 열어 보니 **한 건도 페이지가
 * 아니었다** — 71건이 `/api/channel-photo/...`(카더라 채널 아바타 32px), 6건이 OG 카드
 * 이미지였다. 크롤러가 화면 대신 이미지만 퍼 가고 있었던 셈이다. 같은 시점에 정작
 * `/kadera/us`·`/seohak`·`/insider` 는 색인이 0건이었다.
 *
 * ## ⛔ `/api/` 를 통째로 막으면 안 된다 (2026-09-01 되돌림)
 *
 * 처음엔 `/api/` 전체를 막았는데 **그러면 화면이 빈 껍데기로 보인다.** MDD 는 종목 낙폭을
 * 서버가 아니라 브라우저가 그린다 — `MddExplorer.tsx` 가 `/api/mdd?...` 를 불러서 채운다.
 * 구글 렌더러도 똑같이 그 요청을 하는데, robots.txt 로 막으면 그 응답을 못 받아서
 * **이미 색인된 `/mdd?code=...` 37개가 내용 없는 페이지가 된다.**
 *
 * 그래서 **낭비만 골라 막는다.**
 *   · `/api/channel-photo/` 아바타 32px. 77건 중 71건이 여기였다. 화면 렌더에는 영향이
 *     없다(이미지가 안 떠도 배치는 그대로 — img 에 width·height 가 박혀 있다).
 *   · `/api/cron/` 토큰 없이는 401 이라 크롤러가 할 수 있는 게 없다.
 *   ✅ `/api/mdd` · `/api/ticker` 는 **연다.** 화면이 이걸 받아야 내용이 생긴다.
 *
 * ⛔ **OG 이미지(`/opengraph-image`)도 여기서 막지 않는다.** 카카오·페이스북·X 의
 *    미리보기 크롤러가 robots.txt 를 따르기 때문에, 막으면 공유 카드가 통째로 죽는다.
 *    저쪽은 next.config.ts 의 `X-Robots-Tag: noindex` 로 **색인만** 뗀다(가져가는 건 된다).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/channel-photo/", "/api/cron/"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
