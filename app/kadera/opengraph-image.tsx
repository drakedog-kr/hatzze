import { ImageResponse } from "next/og";

import { BLUE, INK, OG_CONTENT_TYPE, OG_SIZE, TitleCard, loadOgFonts } from "../og-card";
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
 * 오가는 말. 이 페이지의 재료가 채널에 도는 이야기라, 순위 막대 같은 집계 그림보다
 * "사람들이 떠드는" 장면이 이름(카더라)에 맞는다.
 *
 * SVG 가 아니라 JSX 로 짠다 — data URI 로 넘긴 SVG 안의 글자는 Satori 가 폰트를
 * 실어 주지 않아 빈칸으로 나온다. 여기서는 카드 본문과 같은 Pretendard 로 그려진다.
 *
 * 문구는 **떠도는 말투 자체**만 흉내 낸다. 뭘 사라/팔라로 읽힐 말은 넣지 않는다 —
 * 이 서비스는 그런 말을 옮기는 곳이 아니라 얼마나 도는지를 세는 곳이다.
 */
const CHATTER: { text: string; mine: boolean }[] = [
  { text: "그 얘기 들었어?", mine: false },
  { text: "어디서 나온 건데", mine: true },
  { text: "…라고 카더라", mine: false },
];

function Bubbles() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, width: 358 }}>
      {CHATTER.map((c) => (
        <div key={c.text} style={{ display: "flex", justifyContent: c.mine ? "flex-end" : "flex-start" }}>
          <div
            style={{
              padding: "15px 26px",
              fontSize: 27,
              fontWeight: 500,
              background: c.mine ? BLUE : "#ffffff",
              color: c.mine ? "#ffffff" : INK,
              // 말풍선의 꼬리 자리만 각지게 둔다. 삼각형 꼬리를 붙이는 것보다 단순하고
              // 메신저에서 흔히 보는 모양이라 한눈에 대화로 읽힌다.
              borderTopLeftRadius: 26,
              borderTopRightRadius: 26,
              borderBottomLeftRadius: c.mine ? 26 : 8,
              borderBottomRightRadius: c.mine ? 8 : 26,
            }}
          >
            {c.text}
          </div>
        </div>
      ))}
    </div>
  );
}

export default async function Image() {
  return new ImageResponse(
    <TitleCard title={KADERA_CARD.title} lines={KADERA_CARD.lines} foot={KADERA_CARD.foot} art={<Bubbles />} />,
    { ...OG_SIZE, fonts: await loadOgFonts() },
  );
}
