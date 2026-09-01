import { SITEMAP_ENTRIES, absolute } from "../sitemap-urls";

/**
 * `/sitemap-pages.xml` — `/sitemap.xml` 과 **같은 목록**을 다른 이름·다른 방식으로 낸다.
 *
 * ## 왜 한 벌 더 내나
 *
 * 서치콘솔이 `/sitemap.xml` 을 **한 번도 못 읽었다.** 2026-07-31 에 한 번, 재제출한
 * 09-01 에 또 한 번 읽으러 와서 둘 다 "사이트맵을 읽을 수 없음", 발견된 페이지 0 이었다.
 *
 * 그런데 우리 쪽 응답은 어느 각도로 재도 멀쩡하다. UA 를 빼고, Accept 를 바꾸고, 쿠키를
 * 얹고, 캐시를 무시시키고, HTTP/1.1 로, 압축을 끄고, IPv6 로 — 여덟 조건 모두 200 ·
 * `application/xml` · 2,761바이트로 같았다. XML 은 BOM 없이 유효하고 네임스페이스도
 * 정상이며, ETag 가 안정적이고 조건부 요청에 304 를 제대로 돌려준다.
 *
 * 그래서 남은 갈래가 둘이고, 이 파일이 그 둘을 가른다.
 *   ① 콘솔의 `/sitemap.xml` **항목 자체**가 상했다 → 다른 이름은 읽힌다
 *   ② 응답의 어떤 결이 걸린다 → 이것도 못 읽는다
 *
 * ## 규약 파일이 아니라 라우트 핸들러인 이유
 *
 * Next 의 `sitemap.ts` 규약은 응답에 `Content-Disposition: inline; filename="sitemap.xml"`
 * 을 얹는다. 사이트맵에 흔한 헤더가 아니라 의심할 자리 중 하나였다. 여기서는 헤더를
 * 손으로 정해 그 변수를 없앤다 — `Content-Type` 과 캐시 지시만 준다.
 *
 * ⚠️ **목록을 여기 또 적지 말 것.** `app/sitemap-urls.ts` 한 곳에서만 온다. 두 사이트맵이
 *    각자 목록을 들면 언젠가 어긋나고, 그 어긋남은 화면에서 안 보인다.
 *
 * ⏳ 콘솔이 어느 쪽이든 한 번 제대로 읽고 나면 **한 벌은 지운다.** 같은 목록을 두 주소로
 *    영원히 두는 건 관리할 게 하나 느는 것뿐이다.
 */
export const dynamic = "force-dynamic";

/** XML 텍스트 노드에 그대로 넣으면 안 되는 다섯 글자. 지금 주소엔 안 나오지만 규격이 요구한다. */
function xmlEscape(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  // `/sitemap.xml` 과 같은 값이다 — 요청 시각. 까닭은 app/sitemap.ts 머리말 참고.
  const lastmod = new Date().toISOString();
  const urls = SITEMAP_ENTRIES.map(
    (e) =>
      `  <url>\n` +
      `    <loc>${xmlEscape(absolute(e.path))}</loc>\n` +
      `    <lastmod>${lastmod}</lastmod>\n` +
      `    <changefreq>${e.changeFrequency}</changefreq>\n` +
      `    <priority>${e.priority}</priority>\n` +
      `  </url>`,
  ).join("\n");

  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      // 매일 바뀌는 목록이 아니라 매 요청 새로 그리는 값이라 캐시를 짧게 둔다.
      // 크롤러가 자주 와도 부담이 없는 크기다(3KB 안팎).
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}
