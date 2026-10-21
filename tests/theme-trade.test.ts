/**
 * lib/theme-trade.ts — 테마 거래대금(테마 판세 흐름 표 · 테마 상세 띠의 '3일 평균 거래대금'). 마이그레이션 106.
 * 최근 거래일 셋의 하루 평균과, 그 날마다 1주 앞(같은 요일) 거래일의 평균 대비 변화.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { fmtTrade, fmtTradeChange, themeTrades, tradeTone, tradingDays, type TradeRow } from "../lib/theme-trade.ts";

const row = (key: string, date: string, value: TradeRow["value"]): TradeRow => ({ key, date, value });

// 2026-10-07(수) · 08(목) · [09 한글날 휴장] · 12(월) · 13(화) · 14(수) · 15(목) · 16(금) · 19(월) · 20(화)
const DAYS = ["2026-10-07", "2026-10-08", "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-19", "2026-10-20"];

describe("tradingDays", () => {
  it("행이 기간 최대의 80% 미만인 날은 뺀다 — 미장 티커가 반쯤 찬 날", () => {
    const rows = [
      ...["A", "B", "C", "D", "E"].map((k) => row(k, "2026-10-19", 1)),
      ...["A", "B", "C", "D"].map((k) => row(k, "2026-10-16", 1)),
      ...["A", "B", "C"].map((k) => row(k, "2026-10-20", 1)),
    ];
    assert.deepEqual(tradingDays(rows), ["2026-10-16", "2026-10-19"]);
  });

  it("값이 빈 행은 세지 않는다(마이그레이션 106 전에 쌓인 날)", () => {
    assert.deepEqual(tradingDays([row("A", "2026-10-19", null), row("A", "2026-10-20", 5)]), ["2026-10-20"]);
  });
});

describe("themeTrades", () => {
  // 반도체 = A · B, 조선 = C. 하루에 A 10 · B 20 · C 1 이고, 최근 사흘(16 · 19 · 20)만 A 가 두 배.
  const rows = DAYS.flatMap((d) => {
    const hot = d >= "2026-10-16";
    return [row("A", d, hot ? 20 : 10), row("B", d, 20), row("C", d, 1)];
  });
  const members = { 반도체: ["A", "B"], 조선: ["C"], 빈테마: ["Z"] };

  it("최근 거래일 셋의 하루 평균 · 1주 앞 같은 요일과 견준 변화", () => {
    const t = themeTrades(rows, members);
    // 최근 16 · 19 · 20 → 1주 앞 09(휴장, 빠짐) · 12 · 13 — 그 둘의 평균 30 과 견준다.
    assert.deepEqual(t.get("반도체"), { avg: 40, change: 40 / 30 - 1, end: "2026-10-20", top: ["A", "B"] });
    assert.deepEqual(t.get("조선"), { avg: 1, change: 0, end: "2026-10-20", top: ["C"] });
  });

  it("곁줄 상위 종목 — 최근 사흘 합 순 · 이름으로", () => {
    const names = new Map([["A", "에이"], ["B", "비"]]);
    // 최근 사흘 A 20 · B 20 동률이면 열쇠 순.
    assert.deepEqual(themeTrades(rows, members, (k) => names.get(k)).get("반도체")?.top, ["에이", "비"]);
    const more = [...rows, ...DAYS.slice(-3).map((d) => row("B", d, 50))];
    assert.deepEqual(themeTrades(more, members, (k) => names.get(k)).get("반도체")?.top, ["비", "에이"]);
  });

  it("테마 종목 값이 하나도 없으면 빠진다", () => {
    assert.equal(themeTrades(rows, members).has("빈테마"), false);
  });

  it("최근 거래일이 셋이 안 되면 비운다 — 머리가 '3일 평균'이다", () => {
    assert.equal(themeTrades(rows.filter((r) => r.date >= "2026-10-19"), members).size, 0);
  });

  it("1주 앞 거래일이 하나도 없으면 변화는 null", () => {
    const t = themeTrades(rows.filter((r) => r.date >= "2026-10-14"), members);
    assert.equal(t.get("반도체")?.change, null);
    assert.equal(t.get("반도체")?.avg, 40);
  });

  it("문자열로 온 numeric 값도 숫자로 더한다(us_stock_price_daily.trade_value)", () => {
    const t = themeTrades(
      DAYS.slice(-3).map((d) => row("A", d, "1.5")),
      { x: ["A"] },
    );
    assert.equal(t.get("x")?.avg, 1.5);
  });
});

describe("fmtTrade", () => {
  it("국장 — 1조부터 소수 한 자리, 그 아래 억", () => {
    assert.equal(fmtTrade(11_896_400_000_000, "kr"), "11.9조");
    assert.equal(fmtTrade(853_200_000_000, "kr"), "8,532억");
    assert.equal(fmtTrade(28_000_000_000, "kr"), "280억");
  });

  it("미장 — 억 달러로", () => {
    assert.equal(fmtTrade(102_300_000_000, "us"), "1,023억 달러");
    assert.equal(fmtTrade(1_234_000_000_000, "us"), "1.2조 달러");
    assert.equal(fmtTrade(50_000_000, "us"), "1억 달러 미만");
  });
});

describe("fmtTradeChange", () => {
  it("반올림한 % · 오름 빨강 · 내림 파랑 · 0 은 안 적는다", () => {
    assert.deepEqual(fmtTradeChange(0.123), { text: "+12%", tone: "is-up" });
    assert.deepEqual(fmtTradeChange(-0.234), { text: "-23%", tone: "is-down" });
    assert.deepEqual(fmtTradeChange(12.5), { text: "+1,250%", tone: "is-up" });
    assert.equal(fmtTradeChange(0.004), null);
    assert.equal(fmtTradeChange(null), null);
  });
});

describe("tradeTone", () => {
  it("5% 안은 비슷 · 15% · 40% 에서 한 단씩", () => {
    assert.equal(tradeTone(null), "is-flat");
    assert.equal(tradeTone(0.04), "is-flat");
    assert.equal(tradeTone(-0.049), "is-flat");
    assert.equal(tradeTone(0.05), "is-up-1");
    assert.equal(tradeTone(-0.15), "is-down-2");
    assert.equal(tradeTone(0.6), "is-up-3");
    assert.equal(tradeTone(-0.31), "is-down-2");
  });
});
