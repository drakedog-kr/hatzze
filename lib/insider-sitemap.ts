/**
 * `/sitemap-insider.xml` 의 본문 — 내부자 리포트 상세 두 갈래(미장 종목 · 월가 투자자)를 펼친다.
 *
 * DB 를 안 만지는 순수 함수라 단위 테스트(tests/insider-sitemap.test.ts)가 그대로 부른다.
 * 조회와 실패 처리는 app/sitemap-insider.xml/route.ts 에 있다.
 */
import { stockDetailHref } from "./insider-range.ts";
import { canonicalTicker } from "./us-ticker-spellings.ts";

/** XML 텍스트 노드에 그대로 넣으면 안 되는 다섯 글자. 티커에 `&` 가 올 일은 없지만 규격이 요구한다. */
function xmlEscape(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export type InsiderSitemapInput = {
  /** 사이트 주소(끝 슬래시 없음). */
  site: string;
  /** 미장 사전 `us_stocks` 의 티커. 표기는 화면 주소와 같게 여기서 맞춘다. */
  tickers: string[];
  /** 추적하는 월가 투자자. 13F 를 한 번도 안 낸 곳(reportDate null)은 화면이 비어 싣지 않는다. */
  investors: { cik: number; reportDate: string | null }[];
  /** 종목 화면의 마지막 수정일 = 미장 언급 표의 가장 최근 날. 모르면 null(태그를 뺀다). */
  stockLastmod: string | null;
};

type Entry = { path: string; lastmod: string | null };

/**
 * 사이트맵 XML.
 *
 * - 종목 주소는 **화면이 canonical 로 쓰는 꼴**이다(stockDetailHref(canonicalTicker(…))). `BRK-B` 로 적힌 행이
 *   있어도 `/insider/stock/BRK` 한 줄이 된다 — 다른 꼴을 실으면 크롤러가 canonical 과 어긋난 주소를 받는다.
 * - 기간 주소(`/…/1y`)는 싣지 않는다. canonical 이 기본 주소다(lib/insider-range.ts).
 * - 투자자에는 lastmod 를 안 적는다. 가진 날짜가 13F 기준 분기말뿐인데, 신고는 그보다 45일쯤 늦게
 *   들어와 화면이 바뀐 날이 아니다. 틀린 수정일보다 없는 편이 낫다(규격상 선택 항목이다).
 */
export function insiderSitemapXml({ site, tickers, investors, stockLastmod }: InsiderSitemapInput): string {
  const stockPaths = [...new Set(tickers.map((t) => stockDetailHref(canonicalTicker(t))))].sort();
  const entries: Entry[] = [
    ...stockPaths.map((path) => ({ path, lastmod: stockLastmod })),
    ...investors
      .filter((m) => m.reportDate)
      .sort((a, b) => a.cik - b.cik)
      .map((m) => ({ path: `/insider/investor/${m.cik}`, lastmod: null })),
  ];
  const urls = entries
    .map(
      (e) =>
        `  <url>\n` +
        `    <loc>${xmlEscape(`${site}${e.path}`)}</loc>\n` +
        (e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>\n` : "") +
        `    <changefreq>daily</changefreq>\n` +
        // 국장 종목 실주소(sitemap-stocks.xml)와 같은 자리 — 주요 화면(0.7~1) 아래, 전체보기 목록(0.5) 위.
        `    <priority>0.6</priority>\n` +
        `  </url>`,
    )
    .join("\n");
  const investorCount = entries.length - stockPaths.length;
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<!-- 미장 종목 ${stockPaths.length}개 · 월가 투자자 ${investorCount}명 -->\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
  );
}
