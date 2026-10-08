// 홈(시장 브리핑) 카드가 같이 쓰는 조각들 — 값 고르기(pick)·카드 틀(Shell·TitleRow·Big·Foot)·게이지(HeatBar)·면적 차트.
// 2026-09-17 에 app/page.tsx(2,692줄)에서 그대로 옮겨 왔다. 카드 하나 고치려고 2,600줄을 열던 것을 나눈 것이라
// 동작은 하나도 안 바뀐다(옮긴 뒤 렌더 HTML 이 글자 단위로 같은 것을 확인했다).

import React from "react";
import type { IndicatorWithLatestValue } from "@/lib/data";
import { formatIndicatorValue, shortDate } from "@/lib/format";
import { C, Icon, MONO, R } from "../ui";
import type { IconName } from "@/lib/icon-names";

/**
 * 과열도(0~100) → 색. **화면 전체가 이 함수 하나만 쓴다.**
 *
 * 경계(25·50·75)는 히어로의 저온·상온·고온·초고온과 같다. 예전엔 큰 수치용 heatColor
 * (경계 33·70·100)가 따로 있어서 한 카드 안에서 색이 갈렸다 — 코스닥 과열도 79.7이
 * 숫자는 '고온'(주황), 바로 밑 게이지는 '초고온'(빨강)으로 칠해지는 식이었다.
 * 같은 값에 두 이름을 붙일 이유가 없어 하나로 합쳤다.
 */
export function overheatColor(pct: number | null): string {
  if (pct === null) return C.sub;
  // 화면에 찍히는 정수로 가른다 — 구간 이름(stageForScore)과 같은 잣대. 24.91 이 '25'로 찍히고 상온 목록에 서는데 색만
  // 저온이었다(2026-10-04 머지 전 점검).
  const v = Math.round(pct);
  if (v >= 75) return C.mania;
  if (v >= 50) return C.hot;
  if (v >= 25) return C.neutral;
  return C.cold;
}

// ── 지표 데이터 픽 ────────────────────────────────────────────────
type Ind = IndicatorWithLatestValue;

export type Pick = {
  ind?: Ind;
  name: string;
  headline: string | null;
  desc: string;
  raw: number | null;
  score: number | null;
  capped: number | null;
  threshold: number | null;
  isHit: boolean;
  /** 고온 이상(진행률 ≥ 50). 카드 보조 배지의 색을 가른다. */
  warm: boolean;
  color: string;
  disp: string;
  unit: string;
  /** 진행률 100 지점(매핑 상한). 유튜브 '평소 대비 N배'처럼 이 값이 필요한 카드만 쓴다. */
  thDisp: string | null;
  details: Record<string, number> | null;
  history: number[];
  historyPoints: { date: string; value: number }[];
  /**
   * 카드에 "7/28 기준"으로 적을 자료일(YYYYMMDD). details.source_date 가 있으면 그 값,
   * 없으면 **행 날짜**로 물러선다.
   *
   * ⚠️ 둘은 같은 뜻이 아니다. source_date 는 스크립트가 "이 값은 며칟날 자료다"라고
   * 밝힌 것이고, 행 날짜는 그 행이 놓인 날일 뿐이다. KRX 가 최근 영업일치를 아직 안 낸
   * 날 파이프라인이 며칠 전 자료로 '오늘' 행을 쓰는 지표에서는 행 날짜가 자료일보다
   * 새것이라, 이 폴백은 낡음을 **덜** 말한다(더 말하지는 않는다).
   *
   * 그래서 이 값을 **아무 카드에나 붙이면 안 된다.** 지금 배지를 다는 건 코스피 신고가
   * 괴리율(source_date 를 쓴다)과 급등 종목 강도 둘뿐이고, 후자는 upsert 가 KRX 거래일을
   * 그대로 행 날짜로 삼아(`"date": iso`, fetch_limit_up_breadth.py) 둘이 정확히 같다.
   * 다른 카드에 달려면 그 스크립트가 행 날짜를 어떻게 정하는지 먼저 볼 것.
   */
  sourceDate: string | null;
};

export function pick(ind: Ind | undefined): Pick {
  const raw = ind?.latest?.raw_value ?? null;
  const score = ind?.latest?.normalized_score ?? null;
  const capped = score === null ? null : Math.min(Math.max(score, 0), 100);
  const threshold = ind?.latest?.threshold ?? null;
  const unit = ind?.unit ?? "";
  const f =
    raw !== null
      ? formatIndicatorValue(raw, unit)
      : { display: "-", displayUnit: unit };
  const tf = threshold !== null ? formatIndicatorValue(threshold, unit) : null;
  return {
    ind,
    name: ind?.name ?? "",
    headline: ind?.headline ?? null,
    desc: ind?.description_beginner ?? "",
    raw,
    score,
    capped,
    threshold,
    // 초고온 = 진행률 ≥ 75. 모든 지표의 진행률이 '과열도(0~100)'로 통일돼 있어
    // (youtube는 surge_map으로 평균 대비 급증을 매핑) 예외 없이 동일 기준이다.
    // 반올림한 값으로 — 구간 이름 · 색과 같은 잣대(stageForScore · overheatColor).
    isHit: Math.round(capped ?? 0) >= 75,
    // 고온 이상(진행률 ≥ 50). 카드에 붙는 보조 배지의 색을 가르는 값이다 — 배지가 늘
    // 파랑이면 "콜 우세"(= 지금 뜨겁다)가 차분한 색으로 떠서 큰 수치와 반대말을 한다.
    // isHit(≥75)과 따로 두는 이유: 초고온 배지와 셀 상단 라인은 75 가 맞고 색만 50 에서
    // 갈려야 한다. 하나로 묶으면 고온 카드가 파란 배지를 달거나 초고온 표시가 헐거워진다.
    warm: Math.round(capped ?? 0) >= 50,
    // 캡핑 전 원본이 아니라 capped(0~100)를 쓴다 — 색 경계가 0~100 척도 위에 있고,
    // 원본은 −226%나 118% 같은 값이 나와 구간 밖으로 벗어난다.
    color: overheatColor(capped),
    disp: f.display,
    unit: f.displayUnit,
    thDisp: tf ? `${tf.display}${tf.displayUnit}` : null,
    details: ind?.latest?.details ?? null,
    history: ind?.history ?? [],
    historyPoints: ind?.historyPoints ?? [],
    sourceDate: (ind?.latest?.details?.source_date != null
      ? String(ind.latest.details.source_date)
      : ind?.latest?.date) ?? null,
  };
}

