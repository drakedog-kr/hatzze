/**
 * .github/workflows/daily-update.yml — 아침 '한 번에 바꾸기'와 미장 갈래 나란히 돌리기(2026-10-16).
 *
 * 미장 스텝들은 scripts/kadera-us-chain.sh 가 뒤에서 돌리고, 원래 자리에는 같은 id 의 기다리기 스텝
 * (`bash scripts/bg-step.sh wait <이름>`)이 선다. 여기가 어긋나면 기다리기 스텝이 10분 · 150분을 헛기다리거나
 * (시작이 없다), 국장 스텝이 미장 결과를 읽기 전에 돌아 **조용히 어제 값**을 쓴다(순서가 틀렸다).
 * 아침 화면은 두 묶음으로 바뀐다(2026-10-18) — 홈 · 카더라 · 테마는 update 잡 끝에 한 번에, 나머지는 finalize 에서.
 * 돌리는 법: `npm test`.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const wf = read(".github/workflows/daily-update.yml");
const chain = read("scripts/kadera-us-chain.sh");

/** 잡 하나의 본문(다음 잡 머리 앞까지). */
function job(name: string): string {
  const start = wf.indexOf(`\n  ${name}:\n`);
  assert.ok(start >= 0, `잡 ${name} 이 없다`);
  const next = wf.slice(start + 1).search(/\n {2}[a-z_]+:\n/);
  return next < 0 ? wf.slice(start) : wf.slice(start, start + 1 + next);
}

type Step = { name: string; id?: string; if?: string; body: string; at: number };
/** 잡 본문을 스텝으로 자른다. 들여쓰기 여섯 칸의 `- name:` 이 스텝 머리다. */
function steps(body: string): Step[] {
  const out: Step[] = [];
  const re = /\n {6}- name: (.+)\n/g;
  const heads = [...body.matchAll(re)];
  heads.forEach((h, i) => {
    const s = body.slice(h.index!, i + 1 < heads.length ? heads[i + 1].index! : body.length);
    out.push({
      name: h[1].trim(),
      id: s.match(/\n {8}id: (\S+)/)?.[1],
      if: s.match(/\n {8}if: (.+)/)?.[1],
      body: s,
      at: h.index!,
    });
  });
  return out;
}

const update = steps(job("update"));
const dividend = steps(job("dividend"));
const idx = (list: Step[], pred: (s: Step) => boolean, what: string) => {
  const i = list.findIndex(pred);
  assert.ok(i >= 0, `${what} 스텝이 없다`);
  return i;
};

const waits = update.filter((s) => /bash scripts\/bg-step\.sh wait \S+/.test(s.body));
const waitName = (s: Step) => s.body.match(/bash scripts\/bg-step\.sh wait (\S+)/)![1];
const chainNames = [...chain.matchAll(/^\s+step (telegram_us_\w+) /gm)].map((m) => m[1]);

describe("뒤에서 도는 스텝과 기다리기 스텝의 짝", () => {
  it("기다리기 스텝마다 그 결과를 남기는 쪽이 있다 — 없으면 10분 뒤 실패로 끝난다", () => {
    assert.ok(waits.length >= 9, `기다리기 스텝이 ${waits.length}개뿐이다`);
    for (const w of waits) {
      const name = waitName(w);
      const startedHere = update.some((s) => s.body.includes(`bash scripts/bg-step.sh start ${name} `));
      assert.ok(startedHere || chainNames.includes(name), `${name} 을 띄우거나 만드는 곳이 없다`);
    }
  });

  it("기다리기 스텝은 원래 스텝의 id 를 그대로 쓴다 — 요약 · 알림표와 `if:` 가 그 id 를 본다", () => {
    for (const w of waits) assert.equal(w.id, waitName(w), `${w.name} 의 id`);
  });

  it("미장 갈래가 맡는다고 적은 스텝(own)과 실제로 만드는 스텝이 같다 — 다르면 죽은 갈래를 못 알아챈다", () => {
    const own = chain.match(/ own ((?:telegram_us_\w+[\s\\]*)+)/)?.[1].split(/[\s\\]+/).filter(Boolean) ?? [];
    assert.deepEqual([...own].sort(), [...chainNames].sort());
  });

  it("띄우는 스텝이 기다리는 스텝보다 앞이다", () => {
    const rest = idx(update, (s) => s.body.includes("bg-step.sh start us_rest"), "미장 갈래 나머지 시작");
    const ext = idx(update, (s) => s.body.includes("bg-step.sh start telegram_us_extract"), "미국 종목 추출 시작");
    for (const w of waits) {
      const at = update.indexOf(w);
      const name = waitName(w);
      if (name === "telegram_us_extract") assert.ok(ext < at, name);
      else if (chainNames.includes(name)) assert.ok(rest < at, name);
      else {
        const st = idx(update, (s) => s.body.includes(`bg-step.sh start ${name} `), `${name} 시작`);
        assert.ok(st < at, name);
      }
    }
  });
});

