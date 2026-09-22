import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { lastThemeBriefAt } from "@/lib/theme-page";
import { listUsThemeOverview, listUsThemeRisers } from "@/lib/us-theme-page";

import { KADERA_CARD } from "../../og-copy";
import { pageMetadata } from "../../seo";
import { THEME_PUBLIC } from "../../screen-flags";
import { US_THEME_PAGE } from "../copy";
import { US_MARKET } from "../market";
import { ThemeIndexView } from "../ThemeIndexView";

/**
 * 미장 테마 목록(`/theme/us`). 국장(/theme)과 같은 뷰(ThemeIndexView)를 미장 자료(lib/us-theme-page.ts)로 그린다.
 * 정적 구간 `us` 라 동적 구간 `[theme]` 보다 먼저 잡힌다 — 국장 슬러그에 "us" 는 없다(lib/theme-href.ts).
 */

/** ⛔ 국장 테마 리포트와 같은 스위치로 연다(app/screen-flags.ts THEME_PUBLIC). */
const PUBLIC = THEME_PUBLIC;
const DEPLOYED = Boolean(process.env.VERCEL_ENV);

export async function generateMetadata(): Promise<Metadata> {
  const meta = await pageMetadata({
    title: `${US_THEME_PAGE.label} | hatzze`,
    description: US_THEME_PAGE.description,
    path: US_THEME_PAGE.href,
    ownImage: KADERA_CARD.alt,
    imagePath: "/kadera",
  });
  return PUBLIC ? meta : { ...meta, robots: { index: false, follow: false } };
}

export default async function UsThemeIndexPage() {
  if (!PUBLIC && DEPLOYED) notFound();
  const [themes, risersAll, updatedAt] = await Promise.all([listUsThemeOverview(), listUsThemeRisers(), lastThemeBriefAt("telegram_us_theme_brief")]);
  const risers = risersAll === null ? null : risersAll.filter((r) => r.reason);
  return <ThemeIndexView market={US_MARKET} themes={themes} risers={risers} updatedAt={updatedAt} />;
}
