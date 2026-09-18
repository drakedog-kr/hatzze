/**
 * app/kadera/time-ago.ts. 국장·미장 카더라의 "3분 전"이 이 하나를 본다. 서버가 사본을
 * 만들 때와 브라우저가 다시 셀 때 `now` 가 다르므로, 같은 글이 시각에 따라 어떻게
 * 적히는지를 고정해 둔다. 돌리는 법: `npm test`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { timeAgo } from "../app/kadera/time-ago.ts";

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
