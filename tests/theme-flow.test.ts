/**
 * lib/theme-flow.ts — 테마 흐름의 마지막 날을 표 순위로 바꾸고(withTodayRank), 표본이 거의 없는 날을 추이에서 거른다(thinDays).
 * 2026-10-04 오전 국장 테마 언급이 4건뿐이라 반도체 점유율 100% 가 '30일 최고'가 됐고, 표 3위 테마가 '상위에서 내려간 테마'로 떴다.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { thinDays, withTodayRank } from "../lib/theme-flow.ts";

describe("withTodayRank", () => {
  it("마지막 날만 표 순위로 바꾸고 그 전 날은 그대로", () => {
    assert.deepEqual(withTodayRank([3, 4, 9], 3), [3, 4, 3]);
    assert.deepEqual(withTodayRank([null, 2, null], 7), [null, 2, 7]);
  });

  it("빈 흐름은 그대로", () => {
    assert.deepEqual(withTodayRank([], 1), []);
  });
});

describe("thinDays", () => {
  const days = ["09-28", "09-29", "09-30", "10-03", "10-04"];

  it("평소(중앙값)의 5% 미만인 날만 — 주말(평소의 10% 남짓)은 남긴다", () => {
    const totals = new Map([
      ["09-28", 2776],
      ["09-29", 2587],
      ["09-30", 2537],
      ["10-03", 332],
      ["10-04", 4],
    ]);
    assert.deepEqual([...thinDays(totals, days)], ["10-04"]);
  });

  it("총량을 못 읽었거나 날이 비면 거르지 않는다", () => {
    assert.equal(thinDays(null, days).size, 0);
    assert.equal(thinDays(new Map(), days).size, 0);
  });

  it("집계가 없는 날(0)은 거른다 — 추이에선 원래 '집계 없음'이다", () => {
    const totals = new Map([
      ["09-28", 100],
      ["09-29", 100],
    ]);
    assert.deepEqual([...thinDays(totals, ["09-28", "09-29", "09-30"])], ["09-30"]);
  });
});
