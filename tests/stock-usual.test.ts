/**
 * lib/stock-usual.ts — 테마 화면의 '평소 대비'. 언급 수로 재던 때는 요일을 탔다(월 −48% · 수~금 +36% · 일 −45%).
 * 파이프라인 짝(data-pipeline/tests/test_theme_risers_share.py)과 같은 요일 예제(평일 10회 · 주말 1회)를 쓴다.
 * 돌리는 법: `npm test`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { daysEndingAt } from "../lib/theme-window.ts";
import { expectedUsualMentions, stockTone, toneForRatio, usualDeltaShort, usualDeltaText } from "../lib/stock-usual.ts";

const isWeekend = (iso: string) => [0, 6].includes(new Date(`${iso}T00:00:00Z`).getUTCDay());

/** 기준일로 끝나는 30일 창에서 관심이 늘 같은 종목(평일 10회 · 주말 1회, 총량도 같은 비율)의 최근·평소. */
function steady(base: string) {
  const days = daysEndingAt(base, 30);
  const recentDays = days.slice(-3);
  const usualDays = days.slice(0, -3);
  const m = (d: string) => (isWeekend(d) ? 1 : 10);
  const dayTotals = new Map(days.map((d) => [d, m(d) * 100]));
  const recent = recentDays.reduce((s, d) => s + m(d), 0);
  const usualSum = usualDays.reduce((s, d) => s + m(d), 0);
  return { recent, usualSum, recentDays, usualDays, dayTotals };
}

describe("expectedUsualMentions", () => {
  it("관심이 그대로인 종목은 어느 요일에도 '평소만큼'이다 — 몫으로 재면 요일이 지워진다", () => {
    for (let i = 0; i < 7; i++) {
      const base = new Date(Date.UTC(2026, 8, 28 + i)).toISOString().slice(0, 10); // 9/28(월) ~ 10/4(일)
      const s = steady(base);
      const usual = expectedUsualMentions(s);
      assert.ok(Math.abs(usual - s.recent) < 1e-9, `${base}: 평소 ${usual} · 최근 ${s.recent}`);
      assert.equal(stockTone(s.recent, usual), "is-flat", base);
      assert.equal(usualDeltaText(s.recent, usual), "평소만큼 언급", base);
    }
  });

  it("옛 식(하루 평균 × 일수)은 월요일에 −45% 안팎이었다 — 총량이 없으면 그 식으로 물러선다", () => {
    const s = steady("2026-10-05"); // 월요일 — 최근이 토·일·월
    const old = expectedUsualMentions({ ...s, dayTotals: null });
    assert.ok(s.recent / old < 0.6, `옛 식 비율 ${s.recent / old}`);
    assert.equal(stockTone(s.recent, old), "is-down-1");
  });

  it("몫이 두 배가 되면 두 배로 본다", () => {
    const s = steady("2026-10-01");
    const usual = expectedUsualMentions(s);
    assert.ok(Math.abs((s.recent * 2) / usual - 2) < 1e-9);
  });

  it("한쪽 창의 총량이 0 이면 옛 식으로 물러선다", () => {
    const s = steady("2026-10-01");
    const zeroRecent = new Map([...s.dayTotals].map(([d, t]) => [d, s.recentDays.includes(d) ? 0 : t]));
    assert.equal(expectedUsualMentions({ ...s, dayTotals: zeroRecent }), expectedUsualMentions({ ...s, dayTotals: null }));
  });
});

describe("평소 대비 문구", () => {
  it("세 배부터는 배로, 열 배에서 멈춘다 — '+8900%' 를 찍지 않는다", () => {
    assert.equal(usualDeltaText(10, 0.111), "평소의 10배 넘게 언급");
    assert.equal(usualDeltaShort(10, 0.111), "10배 넘게");
    assert.equal(usualDeltaText(12, 3), "평소의 4배 언급");
    assert.equal(usualDeltaText(16, 10), "평소 대비 +60% 언급");
    assert.equal(usualDeltaText(58, 100), "평소 대비 −42% 언급");
    assert.equal(usualDeltaShort(58, 100), "−42%");
    assert.equal(usualDeltaText(5, 0), "새로 등장");
    assert.equal(usualDeltaShort(10, 10), "평소만큼");
  });

  it("급부상 태그 색은 배수 그대로다", () => {
    assert.equal(toneForRatio(1.6, 10), "is-up-1");
    assert.equal(toneForRatio(2.6, 10), "is-up-2");
    assert.equal(toneForRatio(null, 6), "is-up-3");
    assert.equal(toneForRatio(1.0, 10), "is-flat");
  });
});
