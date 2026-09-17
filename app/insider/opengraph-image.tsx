import { ImageResponse } from "next/og";

import { CARD_BG, OG_CONTENT_TYPE, OG_SIZE, TRACK, TitleCard, dataUri, loadOgFonts } from "../og-card";
import { INSIDER_CARD } from "../og-copy";

/**
 * /insider 를 공유할 때 뜨는 미리보기(1200×630). 종목·인물 상세와 전체보기도 이 카드를
 * 쓴다(app/seo.ts 의 imagePath). 만드는 법과 왜 컨벤션을 그대로 쓰는지는 kadera 카드 주석에.
 */
export const alt = INSIDER_CARD.alt;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

/** 산 것·판 것의 빨강·파랑. 화면과 같은 값이다(--c-hot · --c-blue). */
const BUY = "#d03a46";
const SELL = "#3182f6";

/**
 * 공시 장부. **화면의 목록 줄(아바타 · 이름 자리 · 산 것/판 것 알약)을 그대로 옮긴 그림**이다.
 * 줄마다 왼쪽 동그라미가 사람, 가운데 긴 막대가 이름·회사 자리, 오른쪽 짧은 알약이 이번
 * 분기에 산 것(빨강)·판 것(파랑)이다. 글자는 안 넣는다(Satori 가 SVG 안 글자에 폰트를 못
 * 넘겨준다). 값도 생김새만 옮긴 것이라 특정 분기가 아니다.
 */
const ROWS: { name: number; move: number }[] = [
  // name = 이름 막대 길이(0~1) · move = 알약 길이(양수 산 것 · 음수 판 것)
  { name: 0.72, move: 0.55 },
  { name: 0.58, move: -0.35 },
  { name: 0.8, move: 0.9 },
  { name: 0.5, move: 0.3 },
  { name: 0.66, move: -0.7 },
];

function ledgerSvg(): string {
  const W = 344;
  const ROW = 38;
  const GAP = 12;
  const H = ROWS.length * ROW + (ROWS.length - 1) * GAP;
  const AVATAR = 30;
  const NAME_X = AVATAR + 14;
  const NAME_MAX = 150;
  const MOVE_X = NAME_X + NAME_MAX + 18;
  const MOVE_MAX = W - MOVE_X;
  const rows = ROWS.map(({ name, move }, i) => {
    const y = i * (ROW + GAP);
    const cy = y + ROW / 2;
    const w = Math.round(MOVE_MAX * Math.abs(move));
    return (
      `<circle cx="${AVATAR / 2}" cy="${cy}" r="${AVATAR / 2}" fill="${TRACK}"/>` +
      `<rect x="${NAME_X}" y="${cy - 8}" width="${Math.round(NAME_MAX * name)}" height="16" rx="8" fill="${TRACK}"/>` +
      `<rect x="${MOVE_X}" y="${cy - 11}" width="${w}" height="22" rx="11" fill="${move > 0 ? BUY : SELL}" opacity="0.85"/>`
    );
  });
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">` +
    `<rect width="${W}" height="${H}" fill="${CARD_BG}"/>` +
    rows.join("") +
    "</svg>"
  );
}

export default async function Image() {
  const svg = ledgerSvg();
  return new ImageResponse(
    (
      <TitleCard
        title={INSIDER_CARD.title}
        lines={INSIDER_CARD.lines}
        foot={INSIDER_CARD.foot}
        art={<img src={dataUri(svg)} width={344} height={238} alt="" />}
      />
    ),
    { ...OG_SIZE, fonts: await loadOgFonts() },
  );
}
