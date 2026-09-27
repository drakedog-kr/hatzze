/**
 * lib/next-up-slot.ts — 시장 브리핑 히어로 바닥 첫 칩이 시각마다 어디로 보내나.
 * 돌리는 법: `npm test`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { kstParts, pickNextUpSlot } from "../lib/next-up-slot.ts";

/** 한국 시각 "2026-09-28 08:10" → UTC 에포크 ms. */
const kst = (s: string) => Date.parse(s.replace(" ", "T") + ":00+09:00");

describe("kstParts", () => {
  it("UTC 자정 넘어도 한국 날짜·요일로 센다", () => {
    // 2026-09-27(일) 23:30 UTC = 2026-09-28(월) 08:30 KST
    assert.deepEqual(kstParts(Date.parse("2026-09-27T23:30:00Z")), { date: "2026-09-28", dow: 1, min: 8 * 60 + 30 });
  });
});

describe("pickNextUpSlot", () => {
  const mon = { previewDate: "2026-09-28" };

  it("평일 06:30 부터 개장 뒤 한 시간(10:00 전)까지 그날 미리보기", () => {
    assert.equal(pickNextUpSlot(kst("2026-09-28 06:30"), mon), "preview");
    assert.equal(pickNextUpSlot(kst("2026-09-28 09:00"), mon), "preview");
    assert.equal(pickNextUpSlot(kst("2026-09-28 09:59"), mon), "preview");
  });

  it("그 밖엔 카더라 — 06:30 전 · 10:00 부터 · 저녁", () => {
    for (const t of ["2026-09-28 06:29", "2026-09-28 10:00", "2026-09-28 15:30", "2026-09-28 21:00"]) {
      assert.equal(pickNextUpSlot(kst(t), mon), "kadera", t);
    }
  });

  it("미리보기가 아직 안 만들어졌거나 쓸 수 없으면 카더라", () => {
    assert.equal(pickNextUpSlot(kst("2026-09-28 06:40"), { previewDate: "2026-09-26" }), "kadera");
    assert.equal(pickNextUpSlot(kst("2026-09-28 08:00"), { previewDate: null }), "kadera");
  });

  it("주말엔 미리보기가 없다", () => {
    assert.equal(pickNextUpSlot(kst("2026-09-26 08:00"), { previewDate: "2026-09-26" }), "kadera");
  });
});
