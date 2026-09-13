import { NextResponse } from "next/server";

import { hasRunSince, resolveJob, sinceIso } from "@/lib/cron-schedule";

// Vercel 크론이 부르는 자리다. 캐시가 끼면 판단이 굳으므로 매번 새로 돈다.
export const dynamic = "force-dynamic";

const REPO = "drakedog-kr/hatzze";
const BRANCH = "main";
// ⚠️ 실행 목록은 **main 것만** 센다. 브랜치에서 손으로 돌린 실행(2026-08-25 에 실제로
//    있었다)이 섞이면 "이미 처리됨"으로 읽혀 정작 필요한 발사를 막는다.
const RUNS_QUERY = `runs?per_page=20&branch=${BRANCH}`;
// 깃헙이 응답을 안 주면 함수가 제한 시간까지 매달렸다가 아무것도 못 한다. 끊고 502 를
// 돌려 로그에 남기는 편이 낫다(어차피 못 정하면 안 던진다).
const TIMEOUT_MS = 10_000;
// 깃헙이 5xx 를 주거나 끊겼을 때 다시 시도하는 횟수(첫 시도 포함). 실행 목록 조회와
// 던지기 둘 다 이만큼이다. 전부 끊기는 최악의 경우에도 3분 안이라 함수 제한 시간(5분)
// 안이다.
const ATTEMPTS = 3;
// 다시 시도하기 전 기다리는 시간. 깃헙이 받아 놓고 오류를 돌려줬다면 이 사이에 실행이
// 생긴다(workflow_dispatch 는 큐를 안 타서 생성이 곧바로다 · 실측 3~4초).
const RETRY_DELAY_MS = 5_000;
const api = (workflow: string, tail: string) =>
  `https://api.github.com/repos/${REPO}/actions/workflows/${workflow}/${tail}`;

type Run = { created_at: string; html_url?: string };

/** 깃헙 호출 실패. `status` 가 없으면 응답을 못 받고 끊긴 것이다(타임아웃·네트워크). */
class GithubError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

/** 다시 시도할 만한 실패인가. 끊김과 5xx·429 만이다. 4xx 는 다시 던져도 같은 답이 온다
 *  (토큰 만료 401 · 권한 403 · 입력 오류 422). */
function isRetryable(e: unknown): boolean {
  if (!(e instanceof GithubError)) return false;
  return e.status === undefined || e.status >= 500 || e.status === 429;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * 예약이 걸린 워크플로 셋을 시각에 맞춰 깨운다. 어느 크론이 불렀는지로 무엇을 던질지
 * 가른다(lib/cron-schedule.ts 의 CRON_TO_JOB).
 *
 *   파이프라인 아침 07:00 · 저녁 18:00 · 채널 발송 수 12:30 · 토 10:30 · 일 21:00 · 사전 스캔 월 10:00
 *
 * ⭐ **깃헙 예약은 셋 다 껐다(2026-08-29).** 시계가 여기 하나뿐이라 "누가 먼저 돌았나"를
 *    따질 경계가 없다. 그래도 아래 '이미 돌았나' 검사는 남긴다 — Vercel 이 같은 예약을
 *    두 번 부를 수 있기 때문이다(문서 명시).
 *
 * 깃헙 예약이 무너진 날(2026-08-26~28)에 사람이 화면을 보고 알아채 손으로 눌러야 했다.
 * 그 클릭을 대신하는 시계다. 판단 규칙과 시각의 근거는 lib/cron-schedule.ts 주석에 있다.
 *
 * 이미 이 슬롯의 실행이 있으면(깃헙 백업이 먼저 돌았거나 손으로 돌렸거나) 아무것도 하지
 * 않는다. 그래서 주 시계이면서 동시에 중복 방지 장치다.
 *
 * ⚠️ **못 정하면 던지지 않는다.** 깃헙 조회가 실패하면 실행이 있는지 없는지 알 수 없는데,
 *    그 상태에서 던지면 이미 도는 파이프라인 위에 하나를 더 얹어 같은 표를 동시에 쓰고
 *    같은 리포트를 두 번 보낼 수 있다. 안 던져서 생기는 손해(그날 한 번 손으로 누름)가
 *    던져서 생기는 손해보다 작다.
 *
 * ⚠️ **깃헙이 5xx 를 주거나 끊기면 다시 시도한다(ATTEMPTS).** 시계가 이것뿐이라 한 번
 *    실패하면 그 몫을 만회할 다음 호출이 없다. 2026-09-13 18:00 에 실행 목록 조회는
 *    됐는데 dispatch 가 500 한 번으로 끝나, 저녁 파이프라인이 통째로 빠지고 사람이 손으로
 *    던져야 했다. 다시 던지기 전에는 실행 목록을 한 번 더 본다 — 깃헙이 받아 놓고
 *    오류를 돌려줬을 수 있고(끊긴 경우는 특히), 그때 또 던지면 같은 실행이 둘이 된다.
 *    그 조회마저 실패하면 위 규칙대로 던지지 않는다.
 *
 * ⚠️ Vercel 크론 전달은 best effort 라 **같은 예약이 두 번 불릴 수 있다**(문서에 명시).
 *    던지면 깃헙이 곧바로 실행을 만들므로, 두 번째 호출은 그 실행을 보고 스스로 빠진다.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const token = process.env.GH_DISPATCH_TOKEN;
  if (!token) {
    return NextResponse.json({ ok: false, error: "GH_DISPATCH_TOKEN 이 없습니다" }, { status: 500 });
  }

  // 어느 예약이 불렀나. 크론 넷이 같은 경로를 쓰므로 헤더로 가른다.
  const job = resolveJob(request.headers.get("x-vercel-cron-schedule"));
  if (!job) {
    return NextResponse.json({ ok: false, error: "모르는 크론" }, { status: 400 });
  }

  const now = new Date();
  const since = sinceIso(job.fireUtc, now);
  const gh = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
  // 시도마다 무엇이 잘못됐는지. 응답에 실어 Vercel 로그에서 그대로 읽는다.
  const errors: string[] = [];

  let runs: Run[];
  try {
    runs = await listRunsRetrying(job.workflow, gh, errors, "실행 목록");
  } catch {
    // 못 정했으니 던지지 않는다(위 주석).
    return NextResponse.json(
      { ok: false, job: job.label, dispatched: false, errors },
      { status: 502 },
    );
  }

  const { covered, url } = hasRunSince(runs, since);
  if (covered) {
    return NextResponse.json({ ok: true, job: job.label, since, dispatched: false, covered: url });
  }

  // 요일에 따라 달라지는 입력은 잡 표가 정한다(주말이면 발송을 끄고, 일요일이면 주간 결산).
  const inputs = job.inputs(now);

  let last: unknown;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      await dispatch(job.workflow, gh, inputs);
      return NextResponse.json({ ok: true, job: job.label, since, dispatched: true, attempt, inputs });
    } catch (e) {
      last = e;
      errors.push(`dispatch ${attempt}회: ${String(e)}`);
    }
    if (!isRetryable(last) || attempt === ATTEMPTS) break;

    // 다시 던지기 전에 실행이 생겼는지 본다. 깃헙이 받아 놓고 오류를 돌려줬을 수 있다.
    await sleep(RETRY_DELAY_MS);
    let again: Run[];
    try {
      again = await listRunsRetrying(job.workflow, gh, errors, "재확인");
    } catch {
      // 못 정했으니 던지지 않는다(위 주석). 던져졌을 수도 있어 unknown 으로 남긴다.
      return NextResponse.json(
        { ok: false, job: job.label, since, dispatched: "unknown", errors },
        { status: 502 },
      );
    }
    const seen = hasRunSince(again, since);
    if (seen.covered) {
      return NextResponse.json({
        ok: true,
        job: job.label,
        since,
        dispatched: false,
        covered: seen.url,
        errors,
      });
    }
  }

  // 끊겨서 끝났으면 깃헙이 받았을 수도 있어 "안 던졌다"고 단정하지 않는다. 사람이 실행
  // 목록을 보고 판단한다(던지면 실행이 곧 생기므로 중복이 되진 않는다).
  const cut = last instanceof GithubError && last.status === undefined;
  return NextResponse.json(
    { ok: false, job: job.label, since, dispatched: cut ? "unknown" : false, errors },
    { status: 502 },
  );
}

