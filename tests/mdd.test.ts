/**
 * lib/mdd.ts — 낙폭 에피소드와 회복 통계. /mdd 히어로 문장이 이 값을 그대로 옮기므로
 * 모집단 규칙(similarCount 는 깊이와 무관하게 '지금보다 깊었던' 전부, depthBuckets 는 −20% 보다
 * 깊은 것만)이 여기 붙박여 있어야 한다(2026-09-09 조사 · PR #509).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { analyzeDrawdown, drawdownNow, drawdownOnDates, drawdownSeries, episodes, priceLadder, riskProfile } from "../lib/mdd.ts";

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

/** from~to(YYYY-MM-DD) 평일마다 한 봉. close 는 그날 날짜로 정한다. */
function weekdayBars(from: string, to: string, close: (date: string) => number) {
  const out: { date: string; close: number }[] = [];
  for (let t = Date.parse(from); t <= Date.parse(to); t += 86_400_000) {
    const d = new Date(t);
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    const date = d.toISOString().slice(0, 10);
    out.push({ date, close: close(date) });
  }
  return out;
}

describe("analyzeDrawdown 의 lastDrop — 신고가 날 종목 칸이 쓰는 직전 큰 하락", () => {
  it("15% 넘게 빠졌다 되찾은 것 중 마지막이고, 잔물결은 건너뛴다", () => {
    // 100 → 60 (−40%) → 110 회복 · 새 고점 → 105 (−4.5% 잔물결) → 120 새 고점(오늘)
    const a = analyzeDrawdown(bars([100, 80, 60, 90, 110, 105, 120]))!;
    assert.equal(a.athDate, a.asOf);
    assert.ok(a.lastDrop);
    assert.equal(a.lastDrop!.peak, 100);
    assert.equal(a.lastDrop!.trough, 60);
    assert.equal(Math.round(a.lastDrop!.depth), -40);
    assert.equal(a.lastDrop!.recoveryDate, bars([0, 0, 0, 0, 0])[4].date);
  });
  it("되찾은 큰 하락이 없으면 null", () => {
    assert.equal(analyzeDrawdown(bars([100, 95, 101, 102]))!.lastDrop, null);
  });
});

describe("riskProfile 의 해마다 수익", () => {
  it("그 해 수익은 전해 마지막 종가에서 잰다 — 첫 거래일의 움직임도 그 해 몫이다", () => {
    // 2024 내내 100, 2025 첫 거래일(01-02)에 110 으로 뛰고 그대로. 첫날 종가에서 재면 두 해 다 0% 가 되어
    // 기간 수익 +10% 가 어느 해에도 안 잡혔다.
    const r = riskProfile(weekdayBars("2024-01-02", "2025-12-31", (d) => (d < "2025" ? 100 : 110)));
    assert.ok(r);
    assert.deepEqual(
      r.yearly.map((y) => [y.year, Math.round(y.ret * 10) / 10]),
      [
        [2024, 0],
        [2025, 10],
      ],
    );
  });
  it("거래일이 모자라 빠지는 해도 다음 해의 기준 종가는 준다", () => {
    // 2023 은 12월 열흘(< 20 거래일)이라 막대가 없지만, 그 해 마지막 종가 80 이 2024 의 출발점이다.
    const r = riskProfile(weekdayBars("2023-12-18", "2024-12-31", (d) => (d < "2024" ? 80 : 100)));
    assert.ok(r);
    assert.deepEqual(
      r.yearly.map((y) => [y.year, Math.round(y.ret * 10) / 10]),
      [[2024, 25]],
    );
  });
  it("창의 첫 해는 앞 종가가 없어 그 해 첫 종가에서 잰다", () => {
    const r = riskProfile(weekdayBars("2024-01-02", "2024-12-31", (d) => (d < "2024-07" ? 100 : 120)));
    assert.ok(r);
    assert.equal(Math.round(r.yearly[0].ret), 20);
  });
});

describe("drawdownNow — 첫 줄 띠의 시장 칸(같은 기간 지수의 지금 낙폭)", () => {
  it("마지막 종가가 기간 최고 종가보다 얼마나 낮나와 그 고점 날짜", () => {
    const d = drawdownNow(bars([100, 120, 90, 96]))!;
    assert.equal(Math.round(d.dd * 10) / 10, -20);
    assert.equal(d.peakDate, "2024-01-02");
    assert.equal(drawdownNow([]), null);
  });
});

