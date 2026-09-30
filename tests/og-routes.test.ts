/**
 * 공유 카드 라우트의 두 가지 설정 — 색인 제외 헤더(X-Robots-Tag: noindex)와 폰트 번들 — 이 **카드 파일 전부**에 닿는가.
 * 둘 다 빠뜨려도 화면은 멀쩡해서 티가 안 나는 자리다(next.config.ts 주석). 돌리는 법: `npm test`.
 */
import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative, sep } from "node:path";
import { describe, it } from "node:test";

import { OG_FONT_FILES } from "../app/og-fonts.ts";
import nextConfig from "../next.config.ts";

const require = createRequire(import.meta.url);
// Next 가 헤더·리다이렉트의 source 를 맞출 때 쓰는 것과 같은 매처와 옵션(next/dist/lib/build-custom-route.js).
const { pathToRegexp } = require("next/dist/compiled/path-to-regexp") as {
  pathToRegexp: (p: string, keys: unknown[], o: object) => RegExp;
};
const picomatch = require("next/dist/compiled/picomatch") as (glob: string) => (s: string) => boolean;

const APP = new URL("../app/", import.meta.url).pathname;

/** app/ 아래 카드 파일(opengraph-image.tsx 컨벤션 · 홈의 opengraph-image/route.tsx)의 라우트 경로. */
function ogRoutes(dir = APP, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "api") continue;
      if (name === "opengraph-image") out.push(relative(APP, full));
      else ogRoutes(full, out);
    } else if (/^opengraph-image\.(tsx|ts|jsx|js)$/.test(name)) {
      out.push(relative(APP, join(dir, "opengraph-image")));
    }
  }
  return out.map((r) => "/" + r.split(sep).join("/"));
}

/** 동적 칸([theme])을 실제 주소 한 조각으로 채운다. */
const sample = (route: string) => route.replace(/\[[^\]]+\]/g, "semiconductor");

describe("공유 카드 라우트", async () => {
  const routes = ogRoutes();
  const headers = await nextConfig.headers!();
  const noindexSources = headers
    .filter((h) => h.headers.some((x) => x.key.toLowerCase() === "x-robots-tag" && /noindex/.test(x.value)))
    .map((h) => pathToRegexp(h.source, [], { strict: true, sensitive: false, delimiter: "/" }));

  it("카드 파일을 찾았다(검사가 헛돌지 않는다)", () => {
    assert.ok(routes.includes("/opengraph-image"), routes.join(", "));
    assert.ok(routes.includes("/kadera/us/opengraph-image"), routes.join(", "));
    assert.ok(routes.some((r) => r.includes("[")), "동적 카드가 없습니다");
  });

  it("카드마다 noindex 헤더가 걸린다", () => {
    for (const r of routes) {
      const url = sample(r);
      assert.ok(noindexSources.some((re) => re.test(url)), `noindex 가 안 걸리는 카드: ${url}`);
    }
  });

  it("화면에는 noindex 가 안 걸린다 — 패턴이 넓어 색인할 화면을 막지 않는다", () => {
    for (const url of ["/", "/kadera", "/kadera/us", "/theme/semiconductor", "/stock/005930", "/daily/2026-09-30"]) {
      assert.ok(!noindexSources.some((re) => re.test(url)), `화면이 noindex 에 걸립니다: ${url}`);
    }
  });

  it("카드마다 폰트 번들 키가 걸리고, 값은 카드가 읽는 파일 그대로다", () => {
    const includes = nextConfig.outputFileTracingIncludes ?? {};
    const want = Object.values(OG_FONT_FILES).map((f) => `./${f}`).sort();
    for (const r of routes) {
      const keys = Object.keys(includes).filter((k) => picomatch(k)(r));
      assert.ok(keys.length, `폰트 번들 키가 안 걸리는 카드: ${r}`);
      for (const k of keys) assert.deepEqual([...includes[k]].sort(), want, k);
    }
  });
});
