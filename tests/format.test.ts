/**
 * lib/format.ts 의 순수 함수. 화면 여러 곳이 같은 헬퍼로 숫자·날짜·조사를 적으므로,
 * 여기가 어긋나면 한꺼번에 어긋난다. 돌리는 법: `npm test` (node --test, 의존성 없음).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  compareLabel,
  formatEokMixed,
  formatKstUpdate,
  formatKstUpdateSnapped,
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

describe("formatKstUpdate", () => {
  // 입력은 UTC 다(파이프라인이 +09:00 으로 써도 DB 가 UTC 로 돌려준다). KST = UTC+9.
  it("가장 가까운 30분으로 적는다", () => {
    assert.equal(formatKstUpdate("2026-09-29T23:26:00Z"), "9월 30일(수) 오전 8시 30분 기준"); // 08:26
    assert.equal(formatKstUpdate("2026-09-29T23:46:00Z"), "9월 30일(수) 오전 9시 기준"); // 08:46
    assert.equal(formatKstUpdate("2026-09-30T11:32:34Z"), "9월 30일(수) 오후 8시 30분 기준"); // 20:32
    assert.equal(formatKstUpdate("2026-09-30T11:14:00Z"), "9월 30일(수) 오후 8시 기준"); // 20:14
  });
  it("한가운데(:15·:45 정각)는 뒤로 올린다", () => {
    assert.equal(formatKstUpdate("2026-09-30T11:14:59Z"), "9월 30일(수) 오후 8시 기준");
    assert.equal(formatKstUpdate("2026-09-30T11:15:00Z"), "9월 30일(수) 오후 8시 30분 기준");
    assert.equal(formatKstUpdate("2026-09-30T11:45:00Z"), "9월 30일(수) 오후 9시 기준");
  });
  it("오프셋이 붙은 입력도 같은 순간으로 읽는다", () => {
    assert.equal(formatKstUpdate("2026-09-30T20:32:34.123+09:00"), "9월 30일(수) 오후 8시 30분 기준");
  });
  it("정오는 오후 12시, 자정 가까이는 다음 날 오전 12시", () => {
    assert.equal(formatKstUpdate("2026-09-30T03:10:00Z"), "9월 30일(수) 오후 12시 기준"); // 12:10
    assert.equal(formatKstUpdate("2026-09-30T14:50:00Z"), "10월 1일(목) 오전 12시 기준"); // 23:50
  });
});

describe("formatKstUpdateSnapped", () => {
  it("정해 둔 정각 ±2시간 안이면 그 정각에 붙인다(국장 미리보기)", () => {
    assert.equal(formatKstUpdateSnapped("2026-09-29T21:31:00Z", [7]), "9월 30일(수) 오전 7시 기준"); // 06:31
    assert.equal(formatKstUpdateSnapped("2026-09-30T09:45:00Z", [8, 18]), "9월 30일(수) 오후 6시 기준"); // 18:45
  });
  it("창 밖이면 실제 시에 '경'을 붙인다", () => {
    assert.equal(formatKstUpdateSnapped("2026-09-30T06:10:00Z", [7]), "9월 30일(수) 오후 3시경 기준"); // 15:10
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
