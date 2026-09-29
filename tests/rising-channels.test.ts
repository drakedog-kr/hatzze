/**
 * lib/rising-channels.ts — 카더라 '뜨는 채널'(최근 7일 · 7일 증감). 증감은 **자료의 최신 스냅샷일과 그 7일 전**
 * 사이를 잰다. 조회가 넉넉히(8~9일) 받아 와도 8·9일짜리 증감이 '7일'로 찍히면 안 된다. 돌리는 법: `npm test`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { RISING_WINDOW_DAYS, channelDeltas, type ChannelSnapshot } from "../lib/rising-channels.ts";

/** from..to(포함) KST 날짜마다 채널 a 는 하루 +100, b 는 +200 명. */
function snapshots(from: string, to: string): ChannelSnapshot[] {
  const rows: ChannelSnapshot[] = [];
  const d = new Date(`${from}T00:00:00Z`);
  for (let i = 0; d.toISOString().slice(0, 10) <= to; i++, d.setUTCDate(d.getUTCDate() + 1)) {
    const date = d.toISOString().slice(0, 10);
    rows.push({ channel_handle: "a", date, subscriber_count: 10_000 + 100 * i });
    rows.push({ channel_handle: "b", date, subscriber_count: 20_000 + 200 * i });
  }
  return rows;
}
const deltaOf = (r: ReturnType<typeof channelDeltas>) => Object.fromEntries(r.deltas.map((x) => [x.handle, x.delta]));

describe("channelDeltas", () => {
  it("창이 7일이다", () => assert.equal(RISING_WINDOW_DAYS, 7));
  it("열흘치를 받아도 최신일과 7일 전 사이만 잰다", () => {
    // 옛 조회(UTC 날짜 8일 전 이상)가 09-29 07:00 KST 에 돌려주던 모양 — 09-20..09-29, 9일 구간.
    const r = channelDeltas(snapshots("2026-09-20", "2026-09-29"));
    assert.deepEqual(deltaOf(r), { a: 700, b: 1400 });
    assert.equal(r.spanDays, 7);
  });
  it("오늘 스냅샷 전(새벽)에는 어제를 끝으로 7일을 잰다", () => {
    const r = channelDeltas(snapshots("2026-09-20", "2026-09-28"));
    assert.deepEqual(deltaOf(r), { a: 700, b: 1400 });
    assert.equal(r.spanDays, 7);
  });
  it("축적이 7일에 못 미치면 쌓인 만큼만 재고 그 구간을 알린다", () => {
    const r = channelDeltas(snapshots("2026-09-26", "2026-09-29"));
    assert.deepEqual(deltaOf(r), { a: 300, b: 600 });
    assert.equal(r.spanDays, 3);
  });
  it("스냅샷이 하나뿐인 채널·구독자 수가 빈 행은 뺀다", () => {
    const rows: ChannelSnapshot[] = [
      ...snapshots("2026-09-22", "2026-09-29"),
      { channel_handle: "c", date: "2026-09-29", subscriber_count: 500 },
      { channel_handle: "d", date: "2026-09-22", subscriber_count: null },
      { channel_handle: "d", date: "2026-09-29", subscriber_count: 900 },
    ];
    assert.deepEqual(deltaOf(channelDeltas(rows)), { a: 700, b: 1400 });
  });
});
