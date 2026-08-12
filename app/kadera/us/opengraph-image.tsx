import { ImageResponse } from "next/og";

import { ChatterArt, OG_CONTENT_TYPE, OG_SIZE, TitleCard, loadOgFonts } from "../../og-card";
import { US_KADERA_CARD } from "../../og-copy";

/**
 * /kadera/us 를 공유할 때 뜨는 미리보기(1200×630).
 *
 * 옆의 국장 카드(../opengraph-image.tsx)와 판형도 그림도 같다 — 한 구역의 두 페이지라
 * 서로 남처럼 보이면 안 된다. 구분은 크게 박히는 제목("미장 카더라")이 한다.
 * 왜 파일 컨벤션을 쓰면서도 seo.ts 가 경로를 직접 가리키는지는 국장 카드 주석에.
 */
export const alt = US_KADERA_CARD.alt;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

/**
 * 대사만 국장과 다르다. 미장은 한국에서 자는 사이에 열리는 장이라, 아침에 지난밤을
 * 되짚는 말투로 연다 — 이 화면을 실제로 쓰는 장면이 그것이다.
 *
 * 종목 이름이나 등락 이야기는 넣지 않는다(뭘 사라/팔라로 읽힌다). 규칙은 ChatterArt 주석에.
 */
const CHATTER = [
  { text: "밤사이 미장 어땠어?", mine: false },
  { text: "그 얘기 어디서 나왔대", mine: true },
  { text: "…라고 카더라", mine: false },
];

export default async function Image() {
  return new ImageResponse(
    <TitleCard
      title={US_KADERA_CARD.title}
      lines={US_KADERA_CARD.lines}
      foot={US_KADERA_CARD.foot}
      art={<ChatterArt chatter={CHATTER} />}
    />,
    { ...OG_SIZE, fonts: await loadOgFonts() },
  );
}
