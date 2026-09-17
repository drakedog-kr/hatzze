import { ImageResponse } from "next/og";

import { BLUE, CARD_BG, COLD, OG_CONTENT_TYPE, OG_SIZE, TRACK, TitleCard, dataUri, loadOgFonts } from "../og-card";
import { DIVIDEND_CARD } from "../og-copy";

/**
 * /dividend 를 공유할 때 뜨는 미리보기(1200×630). 만드는 법은 kadera 카드 주석에.
 */
export const alt = DIVIDEND_CARD.alt;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

/**
 * 월 배당 달력. **화면의 '달마다 얼마' 막대를 그대로 옮긴 그림**이다 — 열두 달, 들어오는
 * 달은 진한 파랑, 적은 달은 옅은 파랑, 없는 달은 빈 트랙. 값은 생김새만 옮긴 것이라
 * 특정 바스켓이 아니고, 글자(달 이름·금액)는 안 넣는다(Satori 가 SVG 안 글자에 폰트를 못
 * 넘겨준다).
 */
const MONTHS = [0.35, 0.2, 0.9, 0.3, 0.25, 0.85, 0.3, 0.2, 0.95, 0.35, 0.3, 1.0];

function monthsSvg(): string {
  const W = 344;
  const H = 230;
  const BASE = H - 10; // 바닥선
  const TOP = 14; // 가장 큰 막대의 머리
  const GAP = 8;
  const BAR = (W - GAP * (MONTHS.length - 1)) / MONTHS.length;
  const bars = MONTHS.map((v, i) => {
    const h = Math.round((BASE - TOP) * v);
    const x = Math.round(i * (BAR + GAP));
    const fill = v >= 0.8 ? COLD : v >= 0.3 ? BLUE : TRACK;
    const opacity = v >= 0.8 ? 1 : v >= 0.3 ? 0.55 : 1;
    return `<rect x="${x}" y="${BASE - h}" width="${Math.round(BAR)}" height="${h}" rx="6" fill="${fill}" opacity="${opacity}"/>`;
  });
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">` +
    `<rect width="${W}" height="${H}" fill="${CARD_BG}"/>` +
    bars.join("") +
    `<line x1="0" y1="${BASE}" x2="${W}" y2="${BASE}" stroke="${TRACK}" stroke-width="3"/>` +
    "</svg>"
  );
}

export default async function Image() {
  const svg = monthsSvg();
  return new ImageResponse(
    (
      <TitleCard
        title={DIVIDEND_CARD.title}
        lines={DIVIDEND_CARD.lines}
        foot={DIVIDEND_CARD.foot}
        art={<img src={dataUri(svg)} width={344} height={230} alt="" />}
      />
    ),
    { ...OG_SIZE, fonts: await loadOgFonts() },
  );
}
