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

import {
  LEAN_WORD,
  THEME_LEAN_FULL,
  THEME_LEAN_SOFT_MAX,
  THEME_USUAL_BAND,
  THEME_USUAL_Z,
  themeLean,
  themeTip,
  usualBand,
  usualShift,
} from "../app/kadera/theme-vs-usual.ts";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

// AI반도체(2026-09-30 미장): 낙관 126 · 비관 59 → 평활 전 비율 68%(툴팁 · 판정 · 막대가 쓰는 값), 평소 80%
const AI_SEMI = { pos: 67, usual: 80, positive: 126, negative: 59 };

describe("themeTip", () => {
  it("평소보다 낮으면 '덜 낙관적' — 낙관이 과반이어도 '비관'이라 하지 않는다", () => {
    assert.equal(themeTip(AI_SEMI), "평소보다 덜 낙관적입니다 · 낙관 68% (평소 80%)");
  });

  it("평소보다 높으면 '더 낙관적'", () => {
    assert.equal(
      themeTip({ pos: 88, usual: 80, positive: 440, negative: 60 }),
      "평소보다 더 낙관적입니다 · 낙관 88% (평소 80%)",
    );
  });

  it("글이 적으면 평소와 똑같은 비율이 '덜 낙관적'으로 나오지 않는다", () => {
    // 16:4 = 80%. 평활값은 70 이라 예전엔 '덜 낙관적'이었고, 그 뒤엔 '비슷 · 낙관 70%'로 숫자와 말이 어긋났다(2026-10-04).
    assert.equal(
      themeTip({ pos: 70, usual: 80, positive: 16, negative: 4 }),
      "평소와 비슷합니다 · 낙관 80% (평소 80%)",
    );
  });

  it("평소가 없으면 낙관도만 말한다", () => {
    assert.equal(themeTip({ ...AI_SEMI, usual: null }), "낙관 68% · 평소 기록이 아직 적습니다");
  });

  it("낙관·비관 글이 없으면 낙관도도 판정도 말하지 않는다 — 평활값 50 을 '평소와 비슷'으로 적지 않는다", () => {
    // 하한이 없어져(2026-10-06, lib/theme-rows.ts) 중립 글만 있는 테마도 줄에 선다.
    assert.equal(themeTip({ pos: 50, usual: 80, positive: 0, negative: 0 }), "낙관·비관으로 읽힌 글이 없습니다");
    assert.equal(themeTip({ pos: 50, usual: null, positive: 0, negative: 0 }), "낙관·비관으로 읽힌 글이 없습니다");
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

  it("'평소 수준' 줄도 방향대로 뻗는다 — 길이는 판정 폭에 다가간 만큼", () => {
    // 2026-10-06 국장 인터넷·플랫폼: 11:2 = 84.6% vs 평소 73 → +11.6, 13건이라 판정 폭 24.6 → 0.47 × 12.5 × 0.9
    assert.deepEqual(themeLean({ pos: 70, usual: 73, positive: 11, negative: 2 }), { shift: "same", side: "right", width: 5.3 });
    // 2차전지 13:4 = 76.5% vs 84 → −7.5, 판정 폭 17.8 → 왼쪽 4.8
    assert.deepEqual(themeLean({ pos: 67, usual: 84, positive: 13, negative: 4 }), { shift: "same", side: "left", width: 4.8 });
  });

  it("옅은 막대는 어떤 진한 막대보다도 짧다 — 같은 날 '더 낙관'보다 긴 '평소 수준'이 서지 않는다", () => {
    for (const market of ["kr", "us"] as const) {
      const strongMin = (THEME_USUAL_BAND / THEME_LEAN_FULL[market]) * 50;
      for (const n of [1, 2, 5, 13, 20, 60, 200, 1000]) {
        for (const usual of [55, 73, 81, 90]) {
          for (let pos = 0; pos <= n; pos++) {
            const lean = themeLean({ pos: 0, usual, positive: pos, negative: n - pos }, market)!;
            if (lean.shift === "same") assert.ok(lean.width <= strongMin * THEME_LEAN_SOFT_MAX + 0.05, `${market} ${pos}/${n} vs ${usual}: ${lean.width}`);
            else assert.ok(lean.width >= strongMin - 0.05, `${market} ${pos}/${n} vs ${usual}: ${lean.width}`);
          }
        }
      }
    }
  });

  it("글이 1~2건이면 옅은 막대도 짧다 — 차이 그대로 그리면 트랙 끝까지 뻗었다(09-26 인터넷·플랫폼 1건)", () => {
    const lean = themeLean({ pos: 45, usual: 74, positive: 0, negative: 1 })!;
    assert.equal(lean.shift, "same");
    assert.ok(lean.width < 12.5, String(lean.width));
  });

  it("미장은 눈금이 30 — 같은 차이가 국장보다 짧다", () => {
    assert.equal(themeLean(AI_SEMI, "us")!.width, 19.8); // 11.9 / 30 × 50
    assert.equal(themeLean(AI_SEMI)!.width, 29.7); // 기본은 국장(20)
  });

  it("판정 폭은 판정(usualShift)과 같은 값이다", () => {
    assert.ok(Math.abs(usualBand(185, 80) - 5.88) < 0.01); // AI반도체 185건 · 평소 80 → 폭 5.9(usualShift 주석)
    assert.equal(usualBand(10000, 80), THEME_USUAL_BAND);
  });

  it("'평소 수준' 줄은 옅은 색으로 그린다 — 눈금만 남기던 조건(shift !== same)으로 되돌리지 않는다", () => {
    const src = read("app/kadera/parts.tsx");
    assert.ok(!src.includes('lean.shift !== "same" && fill'), "평소 수준 줄의 막대가 다시 빠졌다");
    assert.ok(src.includes("var(--tx-lean-up-soft)") && src.includes("var(--tx-lean-down-soft)"));
    const css = read("app/styles/tx.css");
    assert.match(css, /--tx-lean-up-soft: color-mix\(in srgb, var\(--c-warm-2\)/);
    assert.match(css, /--tx-lean-down-soft: color-mix\(in srgb, var\(--c-blue-2\)/);
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
      assert.ok(src.includes(p.includes("/us/") ? '<ThemeVsUsualRows themes={sentiment.byTheme} market="us" />' : "<ThemeVsUsualRows themes={sentiment.byTheme} />"), p);
      assert.ok(!src.includes("width: `${t.pos}%`"), p);
    }
  });
});
