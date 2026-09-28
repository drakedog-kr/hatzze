/**
 * lib/surging-score.ts — 국장·미장 급부상 배수. 파이썬 사본(data-pipeline/common/surging.py ·
 * common/us_surging.py)이 data-pipeline/tests/test_surging_score.py 에서 **같은 예제로 같은 값**을 확인한다.
 * 한쪽만 고치면 둘 중 하나가 깨진다. 돌리는 법: `npm test`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SHARE_SMOOTHING, scoreSurging, scoreUsSurging } from "../lib/surging-score.ts";

type Row = [string, string, number, number];
const DATES = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05"];
const kr = (rows: Row[]) =>
  rows.map(([date, stock_code, weighted_score, mention_count]) => ({ date, stock_code, weighted_score, mention_count }));
const us = (rows: Row[]) =>
  rows.map(([date, ticker, weighted_score, mention_count]) => ({ date, ticker, weighted_score, mention_count }));
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-12, `${a} ≠ ${b}`);

// 평일 넷(전체 1,000)과 조용한 하루(09-04, 전체 50). B 는 그 조용한 날에만 2건 나왔다.
const QUIET_RECENT = kr([
  ["2026-09-01", "A", 100, 5], ["2026-09-01", "C", 900, 45],
  ["2026-09-02", "A", 100, 5], ["2026-09-02", "C", 900, 45],
  ["2026-09-03", "A", 300, 15], ["2026-09-03", "C", 700, 35],
  ["2026-09-04", "B", 25, 2], ["2026-09-04", "C", 25, 1],
  ["2026-09-05", "A", 300, 15], ["2026-09-05", "C", 700, 35],
]);

// 앞 기간의 조용한 날(09-01, 전체 100)에 H 몫이 25%로 치솟았다 — 2026-09-24 추석 당일 HLB 꼴.
const QUIET_PRIOR = kr([
  ["2026-09-01", "H", 25, 10], ["2026-09-01", "X", 75, 5],
  ["2026-09-02", "H", 10, 2], ["2026-09-02", "X", 990, 50],
  ["2026-09-03", "H", 60, 6], ["2026-09-03", "X", 940, 47],
  ["2026-09-04", "H", 60, 6], ["2026-09-04", "X", 940, 47],
  ["2026-09-05", "H", 60, 6], ["2026-09-05", "X", 940, 47],
]);

describe("scoreSurging(국장)", () => {
  it("최근은 마지막 사흘이다", () => {
    assert.deepEqual(scoreSurging(QUIET_RECENT, DATES).recentDates, ["2026-09-03", "2026-09-04", "2026-09-05"]);
  });

  it("파이썬 사본과 같은 값", () => {
    const s = scoreSurging(QUIET_RECENT, DATES).scores;
    close(s.get("A")!.ratio, 1.9803921568627447);
    close(s.get("B")!.ratio, 84.33333333333333);
    close(s.get("C")!.ratio, 0.704360679970436);
    assert.equal(s.get("A")!.recentMentions, 30);
    assert.equal(s.get("B")!.isNew, true);
  });

  it("최근은 날마다 평균한다 — 조용한 날 터진 것도 그날만큼 반영된다", () => {
    const b = scoreSurging(QUIET_RECENT, DATES).scores.get("B")!;
    close(b.ratio, (25 / 50 / 3 + SHARE_SMOOTHING) / SHARE_SMOOTHING);
  });

  it("평소는 합쳐서 낸다 — 앞 기간 조용한 날이 평소를 부풀리지 않는다", () => {
    const h = scoreSurging(QUIET_PRIOR, DATES).scores.get("H")!;
    close(h.ratio, 1.8333333333333335);
    const recent = 0.06;
    const oldMean = (recent + SHARE_SMOOTHING) / ((25 / 100 + 10 / 1000) / 2 + SHARE_SMOOTHING);
    const pooled = (recent + SHARE_SMOOTHING) / ((25 + 10) / 1100 + SHARE_SMOOTHING);
    assert.ok(oldMean < 0.5); // 예전엔 '평소보다 줄었다'로 나왔다
    close(h.ratio, pooled);
  });

  it("막대용 날짜별 언급 수를 그대로 돌려준다", () => {
    const s = scoreSurging(QUIET_RECENT, DATES).scores;
    assert.equal(s.get("B")!.byDate.get("2026-09-04"), 2);
    assert.equal(s.get("A")!.byDate.get("2026-09-01"), 5);
  });
});

describe("scoreUsSurging(미장)", () => {
  const rows = us([
    ["2026-09-01", "T1", 10, 1], ["2026-09-01", "Z", 990, 50],
    ["2026-09-02", "T1", 10, 1], ["2026-09-02", "Z", 990, 50],
    ["2026-09-03", "T1", 50, 3], ["2026-09-03", "T2", 20, 2], ["2026-09-03", "T3", 30, 4], ["2026-09-03", "Z", 900, 45],
    ["2026-09-04", "T1", 40, 2], ["2026-09-04", "Z", 60, 3],
    ["2026-09-05", "T1", 50, 3], ["2026-09-05", "Z", 950, 45],
  ]);

  it("3건 미만(T2)·배수 1 이하(Z)는 빼고 배수 순 — 파이썬 사본과 같은 값", () => {
    const { ranked } = scoreUsSurging(rows, DATES, 3);
    assert.deepEqual(ranked.map((r) => r.ticker), ["T3", "T1"]);
    close(ranked[0].multiple, 17.666666666666668);
    close(ranked[1].multiple, 15.779874213836477);
    assert.equal(ranked[1].recentMentions, 8);
  });
});
