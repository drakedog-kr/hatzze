/**
 * 파이프라인을 정시에 시작시키는 **시계의 판단부**.
 *
 * 왜 깃헙 밖에 두나. 2026-08-26~28 에 깃헙 예약이 무너졌다. 실행이 3시간 27분,
 * 10시간 41분씩 늦게 생기다가, 08-28 에는 아침 저녁 네 발화가 **모두 실행을 만들지 못해
 * 하루 두 번을 다 손으로 돌렸다.** 깃헙 문서가 인정하는 동작이다 — 부하가 높으면 예약을
 * 지연시키고, 심하면 큐에 있던 잡을 버린다. 워크플로 안에 백업 크론을 하나 더 둬 봤지만
 * 그것도 같은 예약 장치라 같은 날 같이 사라졌다. 그래서 **시계만** 밖으로 뺀다.
 * 일하는 곳은 그대로 깃헙 러너다(Vercel 함수는 90분짜리 파이썬 파이프라인을 못 담는다).
 *
 * ⭐ **이게 주 시계다.** 깃헙 예약은 백업 두 줄(`30 22`·`30 9`)만 남겨 뒀다. Vercel 이
 *    던지면 그 백업은 게이트에 걸려 10초 만에 빠지고, Vercel 이 못 던진 날에만 실제로
 *    돈다. 서로 다른 회사라 같이 죽을 확률이 낮다 — 그래서 백업을 지우지 않는다.
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
 * 시각은 **아침 07:00 · 저녁 18:00 KST**(22:00Z · 09:00Z)다. `workflow_dispatch` 는 큐를
 * 안 타서 생성과 시작이 같은 초라(실측), 여기 적은 시각이 곧 실행 시작 시각이다.
 *
 * 실측(2026-08-28)으로 고른 값이다. 실행 시작 +75분에 KRX 공표 게이트, +76분에 디시 수집이
 * 돌고, 소요는 아침 87분·저녁 83분이다. 그래서
 *   07:00 시작 → 게이트에 08:15 도달(08:00 공표 뒤라 대기 없음) → 08:27 완료
 *   18:00 시작 → 디시 표본 17:16~19:16(눈금 기준과 9분 차) → 19:23 완료
 * ⚠️ 아침을 06:00 처럼 더 당기면 게이트가 08:00 까지 러너를 재운다.
 * ⚠️ `fireUtc` 는 발사 시각이 아니라 **슬롯의 경계**다(06:30·17:30 KST). "이 슬롯이 이미
 *    처리됐나"를 그 시각 기준으로 세므로, 발사 시각을 옮겨도 여기는 그대로 둔다.
 */
export const CRON_TO_SLOT: Record<string, Slot> = {
  "0 22 * * *": { key: "morning", label: "아침", fireUtc: "21:30", broadcast: "morning" },
  "0 9 * * *": { key: "evening", label: "저녁", fireUtc: "08:30", broadcast: "evening" },
};

export function resolveSlot(schedule: string | null): Slot | null {
  if (!schedule) return null;
  return CRON_TO_SLOT[schedule.trim()] ?? null;
}

/**
 * 가장 가까운 **과거**의 슬롯 경계(ISO). 이 시각 뒤에 생긴 실행이 있으면 슬롯은 처리된 것이다.
 *
 * 두 크론 다 자기 슬롯 경계보다 늦게 울리므로 보통은 같은 날짜지만, 값을 바꾸거나 호출이
 * 밀려 자정을 넘길 수 있어 미래로 계산되면 하루를 뺀다.
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
