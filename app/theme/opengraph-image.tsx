import { OG_CONTENT_TYPE, OG_SIZE } from "../og-card";
import { THEME_CARD } from "../og-copy";
import { themeCardImage } from "./og-image";

/** /theme 를 공유할 때 뜨는 미리보기. 몸통은 ./og-image.tsx, 글은 og-copy.ts 의 THEME_CARD. */
export const alt = THEME_CARD.alt;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image() {
  return themeCardImage(THEME_CARD);
}
