/**
 * app/kadera/theme-vs-usual.ts — 카더라 히어로 인기 테마 줄(국장·미장).
 *
 * 줄은 평소 대비 막대이고(2026-10-01), 툴팁 첫마디가 같은 판정을 말로 한다. 국장 총평이
 * 같은 테마를 옆에서 말하므로 판정 폭은 파이썬 usual_label(data-pipeline/tests/test_theme_usual.py)과
 * 같아야 한다. 돌리는 법: `npm test`.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { LEAN_WORD, THEME_USUAL_BAND, THEME_USUAL_Z, themeLean, themeTip, usualShift } from "../app/kadera/theme-vs-usual.ts";

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

describe("themeLean — 평소 대비 막대", () => {
  it("평소보다 낙관이 적으면 왼쪽, 길이는 판정과 같은 평활 전 비율로 잰다", () => {
    // 126/185 = 68.1% → 평소 80 보다 11.9 낮다 → 반쪽(50) 의 11.9/20
    assert.deepEqual(themeLean(AI_SEMI), { shift: "down", side: "left", width: 29.7 });
  });

  it("차이가 THEME_LEAN_FULL 을 넘으면 반쪽 끝까지만", () => {
    // 반도체 9/11 같은 날 — 57:43 vs 평소 79
    assert.deepEqual(themeLean({ pos: 57, usual: 79, positive: 57, negative: 43 }), { shift: "down", side: "left", width: 50 });
  });

  it("평소보다 많으면 오른쪽", () => {
    assert.deepEqual(themeLean({ pos: 94, usual: 88, positive: 470, negative: 30 }), { shift: "up", side: "right", width: 15 });
  });

  it("글이 적어 평활값이 낮아도 평소와 같은 비율이면 막대가 없다 — 평활값으로 재면 왼쪽으로 뻗는다", () => {
    // 16:4 = 80%. 평활값 70 으로 쟀다면 −10 이라 왼쪽 1/4 이 칠해졌다.
    assert.deepEqual(themeLean({ pos: 70, usual: 80, positive: 16, negative: 4 }), { shift: "same", side: "right", width: 0 });
  });

  it("평소가 없으면 막대 없이 '기록 적음'", () => {
    assert.equal(themeLean({ ...AI_SEMI, usual: null }), null);
    assert.equal(LEAN_WORD.none, "기록 적음");
  });

  it("줄 끝의 말은 '비관'이라 하지 않는다 — 낙관 과반 테마가 평소보다 낮을 뿐인 날이 대부분이다", () => {
    for (const w of Object.values(LEAN_WORD)) assert.ok(!w.includes("비관"), w);
  });
});

describe("테마 줄", () => {
  it("국장·미장 모두 같은 평소 대비 막대를 쓴다 — 낙관도로 나누는 두 색 막대로 되돌리지 않는다", () => {
    for (const p of ["app/kadera/page.tsx", "app/kadera/us/page.tsx"]) {
      const src = read(p);
      // v2 국장 카더라(2026-10-02 시제품)는 여론 패널에서 테마별 막대를 아예 뺐다 — 그리면 이 부품이어야 한다.
      if (p === "app/kadera/us/page.tsx" || src.includes("ThemeVsUsualRows")) {
        assert.ok(src.includes("<ThemeVsUsualRows themes={sentiment.byTheme} />"), p);
      }
      assert.ok(!src.includes("width: `${t.pos}%`"), p);
    }
  });
});
