/**
 * app/dividend/calc.ts — 배당으로 살기(/dividend)의 셈 가운데 React·세율표 없이 도는 조각.
 * 한 화면의 여러 칸(히어로·표·달력·다가오는 일정·목표)이 같은 담은 종목을 서로 다른 식으로 세면
 * 숫자가 어긋난다(2026-09-29 감사). 그 칸들이 같은 값을 내는지를 여기 붙박는다. 돌리는 법: `npm test`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { monthlyOf } from "../app/dividend/calc.ts";

const round = (v: number[]) => v.map((x) => Math.round(x));
const sum = (v: number[]) => v.reduce((t, x) => t + x, 0);
const monthlyPays = (amt: number, day: number): [number, number, number][] => Array.from({ length: 12 }, (_, i) => [i + 1, amt, day]);

describe("monthlyOf — 달력(달마다 얼마 들어오나)", () => {
  // computeLines 가 일반 계좌로 낸 값: 감액배당주는 과세 몫이 0 이라 세후 = 세전,
  // 과표 20% ETF 는 1,200,000 × (1 − 15.4% × 0.2) = 1,163,040.
  const taxFree = { shares: 100, grossKrw: 100_000, netKrw: 100_000, stock: { currency: "KRW" as const, pays: [[4, 1_000, 17]] as [number, number, number][] } };
  const tiger = { shares: 1_000, grossKrw: 1_200_000, netKrw: 1_163_040, stock: { currency: "KRW" as const, pays: monthlyPays(100, 3) } };

  it("감액배당·과표 ETF 도 열두 칸의 합이 히어로의 세후 합과 같다", () => {
    const m = monthlyOf([taxFree, tiger], 1_400);
    assert.equal(Math.round(sum(m)), 1_263_040);
    // 4월 = 감액배당 100,000(세금 없음) + ETF 96,920. 옛 식(1 − 세율)은 169,200 이었다.
    assert.equal(Math.round(m[4]), 196_920);
    assert.equal(Math.round(m[1]), 96_920);
  });

  it("비과세 종합저축 한도를 넘어 줄에 세금이 붙으면 달력도 그만큼 뗀다", () => {
    // 원금 1억 중 절반이 한도 밖 → 15.4% × 0.5 = 7.7% 를 뗀 줄.
    const exempt = { shares: 1_000, grossKrw: 12_000_000, netKrw: 11_076_000, stock: { currency: "KRW" as const, pays: monthlyPays(1_000, 5) } };
    const m = monthlyOf([exempt], 1_400);
    assert.deepEqual(round(m.slice(1)), new Array(12).fill(923_000));
  });

  it("달러 지급 건은 환율을 곱해 원화 칸에 든다", () => {
    // SCHD 10주, 분기 $0.25, 환율 1,400 — 세후(미국 15%) 1년 11,900원.
    const schd = { shares: 10, grossKrw: 14_000, netKrw: 11_900, stock: { currency: "USD" as const, pays: [3, 6, 9, 12].map((mo) => [mo, 0.25, 25]) as [number, number, number][] } };
    const m = monthlyOf([schd], 1_400);
    assert.equal(Math.round(m[3]), 2_975);
    assert.equal(Math.round(sum(m)), 11_900);
  });

  it("m[0] 은 안 쓰고 지급 건이 없는 달은 0", () => {
    const m = monthlyOf([taxFree], 1_400);
    assert.equal(m.length, 13);
    assert.equal(m[0], 0);
    assert.equal(m[5], 0);
  });
});
