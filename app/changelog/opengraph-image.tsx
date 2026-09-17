import { ImageResponse } from "next/og";

import { BLUE, CARD_BG, OG_CONTENT_TYPE, OG_SIZE, TRACK, TitleCard, dataUri, loadOgFonts } from "../og-card";
import { CHANGELOG_CARD } from "../og-copy";

/**
 * /changelog 를 공유할 때 뜨는 미리보기(1200×630). 만드는 법은 kadera 카드 주석에.
 */
export const alt = CHANGELOG_CARD.alt;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

/**
 * 버전 줄. **화면의 기록 목록을 그대로 옮긴 그림**이다 — 왼쪽 세로선에 버전마다 점이
 * 찍히고, 점 옆에 버전 알약(파랑)과 바뀐 내용 줄(옅은 막대)이 선다. 글자는 안 넣는다.
 */
const ENTRIES = [
  { tag: 0.26, lines: [0.9, 0.62] },
  { tag: 0.22, lines: [0.74] },
  { tag: 0.26, lines: [0.86, 0.5] },
];

function timelineSvg(): string {
  const W = 344;
  const H = 236;
  const LINE_X = 14;
  const TEXT_X = 44;
  const inner = W - TEXT_X;
  let y = 8;
  const parts: string[] = [];
  for (const e of ENTRIES) {
    parts.push(`<circle cx="${LINE_X}" cy="${y + 11}" r="8" fill="${BLUE}"/>`);
    parts.push(`<rect x="${TEXT_X}" y="${y}" width="${Math.round(inner * e.tag)}" height="22" rx="11" fill="${BLUE}" opacity="0.18"/>`);
    let ly = y + 34;
    for (const v of e.lines) {
      parts.push(`<rect x="${TEXT_X}" y="${ly}" width="${Math.round(inner * v)}" height="11" rx="5.5" fill="${TRACK}"/>`);
      ly += 20;
    }
    y = ly + 16;
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">` +
    `<rect width="${W}" height="${H}" fill="${CARD_BG}"/>` +
    `<line x1="${LINE_X}" y1="0" x2="${LINE_X}" y2="${H}" stroke="${TRACK}" stroke-width="4"/>` +
    parts.join("") +
    "</svg>"
  );
}

export default async function Image() {
  const svg = timelineSvg();
  return new ImageResponse(
    (
      <TitleCard
        title={CHANGELOG_CARD.title}
        lines={CHANGELOG_CARD.lines}
        foot={CHANGELOG_CARD.foot}
        art={<img src={dataUri(svg)} width={344} height={236} alt="" />}
      />
    ),
    { ...OG_SIZE, fonts: await loadOgFonts() },
  );
}
