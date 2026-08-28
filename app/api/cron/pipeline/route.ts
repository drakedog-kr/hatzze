import { NextResponse } from "next/server";

import { hasRunSince, isKstWeekday, resolveSlot, sinceIso } from "@/lib/cron-schedule";

// Vercel 크론이 부르는 자리다. 캐시가 끼면 판단이 굳으므로 매번 새로 돈다.
export const dynamic = "force-dynamic";

const REPO = "drakedog-kr/hatzze";
const WORKFLOW_FILE = "daily-update.yml";
const RUNS_URL = `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW_FILE}/runs?per_page=20`;
const DISPATCH_URL = `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`;

/**
 * 파이프라인을 정시에 시작시킨다. 아침 07:00 · 저녁 18:00 KST.
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

  // 어느 예약이 불렀나. 두 크론이 같은 경로를 쓰므로 헤더로 가른다.
  const slot = resolveSlot(request.headers.get("x-vercel-cron-schedule"));
  if (!slot) {
    return NextResponse.json({ ok: false, error: "모르는 크론" }, { status: 400 });
  }

  const now = new Date();
  const since = sinceIso(slot.fireUtc, now);
  const gh = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };

  let runs: { created_at: string; html_url?: string }[];
  try {
    const res = await fetch(RUNS_URL, { headers: gh, cache: "no-store" });
    if (!res.ok) throw new Error(`실행 목록 조회 ${res.status}`);
    runs = ((await res.json()) as { workflow_runs?: typeof runs }).workflow_runs ?? [];
  } catch (e) {
    // 못 정했으니 던지지 않는다(위 주석).
    return NextResponse.json(
      { ok: false, slot: slot.label, dispatched: false, error: String(e) },
      { status: 502 },
    );
  }

  const { covered, url } = hasRunSince(runs, since);
  if (covered) {
    return NextResponse.json({ ok: true, slot: slot.label, since, dispatched: false, covered: url });
  }

  // 주말이면 데이터만 채우고 채널로는 보내지 않는다(lib/cron-schedule.ts 의 요일 주석).
  const broadcast = isKstWeekday(now) ? slot.broadcast : "none";

  const res = await fetch(DISPATCH_URL, {
    method: "POST",
    headers: { ...gh, "Content-Type": "application/json" },
    body: JSON.stringify({ ref: "main", inputs: { broadcast } }),
  });
  if (!res.ok) {
    return NextResponse.json(
      { ok: false, slot: slot.label, since, dispatched: false, error: `dispatch ${res.status}` },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, slot: slot.label, since, dispatched: true, broadcast });
}
