/** lib/keyword-overlap.ts — 파이프라인 common/keyword_overlap.py 와 같은 답(tests/test_keyword_overlap.py 와 같은 입력). */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { dropOverlaps } from "../lib/keyword-overlap.ts";

describe("dropOverlaps", () => {
  it("품는 짝은 위에 선 쪽 하나 · 넓은 낱말은 뺀다", () => {
    assert.deepEqual(dropOverlaps(["실적호조", "데이터센터", "AI데이터센터", "금리", "AI"]), ["실적호조", "데이터센터", "금리"]);
    assert.deepEqual(dropOverlaps(["AI 데이터센터", "데이터센터", "수주"]), ["AI 데이터센터", "수주"]);
  });

  it("상관없는 낱말은 그대로", () => {
    assert.deepEqual(dropOverlaps(["HBM", "금리인상", "환율"]), ["HBM", "금리인상", "환율"]);
  });
});
