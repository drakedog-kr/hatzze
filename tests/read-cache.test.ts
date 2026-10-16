/**
 * lib/read-cache.ts — 화면의 DB 조회 사본을 무기한 · 라우트마다 따로 두는 설정(2026-10-17).
 * 이게 풀리면 파이프라인 도중에 한 페이지 안이 따로따로 바뀐다(lib/supabase-server.ts 머리 주석).
 * 동작은 로컬 프로덕션 빌드로 쟀다 — 시간으로 다시 그려도 DB 를 안 읽고, /kadera 만 비우면 그 라우트만 다시 읽었다.
 * 돌리는 법: `npm test`.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { describe, it } from "node:test";

import { ROUTE_HEADER, readCacheInit, readCacheRevalidate } from "../lib/read-cache.ts";

describe("readCacheInit", () => {
  it("프로덕션 조회 사본은 무기한이다 — 시간으로 만료되면 파이프라인 도중의 DB 가 섞인다", () => {
    assert.equal(readCacheRevalidate("production"), false);
    assert.deepEqual(readCacheInit(undefined, "/kadera", readCacheRevalidate("production")).next, { revalidate: false });
  });

  it("로컬 개발 서버는 예전처럼 한 시간이다 — 무기한이면 로컬 화면이 서버를 다시 띄울 때까지 옛 DB 값이다", () => {
    assert.equal(readCacheRevalidate("development"), 3600);
    assert.equal(readCacheRevalidate(undefined), 3600);
  });

  it("라우트를 머리에 붙여 라우트마다 사본이 갈린다", () => {
    const init = readCacheInit({ headers: { apikey: "k" } }, "/stock/[code]");
    const h = new Headers(init.headers);
    assert.equal(h.get(ROUTE_HEADER), "/stock/[code]");
    assert.equal(h.get("apikey"), "k", "원래 머리를 지우면 안 된다");
  });

  it("라우트를 모르면 머리를 안 붙인다(렌더 밖)", () => {
    assert.equal(new Headers(readCacheInit(undefined, undefined).headers).has(ROUTE_HEADER), false);
  });
});

describe("Next 내부 저장소(지금 그리는 라우트)", () => {
  // lib/supabase-server.ts 가 Next 내부 모듈에서 라우트를 읽는다. Next 판을 올려 이 경로가 사라지면 머리가 안 붙고
  // 사본이 다시 공용이 된다 — 조용히. 그래서 경로와 꼴을 여기서 본다(`route` 칸은 타입 검사가 본다).
  it("모듈이 있고 getStore 를 준다", () => {
    const require = createRequire(import.meta.url);
    const m = require("next/dist/server/app-render/work-async-storage.external") as { workAsyncStorage?: { getStore?: unknown } };
    assert.equal(typeof m.workAsyncStorage?.getStore, "function");
  });
});
