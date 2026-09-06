import { SITE_URL } from "../brand";
import { DAILY_PUBLIC } from "../screen-flags";
import { NOTE_PAGE } from "../daily/copy";
import { listAllNoteDates, noteHref } from "@/lib/daily-note";

/**
 * /sitemap-notes.xml — 데일리 노트 날짜별 주소.
 *
 * `app/sitemap-urls.ts` 의 정적 목록에는 못 싣는다 — 날짜가 표에서 온다. 종목 실주소가
 * 쓰는 `sitemap-stocks.xml` 과 같은 방식으로 표를 읽어 펼친다. robots.txt 가 이 주소를
 * 적어 두므로 콘솔에 손으로 등록하지 않아도 크롤러가 찾아온다.
 *
 * ⛔ 안 연 동안(`DAILY_PUBLIC=false`)은 **빈 목록**을 낸다. 날짜별 화면이 noindex 인데
 *    사이트맵이 그 주소를 내면 두 신호가 어긋난다. robots.txt 도 같은 플래그를 읽어 안 연
 *    동안은 이 사이트맵을 적지 않는다.
 */
export const dynamic = "force-dynamic";

const HEAD = `<?xml version="1.0" encoding="UTF-8"?>\n`;
const OPEN = `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

export async function GET() {
  if (!DAILY_PUBLIC) {
    return new Response(`${HEAD}<!-- ${NOTE_PAGE.label}: 아직 안 연 화면 -->\n${OPEN}</urlset>\n`, {
      headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=600, must-revalidate" },
    });
  }

  const dates = await listAllNoteDates();
  if (dates === null) {
    console.error("[sitemap-notes] 날짜 목록을 못 읽었습니다 — 빈 사이트맵 대신 500 을 냅니다");
    return new Response("데일리 노트 목록을 읽지 못했습니다.\n", {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  // 글은 그날 저녁에 한 번 올라가고 그 뒤로는 안 바뀐다(고친 원고를 다시 올리는 날만 예외).
  // 날짜가 곧 마지막 수정일이라 요청 시각 대신 그 날짜를 적는다.
  const urls = dates
    .map(
      (d) =>
        `  <url>\n` +
        `    <loc>${SITE_URL}${noteHref(d)}</loc>\n` +
        `    <lastmod>${d}</lastmod>\n` +
        `    <changefreq>yearly</changefreq>\n` +
        `    <priority>0.6</priority>\n` +
        `  </url>`,
    )
    .join("\n");

  return new Response(`${HEAD}<!-- ${NOTE_PAGE.label} ${dates.length}편 -->\n${OPEN}${urls}\n</urlset>\n`, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      // 하루에 한 편 느는 목록이라 10분은 충분히 짧다.
      "Cache-Control": "public, max-age=600, must-revalidate",
    },
  });
}
