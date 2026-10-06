/**
 * lib/theme-rows.ts — 카더라 히어로 '인기 테마' 줄에 세울 테마(국장·미장).
 *
 * 표본 하한이 없다(2026-10-06). 건수가 적은 연휴 끝에도 넷을 채운다. 국장 총평(generate_telegram_narratives.top_themes)이
 * 바로 옆에서 같은 테마를 말하므로 고르는 순서는 data-pipeline/tests/test_theme_rows.py 의 PICK_CASE 표로 묶는다.
 * 돌리는 법: `npm test`.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { pickThemeRows } from "../lib/theme-rows.ts";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
type Tally = { pos: number; neg: number; total: number };
const names = (rows: [string, Tally][]) => rows.map(([s]) => s);

describe("pickThemeRows", () => {
  it("총평 top_themes(test_theme_rows.py PICK_CASE)와 같은 넷을 고른다", () => {
    const py = read("data-pipeline/tests/test_theme_rows.py");
    const table = py.slice(py.indexOf("PICK_CASE = ["), py.indexOf("]\n", py.indexOf("PICK_CASE = [")));
    const rows = [...table.matchAll(/\("([^"]+)", (\d+), (\d+), (\d+)\)/g)];
    assert.ok(rows.length >= 8, "파이썬 표를 못 읽었다");
    const want = [...(py.match(/^PICK_WANT = \[(.*)\]$/m)?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    assert.equal(want.length, 4, "파이썬 기대값을 못 읽었다");
    const entries: [string, Tally][] = [["overall", { pos: 900, neg: 100, total: 2453 }]];
    for (const [, name, total, pos, neg] of rows) entries.push([name, { pos: Number(pos), neg: Number(neg), total: Number(total) }]);
    assert.deepEqual(names(pickThemeRows(entries, 4)), want);
  });

  it("건수가 적어도 넷을 채운다 — 예전 하한(낙관+비관 20건)이면 반도체 한 줄이었다", () => {
    const rows = pickThemeRows(
      [
        ["반도체", { pos: 95, neg: 25, total: 203 }],
        ["인터넷·플랫폼", { pos: 11, neg: 2, total: 32 }],
        ["조선", { pos: 12, neg: 5, total: 20 }],
        ["바이오", { pos: 12, neg: 0, total: 19 }],
        ["원전", { pos: 6, neg: 2, total: 14 }],
      ],
      4,
    );
    assert.deepEqual(names(rows), ["반도체", "인터넷·플랫폼", "조선", "바이오"]);
  });

  it("동점은 낙관+비관이 많은 쪽, 그다음 이름 순", () => {
    const t = { pos: 3, neg: 3, total: 10 };
    const rows = pickThemeRows(
      [["조선", t], ["방산", t], ["원전", t], ["금융", t], ["건설·부동산", t]],
      4,
    );
    assert.deepEqual(names(rows), ["건설·부동산", "금융", "방산", "원전"]);
  });

  it("overall 과 언급 0건인 테마는 세우지 않는다", () => {
    const rows = pickThemeRows(
      [
        ["overall", { pos: 1, neg: 1, total: 99 }],
        ["반도체", { pos: 0, neg: 0, total: 5 }],
        ["통신", { pos: 0, neg: 0, total: 0 }],
      ],
      4,
    );
    assert.deepEqual(names(rows), ["반도체"]);
  });

  it("국장·미장 데이터층이 이 함수로 고른다 — 하한 필터로 되돌리지 않는다", () => {
    for (const p of ["lib/telegram-data.ts", "lib/us-telegram-data.ts"]) {
      const src = read(p);
      assert.match(src, /pickThemeRows\(\w+, (US_)?THEME_TOP_N\)/, p);
      assert.doesNotMatch(src, /THEME_MIN_DECIDED/, `${p} 에 테마 하한이 돌아왔다`); // 평소의 하한(THEME_USUAL_MIN_DECIDED)은 다른 값이다
    }
  });
});
