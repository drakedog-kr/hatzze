/**
 * 카더라 일정 카드(lib/event-noise.ts) — 잡음 공시 거르기 · 날짜당 줄 수. 돌리는 법: `npm test`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";

import { EVENT_NOISE, EVENTS_PER_DAY_CARD, cardEvents } from "../lib/event-noise.ts";

describe("EVENT_NOISE", () => {
  it("발송 쪽(broadcast_digest.py)과 같은 정규식이다", () => {
    const py = readFileSync(new URL("../data-pipeline/common/broadcast_digest.py", import.meta.url), "utf8");
    const m = py.match(/^EVENT_NOISE = re\.compile\(r"(.+)"\)$/m);
    assert.ok(m, "EVENT_NOISE 를 못 찾았다");
    assert.equal(EVENT_NOISE.source, m[1]);
  });
  it("보호예수 해제는 남긴다", () => {
    assert.ok(EVENT_NOISE.test("추가상장(유상증자)"));
    assert.ok(!EVENT_NOISE.test("보호예수 해제"));
  });
});

describe("cardEvents", () => {
  const ev = (date: string, event: string, channels: number) => ({ date, event, channels });
  it("날짜당 줄 수를 자르고 같은 날은 채널 수 순이다", () => {
    const today = "2026-10-15";
    const rows = [
      ev("2026-10-15", "추가상장", 9),
      ev("2026-10-15", "주식소각", 1),
      ev("2026-10-15", "무상증자", 2),
      ev("2026-10-15", "일반 청약", 3),
      ev("2026-10-15", "실적 발표", 4),
      ev("2026-10-16", "자사주 매입 완료", 5),
      ev("2026-10-14", "지난 일정", 9),
    ];
    const got = cardEvents(rows, today, 10);
    assert.deepEqual(got.map((e) => e.event), ["실적 발표", "일반 청약", "무상증자", "자사주 매입 완료"]);
    assert.equal(got.filter((e) => e.date === today).length, EVENTS_PER_DAY_CARD);
    assert.equal(cardEvents(rows, today, 2).length, 2);
  });
});
