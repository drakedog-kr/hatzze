/**
 * app/mdd/shared.ts — MDD 화면의 판정 기준과 주소. 숫자는 맞는데 문장이 틀리던 자리(표본 경고 · 시장 이름)와
 * 공유가 끊기던 자리(주소)를 고정한다. 돌리는 법: `npm test`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_YEARS,
  benchName,
  cautionShort,
  mddQuery,
  mddSummary,
  normalizeYears,
  periodInfo,
} from "../app/mdd/shared.ts";
import type { MddResult, SumRow } from "../app/mdd/shared.ts";

describe("normalizeYears", () => {
  it("아는 기간만 통과하고 나머지는 기본 기간 — 프로토타입 키도 막는다", () => {
    for (const k of ["1", "3", "5", "10", "all"]) assert.equal(normalizeYears(k), k);
    for (const k of ["7", "constructor", "__proto__", "", null, undefined]) assert.equal(normalizeYears(k), DEFAULT_YEARS);
  });
});

describe("mddQuery", () => {
  it("종목·시장·기간을 싣고 기본 기간은 뺀다", () => {
    assert.equal(mddQuery({ code: "000660", market: "KOSPI" }, "5"), "?code=000660&market=KOSPI&years=5");
    assert.equal(mddQuery({ code: "058610", market: "KOSDAQ" }, DEFAULT_YEARS), "?code=058610&market=KOSDAQ");
    assert.equal(mddQuery({ code: "BRK.B", market: "US" }, "all"), "?code=BRK.B&market=US&years=all");
  });
});

describe("periodInfo · cautionShort", () => {
  it("1년을 골랐을 뿐인 종목에 '표본이 짧다'고 하지 않는다", () => {
    const p = periodInfo("1", "2025-09-30", "2026-09-30");
    assert.equal(p.label, "최근 1년");
    assert.equal(p.truncated, false);
    assert.equal(cautionShort("1", p.truncated, p.approxYears), null);
  });

  it("상장 이력이 고른 기간보다 짧으면 '상장 이후'와 표본 경고", () => {
    const p = periodInfo("10", "2023-09-30", "2026-09-30");
    assert.equal(p.truncated, true);
    assert.equal(p.label, "상장 이후·약 3년");
    assert.equal(cautionShort("10", p.truncated, p.approxYears), "상장 3년, 표본 짧음");
  });

  it("전체 구간은 자료가 시작한 해로 적는다 — 야후가 2000년부터라 '상장 이후'면 1975년 상장 종목에 거짓이다", () => {
    assert.equal(periodInfo("all", "2000-01-04", "2026-09-30").label, "2000년 이후");
  });

  it("전체 구간에 종목과 상관없는 경고를 달지 않는다(2026-10-05 점검)", () => {
    const p = periodInfo("all", "2000-01-04", "2026-09-30");
    assert.equal(cautionShort("all", p.truncated, p.approxYears), null);
  });
});

describe("시장 이름 — api/mdd 가 고르는 지수와 짝", () => {
  it("코스닥 종목은 코스닥과 견준다", () => {
    assert.equal(benchName("KOSDAQ"), "코스닥");
    assert.equal(benchName("KOSPI"), "코스피");
    assert.equal(benchName("US"), "S&P500");
    assert.equal(benchName(null), "코스피");
  });
});

describe("mddSummary — 낙폭 요약 줄", () => {
  /** 삼성전자 10년(2026-10-03 실측)을 바탕으로 갈래마다 한 군데씩 바꾼다. */
  function base(over: { analysis?: Record<string, unknown>; attribution?: MddResult["attribution"]; theme?: MddResult["theme"]; market?: string; years?: string; partial?: MddResult["partial"] } = {}) {
    const analysis = {
      firstDate: "2016-10-04",
      asOf: "2026-10-02",
      tradingDays: 2448,
      currentDd: -23.9,
      deeperThanNowDays: 682,
      athDate: "2026-06-18",
      topDrawdowns: [{ peakDate: "2021-01-11", troughDate: "2024-11-14", depth: -45.2, recoveryDate: "2025-12-01", days: 1785, troughDays: 1403, recovered: true }],
      recovery: { similarCount: 4, deeperCount: 4, recoveredCount: 3, unrecoveredCount: 1, minDays: 298, medianDays: 799, maxDays: 1733, samples: [] },
      ...over.analysis,
    } as unknown as MddResult["analysis"];
    return {
      analysis,
      attribution: over.attribution === undefined ? { sincePeakDays: 106, stock: -23.9, market: -22.7, theme: -9.2 } : over.attribution,
      theme: over.theme === undefined ? { name: "반도체", peers: Array.from({ length: 11 }, () => ({})) as never, avgDd: -26.2, sincePeakAvg: -9.2 } : over.theme,
      market: over.market ?? "KOSPI",
      years: over.years ?? "10",
      partial: over.partial ?? null,
    };
  }
  const text = (rows: SumRow[], key: SumRow["key"]) => {
    const r = rows.find((x) => x.key === key);
    return r ? r.parts.map((p) => (typeof p === "string" ? p : p.b)).join("") : null;
  };

  it("독자 물음 순서 — 깊이 · 회복 · 시장 · 업종", () => {
    const rows = mddSummary(base());
    assert.deepEqual(rows.map((r) => r.key), ["depth", "recovery", "market", "theme"]);
    assert.equal(text(rows, "depth"), "최근 10년 동안 지금보다 깊이 빠져 있던 날은 열흘에 3일꼴입니다.");
    assert.equal(text(rows, "recovery"), "이만큼 빠진 하락은 이번이 4번째입니다. 앞선 3번은 저점에서 회복하기까지 보통 2.2년 걸렸습니다.");
    assert.equal(text(rows, "market"), "6월 18일 고점 이후 코스피도 −22.7%로 비슷하게 빠졌습니다.");
    assert.equal(text(rows, "theme"), "같은 기간 반도체 대표 종목은 평균 −9.2%로 이 종목보다 14.7%p 덜 빠졌습니다.");
  });

  it("드문 깊이는 날수로, 지금이 가장 깊으면 그렇게", () => {
    assert.equal(text(mddSummary(base({ analysis: { deeperThanNowDays: 5 } })), "depth"), "최근 10년 동안 지금보다 깊이 빠져 있던 날은 5거래일뿐입니다.");
    assert.equal(text(mddSummary(base({ analysis: { deeperThanNowDays: 0 } })), "depth"), "최근 10년 동안 지금이 가장 깊이 빠져 있습니다.");
  });

  it("처음 겪는 깊이 · 앞선 회복이 하나 · 둘", () => {
    const first = { similarCount: 1, deeperCount: 0, recoveredCount: 0, unrecoveredCount: 1, minDays: null, medianDays: null, maxDays: null, samples: [] };
    assert.equal(text(mddSummary(base({ analysis: { recovery: first } })), "recovery"), "최근 10년 동안 이만큼 빠진 하락은 이번이 처음입니다.");
    const one = { ...first, similarCount: 2, recoveredCount: 1, minDays: 400, medianDays: 400, maxDays: 400 };
    assert.match(text(mddSummary(base({ analysis: { recovery: one } })), "recovery")!, /이번이 2번째입니다\. 앞선 1번은 저점에서 회복하기까지 1\.1년 걸렸습니다\.$/);
    const two = { ...first, similarCount: 3, recoveredCount: 2, minDays: 364, medianDays: 373, maxDays: 381 };
    assert.match(text(mddSummary(base({ analysis: { recovery: two } })), "recovery")!, /앞선 2번은 저점에서 회복하기까지 1년 걸렸습니다\.$/);
    const both = { ...two, minDays: 583, medianDays: 833, maxDays: 1083 };
    assert.match(text(mddSummary(base({ analysis: { recovery: both } })), "recovery")!, /1\.6~3년 걸렸습니다\.$/);
    const far = { ...two, minDays: 120, medianDays: 310, maxDays: 500 };
    assert.match(text(mddSummary(base({ analysis: { recovery: far } })), "recovery")!, /앞선 2번은 저점에서 회복하기까지 4개월~1\.4년 걸렸습니다\.$/);
  });

  it("시장이 올랐으면 '빠졌습니다'라고 하지 않는다 — 미장 조사도", () => {
    const up = mddSummary(base({ market: "US", attribution: { sincePeakDays: 290, stock: -24.4, market: 13.6, theme: -32.7 } }));
    assert.equal(text(up, "market"), "6월 18일 고점 이후 S&P500은 오히려 +13.6% 올랐습니다.");
    assert.equal(text(up, "theme"), "같은 기간 반도체 대표 종목은 평균 −32.7%로 이 종목보다 8.3%p 더 빠졌습니다.");
    const flat = mddSummary(base({ market: "KOSDAQ", attribution: { sincePeakDays: 318, stock: -39.7, market: 1.7, theme: null } }));
    assert.equal(text(flat, "market"), "6월 18일 고점 이후 코스닥은 +1.7%로 거의 그대로였습니다.");
    assert.equal(text(flat, "theme"), null);
  });

  it("시장보다 더 빠졌으면 차이를 %p 로", () => {
    const rows = mddSummary(base({ attribution: { sincePeakDays: 102, stock: -36.9, market: -23.2, theme: null } }));
    assert.equal(text(rows, "market"), "6월 18일 고점 이후 코스피는 −23.2%로 이 종목보다 13.7%p 덜 빠졌습니다.");
  });

  it("시장 시세를 못 받은 날은 그렇게 적고, 업종 줄은 고점 날짜로 시작한다", () => {
    const rows = mddSummary(base({ attribution: { sincePeakDays: 106, stock: -23.9, market: null, theme: -9.2 }, partial: { market: true, peersRequested: 0, peersOk: 0, lookupFailed: false } }));
    assert.equal(text(rows, "market"), "코스피 시세를 지금 불러오지 못했습니다.");
    assert.match(text(rows, "theme")!, /^6월 18일 고점 이후 반도체/);
  });

  it("신고가 부근 — 회복 · 시장 줄 대신 기간 최대 낙폭", () => {
    const rows = mddSummary(base({ analysis: { currentDd: -0.8, deeperThanNowDays: 2161, recovery: null }, attribution: null }));
    assert.deepEqual(rows.map((r) => r.key), ["depth", "worst", "theme"]);
    assert.equal(text(rows, "depth"), "최근 10년 동안 지금보다 깊이 빠져 있던 날은 열흘에 9일꼴입니다.");
    assert.equal(text(rows, "worst"), "최근 10년 가장 깊었던 하락은 −45.2%였고, 저점에서 회복하기까지 1년 걸렸습니다.");
    assert.equal(text(rows, "theme"), "반도체 대표 11종목은 평균 고점 대비 −26.2%입니다.");
  });

  it("전체 조회는 '2000년 이후'에 '동안'을 안 붙인다", () => {
    const rows = mddSummary(base({ years: "all", analysis: { firstDate: "2000-01-04" } }));
    assert.match(text(rows, "depth")!, /^2000년 이후 지금보다/);
  });

  it("상장이 짧으면 기간을 '상장 이후 약 N년'으로", () => {
    const rows = mddSummary(base({ years: "10", analysis: { firstDate: "2023-10-02" } }));
    assert.match(text(rows, "depth")!, /^상장 이후 약 3년 동안/);
  });
});

