import "server-only";

import { readCacheInit } from "@/lib/read-cache";
import { currentRoute } from "@/lib/supabase-server";

/**
 * 이 화면이 **실제로 새로 바뀐 시각** — 화면 첫 줄 '업데이트' 라벨이 쓴다(2026-10-18).
 *
 * 화면의 DB 조회 사본은 라우트마다 따로이고 시간으로 만료되지 않는다(lib/read-cache.ts). 파이프라인이 그 화면을 비우면
 * 다음에 그릴 때 조회를 전부 새로 받고, 그 뒤엔 다시 비울 때까지 그대로다. 여기서도 그 사본 하나를 받는다 — 작은 조회 한 번을
 * 같은 규칙(라우트 머리 · 무기한)으로 보내 **응답 머리의 `date`**(Supabase 가 그 응답을 낸 시각)를 읽는다. Next 데이터 캐시는
 * 응답 머리까지 담아 두므로, 이 값은 비운 뒤 처음 그린 때로 굳는다. 시간이 지나 화면 사본만 다시 그려져도(시세 갱신) 그대로다.
 *
 * 예전엔 자료가 쓰인 시각(총평 · 점수)을 적어, 아침 화면이 08:13 에 바뀌어도 '오전 7시 30분'(총평 07:40)이 떴다.
 * ⚠️ 그래서 **이미 바뀐 화면을 같은 실행에서 또 비우면 안 된다** — 내용은 그대로인데 라벨만 바뀐다. 파이프라인 마지막
 *    비우기(finalize)는 먼저 바뀐 묶음을 뺀다(daily-update.yml finalize 잡).
 * ⚠️ 못 읽으면 null — 부르는 쪽이 자료 시각으로 물러선다.
 */
export async function pageRefreshedAt(): Promise<string | null> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  try {
    const init = readCacheInit({ headers: { apikey: key, Authorization: `Bearer ${key}` } }, currentRoute());
    const res = await fetch(`${url}/rest/v1/daily_score?select=date&limit=1`, init);
    const d = res.headers.get("date");
    const ms = d ? Date.parse(d) : NaN;
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
  } catch {
    return null;
  }
}
