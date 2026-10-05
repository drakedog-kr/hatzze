/** lib/quoted-change.ts — 채널이 적은 미국 종목 등락률을 야후 일봉으로 맞춰 본다(2026-10-04 점검). 돌리는 법: `npm test`. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { verifiedChange, verifiedChangesOnce } from "../lib/quoted-change.ts";

const bars = [
  { date: "2026-09-29", close: 100 },
  { date: "2026-09-30", close: 103 }, // +3%
  { date: "2026-10-01", close: 101 }, // -1.94%
  { date: "2026-10-02", close: 106 }, // +4.95%
];

describe("verifiedChange", () => {
  it("채널 숫자와 가까운 세션의 실제 값을 준다", () => {
    const v = verifiedChange(5, "2026-10-03", bars);
    assert.ok(v !== null && Math.abs(v - 4.95) < 0.01);
  });

  it("맞는 세션이 없으면 비운다(터무니없는 값 · 방향이 반대인 값)", () => {
    assert.equal(verifiedChange(22.1, "2026-10-03", bars), null);
    assert.equal(verifiedChange(-3, "2026-10-03", bars), null);
  });

  it("같은 세션은 종목마다 한 번만 — 가장 이른 글이 가져가고 나머지는 비운다(2026-10-05 점검)", () => {
    const out = verifiedChangesOnce(
      [
        { quoted: 5, date: "2026-10-04" },
        { quoted: 5, date: "2026-10-03" },
        { quoted: -2, date: "2026-10-02" },
      ],
      bars,
    );
    assert.equal(out[0], null);
    assert.ok(out[1] !== null && Math.abs(out[1] - 4.95) < 0.01);
    assert.ok(out[2] !== null && Math.abs(out[2] + 1.94) < 0.01);
  });

  it("앞 날 글이 다음 날 세션을 가져가지 않는다 — 같은 날 세션(그날 밤 개장)은 앞 세션에 후보가 없을 때만", () => {
    const b2 = [
      { date: "2026-09-30", close: 100 },
      { date: "2026-10-01", close: 103.4 }, // +3.40%
      { date: "2026-10-02", close: 106.6054 }, // +3.10%
    ];
    const out = verifiedChangesOnce(
      [
        { quoted: 3.0, date: "2026-10-02" }, // 10/1 세션 이야기
        { quoted: 3.1, date: "2026-10-03" }, // 10/2 세션 이야기
      ],
      b2,
    );
    assert.ok(out[0] !== null && Math.abs(out[0] - 3.4) < 0.01);
    assert.ok(out[1] !== null && Math.abs(out[1] - 3.1) < 0.01);
  });

  it("글 날짜보다 뒤 세션이나 너무 앞 세션은 안 본다", () => {
    assert.equal(verifiedChange(3, "2026-09-29", bars), null);
    assert.equal(verifiedChange(null, "2026-10-03", bars), null);
  });
});
