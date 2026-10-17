/**
 * lib/note-quote-day.ts — 데일리 노트 '언급된 종목'이 글 날짜의 시세를 고르는 규칙. 10월 17일(토) 글에 목요일 등락이 섰다(2026-10-17).
 * 돌리는 법: `npm test`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { liveUsIsNoteSession, shiftDate, takeLiveKr, usCloseBefore } from "../lib/note-quote-day.ts";

describe("shiftDate", () => {
  it("달 경계를 넘는다", () => {
    assert.equal(shiftDate("2026-10-01", -1), "2026-09-30");
    assert.equal(shiftDate("2026-10-17", -14), "2026-10-03");
  });
});

describe("takeLiveKr", () => {
  it("토요일 글: 저장값이 이미 금요일이면 야후 금요일 값으로 안 바꾼다", () => {
    assert.equal(takeLiveKr("2026-10-16", "2026-10-16", "2026-10-17"), false);
  });

  it("토요일 글: 저장값이 목요일에 멈춰 있으면 야후 금요일 값을 쓴다", () => {
    assert.equal(takeLiveKr("2026-10-16", "2026-10-15", "2026-10-17"), true);
  });

  it("어제 글: 오늘 장이 열린 뒤의 야후 값은 안 쓴다", () => {
    assert.equal(takeLiveKr("2026-10-20", "2026-10-16", "2026-10-19"), false);
  });

  it("세션 날짜를 모르면 안 쓴다", () => {
    assert.equal(takeLiveKr(null, "2026-10-15", "2026-10-16"), false);
  });
});

describe("liveUsIsNoteSession", () => {
  it("뉴욕장이 열리기 전(세션이 글 날짜보다 앞)이면 그 장이다", () => {
    assert.equal(liveUsIsNoteSession("2026-10-16", "2026-10-17"), true);
  });

  it("글 날짜의 뉴욕장이 열렸으면 아니다", () => {
    assert.equal(liveUsIsNoteSession("2026-10-19", "2026-10-19"), false);
  });
});

describe("usCloseBefore", () => {
  const bars = [
    { date: "2026-10-13", close: 77.81 },
    { date: "2026-10-14", close: 65.78 },
    { date: "2026-10-15", close: 55.61 },
    { date: "2026-10-16", close: 61.39 },
    { date: "2026-10-19", close: 63.0 },
  ];

  it("글 날짜 전날 이하 마지막 장과 그 앞 장으로 등락률을 낸다", () => {
    const q = usCloseBefore(bars, "2026-10-16");
    assert.equal(q?.date, "2026-10-15");
    assert.equal(q?.price, 55.61);
    assert.ok(Math.abs((q?.changeRate ?? 0) - (55.61 / 65.78 - 1) * 100) < 1e-9);
  });

  it("토요일 · 월요일 글은 금요일 장", () => {
    assert.equal(usCloseBefore(bars, "2026-10-17")?.date, "2026-10-16");
    assert.equal(usCloseBefore(bars, "2026-10-19")?.date, "2026-10-16");
  });

  it("앞 장이 없으면 등락률은 null, 봉이 없으면 null", () => {
    assert.equal(usCloseBefore(bars, "2026-10-14")?.changeRate, null);
    assert.equal(usCloseBefore(bars, "2026-10-13"), null);
  });
});
