/**
 * app/dividend/calc.ts — 배당으로 살기(/dividend)의 셈 가운데 React·세율표 없이 도는 조각.
 * 한 화면의 여러 칸(히어로·표·달력·다가오는 일정·목표)이 같은 담은 종목을 서로 다른 식으로 세면
 * 숫자가 어긋난다(2026-09-29 감사). 그 칸들이 같은 값을 내는지를 여기 붙박는다. 돌리는 법: `npm test`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { expectedPays, goalBasis, monthlyOf, showsSepTax } from "../app/dividend/calc.ts";

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

describe("expectedPays — 다가오는 일정의 '석 달 안 예상' 합에 드는 지급 건", () => {
  // 오늘 2026-09-29(KST), 석 달(92일) 뒤 2026-12-30.
  const iso = "2026-09-29";
  const horizon = "2026-12-30";
  const dates = (xs: { date: string }[]) => xs.map((x) => x.date);

  it("월배당은 석 달에 세 번 — 가장 가까운 한 번만이 아니라 전부 더한다", () => {
    const got = expectedPays(monthlyPays(0.4, 4), iso, horizon, null);
    assert.deepEqual(dates(got), ["2026-10-04", "2026-11-04", "2026-12-04"]);
    assert.deepEqual(got.map((x) => x.v), [0.4, 0.4, 0.4]);
  });

  it("확정 지급일이 있으면 지난해 같은 차례(짝)는 빼고 그 뒤의 것만 더한다", () => {
    const got = expectedPays(monthlyPays(0.4, 4), iso, horizon, { pay: "2026-10-03", record: null });
    assert.deepEqual(dates(got), ["2026-11-04", "2026-12-04"]);
  });

  it("짝은 달이 아니라 날로 찾는다 — 올해 9/30 확정, 지난해엔 10/1", () => {
    const got = expectedPays(monthlyPays(0.4, 1), iso, horizon, { pay: "2026-09-30", record: null });
    assert.deepEqual(dates(got), ["2026-11-01", "2026-12-01"]);
  });

  it("짝이 오늘 앞이라 창 밖으로 밀렸으면 창 안의 건은 다 든다", () => {
    // 지난해 9/28·12/28(분기) — 올해 10/2 확정의 짝은 9/28 이다. 12/28 은 따로 들어올 건.
    const got = expectedPays([[3, 0.5, 28], [6, 0.5, 28], [9, 0.5, 28], [12, 0.5, 28]], iso, horizon, { pay: "2026-10-02", record: null });
    assert.deepEqual(dates(got), ["2026-12-28"]);
  });

  it("국내 배당 공시가 기준일만 있고 지급일이 없으면 기준일 뒤 첫 예상이 그 짝이다", () => {
    const quarterly: [number, number, number][] = [[4, 361, 18], [5, 361, 20], [8, 361, 20], [11, 361, 20]];
    assert.deepEqual(dates(expectedPays(quarterly, iso, horizon, { pay: null, record: "2026-09-30" })), []);
    // 공시 전이면 지난해 11/20 을 그대로 예상한다.
    assert.deepEqual(dates(expectedPays(quarterly, iso, horizon, null)), ["2026-11-20"]);
  });

  it("지난 날은 내년으로 옮기고, 석 달 밖은 빼고, 가까운 순으로 선다", () => {
    const got = expectedPays([[1, 10, 15], [11, 10, 10], [12, 10, 20]], "2026-11-15", "2027-02-15", null);
    assert.deepEqual(dates(got), ["2026-12-20", "2027-01-15"]);
  });
});

describe("goalBasis — 목표까지 칸의 투자금과 배당", () => {
  // 삼성전자 100주(종가 70,000 → 투자금 700만원, 세후 122,162원)와 종가가 없는 날의 국내 ETF 1,000주(세후 456,840원).
  const samsung = { stock: { code: "005930" }, investKrw: 7_000_000, netKrw: 122_162 };
  const unpriced = { stock: { code: "069500" }, investKrw: null, netKrw: 456_840 };

  it("종가도 평단도 없는 줄은 투자금에도 배당에도 안 넣는다 — 수익률이 부풀지 않게", () => {
    const g = goalBasis([samsung, unpriced]);
    assert.equal(g.invest, 7_000_000);
    assert.equal(g.net, 122_162);
    // 세후 수익률 1.75%. 배당만 다 넣으면 8.27% 가 돼 필요한 투자금을 5분의 1로 적었다.
    assert.equal(Math.round((g.net / g.invest) * 10_000) / 100, 1.75);
    assert.equal(g.skipped, 1);
  });

  it("종가 없는 줄이 없으면 전부 센다", () => {
    const g = goalBasis([samsung, { stock: { code: "000660" }, investKrw: 3_000_000, netKrw: 90_000 }]);
    assert.deepEqual(g, { invest: 10_000_000, net: 212_162, skipped: 0 });
  });

  it("배당이 없는 줄은 종가가 없어도 뺐다고 안 센다", () => {
    assert.equal(goalBasis([samsung, { stock: { code: "069500" }, investKrw: null, netKrw: 0 }]).skipped, 0);
  });

  it("같은 종목을 두 계좌에 나눠 담았으면 뺀 종목은 하나로 센다 — 화면이 'N종목'이라 적는다", () => {
    const isa = { ...unpriced, netKrw: 200_000 };
    assert.equal(goalBasis([samsung, unpriced, isa]).skipped, 1);
  });
});

describe("showsSepTax — '분리과세' 알약(/dividend 의 줄 · 종목 페이지 배당 카드)", () => {
  const high = [2025, 45] as [number, number];

  it("고배당기업이어도 지난 1년 배당이 전부 감액배당이면 안 붙인다", () => {
    // 메가스터디(2026-09-17 지적) — 비과세라 분리과세를 고를 배당소득이 없다.
    assert.equal(showsSepTax({ highDiv: high, taxable: 0, dps: 1_500 }), false);
  });

  it("과세 몫이 조금이라도 있거나 모르면 붙인다", () => {
    assert.equal(showsSepTax({ highDiv: high, taxable: 500, dps: 1_500 }), true);
    assert.equal(showsSepTax({ highDiv: high, taxable: null, dps: 1_500 }), true);
  });

  it("고배당기업이 아니면 안 붙인다", () => {
    assert.equal(showsSepTax({ highDiv: null, taxable: null, dps: 1_500 }), false);
  });

  it("종목 페이지의 highDiv(객체 꼴)도 같은 규칙", () => {
    const card = { payoutPct: 45, growthPct: 10, year: 2025 };
    assert.equal(showsSepTax({ highDiv: card, taxable: 0, dps: 1_500 }), false);
    assert.equal(showsSepTax({ highDiv: card, taxable: null, dps: 1_500 }), true);
  });
});