/** 실행 목록 한 번. 못 받으면 GithubError 를 던진다. */
async function listRuns(workflow: string, gh: Record<string, string>): Promise<Run[]> {
  let res: Response;
  try {
    res = await fetch(api(workflow, RUNS_QUERY), {
      headers: gh,
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    throw new GithubError(`실행 목록 조회 끊김: ${String(e)}`);
  }
  if (!res.ok) throw new GithubError(`실행 목록 조회 ${res.status}`, res.status);
  let body: { workflow_runs?: Run[] };
  try {
    body = (await res.json()) as typeof body;
  } catch (e) {
    // 본문이 잘려 왔을 수 있다. 끊김과 같이 다룬다.
    throw new GithubError(`실행 목록 본문 해석 실패: ${String(e)}`);
  }
  // ⚠️ 키가 **없는** 것과 빈 배열은 다르다. 실행이 없는 날은 `[]` 가 오고, 키가 통째로
  //    없다면 응답 모양이 바뀐 것이라 판단 근거가 없다 — 그때는 던지지 않는다.
  if (!Array.isArray(body.workflow_runs)) throw new GithubError("실행 목록 응답 모양이 다르다");
  return body.workflow_runs;
}

/** 실행 목록을 ATTEMPTS 번까지 받아 본다. 조회는 읽기만 하므로 몇 번 해도 해가 없다. */
async function listRunsRetrying(
  workflow: string,
  gh: Record<string, string>,
  errors: string[],
  label: string,
): Promise<Run[]> {
  let last: unknown;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      return await listRuns(workflow, gh);
    } catch (e) {
      last = e;
      errors.push(`${label} ${attempt}회: ${String(e)}`);
    }
    if (!isRetryable(last) || attempt === ATTEMPTS) break;
    await sleep(RETRY_DELAY_MS);
  }
  throw last;
}

/** 워크플로를 한 번 던진다. 깃헙이 거절하면 상태 코드를 담아, 끊기면 상태 없이 GithubError 를 던진다. */
async function dispatch(
  workflow: string,
  gh: Record<string, string>,
  inputs: Record<string, string>,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(api(workflow, "dispatches"), {
      method: "POST",
      headers: { ...gh, "Content-Type": "application/json" },
      body: JSON.stringify({ ref: BRANCH, inputs }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    throw new GithubError(`끊김: ${String(e)}`);
  }
  if (!res.ok) throw new GithubError(`${res.status}`, res.status);
}
