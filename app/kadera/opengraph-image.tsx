import { ImageResponse } from "next/og";

import { ChatterArt, OG_CONTENT_TYPE, OG_SIZE, TitleCard, loadOgFonts } from "../og-card";
import { KADERA_CARD } from "../og-copy";

/**
 * /kadera 를 공유할 때 뜨는 미리보기(1200×630).
 *
 * 홈과 달리 파일 컨벤션(opengraph-image.tsx)을 그대로 쓴다. 카더라 카드에는 매일
 * 바뀌는 숫자가 없어 그림이 늘 같으니, 컨벤션이 붙여 주는 빌드 해시 URL 이 오히려
 * 정확하다(내용이 안 바뀌므로 카톡이 캐시해도 옛 그림이 뜰 일이 없다).
 * 홈만 URL 에 날짜를 실어야 해서 라우트 핸들러로 뺀 것이다 — app/seo.ts 주석 참고.
 *
 * 다만 이 파일이 있다고 page.tsx 가 저절로 이 카드를 쓰지는 않는다 — 페이지가
 * openGraph 를 선언하면(pageMetadata) 컨벤션은 아예 안 끼어든다. 그래서 seo.ts 가
 * 이 경로(/kadera/opengraph-image)를 직접 가리킨다. 글은 og-copy.ts 한 곳에 둔다.
 */
export const alt = KADERA_CARD.alt;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

/**
 * 오가는 말. 그림 자체는 미장 카드와 같은 것을 쓴다(og-card.tsx 의 ChatterArt) —
 * 왜 말풍선인지, 대사에 뭘 넣으면 안 되는지는 그쪽 주석에.
 *
 * 대사만 두 시장이 다르다. 국장은 낮에 실시간으로 도는 말이라 "들었어?"로 연다.
 */
const CHATTER = [
  { text: "그 얘기 들었어?", mine: false },
  { text: "어디서 나온 건데", mine: true },
  { text: "…라고 카더라", mine: false },
];

export default async function Image() {
  return new ImageResponse(
    <TitleCard
      title={KADERA_CARD.title}
      lines={KADERA_CARD.lines}
      foot={KADERA_CARD.foot}
      art={<ChatterArt chatter={CHATTER} />}
    />,
    { ...OG_SIZE, fonts: await loadOgFonts() },
  );
}
