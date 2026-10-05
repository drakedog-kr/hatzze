/**
 * lib/insider-trend.ts — 미장 종목 상세의 카더라 언급 추이가 **언급 표의 가장 최근 날**에서 끝나는 규칙.
 * 언급 표는 언급된 (날짜, 종목)만 적는다. 종목의 마지막 행에서 끝냈더니 몇 주 전에 마지막으로
 * 오른 종목의 그날 급등이 맨 오른쪽 막대가 되고 "40회 언급"으로 읽혔다(그 뒤 0 인 날이 잘렸다).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { mentionTrend } from "../lib/insider-trend.ts";

describe("mentionTrend", () => {
  it("언급이 끊긴 종목도 표의 가장 최근 날까지 0 으로 메운다", () => {
    const r = mentionTrend([{ date: "2026-09-03", mentions: 40, channels: 9 }], "2026-09-28", 40);
    assert.equal(r.trend.length, 40);
    assert.deepEqual(r.trend[39], { date: "2026-09-28", mentions: 0, channels: 0 });
    assert.deepEqual(r.today, { date: "2026-09-28", mentions: 0, channels: 0 });
    assert.equal(r.date, "2026-09-28");
    // 9/3 급등은 지워지지 않고 제자리(끝에서 26번째)에 남는다.
    assert.deepEqual(r.trend[39 - 25], { date: "2026-09-03", mentions: 40, channels: 9 });
  });

  it("가장 최근 날에 언급이 있으면 그날 값이 오늘이다", () => {
    const r = mentionTrend(
      [
        { date: "2026-09-27", mentions: 3, channels: 2 },
        { date: "2026-09-28", mentions: 7, channels: 4 },
      ],
      "2026-09-28",
      5,
    );
    assert.deepEqual(
      r.trend.map((p) => p.mentions),
      [0, 0, 0, 3, 7],
    );
    assert.equal(r.today?.mentions, 7);
    assert.equal(r.today?.channels, 4);
  });

  it("표의 최신 날을 못 읽었으면(null) 종목의 마지막 날로 물러난다", () => {
    const r = mentionTrend([{ date: "2026-09-03", mentions: 40, channels: 9 }], null, 3);
    assert.equal(r.date, "2026-09-03");
    assert.equal(r.today?.mentions, 40);
  });

  it("한 번도 언급되지 않았으면 빈 추이다(화면이 '아직 잡힌 적이 없다'고 적는다)", () => {
    assert.deepEqual(mentionTrend([], "2026-09-28", 40), { trend: [], today: null, date: null, partial: false });
  });

  it("끝점이 오늘(아직 안 끝난 날)이면 머리 숫자는 전날 — 아침 실행의 반나절치를 '하루 언급'으로 적지 않는다", () => {
    const rows = [
      { date: "2026-10-03", mentions: 46, channels: 20 },
      { date: "2026-10-04", mentions: 2, channels: 2 },
    ];
    const r = mentionTrend(rows, "2026-10-04", 3, "2026-10-04");
    assert.equal(r.partial, true);
    assert.equal(r.date, "2026-10-03");
    assert.equal(r.today?.mentions, 46);
    // 막대는 그대로 사흘(오늘 칸 포함) — 화면이 마지막 칸을 옅게 그린다.
    assert.deepEqual(r.trend.map((p) => p.mentions), [0, 46, 2]);
    // 끝점이 어제면 그대로.
    assert.equal(mentionTrend(rows, "2026-10-04", 3, "2026-10-05").partial, false);
  });
});
