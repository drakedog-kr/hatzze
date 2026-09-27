import { themeFromParam, themeHref, themeSlug, THEME_NAMES } from "@/lib/theme-href";

import { OG_CONTENT_TYPE, OG_SIZE } from "../../og-card";
import { THEME_CARD, themeCard } from "../../og-copy";
import { themeCardImage } from "../og-image";

/**
 * 국장 테마 한 장(/theme/semiconductor)의 공유 미리보기. 제목이 테마 이름이다.
 * 사전이 정적이라 26장을 빌드 때 다 그린다(generateStaticParams). 사전에 없는 주소는 목록 카드를 준다.
 */
export const alt = THEME_CARD.alt;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export async function generateStaticParams() {
  return THEME_NAMES.map((t) => ({ theme: themeSlug(t) }));
}

export default async function Image({ params }: { params: Promise<{ theme: string }> }) {
  const theme = themeFromParam((await params).theme);
  return themeCardImage(theme ? themeCard(theme, "kr", themeHref(theme)) : THEME_CARD);
}
