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

import { CRON_TO_JOB, hasRunSince, PREVIEW_RUN_TITLE, resolveJob, sinceIso } from "../lib/cron-schedule.ts";

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

/** ci.yml 의 `paths:` 목록들(pull_request · push). 파서 없이 `- "…"` 줄만 모은다. */
function ciPathLists(): string[][] {
  const lists: string[][] = [];
  let cur: string[] | null = null;
  for (const line of readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8").split("\n")) {
    if (/^\s+paths:\s*$/.test(line)) {
      cur = [];
      lists.push(cur);
      continue;
    }
    if (/^\s*#/.test(line)) continue;
    const m = line.match(/^\s+- "(.+)"\s*$/);
    if (cur && m) cur.push(m[1]);
    else cur = null;
  }
  return lists;
}
/** 경로 필터 한 줄이 파일을 덮나. ci.yml 은 `dir/**` 와 파일 이름 두 꼴만 쓴다. */
const covers = (glob: string, file: string) =>
  glob.endsWith("/**") ? file.startsWith(glob.slice(0, -2)) : glob === file;

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

  it("CI 는 vercel.json 만 바뀐 PR 에서도 돈다 — 경로 필터에서 빠지면 크론만 옮긴 PR 을 위 검사가 못 본다", () => {
    const lists = ciPathLists();
    assert.equal(lists.length, 2, "ci.yml 에서 paths 목록 둘(pull_request · push)을 못 찾았다");
    for (const globs of lists) {
      assert.ok(globs.some((g) => covers(g, "vercel.json")), `경로 필터에 vercel.json 이 없다: ${globs.join(", ")}`);
    }
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

describe("채널 발송: 미리보기 실행은 그날 몫으로 세지 않는다", () => {
  // 2026-10-03(토) KST 10:30 = 01:30Z. 경계는 KST 자정(10-02 15:00Z).
  const sat = "30 1 * * 6";
  const since = sinceIso(CRON_TO_JOB[sat].fireUtc, new Date("2026-10-03T01:30:00Z"));
  const run = (created_at: string, display_title: string) => ({
    created_at,
    display_title,
    html_url: `run@${created_at}`,
  });

  it("아침에 기본값(send 끔)으로 돌린 미리보기만 있으면 던진다 — 세면 그날 글이 아예 안 나간다", () => {
    assert.equal(hasRunSince([run("2026-10-03T00:05:12Z", "미리보기 · us_weekend")], since).covered, false);
  });

  it("그날 실제로 보낸 실행은 센다 — 다시 던지면 같은 글이 두 번 나간다", () => {
    const runs = [run("2026-10-03T01:30:04Z", "발송 · us_weekend"), run("2026-10-03T00:05:12Z", "미리보기 · us_weekend")];
    assert.equal(hasRunSince(runs, since).url, "run@2026-10-03T01:30:04Z");
  });

  it("run-name 이 생기기 전 실행(제목이 워크플로 이름)은 예전처럼 센다", () => {
    const old = run("2026-10-03T00:05:12Z", "Telegram Broadcast (수 12:30 · 토 10:30 · 일 21:00)");
    assert.equal(hasRunSince([old], since).covered, true);
  });

  // 위 판단은 워크플로가 미리보기 실행에 붙이는 제목에 기댄다. 제목 규칙이 어긋나면 다시 조용히 센다.
  const yml = readFileSync(new URL("../.github/workflows/telegram-broadcast.yml", import.meta.url), "utf8");

  it("워크플로는 '미리보기' 스텝이 도는 실행에만 그 머리를 붙인다", () => {
    const runName = yml.match(/^run-name: (.+)$/m)?.[1] ?? "";
    const cond = yml.match(/- name: 미리보기 \(수동 실행 · 발송 끔\)\n\s+if: (.+)\n/)?.[1] ?? "";
    assert.ok(cond, "미리보기 스텝의 조건을 못 찾았다");
    assert.ok(runName.startsWith(`\${{ ${cond} && format('${PREVIEW_RUN_TITLE} `), runName);
  });

  it("워크플로 게이트도 미리보기를 '도는 중'으로 세지 않는다 — 세면 그 사이 온 발송이 스스로 빠진다", () => {
    assert.ok(yml.includes(`startswith(\\"${PREVIEW_RUN_TITLE}\\")`), "게이트 jq 에 미리보기 제외가 없다");
  });

  it("CI 는 telegram-broadcast.yml 만 바뀐 PR 에서도 돈다 — 위 두 검사가 그 파일을 읽는다", () => {
    for (const globs of ciPathLists()) {
      assert.ok(globs.some((g) => covers(g, ".github/workflows/telegram-broadcast.yml")), globs.join(", "));
    }
  });
});
