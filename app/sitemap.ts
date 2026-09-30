import type { MetadataRoute } from "next";

import { SITEMAP_ENTRIES, absolute } from "./sitemap-urls";

/**
 * /sitemap.xml — Next 의 메타데이터 규약이 그리는 사이트맵.
 *
 * 주소 목록은 `app/sitemap-urls.ts` 한 곳에 있다. 새 화면을 열 때 볼 곳도 거기다.
 *
 * ## lastModified 는 아는 곳에만 적는다
 *
 * 예전엔 모든 줄에 "지금"을 적고 "요청 시각이라 늘 방금 바뀐 사이트로 보인다"고 여겼다. 실제로는 이 파일이
 * 요청 시각 API 를 안 써서 **빌드 때 굳는다**(Next 문서 01-metadata/sitemap.md) — 배포 시각이 약관까지 모든 줄의
 * 수정일이었다. 틀린 수정일은 검색엔진이 사이트맵의 lastmod 를 통째로 안 믿게 만든다. 그래서 아는 날짜만 적고
 * (업데이트 기록 = 최신 판 배포일) 나머지는 비운다(sitemap-urls.ts 의 `lastmod` 주석).
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
  return SITEMAP_ENTRIES.map((e) => ({
    url: absolute(e.path),
    ...(e.lastmod ? { lastModified: e.lastmod } : {}),
    changeFrequency: e.changeFrequency,
    priority: e.priority,
  }));
}
