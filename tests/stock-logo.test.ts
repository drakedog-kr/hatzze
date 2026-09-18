/**
 * lib/stock-logo.ts 의 순수 함수. 라우트(/api/logo)와 StockLogo 가 같은 규칙을 보므로
 * 여기가 어긋나면 로고가 통째로 배지가 된다. 돌리는 법: `npm test` (node --test, 의존성 없음).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  LOGO_CACHE,
  LOGO_SIZES,
  LOGO_TICKER_RE,
  isLogoSize,
  logoSize,
  logoTicker,
  logoVerdict,
  stockLogoPath,
} from "../lib/stock-logo.ts";

describe("logoSize", () => {
  it("표시 크기의 2배를 눈금으로 올림한다 — 쓰는 자리 여섯(18·24·26·28·30·40)", () => {
    assert.equal(logoSize(18), 48);
    assert.equal(logoSize(24), 48);
    assert.equal(logoSize(26), 64);
    assert.equal(logoSize(28), 64);
    assert.equal(logoSize(30), 64);
    assert.equal(logoSize(40), 80);
  });
  it("눈금을 넘는 크기는 마지막 눈금에 붙인다", () => {
    assert.equal(logoSize(100), LOGO_SIZES[LOGO_SIZES.length - 1]);
  });
  it("돌려주는 값은 언제나 라우트가 받는 눈금이다", () => {
    for (const d of [8, 18, 24, 26, 28, 30, 40, 64, 300]) assert.equal(isLogoSize(logoSize(d)), true);
    assert.equal(isLogoSize(52), false);
    assert.equal(isLogoSize(Number.NaN), false);
  });
});

describe("logoTicker", () => {
  it("KRX 는 거래소 접미사, 미국은 그대로(대문자)", () => {
    assert.equal(logoTicker("005930", "KOSPI"), "005930.KS");
    assert.equal(logoTicker("247540", "KOSDAQ"), "247540.KQ");
    assert.equal(logoTicker("nvda", "US"), "NVDA");
  });
  it("시장을 모르면 요청하지 않는다(null)", () => {
    assert.equal(logoTicker("005930", null), null);
    assert.equal(logoTicker("005930", ""), null);
    assert.equal(logoTicker("005930", "KONEX"), null);
  });
  it("만든 티커는 라우트의 꼴 검사를 통과한다", () => {
    for (const t of [logoTicker("005930", "KOSPI"), logoTicker("247540", "KOSDAQ"), logoTicker("BRK.B", "US"), logoTicker("BF-B", "US")]) {
      assert.equal(LOGO_TICKER_RE.test(t!), true, t!);
    }
  });
});

describe("LOGO_TICKER_RE", () => {
  it("대문자·숫자·점·하이픈 12자까지만", () => {
    for (const bad of ["", "005930.ks", "../x", "a b", "005930.KS?x", "ABCDEFGHIJKLM", ".KS", "-B"]) {
      assert.equal(LOGO_TICKER_RE.test(bad), false, bad);
    }
  });
});

describe("stockLogoPath", () => {
  it("라우트 주소에 크기를 붙인다", () => {
    assert.equal(stockLogoPath("005930.KS", 48), "/api/logo/005930.KS?s=48");
  });
});

describe("logoVerdict", () => {
  it("404 는 missing, 200 그림은 ok", () => {
    assert.equal(logoVerdict(404, null), "missing");
    assert.equal(logoVerdict(200, "image/webp"), "ok");
    assert.equal(logoVerdict(200, "image/png"), "ok");
  });
  it("한도 초과·장애·그림 아닌 200 은 error", () => {
    assert.equal(logoVerdict(429, "application/json; charset=utf-8"), "error");
    assert.equal(logoVerdict(500, null), "error");
    assert.equal(logoVerdict(200, "text/html"), "error");
    assert.equal(logoVerdict(200, null), "error");
  });
  it("error 만 짧게 캐시한다 — 한도가 풀리면 곧 로고가 돌아와야 한다", () => {
    const secs = (cc: string) => Number(/max-age=(\d+)/.exec(cc)![1]);
    assert.equal(secs(LOGO_CACHE.error) <= 900, true);
    assert.equal(secs(LOGO_CACHE.ok) >= 86400, true);
    assert.equal(LOGO_CACHE.missing, LOGO_CACHE.ok);
    for (const cc of Object.values(LOGO_CACHE)) assert.match(cc, /^public, /);
  });
});
