import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { etfGroup, isMultipleEtf } from "../lib/etf-groups.ts";

describe("isMultipleEtf — 수익률 상위에서 뺄 배수 상품", () => {
  it("유형이 원자재 · 채권으로 가는 인버스 · 레버리지도 이름으로 걸린다(2026-10-15 점검)", () => {
    assert.equal(isMultipleEtf("RISE 팔라듐선물인버스(H)", "파생상품/인버스"), true);
    assert.equal(isMultipleEtf("RISE 국채30년레버리지(합성)", "파생상품/레버리지"), true);
    assert.equal(isMultipleEtf("KODEX 미국나스닥100레버리지(합성 H)", null), true);
  });
  it("분류만으로도 걸린다", () => {
    assert.equal(isMultipleEtf("어떤 상품", "파생상품/레버리지"), true);
    assert.equal(isMultipleEtf("어떤 상품", "파생상품/인버스"), true);
  });
  it("롱숏 · 구조화 · 보통 테마는 그대로 둔다", () => {
    assert.equal(isMultipleEtf("KODEX 코스닥150롱코스피200숏선물", "기타/기타"), false);
    assert.equal(isMultipleEtf("TIGER 미국S&P500타겟데일리커버드콜", "파생상품/구조화"), false);
    assert.equal(isMultipleEtf("TIGER 글로벌AI사이버보안", "테마/기타"), false);
  });
  it("유형 판정은 그대로다", () => {
    assert.equal(typeof etfGroup("451670", "RISE 국채30년레버리지(합성)", null, "파생상품/레버리지"), "string");
  });
});
