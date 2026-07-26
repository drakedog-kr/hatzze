import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { getLatestDailyScore } from "@/lib/data";

import { stageForScore } from "../ui";

/**
 * 카톡·X·슬랙 등에서 hatzze.fun 링크를 공유할 때 뜨는 미리보기 이미지(1200×630).
 * 오늘의 과열도(정수 ℃)와 구간을 얹어, 링크만 봐도 오늘 숫자가 보이게 한다.
 *
 * ## 왜 파일 컨벤션(app/opengraph-image.tsx)이 아니라 라우트 핸들러인가
 * 컨벤션이 만들어 주는 URL 은 `/opengraph-image?<빌드시점 해시>` 라 내용이 매일
 * 바뀌어도 URL 은 그대로다. 카톡이 og:image 를 URL 기준으로 자기 서버에 캐시하므로
 * 그러면 며칠 전 이미지가 계속 뜬다(app/seo.ts 의 ogImage() 주석 참고). URL 에 날짜를 실으려면
 * 우리가 URL 을 직접 만들어야 하는데, **컨벤션 파일이 있는 한 그게 불가능하다** —
 * 루트 세그먼트에서 openGraph.images 를 직접 선언해도 컨벤션이 og:image 를 도로
 * 덮어쓴다(실측: twitter:image 만 우리 값이 남아 둘이 서로 다른 URL 을 가리켰다).
 * 그래서 컨벤션 파일을 지우고 같은 경로의 라우트 핸들러로 옮겼다. 경로를
 * `/opengraph-image` 로 유지한 덕에 이미 퍼진 옛 링크의 미리보기도 계속 뜬다.
 * URL 은 app/seo.ts 의 ogImage() 한 곳에서만 만든다.
 *
 * 폰트는 로컬 파일을 바이트로 넘긴다. Satori 는 woff2 만 못 읽고 otf·woff 는 읽으므로
 * 한글 본문은 Pretendard OTF, 워드마크는 Bricolage Grotesque woff 를 쓴다.
 */
export const runtime = "nodejs";

// 매 요청 최신 점수를 읽어야 하므로 정적 최적화를 끈다. 대신 응답에 캐시 헤더를 달아
// 크롤러가 몰려도 조회가 그만큼 늘지는 않게 한다.
export const dynamic = "force-dynamic";

const SIZE = { width: 1200, height: 630 };

// Satori 는 CSS 변수를 못 읽어서 색을 직접 적는다. 구간 색·트랙 색은 화면과 같아야
// 하므로 app/globals.css 의 라이트 테마 값을 그대로 옮겼다(그쪽을 바꾸면 여기도 바꿀 것).
const INK = "#25262f";
const SUB = "#5b6474";
const CARD_BG = "#eef2ff";
const TRACK = "#c2c6d8"; // --c-track
const BLUE = "#0064ff"; // --c-blue
const STAGE_COLOR: Record<string, { color: string; tint: string }> = {
  저온: { color: "#5ea8d8", tint: "rgba(94, 168, 216, 0.16)" },
  상온: { color: "#a89f95", tint: "rgba(168, 159, 149, 0.18)" },
  고온: { color: "#ff9a4d", tint: "rgba(255, 154, 77, 0.16)" },
  초고온: { color: "#ff6b81", tint: "rgba(255, 107, 129, 0.14)" },
};

const GHOST =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 104">' +
  '<path d="M12,84 C6,42 22,8 50,8 C78,8 94,42 88,84 C86,95 80,95 77,87 C74,80 67,80 64,88 C61,96 54,96 51,88 C48,80 41,80 38,88 C35,96 28,96 25,87 C22,80 15,93 12,84 Z" fill="#0064ff"/>' +
  '<ellipse cx="39" cy="50" rx="9.5" ry="12" fill="#fff"/><circle cx="66" cy="52" r="7" fill="#fff"/><circle cx="42" cy="45" r="3" fill="#0064ff"/></svg>';

