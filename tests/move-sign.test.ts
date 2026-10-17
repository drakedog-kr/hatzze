/**
 * 이유 한 줄 대 실제 등락(lib/move-sign.ts). 돌리는 법: `npm test`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { moveSignsDisagree, reasonContradictsMove, reasonDirection } from "../lib/move-sign.ts";

describe("moveSignsDisagree", () => {
  it("부호가 갈리면 true, 같거나 모르면 false", () => {
    assert.equal(moveSignsDisagree(14.76, -8.63), true);
    assert.equal(moveSignsDisagree(5.2, 3.1), false);
    assert.equal(moveSignsDisagree(null, -3), false);
    assert.equal(moveSignsDisagree(4, 0), false);
  });
});

describe("reasonDirection", () => {
  it("한쪽 낱말만 있을 때만 방향이 선다", () => {
    assert.equal(reasonDirection("ESS 수요 확대 기대에 이차전지 강세"), 1);
    assert.equal(reasonDirection("판매 부진 우려"), -1);
    assert.equal(reasonDirection("잠정실적 호실적에도 외국인 매도 등 수급 부담 우려"), -1);
    assert.equal(reasonDirection("배임 혐의 관련 보도 부각"), -1);
    assert.equal(reasonDirection("최태원 언급에 따른 호남 반도체 관련주 부각"), 0);
    assert.equal(reasonDirection("반등 기대 속 차익 실현 경계"), 0);
  });
});

describe("reasonContradictsMove — 표기 부호와 문장 방향이 함께 반대일 때만", () => {
  it("둘 다 반대면 뺀다(2026-10-15 삼성SDI)", () => {
    assert.equal(reasonContradictsMove("ESS 수요 확대 기대에 이차전지 강세", 14.76, -8.63), true);
  });
  it("문장이 맞으면 표기만 틀려도 남긴다(LG이노텍 · 삼성SDI 10/14)", () => {
    assert.equal(reasonContradictsMove("LG전자 기대치 밑돈 잠정실적에 따른 그룹주 동반 하락", 5.0, -8.23), false);
    assert.equal(reasonContradictsMove("ESS 시장 성장 기대감 부각", -11.6, 5.54), false);
  });
  it("표기가 맞으면 나쁜 낱말이 든 호재도 남긴다(상장폐지 가처분 소송 인용 +30%)", () => {
    assert.equal(reasonContradictsMove("상장폐지 관련 가처분 소송 인용 소식", 29.9, 30.0), false);
  });
});
