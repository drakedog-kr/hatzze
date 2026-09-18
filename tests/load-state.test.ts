import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { LOAD_FAILED, LoadFailedError, assertLoaded, isLoadFailed } from "../lib/load-state.ts";

describe("isLoadFailed", () => {
  it("실패 표시만 참이고, 빈 배열·null 은 실패가 아니다", () => {
    assert.equal(isLoadFailed(LOAD_FAILED), true);
    assert.equal(isLoadFailed([]), false);
    assert.equal(isLoadFailed(null), false);
    assert.equal(isLoadFailed("__other__"), false);
  });
});

describe("assertLoaded", () => {
  it("이름 붙인 값 중 실패 표시가 없으면 조용하다", () => {
    assert.doesNotThrow(() => assertLoaded("/x", { a: [], b: null, c: {} }));
    assert.doesNotThrow(() => assertLoaded("/x"));
  });
  it("실패 표시가 하나라도 있으면 어느 것인지 이름을 달아 던진다", () => {
    assert.throws(
      () => assertLoaded("/kadera", { themes: [], sentiment: LOAD_FAILED, why: LOAD_FAILED }),
      (e: unknown) =>
        e instanceof LoadFailedError && e.message.includes("/kadera") && e.message.includes("sentiment, why"),
    );
  });
  // noteLoadFailure 쪽은 React 렌더 안에서만 모인다(React cache 가 렌더 밖에서는 기억을
  // 안 한다). 그 경로는 로컬 빌드에서 Supabase 주소를 틀리게 줘 확인한다(PR 본문).
});
