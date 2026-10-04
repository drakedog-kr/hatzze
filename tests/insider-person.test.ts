/**
 * lib/insider-person.ts — 임원 줄의 이름 · 직함 · 같은 날 줄 묶기(2026-10-04 점검: 'HUANG JEN HSUN' 이 그대로 섰고 직함이 없었고,
 * 같은 사람의 같은 날 줄이 셋씩 되풀이됐다). 돌리는 법: `npm test`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { groupInsiderLines, ownerDisplayName, shortTitle } from "../lib/insider-person.ts";

describe("ownerDisplayName", () => {
  it("SEC 의 '성 이름 중간'을 '이름 중간 성'으로, 대문자는 첫 글자만", () => {
    assert.equal(ownerDisplayName("HUANG JEN HSUN"), "Jen Hsun Huang");
    assert.equal(ownerDisplayName("Teter Timothy S."), "Timothy S. Teter");
    assert.equal(ownerDisplayName("STEVENS MARK A"), "Mark A Stevens");
    assert.equal(ownerDisplayName("SMITH JOHN A JR"), "John A Smith Jr");
    assert.equal(ownerDisplayName("O'BRIEN DEIRDRE"), "Deirdre O'Brien");
  });

  it("법인 · 펀드 이름은 그대로", () => {
    assert.equal(ownerDisplayName("Blackstone Holdings IV L.P."), "Blackstone Holdings IV L.P.");
    assert.equal(ownerDisplayName("BERKSHIRE HATHAWAY INC"), "BERKSHIRE HATHAWAY INC");
    assert.equal(ownerDisplayName(null), null);
  });
});

describe("shortTitle", () => {
  it("흔한 직함은 짧게, 모르는 긴 직함은 안 적는다", () => {
    assert.equal(shortTitle("President and CEO"), "CEO");
    assert.equal(shortTitle("EVP & Chief Financial Officer"), "CFO");
    assert.equal(shortTitle("Senior Vice President, Operations"), "부사장");
    assert.equal(shortTitle("President"), "사장");
    assert.equal(shortTitle("Chairman of the Board"), "의장");
    assert.equal(shortTitle("Principal Accounting Officer and Something Long"), null);
    assert.equal(shortTitle(null), null);
  });
});

describe("groupInsiderLines", () => {
  const r = (ownerName: string, day: string, value: number | null, code = "S") => ({
    ownerName,
    code,
    acquiredDisposed: "D",
    transactionDate: day,
    filedDate: day,
    shares: 10,
    value,
  });

  it("바로 이어진 같은 사람 · 같은 날 · 같은 종류만 묶는다", () => {
    const out = groupInsiderLines([r("A", "2026-09-23", 100), r("A", "2026-09-23", 50), r("A", "2026-09-23", 25), r("B", "2026-09-23", 10), r("A", "2026-09-22", 5)]);
    assert.deepEqual(
      out.map((x) => [x.ownerName, x.count, x.value, x.shares]),
      [
        ["A", 3, 175, 30],
        ["B", 1, 10, 10],
        ["A", 1, 5, 10],
      ],
    );
  });

  it("금액이 하나라도 없으면 합도 없음", () => {
    const out = groupInsiderLines([r("A", "2026-09-23", 100), r("A", "2026-09-23", null)]);
    assert.equal(out[0].value, null);
  });
});
