import { ImageResponse } from "next/og";

import { BLUE, CARD_BG, COLD, OG_CONTENT_TYPE, OG_SIZE, TRACK, TitleCard, dataUri, loadOgFonts } from "../og-card";
import { PREVIEW_CARD } from "../og-copy";

/**
 * /preview 를 공유할 때 뜨는 미리보기(1200×630). 만드는 법은 kadera 카드 주석에.
 */
export const alt = PREVIEW_CARD.alt;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

/**
 * 밤사이 미장 종목(왼쪽, 진한 파랑)과 오늘 아침 국장 종목(오른쪽, 파랑)을 잇는 선.
 * **화면의 짝 목록을 그대로 옮긴 그림**이다 — 미장 하나가 국장 둘과 엮이기도 한다.
 * 글자는 안 넣는다(Satori 가 SVG 안 글자에 폰트를 못 넘겨준다).
 */
const LEFT_Y = [42, 118, 194];
const RIGHT_Y = [30, 82, 134, 186];
const LINKS: [number, number][] = [
  [0, 0],
  [0, 1],
  [1, 2],
  [2, 3],
];

function pairsSvg(): string {
  const W = 344;
  const H = 230;
  const PILL_W = 96;
  const PILL_H = 32;
  const LX = 0;
  const RX = W - PILL_W;
  const lines = LINKS.map(
    ([l, r]) =>
      `<path d="M${LX + PILL_W},${LEFT_Y[l] + PILL_H / 2} C${W / 2},${LEFT_Y[l] + PILL_H / 2} ${W / 2},${RIGHT_Y[r] + PILL_H / 2} ${RX},${RIGHT_Y[r] + PILL_H / 2}" ` +
      `fill="none" stroke="${TRACK}" stroke-width="4"/>`,
  );
  const left = LEFT_Y.map((y) => `<rect x="${LX}" y="${y}" width="${PILL_W}" height="${PILL_H}" rx="16" fill="${COLD}"/>`);
  const right = RIGHT_Y.map((y) => `<rect x="${RX}" y="${y}" width="${PILL_W}" height="${PILL_H}" rx="16" fill="${BLUE}" opacity="0.7"/>`);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">` +
    `<rect width="${W}" height="${H}" fill="${CARD_BG}"/>` +
    lines.join("") +
    left.join("") +
    right.join("") +
    "</svg>"
  );
}

export default async function Image() {
  const svg = pairsSvg();
  return new ImageResponse(
    (
      <TitleCard
        title={PREVIEW_CARD.title}
        lines={PREVIEW_CARD.lines}
        foot={PREVIEW_CARD.foot}
        art={<img src={dataUri(svg)} width={344} height={230} alt="" />}
      />
    ),
    { ...OG_SIZE, fonts: await loadOgFonts() },
  );
}
