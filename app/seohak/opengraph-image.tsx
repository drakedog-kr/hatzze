import { ImageResponse } from "next/og";

import { CARD_BG, OG_CONTENT_TYPE, OG_SIZE, TRACK, TitleCard, dataUri, loadOgFonts } from "../og-card";
import { SEOHAK_CARD } from "../og-copy";

/**
 * /seohak 을 공유할 때 뜨는 미리보기(1200×630).
 * 매일 바뀌는 숫자가 없어 파일 컨벤션 그대로 쓴다 — 자세한 건 app/kadera/opengraph-image.tsx 주석 참고.
 *
 * ⚠️ 이 파일이 **없었다.** 세 화면(카더라 둘·MDD)에는 다 있는데 여기만 빠져서, 링크를
 * 공유하면 그림 없는 밋밋한 미리보기가 떴다. 사이트맵도 같이 빠져 있었다 — 둘 다
 * 화면 안에서는 안 보여서 빠뜨려도 티가 안 난다.
 */
export const alt = SEOHAK_CARD.alt;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

/** 달력 칸의 빨강·파랑. 화면과 같은 값이다(--c-hot · --c-blue). */
const BUY = "#d03a46";
const SELL = "#3182f6";

/**
 * 달력 히트맵. **화면의 히어로(app/seohak/CalendarHero.tsx)를 그대로 옮긴 그림이다** —
 * 빨강이 더 산 날, 파랑이 더 판 날, 진하기가 순매수 크기다. MDD 카드가 제 낙폭 곡선을
 * 쓰고 카더라가 제 말풍선을 쓰는 것과 같은 원칙으로, 카드마다 그 페이지의 진짜 그림을 쓴다.
 *
 * ⛔ 값은 달력의 **생김새**만 옮긴 것이고 특정 달의 시계열이 아니다. 그래서 날짜 숫자도
 * 안 넣는다 — 카드에 숫자를 적으면 매일 틀린 값이 박제되고, 애초에 Satori 는 SVG 안의
 * 글자에 폰트를 못 넘겨줘서 빈칸으로 나온다.
 * ⭐ 진하기 범위(16~78%)는 화면의 라이트 테마와 같다(globals.css 의 `--hz-cal-span`).
 */
const GRID: number[][] = [
  // 0 = 결제 없는 날(옅은 회색) · 양수 = 더 산 날 · 음수 = 더 판 날. 크기는 0~1.
  [0, 0.1, 0.55, 0.3, 0.7, -0.4, 0],
  [0, -0.6, 0.25, 0.8, 0.45, 0.15, 0],
  [0, 0.35, -0.75, 0.5, 0.2, 0.6, 0],
  [0, 0.9, 0.4, -0.2, 0.65, 0.3, 0],
  [0, 0.2, 0.5, 0.35, 0, 0, 0],
];

function calendarSvg(): string {
  const CELL = 44;
  const GAP = 6;
  const W = 7 * CELL + 6 * GAP;
  const H = GRID.length * CELL + (GRID.length - 1) * GAP;
  // color-mix 를 못 쓰므로(정적 SVG) 흰 바탕과 섞은 값을 직접 낸다.
  const mix = (hex: string, pct: number) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const f = (c: number) => Math.round(c * pct + 255 * (1 - pct));
    return `rgb(${f(r)},${f(g)},${f(b)})`;
  };
  const cells = GRID.flatMap((row, y) =>
    row.map((v, x) => {
      const fill = v === 0 ? TRACK : mix(v > 0 ? BUY : SELL, 0.16 + Math.abs(v) * 0.62);
      return (
        `<rect x="${x * (CELL + GAP)}" y="${y * (CELL + GAP)}" width="${CELL}" height="${CELL}" ` +
        `rx="7" fill="${fill}"/>`
      );
    }),
  );
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">` +
    `<rect width="${W}" height="${H}" fill="${CARD_BG}"/>` +
    cells.join("") +
    "</svg>"
  );
}

export default async function Image() {
  const svg = calendarSvg();
  return new ImageResponse(
    (
      <TitleCard
        title={SEOHAK_CARD.title}
        lines={SEOHAK_CARD.lines}
        foot={SEOHAK_CARD.foot}
        art={<img src={dataUri(svg)} width={344} height={244} alt="" />}
      />
    ),
    { ...OG_SIZE, fonts: await loadOgFonts() },
  );
}
