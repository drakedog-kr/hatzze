import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * 공유 미리보기(OG) 카드가 공유하는 재료.
 *
 * 카드는 셋이다 — 홈은 오늘 도수를 그리는 동적 카드(app/opengraph-image/route.tsx),
 * /kadera·/mdd 는 각자의 정적 카드(각 폴더의 opengraph-image.tsx 파일 컨벤션).
 * 셋이 한 세트로 보이려면 배경·글자색·워드마크·폰트가 같아야 해서 여기에 모았다.
 *
 * Satori 는 CSS 변수를 못 읽어서 색을 직접 적는다. app/globals.css 의 라이트 테마
 * 값을 그대로 옮긴 것이니 그쪽을 바꾸면 여기도 바꿀 것.
 */
export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

export const INK = "#25262f";
export const SUB = "#5b6474";
export const CARD_BG = "#eef2ff";
export const TRACK = "#c2c6d8"; // --c-track
export const BLUE = "#0064ff"; // --c-blue
export const COLD = "#5ea8d8"; // --c-cold

const GHOST =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 104">' +
  '<path d="M12,84 C6,42 22,8 50,8 C78,8 94,42 88,84 C86,95 80,95 77,87 C74,80 67,80 64,88 C61,96 54,96 51,88 C48,80 41,80 38,88 C35,96 28,96 25,87 C22,80 15,93 12,84 Z" fill="#0064ff"/>' +
  '<ellipse cx="39" cy="50" rx="9.5" ry="12" fill="#fff"/><circle cx="66" cy="52" r="7" fill="#fff"/><circle cx="42" cy="45" r="3" fill="#0064ff"/></svg>';

/** Satori 에 SVG 를 넘기는 안전한 방법은 data URI 다(JSX 안의 <svg> 는 지원이 들쭉날쭉하다). */
export function dataUri(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

const FONT_DIR = "node_modules/pretendard/dist/public/static";
// 워드마크는 본문과 서체가 다르다. app/Logo.tsx 의 브랜드 규격이
// Bricolage Grotesque 700 · letter-spacing -0.035em 라, 화면과 공유 이미지가
// 같은 글자로 보이려면 이 파일도 같은 서체를 써야 한다. 화면 쪽은 Google Fonts
// CDN 으로 받지만 Satori 는 폰트 바이트를 직접 받아야 해서 여기서만 로컬 파일을 읽는다.
const WORDMARK_FONT =
  "node_modules/@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-700-normal.woff";

/**
 * ImageResponse 에 넘길 폰트 바이트.
 * Satori 는 woff2 를 못 읽어서(otf·woff 만 읽는다) 화면과 달리 정적 파일을 쓴다.
 */
export async function loadOgFonts() {
  const [extraBold, medium, bricolage] = await Promise.all([
    readFile(join(process.cwd(), FONT_DIR, "Pretendard-ExtraBold.otf")),
    readFile(join(process.cwd(), FONT_DIR, "Pretendard-Medium.otf")),
    readFile(join(process.cwd(), WORDMARK_FONT)),
  ]);
  return [
    { name: "Pretendard", data: extraBold, weight: 800 as const, style: "normal" as const },
    { name: "Pretendard", data: medium, weight: 500 as const, style: "normal" as const },
    { name: "Bricolage Grotesque", data: bricolage, weight: 700 as const, style: "normal" as const },
  ];
}

export function Wordmark({ size }: { size: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: size * 0.23 }}>
      {/* Satori 가 그리는 그림이라 next/image 를 쓸 수 없다(브라우저가 아니라 PNG 로 굳는다). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={dataUri(GHOST)} width={size * 1.03} height={size * 1.07} alt="" />
      <div
        style={{
          fontFamily: "Bricolage Grotesque",
          fontSize: size,
          fontWeight: 700,
          color: INK,
          // 브랜드 규격(-0.035em)을 이 크기에 환산한 값.
          letterSpacing: `${(size * -0.035).toFixed(2)}px`,
        }}
      >
        hatzze
      </div>
    </div>
  );
}

/** 카드 바깥 틀. 배경·여백·기본 서체를 한 곳에서 정해 세 카드가 같은 판형이 되게 한다. */
export function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "62px 84px 58px",
        background: CARD_BG,
        fontFamily: "Pretendard",
      }}
    >
      {children}
    </div>
  );
}

/**
 * /kadera·/mdd 처럼 매일 바뀌는 숫자가 없는 페이지의 카드.
 * 홈 카드와 같은 판형(위 워드마크 · 가운데 본문 · 아래 한 줄)이라 셋이 한 세트로 보인다.
 *
 * 본문 줄은 배열로 받는다. Satori 도 줄바꿈은 하지만 어디서 끊길지는 폰트 계산에
 * 달려 있어서, 미리보기처럼 한 번 굳으면 못 고치는 그림은 끊을 자리를 직접 정하는 편이 낫다.
 */
export function TitleCard({
  title,
  lines,
  foot,
  art,
}: {
  title: string;
  lines: string[];
  foot: string;
  /**
   * 오른쪽에 놓을 그림. 노드로 받는다 — SVG 한 장일 때도 있고(MDD 낙폭 곡선),
   * 글자가 들어가야 해서 JSX 로 짜야 할 때도 있다(카더라 말풍선. SVG 안의 글자는
   * Satori 가 폰트를 못 넘겨줘서 빈칸으로 나온다).
   */
  art?: React.ReactNode;
}) {
  return (
    <CardShell>
      <Wordmark size={50} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 76, fontWeight: 800, color: INK, letterSpacing: "-0.03em", lineHeight: 1.2 }}>
            {title}
          </div>
          <div style={{ display: "flex", flexDirection: "column", marginTop: 22 }}>
            {lines.map((line) => (
              <div key={line} style={{ fontSize: 31, fontWeight: 500, color: SUB, lineHeight: 1.5 }}>
                {line}
              </div>
            ))}
          </div>
        </div>
        {art}
      </div>
      <div style={{ fontSize: 27, fontWeight: 500, color: SUB }}>{foot}</div>
    </CardShell>
  );
}
