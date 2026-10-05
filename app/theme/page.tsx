import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { assertLoaded } from "@/lib/load-state";
import { listThemeOverview, listThemeRisers, themeUpdatedAt } from "@/lib/theme-page";

import { THEME_CARD } from "../og-copy";
import { pageMetadata } from "../seo";
import { THEME_PUBLIC } from "../screen-flags";
import { KR_THEME_SHORT, THEME_PAGE } from "./copy";
import { KR_MARKET } from "./market";
import { ThemeIndexView } from "./ThemeIndexView";

/**
 * 국장 테마 목록(`/theme`). 본문은 ThemeIndexView(국장·미장 공용)가 그리고, 이 파일은 자료 읽기·메타데이터만 맡는다.
 * 미장 짝은 app/theme/us/page.tsx.
 */

/** ⛔ 아직 안 연 화면이다. 스위치는 `app/screen-flags.ts` 한 곳에 있다. */
const PUBLIC = THEME_PUBLIC;
const DEPLOYED = Boolean(process.env.VERCEL_ENV);

export async function generateMetadata(): Promise<Metadata> {
  const meta = await pageMetadata({
    title: `${KR_THEME_SHORT} | hatzze`,
    description: THEME_PAGE.description,
    path: THEME_PAGE.href,
    ownImage: THEME_CARD.alt,
  });
  return PUBLIC ? meta : { ...meta, robots: { index: false, follow: false } };
}

export default async function ThemeIndexPage() {
  if (!PUBLIC && DEPLOYED) notFound();
  const [themes, risersAll, updatedAt] = await Promise.all([listThemeOverview(), listThemeRisers(), themeUpdatedAt("kr")]);
  // 조회가 5xx 로 죽었으면 던진다 — "불러오지 못했습니다" 화면을 사본(ISR)에 담지 않는다(lib/load-state.ts).
  // 목록 함수들은 실패를 null 로 돌려줘서, 이게 없으면 그 렌더가 성공으로 쳐져 다음 재생성(최대 한 시간)까지 나간다.
  assertLoaded("/theme");
  // 이유를 못 쓴 종목은 싣지 않는다(2026-09-22) — 그 거름과 '그날 줄이 없으면 앞 날' 채우기는 lib/theme-risers.ts risersWithFallback.
  return <ThemeIndexView market={KR_MARKET} themes={themes} risers={risersAll?.risers ?? null} risersAsOf={risersAll?.asOf ?? null} updatedAt={updatedAt} />;
}
