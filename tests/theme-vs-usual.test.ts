/**
 * app/kadera/theme-vs-usual.ts — 카더라 히어로 인기 테마 막대의 툴팁(국장·미장).
 *
 * 막대는 낙관도 그대로 나누고, 평소와 견준 말은 툴팁 첫마디가 한다(2026-09-30). 국장 총평이
 * 같은 테마를 옆에서 말하므로 판정 폭은 파이썬 usual_label(data-pipeline/tests/test_theme_usual.py)과
 * 같아야 한다. 돌리는 법: `npm test`.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { THEME_USUAL_BAND, themeTip } from "../app/kadera/theme-vs-usual.ts";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("themeTip", () => {
  it("평소보다 낮으면 '덜 낙관적' — 낙관이 과반이어도 '비관'이라 하지 않는다", () => {
    // 2026-09-30 미장 AI반도체: 낙관 126 · 비관 59 → 67%, 평소 80%
    assert.equal(themeTip({ pos: 67, usual: 80 }), "평소보다 덜 낙관적이에요 · 낙관 67% (평소 80%)");
  });

  it("평소보다 높으면 '더 낙관적'", () => {
    assert.equal(themeTip({ pos: 88, usual: 80 }), "평소보다 더 낙관적이에요 · 낙관 88% (평소 80%)");
  });

  it("폭 안쪽은 '평소와 비슷' — 총평 usual_label 과 같은 경계", () => {
    // test_theme_usual.py 의 예제 그대로: 84·74 는 벗어나고 83·75 는 안쪽이다(평소 79).
    assert.match(themeTip({ pos: 84, usual: 79 }), /^평소보다 더 낙관적/);
    assert.match(themeTip({ pos: 74, usual: 79 }), /^평소보다 덜 낙관적/);
    assert.match(themeTip({ pos: 83, usual: 79 }), /^평소와 비슷해요/);
    assert.match(themeTip({ pos: 75, usual: 79 }), /^평소와 비슷해요/);
  });

  it("평소가 없으면 낙관도만 말한다", () => {
    assert.equal(themeTip({ pos: 67, usual: null }), "낙관 67% · 평소 기록이 아직 적어요");
  });

  it("판정 폭이 총평(generate_telegram_narratives.py)의 THEME_USUAL_BAND 와 같다", () => {
    const py = read("data-pipeline/scripts/generate_telegram_narratives.py").match(/^THEME_USUAL_BAND = (\d+)/m);
    assert.ok(py, "파이썬 쪽 THEME_USUAL_BAND 를 못 찾았다");
    assert.equal(Number(py[1]), THEME_USUAL_BAND);
  });
});

describe("테마 막대", () => {
  it("국장·미장 모두 낙관도(t.pos) 그대로 나눈다 — 평소 대비로 옮기면 낙관 과반 테마가 파랗게 보인다", () => {
    for (const p of ["app/kadera/page.tsx", "app/kadera/us/page.tsx"]) {
      const src = read(p);
      assert.ok(src.includes('width: `${t.pos}%`, background: "var(--c-warm-3)"'), p);
      assert.ok(src.includes('width: `${100 - t.pos}%`, background: "var(--c-blue-3)"'), p);
    }
  });
});
