/**
 * lib/theme-href.ts — 테마 슬러그. 사전 26개와 1:1 이고, 옛 한글 주소도 사전 이름으로 되돌린다. 돌리는 법: `npm test`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  THEME_NAMES,
  THEME_SLUGS,
  US_THEME_NAMES,
  US_THEME_SLUGS,
  marketThemeHref,
  themeFromParam,
  themeHref,
  themeSlug,
  themeStockHref,
  usThemeFromParam,
  usThemeHref,
  usThemeSlug,
} from "../lib/theme-href.ts";

describe("theme-href", () => {
  it("사전의 테마마다 슬러그가 하나씩 있고 서로 다르다", () => {
    const slugs = THEME_NAMES.map(themeSlug);
    assert.equal(slugs.length, THEME_NAMES.length);
    assert.equal(new Set(slugs).size, slugs.length);
    for (const s of slugs) assert.match(s, /^[a-z0-9-]+$/);
    assert.equal(Object.keys(THEME_SLUGS).length, THEME_NAMES.length);
  });
  it("주소는 /theme/슬러그 이고 슬러그로 되돌아온다", () => {
    assert.equal(themeHref("반도체"), "/theme/semiconductor");
    assert.equal(themeFromParam("semiconductor"), "반도체");
    for (const name of THEME_NAMES) assert.equal(themeFromParam(themeSlug(name)), name);
  });
  it("옛 한글 주소(부호화 포함)도 사전 이름으로 되돌린다", () => {
    assert.equal(themeFromParam("반도체"), "반도체");
    assert.equal(themeFromParam(encodeURIComponent("전력기기·전선")), "전력기기·전선");
    assert.equal(themeFromParam("no-such-theme"), null);
    assert.equal(themeFromParam("%E0%A4%A"), null);
  });
});

describe("theme-href (미장)", () => {
  it("미장 사전의 테마마다 슬러그가 하나씩 있고 서로 다르다", () => {
    const slugs = US_THEME_NAMES.map(usThemeSlug);
    assert.equal(slugs.length, US_THEME_NAMES.length);
    assert.equal(new Set(slugs).size, slugs.length);
    for (const s of slugs) assert.match(s, /^[a-z0-9-]+$/);
    assert.equal(Object.keys(US_THEME_SLUGS).length, US_THEME_NAMES.length);
  });
  it("주소는 /theme/us/슬러그 이고 슬러그로 되돌아온다", () => {
    assert.equal(usThemeHref("AI반도체"), "/theme/us/ai-semiconductor");
    assert.equal(usThemeFromParam("ai-semiconductor"), "AI반도체");
    for (const name of US_THEME_NAMES) assert.equal(usThemeFromParam(usThemeSlug(name)), name);
    assert.equal(usThemeFromParam(encodeURIComponent("반도체 장비·소재")), "반도체 장비·소재");
    assert.equal(usThemeFromParam("semiconductor"), null);
  });
  it("국장 슬러그에 'us' 가 없다(정적 구간 /theme/us 와 겹치면 안 된다)", () => {
    assert.equal(themeFromParam("us"), null);
    assert.equal(marketThemeHref("kr", "금융"), "/theme/finance");
    assert.equal(marketThemeHref("us", "금융"), "/theme/us/finance");
    assert.equal(themeStockHref("kr", "005930"), "/stock/005930");
    assert.equal(themeStockHref("us", "BRK.B"), "/insider/stock/BRK.B");
  });
});
