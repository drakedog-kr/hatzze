/**
 * .github/workflows/daily-update.yml — 아침 '한 번에 바꾸기'와 미장 갈래 나란히 돌리기(2026-10-16).
 *
 * 미장 스텝들은 scripts/kadera-us-chain.sh 가 뒤에서 돌리고, 원래 자리에는 같은 id 의 기다리기 스텝
 * (`bash scripts/bg-step.sh wait <이름>`)이 선다. 여기가 어긋나면 기다리기 스텝이 10분 · 150분을 헛기다리거나
 * (시작이 없다), 국장 스텝이 미장 결과를 읽기 전에 돌아 **조용히 어제 값**을 쓴다(순서가 틀렸다).
 * 아침 화면은 finalize 의 전체 비우기 한 번으로 바뀌어야 하는데, 중간에 화면 비우기가 남으면 반쯤 바뀐 화면이 나간다.
 * 돌리는 법: `npm test`.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

describe("아침은 화면을 한 번에 바꾼다(finalize)", () => {
  // 지금처럼 따로 바뀌는 것: 국장 미리보기(06:33) · 저녁에만 도는 '지금 값' 미리보기 다시 비우기 · 배당 화면(/dividend 만).
  // 내부자 잡은 따로 둔다.
  const DIVIDEND_AM = "배당 화면만 먼저 비우고 데우기 (아침 · /dividend 만)";
  const EXCEPT = new Set(["미리보기 화면·홈 먼저 비우고 데우기", "미리보기 화면 다시 비우고 데우기 (지금 값 반영)", DIVIDEND_AM]);

  it("update · 배당 잡의 화면 비우기는 아침엔 돌지 않는다", () => {
    for (const s of [...update, ...dividend]) {
      if (!s.body.includes("scripts/revalidate.sh") || EXCEPT.has(s.name)) continue;
      assert.match(s.if ?? "", /github\.event\.inputs\.slot != 'morning'/, `${s.name} 이 아침에도 화면을 비운다`);
    }
  });

  it("아침 배당 화면 비우기는 /dividend 하나만 — 종목 화면(/stock)은 카더라를 같이 그려 한 번에 바뀐다", () => {
    const am = dividend.find((s) => s.name === DIVIDEND_AM);
    assert.ok(am, "아침 /dividend 비우기 스텝이 없다");
    assert.equal(am.if, "${{ !cancelled() && github.event.inputs.slot == 'morning' }}");
    assert.match(am.body, /run: bash scripts\/revalidate\.sh \/dividend\n/);
    assert.ok(!am.body.includes("/stock"), "아침에 종목 화면까지 먼저 비운다");
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
});
