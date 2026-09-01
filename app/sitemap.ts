import type { MetadataRoute } from "next";

import { SITEMAP_ENTRIES, absolute } from "./sitemap-urls";

/**
 * /sitemap.xml — Next 의 메타데이터 규약이 그리는 사이트맵.
 *
 * 주소 목록은 `app/sitemap-urls.ts` 한 곳에 있다. 새 화면을 열 때 볼 곳도 거기다.
 *
 * ## lastModified 는 요청 시각이다
 *
 * 실제 데이터 갱신 시각이 아니라 이 함수가 도는 시각이라, 크롤러에게는 "늘 방금 바뀐
 * 사이트"로 보인다. 정직한 값은 아니지만 **지금은 그 편이 낫다** — 색인이 모자란 쪽이
 * 문제라 크롤링을 부르는 게 이득이다. 색인이 붙고 나면 `daily_score` 의 실제 날짜로
 * 바꾸는 게 맞다.
 *
 * ## 왜 같은 내용을 `/sitemap-pages.xml` 로 한 벌 더 내나
 *
 * 서치콘솔이 이 주소를 **한 번도 못 읽었다**(2026-07-31 · 09-01 두 번 시도, 둘 다
 * "사이트맵을 읽을 수 없음", 발견된 페이지 0). 우리 쪽 응답은 어느 조건으로 재도
 * 200 · application/xml · 유효한 XML 이다. 그래서 이 항목 자체가 콘솔에서 상한 것인지,
 * 응답의 어떤 결이 걸리는 것인지 가르려고 **다른 이름·다른 방식**으로 한 벌 더 낸다.
 * 자세한 것은 app/sitemap-pages.xml/route.ts 머리말에 있다.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return SITEMAP_ENTRIES.map((e) => ({
    url: absolute(e.path),
    lastModified: now,
    changeFrequency: e.changeFrequency,
    priority: e.priority,
  }));
}
