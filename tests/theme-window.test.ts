/**
 * lib/theme-window.ts — 테마 상세(국장 `/theme/[테마]` · 미장 `/theme/us/[테마]`)의 날짜 창.
 *
 * 히어로의 점유율·순위·증감은 테마 로테이션이 **기준일을 넣은** 사흘로 낸다. 국장 화면은 막대·언급 상위 종목·
 * 총 언급을 기준일을 뺀 사흘(windowBefore)로 세어, 한 칸의 두 숫자가 하루 어긋난 날들을 말했다(#622 에서 찾음).
 * 파이썬 쪽 테마 요약의 창은 data-pipeline/tests/test_theme_brief_window.py 가 같은 예제로 확인한다.
 * 돌리는 법: `npm test`.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { daysEndingAt, themeDetailWindow } from "../lib/theme-window.ts";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("daysEndingAt", () => {
  it("기준일을 포함한 마지막 n 일, 오래된→최신", () => {
    assert.deepEqual(daysEndingAt("2026-09-29", 3), ["2026-09-27", "2026-09-28", "2026-09-29"]);
  });

  it("달·해를 넘긴다", () => {
    assert.deepEqual(daysEndingAt("2026-03-01", 3), ["2026-02-27", "2026-02-28", "2026-03-01"]);
    assert.deepEqual(daysEndingAt("2027-01-01", 2), ["2026-12-31", "2027-01-01"]);
  });
});

describe("themeDetailWindow", () => {
  it("최근 사흘이 기준일로 끝난다 — 히어로 점유율(테마 로테이션)과 같은 날들", () => {
    assert.deepEqual(themeDetailWindow("2026-09-29", 30, 3).recentDays, ["2026-09-27", "2026-09-28", "2026-09-29"]);
  });

  it("추이는 기준일까지 30일, 평소는 그 앞 27일", () => {
    const w = themeDetailWindow("2026-09-29", 30, 3);
    assert.equal(w.trendDays.length, 30);
    assert.equal(w.trendDays[0], "2026-08-31");
    assert.equal(w.trendDays.at(-1), "2026-09-29");
    assert.equal(w.usualDayCount, 27);
  });
});

describe("히어로와 나머지 칸이 같은 사흘", () => {
  it("테마 로테이션의 최근 창은 표에 있는 마지막 날(기준일)까지다", () => {
    // 로테이션이 기준일을 빼게 바뀌면 테마 상세의 창도 같이 바꿔야 한다 — 이 검사가 그 자리를 알린다.
    assert.match(read("lib/telegram-data.ts"), /const recentDates = dates\.slice\(-THEME_RECENT_DAYS\);/);
  });

  for (const p of ["lib/theme-page.ts", "lib/us-theme-page.ts"]) {
    it(`${p} 가 이 창을 쓴다`, () => {
      const src = read(p);
      assert.match(src, /themeDetailWindow\(baseDate, THEME_TREND_DAYS, \w+\)/);
      assert.doesNotMatch(src, /windowBefore\(baseDate, THEME_TREND_DAYS\)/, "기준일을 빼는 창으로 돌아갔다");
    });
  }
});

describe("테마 목록의 열흘 흐름도 기준일까지", () => {
  // 목록 화면은 흐름의 끝 두 칸을 '어제·오늘'로 읽는다('새로 상위에 오른 테마' · '어제까지 5위 안'). 국장이 기준일을
  // 빼서 그 두 칸이 그저께·어제였다. 오늘 뜬 테마는 오늘 보여야 한다(2026-09-29 결정) — 미장 목록은 처음부터 넣었다.
  for (const [p, fn] of [["lib/theme-page.ts", "listThemeOverview"], ["lib/us-theme-page.ts", "listUsThemeOverview"]]) {
    it(`${p} ${fn}`, () => {
      const src = read(p);
      const body = src.slice(src.indexOf(`export async function ${fn}(`));
      const flowQuery = body.slice(0, body.indexOf(".order("));
      assert.match(flowQuery, /\.lte\("date", baseDate\)/, "흐름 조회가 기준일을 넣지 않는다");
    });
  }
});
