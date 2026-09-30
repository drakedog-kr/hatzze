/**
 * lib/insider-sitemap.ts — 내부자 리포트 상세 사이트맵. 사이트맵은 화면에서 안 보여 틀려도 티가 안 난다
 * (app/sitemap-urls.ts 머리말 · 두 번 빠뜨린 이력). 주소 꼴이 화면의 canonical 과 같아야 하고, 기간 주소는
 * 실으면 안 된다. 돌리는 법: `npm test`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { insiderSitemapXml } from "../lib/insider-sitemap.ts";

const locs = (xml: string) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

describe("insiderSitemapXml", () => {
  const xml = insiderSitemapXml({
    site: "https://hatzze.fun",
    tickers: ["NVDA", "BRK", "BRK-B", "AAPL"],
    investors: [
      { cik: 1649339, reportDate: "2026-06-30" },
      { cik: 1067983, reportDate: "2026-06-30" },
      { cik: 999, reportDate: null },
    ],
    stockLastmod: "2026-09-29",
  });

  it("종목은 canonical 꼴로 한 줄씩 — 클래스 표기는 뿌리로 모인다", () => {
    const stocks = locs(xml).filter((l) => l.includes("/insider/stock/"));
    assert.deepEqual(stocks, [
      "https://hatzze.fun/insider/stock/AAPL",
      "https://hatzze.fun/insider/stock/BRK",
      "https://hatzze.fun/insider/stock/NVDA",
    ]);
  });

  it("기간 주소는 싣지 않는다", () => {
    assert.ok(!locs(xml).some((l) => /\/insider\/stock\/[^/]+\/./.test(l)));
  });

  it("13F 를 안 낸 투자자는 뺀다", () => {
    const investors = locs(xml).filter((l) => l.includes("/insider/investor/"));
    assert.deepEqual(investors, ["https://hatzze.fun/insider/investor/1067983", "https://hatzze.fun/insider/investor/1649339"]);
  });

  it("lastmod 는 종목에만 — 투자자는 수정일을 모른다", () => {
    const blocks = xml.split("<url>").slice(1);
    for (const b of blocks) {
      if (b.includes("/insider/stock/")) assert.match(b, /<lastmod>2026-09-29<\/lastmod>/);
      else assert.doesNotMatch(b, /<lastmod>/);
    }
  });

  it("종목 수정일을 모르면 태그를 뺀다(벽시계로 채우지 않는다)", () => {
    const x = insiderSitemapXml({ site: "https://hatzze.fun", tickers: ["NVDA"], investors: [], stockLastmod: null });
    assert.doesNotMatch(x, /<lastmod>/);
    assert.match(x, /<loc>https:\/\/hatzze\.fun\/insider\/stock\/NVDA<\/loc>/);
  });

  it("XML 로 이스케이프한다", () => {
    const x = insiderSitemapXml({ site: "https://a.b?x=1&y=2", tickers: ["T"], investors: [], stockLastmod: null });
    assert.match(x, /<loc>https:\/\/a\.b\?x=1&amp;y=2\/insider\/stock\/T<\/loc>/);
  });
});
