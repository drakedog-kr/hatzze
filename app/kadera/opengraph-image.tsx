import { ImageResponse } from "next/og";

import { BLUE, OG_CONTENT_TYPE, OG_SIZE, TitleCard, dataUri, loadOgFonts } from "../og-card";
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
 * 말풍선 세 개. 채널 메시지를 모아 읽는다는 뜻만 담은 장식이고 실제 데이터가 아니다
 * (카드에 숫자를 적으면 매일 틀린 값이 박제된다 — 그건 홈 카드가 할 일이다).
 */
const BUBBLES =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 220">' +
  `<rect x="8" y="10" width="196" height="56" rx="20" fill="${BLUE}" opacity="0.14"/>` +
  `<rect x="96" y="82" width="196" height="56" rx="20" fill="${BLUE}" opacity="0.28"/>` +
  `<rect x="30" y="154" width="196" height="56" rx="20" fill="${BLUE}"/>` +
  "</svg>";

export default async function Image() {
  return new ImageResponse(
    (
      <TitleCard
        title={KADERA_CARD.title}
        lines={KADERA_CARD.lines}
        foot={KADERA_CARD.foot}
        art={{ src: dataUri(BUBBLES), width: 300, height: 220 }}
      />
    ),
    { ...OG_SIZE, fonts: await loadOgFonts() },
  );
}
