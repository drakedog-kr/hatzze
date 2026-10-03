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
  normalizeYears,
  periodInfo,
} from "../app/mdd/shared.ts";

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

  it("전체 구간은 합병·감자 경고", () => {
    const p = periodInfo("all", "2000-01-04", "2026-09-30");
    assert.equal(cautionShort("all", p.truncated, p.approxYears), "합병·감자 구간 섞임");
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
