/**
 * lib/cron-schedule.ts — 파이프라인을 정시에 깨우는 시계의 판단부.
 *
 * 여기가 틀리면 파이프라인이 **조용히 안 돈다.** 라우트는 모르는 크론에 400 만 돌려주고,
 * 슬롯 경계가 발사와 겹치면 직전 슬롯의 실행을 '이미 처리됨'으로 읽어 건너뛴다. 둘 다
 * 화면에는 아무 표시가 없다. 발사 시각을 옮길 때 같이 고쳐야 하는 자리를 여기서 지킨다.
 * 돌리는 법: `npm test`.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { CRON_TO_JOB, hasRunSince, resolveJob, sinceIso } from "../lib/cron-schedule.ts";

type Cron = { path: string; schedule: string };
const crons: Cron[] = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8")).crons;
const pipelineCrons = crons.filter((c) => resolveJob(c.schedule)?.workflow === "daily-update.yml");

/** "M H * * *" 의 하루 중 분(UTC). */
function fireMin(schedule: string): number {
  const [m, h] = schedule.split(" ").map(Number);
  return h * 60 + m;
}
/** "HH:MM" 의 하루 중 분(UTC). */
function hmMin(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

describe("vercel.json 과 CRON_TO_JOB", () => {
  it("vercel.json 의 크론은 전부 표에 있다 — 없으면 라우트가 400 만 내고 아무것도 안 던진다", () => {
    for (const c of crons) {
      assert.ok(resolveJob(c.schedule), `표에 없는 크론: ${c.schedule}`);
    }
  });

  it("파이프라인은 하루 두 번(아침·저녁)이다", () => {
    const slots = pipelineCrons.map((c) => CRON_TO_JOB[c.schedule].inputs(new Date("2026-09-22T00:00:00Z")).slot);
    assert.deepEqual(slots.sort(), ["evening", "morning"]);
  });
});

describe("슬롯 경계(fireUtc)", () => {
  it("경계는 발사보다 30분 이상 앞이다 — 같으면 크론이 1초만 일러도 슬롯이 통째로 건너뛰어진다", () => {
    for (const c of pipelineCrons) {
      const gap = (fireMin(c.schedule) - hmMin(CRON_TO_JOB[c.schedule].fireUtc) + 1440) % 1440;
      assert.ok(gap >= 30 && gap < 12 * 60, `${c.schedule}: 경계와 발사 사이 ${gap}분`);
    }
  });

  it("다른 슬롯의 발사는 이 슬롯의 경계~발사 사이에 들지 않는다 — 들면 아침 실행이 저녁 몫으로 세어진다", () => {
    for (const a of pipelineCrons) {
      const lo = hmMin(CRON_TO_JOB[a.schedule].fireUtc);
      const span = (fireMin(a.schedule) - lo + 1440) % 1440;
      for (const b of pipelineCrons) {
        if (b === a) continue;
        const off = (fireMin(b.schedule) - lo + 1440) % 1440;
        assert.ok(off > span, `${b.schedule} 가 ${a.schedule} 의 슬롯 안에 든다`);
      }
    }
  });
});

describe("이미 돌았나(sinceIso + hasRunSince) — 실제 시각으로 재현", () => {
  const morning = pipelineCrons.find((c) => CRON_TO_JOB[c.schedule].inputs(new Date()).slot === "morning")!;
  const evening = pipelineCrons.find((c) => CRON_TO_JOB[c.schedule].inputs(new Date()).slot === "evening")!;
  const mFire = CRON_TO_JOB[morning.schedule].fireUtc;
  const eFire = CRON_TO_JOB[evening.schedule].fireUtc;
  // 2026-09-23(수) KST 아침 06:30 = 09-22 21:30Z, 저녁 17:30 = 09-23 08:30Z.
  const at = (iso: string) => new Date(iso);
  const run = (created_at: string) => ({ created_at, html_url: `run@${created_at}` });

  it("아침: 전날 저녁 실행만 있으면 던진다", () => {
    const since = sinceIso(mFire, at("2026-09-22T21:30:00Z"));
    assert.equal(hasRunSince([run("2026-09-22T08:30:04Z"), run("2026-09-21T21:30:03Z")], since).covered, false);
  });

  it("아침: 크론이 1초 일찍 와도 던진다", () => {
    const since = sinceIso(mFire, at("2026-09-22T21:29:59Z"));
    assert.equal(hasRunSince([run("2026-09-22T08:30:04Z")], since).covered, false);
  });

  it("아침: 같은 크론이 두 번 오면 두 번째는 안 던진다", () => {
    const since = sinceIso(mFire, at("2026-09-22T21:30:09Z"));
    assert.equal(hasRunSince([run("2026-09-22T21:30:04Z"), run("2026-09-22T08:30:04Z")], since).covered, true);
  });

  it("저녁: 그날 아침 실행만 있으면 던진다", () => {
    const since = sinceIso(eFire, at("2026-09-23T08:30:00Z"));
    assert.equal(hasRunSince([run("2026-09-22T21:30:04Z")], since).covered, false);
  });

  it("저녁: 크론이 1초 일찍 와도 던진다", () => {
    const since = sinceIso(eFire, at("2026-09-23T08:29:59Z"));
    assert.equal(hasRunSince([run("2026-09-22T21:30:04Z")], since).covered, false);
  });

  it("저녁: 같은 크론이 두 번 오면 두 번째는 안 던진다", () => {
    const since = sinceIso(eFire, at("2026-09-23T08:30:09Z"));
    assert.equal(hasRunSince([run("2026-09-23T08:30:03Z"), run("2026-09-22T21:30:04Z")], since).covered, true);
  });

  it("왜 경계를 앞에 두나 — 경계가 발사와 같으면 1초 이른 호출이 전날로 물러난다", () => {
    // 예전 값(21:30)을 새 발사(21:30)에 그대로 뒀다면: 21:29:59 호출의 경계가 전날로 밀려
    // 그 사이 저녁 실행이 '처리됨'으로 잡히고 아침 슬롯이 통째로 안 돈다.
    const since = sinceIso("21:30", at("2026-09-22T21:29:59Z"));
    assert.equal(since, "2026-09-21T21:30:00Z");
    assert.equal(hasRunSince([run("2026-09-22T08:30:04Z")], since).covered, true);
  });
});
