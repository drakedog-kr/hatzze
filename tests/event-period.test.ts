/**
 * lib/event-period.ts — 종목·테마 화면의 '다가오는 일정'이 달·분기·해 단위 일정을 언제까지 두나.
 * 그 일정은 기간 **첫날**로 적혀 있어(extract_telegram_events.py SYSTEM) `event_date >= 오늘` 로 거르면
 * 09-29 에 "9월 중"·"3분기"·"2026년"이 안 보이고 "10월 중"은 10-02 에 사라졌다. 돌리는 법: `npm test`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { byPeriodEnd, periodEnd, periodFloor, stillAhead } from "../lib/event-period.ts";

describe("periodEnd", () => {
  it("정밀도가 가리키는 기간의 마지막 날", () => {
    assert.equal(periodEnd("2026-09-20", "day"), "2026-09-20");
    assert.equal(periodEnd("2026-09-01", "month"), "2026-09-30");
    assert.equal(periodEnd("2026-02-01", "month"), "2026-02-28");
    assert.equal(periodEnd("2028-02-01", "month"), "2028-02-29");
    assert.equal(periodEnd("2026-12-01", "month"), "2026-12-31");
    assert.equal(periodEnd("2026-07-01", "quarter"), "2026-09-30");
    assert.equal(periodEnd("2026-10-01", "quarter"), "2026-12-31");
    assert.equal(periodEnd("2026-01-01", "year"), "2026-12-31");
  });
});

describe("stillAhead", () => {
  const today = "2026-09-29";
  it("이미 시작했어도 기간이 안 끝났으면 남긴다", () => {
    assert.ok(stillAhead({ date: "2026-09-01", precision: "month" }, today));
    assert.ok(stillAhead({ date: "2026-07-01", precision: "quarter" }, today));
    assert.ok(stillAhead({ date: "2026-01-01", precision: "year" }, today));
    assert.ok(stillAhead({ date: "2026-09-29", precision: "day" }, today));
  });
  it("끝난 기간과 지난 날은 뺀다", () => {
    assert.ok(!stillAhead({ date: "2026-08-01", precision: "month" }, today));
    assert.ok(!stillAhead({ date: "2026-04-01", precision: "quarter" }, today));
    assert.ok(!stillAhead({ date: "2025-01-01", precision: "year" }, today));
    assert.ok(!stillAhead({ date: "2026-09-28", precision: "day" }, today));
  });
  it("조회의 아래 경계는 올해 1월 1일 — 해 단위가 가장 일찍 시작한다", () => {
    assert.equal(periodFloor(today), "2026-01-01");
  });
});

describe("byPeriodEnd", () => {
  it("먼저 끝나는 것부터, 같은 날 끝나면 좁은 것부터, 그다음 채널 많은 순", () => {
    const rows = [
      { date: "2026-01-01", precision: "year" as const, channels: 5 },
      { date: "2026-10-01", precision: "month" as const, channels: 1 },
      { date: "2026-07-01", precision: "quarter" as const, channels: 1 },
      { date: "2026-09-01", precision: "month" as const, channels: 1 },
      { date: "2026-10-05", precision: "day" as const, channels: 1 },
      { date: "2026-09-30", precision: "day" as const, channels: 1 },
      { date: "2026-09-30", precision: "day" as const, channels: 3 },
    ];
    assert.deepEqual(
      [...rows].sort(byPeriodEnd).map((e) => `${e.date}/${e.precision}/${e.channels}`),
      [
        "2026-09-30/day/3",
        "2026-09-30/day/1",
        "2026-09-01/month/1",
        "2026-07-01/quarter/1",
        "2026-10-05/day/1",
        "2026-10-01/month/1",
        "2026-01-01/year/5",
      ],
    );
  });
});