describe("순서 규칙(scripts/kadera-us-chain.sh 머리 주석)", () => {
  it("① 미장 나머지는 국장 종목 추출이 끝난 뒤 띄운다 — 미장 일별 집계가 국장 태그를 읽는다", () => {
    const kr = idx(update, (s) => s.id === "telegram_extract", "국장 종목 추출");
    const rest = idx(update, (s) => s.body.includes("bg-step.sh start us_rest"), "미장 갈래 나머지 시작");
    assert.ok(kr < rest);
    assert.match(update[rest].body, /KR_EXTRACT: \$\{\{ steps\.telegram_extract\.outcome \}\}/);
  });

  it("미국 종목 추출은 국장 추출과 같은 때 시작한다 — 국장 추출 앞에서 띄운다", () => {
    const kr = idx(update, (s) => s.id === "telegram_extract", "국장 종목 추출");
    const ext = idx(update, (s) => s.body.includes("bg-step.sh start telegram_us_extract"), "미국 종목 추출 시작");
    assert.ok(ext < kr);
  });

  it("② 동시 언급은 미장 총평보다 앞이다 — 미장 총평이 telegram_us_comention 을 읽는다", () => {
    assert.ok(chain.indexOf("calculate_us_comention.py") < chain.indexOf("generate_us_telegram_narratives.py"));
  });

  it("③ 미장 센티먼트는 분류 '수거' 표시 뒤다 — 그 표시는 수거 스텝 뒤에 남긴다", () => {
    assert.ok(chain.indexOf("wait analyze_collect") < chain.indexOf("calculate_us_telegram_sentiment.py"));
    const collect = idx(update, (s) => s.id === "telegram_analyze_collect", "분류 수거");
    const mark = idx(update, (s) => s.body.includes("bg-step.sh mark analyze_collect"), "수거 끝 표시");
    assert.ok(collect < mark);
    assert.equal(update[mark].if, "always()", "수거가 실패해도 표시는 남겨야 미장 센티먼트가 90분을 헛기다리지 않는다");
  });

  it("④ 미장 총평은 '시장 전체 분위기 판정' 표시 뒤다 — [전체] 낙관도를 그 표에서 읽는다", () => {
    assert.ok(chain.indexOf("wait market_done") >= 0, "미장 갈래가 분위기 판정 표시를 기다리지 않는다");
    assert.ok(chain.indexOf("wait market_done") < chain.indexOf("generate_us_telegram_narratives.py"));
    const market = idx(update, (s) => s.id === "telegram_market", "시장 전체 분위기 판정");
    const mark = idx(update, (s) => s.body.includes("bg-step.sh mark market_done"), "분위기 판정 끝 표시");
    assert.ok(market < mark);
    assert.equal(update[mark].if, "always()", "판정이 실패해도 표시는 남겨야 미장 총평이 120분을 헛기다리지 않는다");
  });

  it("겹쳐 도는 동안 LLM 동시 호출이 8을 넘지 않는다 — 구독 경로에서 검증된 최대(분류 · 판정의 8)", () => {
    // 미장 갈래의 LLM 스텝(미장 총평 · 테마 요약)은 '분위기 판정 끝' 뒤라 분류 · 판정(8)과는 안 겹치고, 국장의 급부상 한 줄 ·
    // 총평 · 테마 요약(워크플로 기본 LLM_WORKERS)과 겹친다. 넘으면 구독 호출이 실패할 때 Opus 총평이 Haiku 로 바뀐다.
    const rest = update.find((s) => s.body.includes("bg-step.sh start us_rest"))!;
    const n = Number(rest.body.match(/LLM_WORKERS: "(\d+)"/)?.[1]);
    const base = Number(wf.match(/\n {2}LLM_WORKERS: "(\d+)"/)?.[1]);
    assert.ok(n > 0 && base > 0 && n + base <= 8, `미장 ${n} + 국장 ${base}`);
    assert.ok(chain.indexOf("wait market_done") < chain.indexOf("generate_us_telegram_narratives.py"), "미장 LLM 이 판정(8)과 겹친다");
  });

  it("국장 스텝이 미장 결과를 읽기 전에 그 결과를 기다린다", () => {
    const at = (id: string) => idx(update, (s) => s.id === id, id);
    // 국장 트렌딩 · 센티먼트 · 총평의 '미장 글 빼기'
    assert.ok(at("telegram_us_extract") < at("telegram_trending"));
    // 급부상 한 줄 — 미장 센티먼트(기준일)와 미장 일별
    assert.ok(at("telegram_us_sentiment") < at("telegram_surging_oneliners"));
    assert.ok(at("telegram_us_daily") < at("telegram_surging_oneliners"));
    // 등락 이유 — 미장 일별
    assert.ok(at("telegram_us_daily") < at("telegram_move_reasons"));
  });
});

