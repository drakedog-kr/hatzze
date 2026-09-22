import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import { assertLoaded } from "@/lib/load-state";
import { withSubjectParticle } from "@/lib/format";
import { getThemePage, themeFromParam, themeHref, themeSlug } from "@/lib/theme-page";

import { KADERA_CARD } from "../../og-copy";
import { pageMetadata } from "../../seo";
import { THEME_PUBLIC } from "../../screen-flags";
import { KR_MARKET } from "../market";
import { ThemeDetailView } from "../ThemeDetailView";

/**
 * 국장 테마 하나의 실주소(`/theme/semiconductor`). 본문은 ThemeDetailView(국장·미장 공용)가 그리고, 이 파일은
 * 주소 되돌리기·자료 읽기·메타데이터만 맡는다. 미장 짝은 app/theme/us/[theme]/page.tsx.
 */

/**
 * ⛔ **아직 안 연 화면이다.** 스위치는 `app/screen-flags.ts` 한 곳에 있다.
 */
const PUBLIC = THEME_PUBLIC;
/** 배포된 곳인가. 로컬에서는 PUBLIC 이 false 여도 그대로 보인다(만드는 중에 봐야 하니까). */
const DEPLOYED = Boolean(process.env.VERCEL_ENV);

// 동적 구간은 빈 generateStaticParams 가 있어야 런타임 ISR 이 된다(app/stock/[code]/page.tsx 주석).
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ theme: string }> }): Promise<Metadata> {
  const { theme: raw } = await params;
  const theme = themeFromParam(raw);
  if (!theme) return { title: "테마를 찾을 수 없습니다 | hatzze", robots: { index: false, follow: false } };
  const d = await getThemePage(theme);
  const hot = d?.hotStocks.slice(0, 3).map((s) => s.name) ?? [];
  const meta = await pageMetadata({
    title: `${theme} 테마 텔레그램 언급 | hatzze`,
    description: `${withSubjectParticle(theme)} 주식 텔레그램에서 요즘 어떻게 회자되는지 봅니다.${
      hot.length ? ` 최근 3일 말 많은 종목은 ${hot.join("·")}입니다.` : ""
    } 말 많은 종목과 그 이유, 앞으로의 일정을 테마 단위로 읽습니다.`,
    path: themeHref(theme),
    ownImage: KADERA_CARD.alt,
    imagePath: "/kadera",
  });
  return PUBLIC ? meta : { ...meta, robots: { index: false, follow: false } };
}

export default async function ThemePage({ params }: { params: Promise<{ theme: string }> }) {
  if (!PUBLIC && DEPLOYED) notFound();
  const { theme: raw } = await params;
  const theme = themeFromParam(raw);
  // 사전에 없는 이름은 조회 없이 404 다. 조회 실패와 섞이지 않는다.
  if (!theme) notFound();
  // 옛 꼴(한글 이름)로 들어오면 슬러그 주소로 영구 이동 — 주소는 하나여야 한다(lib/theme-href.ts).
  if (raw !== themeSlug(theme)) permanentRedirect(themeHref(theme));
  const d = await getThemePage(theme);
  // ⚠️ notFound() 앞에서 던진다 — 조회가 5xx 로 죽은 것을 404 로 굳히지 않는다(종목 화면과 같다).
  assertLoaded("/theme/[theme]");
  if (!d) notFound();
  return <ThemeDetailView market={KR_MARKET} d={d} />;
}
