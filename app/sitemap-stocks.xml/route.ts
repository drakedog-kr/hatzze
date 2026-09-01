import { SITE_URL } from "../brand";
import { kaderaBaseDate } from "@/lib/telegram-data";
import { STOCK_INDEX_MIN_DAYS, STOCK_STAT_DAYS, listIndexableStocks, stockHref } from "@/lib/stock-page";

/**
 * `/sitemap-stocks.xml` — 종목 실주소(`/stock/005930`) 한 벌.
 *
 * ## 왜 기존 사이트맵에 안 넣나
 *
 * `/sitemap.xml` 과 `/sitemap-pages.xml` 은 목록이 **코드에 박힌 17줄**이라 DB 를 안
 * 읽는다. 종목은 매일 바뀌므로 DB 를 읽어야 하는데, 그 의존을 저 두 파일에 얹으면
 * 조회가 실패한 날 **사이트맵 전체가 같이 죽는다.**
 *
 * 게다가 지금 서치콘솔이 `/sitemap.xml` 을 한 번도 못 읽고 있다(2026-07-31 · 09-01
 * 두 번 다 "사이트맵을 읽을 수 없음"). 그 원인을 가리는 중인데 같은 파일에 변수를 하나
 * 더 얹으면 무엇 때문인지 못 가른다. 그래서 **따로 낸다** — 이게 죽어도 저 둘은 산다.
 *
 * robots.txt 가 셋을 다 가리키므로 콘솔에 손으로 넣지 않아도 크롤러는 찾아온다.
 *
 * ## ⛔ 못 읽었으면 빈 사이트맵을 내지 않는다
 *
 * 빈 `<urlset>` 은 "실을 게 없습니다" 라는 **뜻이 분명한 답**이다. 조회가 실패한 날
 * 그걸 내보내면 구글은 464장이 사라졌다고 읽고 색인에서 뺀다. 실패는 실패라고
 * 말해야 해서 500 을 낸다 — 크롤러는 500 을 보면 다음에 다시 온다.
 */
export const dynamic = "force-dynamic";

/** XML 텍스트 노드에 그대로 넣으면 안 되는 다섯 글자. 지금 주소는 숫자뿐이지만 규격이 요구한다. */
function xmlEscape(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  const [stocks, baseDate] = await Promise.all([listIndexableStocks(), kaderaBaseDate()]);

  if (stocks === null) {
    console.error("[sitemap-stocks] 목록을 못 만들었습니다 — 빈 사이트맵 대신 500 을 냅니다");
    return new Response("종목 목록을 읽지 못했습니다.\n", {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  // 화면의 내용이 바뀌는 계기는 파이프라인 실행뿐이라, 기준일이 곧 마지막 수정일이다.
  // 요청 시각을 적으면 안 바뀐 날에도 "방금 바뀌었다"고 말하게 된다.
  const lastmod = baseDate;
  const urls = stocks
    .map(
      (s) =>
        `  <url>\n` +
        `    <loc>${xmlEscape(`${SITE_URL}${stockHref(s.code)}`)}</loc>\n` +
        `    <lastmod>${lastmod}</lastmod>\n` +
        `    <changefreq>daily</changefreq>\n` +
        // 주요 화면(0.7~1)보다 아래, 전체보기 목록(0.5)보다 위. 수가 많아도 이 화면들이
        // 검색에서 답하려는 자리라 목록 페이지보다는 앞에 둔다.
        `    <priority>0.6</priority>\n` +
        `  </url>`,
    )
    .join("\n");

  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<!-- 최근 ${STOCK_STAT_DAYS}일 중 언급된 날이 ${STOCK_INDEX_MIN_DAYS}일 이상인 종목 ${stocks.length}개 -->\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      // 매 요청 30여 번을 나눠 묻는 목록이라(lib/stock-page.ts) 잠깐은 재사용하게 둔다.
      // 하루에 한 번 바뀌는 값이라 10분은 충분히 짧다.
      "Cache-Control": "public, max-age=600, must-revalidate",
    },
  });
}