describe("아침 화면은 두 묶음으로 바뀐다(2026-10-18)", () => {
  // 홈 · 국장/미장 카더라 · 테마(목록 · 상세)는 update 잡 끝에 같이, 배당 · 종목 · ETF · 데일리 노트는 finalize 에서 바뀐다.
  // 국장 카더라 · 국장 테마 상세의 '등락 이유' 칸이 08:00 KRX 등락률(배당 잡이 채운다)을 읽어 묶음도 그 뒤다. 저녁은 화면별 그대로다.
  const GROUP = "아침 화면 한 묶음 비우기 (홈 · 카더라 · 테마 — KRX 등락률 뒤)";
  const DIVIDEND_PM = "배당 화면만 먼저 비우고 데우기";
  const group = () => idx(update, (s) => s.name === GROUP, "아침 한 묶음");
  const EVENING = ["rv_kadera", "rv_kadera_us", "rv_theme", "rv_home"];
  const at = (id: string) => idx(update, (s) => s.id === id, id);

  it("화면별 먼저 비우기(국장 · 미장 카더라 · 테마 · 홈)는 저녁만 — 아침엔 한 묶음이 맡는다", () => {
    for (const id of EVENING) assert.equal(update[at(id)].if, "${{ !cancelled() && github.event.inputs.slot != 'morning' }}", id);
  });

  it("update 잡의 화면 비우기는 저녁 화면별 다섯과 아침 한 묶음뿐이다 — 아침에 반쪽만 먼저 바뀌는 자리가 없다", () => {
    const ids = update.filter((s) => s.body.includes("scripts/revalidate.sh")).map((s) => s.id);
    assert.deepEqual(ids, ["rv_kadera", "rv_kadera_us", "rv_preview_pm", "rv_theme", "rv_home", "rv_morning_group"]);
    // 저녁 미리보기 다시 비우기는 저녁에만 도는 '개장 전 지금 값'의 결과를 본다(아래 테스트).
    assert.match(update[at("rv_preview_pm")].if ?? "", /steps\.kr_overnight\.outcome == 'success'/);
  });

  it("아침 한 묶음은 홈 · 국장/미장 카더라 · 테마 목록 둘 · 테마 상세 둘을 한 번에 비운다", () => {
    const s = update[group()];
    assert.equal(s.id, "rv_morning_group");
    assert.equal(s.if, "${{ !cancelled() && github.event.inputs.slot == 'morning' }}");
    assert.match(s.body, /\n\s+bash scripts\/revalidate\.sh \/ \/kadera \/kadera\/us \/theme \/theme\/us '\/theme\/\[theme\]' '\/theme\/us\/\[theme\]'\n/);
  });

  it("아침 한 묶음은 네 화면이 읽는 마지막 스텝(총평 둘 · 테마 요약 둘 · 점수 · 히어로 요약) 뒤다", () => {
    const g = group();
    for (const id of ["telegram_narratives", "telegram_us_narratives", "telegram_theme_briefs", "telegram_us_theme_briefs", "telegram_move_reasons", "calculate_score", "generate_daily_summary"]) {
      assert.ok(g > at(id), id);
    }
  });

  it("어제 등락률이 빈 줄이 있으면 배당 잡의 KRX 채우기를 기다린 뒤에만 비운다", () => {
    const s = update[group()];
    assert.match(s.body, /WAIT_STRICT: "1"/);
    assert.match(s.body, /if python data-pipeline\/scripts\/move_reason_rates_pending\.py; then\n\s+bash scripts\/wait-for-job-step\.sh 60 "dividend::등락 이유 등락률 채우기" \|\| exit 1\n\s+fi\n/);
    assert.equal(dividend.filter((x) => x.name.startsWith("등락 이유 등락률 채우기")).length, 1, "기다리는 스텝 이름이 배당 잡에 하나여야 한다");
    assert.match(job("update"), /\n {6}actions: read/);
  });

  it("기다리기 스크립트는 WAIT_STRICT 면 시간이 다 됐을 때 1 로 끝난다 — 그래야 등락률 없이 비우지 않는다", () => {
    const sh = read("scripts/wait-for-job-step.sh");
    assert.match(sh, /if \[ -n "\$\{WAIT_STRICT:-\}" \]; then\n[^\n]*\n\s+exit 1\n/);
  });

  it("먼저 비우는 자리는 다시 해 보고(STRICT) 결과를 잡 출력으로 finalize 에 넘긴다", () => {
    const outs = job("update").match(/\n {4}outputs:\n((?: {6}.+\n)+)/)![1];
    for (const id of [...EVENING, "rv_preview_pm", "rv_morning_group"]) {
      assert.match(update[at(id)].body, /REVALIDATE_STRICT: "1"/, id);
      assert.match(outs, new RegExp(`^ {6}${id}: \\$\\{\\{ steps\\.${id}\\.outcome \\}\\}$`, "m"), id);
    }
    const kp = job("kr_preview");
    assert.match(kp, /\n {6}rv_preview: \$\{\{ steps\.rv_preview_am\.outcome \}\}\n/);
    assert.match(steps(kp).find((s) => s.id === "rv_preview_am")!.body, /REVALIDATE_STRICT: "1"/);
  });

  it("아침 배당 화면은 finalize 에서 — 먼저 비우기와 그 앞 대기는 저녁만", () => {
    const pm = dividend.find((s) => s.name === DIVIDEND_PM);
    assert.ok(pm, "/dividend 비우기 스텝이 없다");
    assert.equal(pm.if, "${{ !cancelled() && github.event.inputs.slot != 'morning' }}");
    assert.match(pm.body, /run: bash scripts\/revalidate\.sh \/dividend\n/);
    const w = dividend.find((s) => s.name.startsWith("카더라 일별 집계가 끝날 때까지 대기"))!;
    assert.equal(w.if, "${{ !cancelled() && github.event.inputs.slot != 'morning' }}");
    for (const s of dividend) assert.ok(!(s.body.includes("revalidate.sh") && s.body.includes("/stock")), `${s.name} 이 종목 화면을 먼저 비운다`);
  });

  it("미리보기 '지금 값' 다시 비우기는 저녁에만 도는 스텝의 결과를 본다", () => {
    const rewarm = update.find((s) => s.name === "미리보기 화면 다시 비우고 데우기 (지금 값 반영)")!;
    assert.match(rewarm.if ?? "", /steps\.kr_overnight\.outcome == 'success'/);
    const ov = update.find((s) => s.id === "kr_overnight")!;
    assert.match(ov.if ?? "", /github\.event\.inputs\.slot != 'morning'/);
  });

  it("카더라 블록 안에 08:00 대기가 다시 생기지 않는다 — 지표 블록 앞 하나뿐이다", () => {
    const gates = update.filter((s) => /^KRX 공표\(08:00 KST\) 대기/.test(s.name));
    assert.equal(gates.length, 1, gates.map((g) => g.name).join(", "));
    const narr = idx(update, (s) => s.id === "telegram_narratives", "국장 총평");
    assert.ok(update.indexOf(gates[0]) > narr);
  });

  it("아침 '개장 전 지금 값'은 08:00 에 뒤에서 돌고, 결과는 지표 블록에서 찍는다", () => {
    const st = update.find((s) => s.body.includes("bg-step.sh start kr_overnight_am"))!;
    assert.match(st.body, /wait-until-kst\.sh 08:00 && python data-pipeline\/scripts\/fetch_kr_overnight\.py/);
    assert.equal(st.if, "github.event.inputs.slot == 'morning'");
  });
});

