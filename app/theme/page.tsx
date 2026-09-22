import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { listThemeOverview, listThemeRisers, themeUpdatedAt } from "@/lib/theme-page";

import { KADERA_CARD } from "../og-copy";
import { pageMetadata } from "../seo";
import { THEME_PUBLIC } from "../screen-flags";
import { THEME_PAGE } from "./copy";
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
    title: `${THEME_PAGE.label} | hatzze`,
    description: THEME_PAGE.description,
    path: THEME_PAGE.href,
    ownImage: KADERA_CARD.alt,
    imagePath: "/kadera",
  });
  return PUBLIC ? meta : { ...meta, robots: { index: false, follow: false } };
}

export default async function ThemeIndexPage() {
  if (!PUBLIC && DEPLOYED) notFound();
  const [themes, risersAll, updatedAt] = await Promise.all([listThemeOverview(), listThemeRisers(), themeUpdatedAt("kr")]);
  // 이유를 못 쓴 종목(등락률 목록에만 있던 것)은 싣지 않는다 — "이유를 말한 곳이 없습니다"가 줄을 차지했다(2026-09-22).
  const risers = risersAll === null ? null : risersAll.filter((r) => r.reason);
  return <ThemeIndexView market={KR_MARKET} themes={themes} risers={risers} updatedAt={updatedAt} />;
}
