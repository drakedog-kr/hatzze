import { ImageResponse } from "next/og";

import { BLUE, CARD_BG, OG_CONTENT_TYPE, OG_SIZE, TRACK, TitleCard, dataUri, loadOgFonts } from "../og-card";
import { NOTE_CARD } from "../og-copy";

/**
 * /daily 와 날짜별 글을 공유할 때 뜨는 미리보기(1200×630). 만드는 법은 kadera 카드 주석에.
 */
export const alt = NOTE_CARD.alt;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

/**
 * 한 편의 글. 종이 한 장에 제목 자리(파랑 짧은 막대)와 본문 줄(옅은 막대)을 놓는다.
 * 글자는 안 넣는다(Satori 가 SVG 안 글자에 폰트를 못 넘겨준다).
 */
const LINES = [0.92, 0.84, 0.6, 0, 0.88, 0.78, 0.5];

function noteSvg(): string {
  const W = 344;
  const H = 236;
  const PAD = 26;
  const inner = W - PAD * 2;
  const TITLE_Y = PAD + 4;
  const rows = LINES.map((v, i) => {
    if (v === 0) return "";
    const y = TITLE_Y + 34 + i * 22;
    return `<rect x="${PAD}" y="${y}" width="${Math.round(inner * v)}" height="11" rx="5.5" fill="${TRACK}"/>`;
  });
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">` +
    `<rect x="1.5" y="1.5" width="${W - 3}" height="${H - 3}" rx="18" fill="${CARD_BG}" stroke="${TRACK}" stroke-width="3"/>` +
    `<rect x="${PAD}" y="${TITLE_Y}" width="${Math.round(inner * 0.46)}" height="16" rx="8" fill="${BLUE}"/>` +
    rows.join("") +
    "</svg>"
  );
}

export default async function Image() {
  const svg = noteSvg();
  return new ImageResponse(
    (
      <TitleCard
        title={NOTE_CARD.title}
        lines={NOTE_CARD.lines}
        foot={NOTE_CARD.foot}
        art={<img src={dataUri(svg)} width={344} height={236} alt="" />}
      />
    ),
    { ...OG_SIZE, fonts: await loadOgFonts() },
  );
}
