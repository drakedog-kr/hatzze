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
  krLogoCode,
  logoCrop,
  logoSize,
  logoUpstreamPath,
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
  it("라우트 주소에 크기와 판을 붙인다 — 판이 바뀌면 브라우저 캐시의 옛 '없음'을 건너뛴다", () => {
    assert.equal(stockLogoPath("005930.KS", 48), "/api/logo/005930.KS?s=48&v=9");
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
    const cdn = (cc: string) => /s-maxage=(\d+)/.exec(cc)![1];
    assert.equal(secs(LOGO_CACHE.error) <= 900, true);
    assert.equal(secs(LOGO_CACHE.ok) >= 86400, true);
    // 없는 로고는 브라우저에 하루만(파이프라인이 길을 찾으면 다음 날 보이게) · CDN 은 그림과 같다.
    assert.equal(secs(LOGO_CACHE.missing), 86400);
    assert.equal(cdn(LOGO_CACHE.missing), cdn(LOGO_CACHE.ok));
    for (const cc of Object.values(LOGO_CACHE)) assert.match(cc, /^public, /);
  });
});

describe("국장 로고 판정(krLogoCode · logoUpstreamPath)", () => {
  it("국장 티커만 종목코드를 준다", () => {
    assert.equal(krLogoCode("058470.KQ"), "058470");
    assert.equal(krLogoCode("005930.KS"), "005930");
    assert.equal(krLogoCode("0035S0.KQ"), "0035S0");
    assert.equal(krLogoCode("NVDA"), null);
    assert.equal(krLogoCode("BRK.B"), null);
  });
  it("판정대로 묻는다 — 없으면 티커, 도메인이면 도메인, none 이면 묻지 않는다", () => {
    assert.equal(logoUpstreamPath("005930.KS", null), "ticker/005930.KS");
    assert.equal(logoUpstreamPath("005930.KS", { source: "ticker", domain: "samsung.com" }), "ticker/005930.KS");
    assert.equal(logoUpstreamPath("169330.KQ", { source: "domain", domain: "embrain.com" }), "embrain.com");
    assert.equal(logoUpstreamPath("037350.KQ", { source: "none", domain: "sungdokorea.com" }), null);
    assert.equal(logoUpstreamPath("NVDA", null), "ticker/NVDA");
  });
  it("도메인 꼴이 아니면 티커로 돌아간다 — 표 값이 주소를 흔들지 못하게", () => {
    assert.equal(logoUpstreamPath("169330.KQ", { source: "domain", domain: "evil.com/x?token=" }), "ticker/169330.KQ");
    assert.equal(logoUpstreamPath("169330.KQ", { source: "domain", domain: null }), "ticker/169330.KQ");
  });
});

describe("긴 로고 다듬기(logoCrop · own)", () => {
  it("자를 상자는 [x, y, w, h] 비율 넷일 때만 — 빈 배열 · 꼴이 틀린 값은 자르지 않는다", () => {
    assert.deepEqual(logoCrop([0.082, 0.4004, 0.3418, 0.1973]), [0.082, 0.4004, 0.3418, 0.1973]);
    assert.equal(logoCrop([]), null);
    assert.equal(logoCrop(null), null);
    assert.equal(logoCrop([0.1, 0.2, 0.3]), null);
    assert.equal(logoCrop([0.9, 0.2, 0.3, 0.1]), null); // 그림 밖으로 나간다
    assert.equal(logoCrop([0.1, 0.2, 0, 0.1]), null);
    assert.equal(logoCrop(["a", 0, 0.5, 0.5]), null);
  });
  it("우리 그림(own)은 logo.dev 에 묻지 않는다", () => {
    assert.equal(logoUpstreamPath("011780.KS", { source: "own", domain: "kkpc.com" }), null);
  });
});
