import { usThemeFromParam, usThemeHref, usThemeSlug, US_THEME_NAMES } from "@/lib/theme-href";

import { OG_CONTENT_TYPE, OG_SIZE } from "../../../og-card";
import { US_THEME_CARD, themeCard } from "../../../og-copy";
import { themeCardImage } from "../../og-image";

/** 미장 테마 한 장(/theme/us/memory)의 공유 미리보기. 국장 짝(app/theme/[theme]/opengraph-image.tsx)과 같다. */
export const alt = US_THEME_CARD.alt;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export async function generateStaticParams() {
  return US_THEME_NAMES.map((t) => ({ theme: usThemeSlug(t) }));
}

export default async function Image({ params }: { params: Promise<{ theme: string }> }) {
  const theme = usThemeFromParam((await params).theme);
  return themeCardImage(theme ? themeCard(theme, "us", usThemeHref(theme)) : US_THEME_CARD);
}
