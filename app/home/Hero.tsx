// 홈 히어로 — 오늘의 온도·요약·지표 분포. app/page.tsx 에서 그대로 옮겨 왔다(app/home/parts.tsx 머리말 참고).

import Link from "next/link";
import type { ReactNode } from "react";
import { HeroSpotlights } from "./HeroSpotlights";
import type { SpotlightData } from "./spotlight-data";

import type { DailyScore, ScorePoint } from "@/lib/data";
import { compareLabel, formatKstUpdate } from "@/lib/format";
import { AiMark, C, Icon, MONO, stageForScore } from "../ui";
import { STAGE_META, renderRichSummary } from "./parts";
import { ScoreTrendTile } from "./ScoreTrendTile";

/** 점수(0~100)가 게이지 호 위에서 갖는 x 좌표. 호는 반지름 124, 중심 (150,150) 의 반원이다. */
/**
 * 히어로 게이지의 4칸 띠. 강조색이 아니라 트랙색이다 — 위에 마커가 서기 때문이다.
 *
 * ⚠️ 아래 DIST_FILL(지표 분포 스택 바)과 **다른 한 벌**이다. 헷갈리기 쉬운데 하는 일이
 * 다르다: 이쪽은 '구간 자체'를 그리는 배경이라 조용해야 마커와 값 라벨이 뜨고, 저쪽은
 * 개수를 견주는 데이터 면이라 세야 12 대 3 이 눈에 들어온다.
 *
 * 두 벌 다 hex 를 여기 박아 두면 안 된다. 그러면 다크에서 라이트 값이 그대로 나와,
 * '가장 조용한 칸'으로 고른 저온이 어두운 카드 위에서 화면에서 가장 밝은 면이 된다
 * (실제로 그랬다). 밝기 방향이 테마마다 반대라 색은 팔레트가 정한다.
 */
const HERO_STRIP = [
  "var(--c-band-cold)",
  "var(--c-band-neutral)",
  "var(--c-band-hot)",
  "var(--c-band-mania)",
];

/** 지표 분포 스택 바·범례 점의 4색. 위 HERO_STRIP 보다 한 단계씩 세다. */
export const DIST_FILL = [
  "var(--c-dist-cold)",
  "var(--c-dist-neutral)",
  "var(--c-dist-hot)",
  "var(--c-dist-mania)",
];

export const BAND_LABELS = ["저온", "상온", "고온", "초고온"];

/** 지표 분포 팝오버의 한 줄. heat 는 카드가 쓰는 것과 같은 과열도(capped 0~100)다. */
export type BandItem = { slug: string; name: string; heat: number };

/**
 * '지표 분포' 목록의 이름을 눌렀을 때 실제로 갈 셀.
 *
 * 보통은 지표 slug 가 그대로 셀 id(`ind-<slug>`)지만, **한 셀에 지표가 둘인 카드**가
 * 하나 있다(여윳돈이 향하는 곳 = 명품 + 오마카세). 그 셀엔 명품 id 만 달려 있으므로
 * 오마카세는 여기서 돌려보낸다. 이 표에 없는 slug 는 자기 id 를 그대로 쓴다.
 */
export const ANCHOR_ALIAS: Record<string, string> = {
  fine_dining_search_index: "luxury_consumption_index",
};

/**
 * 히어로 — 목업은 **두 장**이다(왼쪽 햇쩨 지수 · 오른쪽 오늘의 브리핑).
 *
 * 반원 게이지를 걷어냈다. 게이지는 눈금이 호를 따라 휘어 있어 "지금 어디쯤인가"를
 * 읽으려면 각도를 가늠해야 했는데, 곧은 4칸 막대는 구간 경계(25·50·75)가 칸 경계와
 * 그대로 일치한다. 마커가 그 위에 서서 온도를 한 번 더 적는다.
 */