describe("아침 개장 전 요약은 화면을 바꾼 뒤에 나간다", () => {
  const post = job("morning_post");

  it("finalize 를 기다리고, update 의 출력으로 예전 조건을 그대로 건다", () => {
    assert.match(post, /needs: \[guard, update, finalize\]/);
    for (const k of ["coverage", "us_extract", "weekday"]) assert.match(post, new RegExp(`needs\\.update\\.outputs\\.${k}\\b`));
    assert.match(post, /github\.run_attempt == '1'/);
    assert.match(post, /github\.event\.inputs\.broadcast == 'morning'/);
  });

  it("update 잡 출력이 실제 스텝을 가리킨다", () => {
    const outs = job("update").match(/\n {4}outputs:\n((?: {6}.+\n)+)/)![1];
    for (const m of outs.matchAll(/steps\.(\w+)\./g)) {
      assert.ok(update.some((s) => s.id === m[1]), `출력이 없는 스텝 ${m[1]} 을 가리킨다`);
    }
  });

  it("update 잡에는 개장 전 요약 발송이 남지 않는다 — 두 번 나가면 안 된다", () => {
    assert.ok(!update.some((s) => s.body.includes("--format morning2")));
    assert.equal((wf.match(/--format morning2/g) ?? []).length, 1);
  });
});

describe("저녁 마감 리포트도 화면을 다 바꾼 뒤에 나간다", () => {
  const post = job("evening_post");

  it("finalize 를 기다리고, update 의 출력으로 예전 조건을 그대로 건다", () => {
    assert.match(post, /needs: \[guard, update, finalize\]/);
    for (const k of ["freshness", "score", "kr_extract", "weekday"]) assert.match(post, new RegExp(`needs\\.update\\.outputs\\.${k} == '(success|true)'`));
    assert.match(post, /github\.run_attempt == '1'/);
    assert.match(post, /github\.event\.inputs\.broadcast == 'evening'/);
    assert.match(post, /sleep 300/);
  });

  it("update 잡에는 저녁 마감 리포트 발송이 남지 않는다 — 두 번 나가면 안 된다", () => {
    assert.ok(!update.some((s) => s.body.includes("--format evening2")));
    assert.equal((wf.match(/--format evening2/g) ?? []).length, 1);
  });

  it("발송 스텝 이름을 그대로 둔다 — guard 가 앞 실행의 '이미 발송함'을 이 이름으로 찾는다", () => {
    assert.match(post, /- name: \(텔레그램\) B 마감 리포트 발송 \(평일 저녁\)/);
    assert.match(job("guard"), /step="B 마감 리포트"/);
  });
});

