import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { LOAD_FAILED, isLoadFailed } from "../lib/load-state.ts";

describe("isLoadFailed", () => {
  it("실패 표시만 참이고, 빈 배열·null 은 실패가 아니다", () => {
    assert.equal(isLoadFailed(LOAD_FAILED), true);
    assert.equal(isLoadFailed([]), false);
    assert.equal(isLoadFailed(null), false);
    assert.equal(isLoadFailed("__other__"), false);
  });
});
