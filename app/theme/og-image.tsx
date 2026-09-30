import { ImageResponse } from "next/og";

import { BLUE_2, CARD_BG, CHIP, OG_SIZE, TitleCard, WARM_2, dataUri, loadOgFonts } from "../og-card";
import type { OgCopy } from "../og-copy";

/**
 * 테마 화면 공유 카드(1200×630)를 그리는 공용 몸통. 목록 둘(/theme · /theme/us)과 테마 42장이 같이 쓴다.
 * 파일 컨벤션(각 폴더의 opengraph-image.tsx)은 이 함수를 부르기만 한다. 만드는 법은 kadera 카드 주석에.
 */

/**
 * 테마 지도. **목록 화면의 Treemap 생김새를 그대로 옮긴 그림**이다 — 칸 크기가 관심, 색이 변화다.
 * 값은 생김새만 옮긴 것이라 특정 날의 판이 아니다. 글자는 안 넣는다(Satori 가 SVG 안 글자에 폰트를 못 넘긴다).
 *
 * 색은 화면과 **같은 말**을 한다 — 늘어난 칸은 따뜻한 색(--c-warm-2), 줄어든 칸은 파랑(--c-blue-2), 그대로인 칸은
 * 칩 회색이고 농도 세 단계(24·45·58%)도 kadera.css 의 `.hz-tm-tile.is-up-N` 그대로다(흰 카드 위 불투명도 = color-mix).
 * 예전엔 파랑 계열만 칠해 실제 지도의 따뜻한 칸이 카드에 없었다(2026-09-30 점검).
 */
const TILES: { x: number; y: number; w: number; h: number; fill: string; opacity: number }[] = [
  { x: 0, y: 0, w: 150, h: 230, fill: WARM_2, opacity: 0.58 },
  { x: 156, y: 0, w: 188, h: 120, fill: BLUE_2, opacity: 0.45 },
  { x: 156, y: 126, w: 100, h: 104, fill: WARM_2, opacity: 0.45 },
  { x: 262, y: 126, w: 82, h: 50, fill: BLUE_2, opacity: 0.24 },
  { x: 262, y: 182, w: 82, h: 48, fill: CHIP, opacity: 1 },
];

function tilesSvg(): string {
  const W = 344;
  const H = 230;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">` +
    `<rect width="${W}" height="${H}" fill="${CARD_BG}"/>` +
    TILES.map((t) => `<rect x="${t.x}" y="${t.y}" width="${t.w}" height="${t.h}" rx="8" fill="${t.fill}" opacity="${t.opacity}"/>`).join("") +
    "</svg>"
  );
}

export async function themeCardImage(copy: OgCopy): Promise<ImageResponse> {
  return new ImageResponse(
    (
      <TitleCard
        title={copy.title}
        lines={copy.lines}
        foot={copy.foot}
        // eslint-disable-next-line @next/next/no-img-element -- Satori 안의 그림이다(next/image 가 끼어들 자리가 아니다)
        art={<img src={dataUri(tilesSvg())} width={344} height={230} alt="" />}
      />
    ),
    { ...OG_SIZE, fonts: await loadOgFonts() },
  );
}