describe("요약표", () => {
  it("Summarize results 의 이름과 결과 배열 길이가 같다", () => {
    const s = update.find((x) => x.name === "Summarize results")!;
    const names = s.body.match(/names=\((.+)\)\n/)![1].match(/"[^"]*"/g)!;
    const outs = s.body.match(/outcomes=\((.+)\)\n/)![1].match(/"[^"]*"/g)!;
    assert.equal(names.length, outs.length);
    assert.ok(!s.body.includes("telegram_morning"), "다른 잡으로 옮긴 스텝을 가리킨다");
  });

  // 베스트셀러는 그날 행이 사흘 연속 빈 때만 알림에 센다(2026-10-25 #793). 요약 스텝 본문을 그대로 bash 로 돌려 본다.
  // 스텝 결과는 fail 에 적은 id 만 failure, 나머지는 success 다.
  function summarize(fail: string[], days: string): { status: number | null; env: string; summary: string } {
    const s = update.find((x) => x.name === "Summarize results")!;
    const script = s.body
      .split("run: |\n")[1]
      .replace(/^ {10}/gm, "")
      .replace(/\$\{\{ steps\.(\w+)\.outcome \}\}/g, (_, id: string) => (fail.includes(id) ? "failure" : "success"));
    const dir = mkdtempSync(join(tmpdir(), "summarize-"));
    const env = join(dir, "env");
    const summary = join(dir, "summary");
    writeFileSync(env, "");
    const r = spawnSync("bash", ["--noprofile", "--norc", "-eo", "pipefail", "-c", script], {
      env: { NODE_ENV: "test", PATH: process.env.PATH ?? "/usr/bin:/bin", GITHUB_ENV: env, GITHUB_STEP_SUMMARY: summary, BESTSELLER_MISSING_DAYS: days },
      encoding: "utf8",
    });
    return { status: r.status, env: readFileSync(env, "utf8"), summary: readFileSync(summary, "utf8") };
  }

  it("베스트셀러 빈 날 세기는 베스트셀러 실패 바로 뒤에서 돌고, 요약이 그 일수를 env 로 받는다", () => {
    const i = idx(update, (s) => s.id === "bestseller_ratio", "베스트셀러");
    const gate = update[i + 1];
    assert.equal(gate.id, "bestseller_missing");
    assert.equal(gate.if, "steps.bestseller_ratio.outcome == 'failure'");
    assert.match(gate.body, /continue-on-error: true/);
    assert.match(gate.body, /days=\$\(python data-pipeline\/scripts\/bestseller_missing_days\.py\)\n\s+echo "days=\$days" >> "\$GITHUB_OUTPUT"/);
    const s = update.find((x) => x.name === "Summarize results")!;
    assert.match(s.body, /\n {10}BESTSELLER_MISSING_DAYS: \$\{\{ steps\.bestseller_missing\.outputs\.days \}\}\n/);
  });

  it("베스트셀러만 실패하고 빈 날이 3일 아래면 알리지 않는다 — 저녁만 실패한 날(0) · 오늘 하루(1) · 이틀(2)", () => {
    for (const d of ["0", "1", "2"]) {
      const r = summarize(["bestseller_ratio"], d);
      assert.equal(r.status, 0, d);
      assert.equal(r.env, "", d);
      assert.match(r.summary, new RegExp(`\\| fetch_bestseller_ratio\\.py \\| failure \\(빈 날 ${d}일 · 3일부터 알림\\) \\|`), d);
    }
  });

  it("빈 날이 3일째면 알린다 — 실패 목록에 일수를 붙인다", () => {
    const r = summarize(["bestseller_ratio"], "3");
    assert.equal(r.status, 1);
    assert.equal(r.env, "FAILED_SCRIPTS=fetch_bestseller_ratio.py (빈 날 3일 연속)\n");
  });

  it("일수를 못 쟀으면(빈 값 · 숫자 아님) 알린다", () => {
    for (const d of ["", "x"]) {
      const r = summarize(["bestseller_ratio"], d);
      assert.equal(r.status, 1, d);
      assert.equal(r.env, "FAILED_SCRIPTS=fetch_bestseller_ratio.py\n", d);
    }
  });

  it("다른 스크립트 실패는 그대로 알린다 — 베스트셀러를 보류해도 목록에서만 빠진다", () => {
    assert.equal(summarize(["gold_ratio"], "").env, "FAILED_SCRIPTS=fetch_gold_ratio.py\n");
    const r = summarize(["gold_ratio", "bestseller_ratio"], "1");
    assert.equal(r.status, 1);
    assert.equal(r.env, "FAILED_SCRIPTS=fetch_gold_ratio.py\n");
    assert.equal(summarize([], "").status, 0);
  });
});

