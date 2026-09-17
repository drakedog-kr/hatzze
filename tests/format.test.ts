/**
 * lib/format.ts 의 순수 함수. 화면 여러 곳이 같은 헬퍼로 숫자·날짜·조사를 적으므로,
 * 여기가 어긋나면 한꺼번에 어긋난다. 돌리는 법: `npm test` (node --test, 의존성 없음).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  compareLabel,
  formatEokMixed,
  formatSampleCount,
  hasFinal,
  shortDate,
  withObjectParticle,
  withSubjectParticle,
  withTopicParticle,
} from "../lib/format.ts";

describe("shortDate", () => {
  it("ISO 날짜를 M/D 로 줄인다(앞자리 0 없이)", () => {
    assert.equal(shortDate("2026-09-06"), "9/6");
    assert.equal(shortDate("2026-12-25"), "12/25");
  });
  it("MM-DD 만 와도 받는다", () => {
    assert.equal(shortDate("09-06"), "9/6");
  });
});

describe("compareLabel", () => {
  it("직전 행이 없거나 하루 전이면 '전일 대비'", () => {
    assert.equal(compareLabel("2026-09-17", null), "전일 대비");
    assert.equal(compareLabel("2026-09-17", "2026-09-16"), "전일 대비");
  });
  it("하루보다 멀면 그 날짜를 적는다(주말·휴장 뒤)", () => {
    assert.equal(compareLabel("2026-09-15", "2026-09-12"), "9월 12일 대비");
  });
});

describe("formatEokMixed", () => {
  it("1만 억 미만은 억으로", () => {
    assert.equal(formatEokMixed(1234), "1,234억");
    assert.equal(formatEokMixed(0), "0억");
  });
  it("조 단위는 조와 억을 섞어 적고 나머지가 0이면 억을 뺀다", () => {
    assert.equal(formatEokMixed(12345), "1조 2,345억");
    assert.equal(formatEokMixed(20000), "2조");
  });
  it("음수는 앞에 부호 하나", () => {
    assert.equal(formatEokMixed(-115209), "-11조 5,209억");
  });
});

describe("formatSampleCount", () => {
  it("만 미만은 그대로, 만 이상은 소수 한 자리 '만'", () => {
    assert.equal(formatSampleCount(9999), "9,999");
    assert.equal(formatSampleCount(12345), "1.2만");
  });
  it("9.95만 이상은 반올림해 정수 '만'(10.0만 을 안 낸다)", () => {
    assert.equal(formatSampleCount(99500), "10만");
    assert.equal(formatSampleCount(123456), "12만");
  });
});

describe("hasFinal 과 조사", () => {
  it("한글은 종성으로 가른다", () => {
    assert.equal(hasFinal("삼성전자"), false);
    assert.equal(hasFinal("SK하이닉스"), false);
    assert.equal(hasFinal("현대차"), false);
    assert.equal(hasFinal("셀트리온"), true);
  });
  it("로마자·숫자는 한국어 음독의 끝소리 표로 가른다(X→엑스 있음, Y→와이 없음, 표에 없으면 없음)", () => {
    assert.equal(hasFinal("스페이스X"), true);
    assert.equal(hasFinal("Y"), false);
    assert.equal(hasFinal("NVDA"), false);
    assert.equal(hasFinal("AAPL"), true);
    assert.equal(hasFinal("KODEX 200"), true);
    assert.equal(hasFinal("Q"), false);
  });
  it("조사 셋이 같은 판정을 쓴다", () => {
    assert.equal(withObjectParticle("삼성전자"), "삼성전자를");
    assert.equal(withSubjectParticle("셀트리온"), "셀트리온이");
    assert.equal(withTopicParticle("NVDA"), "NVDA는");
  });
  it("빈 문자열은 받침 없음으로 본다", () => {
    assert.equal(hasFinal(""), false);
  });
});
