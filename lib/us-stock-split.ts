import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { splitAdjOf, type StockSplit } from "./insider-13f";
import { withScopedLoadFailures } from "./load-state";

/**
 * 미국 종목 액면분할 기록(us_stock_split · data-pipeline/scripts/fetch_us_splits.py) → (티커, 분기말) 누적 배수.
 * 13F 분기 비교(메인 · 종목 상세 · 인물 상세 · 차트 마커)가 같이 쓴다 — 한 곳만 보정하면 화면끼리 증감률이 갈린다.
 *
 * 곁가지라 못 읽으면(표가 아직 없거나 5xx) 보정 없이 1 로 둔다. 실패는 이 안에 가둬 화면 재생성을 멈추지 않는다.
 */
export async function loadSplitAdj(db: SupabaseClient): Promise<(ticker: string, date: string) => number> {
  const { value } = await withScopedLoadFailures(async () => {
    const { data, error } = await db.from("us_stock_split").select("ticker,ex_date,ratio");
    if (error) console.error("[insider] 액면분할 기록 조회 실패 — 보정 없이 견줍니다", error.message);
    return (data ?? []) as StockSplit[];
  });
  return splitAdjOf(value);
}
