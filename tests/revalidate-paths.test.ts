/**
 * lib/revalidate-paths.ts 의 순수 함수. `/api/revalidate` 가 본문에서 경로를 고르는
 * 자리라, 여기가 헐거우면 잠금 뒤에서 아무 경로나 비울 수 있고 빡빡하면 파이프라인이
 * 조용히 아무것도 안 비운다. 돌리는 법: `npm test`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MAX_PATHS, MAX_ROUTES, parseRevalidatePaths } from "../lib/revalidate-paths.ts";

describe("parseRevalidatePaths", () => {
  it("본문이 없으면 빈 배열이다 — 전부 비우라는 뜻", () => {
    assert.deepEqual(parseRevalidatePaths(undefined), { paths: [], routes: [] });
    assert.deepEqual(parseRevalidatePaths(null), { paths: [], routes: [] });
    assert.deepEqual(parseRevalidatePaths({}), { paths: [], routes: [] });
  });

  it("파이프라인이 찍어 부르는 꼴을 그대로 받는다", () => {
    assert.deepEqual(parseRevalidatePaths({ paths: ["/kadera", "/kadera/us"] }), {
      paths: ["/kadera", "/kadera/us"],
      routes: [],
    });
  });

  it("빈 목록은 전부 비우기와 같다", () => {
    assert.deepEqual(parseRevalidatePaths({ paths: [] }), { paths: [], routes: [] });
  });

  it("경로가 아닌 것은 물린다", () => {
    for (const bad of ["kadera", "https://evil.example/kadera", ""]) {
      assert.ok("reason" in parseRevalidatePaths({ paths: [bad] }), bad);
    }
  });

  it("프로토콜 상대 주소는 경로처럼 생겼어도 물린다", () => {
    assert.ok("reason" in parseRevalidatePaths({ paths: ["//evil.example/kadera"] }));
  });

  it("paths 의 동적 구간은 물린다 — routes 로 보내야 두 번째 인자가 붙는다", () => {
    assert.ok("reason" in parseRevalidatePaths({ paths: ["/stock/[code]"] }));
  });

  it("인자가 하나로 뭉쳐 온 꼴을 물린다 — 앞이 / 라 그냥 지나가던 자리", () => {
    assert.ok("reason" in parseRevalidatePaths({ paths: ["/kadera /kadera/us"] }));
    assert.ok("reason" in parseRevalidatePaths({ paths: ["/kadera\n"] }));
  });

  it("너무 긴 경로와 너무 많은 경로를 물린다", () => {
    assert.ok("reason" in parseRevalidatePaths({ paths: [`/${"a".repeat(1024)}`] }));
    assert.ok("reason" in parseRevalidatePaths({ paths: Array(MAX_PATHS + 1).fill("/kadera") }));
  });

  it("테마 스텝이 부르는 꼴을 그대로 받는다 — 목록은 paths, 상세 42장은 routes", () => {
    assert.deepEqual(
      parseRevalidatePaths({ paths: ["/theme", "/theme/us"], routes: ["/theme/[theme]", "/theme/us/[theme]"] }),
      { paths: ["/theme", "/theme/us"], routes: ["/theme/[theme]", "/theme/us/[theme]"] },
    );
  });

  it("routes 만 와도 전부 비우기가 아니다", () => {
    assert.deepEqual(parseRevalidatePaths({ routes: ["/theme/[theme]"] }), { paths: [], routes: ["/theme/[theme]"] });
  });

  it("동적 칸이 없는 라우트는 물린다 — literal 경로는 paths 로", () => {
    assert.ok("reason" in parseRevalidatePaths({ routes: ["/theme"] }));
    assert.ok("reason" in parseRevalidatePaths({ routes: ["/theme/us"] }));
  });

  it("라우트 꼴이 아닌 것을 물린다", () => {
    for (const bad of ["theme/[theme]", "//evil.example/[x]", "/theme/[theme] /x", "/theme/[...slug]", "/theme/[[theme]]", "/theme//[theme]", "/theme/[the me]"]) {
      assert.ok("reason" in parseRevalidatePaths({ routes: [bad] }), bad);
    }
  });

  it("라우트가 너무 많거나 꼴이 틀리면 물린다", () => {
    assert.ok("reason" in parseRevalidatePaths({ routes: Array(MAX_ROUTES + 1).fill("/theme/[theme]") }));
    assert.ok("reason" in parseRevalidatePaths({ routes: "/theme/[theme]" }));
    assert.ok("reason" in parseRevalidatePaths({ routes: [1] }));
  });

  it("꼴이 틀린 본문을 물린다", () => {
    assert.ok("reason" in parseRevalidatePaths({ paths: "/kadera" }));
    assert.ok("reason" in parseRevalidatePaths({ paths: [1] }));
    assert.ok("reason" in parseRevalidatePaths(["/kadera"]));
    assert.ok("reason" in parseRevalidatePaths("/kadera"));
  });
});
