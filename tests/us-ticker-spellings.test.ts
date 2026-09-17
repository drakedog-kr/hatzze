/**
 * lib/us-ticker-spellings.ts — 표마다 갈리는 클래스 표기(BRK·BRK-B·BRK.B)를 하나로 접는 규칙.
 * 2026-09-09 PR #461 에서 "접미사를 기계로 붙이면 다른 회사가 합쳐진다"(C↔CB)는 것을 실측했다.
 * 그 경계가 여기 붙박여 있어야 다음 사람이 되돌리지 않는다.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { canonicalTicker, tickerKey, tickerSpellings } from "../lib/us-ticker-spellings.ts";

describe("canonicalTicker", () => {
  it("버크셔 세 표기가 한 주소로 모인다", () => {
    const a = canonicalTicker("BRK");
    assert.equal(canonicalTicker("BRK-B"), a);
    assert.equal(canonicalTicker("BRK.B"), a);
    assert.equal(canonicalTicker("brk.b"), a);
  });
  it("구분자 없는 남남은 합치지 않는다(씨티 C ≠ 처브 CB, 홈디포 HD ≠ HDFC HDB)", () => {
    assert.notEqual(canonicalTicker("C"), canonicalTicker("CB"));
    assert.notEqual(canonicalTicker("HD"), canonicalTicker("HDB"));
  });
});

describe("tickerSpellings", () => {
  it("표마다 물을 표기를 전부 돌려주고 자기 자신을 포함한다", () => {
    const s = tickerSpellings("BRK");
    assert.ok(s.includes("BRK"));
    assert.ok(s.includes("BRK-B"));
    assert.ok(s.includes("BRK.B"));
  });
  it("보통 티커는 자기 자신 하나", () => {
    assert.deepEqual(tickerSpellings("NVDA"), ["NVDA"]);
  });
});

describe("tickerKey", () => {
  it("대소문자와 구분자를 지운 비교 키", () => {
    assert.equal(tickerKey("brk.b"), tickerKey("BRK-B"));
  });
});
