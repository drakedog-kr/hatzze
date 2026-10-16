/**
 * lib/revalidate-paths.ts 의 순수 함수. `/api/revalidate` 가 본문에서 경로를 고르는
 * 자리라, 여기가 헐거우면 잠금 뒤에서 아무 경로나 비울 수 있고 빡빡하면 파이프라인이
 * 조용히 아무것도 안 비운다. 돌리는 법: `npm test`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { readFileSync, readdirSync, statSync } from "node:fs";

import { MAX_PATHS, MAX_ROUTES, TOP_SEGMENTS, allExceptTargets, parseRevalidatePaths } from "../lib/revalidate-paths.ts";

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

describe("이것만 빼고 전부(except · 2026-10-17)", () => {
  it("아침 finalize 의 꼴을 받는다", () => {
    assert.deepEqual(parseRevalidatePaths({ except: ["/preview"] }), { paths: [], routes: [], except: ["/preview"] });
  });

  it("최상위 자리가 아니거나 paths · routes 와 섞이면 물린다", () => {
    for (const bad of [{ except: ["/nope"] }, { except: [] }, { except: "/preview" }, { except: ["/preview"], paths: ["/kadera"] }]) {
      assert.ok("reason" in parseRevalidatePaths(bad), JSON.stringify(bad));
    }
  });

  it("뺀 자리만 남기고 나머지를 비운다 — 홈은 그 페이지만, 파일 라우트는 경로, 나머지는 그 아래 전부", () => {
    const t = allExceptTargets(["/preview"]);
    assert.ok(!t.some((x) => x.path === "/preview"));
    assert.deepEqual(t.find((x) => x.path === "/"), { path: "/", type: "page" });
    assert.deepEqual(t.find((x) => x.path === "/kadera"), { path: "/kadera", type: "layout" });
    assert.deepEqual(t.find((x) => x.path === "/sitemap.xml"), { path: "/sitemap.xml" });
    assert.equal(t.length, TOP_SEGMENTS.length - 1);
  });

  it("최상위 자리 목록이 app/ 폴더와 같다 — 새 최상위 화면이 빠지면 아침에 안 바뀐다", () => {
    const app = new URL("../app/", import.meta.url);
    const hasRoute = (dir: URL): boolean =>
      readdirSync(dir).some((f) => {
        const u = new URL(f, dir);
        if (statSync(u).isDirectory()) return hasRoute(new URL(`${f}/`, dir));
        return /^(page|route)\.tsx?$/.test(f);
      });
    const found = new Set<string>();
    for (const f of readdirSync(app)) {
      const u = new URL(f, app);
      if (statSync(u).isDirectory()) {
        if (hasRoute(new URL(`${f}/`, app))) found.add(`/${f}`);
      } else if (f === "page.tsx") found.add("/");
      else if (f === "robots.ts") found.add("/robots.txt");
      else if (f === "sitemap.ts") found.add("/sitemap.xml");
    }
    assert.deepEqual([...found].sort(), [...TOP_SEGMENTS].sort());
  });
});

describe("데일리 노트 올리기는 노트 화면만 비운다(2026-10-17)", () => {
  // 예전엔 본문 없이 전부 비웠다 — 파이프라인 도중에 올리면 모든 화면이 반쯤 바뀐 DB 로 그려졌다.
  it("본문이 API 를 통과하고 전부 비우기가 아니다", () => {
    const py = readFileSync(new URL("../data-pipeline/scripts/publish_daily_note.py", import.meta.url), "utf8");
    const m = py.match(/^REVALIDATE_BODY = (\{.*\})$/m);
    assert.ok(m, "REVALIDATE_BODY 를 못 찾았다");
    const parsed = parseRevalidatePaths(JSON.parse(m[1]));
    assert.ok(!("reason" in parsed), JSON.stringify(parsed));
    assert.ok("paths" in parsed && parsed.paths.includes("/daily") && parsed.routes.includes("/daily/[date]"));
    assert.match(py, /data=json\.dumps\(REVALIDATE_BODY\)/);
  });
});
