/**
 * lib/app-path.ts — 셸이 읽는 경로를 한 꼴로. Vercel ISR 이 홈을 "/index" 로 다시 그려
 * 하이드레이션이 어긋났던 자리다(React #418). 돌리는 법: `npm test`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { appPath } from "../lib/app-path.ts";

describe("appPath", () => {
  it("홈을 /index 로 받으면 / 로 되돌린다", () => {
    assert.equal(appPath("/index"), "/");
  });
  it("없는 값은 / 로 본다", () => {
    assert.equal(appPath(null), "/");
    assert.equal(appPath(undefined), "/");
    assert.equal(appPath(""), "/");
  });
  it("다른 경로는 그대로 둔다", () => {
    for (const p of ["/", "/kadera", "/kadera/us", "/theme/semiconductor", "/stock/005930", "/daily/2026-09-23", "/index-fund"]) {
      assert.equal(appPath(p), p);
    }
  });
});
