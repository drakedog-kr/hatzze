import { ImageResponse } from "next/og";

import { CARD_BG, COLD, OG_CONTENT_TYPE, OG_SIZE, TRACK, TitleCard, dataUri, loadOgFonts } from "../og-card";
import { MDD_CARD } from "../og-copy";

/**
 * /mdd 를 공유할 때 뜨는 미리보기(1200×630).
 * 매일 바뀌는 숫자가 없어 파일 컨벤션 그대로 쓴다 — 자세한 건 app/kadera/opengraph-image.tsx 주석 참고.
 */
export const alt = MDD_CARD.alt;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

/**
 * 고점 대비 낙폭 곡선. **화면의 차트(app/mdd/MddExplorer.tsx)를 그대로 옮긴 그림이다** —
 * 0% 실선, 점선 격자, 얇은 선과 그 아래 옅은 면, 기간 최저점의 속 빈 점까지 같은 문법이다.
 * (홈 카드가 히어로 게이지를 옮긴 것과 같은 원칙. 카드마다 그 페이지의 진짜 그림을 쓴다.)
 *
 * 값은 낙폭 곡선의 생김새만 옮긴 것이고 특정 종목의 시계열이 아니다. 그래서 축 라벨도
 * 넣지 않는다 — 카드에 숫자를 적으면 매일 틀린 값이 박제된다.
 */
const DRAWDOWN_SERIES = [
  0, -1.5, -4, -2, -0.5, 0, -2, -5, -9, -7, -4, -1, 0, -1, -3, -7, -13, -19, -16, -22, -29, -35, -38,
  -34, -29, -25, -27, -23, -18, -14, -11, -13, -9, -6, -4, -5, -2, -0.5, 0, -2, -5, -3, -7, -10, -8, -6, -4, -5,
];

function drawdownSvg(): string {
  const W = 320;
  const H = 170; // 0% ~ 바닥(-40%)까지의 높이
  const TOP = 6; // 0% 선이 놓일 y. 선 굵기가 뷰박스 위로 잘리지 않게 조금 내려 둔다
  // 최저점(-38)보다 조금 아래에 바닥을 둔다. 화면 차트는 바닥선이 곧 최저점이지만,
  // 라벨 없는 카드에서는 최저점 표시가 점선 위에 겹쳐 앉아 어정쩡해 보인다.
  const FLOOR = -44;
  const n = DRAWDOWN_SERIES.length;
  const x = (i: number) => (i / (n - 1)) * W;
  const y = (dd: number) => TOP + (dd / FLOOR) * H;

  const line = DRAWDOWN_SERIES.map((dd, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(dd).toFixed(1)}`).join(" ");
  // 면은 곡선을 0% 선까지 닫아서 만든다(화면 차트와 같은 방식).
  const area = `${line} L${W},${TOP} Z`;
  let trough = 0;
  for (let i = 1; i < n; i++) if (DRAWDOWN_SERIES[i] < DRAWDOWN_SERIES[trough]) trough = i;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} 190">` +
    `<line x1="0" y1="${TOP}" x2="${W}" y2="${TOP}" stroke="${TRACK}" stroke-width="2.5"/>` +
    [FLOOR / 2, FLOOR]
      .map(
        (dd) =>
          `<line x1="0" y1="${y(dd)}" x2="${W}" y2="${y(dd)}" stroke="${TRACK}" stroke-width="2.5" stroke-dasharray="5 12"/>`,
      )
      .join("") +
    `<path d="${area}" fill="${COLD}" fill-opacity="0.14"/>` +
    `<path d="${line}" fill="none" stroke="${COLD}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>` +
    `<circle cx="${x(trough).toFixed(1)}" cy="${y(DRAWDOWN_SERIES[trough]).toFixed(1)}" r="7.5" fill="${CARD_BG}" stroke="${COLD}" stroke-width="4"/>` +
    "</svg>"
  );
}

export default async function Image() {
  return new ImageResponse(
    (
      <TitleCard
        title={MDD_CARD.title}
        lines={MDD_CARD.lines}
        foot={MDD_CARD.foot}
        art={{ src: dataUri(drawdownSvg()), width: 384, height: 228 }}
      />
    ),
    { ...OG_SIZE, fonts: await loadOgFonts() },
  );
}
