/**
 * lib/insider-13f.ts — 월가 거물(13F) 보유를 두 분기로 견주는 규칙.
 *
 * 분기는 **그 운용사가 낸 분기**에서 고른다. 종목 상세가 한때 그 종목의 행만 보고 분기를
 * 골라서, 새로 담은 곳은 '신규'가 영영 안 붙고 전량 정리한 곳은 지난 분기 보유로 "들고
 * 있다"고 떴다. 버크셔처럼 클래스가 둘인 종목은 한 운용사가 한 분기에 행을 둘 갖는데,
 * 앞의 한 줄만 집어 금액이 반쪽이 되고 BRK-A 주식 수를 BRK-B 와 견주기도 했다.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { filedQuarters, stockPosition } from "../lib/insider-13f.ts";

const Q4 = "2025-12-31";
const Q1 = "2026-03-31";
const Q2 = "2026-06-30";

const row = (ticker: string, report_date: string, shares: number, value: number) => ({ ticker, report_date, shares, value });

describe("filedQuarters", () => {
  it("운용사마다 자기가 낸 분기를 오래된 순으로 모은다(한 분기 늦은 곳은 늦은 대로)", () => {
    const q = filedQuarters([
      { cik: 1, report_date: Q2 },
      { cik: 1, report_date: Q1 },
      { cik: 1, report_date: Q2 },
      { cik: 2, report_date: Q1 },
      { cik: 2, report_date: Q4 },
    ]);
    assert.deepEqual(q.get(1), [Q1, Q2]);
    assert.deepEqual(q.get(2), [Q4, Q1]);
  });
});

describe("stockPosition", () => {
  it("이번 분기에 새로 담은 곳은 '신규'다 — 직전 분기에 이 종목 행이 없어도 운용사는 그 분기를 냈다", () => {
    const p = stockPosition([row("XYZ", Q2, 70, 7000)], [Q1, Q2]);
    assert.ok(p);
    assert.equal(p.move, "new");
    assert.equal(p.sharesChange, null);
    assert.equal(p.reportDate, Q2);
  });

  it("전량 정리한 곳은 보유자가 아니다 — 지난 분기 행으로 '들고 있다'고 하지 않는다", () => {
    assert.equal(stockPosition([row("XYZ", Q1, 80, 8000)], [Q1, Q2]), null);
  });

  it("주식 수로 늘린 곳은 늘림, 증감률은 인물 상세와 같은 식", () => {
    const p = stockPosition([row("XYZ", Q1, 100, 1000), row("XYZ", Q2, 150, 1800)], [Q1, Q2]);
    assert.ok(p);
    assert.equal(p.move, "add");
    assert.equal(p.sharesChange, 50);
    assert.equal(p.value, 1800);
  });

  it("직전 분기를 아예 안 낸 곳만 비교 불가(null)다", () => {
    const p = stockPosition([row("XYZ", Q2, 100, 1000)], [Q2]);
    assert.ok(p);
    assert.equal(p.move, null);
  });

  it("쌓여 남은 옛 분기와 견주지 않는다 — 직전 분기에 없다가 다시 담았으면 신규", () => {
    const p = stockPosition([row("XYZ", Q4, 100, 1000), row("XYZ", Q2, 100, 1000)], [Q4, Q1, Q2]);
    assert.ok(p);
    assert.equal(p.move, "new");
  });

  it("한 분기 늦게 내는 곳(퍼싱 스퀘어)은 자기 두 분기로 견준다", () => {
    const p = stockPosition([row("XYZ", Q4, 10, 100), row("XYZ", Q1, 10, 120)], [Q4, Q1]);
    assert.ok(p);
    assert.equal(p.move, "hold");
    assert.equal(p.reportDate, Q1);
  });

  it("클래스가 둘이면 금액을 더하고, 행 순서와 무관하게 같은 판정이다", () => {
    const rows = [
      row("BRK-A", Q2, 1, 740_000),
      row("BRK-B", Q2, 150, 75_000),
      row("BRK-A", Q1, 1, 700_000),
      row("BRK-B", Q1, 100, 48_000),
    ];
    const a = stockPosition(rows, [Q1, Q2]);
    const b = stockPosition([...rows].reverse(), [Q1, Q2]);
    assert.ok(a && b);
    assert.equal(a.value, 815_000);
    assert.equal(a.move, "add");
    assert.deepEqual(b, a);
    // ⚠️ 주식 수를 그냥 더해 견주면(101 → 151) +50% 가 된다. A 1주가 B 1,500주 몫이라
    //    그 수는 없는 수다. 직전 분기 한 주 값으로 환산하면 50주 × $480 ÷ $748,000.
    assert.ok(a.sharesChange !== null && Math.abs(a.sharesChange - (50 * 480 * 100) / 748_000) < 1e-9);
  });

  it("클래스를 하나 새로 담았으면 늘림이다(신규가 아니다 — 직전 분기에도 들고 있었다)", () => {
    const p = stockPosition([row("BRK-B", Q1, 100, 50_000), row("BRK-B", Q2, 100, 52_000), row("BRK-A", Q2, 1, 740_000)], [Q1, Q2]);
    assert.ok(p);
    assert.equal(p.move, "add");
    assert.equal(p.value, 792_000);
  });
});