describe("priceLadder — MDD '거래가 몰린 가격대'", () => {
  it("최근 1년만 세고, 비싼 칸부터, 몫의 합은 100 이며 '지금보다 비싸게'는 날마다 잰다", () => {
    // 1년 전보다 앞선 날(200원)은 창 밖이라 칸을 키우지 않는다. 창 안은 100 → 150 → 120.
    const series = weekdayBars("2025-06-02", "2026-10-02", (dt) => (dt < "2025-10-01" ? 200 : dt < "2026-04-01" ? 100 : dt < "2026-08-01" ? 150 : 120)).map((b) => ({
      ...b,
      volume: 1000,
    }));
    const l = priceLadder(series, 10)!;
    const n = l.bands.length;
    assert.ok(n >= 2 && n <= 10, "칸은 rows 를 넘지 않는다");
    assert.ok(l.bands[0].lo > l.bands[n - 1].lo, "비싼 칸이 위");
    assert.ok(l.bands[0].hi >= 150 && l.bands[n - 1].lo <= 100, "창 안 최고 · 최저가를 덮는다");
    assert.ok(l.bands[0].hi < 200, "창 밖 200원은 안 센다");
    assert.equal(Math.round(l.bands.reduce((s, b) => s + b.share, 0)), 100);
    // 지금 120원보다 비싸게 거래된 날 = 150원 구간. 거래대금(종가 × 거래량) 몫이라 날수 몫보다 크다.
    const days = series.filter((b) => b.date > "2025-10-02");
    const v = (d: { close: number }) => d.close * 1000;
    const want = (days.filter((d) => d.close > 120).reduce((s, d) => s + v(d), 0) / days.reduce((s, d) => s + v(d), 0)) * 100;
    assert.equal(Math.round(l.aboveShare * 10), Math.round(want * 10));
    // 칸 경계는 떨어지는 수(유효 숫자 두 자리)다.
    assert.ok(Number.isInteger(l.step) && Number.isInteger(l.bands[n - 1].lo));
  });

  it("칸 경계가 지금 가격을 지나고, 선 위 칸의 합이 '지금보다 비싸게'다", () => {
    const series = weekdayBars("2025-10-06", "2026-10-02", (dt) => (dt < "2026-01-01" ? 91_500 : dt < "2026-05-01" ? 360_000 : dt < "2026-08-01" ? 300_000 : 276_000)).map((b) => ({
      ...b,
      volume: 1000,
    }));
    const l = priceLadder(series, 8)!;
    assert.equal(l.anchor, 276_000);
    assert.ok(l.aboveCount > 0 && l.aboveCount < l.bands.length);
    assert.equal(l.bands[l.aboveCount - 1].lo, l.anchor, "선 바로 위 칸의 아래 끝");
    assert.equal(l.bands[l.aboveCount].hi, l.anchor, "선 바로 아래 칸의 위 끝");
    const sumAbove = l.bands.slice(0, l.aboveCount).reduce((s, b) => s + b.share, 0);
    assert.equal(Math.round(sumAbove * 10), Math.round(l.aboveShare * 10));
    // 지금 가격과 같은 날(276,000)은 비싸지 않다 — 선 바로 아래 칸에 든다.
    assert.ok(l.bands[l.aboveCount].days > 0);
  });

  it("지금이 1년 최고가면 선 위 칸이 없다", () => {
    const series = weekdayBars("2025-10-06", "2026-10-02", (dt) => (dt < "2026-06-01" ? 100 : 130)).map((b) => ({ ...b, volume: 1000 }));
    const l = priceLadder(series, 8)!;
    assert.equal(l.aboveCount, 0);
    assert.equal(l.aboveShare, 0);
    assert.equal(l.bands[0].hi, 130);
  });

  it("거래량이 없거나 스무 날이 안 되면 null", () => {
    assert.equal(priceLadder(bars([100, 110, 90, 95]), 10), null);
    assert.equal(
      priceLadder(
        bars(Array.from({ length: 10 }, (_, i) => 100 + i)).map((b) => ({ ...b, volume: 10 })),
        10,
      ),
      null,
    );
  });
});

describe("drawdownOnDates — 물속 차트의 시장 선은 종목 점 날짜에 맞춘다", () => {
  it("그날 봉이 없으면(휴장 차이) 그 전 마지막 봉, 첫 봉보다 앞이면 null", () => {
    const idx = [
      { date: "2024-01-02", close: 100 },
      { date: "2024-01-03", close: 80 },
      { date: "2024-01-05", close: 90 },
    ];
    const got = drawdownOnDates(idx, ["2024-01-01", "2024-01-02", "2024-01-04", "2024-01-05"]);
    assert.equal(got[0], null);
    assert.equal(got[1], 0);
    assert.equal(Math.round(got[2]!), -20); // 01-04 은 지수 휴장 — 01-03 값
    assert.equal(Math.round(got[3]!), -10);
  });
});

