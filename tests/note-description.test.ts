/**
 * lib/daily-note-md.ts noteDescription — 검색 설명 · 공유 카드 · RSS 의 한 줄. 2026-09-14 이후 글은 첫 소제목 앞에 그날 요약 문단이
 * 있는데, 첫 꼭지 세부 문단을 쓰느라 빠졌다(2026-10-04 점검). 돌리는 법: `npm test`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { noteDescription } from "../lib/daily-note-md.ts";

describe("noteDescription", () => {
  it("첫 소제목 앞 요약 문단을 쓴다", () => {
    const md = "오늘은 정유주 이야기가 가장 많았고 광통신이 뒤를 이었습니다.\n\n---\n\n### 정유주\n\n로이터는 중국 정유사들이 수출을 멈췄다고 전했습니다.";
    assert.equal(noteDescription(md), "오늘은 정유주 이야기가 가장 많았고 광통신이 뒤를 이었습니다.");
  });

  it("주말 고정 도입은 건너뛰고 그 다음 요약 문단을 쓴다", () => {
    const md = "토요일에는 한 주의 미국 시장을 묶습니다.\n\n이번 주 미국은 나스닥만 올랐습니다.\n\n---\n\n### 금리\n\n30년물이 5.62%였습니다.";
    assert.equal(noteDescription(md), "이번 주 미국은 나스닥만 올랐습니다.");
  });

  it("소제목 앞 문단이 없는 옛 글은 첫 소제목 아래 첫 문단", () => {
    const md = "### 브로드컴이 매출 목표를 냈습니다\n\n브로드컴이 인공지능 반도체 매출 목표를 제시했습니다.";
    assert.equal(noteDescription(md), "브로드컴이 인공지능 반도체 매출 목표를 제시했습니다.");
  });

  it("고정 도입뿐이면 첫 소제목 아래로 물러선다", () => {
    const md = "일요일에는 한 주를 묶습니다.\n\n### 한 주\n\n코스피가 사흘 거래했습니다.";
    assert.equal(noteDescription(md), "코스피가 사흘 거래했습니다.");
  });
});
