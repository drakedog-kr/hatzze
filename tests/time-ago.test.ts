/**
 * app/kadera/time-ago.ts. 국장·미장 카더라의 "3분 전"이 이 하나를 본다. 서버가 사본을
 * 만들 때와 브라우저가 다시 셀 때 `now` 가 다르므로, 같은 글이 시각에 따라 어떻게
 * 적히는지를 고정해 둔다. 돌리는 법: `npm test`.
 *
 * 아래 timeAgoInitial 은 서버 사본이 쓰는 정시 기준이다. 이게 무너지면 카더라 페이지 사본이
 * 5분마다 통째로 다시 저장된다(2026-09-19 · ISR 쓰기 요금의 거의 전부였다). 같은 시간 안에서는
 * 어느 순간에 그려도 글자가 같아야 한다.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { hourFloor, timeAgo, timeAgoInitial } from "../app/kadera/time-ago.ts";

const posted = "2026-09-18T09:00:00+09:00";
const at = (min: number) => new Date(posted).getTime() + min * 60_000;

describe("timeAgo", () => {
  it("1분 미만도 '1분 전'으로 적는다(0분 전·음수 없음)", () => {
    assert.equal(timeAgo(posted, at(0)), "1분 전");
    assert.equal(timeAgo(posted, at(0.5)), "1분 전");
  });
  it("분 → 시간 → 일로 올라간다", () => {
    assert.equal(timeAgo(posted, at(3)), "3분 전");
    assert.equal(timeAgo(posted, at(59)), "59분 전");
    assert.equal(timeAgo(posted, at(60)), "1시간 전");
    assert.equal(timeAgo(posted, at(23 * 60 + 59)), "23시간 전");
    assert.equal(timeAgo(posted, at(24 * 60)), "1일 전");
    assert.equal(timeAgo(posted, at(7 * 24 * 60)), "7일 전");
  });
  it("사본이 묵으면 같은 글의 문장이 달라진다 — 브라우저가 다시 세는 이유", () => {
    assert.equal(timeAgo(posted, at(3)), "3분 전");
    assert.equal(timeAgo(posted, at(8)), "8분 전");
  });
});

const T = Date.UTC(2026, 8, 19, 6, 23, 45); // 2026-09-19 06:23:45Z = 15:23:45 KST
const ago = (ms: number) => new Date(T - ms).toISOString();

describe("hourFloor", () => {
  it("정시로 내린다", () => {
    assert.equal(hourFloor(T), Date.UTC(2026, 8, 19, 6, 0, 0));
    assert.equal(hourFloor(Date.UTC(2026, 8, 19, 6, 0, 0)), Date.UTC(2026, 8, 19, 6, 0, 0));
    assert.equal(hourFloor(Date.UTC(2026, 8, 19, 6, 59, 59, 999)), Date.UTC(2026, 8, 19, 6, 0, 0));
  });
});

describe("timeAgoInitial", () => {
  it("같은 시간 안에서는 어느 순간에 그려도 글자가 같다", () => {
    const written = ago(11 * 3_600_000 + 41 * 60_000); // 15:23 기준 11시간 41분 전
    const hour = hourFloor(T);
    const labels = new Set<string>();
    for (let m = 0; m < 60; m++) labels.add(timeAgoInitial(written, hour + m * 60_000 + 17_000));
    assert.equal(labels.size, 1);
  });

  it("정시 기준이라 지금 기준과 한 칸까지 다를 수 있고, 시간이 넘어가야 바뀐다", () => {
    const written = ago(11 * 3_600_000 + 41 * 60_000);
    assert.equal(timeAgo(written, T), "11시간 전");
    assert.equal(timeAgoInitial(written, T), "11시간 전"); // 06:00Z 기준 11시간 18분
    assert.equal(timeAgoInitial(written, T + 36 * 60_000), "11시간 전"); // 06:59:45Z 아직 같은 시간
    assert.equal(timeAgoInitial(written, T + 37 * 60_000), "12시간 전"); // 07:00:45Z 다음 시간
  });

  it("정시보다 뒤에 올라온 글은 1분 전으로 나간다(브라우저가 바로 고친다)", () => {
    assert.equal(timeAgoInitial(ago(5 * 60_000), T), "1분 전"); // 15:18 게시 · 기준 15:00
  });
});
