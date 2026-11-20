/**
 * scripts/dead-jobs.sh · daily-update.yml 의 dead_jobs 잡 — 알림 없이 죽은 잡 찾기(2026-11-03 #301).
 *
 * 잡 목록은 깃헙 `…/runs/<id>/jobs` 응답 꼴이다. 스텝 상태는 #301 실측을 줄인 것이다 — 러너가 끊긴 배당 잡은
 * 돌던 스텝이 in_progress, 뒤 스텝이 pending 인 채 failure 로 닫혔다.
 * tests/fixtures/dead-jobs-run-44700473981.json 은 2026-11-20 저녁 실행이 끝난 뒤의 응답에서 판정이 읽는 칸만 남긴 것이다.
 * kr_preview 잡의 설치 스텝이 러너 종료 신호(exit 143)로 failure 로 닫히고 뒤 스텝이 알림까지 전부 skipped 였다.
 * 그 실행의 dead_jobs 잡은 옛 판정으로 아무것도 못 찾고 success 로 끝났다.
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
    // Summarize results 가 exit 1 하면 바로 뒤 `if: failure()` 알림이 돈다(11-18 실행 44398622983 등 실측 꼴).
    const r = run([
      job("update", "failure", [
        done("Checkout"),
        done("Fetch 지표", "success"),
        done("Summarize results", "failure"),
        done("Alert on failure (open/update GitHub issue)", "success"),
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

  it("설치 스텝이 러너 종료 신호로 죽은 잡(11-20 kr_preview) — 알림 스텝까지 건너뛰어 아무도 안 알렸다", () => {
    // 같은 실행의 dividend 잡은 'Alert on 배당주 failure' 가 이미 이슈를 열었다(#823) — 안 찍는다. 나머지 잡은 성공 · 건너뜀이다.
    const r = run(read("tests/fixtures/dead-jobs-run-44700473981.json"));
    assert.equal(r.status, 0);
    assert.equal(r.out, "kr_preview · failure · Install dependencies");
  });

  it("설치가 그냥 실패해도 알림 스텝이 그 실패를 안 보면 고른다 — 미리보기 알림은 미리보기 스텝 결과만 본다", () => {
    const r = run([
      job("kr_preview", "failure", [
        done("Checkout"),
        done("Install dependencies", "failure"),
        done("국장 미리보기 (간밤 미장 → 국내 종목)", "skipped"),
        done("Summarize 미리보기", "success"),
        done("Alert on 미리보기 failure (open/update GitHub issue)", "skipped"),
      ]),
    ]);
    assert.equal(r.out, "kr_preview · failure · Install dependencies");
  });

  it("`if: failure()` 알림이 돈 잡은 안 고른다 — 설치가 실패해도 그 알림이 이슈를 열었다", () => {
    const r = run([
      job("morning_post", "failure", [
        done("Checkout"),
        done("Install dependencies", "failure"),
        done("(텔레그램) 개장 전 요약 발송 (평일 아침)", "skipped"),
        done("Alert on failure (open/update GitHub issue)", "success"),
      ]),
    ]);
    assert.equal(r.out, "");
  });

  it("앞 알림이 돌았어도 그 뒤의 실패를 알릴 스텝이 안 돌았으면 고른다", () => {
    const r = run([
      job("update", "failure", [
        done("Summarize results", "failure"),
        done("Alert on failure (open/update GitHub issue)", "success"),
        done("Summarize 카더라 collection (텔레그램 수집 전용)", "failure"),
        done("Alert on 카더라 failure (open/update GitHub issue)", "skipped"),
        done("Alert on 미장 failure (open/update GitHub issue)", "skipped"),
      ]),
    ]);
    assert.equal(r.out, "update · failure · Summarize 카더라 collection (텔레그램 수집 전용)");
  });

  it("알림 스텝이 없는 잡(krx_master · logos · logo_fill)이 실패해도 고른다 — 본 스텝이 다 continue-on-error 라 설치 실패뿐이다", () => {
    const r = run([
      job("krx_master", "failure", [done("Checkout"), done("Install dependencies", "failure"), done("(텔레그램) KRX 상장종목 마스터 갱신", "skipped")]),
    ]);
    assert.equal(r.out, "krx_master · failure · Install dependencies");
  });

  it("스텝 목록이 빈 실패 잡도 고른다 — 11-03 #301 배당 잡을 나중에 다시 읽으면 스텝이 비어 있다", () => {
    const r = run([job("dividend", "failure", [])]);
    assert.equal(r.out, "dividend · failure · 멈춘 스텝 없음");
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

  it("이슈를 여는 스텝은 이름이 'Alert on' 으로 시작한다 — dead-jobs.sh 가 이름으로 알림 스텝을 가린다", () => {
    const steps = wf.slice(wf.indexOf("\njobs:\n")).split(/\n(?= {6}- name: )/).slice(1);
    const opens = steps.filter((s) => s.includes("gh issue create")).map((s) => s.match(/^ {6}- name: (.+)/)![1].trim());
    assert.ok(opens.length >= 10, `이슈를 여는 스텝이 ${opens.length}개뿐이다`);
    assert.deepEqual(opens.filter((n) => !n.startsWith("Alert on ")), []);
  });

  it("손으로 취소한 실행은 안 본다 · 같은 실행의 잡 목록을 읽을 권한이 있다", () => {
    assert.match(body, /\n {4}if: \$\{\{ !cancelled\(\) && needs\.guard\.outputs\.skip != 'true' \}\}\n/);
    assert.match(body, /\n {6}actions: read/);
    assert.match(body, /bash scripts\/dead-jobs\.sh/);
  });
});
