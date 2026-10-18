import "server-only";

import { latestIso } from "@/lib/format";
import { withScopedLoadFailures } from "@/lib/load-state";
import { labelRefreshKeys } from "@/lib/revalidate-paths";
import { currentRoute, getSupabaseAdmin } from "@/lib/supabase-server";

/**
 * 이 화면을 파이프라인이 **마지막으로 비운 시각** — 화면 첫 줄 '업데이트' 라벨이 쓴다(2026-10-18).
 *
 * /api/revalidate 가 비우기 직전에 비운 자리마다 지금 시각을 page_refresh 표에 적는다(supabase/migration_105_page_refresh.sql).
 * 여기서는 제 라우트 · 제 최상위 자리 · 전부, 세 줄 가운데 가장 늦은 시각을 읽는다(lib/revalidate-paths.ts labelRefreshKeys).
 * 화면은 비운 직후에 새로 그려지므로 이 값이 화면이 바뀐 때다. DB 값이라 배포 · 캐시를 다시 받아도 다음 비우기 전까지 같다.
 *
 * 처음(#763)엔 화면 조회 사본의 응답 시각(date 머리)을 읽었다. 로컬 빌드에선 비울 때까지 굳었지만 운영 Vercel 에선 배포 즈음에
 * 그 사본이 다시 받아져, 10-18 저녁 파이프라인이 안 돌았는데도 카더라 · 미리보기 · 테마 라벨이 '오후 7시 30분'에서 '오후 8시'로
 * 바뀌었다.
 * ⚠️ 이미 바뀐 화면을 같은 실행에서 또 비우면 내용은 그대로인데 라벨만 바뀐다. 파이프라인 마지막 비우기(finalize)는 먼저 바뀐
 *    자리를 뺀다(scripts/finalize-revalidate.sh).
 * ⚠️ 줄이 없거나 못 읽으면 null — 부르는 쪽이 자료 시각으로 물러선다. 이 조회가 실패해도 화면을 던지지 않는다(제 실패 목록).
 */
export async function pageRefreshedAt(): Promise<string | null> {
  const route = currentRoute();
  if (!route) return null;
  try {
    const { value, failed } = await withScopedLoadFailures(async () => {
      const { data, error } = await getSupabaseAdmin()
        .from("page_refresh")
        .select("refreshed_at")
        .in("target", labelRefreshKeys(route));
      if (error) {
        console.error("[pageRefreshedAt] page_refresh 를 못 읽었습니다", error);
        return null;
      }
      return latestIso(...(data ?? []).map((r) => r.refreshed_at as string | null));
    });
    return failed.length ? null : value;
  } catch {
    return null;
  }
}
