import type { MetadataRoute } from "next";

const SITE_URL = "https://hatzze.fun";

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
 * `/api/` 를 막는다. 이 아래에는 크롤러가 볼 이유가 있는 주소가 하나도 없다 —
 * 아바타 이미지, MDD 계산 엔드포인트, 티커 시세, 파이프라인 크론뿐이다.
 *
 * ⛔ **OG 이미지(`/opengraph-image`)는 여기서 막지 않는다.** 카카오·페이스북·X 의
 *    미리보기 크롤러가 robots.txt 를 따르기 때문에, 막으면 공유 카드가 통째로 죽는다.
 *    저쪽은 next.config.ts 의 `X-Robots-Tag: noindex` 로 **색인만** 뗀다(가져가는 건 된다).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
