import { ImageResponse } from "next/og";

import { OG_CONTENT_TYPE, OG_SIZE, TRACK, TitleCard, dataUri, loadOgFonts } from "../og-card";
import { MDD_CARD } from "../og-copy";

/**
 * /mdd 를 공유할 때 뜨는 미리보기(1200×630).
 * 매일 바뀌는 숫자가 없어 파일 컨벤션 그대로 쓴다 — 자세한 건 app/kadera/opengraph-image.tsx 주석 참고.
 */
export const alt = MDD_CARD.alt;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

/**
 * 고점에서 빠졌다가 절반쯤 회복한 곡선. 장식이고 실제 시계열이 아니다
 * (app/page.tsx 의 스파크라인과 달리 여기엔 얹을 데이터가 없다).
 * 낙폭 구간만 mania 색으로 칠해 무엇을 보는 화면인지 한눈에 들어오게 한다.
 */
const DRAWDOWN =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200">' +
  // 고점까지의 상승분은 옅게 — 이 화면의 주제가 아니다.
  `<path d="M6 150 L58 96 L96 60" fill="none" stroke="${TRACK}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>` +
  // 고점 → 저점 → 부분 회복.
  '<path d="M96 60 L150 128 L192 168 L246 118 L314 84" fill="none" stroke="#ff6b81" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>' +
  // 고점 자리를 점선으로 그어 "여기서 얼마나 내려왔나"를 눈에 보이게 한다.
  `<path d="M96 60 L314 60" stroke="${TRACK}" stroke-width="4" stroke-dasharray="10 10" stroke-linecap="round"/>` +
  '<circle cx="96" cy="60" r="10" fill="#ff6b81"/>' +
  '<circle cx="192" cy="168" r="10" fill="#ff6b81"/>' +
  "</svg>";

export default async function Image() {
  return new ImageResponse(
    (
      <TitleCard
        title={MDD_CARD.title}
        lines={MDD_CARD.lines}
        foot={MDD_CARD.foot}
        art={{ src: dataUri(DRAWDOWN), width: 320, height: 200 }}
      />
    ),
    { ...OG_SIZE, fonts: await loadOgFonts() },
  );
}
