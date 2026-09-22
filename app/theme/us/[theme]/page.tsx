import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import { assertLoaded } from "@/lib/load-state";
import { withSubjectParticle } from "@/lib/format";
import { usThemeFromParam, usThemeHref, usThemeSlug } from "@/lib/theme-href";
import { getUsThemePage } from "@/lib/us-theme-page";

import { KADERA_CARD } from "../../../og-copy";
import { pageMetadata } from "../../../seo";
import { THEME_PUBLIC } from "../../../screen-flags";
import { US_MARKET } from "../../market";
import { ThemeDetailView } from "../../ThemeDetailView";

/**
 * 미장 테마 하나의 실주소(`/theme/us/ai-semiconductor`). 본문은 ThemeDetailView(국장·미장 공용)가 그리고, 이 파일은
 * 주소 되돌리기·자료 읽기·메타데이터만 맡는다. 국장 짝은 app/theme/[theme]/page.tsx.
 */

/** ⛔ 국장 테마 리포트와 같은 스위치로 연다(app/screen-flags.ts THEME_PUBLIC). */
const PUBLIC = THEME_PUBLIC;
const DEPLOYED = Boolean(process.env.VERCEL_ENV);

// 동적 구간은 빈 generateStaticParams 가 있어야 런타임 ISR 이 된다(app/stock/[code]/page.tsx 주석).
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ theme: string }> }): Promise<Metadata> {
  const { theme: raw } = await params;
  const theme = usThemeFromParam(raw);
  if (!theme) return { title: "테마를 찾을 수 없습니다 | hatzze", robots: { index: false, follow: false } };
  const d = await getUsThemePage(theme);
  const hot = d?.hotStocks.slice(0, 3).map((s) => s.name) ?? [];
  const meta = await pageMetadata({
    title: `미장 ${theme} 테마 텔레그램 언급 | hatzze`,
    description: `미장 ${withSubjectParticle(theme)} 주식 텔레그램에서 요즘 어떻게 회자되는지 봅니다.${
      hot.length ? ` 최근 3일 말 많은 종목은 ${hot.join("·")}입니다.` : ""
    } 말 많은 미국 종목과 그 이유, 앞으로의 일정을 테마 단위로 읽습니다.`,
    path: usThemeHref(theme),
    ownImage: KADERA_CARD.alt,
    imagePath: "/kadera",
  });
  return PUBLIC ? meta : { ...meta, robots: { index: false, follow: false } };
}

export default async function UsThemePage({ params }: { params: Promise<{ theme: string }> }) {
  if (!PUBLIC && DEPLOYED) notFound();
  const { theme: raw } = await params;
  const theme = usThemeFromParam(raw);
  if (!theme) notFound();
  if (raw !== usThemeSlug(theme)) permanentRedirect(usThemeHref(theme));
  const d = await getUsThemePage(theme);
  assertLoaded("/theme/us/[theme]");
  if (!d) notFound();
  return <ThemeDetailView market={US_MARKET} d={d} />;
}
