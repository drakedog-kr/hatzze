/**
 * lib/mdd.ts — 낙폭 에피소드와 회복 통계. /mdd 히어로 문장이 이 값을 그대로 옮기므로
 * 모집단 규칙(similarCount 는 깊이와 무관하게 '지금보다 깊었던' 전부, depthBuckets 는 −20% 보다
 * 깊은 것만)이 여기 붙박여 있어야 한다(2026-09-09 조사 · PR #509).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { analyzeDrawdown, drawdownSeries, episodes } from "../lib/mdd.ts";

/** 하루 간격의 종가 열. */
function bars(closes: number[]) {
  const d0 = Date.UTC(2024, 0, 1);
  return closes.map((close, i) => ({ date: new Date(d0 + i * 86_400_000).toISOString().slice(0, 10), close }));
}

describe("drawdownSeries", () => {
  it("직전 고점 대비 낙폭(%)이고 새 고점에서는 0", () => {
    const s = drawdownSeries(bars([100, 90, 110, 99]));
    assert.deepEqual(
      s.map((p) => Math.round(p.dd * 10) / 10),
      [0, -10, 0, -10],
    );
  });
});

describe("episodes", () => {
  it("고점에서 시작해 되찾을 때까지가 한 에피소드이고, 못 되찾은 마지막은 미회복", () => {
    // 100 → 70 (−30%) → 100 회복 → 120 새 고점 → 96 (−20%) 진행 중
    const eps = episodes(bars([100, 90, 70, 85, 100, 120, 110, 96]));
    assert.equal(eps.length, 2);
    assert.equal(Math.round(eps[0].depth), -30);
    assert.equal(eps[0].recovered, true);
    assert.equal(Math.round(eps[1].depth), -20);
    assert.equal(eps[1].recovered, false);
  });
  it("하락이 없으면 비어 있다", () => {
    assert.deepEqual(episodes(bars([100, 101, 102])), []);
  });
});

describe("analyzeDrawdown 의 모집단", () => {
  // 얕은 눌림(−5%) 여러 번과 깊은 하락(−40%) 한 번, 지금은 −10%.
  const closes = [100, 95, 100, 95, 100, 60, 100, 95, 100, 90];
  const a = analyzeDrawdown(bars(closes));

  it("depthBuckets 는 −20% 보다 깊은 사건만 센다", () => {
    assert.ok(a);
    const big = a.depthBuckets.reduce((s, b) => s + b.count, 0);
    assert.equal(big, 1);
  });
  it("similarCount 는 문턱과 상관없이 지금(−10%)보다 깊었던 사건 전부다 — 그래서 앞 수보다 클 수 있다", () => {
    assert.ok(a?.recovery);
    assert.equal(Math.round(a.currentDd), -10);
    // −40% 한 번과 **지금 진행 중인 −10% 사건 자신**(바닥이 지금과 같다)의 둘. 얕은 눌림 −5% 셋은 안 든다.
    // 진행 중인 사건은 미회복이라 회복 일수 통계에는 안 든다.
    assert.equal(a.recovery.similarCount, 2);
    assert.equal(a.recovery.recoveredCount, 1);
    assert.equal(a.recovery.unrecoveredCount, 1);
  });
  it("deeperCount 는 지금보다 **더** 깊었던 사건만 — 오늘이 진행 중 사건의 바닥이면 그 사건은 안 든다", () => {
    // 히어로 문장 "지금(X)보다 깊이 잠긴 적은 … N번"이 이 수다. similarCount 를 쓰면 신저점 날마다 하나가
    // 더 세어져, 같은 화면의 '이보다 깊었던 날: 없음'과 "1번"이 나란히 섰다(deeperThanNowDays 가 고친 것과 같은 병).
    assert.ok(a?.recovery);
    // 위 열: 지금 −10% 가 진행 중 사건의 바닥이라 −40% 한 번뿐.
    assert.equal(a.recovery.deeperCount, 1);

    // 신저점 날: 지금이 이 구간의 최악이다.
    const low = analyzeDrawdown(bars([100, 110, 105, 112, 120, 118, 121, 115, 100, 90, 80]));
    assert.ok(low?.recovery);
    assert.equal(low.deeperThanNowDays, 0);
    assert.equal(low.recovery.similarCount, 1);
    assert.equal(low.recovery.deeperCount, 0);

    // 바닥에서 튄 날: 진행 중 사건의 바닥(−33.9%)은 지금(−25.6%)보다 깊었으므로 센다.
    const bounced = analyzeDrawdown(bars([100, 110, 105, 112, 120, 118, 121, 115, 100, 90, 80, 90]));
    assert.ok(bounced?.recovery);
    assert.equal(bounced.recovery.deeperCount, 1);
  });
  it("지금이 신고가 부근(−1% 안쪽)이면 회복 통계를 내지 않는다", () => {
    const b = analyzeDrawdown(bars([100, 90, 100, 99.5]));
    assert.ok(b);
    assert.equal(b.recovery, null);
  });
});
