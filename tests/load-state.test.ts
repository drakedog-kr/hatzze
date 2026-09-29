import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  LOAD_FAILED,
  LoadFailedError,
  assertLoaded,
  clearLoadFailure,
  isLoadFailed,
  noteLoadFailure,
  withScopedLoadFailures,
} from "../lib/load-state.ts";

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

/*
 * 홈 히어로 칩(app/home/spotlight-data.ts)은 곁가지라 조회가 깨져도 그 칩만 빠져야 하는데, 실패는
 * supabase-server 의 fetch 자리에서 적혀 칩이 폴백을 돌려줘도 홈 전체가 던졌다. 그렇다고 실패를
 * 안 적으면 에러를 삼키는 로더(getPreview 의 지난 날짜 폴백 등)가 만든 틀린 칩이 사본에 담긴다.
 * 그래서 칩마다 제 목록에 모으고(withScopedLoadFailures) 목록이 비지 않은 칩을 뺀다.
 * 칩은 본 조회와 같은 Promise.all 로 나란히 돌므로 **나란히 도는 다른 일의 실패와 섞이면 안 된다**.
 */
describe("withScopedLoadFailures", () => {
  const tick = () => new Promise<void>((r) => setTimeout(r, 1));

  it("그 안에서 시작한 조회의 실패를 모아 돌려준다 — await·타이머를 건너도 따라간다", async () => {
    const { value, failed } = await withScopedLoadFailures(async () => {
      await tick();
      noteLoadFailure("GET /rest/v1/kr_preview_day", "rest/v1/kr_preview_day 500");
      return "폴백 값";
    });
    assert.equal(value, "폴백 값");
    assert.deepEqual(failed, ["rest/v1/kr_preview_day 500"]);
  });
  it("같은 조회를 다시 시도해 성공하면 그 실패는 지워진다", async () => {
    const { failed } = await withScopedLoadFailures(async () => {
      noteLoadFailure("GET /a", "a 503");
      await tick();
      clearLoadFailure("GET /a");
    });
    assert.deepEqual(failed, []);
  });
  it("나란히 도는 자리끼리 실패가 섞이지 않는다", async () => {
    const [a, b, c] = await Promise.all([
      withScopedLoadFailures(async () => {
        await tick();
        noteLoadFailure("GET /a", "a 500");
      }),
      withScopedLoadFailures(async () => {
        await tick();
        noteLoadFailure("GET /b", "b 500");
      }),
      withScopedLoadFailures(async () => {
        await tick();
      }),
    ]);
    assert.deepEqual(a.failed, ["a 500"]);
    assert.deepEqual(b.failed, ["b 500"]);
    assert.deepEqual(c.failed, []);
  });
  it("예외는 그대로 넘긴다", async () => {
    await assert.rejects(
      withScopedLoadFailures(async () => {
        throw new Error("x");
      }),
      /x/,
    );
  });
});
