/**
 * lib/event-group.ts — 일정 줄 묶기. 2026-10-04 점검에서 같은 일정이 여러 줄로 갈리고(10/8 · 10/9 · 10월 중), 다른 일정이 한 줄로
 * 합쳐져 채널 수가 부풀었다(삼성전자 '잠정실적발표 6곳'에 배당 · 자사주 채널). 돌리는 법: `npm test`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { dropAlreadyHappened, eventKind, groupEventRows, periodStart, type EventRowLike } from "../lib/event-group.ts";

const row = (code: string, channel: string, date: string, precision: EventRowLike["precision"], event: string): EventRowLike => ({
  code,
  channel,
  date,
  precision,
  event,
  postedAt: "2026-10-01T00:00:00Z",
});

describe("periodStart · eventKind", () => {
  it("달 단위가 1일 · 15일 · 말일로 갈려도 같은 첫날", () => {
    assert.equal(periodStart("2026-10-31", "month"), "2026-10-01");
    assert.equal(periodStart("2026-10-15", "month"), "2026-10-01");
    assert.equal(periodStart("2026-08-20", "quarter"), "2026-07-01");
    assert.equal(periodStart("2026-12-31", "year"), "2026-01-01");
  });

  it("표기가 갈리는 실적 · 배당은 한 종류", () => {
    assert.equal(eventKind("3분기 잠정 실적 발표"), eventKind("잠정실적발표"));
    assert.equal(eventKind("특별배당 확정"), eventKind("3분기 배당 확정 이사회"));
    assert.notEqual(eventKind("잠정실적발표"), eventKind("자사주 매입 조기 종료"));
  });
});

describe("groupEventRows", () => {
  it("같은 날 다른 일정은 다른 줄 · 채널 수는 그 일정을 말한 채널만", () => {
    const out = groupEventRows([
      row("005930", "a", "2026-10-01", "month", "잠정실적발표"),
      row("005930", "b", "2026-10-31", "month", "3분기 잠정 실적 발표"),
      row("005930", "c", "2026-10-01", "month", "자사주 매입 조기 종료"),
    ]);
    const byKind = new Map(out.map((e) => [eventKind(e.event), e]));
    assert.equal(byKind.get("실적")?.channels, 2);
    assert.equal(byKind.get("자사주")?.channels, 1);
    assert.equal(byKind.get("실적")?.date, "2026-10-01");
  });

  it("넓은 기간 줄은 그 안의 같은 이야기 날짜 줄로 접는다 · 가까운 날 한 채널 줄은 뺀다", () => {
    const out = groupEventRows([
      row("005930", "a", "2026-10-08", "day", "3분기 잠정 실적 발표"),
      row("005930", "b", "2026-10-08", "day", "잠정실적 발표"),
      row("005930", "c", "2026-10-09", "day", "3분기 잠정실적 발표"),
      row("005930", "d", "2026-10-01", "month", "잠정실적발표"),
    ]);
    assert.equal(out.length, 1);
    assert.equal(out[0].date, "2026-10-08");
    assert.equal(out[0].channels, 3); // a · b + 달 줄의 d
  });

  it("매출 · 신주 표기가 갈려도 한 줄 — 분기 실적과는 다른 줄(2026-10-05 점검)", () => {
    const out = groupEventRows([
      row("TSM", "a", "2026-10-08", "day", "9월 매출 실적 공개"),
      row("TSM", "b", "2026-10-08", "day", "9월 매출 발표"),
      row("TSM", "c", "2026-10-01", "month", "3분기 실적 발표"),
      row("207940", "a", "2026-10-06", "day", "신주 배정일"),
      row("207940", "b", "2026-10-06", "day", "신주 배정 기준일"),
      row("207940", "c", "2026-10-06", "day", "유상증자 신주 배정 기준일"),
    ]);
    const tsm = out.filter((e) => e.code === "TSM");
    assert.equal(tsm.length, 2);
    assert.equal(tsm.find((e) => eventKind(e.event) === "매출")?.channels, 2);
    const sb = out.filter((e) => e.code === "207940");
    assert.equal(sb.length, 1);
    assert.equal(sb[0].channels, 3);
    assert.equal(eventKind("신주 상장"), "상장");
  });

  it("발행가 · 납입 · 판매 개시 표기가 갈려도 한 줄 — 공고와 청약은 따로(2026-10-05 점검)", () => {
    const out = groupEventRows([
      row("247540", "a", "2026-10-13", "day", "확정 발행가액 공고"),
      row("247540", "b", "2026-10-13", "day", "2차 발행가액 확정 공고"),
      row("247540", "c", "2026-10-15", "day", "유상증자 청약"),
      row("247540", "a", "2026-10-23", "day", "유상증자 납입"),
      row("247540", "b", "2026-10-23", "day", "유상증자 납입 기일"),
      row("NVDA", "a", "2026-10-23", "day", "DGX Spark 64GB/128GB 판매 개시"),
      row("NVDA", "b", "2026-10-23", "day", "DGX Spark 출시"),
    ]);
    assert.equal(out.filter((e) => e.code === "247540").length, 3);
    assert.equal(out.filter((e) => e.code === "NVDA").length, 1);
  });

  it("한 번뿐인 일이 가까운 날 한 채널씩 두 줄이면 먼저 짚인 줄만 · 배당은 그대로", () => {
    const r = (code: string, ch: string, date: string, ev: string, posted: string): EventRowLike => ({ ...row(code, ch, date, "day", ev), postedAt: posted });
    const out = groupEventRows([
      r("005930", "a", "2026-10-07", "3분기 잠정실적 발표", "2026-10-01T00:00:00Z"),
      r("005930", "b", "2026-10-08", "3분기 잠정 실적 발표", "2026-10-02T00:00:00Z"),
      r("005930", "a", "2026-10-06", "배당 기준일", "2026-10-01T00:00:00Z"),
      r("005930", "b", "2026-10-08", "배당금 지급", "2026-10-02T00:00:00Z"),
    ]);
    const earn = out.filter((e) => eventKind(e.event) === "실적");
    assert.equal(earn.length, 1);
    assert.equal(earn[0].date, "2026-10-07");
    assert.equal(out.filter((e) => eventKind(e.event) === "배당").length, 2);
  });

  it("한 번뿐인 일은 채널이 많은 줄로 · 인수 표기 · 한 글자 다른 글은 한 줄(2026-10-05 점검)", () => {
    const out = groupEventRows([
      row("005930", "a", "2026-10-07", "day", "3분기 잠정실적 발표"),
      row("005930", "b", "2026-10-07", "day", "3분기 잠정실적 발표"),
      ...["c", "d", "e"].map((ch) => row("005930", ch, "2026-10-08", "day", "3분기 잠정 실적 발표")),
      row("207940", "a", "2026-11-13", "day", "PolyPeptide Group AG 인수"),
      row("207940", "b", "2026-11-13", "day", "폴리펩타이드그룹 인수 완료"),
      row("000660", "a", "2027-02-01", "month", "용인 Y1 첫 클린룸 개설"),
      row("000660", "b", "2027-02-01", "month", "용인 Y1 첫 클린룸 개설"),
      row("000660", "c", "2027-02-01", "month", "용인 Y1 클린룸 개설"),
    ]);
    const sam = out.filter((e) => e.code === "005930");
    assert.equal(sam.length, 1);
    assert.equal(sam[0].date, "2026-10-08");
    assert.equal(out.filter((e) => e.code === "207940").length, 1);
    const hy = out.filter((e) => e.code === "000660");
    assert.equal(hy.length, 1);
    assert.equal(hy[0].channels, 3);
  });

  it("다른 종목 · 다른 기간은 그대로", () => {
    const out = groupEventRows([
      row("000660", "a", "2026-10-27", "day", "실적발표"),
      row("000660", "b", "2027-01-01", "month", "실적 발표"),
    ]);
    assert.equal(out.length, 2);
  });
});

describe("dropAlreadyHappened", () => {
  it("지난 며칠 안에 여러 채널이 짚은 같은 이야기면 앞으로의 한 채널 줄을 뺀다", () => {
    const past = groupEventRows([row("MU", "a", "2026-10-01", "day", "실적발표"), row("MU", "b", "2026-10-01", "day", "4분기 실적 발표")]);
    const future = [
      { code: "MU", event: "실적 발표", channels: 1 },
      { code: "MU", event: "투자자 행사", channels: 1 },
      { code: "NVDA", event: "실적 발표", channels: 1 },
    ];
    assert.deepEqual(
      dropAlreadyHappened(future, past).map((f) => `${f.code} ${f.event}`),
      ["MU 투자자 행사", "NVDA 실적 발표"],
    );
  });
});
