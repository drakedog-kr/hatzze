import { ImageResponse } from "next/og";

import { BLUE_2, CARD_BG, OG_CONTENT_TYPE, OG_SIZE, TRACK, TitleCard, WARM_2, dataUri, loadOgFonts } from "../og-card";
import { ETF_CARD } from "../og-copy";

/**
 * /etf(와 상세 /etf/[code])를 공유할 때 뜨는 미리보기(1200×630). 만드는 법은 kadera 카드 주석에.
 */
export const alt = ETF_CARD.alt;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

/**
 * 날별 순유입. **히어로 'ETF 순유입'의 날별 값을 막대로 옮긴 그림**이다 — 0 선 위는 유입(따뜻한 색), 아래는 유출(파랑).
 * 값은 생김새만 옮긴 것이라 특정 날짜가 아니고, 글자(날짜 · 금액)는 안 넣는다(Satori 가 SVG 안 글자에 폰트를 못 넘겨준다).
 */
const DAYS = [0.25, 0.55, -0.6, 0.45, 0.1, -0.5, 0.8, 0.7, 0.6, 0.05, 0.55, -0.2, 0.3, 0.75, -0.25, 0.5, 0.35, 0.9, 1.0, 0.3];

function flowSvg(): string {
  const W = 344;
  const H = 230;
  const ZERO = 150; // 0 선 — 유입이 더 크게 서도록 아래쪽에 둔다
  const UP = ZERO - 12; // 가장 큰 유입 막대의 키
  const GAP = 6;
  const BAR = (W - GAP * (DAYS.length - 1)) / DAYS.length;
  const bars = DAYS.map((v, i) => {
    const h = Math.max(4, Math.round(Math.abs(v) * UP));
    const x = Math.round(i * (BAR + GAP));
    const y = v >= 0 ? ZERO - h : ZERO;
    return `<rect x="${x}" y="${y}" width="${Math.round(BAR)}" height="${h}" rx="4" fill="${v >= 0 ? WARM_2 : BLUE_2}"/>`;
  });
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">` +
    `<rect width="${W}" height="${H}" fill="${CARD_BG}"/>` +
    bars.join("") +
    `<line x1="0" y1="${ZERO}" x2="${W}" y2="${ZERO}" stroke="${TRACK}" stroke-width="3"/>` +
    "</svg>"
  );
}

export default async function Image() {
  return new ImageResponse(
    (
      <TitleCard
        title={ETF_CARD.title}
        lines={ETF_CARD.lines}
        foot={ETF_CARD.foot}
        art={<img src={dataUri(flowSvg())} width={344} height={230} alt="" />}
      />
    ),
    { ...OG_SIZE, fonts: await loadOgFonts() },
  );
}
