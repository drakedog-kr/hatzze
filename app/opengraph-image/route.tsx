import { ImageResponse } from "next/og";

import { getLatestDailyScore } from "@/lib/data";

import {
  BLUE,
  CARD_BG,
  CardShell,
  INK,
  OG_SIZE,
  SUB,
  TRACK,
  Wordmark,
  dataUri,
  loadOgFonts,
} from "../og-card";
import { stageForScore } from "../ui";

/**
 * **홈**(hatzze.fun)을 카톡·X·슬랙에 공유할 때 뜨는 미리보기 이미지(1200×630).
 * 오늘의 과열도(정수 ℃)와 구간을 얹어, 링크만 봐도 오늘 숫자가 보이게 한다.
 * (/kadera·/mdd 는 매일 바뀌는 숫자가 없어 각 폴더의 opengraph-image.tsx 로 따로 그린다.)
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
 * 배경·글자색·워드마크·폰트는 app/og-card.tsx 에서 가져온다(세 카드가 한 세트로 보이게).
 */
export const runtime = "nodejs";

// 매 요청 최신 점수를 읽어야 하므로 정적 최적화를 끈다. 대신 응답에 캐시 헤더를 달아
// 크롤러가 몰려도 조회가 그만큼 늘지는 않게 한다.
export const dynamic = "force-dynamic";

// 구간 색은 화면과 같아야 한다. app/globals.css 의 라이트 테마 값 그대로다.
const STAGE_COLOR: Record<string, { color: string; tint: string }> = {
  저온: { color: "#1b64da", tint: "rgba(27, 100, 218, 0.10)" },
  상온: { color: "#028450", tint: "rgba(2, 132, 80, 0.10)" },
  고온: { color: "#ed6700", tint: "rgba(237, 103, 0, 0.12)" },
  초고온: { color: "#d22030", tint: "rgba(210, 32, 48, 0.10)" },
};

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
    '<stop offset="0%" stop-color="#1b64da"/><stop offset="33%" stop-color="#028450"/>' +
    '<stop offset="66%" stop-color="#ed6700"/><stop offset="100%" stop-color="#d22030"/>' +
    "</linearGradient></defs>" +
    `<path ${arc} stroke="${TRACK}"/>` +
    `<path ${arc} stroke="url(#thermal)" stroke-dasharray="${arcLen}" stroke-dashoffset="${dashoffset}"/>` +
    `<circle cx="${nx}" cy="${ny}" r="12" fill="${BLUE}" stroke="${CARD_BG}" stroke-width="4"/>` +
    "</svg>"
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
    <CardShell>
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
    </CardShell>
  );
}

export async function GET() {
  const fonts = await loadOgFonts();

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
    ...OG_SIZE,
    fonts,
    headers: {
      // URL 에 날짜·도수가 실려 있어 내용이 바뀌면 URL 도 바뀐다. 그래도 무한 캐시는
      // 두지 않는다 — 버전 없는 폴백 URL(/opengraph-image)도 같은 핸들러라, 그쪽이
      // 하루 종일 옛 그림에 굳는 걸 막으려고 10분으로 둔다.
      "Cache-Control": "public, max-age=600, s-maxage=600, stale-while-revalidate=86400",
    },
  });
}