/**
 * 히어로의 반원 게이지(app/page.tsx 의 HeroGauge)와 같은 그림.
 * 좌표·호 길이·눈금 색을 그대로 옮겨, 공유 이미지와 화면이 같은 그림으로 읽히게 한다.
 * Satori 에 SVG 를 넘기는 안전한 방법은 data URI 라 문자열로 만든다(고스트 심볼과 같은 방식).
 */
function gaugeSvg(score: number): string {
  const s = Math.max(0, Math.min(100, score));
  const arcLen = 389.6;
  const dashoffset = arcLen * (1 - s / 100);
  const theta = ((180 - (s / 100) * 180) * Math.PI) / 180;
  const nx = 150 + 124 * Math.cos(theta);
  const ny = 150 - 124 * Math.sin(theta);
  const arc = 'd="M 26 150 A 124 124 0 0 1 274 150" fill="none" stroke-width="22" stroke-linecap="round"';
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 172">' +
    '<defs><linearGradient id="thermal" x1="0" y1="0" x2="1" y2="0">' +
    '<stop offset="0%" stop-color="#5ea8d8"/><stop offset="33%" stop-color="#a89f95"/>' +
    '<stop offset="66%" stop-color="#ff9a4d"/><stop offset="100%" stop-color="#ff6b81"/>' +
    "</linearGradient></defs>" +
    `<path ${arc} stroke="${TRACK}"/>` +
    `<path ${arc} stroke="url(#thermal)" stroke-dasharray="${arcLen}" stroke-dashoffset="${dashoffset}"/>` +
    `<circle cx="${nx}" cy="${ny}" r="12" fill="${BLUE}" stroke="${CARD_BG}" stroke-width="4"/>` +
    "</svg>"
  );
}

function dataUri(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

const FONT_DIR = "node_modules/pretendard/dist/public/static";
// 워드마크는 본문과 서체가 다르다. app/Logo.tsx 의 브랜드 규격이
// Bricolage Grotesque 700 · letter-spacing -0.035em 라, 화면과 공유 이미지가
// 같은 글자로 보이려면 이 파일도 같은 서체를 써야 한다. 화면 쪽은 Google Fonts
// CDN 으로 받지만 Satori 는 폰트 바이트를 직접 받아야 해서 여기서만 로컬 파일을 읽는다.
const WORDMARK_FONT =
  "node_modules/@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-700-normal.woff";

/** 워드마크 자간. 브랜드 규격(-0.035em)을 주어진 크기에 환산한 값이다. */
function tracking(size: number): string {
  return `${(size * -0.035).toFixed(2)}px`;
}

function Wordmark({ size }: { size: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: size * 0.23 }}>
      <img src={dataUri(GHOST)} width={size * 1.03} height={size * 1.07} alt="" />
      <div
        style={{
          fontFamily: "Bricolage Grotesque",
          fontSize: size,
          fontWeight: 700,
          color: INK,
          letterSpacing: tracking(size),
        }}
      >
        hatzze
      </div>
    </div>
  );
}

/** 점수를 못 읽었을 때의 폴백. 예전부터 쓰던 고정 브랜드 카드 그대로다. */
function BrandCard() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "0 100px",
        background: CARD_BG,
        fontFamily: "Pretendard",
      }}
    >
      <Wordmark size={128} />
      <div style={{ marginTop: 40, fontSize: 48, fontWeight: 800, color: INK }}>데이터와 감성으로 읽는 시장</div>
      <div style={{ marginTop: 20, fontSize: 30, fontWeight: 500, color: SUB }}>
        코스피 과열도를 매일 0~100 점수로 · 시장·감성 25개 지표
      </div>
    </div>
  );
}

