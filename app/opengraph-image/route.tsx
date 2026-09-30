import { ImageResponse } from "next/og";

import { getLatestDailyScore } from "@/lib/data";

import { CARD_BG, CardShell, INK, OG_SIZE, OG_STAGES, SUB, Wordmark, loadOgFonts } from "../og-card";
import { SLOGAN } from "../brand";
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
 *
 * ## 그림은 홈 히어로와 같다 (2026-09-30)
 *
 * 예전 카드는 파랑→초록→주황→빨강 4색 반원 게이지였다. 화면은 2026-08 에 그 게이지를 걷고 **곧은 4칸 막대와 핀**,
 * **50 경계 2색**(차가움 파랑 · 뜨거움 빨강, 구간은 명도)으로 바뀌었는데 카드만 남아, 가장 많이 공유되는 그림이
 * 사이트가 일부러 버린 색 의미(상온 = 초록 = 괜찮다)를 퍼뜨렸다. 지금은 큰 숫자·알약·막대·구간 이름이 히어로의
 * 햇쩨 지수 칸(app/home/Hero.tsx IndexTile)과 같은 색·같은 순서다. 색은 app/og-colors.ts(테스트가 theme.css 와 대조).
 */
export const runtime = "nodejs";

// 매 요청 최신 점수를 읽어야 하므로 정적 최적화를 끈다. 대신 응답에 캐시 헤더를 달아
// 크롤러가 몰려도 조회가 그만큼 늘지는 않게 한다.
export const dynamic = "force-dynamic";

/** 카드 안쪽 폭(1200 − 좌우 여백 84×2). 핀 자리를 픽셀로 셈하려고 둔다 — Satori 의 % 위치는 믿기 어렵다. */
const INNER_W = 1200 - 84 * 2;

/**
 * 히어로의 4칸 막대 + 핀(app/home/Hero.tsx Strip). 네 칸이 0·25·50·75 경계와 같은 폭이라 핀 자리는 점수 그대로의 % 다.
 * 아래 줄에 구간 이름 넷을 두고 지금 구간만 그 색으로 굵게 — 히어로와 같다.
 */
function Strip({ score, stage }: { score: number; stage: number }) {
  const s = Math.max(0, Math.min(100, score));
  const pinX = Math.round((INNER_W * s) / 100);
  return (
    <div style={{ display: "flex", flexDirection: "column", width: INNER_W }}>
      <div style={{ display: "flex", position: "relative", height: 58, width: INNER_W }}>
        <div style={{ display: "flex", position: "absolute", left: 0, top: 26, width: INNER_W, height: 20, borderRadius: 6, overflow: "hidden" }}>
          {OG_STAGES.map((st) => (
            <div key={st.label} style={{ width: INNER_W / 4, height: 20, background: st.band }} />
          ))}
        </div>
        {/* 핀 — 막대를 꿰는 선과 머리. 선은 막대 위아래로 조금 삐져나와야 칸 경계와 헷갈리지 않는다. */}
        <div style={{ position: "absolute", left: pinX - 2, top: 12, width: 4, height: 44, borderRadius: 2, background: INK }} />
        <div
          style={{
            position: "absolute",
            left: pinX - 11,
            top: 0,
            width: 22,
            height: 22,
            borderRadius: 11,
            background: CARD_BG,
            border: `5px solid ${INK}`,
          }}
        />
      </div>
      <div style={{ display: "flex", marginTop: 10 }}>
        {OG_STAGES.map((st, i) => (
          <div
            key={st.label}
            style={{
              display: "flex",
              justifyContent: "center",
              width: INNER_W / 4,
              fontSize: 28,
              fontWeight: i === stage ? 800 : 500,
              color: i === stage ? st.ink : SUB,
            }}
          >
            {st.label}
          </div>
        ))}
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
      <div style={{ marginTop: 40, fontSize: 48, fontWeight: 800, color: INK }}>{SLOGAN}</div>
      {/* 부제는 태그라인이 못 적는 **범위**를 적는다 — 이 카드는 점수 카드가 아니라
          사이트 대표 카드라서, 예전 부제("코스피 과열도를 매일 0~100 점수로 · 시장·감성
          25개 지표")처럼 지수 하나만 말하면 다섯 화면짜리 서비스가 지수 사이트로 보인다.
          아래 점수 카드(ScoreCard)의 한 줄은 반대다 — 거기는 햇쩨 지수 자체를 설명하는
          자리라 '시장·감성'이라는 지표 묶음 이름이 맞다. 둘을 같이 고치지 말 것. */}
      <div style={{ marginTop: 20, fontSize: 30, fontWeight: 500, color: SUB }}>
        25개 지표로 잰 코스피 과열도 · 텔레그램 여론 · 미국 공시와 통계
      </div>
    </div>
  );
}

function ScoreCard({ score, date }: { score: number; date: string }) {
  const label = stageForScore(score);
  const stageIndex = Math.max(0, OG_STAGES.findIndex((st) => st.label === label));
  const stage = OG_STAGES[stageIndex];
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
            {/* 숫자는 구간 잉크로 — 히어로의 큰 숫자(hz-tx-big)와 같다. */}
            <div style={{ display: "flex", alignItems: "baseline", color: stage.ink, letterSpacing: "-0.04em" }}>
              <div style={{ fontSize: 176, fontWeight: 800, lineHeight: 1.1 }}>{display}</div>
              <div style={{ fontSize: 88, fontWeight: 800, lineHeight: 1.1 }}>℃</div>
            </div>
            {/* 알약 — 점 + 구간 이름(히어로의 hz-tx-pill). 38px 굵은 글자라 큰 글자 기준(3:1)으로 읽힌다. */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                marginLeft: 28,
                marginBottom: 34,
                padding: "9px 28px 9px 22px",
                borderRadius: 999,
                background: stage.tint,
                color: stage.ink,
                fontSize: 38,
                fontWeight: 800,
              }}
            >
              <div style={{ width: 14, height: 14, borderRadius: 7, background: stage.ink, marginRight: 12 }} />
              <div>{label}</div>
            </div>
          </div>
        </div>
      </div>
      <Strip score={score} stage={stageIndex} />
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