/* 두 묶음(시장·감성)의 가중평균 과열도를 내던 categoryHeat 는 여기 있었다.
   히어로의 시장↔감성 비교 문단이 빠지면서 유일한 호출부가 없어졌다.
   ⚠️ 되살릴 일이 있으면 눈금을 먼저 볼 것 — 이 값은 원 과열도(0~100)이고 히어로의 ℃ 는
   그걸 SCORE_DISPLAY_ANCHORS 로 한 번 더 매핑한 값이라, 둘을 같은 문장에 섞으면 안 된다. */

export function Hero({
  dailyScore,
  tradHits,
  socialHits,
  bandCounts,
  bandTotal,
  trend,
  trendDays,
  spotlight,
  nameAnchors,
}: {
  dailyScore: DailyScore;
  tradHits: number;
  socialHits: number;
  /** 저온·상온·고온·초고온 순서 고정. 색까지 같이 넘겨 셀 안에서 인덱스로 안 찾게 한다. */
  bandCounts: { label: string; count: number; fill: string; items: BandItem[] }[];
  /** 위 넷의 합. 25가 아니라 **오늘 값이 들어온 지표 수**다(자료가 늦는 날 24가 된다). */
  bandTotal: number;
  /** 햇쩨 지수 추이의 점(날짜 오름차순). null 이면 조회 실패. */
  trend: ScorePoint[] | null;
  trendDays: number;
  /** 바닥 '오늘 눈에 띄는 것' 칩 재료(app/home/spotlight-data.ts). */
  spotlight: SpotlightData;
  /** 지표 이름(과 괄호 뗀 짧은 이름) → 그 카드 앵커. 세 줄 요약의 굵은 지표 이름을 카드로 잇는다. */
  nameAnchors: Record<string, string>;
}) {
  const stageLabel = stageForScore(dailyScore.score);
  const stage = STAGE_META[stageLabel] ?? STAGE_META["상온"];
  // 도수는 정수로 — 소수점 둘째 자리(6.16℃)는 없는 정밀도를 있는 것처럼 보이게 한다.
  const score = Math.max(0, Math.min(100, dailyScore.score));
  const temp = Math.round(score);
  // 앞 날짜 행 대비 변화. **반올림한 값끼리** 뺀다 — 원값으로 빼면 67.6과 65.4가 "2"로
  // 나오는데 화면에는 68과 65가 떠 있으므로 눈에 보이는 두 숫자의 차이와 어긋난다.
  const delta = dailyScore.prevDay === null ? null : temp - Math.round(dailyScore.prevDay.score);
  // 전일 대비는 알약이 아니라 글자 색으로만 말한다(콘솔 리디자인) — 그래서 tint 가 없다.
  // ⚠️ 내려간 쪽 색이 C.blue 였다. 원색은 **면**에 쓰는 값이라 흰 카드 위 글자로는
  //    3.71 이다(11.5px/800 이라 4.5 가 필요하다). 파란 글자는 C.blueInk 다 — 5.23.
  const deltaColor = delta === null || delta === 0 ? C.sub2 : delta > 0 ? C.mania : C.blueInk;
  const deltaText = delta === null ? "—" : delta === 0 ? "—" : `${delta > 0 ? "▲" : "▼"}${Math.abs(delta)}`;
  const deltaLabel = compareLabel(dailyScore.date, dailyScore.prevDay?.date ?? null);

  /* LLM 요약은 **세 문단**이다(2026-09-05 에 가운데를 끼웠다).
       ① 오늘 가장 뜨거운 지표  ② 시장 지표 vs 감성 지표  ③ 최근 며칠 온도 추세
     셋 다 브리핑 셀에 들어간다 — '무엇이 → 어느 종류가 → 어떤 흐름으로' 순으로 읽힌다.

     ⚠️⚠️ **두 줄짜리 옛 자료를 그대로 살려야 한다.** 저장된 문장은 파이프라인이 다시
     돌아야 세 줄이 되는데, 그때까지 인덱스를 [0][1][2] 로 못박으면 **추세 문단이 통째로
     사라진다**(옛 자료의 [1] 은 추세인데 [2] 는 없다). 줄 수로 갈라 집는다. */
  const { lines: summaryLines, brief } = parseBrief(dailyScore.ai_summary);
  // ⭐ 세 줄 요약(2026-09-28~) — 줄마다 "[흐름] …" 이름표가 붙어 저장된다(generate_daily_summary.py
  //    BRIEF_LABELS). 이름표가 셋 다 있으면 새 형식으로 그리고, 아니면 옛 형식(아래)으로 그린다 —
  //    파이프라인이 한 번 돌기 전까지 DB 에는 옛 줄이 남아 있다.
  //    첫 줄에 이름표가 있으면 새 형식이다. 이름표 없는 줄은 앞 줄에 이어 붙인다 — 모델이 '한두 문장'을 두 줄로
  //    낸 경우다(파이프라인도 줄바꿈을 공백으로 바꿔 저장하지만 한 겹 더 막는다). 안 그러면 옛 형식으로 떨어져
  //    "[흐름] …"이 날것으로 찍힌다.
  const meaningLine = summaryLines[0] ?? null;
  const balanceLine = summaryLines.length >= 3 ? summaryLines[1] : null;
  const trendLine = (summaryLines.length >= 3 ? summaryLines[2] : summaryLines[1]) ?? null;

  return (
    /* 2026-09-04 리디자인 — 카더라 히어로와 같은 격자(.hz-tx-hero)다. 왼쪽 [오늘의 문장 +
       브리핑 문단][오늘 눈에 띄는 것], 오른쪽 [햇쩨 지수 타일][지표 분포 타일]. 예전의 흰 판 세 칸
       (.hz-hero-panel · 지수:분포:브리핑 = 1:1:2)은 CSS 만 남아 있다.
       ⭐ `hz-tx-hero-flip` 은 **데이터 타일이 왼쪽, 문장이 오른쪽**이라는 뜻이다(국장 카더라와
       같은 배치). 숫자를 먼저 훑고 문장으로 넘어가는 순서가 이 화면들의 읽는 순서다.
       제목 둘째 줄은 구간 이름이다 — 옆 타일의 큰 숫자·알약과 같은 stage.color 라 셋이
       한 사실을 말한다. 첫 문단에서 "현재 시장 온도는 상온 구간입니다"를 뺀 것도 그래서다
       (제목이 이미 그 말이다). */
    <section className="hz-sheet hz-tx-hero hz-tx-hero-flip hz-tx-hero-home">
      <div className="hz-tx-hero-main">
        <div className="hz-tx-eyebrow">
          {/* ✨ 는 생성형 AI 고지(AI 기본법 §31)라 누를 수 있어야 한다(AiMark 주석). */}
          <span>
            <AiMark size={15} />
            오늘의 브리핑
          </span>
          {/* 기준 시각. 목업은 본문 헤더 부제로 올렸는데 헤더(AppShell)는 공유 셸이라 브리핑
              전용 데이터를 못 집는다 — 눈썹 줄 오른쪽에 둔다(카더라와 같은 자리). */}
          <span className="hz-tx-eyebrow-r">
            <Icon name="schedule" style={{ fontSize: "var(--fs-14)", color: C.muted }} />
            최종 업데이트 · {formatKstUpdate(dailyScore.updated_at)}
          </span>
        </div>
        <h2 className="hz-tx-hero-title">
          지금 시장은
          <br />
          <em style={{ color: stage.color }}>{stageLabel}</em> 구간입니다
        </h2>
        {brief ? (
          /* 요약 — 흐름 · 달라진 것 · 뜨거운 곳 · 여론(2026-09-28 채택). 이름표는 코드가 붙이고 문장은 LLM 이
             쓴다. 옛 형식의 첫 문단(초고온 개수 템플릿)은 뺐다 — '뜨거운 곳'이 같은 말을 하고, 옛 ② 문단과
             같은 개수를 두 번 말하고 있었다. */
          <dl className="hz-tx-hero-body hz-brief3">
            {brief.map((r, i) => (
              <div key={`${i}-${r.label}`} className="hz-brief3-row">
                {/* 여론 줄의 이름표는 카더라로 간다 — 그 줄의 출처이고, 더 읽을 곳이다. */}
                <dt>
                  {r.label === "여론" ? (
                    <Link href="/kadera" className="hz-brief3-dt-link" data-ga="cta_click" data-ga-cta="brief_yeoron" data-ga-surface="home_hero">
                      {r.label} ›
                    </Link>
                  ) : (
                    r.label
                  )}
                </dt>
                <dd>{renderBriefLine(r.text, nameAnchors)}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <div className="hz-tx-hero-body">
            {/* 옛 형식 세 문단 — '오늘 → 왜 → 흐름'. 둘째·셋째는 LLM 이 쓴 것(renderRichSummary 가 굵힘). */}
            <p>
              오늘은 시장 지표 <b style={{ fontWeight: 800, color: C.ink }}>{tradHits}개</b>, 감성 지표{" "}
              <b style={{ fontWeight: 800, color: C.ink }}>{socialHits}개</b>가 초고온 구간에 들었습니다.
            </p>
            {meaningLine && <p>{renderRichSummary(meaningLine)}</p>}
            {/* ② 시장 지표 vs 감성 지표 — 어느 종류가 뜨거운가(2026-09-05 요청).
                ⚠️ 2026-08-03 에 같은 자리에서 뺐던 문단이다. 뺀 까닭은 **자리가 없어서**다
                   (확인). 코드 주석이 한때 "우리가 만든 문장이라 결이 달랐다"·"옆 지표
                   분포가 개수로 보여 준다" 를 이유로 적어 뒀는데 그건 나중에 붙인 설명이고,
                   실제로는 히어로가 좁아 문단이 들어갈 데가 없었다. 이번 리디자인에서 브리핑 칸이
                   넓어져 자리가 생겼다.
                ⛔ 온도 숫자를 만들어 붙이지 말 것. 옛 문단은 marketHeat·socialHeat 를 계산해
                   끼운 템플릿이었다. 근거는 digest 가 주고 문장은 모델이 쓴다
                   (generate_daily_summary.BALANCE_SYSTEM). */}
            {balanceLine && <p>{renderRichSummary(balanceLine)}</p>}
            {trendLine && <p>{renderRichSummary(trendLine)}</p>}
          </div>
        )}
      </div>

      {/* 바닥 '오늘 눈에 띄는 것' — 카더라 히어로 바닥과 같은 칩 줄(.hz-tx-note 자리). 여기 있던 면책 각주
          ("…매수·매도 신호가 아닙니다")는 2026-09-28 에 뺐다(요청). 같은 뜻의 고지가 투자 유의사항(/disclaimer, 모든
          화면의 푸터가 가리킨다)과 이용약관에 있고, 카더라도 09-04 에 같은 자리의 각주를 칩으로 바꿨다. */}
      <HeroSpotlights data={spotlight} />
      <aside className="hz-tx-hero-side">
        {/* ── ① 햇쩨 지수 + 지표 분포(한 칸, 2026-09-28) ──────────────────
            옛 두 칸(햇쩨 지수 · 지표 분포)을 합쳤다. 줄인 높이만큼 아래 추이 칸이 들어가 히어로 키는 그대로다
            (.hz-tx-hero-side 주석의 공백 문제). 후보 셋(구간 이름 줄에 개수 · 얇은 분포 막대 · 큰 숫자 옆 세로 목록) 중 마지막 꼴이다. */}
        <IndexTile
          score={score}
          temp={temp}
          stageLabel={stageLabel}
          stageColor={stage.color}
          deltaLabel={deltaLabel}
          deltaText={deltaText}
          deltaColor={deltaColor}
          bandCounts={bandCounts}
          bandTotal={bandTotal}
        />

        {/* ── ② 햇쩨 지수 추이 ─────────────────────────────────────────
            카더라 두 히어로의 센티먼트 추이와 같은 자리·같은 키다(app/home/ScoreTrendTile.tsx). */}
        <ScoreTrendTile points={trend} days={trendDays} />
      </aside>
    </section>
  );
}


type Band = { label: string; count: number; fill: string; items: BandItem[] };

/** 구간 하나의 지표 목록(호버·초점에 위로 열린다). 옛 분포 칸의 그것 그대로다. v2 햇쩨 지수 모듈도 쓴다. */
export function DistPop({ b }: { b: Band }) {
  return b.count > 0 ? (
    <div className="hz-dist-pop hz-scroll">
      <div className="hz-dist-pop-head">
        {b.label} {b.count}개 · 과열도순 · 눌러서 이동
      </div>
      {b.items.map((it) => (
        <a key={it.slug} href={`#ind-${ANCHOR_ALIAS[it.slug] ?? it.slug}`} className="hz-dist-pop-item">
          <span className="hz-dist-pop-name">{it.name}</span>
          <span className="hz-dist-pop-heat">{Math.round(it.heat)}</span>
        </a>
      ))}
    </div>
  ) : (
    <div className="hz-dist-pop hz-dist-pop-slim">
      <p className="hz-dist-pop-none">오늘은 {b.label} 구간에 든 지표가 없습니다</p>
    </div>
  );
}

/** 옛 햇쩨 지수 칸의 4칸 띠 + 핀. 네 칸이 0·25·50·75 경계와 같은 폭이라 핀 자리는 점수 그대로의 % 다. */
function Strip({ score, segs, below }: { score: number; segs: boolean; below?: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ position: "relative", paddingTop: 12 }}>
        <div style={{ display: "flex", height: 9, borderRadius: 3, overflow: "hidden" }}>
          {HERO_STRIP.map((bg, i) => (
            <span key={i} className={segs ? "hz-dist-seg" : undefined} data-band={i} style={{ width: "25%", background: bg }} />
          ))}
        </div>
        <span className="hz-tx-pin" style={{ left: `${score}%` }} />
      </div>
      {below}
    </div>
  );
}

function IndexTile({
  score,
  temp,
  stageLabel,
  stageColor,
  deltaLabel,
  deltaText,
  deltaColor,
  bandCounts,
  bandTotal,
}: {
  score: number;
  temp: number;
  stageLabel: string;
  stageColor: string;
  deltaLabel: string;
  deltaText: string;
  deltaColor: string;
  bandCounts: Band[];
  bandTotal: number;
}) {
  const cap = (
    <div className="hz-tx-tile-cap">
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
        햇쩨 지수
        <span className="hz-tip hz-tip-wide hz-tip-below" data-tip="지표 25개 가중 평균" data-ga-tip="hatzze_index" style={{ display: "inline-flex", cursor: "help" }}>
          <Icon name="help" style={{ fontSize: "var(--fs-14)", color: C.muted }} />
        </span>
      </span>
      <span className="hz-tx-pill" style={{ color: stageColor }}>
        <span className="hz-tx-pill-dot" style={{ background: stageColor }} />
        {stageLabel}
      </span>
    </div>
  );
  const big = (
    <strong className="hz-tx-big" style={{ fontFamily: MONO, color: stageColor }}>
      {temp}
      <span>℃</span>
    </strong>
  );
  const asideLines = (
    <>
      {/* 폰(≤560)에선 뒤 꼬리를 뗀다 — 옆 2×2 목록에 자리를 내주면 두 줄로 접혀 칸이 커진다(tx.css .hz-vlist-more). */}
      <span style={{ fontSize: "var(--fs-11-5)", fontWeight: 600, color: C.sub }}>
        지표 {bandTotal}개<span className="hz-vlist-more"> · 0~100 과열도 환산</span>
      </span>
      <span style={{ fontSize: "var(--fs-11-5)", fontWeight: 700, color: C.sub }}>
        {deltaLabel} <span style={{ color: deltaColor, fontWeight: 800 }}>{deltaText}</span>
      </span>
    </>
  );
  /* 띠 아래 구간 이름 줄. 지금 구간만 진하게(옛 칸과 같다). */
  const names = (
    <div style={{ display: "flex" }}>
      {BAND_LABELS.map((l) => (
        <span key={l} style={{ flex: 1, textAlign: "center", fontSize: "var(--fs-11)", fontWeight: l === stageLabel ? 800 : 600, color: l === stageLabel ? stageColor : C.label }}>
          {l}
        </span>
      ))}
    </div>
  );

  // 큰 숫자(왼쪽)와 네 구간 개수(오른쪽, 뜨거운 구간부터 세로)를 한 줄에. 온도 띠는 그 아래 폭 전체.
  // 세로 목록의 줄이 곧 옛 분포 칸의 호버 자리다(.hz-dist-row) — 목록·띠 강조가 그대로 든다.
  return (
    <div className="hz-tx-tile hz-dist">
      {cap}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
          {big}
          <div style={{ display: "flex", flexDirection: "column" }}>{asideLines}</div>
        </div>
        <div className="hz-vlist">
          {[...bandCounts].reverse().map((b) => {
            const i = BAND_LABELS.indexOf(b.label);
            return (
              <div key={b.label} className={`hz-dist-row hz-vlist-item${b.count === 0 ? " hz-dist-row-none" : ""}`} data-band={i} tabIndex={0}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "var(--fs-11-5)", fontWeight: 600, color: C.label }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: b.fill }} />
                  {b.label}
                </span>
                <b style={{ fontFamily: MONO, fontSize: "var(--fs-12-5)", fontWeight: 800, color: C.ink }}>{b.count}</b>
                <DistPop b={b} />
              </div>
            );
          })}
        </div>
      </div>
      <Strip score={score} segs below={names} />
    </div>
  );
}

