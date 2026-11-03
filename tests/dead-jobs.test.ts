/**
 * scripts/dead-jobs.sh · daily-update.yml 의 dead_jobs 잡 — 알림 없이 죽은 잡 찾기(2026-11-03 #301).
 *
 * 잡 목록은 깃헙 `…/runs/<id>/jobs` 응답 꼴이다. 스텝 상태는 #301 실측을 줄인 것이다 — 러너가 끊긴 배당 잡은
 * 돌던 스텝이 in_progress, 뒤 스텝이 pending 인 채 failure 로 닫혔다.
 * 돌리는 법: `npm test`.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const script = new URL("../scripts/dead-jobs.sh", import.meta.url).pathname;
const wf = read(".github/workflows/daily-update.yml");

type Step = { name: string; status: string; conclusion: string | null };
type Job = { name: string; status: string; conclusion: string | null; steps: Step[] };
const done = (name: string, conclusion = "success"): Step => ({ name, status: "completed", conclusion });
const job = (name: string, conclusion: string | null, steps: Step[], status = "completed"): Job => ({ name, status, conclusion, steps });

function run(jobs: Job[] | string): { status: number | null; out: string } {
  const dir = mkdtempSync(join(tmpdir(), "dead-jobs-"));
  const file = join(dir, "jobs.json");
  writeFileSync(file, typeof jobs === "string" ? jobs : JSON.stringify({ total_count: jobs.length, jobs }));
  const r = spawnSync("bash", ["--noprofile", "--norc", script], {
    env: { NODE_ENV: "test", PATH: process.env.PATH ?? "/usr/bin:/bin", JOBS_JSON: file },
    encoding: "utf8",
  });
  return { status: r.status, out: r.stdout.trim() };
}

describe("죽은 잡 고르기", () => {
  it("러너가 끊긴 잡(#301) — 돌던 스텝 이름까지 찍는다", () => {
    const r = run([
      job("update", "success", [done("Checkout"), done("Summarize results")]),
      job("dividend", "failure", [
        done("Checkout"),
        done("핀허브를 쓰는 잡이 끝날 때까지 대기 (국장 미리보기)"),
        { name: "Fetch 미국 배당주 요약 (배당주)", status: "in_progress", conclusion: null },
        { name: "Fetch 미장 일별 거래대금 (테마)", status: "pending", conclusion: null },
        { name: "Summarize 배당주 수집", status: "pending", conclusion: null },
      ]),
    ]);
    assert.equal(r.status, 0);
    assert.equal(r.out, "dividend · failure · Fetch 미국 배당주 요약 (배당주)");
  });

  it("알림 스텝이 일부러 exit 1 한 잡은 안 고른다 — 그 잡은 이미 제 이슈를 열었다", () => {
    const r = run([
      job("update", "failure", [
        done("Checkout"),
        done("Fetch 지표", "success"),
        done("Summarize results", "failure"),
        done("Alert on 분류 failure (open/update GitHub issue)", "skipped"),
        done("Post Checkout"),
      ]),
      job("dividend", "failure", [done("Alert on 배당주 failure (open/update GitHub issue)", "failure"), done("Fetch ETF 일별 자금 흐름 (ETF)")]),
    ]);
    assert.equal(r.status, 0);
    assert.equal(r.out, "");
  });

  it("시간 상한에 걸린 잡 — 취소된 스텝이 남는다", () => {
    const r = run([
      job("dividend", "cancelled", [done("Checkout"), done("Fetch 미국 배당주 요약 (배당주)", "cancelled"), done("Summarize 배당주 수집", "success")]),
    ]);
    assert.equal(r.out, "dividend · cancelled · Fetch 미국 배당주 요약 (배당주)");
  });

  it("결론이 취소인 잡은 멈춘 스텝이 안 보여도 고른다", () => {
    const r = run([job("insider", "cancelled", [done("Checkout"), done("Fetch 공시", "skipped")])]);
    assert.equal(r.out, "insider · cancelled · 멈춘 스텝 없음");
  });

  it("안 끝난 잡(이 잡 자신) · 건너뛴 잡 · 성공한 잡은 안 본다", () => {
    const r = run([
      job("dead_jobs", null, [{ name: "알림 없이 죽은 잡 찾기", status: "in_progress", conclusion: null }], "in_progress"),
      job("logos", "skipped", []),
      job("finalize", "success", [done("화면 캐시 비우고 다시 데우기")]),
    ]);
    assert.equal(r.out, "");
  });

  it("죽은 잡이 둘이면 두 줄", () => {
    const stuck = { name: "(텔레그램) A 아침 브리핑 발송", status: "in_progress", conclusion: null };
    const r = run([job("dividend", "cancelled", [done("x", "cancelled")]), job("morning_post", "failure", [done("Checkout"), stuck])]);
    assert.deepEqual(r.out.split("\n"), ["dividend · cancelled · x", "morning_post · failure · (텔레그램) A 아침 브리핑 발송"]);
  });

  it("목록을 못 읽으면 2 로 끝난다", () => {
    assert.equal(run("<html>").status, 2);
  });
});

describe("daily-update.yml 의 dead_jobs 잡", () => {
  const jobs = [...wf.slice(wf.indexOf("\njobs:\n")).matchAll(/^ {2}([a-z_]+):$/gm)].map((m) => m[1]);
  const body = wf.slice(wf.indexOf("\n  dead_jobs:\n"));

  it("다른 잡을 전부 기다린다 — 새 잡을 더하면 여기 needs 에도 넣을 것", () => {
    const needs = body.match(/\n {4}needs: \[(.+)\]\n/)![1].split(/,\s*/);
    assert.ok(jobs.length >= 12, `잡이 ${jobs.length}개뿐이다`);
    assert.deepEqual([...needs].sort(), jobs.filter((j) => j !== "dead_jobs").sort());
  });

  it("맨 끝 잡이고, 이 잡을 기다리는 잡이 없다 — 화면 · 발송 시각을 늦추지 않는다", () => {
    assert.equal(jobs.at(-1), "dead_jobs");
    assert.ok(!/needs: \[[^\]]*\bdead_jobs\b/.test(wf));
  });

  it("손으로 취소한 실행은 안 본다 · 같은 실행의 잡 목록을 읽을 권한이 있다", () => {
    assert.match(body, /\n {4}if: \$\{\{ !cancelled\(\) && needs\.guard\.outputs\.skip != 'true' \}\}\n/);
    assert.match(body, /\n {6}actions: read/);
    assert.match(body, /bash scripts\/dead-jobs\.sh/);
  });
});