describe("국장 미리보기는 따로 잡에서 06:30 넘어 핀허브 종가를 받는다(2026-10-17)", () => {
  // 아침 발사는 06:10 인데 미장 종가는 예전처럼 06:30 넘어 받는다. update 잡 맨 앞에서 기다리면 카더라가 20분을 같이 잔다.
  const pv = steps(job("kr_preview"));
  const fetchAt = idx(pv, (s) => s.id === "kr_preview", "국장 미리보기");

  it("update 잡엔 미리보기가 없다 — 있으면 06:10 에 마감 13분 뒤(겨울) 종가를 받는다", () => {
    assert.ok(!update.some((s) => s.body.includes("fetch_kr_preview.py")), "update 잡에 미리보기 스텝이 남았다");
    assert.ok(!update.some((s) => s.body.includes("steps.kr_preview.")), "update 잡이 없는 스텝 결과를 읽는다(늘 빈 값)");
  });

  it("아침엔 06:30 KST 까지 기다린 뒤 받는다 — 05:00~06:30 에 시작했을 때만", () => {
    const w = pv.findIndex((s) => s.body.includes("bash scripts/wait-until-kst.sh 06:30"));
    assert.ok(w >= 0 && w < fetchAt, "미리보기 앞에 06:30 대기가 없다");
    assert.equal(pv[w].if, "github.event.inputs.slot == 'morning'");
    assert.match(pv[w].body, /\[ "\$now" -ge 500 \] && \[ "\$now" -lt 630 \]/);
  });

  it("잡은 평일 저녁에도 뜨고 스텝만 건너뛴다 — 배당 잡이 이 잡 끝을 기다린다", () => {
    assert.match(job("kr_preview"), /\n {4}if: \$\{\{ !cancelled\(\) && needs\.guard\.outputs\.skip != 'true' \}\}\n/);
    assert.match(pv[fetchAt].body, /github\.event\.inputs\.broadcast == 'morning'/);
    assert.match(pv[fetchAt].body, /continue-on-error: true/);
  });

  it("받은 뒤 아침에만 미리보기 화면만 비운다 — 홈은 칩까지 카더라 · 테마와 함께 08시대 한 묶음에서(2026-10-18)", () => {
    const rv = idx(pv, (s) => s.name === "미리보기 화면만 먼저 비우고 데우기", "미리보기 화면 비우기");
    assert.ok(rv > fetchAt);
    assert.match(pv[rv].body, /run: bash scripts\/revalidate\.sh \/preview\n/);
    assert.match(pv[rv].if ?? "", /github\.event\.inputs\.slot == 'morning'/);
  });

  it("실패 알림이 이 잡에 있다 — 스텝이 continue-on-error 라 없으면 조용히 어제 자료가 나간다", () => {
    const al = idx(pv, (s) => s.name.startsWith("Alert on 미리보기 failure"), "미리보기 실패 알림");
    assert.ok(al > fetchAt);
    assert.equal(pv[al].if, "${{ !cancelled() && steps.kr_preview.outcome == 'failure' }}");
    assert.ok(pv[al].body.includes('title="⚠️ 데일리 파이프라인 실패"'));
    assert.match(pv[al].body, /\n {10}exit 1\n/);
  });

  it("배당 잡의 미국 배당주(핀허브)는 이 잡 끝을 기다린다 — 06:10 발사면 06:33 까지라 상한은 넉넉히", () => {
    const wait = idx(dividend, (s) => s.body.includes("scripts/wait-for-job-step.sh"), "핀허브 대기");
    const us = idx(dividend, (s) => s.name.startsWith("Fetch 미국 배당주"), "미국 배당주");
    assert.ok(wait < us);
    const m = dividend[wait].body.match(/wait-for-job-step\.sh (\d+) kr_preview\n/);
    assert.ok(m, "kr_preview 잡을 기다리지 않는다");
    assert.ok(Number(m[1]) >= 40, `상한 ${m[1]}분 — 06:13 쯤 와서 06:33 까지 기다린다`);
  });
});

