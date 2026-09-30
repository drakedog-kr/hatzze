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

import { THEME_USUAL_BAND, THEME_USUAL_Z, themeTip, usualShift } from "../app/kadera/theme-vs-usual.ts";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

// AI반도체(2026-09-30 미장): 낙관 126 · 비관 59 → 화면 낙관도 67%, 평소 80%
const AI_SEMI = { pos: 67, usual: 80, positive: 126, negative: 59 };

describe("themeTip", () => {
  it("평소보다 낮으면 '덜 낙관적' — 낙관이 과반이어도 '비관'이라 하지 않는다", () => {
    assert.equal(themeTip(AI_SEMI), "평소보다 덜 낙관적이에요 · 낙관 67% (평소 80%)");
  });

  it("평소보다 높으면 '더 낙관적'", () => {
    assert.equal(
      themeTip({ pos: 88, usual: 80, positive: 440, negative: 60 }),
      "평소보다 더 낙관적이에요 · 낙관 88% (평소 80%)",
    );
  });

  it("글이 적으면 평소와 똑같은 비율이 '덜 낙관적'으로 나오지 않는다", () => {
    // 16:4 = 80%. 평활값은 70 이라 예전엔 '덜 낙관적'이었다.
    assert.equal(
      themeTip({ pos: 70, usual: 80, positive: 16, negative: 4 }),
      "평소와 비슷해요 · 낙관 70% (평소 80%)",
    );
  });

  it("평소가 없으면 낙관도만 말한다", () => {
    assert.equal(themeTip({ ...AI_SEMI, usual: null }), "낙관 67% · 평소 기록이 아직 적어요");
  });
});

describe("usualShift", () => {
  it("같은 12 차이도 표본이 작으면 '비슷'", () => {
    assert.equal(usualShift(68, 32, 80), "down"); // 100건 — 폭 8
    assert.equal(usualShift(17, 8, 80), "same"); // 25건 — 폭 16
  });

  it("총평 usual_label(test_theme_usual.py USUAL_CASES)과 같은 답을 낸다", () => {
    const py = read("data-pipeline/tests/test_theme_usual.py");
    const table = py.slice(py.indexOf("USUAL_CASES = ["), py.indexOf("]\n", py.indexOf("USUAL_CASES = [")));
    const rows = [...table.matchAll(/\((\d+), (\d+), (\d+), "([^"]+)"\)/g)];
    assert.ok(rows.length >= 8, "파이썬 표를 못 읽었다");
    const want = { "평소보다 낙관 쪽": "up", "평소보다 비관 쪽": "down", "평소와 비슷": "same" } as const;
    for (const [, pos, neg, usual, label] of rows) {
      assert.equal(usualShift(Number(pos), Number(neg), Number(usual)), want[label as keyof typeof want], `${pos}:${neg} vs ${usual}`);
    }
  });

  it("폭 상수가 총평(generate_telegram_narratives.py)과 같다", () => {
    const src = read("data-pipeline/scripts/generate_telegram_narratives.py");
    assert.equal(Number(src.match(/^THEME_USUAL_BAND = (\d+)/m)?.[1]), THEME_USUAL_BAND);
    assert.equal(Number(src.match(/^THEME_USUAL_Z = (\d+)/m)?.[1]), THEME_USUAL_Z);
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