function ScoreCard({ score, date }: { score: number; date: string }) {
  const label = stageForScore(score);
  const stage = STAGE_COLOR[label] ?? { color: SUB, tint: "rgba(107, 118, 132, 0.14)" };
  // 도수는 정수로 — 소수점 둘째 자리(6.16℃)는 없는 정밀도를 있는 것처럼 보이게 한다
  // (app/page.tsx 의 히어로와 같은 규칙). 카톡 캐시를 깨는 URL 버전도 이 정수를 쓴다.
  const display = Math.round(score).toString();

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
      <Wordmark size={50} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 34, fontWeight: 500, color: SUB }}>오늘의 코스피 과열도</div>
          <div style={{ display: "flex", alignItems: "flex-end", marginTop: 2 }}>
            {/* Satori 는 자식이 둘 이상인 div 에 display 를 명시하지 않으면 렌더 자체가
                실패한다(화면처럼 <span>℃</span> 를 글자 안에 섞을 수 없다). 그래서 숫자와
                ℃ 를 각각 블록으로 두고 baseline 으로 맞춘다 — 화면과 같은 모양이 된다. */}
            <div style={{ display: "flex", alignItems: "baseline", color: INK, letterSpacing: "-0.04em" }}>
              <div style={{ fontSize: 176, fontWeight: 800, lineHeight: 1.1 }}>{display}</div>
              <div style={{ fontSize: 88, fontWeight: 800, lineHeight: 1.1 }}>℃</div>
            </div>
            <div
              style={{
                marginLeft: 28,
                marginBottom: 32,
                padding: "9px 28px",
                borderRadius: 999,
                background: stage.tint,
                color: stage.color,
                fontSize: 38,
                fontWeight: 800,
              }}
            >
              {label}
            </div>
          </div>
        </div>
        <img src={dataUri(gaugeSvg(score))} width={452} height={259} alt="" />
      </div>
      {/* 한 문장을 `{date} 기준 …` 처럼 쓰면 Satori 가 텍스트 노드 둘로 세어
          "display 를 명시하라"며 렌더를 통째로 실패시킨다. 문자열 하나로 만든다. */}
      <div style={{ fontSize: 27, fontWeight: 500, color: SUB }}>
        {`${date} 기준 · 시장·감성 25개 지표를 하나의 과열도 점수로 환산합니다.`}
      </div>
    </div>
  );
}

export async function GET() {
  const [extraBold, medium, bricolage] = await Promise.all([
    readFile(join(process.cwd(), FONT_DIR, "Pretendard-ExtraBold.otf")),
    readFile(join(process.cwd(), FONT_DIR, "Pretendard-Medium.otf")),
    readFile(join(process.cwd(), WORDMARK_FONT)),
  ]);

  // 조회가 실패해도 이미지는 200 으로 떠야 한다 — 미리보기가 통째로 사라지는 것보다
  // 숫자 없는 브랜드 카드가 낫다. 쿼리의 v= 는 카톡 캐시를 깨기 위한 키일 뿐이라
  // 여기서 읽지 않는다(항상 최신 점수를 그린다).
  let score: { score: number; date: string } | null = null;
  try {
    const latest = await getLatestDailyScore();
    if (latest) score = { score: latest.score, date: latest.date };
  } catch {
    score = null;
  }

  return new ImageResponse(score ? <ScoreCard score={score.score} date={score.date} /> : <BrandCard />, {
    ...SIZE,
    fonts: [
      { name: "Pretendard", data: extraBold, weight: 800, style: "normal" },
      { name: "Pretendard", data: medium, weight: 500, style: "normal" },
      { name: "Bricolage Grotesque", data: bricolage, weight: 700, style: "normal" },
    ],
    headers: {
      // URL 에 날짜·도수가 실려 있어 내용이 바뀌면 URL 도 바뀐다. 그래도 무한 캐시는
      // 두지 않는다 — 버전 없는 폴백 URL(/opengraph-image)도 같은 핸들러라, 그쪽이
      // 하루 종일 옛 그림에 굳는 걸 막으려고 10분으로 둔다.
      "Cache-Control": "public, max-age=600, s-maxage=600, stale-while-revalidate=86400",
    },
  });
}