describe("guard 가 '이미 보냈다'를 찾는 이름은 실제 발송 스텝 이름이다(2026-10-17)", () => {
  // 2026-09-10 에 아침 발송 스텝 이름을 'A 어제 브리핑 발송'에서 바꾸며 guard 를 안 고쳐, 아침은 한 달 넘게 한 번도 안 맞았다.
  // 그동안 실패로 끝난 아침 실행을 손으로 다시 돌리면 같은 개장 전 요약이 두 번 나갈 수 있었다.
  const guard = job("guard");
  const sendOf = (j: string) => {
    const s = steps(job(j)).filter((x) => /send_telegram_broadcast\.py --send/.test(x.body));
    assert.equal(s.length, 1, `${j} 잡의 발송 스텝이 하나가 아니다`);
    return s[0];
  };
  const names = (re: RegExp) => [...guard.matchAll(re)].map((m) => m[1]);

  it("아침 이름은 개장 전 요약 발송 스텝에, 저녁 이름은 마감 리포트 발송 스텝에 들어 있다", () => {
    const morning = sendOf("morning_post");
    const evening = sendOf("evening_post");
    assert.match(morning.body, /--format morning2\n/);
    assert.match(evening.body, /--format evening2\n/);
    const am = names(/(?:morning|"21:30")\) +step="([^"]+)"/g);
    const pm = names(/\*\) +step="([^"]+)"/g);
    assert.equal(am.length, 2, `아침 이름 ${am.length}곳`);
    assert.equal(pm.length, 2, `저녁 이름 ${pm.length}곳`);
    for (const n of am) assert.ok(morning.name.includes(n), `'${n}' 이 '${morning.name}' 에 없다`);
    for (const n of pm) assert.ok(evening.name.includes(n), `'${n}' 이 '${evening.name}' 에 없다`);
  });

  it("찾는 이름은 워크플로에서 그 발송 스텝 하나에만 걸린다", () => {
    const all = [...wf.matchAll(/\n {6}- name: (.+)\n/g)].map((m) => m[1].trim());
    for (const n of new Set(names(/step="([^"]+)"/g))) {
      assert.equal(all.filter((s) => s.includes(n)).length, 1, `'${n}' 이 걸리는 스텝 수`);
    }
  });

  it("발송 스텝이 따로 잡에 있어도 찾는다 — 실행의 모든 잡 스텝을 훑는다", () => {
    const q = guard.match(/\[\.jobs\[\]\.steps\[\] \| select\(\.name \| contains\(\\"\$step\\"\)\) \| select\(\.conclusion == \\"success\\"\)\]/g) ?? [];
    assert.equal(q.length, 2, "발송 확인 조회가 두 곳이 아니다");
  });
});

