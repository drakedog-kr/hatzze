#!/usr/bin/env node
/**
 * 라우트와 사이트맵이 어긋나면 실패한다.
 *
 * ## 왜 있나
 *
 * 사이트맵은 **화면 안에서 안 보인다.** 빠뜨려도 아무 데도 안 깨지고, 그래서 두 번
 * 빠졌다. `/seohak` 이 한 번, `/insider` 가 또 한 번이다. 두 번째는 2026-09-01 에
 * 서치콘솔을 열고서야 알았는데, 그때 `/insider` 는 연 지 엿새가 지나도록 구글이
 * 존재조차 모르는 상태였다("Google에는 아직 알려지지 않은 URL").
 *
 * 사람이 기억해서 막는 자리가 아니라고 보고 검사를 둔다. 사람 기억으로 막던 것이
 * 두 번 다 뚫렸다는 게 근거다.
 *
 * ## 어떻게 보나
 *
 * `app/sitemap.ts` 를 **그대로 불러서 실행한다**(Node 의 타입 스트립). 소스를 정규식으로
 * 훑지 않는 이유는, 그 방식이 조용히 빗나가면 검사가 통과해 버리기 때문이다 — 막으려던
 * 사고를 검사가 똑같이 저지른다.
 *
 * ## 새 화면을 열 때
 *
 * 이 검사가 실패하면 둘 중 하나를 하라는 뜻이다.
 *   ① `app/sitemap.ts` 에 한 줄 넣는다(대부분 이쪽이다)
 *   ② 색인할 화면이 아니면 아래 `EXCLUDED` 에 **까닭과 함께** 적는다
 */
import { readdirSync, statSync } from "node:fs";
import { register } from "node:module";
import { join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";

// 확장자 없는 상대 import 를 풀어 주는 훅. 이게 있어야 sitemap.ts 를 그대로 부를 수 있다.
register("./ts-resolve.mjs", import.meta.url);

const APP = new URL("../app/", import.meta.url).pathname.replace(/\/$/, "");

/**
 * 사이트맵에 없어도 되는 정적 라우트. **까닭을 반드시 적는다** — 까닭 없이 늘어나면
 * 이 목록이 검사를 무력화하는 서랍이 된다.
 */
const EXCLUDED = new Map([
  ["/preview", "아직 안 연 화면. generateMetadata 가 noindex 를 붙인다(app/preview/page.tsx)"],
]);

/**
 * 동적 라우트는 여기 적어 둔 방식대로 다뤄진다는 뜻이다. 새 동적 라우트가 생기면
 * 항목이 없어 실패하므로, 그때 어떻게 할지 정하고 한 줄 적는다.
 */
const DYNAMIC = new Map([
  ["/insider/list/[kind]", "슬러그 여덟 개를 sitemap.ts 가 INSIDER_LIST_SLUGS 로 펼친다"],
  ["/stock/[code]", "sitemap-stocks.xml 이 DB 를 읽어 펼친다(lib/stock-page.ts listIndexableStocks)"],
  ["/insider/stock/[ticker]", "수가 많고 DB 를 읽어야 한다. 사이트맵 동적 생성 때 다룬다"],
  ["/insider/investor/[cik]", "위와 같다"],
]);

/** app/ 아래 page.tsx 를 훑어 라우트 경로를 만든다. */
function routes(dir = APP, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      // api 라우트는 화면이 아니다. robots.txt 도 여기서 /api/ 를 막는다.
      if (name !== "api") routes(full, out);
    } else if (name === "page.tsx") {
      const rel = relative(APP, dir).split(sep).filter(Boolean);
      // 라우트 그룹 `(foo)` 은 주소에 안 들어간다.
      const path = "/" + rel.filter((seg) => !seg.startsWith("(")).join("/");
      out.push(path === "/" ? "/" : path.replace(/\/$/, ""));
    }
  }
  return out;
}

const found = routes().sort();
const mod = await import(pathToFileURL(join(APP, "sitemap.ts")).href);
const listed = new Set(mod.default().map((e) => new URL(e.url).pathname.replace(/(.)\/$/, "$1")));

const problems = [];

for (const r of found) {
  if (r.includes("[")) {
    if (!DYNAMIC.has(r)) {
      problems.push(`동적 라우트 ${r} 를 어떻게 다룰지 정해지지 않았습니다.\n` +
        `  → scripts/check-routes.mjs 의 DYNAMIC 에 까닭과 함께 한 줄 적으십시오.`);
    }
    continue;
  }
  if (listed.has(r) || EXCLUDED.has(r)) continue;
  problems.push(`화면 ${r} 가 사이트맵에 없습니다.\n` +
    `  → app/sitemap.ts 에 한 줄 넣거나, 색인할 화면이 아니면\n` +
    `    scripts/check-routes.mjs 의 EXCLUDED 에 까닭과 함께 적으십시오.`);
}

for (const l of listed) {
  if (l === "/") continue;
  if (found.includes(l)) continue;
  // 동적 라우트가 펼쳐진 주소(/insider/list/exec 등)는 파일이 없다. 부모 동적 라우트가
  // 선언돼 있으면 정상으로 본다.
  const parentIsDynamic = [...DYNAMIC.keys()].some((d) => {
    const prefix = d.slice(0, d.indexOf("["));
    return l.startsWith(prefix) && l.slice(prefix.length).split("/").length === 1;
  });
  if (parentIsDynamic) continue;
  problems.push(`사이트맵의 ${l} 에 해당하는 화면이 없습니다. 404 를 크롤러에 내주게 됩니다.`);
}

if (problems.length) {
  console.error("\n라우트와 사이트맵이 어긋납니다.\n");
  for (const p of problems) console.error("· " + p + "\n");
  process.exit(1);
}
console.error(`라우트 ${found.length}개 · 사이트맵 ${listed.size}개 — 어긋난 곳 없습니다.`);
