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
  spacSponsorTicker,
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
  it("우선주는 보통주 티커로 묻는다(끝자리만 다르다)", () => {
    assert.equal(logoTicker("005935", "KOSPI"), "005930.KS");
    assert.equal(logoTicker("37550K", "KOSPI"), "375500.KS");
    assert.equal(logoTicker("0220WL", "KOSPI"), "0220W0.KS");
    assert.equal(logoTicker("002787", "KOSPI"), "002780.KS");
    assert.equal(logoTicker("0001A0", "KOSDAQ"), "0001A0.KQ");
    assert.equal(logoTicker("BRK.B", "US"), "BRK.B");
  });
  it("스팩은 만든 증권사의 로고 티커로 묻는다(시장도 증권사 쪽)", () => {
    assert.equal(logoTicker("0041L0", "KOSDAQ", "하나35호스팩"), "086790.KS");
    assert.equal(logoTicker("478110", "KOSDAQ", "이베스트스팩6호"), "078020.KQ");
    assert.equal(logoTicker("005930", "KOSPI", "삼성전자"), "005930.KS");
    assert.equal(logoTicker("0041L0", null, "하나35호스팩"), null);
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

describe("spacSponsorTicker", () => {
  // 2026-10-20 국장 스팩 76곳의 이름 — 앞머리 23가지가 모두 증권사로 이어져야 한다.
  const SPACS = [
    "DB금융스팩12호", "IBKS제23호스팩", "IBKS제24호스팩", "IBKS제25호스팩", "KB제29호스팩", "KB제30호스팩", "KB제31호스팩",
    "KB제32호스팩", "KB제33호스팩", "KB제34호스팩", "교보15호스팩", "교보16호스팩", "교보17호스팩", "교보18호스팩", "교보19호스팩",
    "교보20호스팩", "대신밸런스제17호스팩", "대신밸런스제19호스팩", "대신밸런스제20호스팩", "디비금융제13호스팩", "디비금융제14호스팩",
    "메리츠제1호스팩", "메리츠제2호스팩", "미래에셋비전스팩10호", "미래에셋비전스팩11호", "미래에셋비전스팩4호", "미래에셋비전스팩5호",
    "미래에셋비전스팩6호", "미래에셋비전스팩7호", "미래에셋비전스팩8호", "미래에셋비전스팩9호", "비엔케이제3호스팩", "삼성스팩10호",
    "삼성스팩11호", "삼성스팩12호", "삼성스팩13호", "신영스팩10호", "신영스팩11호", "신한제12호스팩", "신한제13호스팩", "신한제14호스팩",
    "신한제15호스팩", "신한제16호스팩", "신한제17호스팩", "신한제18호스팩", "에스케이증권제11호스팩", "에스케이증권제12호스팩",
    "에스케이증권제13호스팩", "에이치엠씨제7호스팩", "엔에이치스팩31호", "엔에이치스팩32호", "엔에이치스팩33호", "엔에이치스팩34호",
    "엘에스스팩1호", "유안타제15호스팩", "유안타제16호스팩", "유안타제17호스팩", "유진스팩10호", "유진스팩11호", "유진스팩12호",
    "이베스트스팩6호", "키움제10호스팩", "키움제11호스팩", "키움히어로제1호스팩", "키움히어로제2호스팩", "하나30호스팩", "하나31호스팩",
    "하나32호스팩", "하나33호스팩", "하나34호스팩", "하나35호스팩", "하나36호스팩", "한국제15호스팩", "한국제16호스팩", "한국제17호스팩",
    "한화플러스제5호스팩",
  ];
  it("지금 상장된 스팩은 모두 증권사 티커로 이어진다", () => {
    for (const name of SPACS) {
      const t = spacSponsorTicker(name);
      assert.ok(t && LOGO_TICKER_RE.test(t) && /\.(KS|KQ)$/.test(t), name);
    }
  });
  it("스팩이 아니거나 모르는 앞머리면 null", () => {
    assert.equal(spacSponsorTicker("삼성전자"), null);
    assert.equal(spacSponsorTicker("한국전력"), null);
    assert.equal(spacSponsorTicker("새증권제1호스팩"), null);
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
    assert.equal(stockLogoPath("005930.KS", 48), "/api/logo/005930.KS?s=48&v=10");
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
    // 판정표가 '없음'인 국장 종목은 한 시간만 — 판정표에 그림을 넣으면 그날 보여야 한다(logo.dev 에는 안 묻는다).
    assert.equal(secs(LOGO_CACHE.none) <= 3600, true);
    assert.equal(Number(cdn(LOGO_CACHE.none)) <= 3600, true);
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
