/**
 * lib/insider-brief.ts — 내부자 리포트 둘째 줄 [매매 방향 | 오늘의 브리핑]. 숫자는 매매 방향(축마다 산 쪽 · 판 쪽 합계),
 * 브리핑은 아래 모듈과 다른 잣대로 고른 종목을 적는다. 겹친 곳은 문턱(의원 둘 · 거물 셋)이 없으면 62곳이 나왔다(2026-10-04).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { insiderBrief, insiderLean, sellSize, type InsiderBriefRow, type InsiderSellRow } from "../lib/insider-brief.ts";
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
  execSellSize: { under: 0, over: 0 },
  congressTickers: [] as CongressTicker[],
  managerAdds: [] as ManagerMove[],
  managerTrims: [] as ManagerMove[],
  compareQuarters: ["2026-03-31", "2026-06-30"],
  scale: { officers: 0, members: 0, managers: 30, windowDays: 90 },
};

const text = (r: InsiderBriefRow) => r.parts.map((p) => (typeof p === "string" ? p : `[${p.name}]`)).join("");
const row = (rows: InsiderBriefRow[], key: InsiderBriefRow["key"]) => rows.find((r) => r.key === key)!;

describe("sellSize — 임원이 판 몫", () => {
  const s = (owner: string, ticker: string, shares: number, after: number | null, date: string, acc = "a", seq = 0, code = "S"): InsiderSellRow => ({
    ticker,
    owner_name: owner,
    shares,
    shares_after: after,
    transaction_code: code,
    transaction_date: date,
    accession_no: acc,
    seq,
  });

  it("사람(같은 종목) 하나가 한 칸 — 판 주식 합 ÷ (합 + 마지막 줄의 남은 주식)", () => {
    const r = sellSize([
      // 가격대별로 다섯 줄에 나눠 절반을 판 사람 — 줄마다 재면 10% 미만이지만 합치면 50%.
      s("갑", "AAA", 100, 400, "2026-10-01", "a", 0),
      s("갑", "AAA", 100, 300, "2026-10-01", "a", 1),
      s("갑", "AAA", 100, 200, "2026-10-01", "a", 2),
      s("갑", "AAA", 100, 100, "2026-10-01", "a", 3),
      s("갑", "AAA", 100, 500, "2026-09-30", "b", 0), // 날짜가 더 이르다 — 마지막 줄이 아니다
      // 조금 판 사람
      s("을", "BBB", 10, 990, "2026-10-01"),
      // 같은 사람이라도 종목이 다르면 다른 칸
      s("을", "CCC", 50, 50, "2026-10-01"),
    ]);
    assert.deepEqual(r, { under: 1, over: 2 });
  });

  it("장내 매도(S)가 아닌 줄 · 이름 없는 줄 · 남은 주식을 모르는 줄은 안 센다", () => {
    const r = sellSize([
      s("갑", "AAA", 100, 0, "2026-10-01", "a", 0, "F"),
      { ...s("을", "BBB", 100, 0, "2026-10-01"), owner_name: null },
      s("병", "CCC", 100, null, "2026-10-01"),
    ]);
    assert.deepEqual(r, { under: 0, over: 0 });
  });

  it("딱 10% 는 '10% 이상'", () => {
    assert.deepEqual(sellSize([s("갑", "AAA", 10, 90, "2026-10-01")]), { under: 0, over: 1 });
  });
});

describe("insiderLean — 매매 방향", () => {
  it("임원은 판 몫(사람 수), 의원은 건수, 거물은 늘린 쪽 · 줄인 쪽이 더 많은 종목 수", () => {
    const rows = insiderLean({
      ...base,
      buys: [exec("A", 30, 0), exec("B", 0, 500)],
      execSellSize: { under: 41, over: 19 },
      congressTickers: [congress("X", 2, 3, 1), congress("Y", 1, 0, 4)],
      managerAdds: [move("M1", 3, 1), move("M2", 2, 2), move("M3", 1, 0)],
      managerTrims: [move("T1", 4, 0), move("M2", 2, 2)],
    });
    assert.deepEqual(
      rows.map((r) => [r.key, r.tone, r.leftLabel, r.left, r.rightLabel, r.right, r.unit]),
      [
        ["exec", "size", "조금 판", 41, "많이 판", 19, "명"],
        ["congress", "dir", "매수", 3, "매도", 5, "건"],
        // M2 는 늘린 · 줄인 거물이 같아 어느 쪽에도 안 든다.
        ["managers", "dir", "늘림", 2, "줄임", 1, "종목"],
      ],
    );
  });

  it("견줄 분기가 없으면 거물 줄을 뺀다", () => {
    const rows = insiderLean({ ...base, compareQuarters: ["2026-06-30"], managerAdds: [move("A", 3, 0)] });
    assert.deepEqual(rows.map((r) => r.key), ["exec", "congress"]);
  });
});

describe("insiderBrief — 임원", () => {
  it("신고가 없으면 없다고 적는다", () => {
    assert.equal(text(row(insiderBrief(base), "exec")), "최근 7일에는 임원 신고가 없습니다.");
  });

  it("장내 매수가 없으면 없다고", () => {
    const r = row(insiderBrief({ ...base, buys: [exec("AAA", 0, 100), exec("BBB", 0, 50)] }), "exec");
    assert.equal(text(r), "최근 7일 신고가 들어온 2개 종목 가운데 장내에서 산 종목은 없습니다.");
  });

  it("한 종목이면 '가장 크게'라 부르지 않는다", () => {
    const r = row(insiderBrief({ ...base, buys: [exec("ORCL", 30, 0, "오라클"), exec("BBB", 0, 50)] }), "exec");
    assert.equal(text(r), "최근 7일 신고가 들어온 2개 종목 가운데 장내에서 산 종목은 [오라클] 하나입니다.");
  });

  it("여럿이면 산 금액이 가장 큰 종목 — 모듈 순서(처분 · 매수 섞인 금액 순)와 다르다", () => {
    const r = row(insiderBrief({ ...base, buys: [exec("BIG", 0, 900), exec("SMALL", 10, 0), exec("MID", 40, 5)] }), "exec");
    assert.equal(text(r), "최근 7일 신고가 들어온 3개 종목 가운데 장내에서 산 종목은 2개이고, 가장 크게 산 종목은 [MID]입니다.");
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

  it("의원 둘 이상이 사고 거물 셋 이상이 늘린 종목 — 사람 수 합이 많은 순, 넷째부터는 '외 N곳'", () => {
    const r = row(insiderBrief(ov), "overlap");
    assert.equal(text(r), "의원 둘 이상이 사고 거물 셋 이상이 늘린 종목은 [넷] · [TWO] · [X1] 외 1곳입니다.");
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