describe("한 페이지 안이 따로따로 바뀌지 않는다(2026-10-17)", () => {
  // 화면의 DB 조회 사본은 라우트마다 따로이고 시간으로 만료되지 않는다(lib/read-cache.ts). 그래서 페이지는 비울 때만
  // 한꺼번에 바뀌고, 비우는 자리마다 '그 페이지가 읽는 값이 그 뒤에 더 바뀌지 않는가'만 지키면 된다.
  const finalize = steps(job("finalize"));
  const insider = steps(job("insider"));
  const reval = (list: Step[], path: string) =>
    idx(list, (s) => new RegExp(`(run: |\\n\\s+)bash scripts/revalidate\\.sh[^\\n]* ${path.replace(/[/[\]]/g, "\\$&")}( |\\n)`).test(s.body), `${path} 비우기`);

  it("finalize 는 이 실행에서 먼저 바뀐 화면을 빼고 비운다 — 또 비우면 '업데이트' 라벨만 늦게 바뀐다", () => {
    const f = idx(finalize, (s) => s.id === "revalidate_all", "finalize 비우기");
    const body = finalize[f].body;
    assert.match(body, /run: bash scripts\/finalize-revalidate\.sh\n/);
    assert.match(body, /REVALIDATE_STRICT: "1"/);
    assert.match(body, /SLOT: \$\{\{ github\.event\.inputs\.slot \}\}/);
    const env: [string, string][] = [
      ["RV_PREVIEW_AM", "kr_preview.outputs.rv_preview"],
      ["RV_MORNING_GROUP", "update.outputs.rv_morning_group"],
      ["RV_KADERA", "update.outputs.rv_kadera"],
      ["RV_KADERA_US", "update.outputs.rv_kadera_us"],
      ["RV_PREVIEW_PM", "update.outputs.rv_preview_pm"],
      ["RV_THEME", "update.outputs.rv_theme"],
      ["RV_HOME", "update.outputs.rv_home"],
    ];
    for (const [k, src] of env) assert.ok(body.includes(`${k}: \${{ needs.${src} }}`), k);
    assert.match(job("finalize"), /\n {4}needs: \[guard, kr_preview, update, insider, dividend\]\n/);
  });

  it("finalize 비우기가 끝내 실패하면 알린다 — 시간으로 저절로 새로워지는 길이 없다", () => {
    const al = idx(finalize, (s) => s.name.startsWith("Alert on 화면 비우기 failure"), "비우기 실패 알림");
    assert.equal(finalize[al].if, "${{ always() && steps.revalidate_all.outcome == 'failure' }}");
    assert.match(job("finalize"), /\n {6}issues: write/);
  });

  it("코스피 · 코스닥 종가(야후)는 update 잡의 어떤 화면 비우기보다 앞이다 — 지수 칸만 나중에 바뀌지 않게", () => {
    const hi = idx(update, (s) => s.id === "kospi_high_gap", "코스피 종가");
    const kq = idx(update, (s) => s.id === "kosdaq_ratio", "코스닥 종가");
    const first = idx(update, (s) => s.body.includes("scripts/revalidate.sh"), "첫 비우기");
    assert.ok(hi < first && kq < first, `종가 ${hi} · ${kq} · 첫 비우기 ${first}`);
    assert.ok(hi < kq, "코스닥 괴리는 코스피 종가를 읽는다");
  });

  it("저녁 미리보기 다시 비우기는 미장 카더라 비우기 뒤다 — 첫 줄 급부상 칩이 이 실행 값이 된 뒤", () => {
    const rewarm = idx(update, (s) => s.name === "미리보기 화면 다시 비우고 데우기 (지금 값 반영)", "미리보기 다시 비우기");
    assert.ok(rewarm > reval(update, "/kadera/us"));
    assert.ok(rewarm > idx(update, (s) => s.id === "kr_overnight", "개장 전 지금 값"));
    assert.ok(rewarm > idx(update, (s) => s.id === "telegram_surging_oneliners", "급부상 한 줄"));
  });

  it("카더라 · 미장 카더라 · 테마 · 홈 비우기는 제 화면이 읽는 마지막 스텝 뒤다", () => {
    const at = (id: string) => idx(update, (s) => s.id === id, id);
    assert.ok(reval(update, "/kadera") > at("telegram_narratives"));
    assert.ok(reval(update, "/kadera") > at("telegram_us_sentiment"));
    assert.ok(reval(update, "/kadera/us") > at("telegram_us_narratives"));
    assert.ok(reval(update, "/kadera/us") > at("telegram_move_reasons"));
    assert.ok(reval(update, "/theme") > at("telegram_theme_briefs"));
    assert.ok(reval(update, "/theme") > at("telegram_us_theme_briefs"));
    const home = reval(update, "/");
    assert.ok(home > at("calculate_score"));
    assert.ok(home > idx(update, (s) => s.name.startsWith("Generate daily AI summary"), "히어로 요약"));
  });

  it("배당 화면은 카더라 일별 집계(국장 · 미장)가 끝난 뒤 비운다 — 맨 위 칩 순서가 그 표를 쓴다", () => {
    const w = idx(dividend, (s) => s.body.includes('wait-for-job-step.sh 120 "update::(텔레그램) 종목 일별 집계" "update::(텔레그램) 미국 종목·채널 일별 집계"'), "카더라 집계 대기");
    assert.ok(w < reval(dividend, "/dividend"));
  });

  it("배당 잡은 테마 상세를 먼저 비우지 않는다 — 등락률만 먼저 바뀌고 테마 요약은 나중에 바뀌었다", () => {
    for (const s of dividend) assert.ok(!(s.body.includes("revalidate.sh") && s.body.includes("/theme")), s.name);
  });

  it("내부자 화면은 미장 일별 집계가 끝난 뒤 비운다 — 언급 수를 같이 그린다", () => {
    const w = idx(insider, (s) => s.body.includes('wait-for-job-step.sh 150 "update::(텔레그램) 미국 종목·채널 일별 집계"'), "미장 집계 대기");
    assert.ok(w < reval(insider, "/insider"));
    assert.match(job("insider"), /\n {6}actions: read/);
  });

  it("기다리는 대상 스텝 이름이 update 잡에 있다 — 이름이 바뀌면 30분 · 두 시간을 헛기다린다", () => {
    for (const name of ["(텔레그램) 종목 일별 집계", "(텔레그램) 미국 종목·채널 일별 집계"]) {
      assert.equal(update.filter((s) => s.name.startsWith(name)).length, 1, name);
    }
  });
});

describe("손으로 돌리는 재실행도 파이프라인 도중엔 화면을 안 비운다(2026-10-17)", () => {
  for (const f of ["narratives-rerun", "surging-oneliners-rerun", "move-reasons-rerun", "telegram-broadcast"]) {
    it(f, () => {
      const y = read(`.github/workflows/${f}.yml`);
      const all = steps(y);
      const busy = idx(all, (s) => s.id === "busy", "파이프라인 확인");
      assert.match(all[busy].body, /bash scripts\/pipeline-busy\.sh/);
      const revals = all.filter((s) => s.body.includes("scripts/revalidate.sh"));
      assert.ok(revals.length >= 1, "비우기 스텝이 없다");
      for (const s of revals) {
        assert.ok(all.indexOf(s) > busy, `${s.name} 이 확인보다 앞이다`);
        assert.match(s.if ?? "", /steps\.busy\.outputs\.busy != 'true'/, s.name);
      }
      assert.match(y, /\n {6}actions: read/);
    });
  }
});
