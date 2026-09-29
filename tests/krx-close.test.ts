/**
 * lib/krx-close.ts — 국장 미리보기 밤사이 카드가 야후 국장 값을 그날 종가로 갈아 끼워도 되는 때.
 * 야후는 마감(15:30) 직후 몇 분 동안 전날 값에 멈춘 응답을 준다(2026-07-28 15:16~15:37). 그래서
 * 오늘 도장은 16:00 KST 부터만 종가다 — lib/yahoo-history.ts · yahoo_client.py 와 같은 문턱.
 * 돌리는 법: `npm test`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { KRX_CLOSE_SETTLED_MIN, settledKrxCloseDate } from "../lib/krx-close.ts";

/** 한국 시각 "2026-09-29 15:35" → UTC 에포크 ms. */
const kst = (s: string) => Date.parse(s.replace(" ", "T") + ":00+09:00");

describe("settledKrxCloseDate", () => {
  const todayClose = kst("2026-09-29 15:30"); // 화요일 마감 도장

  it("오늘 도장은 16:00 전엔 종가가 아니다 — 마감 직후 30분은 야후가 낡은 값을 줄 수 있다", () => {
    assert.equal(settledKrxCloseDate(todayClose, kst("2026-09-29 15:35")), null);
    assert.equal(settledKrxCloseDate(todayClose, kst("2026-09-29 15:59")), null);
  });
  it("장중의 오늘 도장은 진행 중인 값이다", () => {
    assert.equal(settledKrxCloseDate(kst("2026-09-29 10:00"), kst("2026-09-29 10:01")), null);
  });
  it("16:00 부터는 오늘 종가다", () => {
    assert.equal(KRX_CLOSE_SETTLED_MIN, 16 * 60);
    assert.equal(settledKrxCloseDate(todayClose, kst("2026-09-29 16:00")), "2026-09-29");
    assert.equal(settledKrxCloseDate(todayClose, kst("2026-09-30 08:00")), "2026-09-29");
  });
  it("지난 거래일 도장은 언제든 그날 종가다(주말·장중 포함)", () => {
    const fri = kst("2026-09-25 15:30");
    assert.equal(settledKrxCloseDate(fri, kst("2026-09-26 11:00")), "2026-09-25");
    assert.equal(settledKrxCloseDate(fri, kst("2026-09-28 10:00")), "2026-09-25");
  });
});
