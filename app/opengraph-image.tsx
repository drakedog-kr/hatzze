import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// 카톡·X·슬랙 등에서 hatzze.fun 링크를 공유할 때 뜨는 미리보기 이미지(1200×630).
// 폰트는 로컬 파일을 바이트로 넘긴다. Satori 는 woff2 만 못 읽고 otf·woff 는 읽으므로
// 한글 본문은 Pretendard OTF, 워드마크는 Bricolage Grotesque woff 를 쓴다.
export const runtime = "nodejs";
export const alt = "hatzze | 데이터와 감성으로 읽는 시장";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const GHOST =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 104">' +
  '<path d="M12,84 C6,42 22,8 50,8 C78,8 94,42 88,84 C86,95 80,95 77,87 C74,80 67,80 64,88 C61,96 54,96 51,88 C48,80 41,80 38,88 C35,96 28,96 25,87 C22,80 15,93 12,84 Z" fill="#0064ff"/>' +
  '<ellipse cx="39" cy="50" rx="9.5" ry="12" fill="#fff"/><circle cx="66" cy="52" r="7" fill="#fff"/><circle cx="42" cy="45" r="3" fill="#0064ff"/></svg>';

const FONT_DIR = "node_modules/pretendard/dist/public/static";
// 워드마크는 본문과 서체가 다르다. app/Logo.tsx 의 브랜드 규격이
// Bricolage Grotesque 700 · letter-spacing -0.035em 라, 화면과 공유 이미지가
// 같은 글자로 보이려면 이 파일도 같은 서체를 써야 한다. 화면 쪽은 Google Fonts
// CDN 으로 받지만 Satori 는 폰트 바이트를 직접 받아야 해서 여기서만 로컬 파일을 읽는다.
const WORDMARK_FONT =
  "node_modules/@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-700-normal.woff";

/** 워드마크 크기와 자간. 자간은 브랜드 규격(-0.035em)을 이 크기에 환산한 값이다. */
const WORDMARK_SIZE = 128;
const WORDMARK_TRACKING = `${(WORDMARK_SIZE * -0.035).toFixed(2)}px`;

export default async function Image() {
  const [extraBold, medium, bricolage] = await Promise.all([
    readFile(join(process.cwd(), FONT_DIR, "Pretendard-ExtraBold.otf")),
    readFile(join(process.cwd(), FONT_DIR, "Pretendard-Medium.otf")),
    readFile(join(process.cwd(), WORDMARK_FONT)),
  ]);
  const ghost = `data:image/svg+xml;base64,${Buffer.from(GHOST).toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 100px",
          background: "#eef2ff",
          fontFamily: "Pretendard",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 30 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ghost} width={132} height={137} alt="" />
          <div
            style={{
              fontFamily: "Bricolage Grotesque",
              fontSize: WORDMARK_SIZE,
              fontWeight: 700,
              color: "#25262f",
              letterSpacing: WORDMARK_TRACKING,
            }}
          >
            hatzze
          </div>
        </div>
        <div style={{ marginTop: 40, fontSize: 48, fontWeight: 800, color: "#25262f" }}>데이터와 감성으로 읽는 시장</div>
        <div style={{ marginTop: 20, fontSize: 30, fontWeight: 500, color: "#5b6474" }}>
          코스피 과열도를 매일 0~100 점수로 · 시장·감성 25개 지표
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Pretendard", data: extraBold, weight: 800, style: "normal" },
        { name: "Pretendard", data: medium, weight: 500, style: "normal" },
        { name: "Bricolage Grotesque", data: bricolage, weight: 700, style: "normal" },
      ],
    },
  );
}
