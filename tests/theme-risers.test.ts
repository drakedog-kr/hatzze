/**
 * lib/theme-risers.ts — /theme·/theme/us '테마별 급부상 종목' 줄 세우기. 테마마다 **가장 최근 요약 행**의 riser 를
 * 쓰고, 그 행의 riser 가 비었으면(오늘 후보 없음) 그 테마는 줄이 없다 — 어제 riser 로 거슬러 가지 않는다.
 * 돌리는 법: `npm test`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { RISER_MAX, parseRisers, type RiserRow } from "../lib/theme-risers.ts";

const riser = (code: string, ratio: number | null, reason: string, recent = 10) => ({
  code,
  name: code,
  market: "KOSPI",
  recent,
  prior: ratio == null ? 0 : recent / ratio,
  ratio,
  reason,
});
const row = (date: string, theme: string, r: RiserRow["riser"]): RiserRow => ({ theme, date, riser: r });
const all = () => true;

describe("parseRisers", () => {
  it("오늘 행의 riser 가 비었으면 어제 riser 를 끌어오지 않는다", () => {
    // 파이프라인은 테마마다 하루 한 행을 쓰고, 오늘 상위 열에 못 든 테마는 riser: null 이다
    // (generate_theme_briefs.py). 조선·원전은 어제만 riser 가 있었다.
    const rows: RiserRow[] = [
      row("2026-09-29", "반도체", riser("000660", 2, "오늘 까닭")),
      row("2026-09-29", "방산", riser("012450", 1.67, "오늘 까닭")),
      row("2026-09-29", "조선", null),
      row("2026-09-29", "원전", null),
      row("2026-09-28", "반도체", riser("000660", 6, "어제 까닭")),
      row("2026-09-28", "조선", riser("010140", null, "어제 까닭")),
      row("2026-09-28", "원전", riser("034020", 5, "어제 까닭")),
    ];
    const out = parseRisers(rows, all);
    assert.deepEqual(
      out.map((r) => [r.theme, r.reason]),
      [
        ["반도체", "오늘 까닭"],
        ["방산", "오늘 까닭"],
      ],
    );
  });
  it("오늘 행이 아예 없는 테마는 하루 거슬러 간다(요약과 같은 규칙)", () => {
    const rows: RiserRow[] = [
      row("2026-09-29", "반도체", riser("000660", 2, "오늘 까닭")),
      row("2026-09-28", "반도체", riser("000660", 6, "어제 까닭")),
      row("2026-09-28", "원전", riser("034020", 5, "어제 까닭")),
    ];
    assert.deepEqual(
      parseRisers(rows, all).map((r) => [r.theme, r.reason]),
      [
        ["원전", "어제 까닭"],
        ["반도체", "오늘 까닭"],
      ],
    );
  });
  it("새로 등장 > 배수 > 언급 수 순이고 사전에 없는 테마는 뺀다, 최대 RISER_MAX 줄", () => {
    const rows: RiserRow[] = [
      row("2026-09-29", "A", riser("1", 2, "a", 10)),
      row("2026-09-29", "B", riser("2", null, "b", 6)),
      row("2026-09-29", "C", riser("3", 2, "c", 30)),
      row("2026-09-29", "사전에 없음", riser("4", null, "x", 99)),
      ...Array.from({ length: RISER_MAX }, (_, i) => row("2026-09-29", `T${i}`, riser(`t${i}`, 1.5, "t", 5))),
    ];
    const out = parseRisers(rows, (t) => t !== "사전에 없음");
    assert.equal(out.length, RISER_MAX);
    assert.deepEqual(out.slice(0, 3).map((r) => r.theme), ["B", "C", "A"]);
  });
});
