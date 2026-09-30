/**
 * lib/insider-range.ts — 미장 종목 상세의 차트 기간 주소. 기간이 쿼리(`?p=`)에서 경로(`/1y`)로 옮겨 가면서
 * 주소를 만드는 자리(화면의 기간 단추)와 옛 주소를 넘기는 자리(next.config.ts 리다이렉트)가 둘로 갈렸다.
 * 둘이 어긋나면 옛 링크가 404 로 떨어지거나 기본 기간이 주소를 두 개 갖는다. 돌리는 법: `npm test`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ALT_RANGE_KEYS, PRICE_RANGES, PRICE_RANGE_DEFAULT, isPriceRange, stockDetailHref, yearsOf } from "../lib/insider-range.ts";
import nextConfig from "../next.config.ts";

describe("stockDetailHref", () => {
  it("기본 기간과 기간 없음은 기본 주소 하나다", () => {
    assert.equal(stockDetailHref("NVDA"), "/insider/stock/NVDA");
    assert.equal(stockDetailHref("NVDA", PRICE_RANGE_DEFAULT), "/insider/stock/NVDA");
  });

  it("다른 기간은 경로 한 칸을 더한다", () => {
    assert.equal(stockDetailHref("NVDA", "1y"), "/insider/stock/NVDA/1y");
    assert.equal(stockDetailHref("NVDA", "3m"), "/insider/stock/NVDA/3m");
  });

  it("모르는 기간은 기본 주소로 접는다 — 없는 화면으로 가는 링크를 만들지 않는다", () => {
    assert.equal(stockDetailHref("NVDA", "5y"), "/insider/stock/NVDA");
    assert.equal(stockDetailHref("NVDA", ""), "/insider/stock/NVDA");
  });

  it("티커는 부호화한다", () => {
    assert.equal(stockDetailHref("BRK.B", "2y"), "/insider/stock/BRK.B/2y");
    assert.equal(stockDetailHref("A B"), "/insider/stock/A%20B");
  });
});

describe("기간 표", () => {
  it("다른 기간 목록은 기본 기간만 뺀 전부다", () => {
    assert.deepEqual(
      ALT_RANGE_KEYS,
      PRICE_RANGES.map((r) => r.key).filter((k) => k !== PRICE_RANGE_DEFAULT),
    );
    assert.ok(!ALT_RANGE_KEYS.includes(PRICE_RANGE_DEFAULT));
  });

  it("isPriceRange 는 표에 있는 열쇠만 받는다", () => {
    assert.ok(isPriceRange("6m"));
    assert.ok(!isPriceRange("6M"));
    assert.ok(!isPriceRange(undefined));
  });

  it("모르는 열쇠의 햇수는 기본 기간 것이다", () => {
    assert.equal(yearsOf("zz"), yearsOf(PRICE_RANGE_DEFAULT));
    assert.equal(yearsOf("2y"), 2);
  });
});

describe("옛 ?p= 리다이렉트(next.config.ts)", () => {
  it("다른 기간 전부를, 그리고 그것만 경로로 넘긴다", async () => {
    const rules = await nextConfig.redirects!();
    const rule = rules.find((r) => r.source === "/insider/stock/:ticker");
    assert.ok(rule, "리다이렉트 규칙이 없습니다");
    assert.equal(rule.destination, "/insider/stock/:ticker/:p");
    assert.equal(rule.permanent, true);
    const has = rule.has?.[0];
    assert.ok(has && has.type === "query" && has.key === "p" && typeof has.value === "string");
    // Next 는 값을 ^…$ 로 감싸 맞춘다(shared/lib/router/utils/prepare-destination.js matchHas).
    const matcher = new RegExp(`^${has.value}$`);
    for (const r of PRICE_RANGES) {
      const m = r.key.match(matcher);
      if (r.key === PRICE_RANGE_DEFAULT) assert.equal(m, null, "기본 기간은 넘기지 않는다");
      else assert.equal(m?.groups?.p, r.key, `${r.key} 가 넘어가지 않습니다`);
    }
    assert.equal("5y".match(matcher), null);
  });
});

describe("기본 기간 경로 리다이렉트(next.config.ts)", () => {
  it("/…/<기본 기간> 은 기본 주소로 넘긴다", async () => {
    const rules = await nextConfig.redirects!();
    const rule = rules.find((r) => r.source === `/insider/stock/:ticker/${PRICE_RANGE_DEFAULT}`);
    assert.ok(rule, "기본 기간 경로 리다이렉트가 없습니다 — 기본 기간이 바뀌었으면 next.config.ts 도 바꾸십시오");
    assert.equal(rule.destination, "/insider/stock/:ticker");
    assert.equal(rule.permanent, true);
  });
});
