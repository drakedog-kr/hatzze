import type { MetadataRoute } from "next";

import { SITE_URL } from "./brand";

/**
 * /robots.txt 자동 생성.
 *
 * ## 무엇을 막나 (2026-09-01)
 *
 * 서치콘솔 "크롤링됨 - 현재 색인이 생성되지 않음" 77건을 열어 보니 **한 건도 페이지가
 * 아니었다** — 71건이 `/api/channel-photo/...`(카더라 채널 아바타 32px), 6건이 OG 카드
 * 이미지였다. 크롤러가 화면 대신 이미지만 퍼 가고 있었던 셈이다.
 *
 * ⛔ **`/api/` 를 통째로 막지 않는다.** MDD 는 종목 낙폭을 서버가 아니라 브라우저가
 *    그린다 — `MddExplorer.tsx` 가 `/api/mdd?...` 를 불러서 채운다. 구글 렌더러도 똑같이
 *    그 요청을 하는데, 막으면 그 응답을 못 받아서 이미 색인된 `/mdd?code=...` 가 내용
 *    없는 페이지가 된다. 그래서 **낭비만 골라 막는다.**
 *      · `/api/channel-photo/` 아바타. 77건 중 71건이 여기였고 렌더에는 영향이 없다
 *        (img 에 width·height 가 박혀 있어 못 받아도 배치가 안 밀린다).
 *      · `/api/cron/` 토큰 없이는 401 이라 크롤러가 할 수 있는 게 없다.
 *      ✅ `/api/mdd` · `/api/ticker` 는 연다. 화면이 이걸 받아야 내용이 생긴다.
 *
 * ⛔ **OG 이미지(`/opengraph-image`)도 여기서 막지 않는다.** 카카오·페이스북·X 의
 *    미리보기 크롤러가 robots.txt 를 따르기 때문에, 막는 순간 공유 카드가 통째로 죽는다.
 *    저쪽은 next.config.ts 의 `X-Robots-Tag: noindex` 로 **색인만** 뗀다(가져가는 건 된다).
 *
 * ## 사이트맵을 둘 적는 이유
 *
 * 콘솔이 `/sitemap.xml` 을 못 읽고 있어서 같은 내용을 `/sitemap-pages.xml` 로도 낸다.
 * robots.txt 에 둘 다 적어 두면 **콘솔에 손을 안 대도** 크롤러가 새 쪽을 발견한다.
 * 둘은 같은 목록(app/sitemap-urls.ts)에서 나오므로 어긋날 수 없다.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/channel-photo/", "/api/cron/"] },
    sitemap: [
      `${SITE_URL}/sitemap.xml`,
      `${SITE_URL}/sitemap-pages.xml`,
      // 종목 실주소 467장. 콘솔에 손으로 안 넣어도 크롤러는 여기서 찾아온다
      // (app/sitemap-stocks.xml/route.ts 머리말 참고).
      `${SITE_URL}/sitemap-stocks.xml`,
    ],
    host: SITE_URL,
  };
}
