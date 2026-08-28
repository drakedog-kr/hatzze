/**
 * 파이프라인이 **아예 안 돈 날**에만 손 대신 버튼을 눌러 주는 시계의 판단부.
 *
 * 왜 깃헙 밖에 두나. 2026-08-26~28 에 깃헙 예약이 무너졌다. 실행이 3시간 27분,
 * 10시간 41분씩 늦게 생기다가, 08-28 아침에는 본 발화(21:30Z)와 백업 발화(22:30Z)가
 * **둘 다 실행을 만들지 못했다.** 깃헙 문서가 인정하는 동작이다 — 부하가 높으면 예약을
 * 지연시키고, 심하면 큐에 있던 잡을 버린다. 워크플로 안에 백업 크론을 하나 더 둬 봤지만
 * 그것도 같은 예약 장치라 같은 날 같이 사라졌다. 그래서 **시계만** 밖으로 뺀다.
 * 일하는 곳은 그대로 깃헙 러너다(Vercel 함수는 90분짜리 파이썬 파이프라인을 못 담는다).
 *
 * ⚠️ **던지는 조건은 '아예 안 돌았을 때' 하나뿐이다.** 발화 뒤에 생긴 실행이 있으면
 *    결과가 실패여도 던지지 않는다. 워크플로 안의 게이트는 반대로 실패를 '미처리'로 보고
 *    다음 예약을 통과시키는데(예약이 만회 수단이라서), 그 규칙을 여기까지 쓰면 사고가 난다.
 *    2026-08-28 이 그랬다 — 지표 셋이 403 으로 실패했을 뿐 브리핑은 이미 나간 실행을
 *    미처리로 보고 8시간 늦은 예약이 통과해, 같은 브리핑이 한 번 더 나갈 뻔했다.
 */

export type SlotKey = "morning" | "evening";

export type Slot = {
  key: SlotKey;
  label: string;
  /** 이 슬롯의 본 발화 시각(UTC, HH:MM). 여기부터 '이 슬롯의 실행'으로 센다. */
  fireUtc: string;
  /** 던질 때 워크플로에 넘길 발송 포맷. 주말이면 none 으로 낮춘다(아래 참고). */
  broadcast: SlotKey;
};

/**
 * Vercel 크론 → 슬롯. 두 크론이 같은 경로를 쓰므로 `x-vercel-cron-schedule` 헤더로 가른다.
 *
 * 시각은 **본 발화 +100분**이다(08:10 · 19:10 KST). 근거가 둘이다.
 *   ① 그 사이에 백업 발화(본 발화 +60분)가 정상 지연 15~41분으로 도착할 여지를 준다.
 *      백업이 왔으면 이 시계는 아무것도 안 한다.
 *   ② 워크플로 게이트의 지각 상한이 120분이라, +100분에 던진 실행은 그 안쪽이다.
 *      상한을 바꾸면 이 값도 같이 봐야 한다.
 */
export const CRON_TO_SLOT: Record<string, Slot> = {
  "10 23 * * *": { key: "morning", label: "아침", fireUtc: "21:30", broadcast: "morning" },
  "10 10 * * *": { key: "evening", label: "저녁", fireUtc: "08:30", broadcast: "evening" },
};

export function resolveSlot(schedule: string | null): Slot | null {
  if (!schedule) return null;
  return CRON_TO_SLOT[schedule.trim()] ?? null;
}

/**
 * 가장 가까운 **과거**의 발화 시각(ISO). 이 시각 뒤에 생긴 실행이 있으면 슬롯은 처리된 것이다.
 *
 * 두 크론 다 자기 발화보다 늦게 울리므로 보통은 같은 날짜지만, 값을 바꾸거나 호출이 밀려
 * 자정을 넘길 수 있어 미래로 계산되면 하루를 뺀다.
 */
export function sinceIso(fireUtc: string, now: Date): string {
  const [h, m] = fireUtc.split(":").map(Number);
  const fire = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h, m, 0, 0),
  );
  if (fire.getTime() > now.getTime()) fire.setUTCDate(fire.getUTCDate() - 1);
  return fire.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/**
 * 한국 시각 기준 평일인가. 발송을 결정하는 데만 쓴다.
 *
 * ⚠️ 주말에는 발송을 none 으로 낮춰야 한다. 예약 실행의 발송 조건에는 평일 게이트가
 *    붙어 있지만, 수동 실행에서 넘기는 `broadcast` 입력은 **사람이 명시적으로 고른 것**이라
 *    그 게이트를 지나친다(그렇게 설계했다). 이 시계는 사람이 아니므로 요일을 스스로 본다.
 *    주말에 온도가 금요일 값 그대로인 글을 보내면 뮤트로 가는 지름길이다.
 */
export function isKstWeekday(now: Date): boolean {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const dow = kst.getUTCDay(); // 0=일 … 6=토
  return dow >= 1 && dow <= 5;
}

/** 실행 목록에서 이 슬롯의 실행이 있는지 본다. 결과(성공·실패)는 보지 않는다 — 위 주석 참고. */
export function hasRunSince(
  runs: { created_at: string; html_url?: string; conclusion?: string | null }[],
  since: string,
): { covered: boolean; url?: string } {
  const hit = runs.find((r) => r.created_at >= since);
  return hit ? { covered: true, url: hit.html_url } : { covered: false };
}
