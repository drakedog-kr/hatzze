/**
 * lib/search-rank.ts — ⌘K 검색의 순위. cmdk 기본값을 걷어 내며 고친 자리들(2026-09-26 실측)이 다시 안 깨지게
 * 붙박아 둔다: 초성 0건 · "엘지" 가 LG 를 못 찾음 · "000660" 에 37종목 · 줄임말 동점.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { choseong, prepareStocks, rankStocks, rankThemes, type SearchStock } from "../lib/search-rank.ts";

const kr = (code: string, name: string, mentions: number | null = 0): SearchStock => ({ market: "kr", code, name, alias: null, mentions });
const us = (code: string, name: string, alias: string, mentions = 0): SearchStock => ({ market: "us", code, name, alias, mentions });

const STOCKS = prepareStocks([
  kr("005930", "삼성전자", 300),
  kr("005935", "삼성전자우", 20),
  kr("009150", "삼성전기", 40),
  kr("000660", "SK하이닉스", 250),
  kr("007660", "이수페타시스", 30),
  kr("066570", "LG전자", 25),
  kr("373220", "LG에너지솔루션", 60),
  kr("0161M0", "네오사피엔스", 70),
  kr("263810", "상신전자", 1),
  kr("214180", "에이치엘지노믹스", 2),
  us("NVDA", "엔비디아", "NVIDIA CORP", 500),
  us("TSLA", "테슬라", "Tesla, Inc.", 200),
  us("TSM", "TSMC", "Taiwan Semiconductor Manufacturing Co Ltd", 150),
]);
const names = (q: string, limit = 8) => rankStocks(STOCKS, q, limit).map((r) => r.item.name);

describe("choseong", () => {
  it("한글 음절만 초성으로 바꾸고 나머지는 둔다", () => {
    assert.equal(choseong("sk하이닉스"), "skㅎㅇㄴㅅ");
  });
});

describe("rankStocks", () => {
  it("초성으로 찾는다(삼성전기는 ㅅㅅㅈㄱ 라 안 걸린다)", () => {
    assert.deepEqual(names("ㅅㅅㅈㅈ"), ["삼성전자", "상신전자", "삼성전자우"]);
  });
  it("한글로 적은 영문 머리를 영문으로도 맞춘다 — LG 가 한글 이름 속 '엘지'보다 먼저", () => {
    assert.deepEqual(names("엘지").slice(0, 3), ["LG에너지솔루션", "LG전자", "에이치엘지노믹스"]);
    assert.deepEqual(names("엘지전자"), ["LG전자"]);
  });
  it("별명은 그 종목 하나만 정확 일치로 — 삼전은 삼성전자, 우선주는 삼성전기 뒤", () => {
    assert.deepEqual(names("삼전"), ["삼성전자", "삼성전기", "삼성전자우"]);
    assert.equal(names("엔솔")[0], "LG에너지솔루션");
  });
  it("글자를 건너뛰며 맞추기는 남아 있다(하닉)", () => {
    assert.deepEqual(names("하닉"), ["SK하이닉스"]);
  });
  it("코드는 정확·앞자리만 — 숫자를 건너뛰며 맞추지 않는다", () => {
    assert.deepEqual(names("000660"), ["SK하이닉스"]);
    assert.deepEqual(names("0059"), ["삼성전자", "삼성전자우"]);
  });
  it("같은 등급이면 우선주를 뒤로, 그다음 언급이 많은 순", () => {
    assert.deepEqual(names("삼성"), ["삼성전자", "삼성전기", "삼성전자우"]);
  });
  it("미장은 한글 이름·티커·영문명으로 찾는다", () => {
    assert.equal(names("엔비디아")[0], "엔비디아");
    assert.equal(names("nvda")[0], "엔비디아");
    assert.equal(names("nvidia")[0], "엔비디아");
    assert.deepEqual(names("tsl"), ["테슬라"]);
    assert.deepEqual(names("taiwan"), ["TSMC"]);
  });
  it("이름 앞글자가 티커 앞자리보다 먼저(TSMC 는 이름이 영문이다)", () => {
    assert.deepEqual(names("ts"), ["TSMC", "테슬라"]);
  });
  it("검색어가 비면 아무것도 안 낸다", () => {
    assert.deepEqual(names("  "), []);
  });
  it("언급 수를 못 셌어도(null) 순위는 낸다", () => {
    const p = prepareStocks([kr("000001", "가나다", null), kr("000002", "가나라", 5)]);
    assert.deepEqual(
      rankStocks(p, "가나").map((r) => r.item.name),
      ["가나라", "가나다"],
    );
  });
});

describe("rankThemes", () => {
  const T = [
    { market: "kr" as const, name: "반도체" },
    { market: "kr" as const, name: "2차전지" },
    { market: "kr" as const, name: "AI·소프트웨어" },
    { market: "us" as const, name: "AI반도체" },
    { market: "us" as const, name: "반도체 장비·소재" },
  ];
  const t = (q: string) => rankThemes(T, q).map((r) => `${r.item.market}:${r.item.name}`);
  it("정확 일치가 먼저, 같은 등급이면 사전 순서", () => {
    assert.deepEqual(t("반도체"), ["kr:반도체", "us:반도체 장비·소재", "us:AI반도체"]);
  });
  it("가운뎃점·띄어쓰기를 무시하고, 별칭을 받는다", () => {
    assert.deepEqual(t("ai소프트"), ["kr:AI·소프트웨어"]);
    assert.deepEqual(t("이차전지"), ["kr:2차전지"]);
  });
});
