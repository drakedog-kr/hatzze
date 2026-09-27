import { OG_CONTENT_TYPE, OG_SIZE } from "../../og-card";
import { US_THEME_CARD } from "../../og-copy";
import { themeCardImage } from "../og-image";

/** /theme/us 를 공유할 때 뜨는 미리보기. 몸통은 ../og-image.tsx, 글은 og-copy.ts 의 US_THEME_CARD. */
export const alt = US_THEME_CARD.alt;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image() {
  return themeCardImage(US_THEME_CARD);
}
