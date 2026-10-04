/**
 * lib/insider-brief.ts — 내부자 리포트 둘째 줄 [매매 방향 | 오늘의 브리핑]. 숫자는 매매 방향(의원 · 거물 · 증권가의 오르는 쪽 · 내리는 쪽),
 * 브리핑은 아래 모듈과 다른 잣대로 고른 종목을 적는다. 겹친 곳은 문턱(의원 둘 · 거물 셋)이 없으면 62곳이 나왔다(2026-10-04).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { insiderBrief, insiderLean, targetMoves, type InsiderBriefRow } from "../lib/insider-brief.ts";
import type { CongressTicker, InsiderActivity, ManagerMove } from "../lib/insider-data.ts";

const exec = (ticker: string, bought: number, disposed: number, name = ticker): InsiderActivity => ({
  ticker,
  name,
  disposedValue: disposed,
  boughtValue: bought,
  buyCount: bought > 0 ? 1 : 0,
  people: 1,
  buyPeople: bought > 0 ? 1 : 0,
  sellPeople: disposed > 0 ? 1 : 0,
  names: [],
  codes: [],
  filedDate: "2026-10-02",
  boughtFiled: bought > 0 ? "2026-10-02" : null,
  disposedFiled: disposed > 0 ? "2026-10-02" : null,
  value: Math.max(bought, disposed),
  direction: bought > disposed ? "buy" : "disposed",
});

const congress = (ticker: string, buyers: number, buys: number, sells: number, name = ""): CongressTicker => ({
  ticker,
  name,
  buys,
  sells,
  members: buyers,
  memberNames: [],
  buyMembers: Array.from({ length: buyers }, (_, i) => `의원${i}`),
  sellMembers: [],
  latest: "2026-09-30",
  buyLatest: buys > 0 ? "2026-09-30" : null,
  sellLatest: sells > 0 ? "2026-09-30" : null,
  inKadera: false,
});

const move = (ticker: string, movers: number, against: number, mark = 0, name = ticker): ManagerMove => ({
  ticker,
  name,
  mark,
  names: [],
  movers,
  against,
  inKadera: false,
});

const base = {
  windowDays: 7,
  congressWindowDays: 90,
  buys: [] as InsiderActivity[],
  targetMoves: { up: 0, down: 0, end: null as string | null },
  congressTickers: [] as CongressTicker[],
  managerAdds: [] as ManagerMove[],
  managerTrims: [] as ManagerMove[],
  managerMoveTotals: { up: 0, down: 0 },
  compareQuarters: ["2026-03-31", "2026-06-30"],
  scale: { officers: 0, members: 0, managers: 30, windowDays: 90 },
};

const text = (r: InsiderBriefRow) => r.parts.map((p) => (typeof p === "string" ? p : `[${p.name}]`)).join("");
const row = (rows: InsiderBriefRow[], key: InsiderBriefRow["key"]) => rows.find((r) => r.key === key)!;

describe("targetMoves — 증권가 목표가", () => {
  const a = (action_date: string, target_old: number | null, target_now: number | null) => ({ action_date, target_old, target_now });

  it("마지막 의견 날부터 7일 — 올린 · 내린 건수, 그대로거나 직전 값이 없으면 안 센다", () => {
    const r = targetMoves([
      a("2026-10-03", 100, 120), // 올림
      a("2026-10-01", 100, 90), // 내림
      a("2026-09-27", 50, 60), // 올림 — 끝(10/3)에서 7일째, 든다
      a("2026-09-26", 50, 40), // 8일째 — 안 든다
      a("2026-10-02", 70, 70), // 그대로
      a("2026-10-02", null, 80), // 신규 개시
    ]);
    assert.deepEqual(r, { up: 2, down: 1, end: "2026-10-03" });
  });

  it("줄이 없으면 0", () => {
    assert.deepEqual(targetMoves([]), { up: 0, down: 0, end: null });
  });
});

describe("insiderLean — 매매 방향", () => {
  it("의원 → 거물 → 증권가 — 의원은 매수 · 매도 건수, 거물은 늘린 · 줄인 전체 건수(거물 한 명 · 종목 하나가 한 건), 증권가는 목표가 올림 · 내림", () => {
    const rows = insiderLean({
      ...base,
      targetMoves: { up: 66, down: 59, end: "2026-10-03" },
      congressTickers: [congress("X", 2, 3, 1), congress("Y", 1, 0, 4)],
      managerAdds: [move("M1", 3, 1), move("M3", 1, 0)],
      managerTrims: [move("T1", 4, 0)],
      // 순증감으로 갈린 목록 밖(늘린 수 = 줄인 수인 M2 · 순으로 반대쪽 종목의 건)까지 든 전체 — 목록의 movers 합(4 · 4)이 아니다.
      managerMoveTotals: { up: 9, down: 8 },
    });
    assert.deepEqual(
      rows.map((r) => [r.key, r.span, r.leftLabel, r.left, r.rightLabel, r.right, r.unit]),
      [
        ["congress", "90일", "매수", 3, "매도", 5, "건"],
        ["managers", "2026 Q2", "늘림", 9, "줄임", 8, "건"],
        ["analyst", "목표가 · 7일", "올림", 66, "내림", 59, "건"],
      ],
    );
  });

  it("견줄 분기가 없으면 거물 줄을 뺀다", () => {
    const rows = insiderLean({ ...base, compareQuarters: ["2026-06-30"], managerAdds: [move("A", 3, 0)] });
    assert.deepEqual(rows.map((r) => r.key), ["congress", "analyst"]);
  });
});

describe("insiderBrief — 임원", () => {
  it("신고가 없으면 없다고 적는다", () => {
    assert.equal(text(row(insiderBrief(base), "exec")), "최근 7일에는 임원 매매 신고가 없습니다.");
  });

  it("장내 매수가 없으면 없다고", () => {
    const r = row(insiderBrief({ ...base, buys: [exec("AAA", 0, 100), exec("BBB", 0, 50)] }), "exec");
    assert.equal(text(r), "최근 7일 임원 매매가 신고된 2개 종목 가운데 장내에서 산 종목은 없습니다.");
  });

  it("금액이 없는 신고(무상 취득 · 옵션 행사 취득만)는 종목 수에 안 든다 — 전체보기 카드와 같은 모집단", () => {
    const r = row(insiderBrief({ ...base, buys: [exec("AAA", 0, 100), exec("ZERO", 0, 0)] }), "exec");
    assert.equal(text(r), "최근 7일 임원 매매가 신고된 1개 종목 가운데 장내에서 산 종목은 없습니다.");
  });

  it("한 종목이면 '가장 크게'라 부르지 않는다", () => {
    const r = row(insiderBrief({ ...base, buys: [exec("ORCL", 30, 0, "오라클"), exec("BBB", 0, 50)] }), "exec");
    assert.equal(text(r), "최근 7일 임원 매매가 신고된 2개 종목 가운데 장내에서 산 종목은 [오라클] 하나입니다.");
  });

  it("여럿이면 산 금액이 가장 큰 종목 — 모듈 순서(처분 · 매수 섞인 금액 순)와 다르다", () => {
    const r = row(insiderBrief({ ...base, buys: [exec("BIG", 0, 900), exec("SMALL", 10, 0), exec("MID", 40, 5)] }), "exec");
    assert.equal(text(r), "최근 7일 임원 매매가 신고된 3개 종목 가운데 장내에서 산 종목은 2개이고, 가장 크게 산 종목은 [MID]입니다.");
  });
});

describe("insiderBrief — 의원", () => {
  it("의원 수 · 종목 수, 산 의원이 가장 많은 종목(둘 이상일 때)", () => {
    const r = row(
      insiderBrief({ ...base, scale: { ...base.scale, members: 43 }, congressTickers: [congress("A", 2, 3, 1), congress("B", 3, 3, 9, "비")] }),
      "congress",
    );
    assert.equal(text(r), "최근 90일 의원 43명이 2개 종목을 신고했습니다. 가장 많은 의원이 산 종목은 [비]입니다.");
  });

  it("산 의원이 한 명씩이면 '가장 많은'을 안 쓴다", () => {
    const r = row(insiderBrief({ ...base, scale: { ...base.scale, members: 2 }, congressTickers: [congress("A", 1, 1, 0)] }), "congress");
    assert.equal(text(r), "최근 90일 의원 2명이 1개 종목을 신고했습니다.");
  });
});

describe("insiderBrief — 거물", () => {
  it("견줄 분기가 없으면 없다고", () => {
    assert.equal(text(row(insiderBrief({ ...base, compareQuarters: ["2026-06-30"] }), "managers")), "견줄 직전 분기가 아직 없습니다.");
  });

  it("새로 담은 · 다 판 거물이 가장 많은 종목 — 같으면 티커 순", () => {
    const r = row(
      insiderBrief({
        ...base,
        managerAdds: [move("A", 5, 1, 1), move("C", 3, 0, 3, "씨"), move("B", 4, 0, 3)],
        managerTrims: [move("E", 2, 0, 2), move("F", 9, 0, 1)],
      }),
      "managers",
    );
    assert.equal(text(r), "2026년 2분기에 새로 담은 거물이 가장 많은 종목은 [B]입니다. 다 판 거물이 가장 많은 종목은 [E]입니다.");
  });

  it("둘 다 한 명뿐이면 없다고", () => {
    const r = row(insiderBrief({ ...base, managerAdds: [move("A", 5, 0, 1)], managerTrims: [move("B", 2, 0, 1)] }), "managers");
    assert.equal(text(r), "2026년 2분기에 거물 둘 이상이 새로 담거나 다 판 종목은 없습니다.");
  });
});

describe("insiderBrief — 겹친 곳", () => {
  const ov = {
    ...base,
    congressTickers: [
      congress("TWO", 2, 3, 0),
      congress("ONE", 1, 5, 0), // 산 의원 한 명 — 문턱 밖
      congress("SOLD", 3, 1, 2), // 매도가 더 많다 — 밖
      congress("FOUR", 4, 4, 0, "넷"),
      congress("LOW", 3, 3, 0), // 거물 둘 — 밖
      congress("X1", 2, 2, 0),
      congress("X2", 2, 2, 0),
    ],
    managerAdds: [move("TWO", 3, 0), move("ONE", 9, 0), move("SOLD", 9, 0), move("FOUR", 3, 1), move("LOW", 2, 0), move("X1", 3, 0), move("X2", 3, 0)],
  };

  it("의원 둘 이상이 사고 거물 셋 이상이 늘린 종목 — 사람 수 합이 많은 순, 넷째부터는 '외 N종목'", () => {
    const r = row(insiderBrief(ov), "overlap");
    assert.equal(text(r), "의원 둘 이상이 사고 거물 셋 이상이 늘린 종목은 [넷] · [TWO] · [X1] 외 1종목입니다.");
  });

  it("없으면 없다고", () => {
    assert.equal(text(row(insiderBrief(base), "overlap")), "의원 둘 이상이 사고 거물 셋 이상이 늘린 종목은 없습니다.");
  });
});

describe("insiderBrief — 문장 꼴", () => {
  it("종목 바로 뒤에 조사를 붙이지 않는다(라틴 티커는 받침을 모른다)", () => {
    const rows = insiderBrief({
      ...base,
      buys: [exec("AAPL", 10, 0), exec("NVDA", 20, 0)],
      congressTickers: [congress("MU", 2, 2, 0)],
      managerAdds: [move("MU", 3, 0, 2)],
      managerTrims: [move("TSM", 3, 0, 2)],
    });
    const JOSA = /^[은는이가을를와과의에로도만]/;
    for (const r of rows) {
      r.parts.forEach((p, i) => {
        if (typeof p === "string") return;
        const next = r.parts[i + 1];
        if (typeof next === "string") assert.doesNotMatch(next, JOSA, `${r.key}: [${p.name}]${next}`);
      });
    }
  });

  it("줄은 늘 넷이고 순서가 같다", () => {
    assert.deepEqual(insiderBrief(base).map((r) => r.key), ["exec", "congress", "managers", "overlap"]);
  });
});
