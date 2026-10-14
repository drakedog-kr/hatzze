/**
 * ETF 분배금 셈(lib/etf-pay.ts) — 수익률에 더하는 분배금은 분배락일로, 예상 건은 빼고. 돌리는 법: `npm test`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { paidBetween } from "../lib/etf-pay.ts";

// 9월 거래일(추석 연휴 없이 평일만) — 9/7 일요일은 없다
const CAL = ["2026-09-03", "2026-09-04", "2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10"];

describe("paidBetween", () => {
  it("거래일 목록을 주면 기준일 앞 거래일(분배락일)로 가른다", () => {
    // RISE 국고채3년 꼴 — 기준일 9/9 · 592원. 분배락일은 9/8 이라 9/8 종가에서 잰 기간엔 안 든다
    const pays = [{ record: "2026-09-09", pay: "2026-09-11", amount: 592 }];
    assert.equal(paidBetween(pays, "2026-09-08", "2026-09-10", CAL).sum, 0);
    assert.equal(paidBetween(pays, "2026-09-07", "2026-09-10", CAL).sum, 592);
    // 목록 없이 부르면 예전처럼 기준일로(분배금 합 · 횟수 칸)
    assert.equal(paidBetween(pays, "2026-09-08", "2026-09-10").sum, 592);
  });

  it("기준일이 목록 끝 다음 평일이면 마지막 거래일이 분배락일이다", () => {
    const pays = [{ record: "2026-09-11", amount: 100 }];
    assert.equal(paidBetween(pays, "2026-09-09", "2026-09-10", CAL).count, 1);
    // 그보다 먼 앞날은 아직 안 빠졌다
    assert.equal(paidBetween([{ record: "2026-09-14", amount: 100 }], "2026-09-09", "2026-09-10", CAL).count, 0);
  });

  it("신규 ETF 의 예상 건(est)은 세지 않는다", () => {
    const pays = [
      { record: "2026-09-09", amount: 50 },
      { pay: "2026-09-09", amount: 227, est: true },
    ];
    assert.deepEqual(paidBetween(pays, "2026-09-01", "2026-09-10"), { sum: 50, count: 1 });
  });
});
