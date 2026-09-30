/**
 * scripts/indexnow-urls.mjs — IndexNow 로 알릴 주소 고르기. 예전엔 /sitemap.xml 하나만 읽어 종목·노트가
 * 빠졌고, 안 바뀐 약관·기록을 하루 두 번씩 보냈다. 돌리는 법: `npm test`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { kstDaysAgo, parseSitemap, pickUrls, sitemapsFromRobots } from "../scripts/indexnow-urls.mjs";

describe("sitemapsFromRobots", () => {
  it("Sitemap 줄을 전부 — 대소문자와 CRLF 를 가리지 않는다", () => {
    const robots = "User-Agent: *\r\nAllow: /\r\nSitemap: https://a.b/sitemap.xml\r\nsitemap: https://a.b/sitemap-stocks.xml\r\nHost: https://a.b\r\n";
    assert.deepEqual(sitemapsFromRobots(robots), ["https://a.b/sitemap.xml", "https://a.b/sitemap-stocks.xml"]);
  });
});

describe("parseSitemap", () => {
  it("loc · lastmod · changefreq 를 읽고 &amp; 를 푼다", () => {
    const xml = `<?xml version="1.0"?><urlset>
      <url><loc>https://a.b/</loc><changefreq>daily</changefreq><priority>1</priority></url>
      <url>
        <loc>https://a.b/x?p=1&amp;q=2</loc>
        <lastmod>2026-09-29</lastmod>
        <changefreq>yearly</changefreq>
      </url>
    </urlset>`;
    assert.deepEqual(parseSitemap(xml), [
      { loc: "https://a.b/", lastmod: null, changefreq: "daily" },
      { loc: "https://a.b/x?p=1&q=2", lastmod: "2026-09-29", changefreq: "yearly" },
    ]);
  });
});

describe("kstDaysAgo", () => {
  it("한국 날짜로 센다 — UTC 15시는 한국의 다음 날 0시다", () => {
    const now = new Date("2026-09-29T15:30:00Z"); // 한국 9월 30일 00:30
    assert.equal(kstDaysAgo(now, 0), "2026-09-30");
    assert.equal(kstDaysAgo(now, 1), "2026-09-29");
  });
});

describe("pickUrls", () => {
  const since = "2026-09-29";
  it("수정일이 있으면 기준일 이후만, 없으면 매일 바뀌는 화면만", () => {
    const entries = [
      { loc: "https://a.b/", lastmod: null, changefreq: "daily" },
      { loc: "https://a.b/terms", lastmod: null, changefreq: "yearly" },
      { loc: "https://a.b/changelog", lastmod: "2026-09-20", changefreq: "monthly" },
      { loc: "https://a.b/daily/2026-09-29", lastmod: "2026-09-29", changefreq: "yearly" },
      { loc: "https://a.b/daily/2026-09-10", lastmod: "2026-09-10", changefreq: "yearly" },
      { loc: "https://a.b/stock/005930", lastmod: "2026-09-30T07:00:00.000Z", changefreq: "daily" },
    ];
    assert.deepEqual(pickUrls(entries, since), ["https://a.b/", "https://a.b/daily/2026-09-29", "https://a.b/stock/005930"]);
  });

  it("두 사이트맵에 같은 주소가 있으면 한 번만", () => {
    const e = { loc: "https://a.b/kadera", lastmod: null, changefreq: "daily" };
    assert.deepEqual(pickUrls([e, { ...e }], since), ["https://a.b/kadera"]);
  });
});
