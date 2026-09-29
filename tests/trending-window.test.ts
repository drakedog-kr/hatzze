/**
 * lib/trending-window.ts — 카더라 트렌딩 '오늘' 창의 시작점. 파이썬 사본(calculate_telegram_trending.py ·
 * calculate_us_trending.py 의 window_start)이 data-pipeline/tests/test_trending_window.py 에서 **같은
 * 예제로 같은 값**을 확인한다.
 *
 * 화면은 저장된 '오늘' 목록의 시작점이 이 값과 같을 때만 그 목록을 쓴다. 넘어가는 시각이 아침
 * 트렌딩 스텝보다 늦으면 아침 저장분이 '어제 0시부터'로 앉아, 그 시각부터 저녁 실행까지 저장
 * 목록을 버리고 느린 길로 뽑는다(미장은 대조 없이 어제 것을 '오늘'로 싣는다). 돌리는 법: `npm test`.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { FIRST_COLLECTION_HOUR_KST, trendingTodayStartISO } from "../lib/trending-window.ts";

/** 한국 시각 "2026-09-29 08:26" → UTC 에포크 ms. */
const kst = (s: string) => Date.parse(s.replace(" ", "T") + ":00+09:00");
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const TODAY = "2026-09-28T15:00:00.000Z"; // 2026-09-29 00:00 KST
const YESTERDAY = "2026-09-27T15:00:00.000Z"; // 2026-09-28 00:00 KST

describe("trendingTodayStartISO", () => {
  it("아침 트렌딩 스텝이 도는 08시대부터는 오늘 0시 — 아침 저장분과 같은 시작점이다", () => {
    assert.equal(trendingTodayStartISO(kst("2026-09-29 08:00")), TODAY);
    assert.equal(trendingTodayStartISO(kst("2026-09-29 08:26")), TODAY);
    assert.equal(trendingTodayStartISO(kst("2026-09-29 12:00")), TODAY);
    assert.equal(trendingTodayStartISO(kst("2026-09-29 18:10")), TODAY);
  });

  it("그 전(자정~07:59)엔 어제 0시 — 어제 저녁 저장분과 같은 시작점이다", () => {
    assert.equal(trendingTodayStartISO(kst("2026-09-29 00:31")), YESTERDAY);
    assert.equal(trendingTodayStartISO(kst("2026-09-29 07:59")), YESTERDAY);
  });
});

describe("파이프라인과 같은 시각", () => {
  it("파이썬 사본 둘의 FIRST_COLLECTION_HOUR_KST 가 같은 값이다", () => {
    for (const p of ["data-pipeline/scripts/calculate_telegram_trending.py", "data-pipeline/scripts/calculate_us_trending.py"]) {
      const m = read(p).match(/^FIRST_COLLECTION_HOUR_KST = (\d+)$/m);
      assert.ok(m, `${p} 에 FIRST_COLLECTION_HOUR_KST 가 없다`);
      assert.equal(Number(m[1]), FIRST_COLLECTION_HOUR_KST, p);
    }
  });

  it("아침 트렌딩 스텝 둘은 KRX 공표 대기 뒤라 그 시각 전에 저장하지 않는다", () => {
    const wf = read(".github/workflows/daily-update.yml");
    const gate = wf.match(/- name: KRX 공표\((\d\d):00 KST\) 대기 — 개장 전 값 전용/);
    assert.ok(gate, "'개장 전 값 전용' KRX 대기 스텝이 없다");
    assert.ok(Number(gate[1]) >= FIRST_COLLECTION_HOUR_KST, `대기가 ${gate[1]}시까지뿐이다`);
    for (const script of ["calculate_telegram_trending.py", "calculate_us_trending.py"]) {
      const at = wf.indexOf(`run: python data-pipeline/scripts/${script}`);
      assert.ok(at > gate.index!, `${script} 가 KRX 대기 앞에 있다`);
    }
  });
});
