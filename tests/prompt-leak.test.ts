/**
 * lib/prompt-leak.ts — 급부상 한 줄에 지시문이 샜는지. 2026-10-09 미장 마벨 칸에 작업 설명 126자가 실렸다.
 * 낱말 · 꼴은 파이썬 원본과 같아야 한다(data-pipeline/tests/test_prompt_leaks.py 가 대조). 돌리는 법: `npm test`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ONELINER_CEIL, hasPromptLeak, usableOneliner } from "../lib/prompt-leak.ts";

const MARVELL =
  "Marvell 관련 화제가 주로 10/7 하루에 몰렸고, 발췌는 미국 장 강세와 마벨테크 +5.8% 상승, AI 실적 자신감, " +
  "인베스터 데이 장기 AI 성장 전망을 언급합니다. 이를 22~30자 한 문장으로 담백하게 적습니다.";

describe("hasPromptLeak", () => {
  it("저장분에서 나온 누출", () => {
    assert.ok(hasPromptLeak(MARVELL));
    assert.ok(hasPromptLeak("AST스페이스모바일 관련 화제는 위성 사업 비교에 쏠려 있어 이를 담담하게 적습니다."));
    assert.ok(hasPromptLeak("KB금융은 언급이 가장 많았지만 발췌에서 내용은 확인되지 않습니다."));
  });

  it("비슷한 글자가 있어도 작업 설명이 아닌 문장", () => {
    for (const t of ["올해 배당 물량이 적습니다.", "제3자배정 유상증자 소식", "2~3자 협의체 구성 소식", "보고 사유는 단순투자로 적혔습니다."]) {
      assert.equal(hasPromptLeak(t), false, t);
    }
  });
});

describe("usableOneliner", () => {
  it("누출 · 상한 초과 · 빈 값은 버린다", () => {
    assert.equal(usableOneliner(MARVELL), false);
    assert.equal(usableOneliner("가".repeat(ONELINER_CEIL + 1)), false);
    assert.equal(usableOneliner(""), false);
    assert.equal(usableOneliner(null), false);
    assert.equal(usableOneliner("인베스터 데이 장기 AI 성장 전망 소식"), true);
  });
});