/** 요약 한 줄의 이름표. 파이프라인(generate_daily_summary.BRIEF_LABELS)과 같은 넷이다. 여론 줄은 카더라 총평이
 *  없는 날 빠져 세 줄로 올 수 있다 — 줄 수가 아니라 이름표로 알아본다. */
const BRIEF_LABEL_RE = /^\[(흐름|달라진 것|뜨거운 곳|여론)\]\s*/;

/**
 * 저장된 요약을 줄로 가르고, 첫 줄에 이름표가 있으면 새 형식(이름표 · 문장)으로 묶는다. 이름표 없는 줄은 앞 줄에 잇는다
 * (모델이 '한두 문장'을 두 줄로 낸 경우). 아니면 brief 는 null — 옛 형식 줄을 그대로 쓴다. 히어로 · v2 브리핑 모듈이 같이 쓴다.
 */
export function parseBrief(summary: string | null | undefined): { lines: string[]; brief: { label: string; text: string }[] | null } {
  const lines = (summary ?? "")
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
  if (!lines.length || !BRIEF_LABEL_RE.test(lines[0])) return { lines, brief: null };
  const brief: { label: string; text: string }[] = [];
  for (const line of lines) {
    const m = BRIEF_LABEL_RE.exec(line);
    if (m) brief.push({ label: m[1], text: line.slice(m[0].length) });
    else brief[brief.length - 1].text += ` ${line}`;
  }
  return { lines, brief };
}

/**
 * 세 줄 요약의 한 줄. 굵은 조각(**…**)이 지표 이름이면 그 카드로 내려가는 링크가 된다 — 파이프라인이
 * 굵게를 지표 이름에만 남긴다. 나머지는 옛 요약과 같은 규칙(renderRichSummary: 굵게 · 온도 낱말 색)이다.
 */
export function renderBriefLine(text: string, anchors: Record<string, string>): ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
    const name = /^\*\*[^*]+\*\*$/.test(part) ? part.slice(2, -2) : null;
    const href = name ? anchors[name] : undefined;
    return href ? (
      <a key={i} href={href} className="hz-brief3-link" data-ga="cta_click" data-ga-cta="brief_indicator" data-ga-surface="home_hero">
        {name}
      </a>
    ) : (
      <span key={i}>{renderRichSummary(part)}</span>
    );
  });
}