/**
 * 자료 기준일을 **항상** 밝히는 배지 — "7/22 기준".
 *
 * 한때 '2영업일 이상 밀렸을 때만 날짜로 바꾸는' 짝(sourceBadge)이 있었는데 걷어냈다.
 * 평소엔 날짜가 안 보여 "이 숫자가 언제 것인지"를 매번 알 수 없었고, 늦지 않은 날엔
 * "당일 기준"이라는 아무 말도 아닌 문구가 남았다. 배지를 다는 카드는 늘 날짜를 적는다.
 *
 * ⚠️ **배지는 아무 카드에나 달지 않는다.** 지표 대부분은 하루 늦게 공표되는 게 정상이라
 * 20장 넘는 카드에 날짜가 깔리면 그게 배경이 돼 아무도 안 본다. 지금 다는 둘은 이유가
 * 있다 — 코스피 신고가 괴리율은 **다른 카드도 적는 코스피 지수**를 적고, 급등 종목 강도는
 * KRX 일별매매정보가 하루이틀 늦게 열린다. 그런 이유가 있을 때만 붙일 것.
 * 투자자예탁금도 공표가 늦지만 배지를 달지 않기로 했다(2026-10-06 운영자 결정 — 다시 달자고 하지 말 것).
 */
export function sourceDateBadge(v: Pick): string | null {
  // source_date 는 20260728(숫자), 행 날짜는 "2026-07-28"(문자열)로 꼴이 달라 둘 다 받는다.
  const s = v.sourceDate?.replace(/-/g, "");
  if (!s || s.length !== 8) return null;
  return `${shortDate(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`)} 기준`;
}

// ── 공용 카드 조각 ────────────────────────────────────────────────
export function Shell({
  slug,
  hit = false,
  warm = false,
  minH = 230,
  children,
}: {
  /**
   * 지표 slug. 셀에 `ind-<slug>` 라는 id 를 달아 **스크롤 목적지**로 만든다.
   * 히어로의 '지표 분포'가 구간별 지표 이름을 목록으로 열고, 그 이름이 여기로 건너온다.
   * slug 가 없으면 id 도 안 붙는다.
   */
  slug?: string;
  hit?: boolean;
  /** 고온 이상(진행률 ≥ 50). 카드에 붙는 보조 배지의 색을 가른다(pick 의 warm 주석). */
  warm?: boolean;
  minH?: number;
  children: React.ReactNode;
}) {
  // 카드는 [제목 행] [본문] [설명] 세 덩어리다. 셀 높이가 274 로 고정돼 있어(시트가
  // 표로 읽히려면 그래야 한다) 내용이 짧은 카드는 늘 남는 높이가 생긴다.
  //
  // 그 남는 높이를 **어디에 줄지가 4슬롯 규칙**이다:
  //   ① 머리   min-height 61 — 제목이 두 줄이어도 아래 슬롯 시작점이 안 밀린다
  //   ② 본문   min-height 140, 위에서부터 쌓되(flex-start) 마지막 자식만 margin-block:auto
  //   ③ 각주   margin-top:auto — 늘 셀 바닥
  // 예전엔 본문을 justifyContent:center 로 가운데 세웠는데, 그러면 카드마다 그래픽이
  // 저마다 다른 높이에서 시작해 25칸이 표로 안 읽혔다. 위에서부터 쌓아야 눈이 가로로
  // 훑을 때 같은 자리에서 같은 종류를 만난다.
  const kids = React.Children.toArray(children);
  const foot = kids.length > 1 ? kids[kids.length - 1] : null;
  // 지표 소개 — 각주(Foot)의 문장을 머리(TitleRow) 이름의 말풍선으로 건넨다. v2 는 각주 칸을 숨겨서(v2.css .hz-cell-foot)
  // 그 문장이 이름 호버로만 남는다(2026-10-06 운영자 지시). 카드 25장이 저마다 넘기지 않고 여기 한 곳에서 잇는다 —
  // 각주와 말풍선이 다른 말을 할 자리가 없다. TitleRow 에 tip 을 직접 준 카드는 그 값을 쓴다.
  const footText = React.isValidElement<{ text?: string }>(foot) && foot.type === Foot ? foot.props.text : undefined;
  const head =
    footText && React.isValidElement<{ tip?: string }>(kids[0]) && kids[0].type === TitleRow && kids[0].props.tip === undefined
      ? React.cloneElement(kids[0], { tip: footText })
      : kids[0];
  const body = kids.slice(1, kids.length - 1);
  return (
    <div
      id={slug ? `ind-${slug}` : undefined}
      // 2026-08 콘솔 리디자인: 카드가 아니라 **시트 안의 셀**이다. 배경·격자선·최소
      // 높이는 globals.css 의 .hz-cards > * 가 준다 — 여기서 인라인으로 주면 초고온
      // 셀의 상단 라인(.hz-cell-hot)을 덮어써 버린다.
      className={hit ? "hz-cell-hot" : undefined}
      style={{
        // 모든 카드의 divider(Foot 등) 가로 위치가 동일하도록 안쪽 여백을 통일한다.
        // 값은 폭에 따라 22 → 18 (globals.css 의 --hz-card-pad).
        padding: "var(--hz-card-pad)",
        display: "flex",
        flexDirection: "column",
        gap: 16,
        position: "relative",
        minHeight: minH,
        // 카드 머리의 아이콘 타일·초고온 칩이 이 두 값을 읽는다. 여기서 한 번만 정하면
        // TitleRow 에 hit 를 따로 넘기지 않아도 카드 25장이 같이 따라온다.
        // 강조색은 **hit(≥75) 이 아니라 warm(≥50)** 에서 갈린다. 카드에 붙는 보조 배지가
        // 이 두 값을 읽으므로 고온 카드의 배지도 빨강이 된다(pick 의 warm 주석 참고).
        ["--card-accent" as string]: warm ? "var(--c-mania)" : "var(--c-blue)",
        ["--card-accent-tint" as string]: warm ? "var(--c-mania-tint)" : "var(--c-blue-tint)",
        /* 알약 **글자**용 변형. --card-accent 를 그대로 얹으면 tint 위 명암비가 저온에서
           3.3(--c-blue #3182f6)이라 배지 안 글자가 안 읽힌다. 강조선·테두리는 원래
           채도를 써야 하므로 색을 하나 더 둔다(팔레트의 --c-*-ink 주석과 같은 규칙). */
        ["--card-accent-ink" as string]: warm ? "var(--c-hot-ink)" : "var(--c-cold-ink)",
      }}
    >
      {hit && <HitBadge />}
      {head}
      {/* ② 그래픽 존. flex:1 로 남는 높이를 받되 내용은 위에서부터 쌓는다.
          마지막 자식에만 margin-block:auto 를 줘, 그래픽이 하나뿐인 카드는 그 하나가
          존 한가운데 서고 여럿인 카드는 위에서부터 줄줄이 선다. */}
      <div className="hz-cell-graphic" style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
        {body}
      </div>
      {foot}
    </div>
  );
}

// 초고온 배지 — 진행률 75(= 카드에 적힌 기준선)를 넘은 지표에 붙는다.
// 예전엔 "🎯 HIT"이었는데, 그 이름이 "기준선에 도달했다"로 읽히는 게 문제였다.
// 실제 판정선은 초고온 진입이고, 서비스의 나머지 언어(저온·상온·고온·초고온)와도
// 어긋나 있었다. 이름을 구간 이름으로 맞춰 배지와 히어로·요약이 한 말을 쓰게 한다.
// 앞에 붙어 있던 🌋 는 뺐다 — 배지가 이미 초고온 색(mania)으로 꽉 찬 알약이라 표식이
// 겹치고, 컬러 이모지라 OS마다 글리프 높이가 달라 배지만 세로로 들쭉날쭉했다.
function HitBadge({ label = "초고온" }: { label?: string }) {
  return (
    // 바깥 span은 '제목 행'과 똑같은 자리를 차지하는 빈 상자다 — top은 Shell의 안쪽 여백
    // (--hz-card-pad. 폭에 따라 24 → 18 이라 배지도 같은 변수를 읽어야 따라 움직인다.
    //  숫자로 박아 두면 좁은 화면에서 배지만 제목보다 6px 아래에 남는다),
    // height는 제목 행의 높이(TitleRow의 아이콘 크기 22 = 그 행에서 가장 큰 요소)와 맞춘다.
    // 그 안에서 배지를 세로 가운데 정렬하면 배지 글자 크기·여백을 바꿔도 제목과 계속 나란하다.
    // (예전엔 배지에 top을 직접 줬는데, 그 값은 테두리 기준이고 제목은 여백 기준이라 서로
    //  어긋났다 — 1칸 카드에서 배지가 제목보다 6px 위에 떠 있었다.)
    <span
      className="hz-hit-badge"
      style={{
        position: "absolute",
        top: "var(--hz-card-pad)",
        right: "var(--hz-card-pad)",
        // 제목 행의 높이 = 아이콘 타일(40)이다. 그 안에서 세로 가운데로 맞추면 배지 글자
        // 크기를 바꿔도 제목과 계속 나란하다.
        height: 40,
        display: "flex",
        alignItems: "center",
      }}
    >
      {/* 목업은 꽉 찬 빨간 알약이 아니라 **옅은 빨강 바탕에 빨간 글자**다. 카드 테두리가
          이미 빨강이라 알약까지 채우면 카드 머리가 경고판처럼 무거워진다. */}
      <span
        style={{
          background: "var(--c-mania-tint)",
          /* tint 위에 C.mania 를 그대로 얹으면 명암비 4.21 이라 배지 글자가 안 읽힌다. */
          color: "var(--c-hot-ink)",
          fontWeight: 600,
          fontSize: "var(--fs-11)",
          lineHeight: 1.2,
          padding: "4px 10px",
          borderRadius: R.pill,
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
    </span>
  );
}

/**
 * 카드 머리 — 카더라 리포트(app/kadera의 SectionHead)와 같은 구조를 쓴다:
 * [아이콘 + 제목] 을 먼저 두고 그 아래 한 줄 설명을 붙인다.
 *
 * 예전엔 따옴표 친 기울임 헤드라인("꼭대기까지 남은 발걸음")이 제목 위에 먼저 왔고
 * 아이콘 색이 과열도에 따라 카드마다 달라 두 페이지가 다른 서비스처럼 보였다.
 * 아이콘은 파랑으로 고정한다 — 과열도는 카드 안의 수치·게이지가 이미 색으로 말한다.
 */
export function TitleRow({
  icon,
  name,
  desc,
  iconSize = 20,
  badge,
  right,
  tip,
}: {
  icon: IconName;
  name: React.ReactNode;
  /** 제목 아래 한 줄 설명. 카드 하단에 자세한 설명이 따로 있으므로 짧게 둔다. */
  desc?: string | null;
  iconSize?: number;
  badge?: string;
  right?: React.ReactNode;
  /** 이름에 마우스를 올리면(폰은 누르면) 뜨는 지표 소개. 보통은 Shell 이 각주 문장을 넣어 준다. */
  tip?: string;
}) {
  const nameEl = (
    <span className="hz-clamp2 hz-cell-name" style={{ fontSize: "var(--fs-13)", fontWeight: 700, color: C.ink, lineHeight: 1.3, letterSpacing: "-.01em", wordBreak: "keep-all" }}>
      {name}
    </span>
  );
  // 말풍선은 이름을 **감싼** 칸에 단다 — 이름 칸(.hz-clamp2)이 두 줄 말줄임이라 overflow:hidden 이어서, 앵커 위치지정이 없는
  // 브라우저에선 그 안의 말풍선이 통째로 잘린다. 감싼 칸은 글자 폭만큼이라 이름 위에서만 열린다.
  // 한 줄로 띄운다(hz-tip-wide 를 안 쓴다 · 2026-10-06 운영자 지시) — 소개 문장이 22~28자라 넓은 화면에선 한 줄에 든다. 폰(560 이하)은 화면 폭에 맞춰 접힌다.
  const title = tip ? (
    <span className="hz-tip hz-tip-start hz-name-tip" data-tip={tip} style={{ display: "flex", minWidth: 0 }}>
      {nameEl}
    </span>
  ) : (
    nameEl
  );
  return (
    // ① 머리 슬롯 — 왼쪽에 아이콘, 오른쪽에 제목/부제.
    //
    // **아이콘 타일(40×40 색 사각)을 걷었다.** 카드가 저마다 떠 있던 시절엔 타일이
    // 카드마다 같은 시작점을 만들어 줬는데, 시트가 되면서 그 일은 격자선이 한다.
    // 셀 25칸에 색 타일이 25개 뜨면 정작 데이터(큰 숫자·막대)보다 타일이 먼저 눈에 든다.
    // 아이콘은 제목을 거드는 표식으로 내려앉는다 — 20px 맨 아이콘, --c-muted.
    //
    // line-height/height 18 + align-items:center 는 **제목 첫 줄 중앙에 광학 정렬**하는
    // 장치다(18 = 제목 13.5 × line-height 1.3). 제목이 두 줄이 되어도 아이콘은 첫 줄
    // 가운데에 그대로 있는다 — flex-start 로만 두면 글리프 상단 여백만큼 위로 뜬다.
    //
    // minHeight 61 이 4슬롯 규칙의 첫 칸이다. 제목이 한 줄인 카드와 두 줄인 카드
    // ("레버리지 ETF·선물 미결제약정 종합 지수")가 섞여 있어서, 이 칸을 안 잡으면
    // 아래 리드아웃(큰 숫자)이 카드마다 다른 높이에서 시작한다 — 시트로 묶어 놓고
    // 정작 가로로 훑을 수가 없다.
    // 우상단 절대배치 배지(HitBadge)와 제목이 겹치지 않게 오른쪽을 62 비우는데, 그건
    // 초고온 셀에서만 필요하다. TitleRow 는 hit 를 안 받으므로(받게 하면 카드 25장에
    // 프롭을 하나씩 더 넘겨야 한다) 셀 클래스로 건다 — globals.css 의 .hz-cell-hot .hz-cell-head.
    <div className="hz-cell-head" style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
      <Icon
        name={icon}
        className="hz-cell-icon"
        style={{
          fontSize: iconSize,
          lineHeight: "18px",
          height: 18,
          display: "flex",
          alignItems: "center",
          color: C.muted,
          flexShrink: 0,
        }}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0, flex: 1 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
            justifyContent: right ? "space-between" : undefined,
          }}
        >
          {title}
          {badge && (
            <span
              className="hz-cell-badge"
              style={{
                fontSize: "var(--fs-11)",
                fontWeight: 600,
                color: C.sub,
                background: C.chip,
                padding: "3px 8px",
                borderRadius: R.pill,
                whiteSpace: "nowrap",
              }}
            >
              {badge}
            </span>
          )}
          {right && <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>{right}</div>}
        </div>
        {desc && (
          <p className="hz-clamp2 hz-cell-desc" style={{ margin: 0, fontSize: "var(--fs-12)", lineHeight: 1.45, color: C.sub2, wordBreak: "keep-all" }}>{desc}</p>
        )}
      </div>
    </div>
  );
}

export function Big({
  disp,
  unit,
  color,
  size = 40,
  sub,
}: {
  disp: string;
  unit?: string;
  color: string;
  size?: number;
  sub?: React.ReactNode;
}) {
  return (
    // flexWrap — 좁은 카드에서 sub("최근 -20.3조")를 숫자 옆에 억지로 끼우지 않고 아랫줄로
    // 내린다. 예전엔 nowrap 이라 sub 가 자리를 차지한 채 숫자 쪽만 눌렸다.
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, rowGap: 4, flexWrap: "wrap" }}>
      <span
        className="hz-big"
        style={{
          fontFamily: MONO,
          fontSize: size,
          fontWeight: 700,
          color,
          lineHeight: 1,
          letterSpacing: "-0.03em",
          // 수치와 단위는 한 덩어리다 — 끊기면 "104.3조/원" 처럼 단위가 두 줄로 쪼개진다.
          // 768px(사이드바 + 2열)에서 카드 안이 176px 뿐이라 투자자예탁금이 실제로 그랬다.
          whiteSpace: "nowrap",
        }}
      >
        {disp}
        {unit && <span className="hz-big-unit" style={{ fontSize: size * 0.5 }}>{unit}</span>}
      </span>
      {/* 곁말은 목업에서 **강조색이 아니라 회색**이다(12.5 / --c-sub2). 큰 수치와 같은
          색이면 둘이 한 덩어리로 읽혀 어느 쪽이 결론인지 흐려진다. */}
      {sub && <span className="hz-big-sub" style={{ fontSize: "var(--fs-12)", fontWeight: 500, color: C.sub2, whiteSpace: "nowrap" }}>{sub}</span>}
    </div>
  );
}

export function Foot({ text, color = C.sub }: { text: string; color?: string }) {
  return (
    // ④ 각주 슬롯 — 늘 셀 바닥이다. 위 그래픽 존이 flex:1 이라 대개 여기까지 밀려
    // 내려오지만, 그래픽이 140 을 넘겨 존이 늘어난 셀에서는 marginTop:auto 가 있어야
    // 각주가 바닥에 붙는다. 25칸의 각주 밑선이 한 줄로 맞아야 시트가 표로 읽힌다.
    <div className="hz-cell-foot" style={{ marginTop: "auto" }}>
      <p
        style={{
          margin: 0,
          paddingTop: 14,
          fontSize: "var(--fs-12)",
          color,
          /* 500 → 400. 카더라·MDD 의 같은 자리(시트 각주)가 400 이다. 세 페이지에서
             한 문장만 굵기가 달라 보이면 그 자리가 더 중요한 말처럼 읽힌다. */
          fontWeight: 400,
          /* 윗선도 같은 이유로 카더라를 따른다 — 거긴 처음부터 --c-sheet-row 였는데
             이쪽만 한 톤 옅은 --c-divider 라 같은 각주선이 화면마다 다르게 보였다. */
          borderTop: `1px solid ${C.hairline}`,
          lineHeight: 1.65,
          textWrap: "pretty",
        }}
      >
        {text}
      </p>
    </div>
  );
}

// 과열도 진행 바 (세부 데이터가 없는 카드의 공용 시각화).
/**
 * 과열도 진행 바. hideThreshold 를 주면 맨 아래 "초고온 기준선 …" 줄을 뺀다.
 *
 * 상승 속도 카드가 그렇다 — 그 카드는 이미 "60거래일 전 X → 지금 Y"로 값의 뜻을
 * 다 말해 놓고, 그 아래 다시 기준선 퍼센트를 적으면 같은 축의 숫자가 셋이 된다.
 */
/**
 * 0~100 막대의 채움. **그 값의 과열도 색 한 가지로 평평하게** 칠하고, 채움 끝에 노브를 세운다.
 *
 * 그라데이션도 써 봤는데 걷었다(2026-08-03) — 막대 하나 안에 네 구간 색이 다 들어가면
 * "지금 어느 구간인가"가 흐려지고, 카드마다 끝 색이 달라 화면이 시끄러웠다.
 * 한 색이면 큰 수치·배지와 같은 값을 가리킨다.
 *
 * 노브는 막대형 지표 전부가 같은 모양을 쓴다(초보 검색량·코인·레버리지·금 대비…).
 * 트랙에 overflow:hidden 이 걸려 있어 노브를 그 안에 두면 잘린다 — 바깥 상자를 하나 더
 * 두고 노브는 거기에 얹는다.
 */
const KNOB_W = 14;

export function HeatKnob({ left, color }: { left: number; color: string }) {
  return (
    <span
      style={{
        position: "absolute",
        // 양끝에서 노브가 트랙 밖으로 삐져나오지 않게 반 폭만큼 안으로 물린다.
        // 과열도 0·100 인 날에만 걸리는 자리라 눈으로는 못 잡는다 — clamp 로 못박는다.
        left: `clamp(${KNOB_W / 2}px, ${left}%, calc(100% - ${KNOB_W / 2}px))`,
        top: -4,
        transform: "translateX(-50%)",
        width: KNOB_W,
        height: 18,
        borderRadius: 6,
        background: C.card,
        border: `3px solid ${color}`,
        boxSizing: "border-box",
      }}
    />
  );
}

export function HeatFill({ pct, height = 10 }: { pct: number; height?: number }) {
  const w = Math.max(0, Math.min(100, pct));
  const c = overheatColor(w);
  return (
    <div style={{ position: "relative", height }}>
      <div style={{ height: "100%", borderRadius: R.pill, background: C.track, overflow: "hidden" }}>
        <div style={{ width: `${w}%`, height: "100%", borderRadius: R.pill, background: c }} />
      </div>
      <HeatKnob left={w} color={c} />
    </div>
  );
}

export function HeatBar({ v }: { v: Pick }) {
  if (v.capped === null) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: "var(--fs-11)", fontWeight: 500, color: C.muted }}>과열도</span>
        <span style={{ fontFamily: MONO, fontSize: "var(--fs-12)", fontWeight: 600, color: v.color }}>
          {Math.round(v.capped)}
          <span style={{ color: C.sub, fontWeight: 500 }}>/100</span>
        </span>
      </div>
      <HeatFill pct={v.capped} />
      <HeatScale />
    </div>
  );
}

/** 과열도 막대 양 끝 글자. 레버리지 · 코인 · 일반 카드가 같은 두 말(안심 · 과열)을 쓴다(2026-10-04 점검 — '과열 100' · 눈금 없음이 섞였다). */
export function HeatScale() {
  return (
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <span style={{ fontSize: "var(--fs-11)", color: C.sub }}>안심</span>
      <span style={{ fontSize: "var(--fs-11)", color: C.sub }}>과열</span>
    </div>
  );
}

/* ⛔ 초고온 기준 알약('1.83배부터 초고온' · '6.00%부터 초고온')과 그걸 큰 숫자 옆에 세우던 BigWithHot 은 걷었다(2026-10-05 운영자 판단 —
   초고온이 언제부터인지 말해 주는 글은 빼고 큰 숫자 · 막대 색이 말하게). 금 대비 코스피 · 경제 베스트셀러 · 깃헙 거래봇 세 카드에만 섰다.
   파이프라인의 details.hot_threshold 는 그대로 남아 있다(배지 판정은 진행률 75). */

/**
 * 근거 두 칸 — 레버리지 · 코인 · 실물–증시 괴리가 큰 숫자 아래 근거 둘을 나란히 둔다.
 * 회색 타일 둘이었는데(v2, 2026-10-03) 위 가는 선 하나 · 가운데 세로선 하나로 나눈 두 칸으로 바꿨다 —
 * 칸 안에 칸을 또 띄우면 시트 격자 위에 상자가 한 겹 더 앉는다(MDD · 배당에서 걷은 것과 같다). 꼴은 v2.css .hz-split.
 */
export function SplitStats({
  items,
}: {
  items: { label: React.ReactNode; value: React.ReactNode; color?: string; sub?: React.ReactNode; tip?: string }[];
}) {
  return (
    <div className="hz-split">
      {items.map((it, i) => (
        <div key={i} className="hz-split-cell">
          {/* 툴팁이 있는 이름은 점선 밑줄로 표시한다 — 물음표 아이콘을 칸마다 달면 한 칸에 같은 아이콘이 둘 선다. */}
          <span className={it.tip ? "hz-split-k hz-tip hz-tip-wide hz-tip-start is-tip" : "hz-split-k"} data-tip={it.tip}>
            {it.label}
          </span>
          <strong className="hz-split-v" style={it.color ? { color: it.color } : undefined}>
            {it.value}
          </strong>
          {it.sub && <span className="hz-split-sub">{it.sub}</span>}
        </div>
      ))}
    </div>
  );
}

// ── 히어로 ────────────────────────────────────────────────────────
// 온도 표식은 컬러 이모지(❄️🌡️🔥🌋) 대신 Material Symbols 글리프를 쓴다. 은유는 그대로인데
// 이모지는 (1) OS 이모지 서체로 떨어져 사이트 서체와 갈리고, (2) 색을 못 물려받아 구간 색과
// 따로 놀고, (3) 글리프 높이가 제각각이라 알약 높이가 저 혼자 달라졌다.
// tint 는 반드시 변수로 둔다. `${stage.color}24` 처럼 알파를 이어붙이면 "var(--c-hot)24" 가
// 되어 CSS 가 통째로 버린다 — 실제로 히어로의 구간 알약이 배경 없이 글자만 떠 있었다.
export const STAGE_META: Record<string, { icon: IconName; color: string; tint: string; zone: string }> = {
  저온: { icon: "ac_unit", color: C.cold, tint: "var(--c-cold-tint)", zone: "저온 구간" },
  상온: { icon: "sunny", color: C.neutral, tint: "var(--c-neutral-tint)", zone: "상온 구간" },
  고온: { icon: "local_fire_department", color: C.hot, tint: "var(--c-hot-tint)", zone: "고온 구간" },
  초고온: { icon: "whatshot", color: C.mania, tint: "var(--c-mania-tint)", zone: "초고온 구간" },
};

// LLM 요약 문장을 서식 있는 노드로 렌더한다.
//  - **...** → 굵게(중요 부분: 지표 이름·핵심 수치 등)
//  - 온도 단어(저온/상온/고온/초고온) → 해당 구간 색으로 굵게 (STAGE_META 색 재사용)
// 서식이 아닌 부분은 그대로 텍스트로 둔다(짝 안 맞는 별표는 글자로 노출).
export function renderRichSummary(text: string): React.ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, pi) => {
    const bold = /^\*\*[^*]+\*\*$/.test(part);
    const content = bold ? part.slice(2, -2) : part;
    return content.split(/(저온|상온|고온|초고온)/g).map((seg, si) => {
      const tempColor = STAGE_META[seg]?.color;
      if (tempColor) {
        return (
          <b key={`${pi}-${si}`} style={{ color: tempColor, fontWeight: 600 }}>
            {seg}
          </b>
        );
      }
      if (bold) {
        return (
          <b key={`${pi}-${si}`} style={{ color: C.ink }}>
            {seg}
          </b>
        );
      }
      return seg;
    });
  });
}

/**
 * 카드 안에 들어가는 작은 면적 차트. 상승 속도·환율 변동성이 함께 쓴다.
 *
 * 목업의 다른 그래픽과 같은 어법으로 맞췄다 — 격자·축 없이 면적 한 덩어리, 색은 파랑,
 * 기준선만 실선 하나. 값 라벨은 카드가 이미 큰 수치로 말하므로 차트에 안 적는다.
 *
 * baseline="zero" 면 0을 세로 한가운데 두고 위/아래를 다른 색으로 칠한다(같은 −5%라도
 * 곧게 빠진 것과 크게 올랐다 무너진 것이 면적으로 갈린다). "min" 이면 최솟값이 바닥이다.
 *
 * ⚠️ preserveAspectRatio="none" 이라 획이 가로로 늘어난다. 모든 stroke 에
 * vectorEffect="non-scaling-stroke" 를 걸어야 지정한 두께로 그려진다.
 */
export function AreaChart({
  points,
  baseline = "min",
  height: H = 72,
  color = "var(--c-blue)",
  tip,
}: {
  points: { key: string; value: number }[];
  baseline?: "zero" | "min";
  height?: number;
  color?: string;
  tip?: (p: { key: string; value: number }) => string;
}) {
  if (points.length < 2) return null;
  const vals = points.map((p) => p.value);
  const hi = Math.max(...vals, baseline === "zero" ? 0 : -Infinity);
  const lo = Math.min(...vals, baseline === "zero" ? 0 : Infinity);
  // zero 기준일 땐 0이 한가운데 오도록 위아래를 같은 폭으로 잡는다.
  const span = baseline === "zero" ? Math.max(Math.abs(hi), Math.abs(lo), 1) * 1.12 : (hi - lo) || 1;
  const y = (t: number) =>
    baseline === "zero" ? H / 2 - (t / span) * (H / 2) : H - 4 - ((t - lo) / span) * (H - 8);
  const base = baseline === "zero" ? H / 2 : H;
  const line = points.map((p, i) => `${(i / (points.length - 1)) * 100},${y(p.value)}`).join(" ");
  // 그라데이션 id — 카드마다 달라야 한다(아래 주석: id 는 문서 전역이라 같은 이름이면 먼저 그린 색으로 다 칠해진다).
  // 색·첫 날짜·점 수·높이로 짓는다. 같은 차트가 두 번 그려질 때만 같은 이름이 되고, 그땐 모양도 같다.
  let hsh = 0;
  for (const ch of `${color}|${points[0].key}|${points.length}|${H}`) hsh = (hsh * 31 + ch.charCodeAt(0)) >>> 0;
  const gid = `hz-area-${hsh.toString(36)}`;
  return (
    <div className="hz-area" style={{ position: "relative", height: H }}>
      <svg viewBox={`0 0 100 ${H}`} style={{ width: "100%", height: H, display: "block" }} preserveAspectRatio="none">
        {/* shadcn 영역 차트 꼴(2026-09-27, MDD 언더워터와 같은 방식) — 선은 1px, 면은 선 쪽이 진하고 바닥으로 옅어지는 그라데이션.
            SVG 그라데이션은 id 가 문서 전역이라 카드마다 색이 다르면 서로 덮어쓴다 — 그래서 한때 반투명 한 겹이었고,
            지금은 카드마다 다른 id(gid)를 짓는다. */}
        {baseline === "zero" && (
          <defs>
            <clipPath id="hz-clip-up"><rect x="0" y="0" width="100" height={H / 2} /></clipPath>
            <clipPath id="hz-clip-dn"><rect x="0" y={H / 2} width="100" height={H / 2} /></clipPath>
          </defs>
        )}
        {baseline === "zero" ? (
          <>
            <polygon points={`0,${base} ${line} 100,${base}`} fill="var(--c-hot)" opacity={0.2} clipPath="url(#hz-clip-up)" />
            <polygon points={`0,${base} ${line} 100,${base}`} fill="var(--c-blue)" opacity={0.2} clipPath="url(#hz-clip-dn)" />
            <line x1="0" y1={H / 2} x2="100" y2={H / 2} stroke="var(--c-line)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          </>
        ) : (
          <>
            <defs>
              <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.32} />
                <stop offset="100%" stopColor={color} stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <polygon points={`0,${base} ${line} 100,${base}`} fill={`url(#${gid})`} />
          </>
        )}
        <polyline points={line} fill="none" stroke={color} strokeWidth={1} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {/* 호버 크로스헤어 — MDD 낙폭 차트와 같은 어법. 끝쪽 지점은 툴팁이 카드 밖으로
          넘치지 않게 여는 방향을 튼다(안 그러면 가로 스크롤이 생긴다). */}
      {tip && (
        <div style={{ position: "absolute", inset: 0, display: "flex" }}>
          {points.map((pt, i) => {
            const at = i / (points.length - 1);
            const edge = at < 0.25 ? " hz-tip-start" : at > 0.75 ? " hz-tip-end" : "";
            // 칸은 n 등분인데 점은 0~100% 를 n−1 등분한 자리에 있다. 칸 안에서 점의 가로 자리는 칸 폭의 i/(n−1) 이다
            // (첫 칸은 왼쪽 끝, 마지막 칸은 오른쪽 끝). 선(::before)과 호버 점을 그 자리에 세운다 — 예전엔 선이 칸 가운데라
            // 점과 반 칸쯤 어긋났다.
            const x = `${at * 100}%`;
            const dot = baseline === "zero" ? (pt.value >= 0 ? "var(--c-hot)" : "var(--c-blue)") : color;
            return (
              <div
                key={pt.key}
                className={`hz-tip hz-vline${edge}`}
                data-tip={tip(pt)}
                style={{ flex: 1, position: "relative", ["--hz-x" as string]: x }}
              >
                <span className="hz-vdot" style={{ top: `${(y(pt.value) / H) * 100}%`, background: dot }} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const fmtJo = (v: number) => `${v.toFixed(1)}조`;

// 1년 흐름 차트 — 지금 값(면 + 실선) 위에 그날그날의 기준값(점선)을 겹친다. 둘이 벌어진 만큼이 카드의 큰 숫자다.
// 투자자예탁금(기준 = 1년 평소) · 신용융자 잔고(기준 = 한 달 전 잔고) · 기업 체감 경기(기준 = 1년 전 같은 달)가 같이 쓴다.
// 값과 날짜 글자는 카드가 정한다(fmt · dateFmt). 기본은 일별 '조' 단위다.
export function RefChart({
  dates,
  main,
  base,
  baseLabel,
  color,
  fmt = fmtJo,
  dateFmt = shortDate,
  minH = 88,
}: {
  dates: string[];
  main: number[];
  base: number[];
  /** 그림의 최소 키 — 감성 둘째 줄(키 225)에 서는 칸은 64 로 줄인다(그 줄 키를 그대로 두려고). */
  minH?: number;
  /** 툴팁에서 기준값 앞에 붙는 말 — '평소' · '한 달 전'. */
  baseLabel: string;
  color: string;
  fmt?: (v: number) => string;
  /** 툴팁의 날짜 글자. 지난해 점엔 앞에 'YY년 '을 붙인다(아래). */
  dateFmt?: (d: string) => string;
}) {
  const n = dates.length;
  const all = [...main, ...base];
  const hi = Math.max(...all);
  const lo = Math.min(...all);
  const pad = (hi - lo) * 0.1 || 1;
  // 세로는 0~100(%) 좌표다. SVG 를 칸 크기대로 늘리므로(preserveAspectRatio none) 점·끝점은 HTML 로 얹는다 — SVG 원은 찌그러진다.
  const y = (v: number) => ((hi + pad - v) / (hi - lo + 2 * pad)) * 100;
  const x = (i: number) => (i / (n - 1)) * 100;
  const pts = (arr: number[]) => arr.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  let hsh = 0;
  for (const ch of `${color}|${baseLabel}|${dates[0]}|${n}`) hsh = (hsh * 31 + ch.charCodeAt(0)) >>> 0;
  const gid = `hz-ref-${hsh.toString(36)}`;
  return (
    <div style={{ position: "relative", flex: 1, minHeight: minH }}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.28} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <polygon points={`0,100 ${pts(main)} 100,100`} fill={`url(#${gid})`} />
        <polyline points={pts(base)} fill="none" stroke={C.muted} strokeWidth={1.25} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
        <polyline points={pts(main)} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {/* 끝점 — 큰 숫자가 말하는 그날이다. */}
      <span
        aria-hidden
        style={{
          position: "absolute",
          left: "100%",
          top: `${y(main[n - 1])}%`,
          width: 7,
          height: 7,
          borderRadius: R.pill,
          background: color,
          boxShadow: `0 0 0 2px ${C.card}`,
          transform: "translate(-50%, -50%)",
        }}
      />
      {/* 호버 — 공용 영역 차트(AreaChart)와 같은 어법. 끝쪽은 툴팁이 칸 밖으로 안 나가게 여는 방향을 튼다. */}
      <div style={{ position: "absolute", inset: 0, display: "flex" }}>
        {dates.map((d, i) => {
          const at = i / (n - 1);
          const edge = at < 0.25 ? " hz-tip-start" : at > 0.75 ? " hz-tip-end" : "";
          return (
            <div
              key={d}
              className={`hz-tip hz-vline${edge}`}
              // 1년 차트라 첫 며칠은 끝 며칠과 월·일이 겹친다(9/26 이 둘 · 기업 전망은 10월이 둘) — 지난해 점엔 해를 붙인다.
              data-tip={`${d.slice(0, 4) !== dates[n - 1].slice(0, 4) ? `${d.slice(2, 4)}년 ` : ""}${dateFmt(d)} · ${fmt(main[i])} · ${baseLabel} ${fmt(base[i])}`}
              style={{ flex: 1, position: "relative", ["--hz-x" as string]: `${at * 100}%` }}
            >
              <span className="hz-vdot" style={{ top: `${y(main[i])}%`, background: color }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// 차트 아래 두 줄 — 차트의 범례이자 오늘 값이다. 선 모양 견본을 앞에 둬 범례 줄을 따로 두지 않는다.
export function RefRows({
  color,
  rows,
  fmt = fmtJo,
}: {
  color: string;
  rows: { label: string; value: number | null; dashed: boolean }[];
  fmt?: (v: number) => string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {rows.map((r) => (
        <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <svg width={14} height={6} aria-hidden style={{ flexShrink: 0 }}>
            <line
              x1={0}
              y1={3}
              x2={14}
              y2={3}
              stroke={r.dashed ? C.muted : color}
              strokeWidth={r.dashed ? 1.25 : 2}
              strokeDasharray={r.dashed ? "4 3" : undefined}
            />
          </svg>
          <span style={{ flex: 1, fontSize: "var(--fs-12)", fontWeight: 500, color: C.sub2 }}>{r.label}</span>
          <span style={{ fontFamily: MONO, fontSize: "var(--fs-12)", fontWeight: 600, color: r.dashed ? C.label : C.ink }}>
            {r.value !== null ? fmt(r.value) : "-"}
          </span>
        </div>
      ))}
    </div>
  );
}

/* emphasizedHeights(값들을 floorPct~100 으로 다시 편 높이) 는 여기 있었다.
   붙어 있는 값들(100 대 107)의 차이를 세로 막대 높이로 보이게 하려고 축을 늘리는
   함수였는데, 아시아 상대강도가 **가로 막대 + 기준선**으로 바뀌면서 쓸 곳이 없어졌다.
   가로축은 세로보다 3배 길어서 축을 왜곡하지 않아도 차이가 보인다 — 왜곡을 안 하는
   편이 낫다(늘린 축은 "일본이 한국의 1.5배"처럼 읽힌다). */

export function GenericCard({ v, icon }: { v: Pick; icon: IconName }) {
  return (
    <Shell slug={v.ind?.slug} hit={v.isHit} warm={v.warm} minH={210}>
      <TitleRow desc={v.headline} icon={icon} name={v.name} />
      <Big disp={v.disp} unit={v.unit} color={v.color} size={30} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
        <HeatBar v={v} />
      </div>
      <Foot text={v.desc} />
    </Shell>
  );
}
