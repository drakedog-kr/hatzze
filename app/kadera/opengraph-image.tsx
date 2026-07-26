import { ImageResponse } from "next/og";

import { BLUE, OG_CONTENT_TYPE, OG_SIZE, TRACK, TitleCard, dataUri, loadOgFonts } from "../og-card";
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
 * 언급 순위 막대. 이 페이지가 하는 일("오늘 가장 많이 언급된 종목")이 곧 줄 세우기라,
 * 화면의 순위 행에 붙는 가는 띠(app/kadera/page.tsx 의 영향력 점수 막대)와 같은 문법으로
 * 그린다 — 파란색, 양 끝 둥근 알약, 위에서 아래로 옅어지는 순위.
 * (홈 카드가 히어로 게이지를, MDD 카드가 낙폭 곡선을 옮긴 것과 같은 원칙이다.)
 *
 * 길이는 순위의 모양만 나타낸 것이고 실제 언급 수가 아니다. 그래서 숫자도 넣지 않는다.
 */
const RANK_BARS = (() => {
  const rows = [
    { w: 288, o: 1 },
    { w: 236, o: 0.76 },
    { w: 186, o: 0.56 },
    { w: 146, o: 0.4 },
    { w: 108, o: 0.28 },
  ];
  const h = 26;
  const gap = 15;
  const axis = 10; // 축과 막대 사이 간격
  const height = rows.length * (h + gap) - gap;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${axis + 300} ${height}">` +
    // 세로 축. 이게 없으면 둥근 막대가 스켈레톤 로딩 화면처럼 보인다 —
    // 선 하나로 "줄 세운 그래프"라는 게 분명해진다.
    `<line x1="1.5" y1="0" x2="1.5" y2="${height}" stroke="${TRACK}" stroke-width="3"/>` +
    rows
      .map(
        (r, i) =>
          `<rect x="${axis}" y="${i * (h + gap)}" width="${r.w}" height="${h}" rx="${h / 2}" fill="${BLUE}" opacity="${r.o}"/>`,
      )
      .join("") +
    "</svg>"
  );
})();

export default async function Image() {
  return new ImageResponse(
    (
      <TitleCard
        title={KADERA_CARD.title}
        lines={KADERA_CARD.lines}
        foot={KADERA_CARD.foot}
        art={{ src: dataUri(RANK_BARS), width: 330, height: 202 }}
      />
    ),
    { ...OG_SIZE, fonts: await loadOgFonts() },
  );
}
