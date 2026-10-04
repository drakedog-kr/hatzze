/**
 * lib/insider-brief.ts — 내부자 리포트 '오늘의 브리핑' 줄 넷. 아래 모듈의 1등을 되풀이하지 않고 합계 · 다른 순서의 한 종목 ·
 * 의원과 거물이 함께 산 종목을 적는다. 겹친 곳은 문턱(의원 둘 · 거물 셋)이 없으면 62곳이 나왔다(2026-10-04).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { insiderBrief, type InsiderBriefPart, type InsiderBriefRow } from "../lib/insider-brief.ts";
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
  congressTickers: [] as CongressTicker[],
  managerAdds: [] as ManagerMove[],
  managerTrims: [] as ManagerMove[],
  compareQuarters: ["2026-03-31", "2026-06-30"],
  scale: { officers: 0, members: 0, managers: 30, windowDays: 90 },
};

const text = (r: InsiderBriefRow) =>
  r.parts.map((p) => (typeof p === "string" ? p : "usd" in p ? `$${p.usd}` : `[${p.name}]`)).join("");
const row = (rows: InsiderBriefRow[], key: InsiderBriefRow["key"]) => rows.find((r) => r.key === key)!;

describe("insiderBrief — 임원", () => {
  it("신고가 없으면 없다고 적는다", () => {
    assert.equal(text(row(insiderBrief(base), "exec")), "최근 7일에는 임원 신고가 없습니다.");
  });

  it("장내 매수가 없으면 처분 합계만", () => {
    const r = row(insiderBrief({ ...base, buys: [exec("AAA", 0, 100), exec("BBB", 0, 50), exec("CCC", 0, 0)] }), "exec");
    assert.equal(text(r), "최근 7일 임원 신고가 들어온 3개 종목 가운데 장내 매수는 없고, 처분은 2개 종목 $150입니다.");
  });

  it("장내 매수가 한 종목이면 '가장 크게'라 부르지 않는다", () => {
    const r = row(insiderBrief({ ...base, buys: [exec("ORCL", 30, 0, "오라클"), exec("BBB", 0, 50)] }), "exec");
    assert.equal(text(r), "최근 7일 임원 신고가 들어온 2개 종목 가운데 장내 매수는 1개 종목 $30, 처분은 1개 종목 $50입니다. 장내에서 산 종목은 [오라클] 하나입니다.");
  });

  it("여럿이면 산 금액이 가장 큰 종목 — 모듈 순서(처분 · 매수 섞인 금액 순)와 다르다", () => {
    const r = row(insiderBrief({ ...base, buys: [exec("BIG", 0, 900), exec("SMALL", 10, 0), exec("MID", 40, 5)] }), "exec");
    assert.match(text(r), /장내 매수는 2개 종목 \$50, 처분은 2개 종목 \$905입니다\. 가장 크게 산 종목은 \[MID\]입니다\.$/);
  });
});

describe("insiderBrief — 의원", () => {
  it("의원 수 · 종목 수 · 매수 · 매도 건수를 더한다", () => {
    const r = row(
      insiderBrief({ ...base, scale: { ...base.scale, members: 43 }, congressTickers: [congress("A", 2, 3, 1), congress("B", 1, 0, 4)] }),
      "congress",
    );
    assert.equal(text(r), "최근 90일 의원 43명이 2개 종목을 신고했습니다. 매수 3건 · 매도 5건입니다.");
  });
});

describe("insiderBrief — 거물", () => {
  it("견줄 분기가 없으면 없다고", () => {
    assert.equal(text(row(insiderBrief({ ...base, compareQuarters: ["2026-06-30"] }), "managers")), "견줄 직전 분기가 아직 없습니다.");
  });

  it("늘린 쪽 · 줄인 쪽이 더 많은 종목만 세고, 새로 담은 거물이 둘 이상인 종목 가운데 가장 많은 곳", () => {
    const r = row(
      insiderBrief({
        ...base,
        managerAdds: [move("A", 5, 1, 1), move("B", 2, 2, 0), move("C", 3, 0, 3, "씨"), move("D", 4, 0, 3)],
        managerTrims: [move("E", 2, 0), move("B", 2, 2)],
      }),
      "managers",
    );
    // B 는 늘린 · 줄인 거물이 같아 어느 쪽에도 안 든다. 새로 담은 3곳이 둘(C · D)이면 움직인 거물이 많은 D.
    assert.equal(text(r), "2026년 2분기에 직전 분기보다 늘린 거물이 더 많은 종목은 3개, 줄인 거물이 더 많은 종목은 1개입니다. 새로 담은 거물이 가장 많은 종목은 [D]입니다.");
  });

  it("새로 담은 거물이 한 명뿐이면 그 문장을 안 쓴다", () => {
    const r = row(insiderBrief({ ...base, managerAdds: [move("A", 5, 0, 1)] }), "managers");
    assert.doesNotMatch(text(r), /새로 담은/);
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
    });
    const JOSA = /^[은는이가을를와과의에로도만]/;
    for (const r of rows) {
      r.parts.forEach((p: InsiderBriefPart, i) => {
        if (typeof p === "string" || "usd" in p) return;
        const next = r.parts[i + 1];
        if (typeof next === "string") assert.doesNotMatch(next, JOSA, `${r.key}: [${p.name}]${next}`);
      });
    }
  });

  it("줄은 늘 넷이고 순서가 같다", () => {
    assert.deepEqual(insiderBrief(base).map((r) => r.key), ["exec", "congress", "managers", "overlap"]);
  });
});
