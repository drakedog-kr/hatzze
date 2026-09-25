/**
 * lib/icon-names.ts — 아이콘 폰트를 쓰는 이름만 잘라 받는다. 목록에 없는 이름은 글리프 대신
 * 글자로 찍히므로, 빠진 이름은 타입 검사가 잡고 여기서는 목록과 주소의 모양을 본다.
 * 돌리는 법: `npm test`.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { ICON_FONT_HREF, ICON_NAMES } from "../lib/icon-names.ts";

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sources(p);
    return /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}

describe("ICON_NAMES", () => {
  it("알파벳 순이고 겹치는 이름이 없다", () => {
    const names = [...ICON_NAMES];
    assert.deepEqual(names, [...new Set(names)].sort());
  });
  it("이름은 Material Symbols 꼴(소문자·숫자·밑줄)이다", () => {
    for (const n of ICON_NAMES) assert.match(n, /^[a-z0-9_]+$/);
  });
  it("주소가 목록 전부를 싣고 FILL 축을 남긴다", () => {
    const url = new URL(ICON_FONT_HREF);
    assert.equal(url.searchParams.get("icon_names"), ICON_NAMES.join(","));
    assert.match(url.searchParams.get("family") ?? "", /FILL,GRAD@24,400,0\.\.1,0$/);
    assert.equal(url.searchParams.get("display"), "block");
  });
  it("IconName 으로 캐스팅한 곳이 없다(캐스팅은 타입 검사를 건너뛴다)", () => {
    const hits = [...sources("app"), ...sources("lib")]
      .filter((p) => !p.endsWith("icon-names.ts")) // 목록 파일의 주석이 이 금지를 적고 있다
      .filter((p) => /\bas IconName\b/.test(readFileSync(p, "utf8")));
    assert.deepEqual(hits, []);
  });
});
