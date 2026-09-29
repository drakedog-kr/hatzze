/**
 * us_manager_holding(13F 보유)을 쪽으로 넘겨 읽는 조회는 **기본 키 (cik, ticker, report_date) 전부**로 정렬해야 한다.
 *
 * fetchAllRows 는 요청마다 `.range()` 로 따로 묻는다. 정렬 키가 유일하지 않으면 동점 행의 순서를 DB 가 보장하지
 * 않아, 쪽 경계에 걸친 행이 다음 요청에서 자리를 바꿔 **빠지거나 겹친다**(lib/telegram-data.ts fetchAllRows 머리말 [2]).
 * 이 표는 운용사 62명 × 종목 × 분기라 cik 하나·ticker 하나로는 동점이 수천 행이다. 내부자 종목 상세의 비중 분모가
 * cik 하나로 정렬해 넘기고 있었다(#622 에서 찾음). 같은 표를 읽는 다른 곳도 한 열로만 정렬했다.
 *
 * 규칙: fetchAllRows 의 정렬 키 + 쿼리에 건 `.order()` + `.eq()` 로 고정한 열이 기본 키를 다 덮는다.
 * 돌리는 법: `npm test`.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

const PK = ["cik", "ticker", "report_date"];

function sources(dir: string): string[] {
  const root = new URL(`../${dir}/`, import.meta.url);
  return readdirSync(root, { recursive: true, encoding: "utf8" })
    .filter((f) => /\.tsx?$/.test(f))
    .map((f) => `${dir}/${f}`);
}

/** 파일 안의 fetchAllRows 호출 중 us_manager_holding 을 읽는 것: [정렬 키로 덮은 열, 호출 머리 한 줄]. */
function holdingCalls(path: string): { covered: Set<string>; head: string }[] {
  const src = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const out: { covered: Set<string>; head: string }[] = [];
  for (const chunk of src.split(/fetchAllRows</).slice(1)) {
    // 호출 하나는 onError 인자에서 끝난다. 없으면 다음 호출 전까지.
    const call = chunk.slice(0, Math.max(chunk.indexOf("onError"), 0) || chunk.length);
    if (!call.includes('from("us_manager_holding")')) continue;
    const covered = new Set<string>();
    const key = call.match(/>\(\s*"(\w+)"/);
    if (key) covered.add(key[1]);
    for (const m of call.matchAll(/\.(?:order|eq)\("(\w+)"/g)) covered.add(m[1]);
    out.push({ covered, head: call.split("\n").find((l) => l.includes("us_manager_holding"))?.trim() ?? "" });
  }
  return out;
}

describe("us_manager_holding 페이징 정렬", () => {
  const calls = [...sources("lib"), ...sources("app")].flatMap((p) => holdingCalls(p).map((c) => ({ ...c, path: p })));

  it("검사할 호출을 찾는다(정규식이 코드 모양을 놓치면 아무것도 안 보고 통과한다)", () => {
    assert.ok(calls.length >= 4, `호출 ${calls.length}곳만 찾았다`);
  });

  for (const c of calls) {
    it(`${c.path} — ${c.head}`, () => {
      const missing = PK.filter((k) => !c.covered.has(k));
      assert.deepEqual(missing, [], `정렬이 기본 키를 다 덮지 않는다: ${missing.join(", ")} 이 빠졌다`);
    });
  }
});
