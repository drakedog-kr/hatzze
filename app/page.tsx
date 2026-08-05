import React from "react";

import { getKospiCloseSeries, getLatestDailyScore, getPublicIndicators, getTopStockHighGaps } from "@/lib/data";
import type { ClosePoint, DailyScore, IndicatorCategory, IndicatorWithLatestValue, StockHighGap } from "@/lib/data";
import { compareLabel, formatEokMixed, formatIndicatorValue, formatKstUpdate, sentimentTone, shortDate } from "@/lib/format";
import { AiMark, BLUE_SCALE, C, Icon, MONO, R, stageForScore } from "./ui";

// 지표는 하루 단위(GitHub Actions 배치)로 갱신되므로, 빌드 시점에 정적으로
// 굳어버리지 않도록 매 요청마다 서버에서 새로 조회한다.
export const dynamic = "force-dynamic";

/**
 * 과열도(0~100) → 색. **화면 전체가 이 함수 하나만 쓴다.**
 *
 * 경계(25·50·75)는 히어로의 저온·상온·고온·초고온과 같다. 예전엔 큰 수치용 heatColor
 * (경계 33·70·100)가 따로 있어서 한 카드 안에서 색이 갈렸다 — 코스닥 과열도 79.7이
 * 숫자는 '고온'(주황), 바로 밑 게이지는 '초고온'(빨강)으로 칠해지는 식이었다.
 * 같은 값에 두 이름을 붙일 이유가 없어 하나로 합쳤다.
 */
function overheatColor(pct: number | null): string {
  if (pct === null) return C.sub;
  if (pct >= 75) return C.mania;
  if (pct >= 50) return C.hot;
  if (pct >= 25) return C.neutral;
  return C.cold;
}


// ── 지표 데이터 픽 ────────────────────────────────────────────────
type Ind = IndicatorWithLatestValue;

type Pick = {
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
  /** 카드에 "기준선"으로 적는 값 = 초고온 진입선. 이걸 넘으면 배지가 켜진다. */
  hotDisp: string | null;
  dirLabel: string;
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

function pick(ind: Ind | undefined): Pick {
  const raw = ind?.latest?.raw_value ?? null;
  const score = ind?.latest?.normalized_score ?? null;
  const capped = score === null ? null : Math.min(Math.max(score, 0), 100);
  const threshold = ind?.latest?.threshold ?? null;
  // 카드에 "기준선"으로 적는 값은 진행률 100 지점이 아니라 **초고온 진입선**(진행률 75)이다.
  // 파이프라인이 details.hot_threshold에 넣어준다(calculate_score.raw_at_progress).
  // 이 값을 넘는 순간 초고온 배지가 켜지므로 표시와 판정이 같은 지점을 가리킨다.
  //
  // 없으면 threshold로 폴백하지 **않는다** — 그게 정확히 고치려던 그 문제이기 때문이다.
  // (threshold는 진행률 100 지점이라, 그걸 기준선이라 적으면 "기준선에 못 미쳤는데
  //  초고온" 표시가 그대로 남는다.) 새 코드로 파이프라인이 한 번 돌기 전까지는
  //  기준선 줄을 아예 숨겨서 틀린 숫자를 보여주지 않는다.
  const hotThreshold = ind?.latest?.details?.hot_threshold ?? null;
  const unit = ind?.unit ?? "";
  const f =
    raw !== null
      ? formatIndicatorValue(raw, unit)
      : { display: "-", displayUnit: unit };
  const tf = threshold !== null ? formatIndicatorValue(threshold, unit) : null;
  const hf = hotThreshold !== null ? formatIndicatorValue(hotThreshold, unit) : null;
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
    // (youtube는 surge_map으로 평균 대비 급증을 매핑) 예외 없이 동일 기준이고,
    // 이 지점이 곧 카드에 적히는 기준선(hotDisp)이다.
    isHit: (capped ?? 0) >= 75,
    // 고온 이상(진행률 ≥ 50). 카드에 붙는 보조 배지의 색을 가르는 값이다 — 배지가 늘
    // 파랑이면 "콜 우세"(= 지금 뜨겁다)가 차분한 색으로 떠서 큰 수치와 반대말을 한다.
    // isHit(≥75)과 따로 두는 이유: 초고온 배지와 셀 상단 라인은 75 가 맞고 색만 50 에서
    // 갈려야 한다. 하나로 묶으면 고온 카드가 파란 배지를 달거나 초고온 표시가 헐거워진다.
    warm: (capped ?? 0) >= 50,
    // 캡핑 전 원본이 아니라 capped(0~100)를 쓴다 — 색 경계가 0~100 척도 위에 있고,
    // 원본은 −226%나 118% 같은 값이 나와 구간 밖으로 벗어난다.
    color: overheatColor(capped),
    disp: f.display,
    unit: f.displayUnit,
    thDisp: tf ? `${tf.display}${tf.displayUnit}` : null,
    hotDisp: hf ? `${hf.display}${hf.displayUnit}` : null,
    dirLabel: ind?.direction === "low" ? "이하" : "이상",
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
 * 있다 — 코스피 신고가 괴리율은 **다른 카드도 적는 코스피 지수**를 적고, 투자자예탁금은
 * 공표가 이틀까지 밀린다. 그 둘 중 하나에 해당할 때만 붙일 것.
 */
function sourceDateBadge(v: Pick): string | null {
  // source_date 는 20260728(숫자), 행 날짜는 "2026-07-28"(문자열)로 꼴이 달라 둘 다 받는다.
  const s = v.sourceDate?.replace(/-/g, "");
  if (!s || s.length !== 8) return null;
  return `${shortDate(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`)} 기준`;
}

// ── 공용 카드 조각 ────────────────────────────────────────────────
function Shell({
  slug,
  hit = false,
  warm = false,
  minH = 230,
  children,
}: {
  /**
   * 지표 slug. 셀에 `ind-<slug>` 라는 id 를 달아 **스크롤 목적지**로 만든다.
   * 히어로의 '지표 분포'가 구간별 지표 이름을 목록으로 열고, 그 이름이 여기로 건너온다.
   * 값이 없는 셀('준비 중')은 목적지가 될 일이 없으므로 id 도 안 붙는다.
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
  const head = kids[0];
  const foot = kids.length > 1 ? kids[kids.length - 1] : null;
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
      <div className="hz-cell-graphic" style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16, minHeight: 140 }}>
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
          fontWeight: 800,
          fontSize: 11,
          lineHeight: 1.2,
          padding: "5px 10px",
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
function TitleRow({
  icon,
  name,
  desc,
  iconSize = 20,
  badge,
  right,
}: {
  icon: string;
  name: React.ReactNode;
  /** 제목 아래 한 줄 설명. 카드 하단에 자세한 설명이 따로 있으므로 짧게 둔다. */
  desc?: string | null;
  iconSize?: number;
  badge?: string;
  right?: React.ReactNode;
}) {
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
          <span className="hz-clamp2" style={{ fontSize: 13.5, fontWeight: 800, color: C.ink, lineHeight: 1.3, letterSpacing: "-.01em", wordBreak: "keep-all" }}>
            {name}
          </span>
          {badge && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
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
          <p className="hz-clamp2" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.45, color: C.sub2, wordBreak: "keep-all" }}>{desc}</p>
        )}
      </div>
    </div>
  );
}

function Big({
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
        style={{
          fontFamily: MONO,
          fontSize: size,
          fontWeight: 800,
          color,
          lineHeight: 1,
          letterSpacing: "-0.03em",
          // 수치와 단위는 한 덩어리다 — 끊기면 "104.3조/원" 처럼 단위가 두 줄로 쪼개진다.
          // 768px(사이드바 + 2열)에서 카드 안이 176px 뿐이라 투자자예탁금이 실제로 그랬다.
          whiteSpace: "nowrap",
        }}
      >
        {disp}
        {unit && <span style={{ fontSize: size * 0.5 }}>{unit}</span>}
      </span>
      {/* 곁말은 목업에서 **강조색이 아니라 회색**이다(12.5 / --c-sub2). 큰 수치와 같은
          색이면 둘이 한 덩어리로 읽혀 어느 쪽이 결론인지 흐려진다. */}
      {sub && <span style={{ fontSize: 12.5, fontWeight: 600, color: C.sub2, whiteSpace: "nowrap" }}>{sub}</span>}
    </div>
  );
}

function Foot({ text, color = C.sub }: { text: string; color?: string }) {
  return (
    // ④ 각주 슬롯 — 늘 셀 바닥이다. 위 그래픽 존이 flex:1 이라 대개 여기까지 밀려
    // 내려오지만, 그래픽이 140 을 넘겨 존이 늘어난 셀에서는 marginTop:auto 가 있어야
    // 각주가 바닥에 붙는다. 25칸의 각주 밑선이 한 줄로 맞아야 시트가 표로 읽힌다.
    <div style={{ marginTop: "auto" }}>
      <p
        style={{
          margin: 0,
          paddingTop: 14,
          fontSize: 12,
          color,
          /* 500 → 400. 카더라·MDD 의 같은 자리(시트 각주)가 400 이다. 세 페이지에서
             한 문장만 굵기가 달라 보이면 그 자리가 더 중요한 말처럼 읽힌다. */
          fontWeight: 400,
          borderTop: `1px solid ${C.divider}`,
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

function HeatKnob({ left, color }: { left: number; color: string }) {
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

function HeatFill({ pct, height = 10 }: { pct: number; height?: number }) {
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

function HeatBar({ v, hideThreshold = false }: { v: Pick; hideThreshold?: boolean }) {
  if (v.capped === null) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: C.muted }}>과열도</span>
        <span style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 800, color: v.color }}>
          {Math.round(v.capped)}
          <span style={{ color: C.sub, fontWeight: 600 }}>/100</span>
        </span>
      </div>
      <HeatFill pct={v.capped} />
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: 11, color: C.sub }}>안심</span>
        <span style={{ fontSize: 11, color: C.sub }}>과열 100</span>
      </div>
      {v.hotDisp && !hideThreshold && (
        <span style={{ fontSize: 11.5, fontWeight: 600, color: C.sub2, background: C.soft, borderRadius: R.control, padding: "8px 10px" }}>
          초고온 기준선 {v.hotDisp} {v.dirLabel}
        </span>
      )}
    </div>
  );
}

// ── 히어로 ────────────────────────────────────────────────────────
// 온도 표식은 컬러 이모지(❄️🌡️🔥🌋) 대신 Material Symbols 글리프를 쓴다. 은유는 그대로인데
// 이모지는 (1) OS 이모지 서체로 떨어져 사이트 서체와 갈리고, (2) 색을 못 물려받아 구간 색과
// 따로 놀고, (3) 글리프 높이가 제각각이라 알약 높이가 저 혼자 달라졌다.
// tint 는 반드시 변수로 둔다. `${stage.color}24` 처럼 알파를 이어붙이면 "var(--c-hot)24" 가
// 되어 CSS 가 통째로 버린다 — 실제로 히어로의 구간 알약이 배경 없이 글자만 떠 있었다.
const STAGE_META: Record<string, { icon: string; color: string; tint: string; zone: string }> = {
  저온: { icon: "ac_unit", color: C.cold, tint: "var(--c-cold-tint)", zone: "저온 구간" },
  상온: { icon: "sunny", color: C.neutral, tint: "var(--c-neutral-tint)", zone: "상온 구간" },
  고온: { icon: "local_fire_department", color: C.hot, tint: "var(--c-hot-tint)", zone: "고온 구간" },
  초고온: { icon: "whatshot", color: C.mania, tint: "var(--c-mania-tint)", zone: "초고온 구간" },
};

// LLM 요약 문장을 서식 있는 노드로 렌더한다.
//  - **...** → 굵게(중요 부분: 지표 이름·핵심 수치 등)
//  - 온도 단어(저온/상온/고온/초고온) → 해당 구간 색으로 굵게 (STAGE_META 색 재사용)
// 서식이 아닌 부분은 그대로 텍스트로 둔다(짝 안 맞는 별표는 글자로 노출).
function renderRichSummary(text: string): React.ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, pi) => {
    const bold = /^\*\*[^*]+\*\*$/.test(part);
    const content = bold ? part.slice(2, -2) : part;
    return content.split(/(저온|상온|고온|초고온)/g).map((seg, si) => {
      const tempColor = STAGE_META[seg]?.color;
      if (tempColor) {
        return (
          <b key={`${pi}-${si}`} style={{ color: tempColor, fontWeight: 700 }}>
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
const DIST_FILL = [
  "var(--c-dist-cold)",
  "var(--c-dist-neutral)",
  "var(--c-dist-hot)",
  "var(--c-dist-mania)",
];
const BAND_LABELS = ["저온", "상온", "고온", "초고온"];

/** 지표 분포 팝오버의 한 줄. heat 는 카드가 쓰는 것과 같은 과열도(capped 0~100)다. */
type BandItem = { slug: string; name: string; heat: number };

/**
 * '지표 분포' 목록의 이름을 눌렀을 때 실제로 갈 셀.
 *
 * 보통은 지표 slug 가 그대로 셀 id(`ind-<slug>`)지만, **한 셀에 지표가 둘인 카드**가
 * 하나 있다(여윳돈이 향하는 곳 = 명품 + 오마카세). 그 셀엔 명품 id 만 달려 있으므로
 * 오마카세는 여기서 돌려보낸다. 이 표에 없는 slug 는 자기 id 를 그대로 쓴다.
 */
const ANCHOR_ALIAS: Record<string, string> = {
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


function Hero({
  dailyScore,
  tradHits,
  socialHits,
  bandCounts,
  bandTotal,
}: {
  dailyScore: DailyScore;
  tradHits: number;
  socialHits: number;
  /** 저온·상온·고온·초고온 순서 고정. 색까지 같이 넘겨 셀 안에서 인덱스로 안 찾게 한다. */
  bandCounts: { label: string; count: number; fill: string; items: BandItem[] }[];
  /** 위 넷의 합. 25가 아니라 **오늘 값이 들어온 지표 수**다(자료가 늦는 날 24가 된다). */
  bandTotal: number;
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
  const deltaColor = delta === null || delta === 0 ? C.sub2 : delta > 0 ? C.mania : C.blue;
  const deltaText = delta === null ? "—" : delta === 0 ? "—" : `${delta > 0 ? "▲" : "▼"}${Math.abs(delta)}`;
  const deltaLabel = compareLabel(dailyScore.date, dailyScore.prevDay?.date ?? null);

  // LLM 요약은 두 문단이다. 앞은 "오늘 가장 뜨거운 지표", 뒤는 "최근 며칠 온도 추세".
  // 둘 다 브리핑 셀에 들어간다 — '오늘 → 왜 → 흐름' 순으로 읽힌다. 한때 뒤 문단을
  // 햇쩨 지수 카드에 뒀는데, 그 셀이 게이지·눈금까지 넣으면서 문단을 받을 자리가 없다.
  const summaryLines = (dailyScore.ai_summary ?? "")
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
  const meaningLine = summaryLines[0] ?? null;
  const trendLine = summaryLines[1] ?? null;

  return (
    // 히어로도 아래 지표 시트와 같은 어법이다 — 흰 판 하나를 헤어라인으로 갈라 셀을
    // 앉힌다. 예전엔 그림자 진 카드 두 장(햇쩨 지수 · 오늘의 브리핑)이었는데, 바로 밑에
    // 평평한 시트가 오면서 위만 떠 있어 두 화면이 붙어 보이지 않았다.
    <section className="hz-hero-panel">
      {/* ── ① 햇쩨 지수 ─────────────────────────────────────────── */}
      <div className="hz-hero-cell">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, letterSpacing: "-0.01em", color: C.ink }}>햇쩨 지수</h2>
            <span
              className="hz-tip hz-tip-wide hz-tip-below"
              data-tip="시장·감성 지표 25개의 과열도를 가중 평균한 값입니다. 지표마다 신호의 무게가 달라 다른 가중치로 합산합니다. 25·50·75를 경계로 저온·상온·고온·초고온이 나뉩니다."
              data-ga-tip="hatzze_index"
              style={{ display: "inline-flex", cursor: "help" }}
            >
              <Icon name="help" style={{ fontSize: 15, color: C.muted }} />
            </span>
          </span>
          {/* 구간 표시가 알약에서 **점 + 글자**로 내려앉았다. 큰 숫자가 이미 같은 색으로
              구간을 말하고 있어서, 알약까지 칠하면 셀 하나에 색 덩어리가 둘이 된다. */}
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, color: C.label }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: stage.color }} />
            {stageLabel}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {/* lineHeight 0.78 — 숫자만 남기고 서체의 위아래 여백을 걷어내야 옆의 두 줄
              설명과 광학적으로 가운데가 맞는다. */}
          <strong style={{ fontFamily: MONO, fontSize: 40, fontWeight: 800, lineHeight: 0.78, letterSpacing: "-0.04em", color: stage.color }}>
            {temp}
            <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em" }}>℃</span>
          </strong>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: C.sub }}>0~100 과열도 환산</span>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: C.sub }}>
              {deltaLabel} <span style={{ color: deltaColor, fontWeight: 800 }}>{deltaText}</span>
            </span>
          </div>
        </div>

        {/* 4칸 띠 + 그 위에 선 마커. 마커의 left 는 점수를 그대로 % 로 쓴다 —
            띠 네 칸이 0·25·50·75 경계와 정확히 같은 폭이라 계산이 필요 없다.

            마커 위에 있던 값 라벨("21℃")은 걷었다(2026-08-04). 바로 위에 같은 값이
            40px 로 서 있어서, 한 셀에서 같은 숫자를 두 번 읽게 했다. 대신 짝대기 머리에
            **빈 동그라미**를 얹어 핀 모양으로 만든다 — 라벨 없이도 "여기를 가리킨다"가
            남고, 눈금(0·25·50·75·100)과 구간 이름이 그 자리의 뜻을 말해 준다.
            paddingTop 은 라벨 자리(18)에서 동그라미 자리(12)로 줄였다. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ position: "relative", paddingTop: 12 }}>
            <div style={{ display: "flex", height: 9, borderRadius: 3, overflow: "hidden" }}>
              {HERO_STRIP.map((bg, i) => (
                <span key={i} style={{ width: "25%", background: bg }} />
              ))}
            </div>
            {/* 짝대기 — 띠 위아래로 4px 씩 삐져나와 어느 칸을 가리키는지 눈에 걸린다.
                흰 링(box-shadow) 을 둘러야 어느 칸 위에 서든 띠 색과 안 섞인다. */}
            <span
              style={{
                position: "absolute",
                left: `${score}%`,
                top: 8,
                transform: "translateX(-50%)",
                width: 2,
                height: 17,
                background: C.ink,
                borderRadius: 1,
                boxShadow: "0 0 0 2px var(--c-card)",
              }}
            />
            {/* 핀 머리. 속을 카드색으로 채워 **비어 보이게** 한다 — 꽉 찬 점은 띠 위의
                데이터 점처럼 읽히는데, 이건 값이 아니라 '가리키는 자리'다.
                짝대기(top 8)의 첫 1px 을 이 원이 덮어 이음매가 안 보인다. */}
            <span
              style={{
                position: "absolute",
                left: `${score}%`,
                top: 0,
                transform: "translateX(-50%)",
                width: 9,
                height: 9,
                borderRadius: "50%",
                border: `2px solid ${C.ink}`,
                background: C.card,
                boxSizing: "border-box",
              }}
            />
          </div>
          {/* 눈금 숫자는 --c-sub 이상으로. faint/hint 는 장식용 구분선 전용이다(대비 규칙). */}
          <div style={{ position: "relative", height: 13 }}>
            {[0, 25, 50, 75, 100].map((n) => (
              <span
                key={n}
                style={{
                  position: "absolute",
                  top: 0,
                  ...(n === 0 ? { left: 0 } : n === 100 ? { right: 0 } : { left: `${n}%`, transform: "translateX(-50%)" }),
                  fontFamily: MONO,
                  fontSize: 11,
                  fontWeight: 600,
                  color: C.sub,
                }}
              >
                {n}
              </span>
            ))}
          </div>
          {/* 지금 구간만 진하게. 나머지는 --c-label — 비활성이라고 faint 로 떨구면
              네 글자 중 셋이 안 읽힌다(대비 규칙). */}
          <div style={{ display: "flex" }}>
            {BAND_LABELS.map((l) => (
              <span
                key={l}
                style={{
                  flex: 1,
                  textAlign: "center",
                  fontSize: 11,
                  fontWeight: l === stageLabel ? 800 : 600,
                  color: l === stageLabel ? stage.color : C.label,
                }}
              >
                {l}
              </span>
            ))}
          </div>
        </div>

        {/* 최종 업데이트는 언제나 셀 맨 아래다 — 위 내용 길이가 날마다 달라도 자리가
            안 흔들려야 "이 화면의 기준 시각" 으로 읽힌다.
            목업은 이 줄을 본문 헤더 부제로 올렸는데, 헤더(AppShell)는 세 화면이 공유하는
            클라이언트 셸이라 브리핑 전용 데이터인 이 시각을 집을 수가 없다. 여기 남긴다. */}
        <div
          style={{
            marginTop: "auto",
            display: "flex",
            alignItems: "center",
            gap: 7,
            paddingTop: 10,
            borderTop: `1px solid ${C.divider}`,
          }}
        >
          <Icon name="schedule" style={{ fontSize: 14, color: C.muted }} />
          <span style={{ fontSize: 11.5, color: C.sub }}>최종 업데이트 · {formatKstUpdate(dailyScore.updated_at)}</span>
        </div>
      </div>

      {/* ── ② 지표 분포 ─────────────────────────────────────────── */}
      {/* 히어로가 답을 하나(38℃)만 주면 "그 하나가 어떻게 나온 값인지"가 안 보인다.
          25개가 네 구간에 어떻게 흩어져 있는지를 같이 두면, 같은 38℃라도 '전부 상온'인
          날과 '저온 12 + 초고온 3'인 날이 다른 화면이 된다. */}
      {/* 줄에 마우스를 올리면 그 구간에 든 지표가 목록으로 열리고, 이름을 누르면 아래
          시트의 그 셀로 내려간다. "상온 12개"가 **어느 12개인지** 볼 수 있어야 이 셀이
          숫자 넉 줄에서 끝나지 않는다.

          카더라의 테마 호버 카드(.hz-theme-pop)와 같은 어법이다 — 목록에 링크가 들어가야
          해서 data-tip 툴팁을 못 쓰고(그건 attr() 로 뽑은 **문자열**이라 링크를 못 담는다),
          대신 진짜 요소를 두고 :hover / :focus-within 으로 여닫는다. JS 가 없으므로 이
          셀은 서버 컴포넌트로 남는다. */}
      <div className="hz-hero-cell hz-hero-divide hz-dist">
        <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: "-0.01em", color: C.ink }}>지표 분포</span>
        {/* 100% 스택 바. 칸 색은 게이지 띠와 다른 한 벌이다 — 게이지는 '구간 자체'를
            그리는 배경이라 연하고, 이쪽은 개수를 견주는 데이터 면이라 진하다.
            data-band 는 아래 줄과 짝을 맞추는 열쇠다 — globals.css 가 :has() 로 그 짝을
            찾아 호버한 구간만 남기고 나머지를 흐린다. */}
        <div className="hz-dist-bar">
          {bandCounts.map((b, i) =>
            b.count === 0 ? null : (
              <span key={b.label} className="hz-dist-seg" data-band={i} style={{ width: `${(b.count / bandTotal) * 100}%`, background: b.fill }} />
            ),
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {bandCounts.map((b, i) => (
            // 지표가 0개인 구간도 **열린다.** 예전엔 아예 호버 대상에서 뺐는데, 네 줄 중
            // 하나만 아무 반응이 없으면 비어 있다는 뜻이 아니라 고장으로 읽힌다. 목록
            // 대신 "없습니다" 한 줄을 띄운다(2026-08-04).
            <div
              key={b.label}
              className={`hz-dist-row${b.count === 0 ? " hz-dist-row-none" : ""}`}
              data-band={i}
              tabIndex={0}
              style={{ display: "flex", alignItems: "center", gap: 9 }}
            >
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: b.fill, flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: C.label }}>{b.label}</span>
              <strong style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 800, color: C.ink }}>{b.count}</strong>
              {b.count > 0 ? (
                // 스크롤바 모양은 본문과 같은 것을 쓴다(.hz-scroll).
                <div className="hz-dist-pop hz-scroll">
                  {/* 머리는 **붙박이**다(sticky). 가장 긴 구간이 열두 줄인데 팝오버는 여덟
                      줄쯤에서 잘려 스크롤되므로, 안내를 맨 아래 두면 처음엔 안 보인다.
                      오른쪽 숫자가 무엇인지(과열도)와 눌러도 된다는 것 둘 다 여기 적는다. */}
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
                // 빈 구간은 상자를 내용 높이만큼만 잡는다(hz-dist-pop-slim) — 위아래를
                // 못박은 채로 두면 한 줄짜리가 258px 짜리 빈 판이 된다.
                <div className="hz-dist-pop hz-dist-pop-slim">
                  <p className="hz-dist-pop-none">오늘은 {b.label} 구간에 든 지표가 없습니다</p>
                </div>
              )}
            </div>
          ))}
        </div>
        {/* 분모를 적어 둔다 — 25개 전부가 아니라 **오늘 값이 들어온 것**만 센다.
            자료가 늦는 지표가 있는 날 합이 24가 되는데, 적어 두지 않으면 숫자가 틀린
            것처럼 보인다. */}
        <span
          style={{
            marginTop: "auto",
            fontSize: 12,
            lineHeight: 1.6,
            color: C.sub,
            paddingTop: 10,
            borderTop: `1px solid ${C.divider}`,
            textWrap: "pretty",
          }}
        >
          {bandTotal}개 지표 집계
          {bandCounts[3].count > 0 && ` · 초고온 ${bandCounts[3].count}개가 온도를 끌어올렸습니다`}
        </span>
      </div>

      {/* ── ③ 오늘의 브리핑 ─────────────────────────────────────── */}
      <div className="hz-hero-cell hz-hero-divide hz-hero-wide">
        {/* ✨ 는 장식이 아니라 생성형 AI 고지(AI 기본법 §31)라 누를 수 있어야 한다.
            **제목 앞**에 둔다 — 뒤에 달면 "오늘의 브리핑✨" 처럼 제목의 꾸밈으로 읽혀서,
            정작 고지의 대상(아래 문단들)을 가리키지 않는다. 앞에 서면 이 묶음 전체에
            붙는 표식이 된다.
            옅은 하늘색 타일에 앉힌다 — 맨 아이콘으로 두면 누를 수 있는 것으로 안 보인다.
            26px 은 제목 줄(12.5 × 1.3 ≈ 16)보다 크지만, 이 줄은 셀의 머리가 아니라
            브리핑 묶음의 제목이라 조금 더 서도 된다. */}
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <span
            style={{
              width: 26,
              height: 26,
              borderRadius: 9,
              background: "var(--c-blue-tint)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <AiMark size={15} style={{ alignSelf: "center" }} />
          </span>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, letterSpacing: "-0.01em", color: C.ink }}>오늘의 브리핑</h2>
        </div>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, color: C.inkSoft, textWrap: "pretty" }}>
          오늘은 시장 지표 <b style={{ fontWeight: 800, color: C.ink }}>{tradHits}개</b>, 감성 지표{" "}
          <b style={{ fontWeight: 800, color: C.ink }}>{socialHits}개</b>가 초고온 구간에 들었습니다. 지표들이 가리키는
          현재 시장 온도는 <b style={{ fontWeight: 800, color: stage.color }}>{stageLabel}</b> 구간입니다.
        </p>
        {meaningLine && (
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, color: C.inkSoft, textWrap: "pretty" }}>
            {renderRichSummary(meaningLine)}
          </p>
        )}
        {/* 시장↔감성 온도 비교 문단이 여기 있었다("지금은 시장 지표의 온도가 39도로
            감성 지표(21도)보다 높습니다…"). 히어로가 카드 둘에서 셀 하나로 합쳐지면서
            요약이 한자리에 모였고, 그 안에서 이 문단만 LLM 이 아니라 우리가 만들어 낸
            문장이라 결이 달랐다. 두 카테고리의 온도 차이는 바로 옆 '지표 분포'가
            개수로 이미 보여 준다. 만들어 낸 문장은 넣지 않는다(2026-08-03 결정).
            계산에 쓰던 marketHeat·socialHeat 프롭도 같이 걷었다. */}
        {/* 온도 추세 문단. 예전엔 햇쩨 지수 카드에 뒀는데(온도 이야기라서), 그 셀이
            게이지까지 넣기엔 좁아졌다. 브리핑 세 문단이 '오늘 → 왜 → 흐름' 순으로
            읽히는 편이 낫기도 하다. */}
        {trendLine && (
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, color: C.inkSoft, textWrap: "pretty" }}>
            {renderRichSummary(trendLine)}
          </p>
        )}
        {/* 면책은 회색 상자에서 헤어라인 한 줄로 내려앉았다. 상자로 두면 이 셀에서
            가장 큰 덩어리가 돼서, 정작 읽어야 할 브리핑 문단보다 눈에 먼저 들었다. */}
        <p
          style={{
            margin: "auto 0 0",
            paddingTop: 10,
            borderTop: `1px solid ${C.divider}`,
            fontSize: 12,
            lineHeight: 1.6,
            color: C.sub,
            textWrap: "pretty",
          }}
        >
          저온·상온·고온·초고온은 시장의 과열 정도를 나타낸 표현일 뿐, 재미·참고용이며 매수·매도 신호가 아닙니다.
        </p>
      </div>
    </section>
  );
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
function AreaChart({
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
  return (
    <div style={{ position: "relative", height: H }}>
      <svg viewBox={`0 0 100 ${H}`} style={{ width: "100%", height: H, display: "block" }} preserveAspectRatio="none">
        {/* 면적은 그라데이션 대신 **같은 색 반투명 한 겹**이다. SVG 그라데이션은 id 가
            문서 전역이라 카드마다 색이 다르면 서로 덮어쓴다 — 카드 넷이 같은 id 를 쓰면
            먼저 그린 색으로 다 칠해진다. */}
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
          <polygon points={`0,${base} ${line} 100,${base}`} fill={color} opacity={0.16} />
        )}
        <polyline points={line} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {/* 호버 크로스헤어 — MDD 낙폭 차트와 같은 어법. 끝쪽 지점은 툴팁이 카드 밖으로
          넘치지 않게 여는 방향을 튼다(안 그러면 가로 스크롤이 생긴다). */}
      {tip && (
        <div style={{ position: "absolute", inset: 0, display: "flex" }}>
          {points.map((pt, i) => {
            const at = i / (points.length - 1);
            const edge = at < 0.25 ? " hz-tip-start" : at > 0.75 ? " hz-tip-end" : "";
            return <div key={pt.key} className={`hz-tip hz-vline${edge}`} data-tip={tip(pt)} style={{ flex: 1, position: "relative" }} />;
          })}
        </div>
      )}
    </div>
  );
}

/* emphasizedHeights(값들을 floorPct~100 으로 다시 편 높이) 는 여기 있었다.
   붙어 있는 값들(100 대 107)의 차이를 세로 막대 높이로 보이게 하려고 축을 늘리는
   함수였는데, 아시아 상대강도가 **가로 막대 + 기준선**으로 바뀌면서 쓸 곳이 없어졌다.
   가로축은 세로보다 3배 길어서 축을 왜곡하지 않아도 차이가 보인다 — 왜곡을 안 하는
   편이 낫다(늘린 축은 "일본이 한국의 1.5배"처럼 읽힌다). */

function CardBuffett({ v }: { v: Pick }) {
  const dt = v.details;
  const ratio = v.raw !== null ? v.raw / 100 : null; // 시총/GDP 배수
  // GDP 막대는 시총을 100% 로 둔 상대 길이다. 둘이 같은 축 위에 있어야 "몇 배"가 그림으로 읽힌다.
  const gdpWidth = v.raw && v.raw > 0 ? Math.min(100, (100 / v.raw) * 100) : 50;
  const jo = (won: number) => Math.round(won / 1e12).toLocaleString("ko-KR"); // 원 → 조원
  return (
    <Shell slug={v.ind?.slug} hit={v.isHit} warm={v.warm} minH={230}>
      <TitleRow desc={v.headline} icon="payments" name={v.name} />
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <Big disp={v.disp} unit={v.unit} color={v.color} size={32} />
        {ratio !== null && (
          <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: "var(--card-accent-ink)", background: "var(--card-accent-tint)", borderRadius: R.pill, padding: "5px 10px", whiteSpace: "nowrap" }}>
            {ratio.toFixed(1)}배
          </span>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: C.sub2 }}>
              나라 경제 (GDP){dt && dt.gdp_year ? ` · ${String(dt.gdp_year).slice(2)}년 ${dt.gdp_q}분기` : ""}
            </span>
            <span style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 700, color: C.label, whiteSpace: "nowrap" }}>
              {dt && dt.gdp ? `약 ${jo(dt.gdp)}조원` : "기준 100"}
            </span>
          </div>
          <div style={{ height: 9, borderRadius: R.pill, background: C.track, overflow: "hidden" }}>
            <div style={{ width: `${gdpWidth}%`, height: "100%", borderRadius: R.pill, background: "var(--c-blue-5)" }} />
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: C.sub2 }}>증시 시가총액</span>
            <span style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 700, color: C.ink, whiteSpace: "nowrap" }}>
              {dt && dt.market_cap ? `약 ${jo(dt.market_cap)}조원` : `${v.disp}${v.unit}`}
            </span>
          </div>
          <div style={{ height: 9, borderRadius: R.pill, background: C.track, overflow: "hidden" }}>
            <div style={{ width: "100%", height: "100%", borderRadius: R.pill, background: C.blue }} />
          </div>
        </div>
        <span style={{ fontSize: 12, fontWeight: 600, color: C.label, background: C.soft, borderRadius: R.control, padding: "9px 11px" }}>
          증시가 실물 경제보다 {ratio !== null ? `${ratio.toFixed(1)}배 커진` : "커진"} 상태입니다
        </span>
      </div>
      <Foot text={v.desc} />
    </Shell>
  );
}

// 레버리지 ETF·선물 미결제약정 종합 지수.
//
// 큰 숫자는 다른 카드와 **똑같은 과열도**(v.capped)다. 예전엔 두 서브바의 산술평균을
// 적었는데, 그 평균은 fetch 가 raw_value 로 저장하는 값일 뿐 화면이 말하는 과열도가
// 아니다(indicator_thresholds 가 floor 38 / ceiling 74 로 다시 눈금을 매긴다).
// 그래서 2026-08-02 에 실제로 어긋났다 — 과열도 75.06 이라 초고온 배지가 켜졌는데 큰
// 숫자는 평균 65 였다. 배지·히어로 카운트·종합점수가 모두 과열도를 쓰므로 여기도 맞춘다.
function CardLeverage({ v }: { v: Pick }) {
  const dt = v.details;
  const heat = v.capped === null ? null : Math.round(v.capped);
  const etfAmount =
    dt?.etf_value != null
      ? (() => {
          const f = formatIndicatorValue(dt.etf_value, "억원");
          return `${f.display}${f.displayUnit}`;
        })()
      : null;
  const oiAmount = dt?.futures_oi != null ? `${Math.round(dt.futures_oi).toLocaleString("ko-KR")}` : null;
  // "기준 대비 N%" 는 두 타일이 **서로 다른 기준**을 같은 말로 부르던 라벨이었다.
  // ETF 는 4조원(고정), 선물은 "1년 평균의 1.5배" 라, 선물의 53% 는 두 단계 건너뛴 말이라
  // 카드만 보고는 풀 수 없었다. 이제 파이프라인이 기준 자체를 details 로 보낸다.
  //
  // 옛 행에는 그 두 필드가 없어서 상수로 물러선다. 값은 fetch_leverage_etf_volume.py 의
  // ETF_THRESHOLD(40,000억) · OI_SURGE_THRESHOLD(150) 와 같아야 한다 —
  // **다음 파이프라인 실행 뒤에는 이 폴백이 안 쓰인다.**
  const etfBaseEok = dt?.etf_base_eok ?? 40_000;
  const etfBaseLabel = (() => {
    const f = formatIndicatorValue(etfBaseEok, "억원");
    return `${f.display}${f.displayUnit}`;
  })();
  const oiVsAvg = dt?.oi_vs_avg ?? (dt?.futures_progress != null ? dt.futures_progress * 1.5 : null);
  return (
    <Shell slug={v.ind?.slug} hit={v.isHit} warm={v.warm} minH={230}>
      <TitleRow desc={v.headline} icon="rocket_launch" name={v.name} />
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <strong style={{ fontFamily: MONO, fontSize: 32, fontWeight: 800, letterSpacing: "-.03em", color: v.color, lineHeight: 1 }}>
          {heat ?? "-"}
          <span style={{ fontSize: 17, fontWeight: 700, color: C.sub }}>/100</span>
        </strong>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: C.sub2 }}>종합 과열도</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <HeatFill pct={heat ?? 0} />
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: 11, color: C.sub }}>안심</span>
          <span style={{ fontSize: 11, color: C.sub }}>과열</span>
        </div>
      </div>
      {dt && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10 }}>
          {/* 서브바 두 개는 각자 '자기 기준 대비 달성률'이라 큰 숫자와 다른 눈금이다.
              라벨을 '기준 대비'로 갈라 둔 것이 그 표시다(같은 이름으로 부르면 안 된다). */}
          <div style={{ background: C.soft, borderRadius: R.control, padding: 13, display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: C.sub2 }}>ETF 거래대금</span>
            <strong style={{ fontFamily: MONO, fontSize: 17, fontWeight: 800, color: C.ink }}>{etfAmount ?? "-"}</strong>
            <span style={{ fontSize: 11, color: C.muted }}>{etfBaseLabel} 대비 {Math.round(dt.etf_progress ?? 0)}%</span>
          </div>
          <div style={{ background: C.soft, borderRadius: R.control, padding: 13, display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: C.sub2 }}>선물 미결제약정</span>
            <strong style={{ fontFamily: MONO, fontSize: 17, fontWeight: 800, color: C.ink }}>{oiAmount ?? "-"}</strong>
            <span style={{ fontSize: 11, color: C.muted }}>1년 평균 대비 {oiVsAvg !== null ? Math.round(oiVsAvg) : "-"}%</span>
          </div>
        </div>
      )}
      <Foot text={v.desc} />
    </Shell>
  );
}

/**
 * 최근 한 달 매매 안전장치 동향 — 매수/매도 사이드카 · 서킷브레이커 발동 건수.
 *
 * 목업이 가로 막대 세 줄을 **회색 타일 세 칸**으로 바꿨다. 막대는 셋의 크기를 견주는
 * 그림인데 이 카드의 결론은 이미 "매도 우세" 한 줄로 나와 있어서, 아래는 근거 숫자만
 * 나란히 있으면 된다. 매수 칸만 강조색인 건 **매수 사이드카가 과열 쪽 신호**라서다.
 */
function CardMarketActions({ v }: { v: Pick }) {
  const dt = v.details;
  const buyN = dt?.buy ?? 0;
  const sellN = dt?.sell ?? 0;
  const cbN = dt?.cb ?? 0;
  // 매수/매도 안전장치 중 무엇이 우세했는지 — 종합 점수가 0이어도 방향은 보여준다.
  //
  // 큰 글자의 색은 **이 판정을 따르고, 과열도(v.color)를 쓰지 않는다.** 과열도를 칠하면
  // "매도 우세"가 빨강으로 떴다 — 한 카드가 두 질문(누가 우세했나 / 얼마나 뜨겁나)에
  // 답하면서 서로 반대말을 한 것이다. 눈금의 50점 지점이 raw 0.25(= 매수가 매도+CB+2 의
  // 3분의 1)라, 매수 6·매도 8·CB 6 같은 패닉 국면도 54.5점이라 고온으로 넘어간다.
  // 저장된 391일을 현 눈금으로 재계산하면 고온 이상 134일 중 68일(51%)이 매수 우세가
  // 아닌 날이었다.
  //
  // 과열도는 셀 상단 라인(진행률 ≥75)이 계속 진다 — 그쪽은 391일 중 57일이 전부 매수
  // 우세라 판정과 어긋난 적이 없다. 어긋나던 건 ≥50 경계뿐이었다.
  // ⚠️ 눈금 자체는 그대로다. 히어로 '지표 분포'에서 이 지표는 여전히 고온 칸에 앉으므로,
  //    카드와 갈리는 게 거슬리면 indicator_thresholds 에 floor 0.25 를 얹는 재보정이
  //    따로 필요하다(그러면 오늘 값이 54.5 → 9.1 로 내려간다).
  const dir =
    buyN > sellN
      ? { label: "매수 우세", color: C.hot, hint: "달아오른 쪽이 잦았습니다" }
      : sellN > buyN
        ? { label: "매도 우세", color: C.neutral, hint: "식는 쪽이 잦았습니다" }
        : { label: "균형", color: C.ink, hint: "양쪽이 비슷했습니다" };
  // 세 값을 **같은 눈금**에 올린다. 숫자 타일 셋으로 흩어 두면 5·8·6 을 눈이 직접 빼야
  // 하는데, 같은 축의 막대로 두면 "매도가 더 잦았다"가 길이로 바로 증명된다.
  // 색이 방향을 진다 — 매수 안전장치(상승 제동)는 달아오른 쪽이라 고온, 매도 쪽은 식는
  // 쪽이라 상온 파랑, CB 는 둘 다 걸릴 수 있어 중립인 연파랑.
  const rows = [
    { label: "매수", n: buyN, fill: C.hot, ink: C.hot },
    { label: "매도", n: sellN, fill: C.neutral, ink: C.ink },
    { label: "CB", n: cbN, fill: "var(--c-blue-4)", ink: C.label },
  ];
  const maxN = Math.max(1, buyN, sellN, cbN);
  return (
    <Shell slug={v.ind?.slug} hit={v.isHit} warm={v.warm} minH={230}>
      <TitleRow desc={v.headline} icon="speed" name={v.name} badge="최근 한 달" />
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        {/* 한글은 같은 font-size 라도 숫자보다 글리프가 커 보인다 — 다른 카드의 32px 숫자와
            '눈에 보이는 크기'를 맞춘 값이 30 이다. */}
        <strong style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-.03em", color: dir.color, lineHeight: 1 }}>{dir.label}</strong>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: C.sub2, whiteSpace: "nowrap" }}>{dir.hint}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {rows.map((r) => (
          <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 34, flexShrink: 0, fontSize: 11.5, fontWeight: 600, color: C.sub2 }}>{r.label}</span>
            <div style={{ flex: 1, minWidth: 0, height: 14, borderRadius: 4, background: C.track, overflow: "hidden" }}>
              <div style={{ width: `${(r.n / maxN) * 100}%`, height: "100%", borderRadius: 4, background: r.fill }} />
            </div>
            <span style={{ width: 30, flexShrink: 0, textAlign: "right", fontFamily: MONO, fontSize: 12.5, fontWeight: 800, color: r.ink }}>
              {r.n}건
            </span>
          </div>
        ))}
      </div>
      <Foot text={v.desc} />
    </Shell>
  );
}

// 거래대금 쏠림도 — 상위10 비중을 **100% 스택 바**로.
//
// 도넛이었다. 도넛은 상위 넷만 조각으로 그리고 나머지는 트랙색 한 덩어리로 남겨서,
// "그럼 저 회색은 뭔데"에 답을 못 했다. 스택 바로 펴면 상위 4 + 나머지 상위 10종목 +
// 그 외 전 종목까지 100% 가 전부 드러난다. 각도보다 길이가 견주기도 쉽다.
function CardTurnover({ v }: { v: Pick }) {
  const share = v.raw ?? 0; // 상위10 거래대금 비중 %
  const dt = v.details as unknown as { top5?: { name: string; share: number }[]; total_jo?: number } | null;
  const top = (dt?.top5 ?? []).slice(0, 4);
  // 비중만으론 "얼마"인지 안 보인다 — 전체 거래대금에 비중을 곱해 금액으로 준다.
  const totalJo = dt?.total_jo ?? null;
  const barTip =
    totalJo != null
      ? `전체 ${totalJo.toLocaleString("ko-KR")}조원 중 상위 10종목이 ${((totalJo * share) / 100).toFixed(1)}조원`
      : `상위 10종목이 전체 거래대금의 ${share.toFixed(1)}%`;
  // 100% 를 채우는 조각들. 앞 넷은 종목별, 다섯째는 상위10 중 남은 몫, 마지막은 그 외 전부.
  // ⚠️ 뺄셈이 음수가 되지 않게 막는다 — top5 가 상위10 비중보다 커지는 날이 있으면
  // (자료가 어긋난 날) 막대가 통째로 뒤집힌다.
  const namedSum = top.reduce((a, t) => a + t.share, 0);
  const restOfTop = Math.max(0, share - namedSum);
  const others = Math.max(0, 100 - share);
  const segs = [
    ...top.map((t, i) => ({ key: t.name, label: t.name, pct: t.share, fill: BLUE_SCALE[i] ?? "var(--c-blue-5)", ink: C.ink })),
    { key: "__rest", label: "나머지 상위 10종목", pct: restOfTop, fill: "var(--c-blue-5)", ink: C.ink },
    { key: "__others", label: "그 외 전 종목", pct: others, fill: C.track, ink: C.sub2 },
  ];
  return (
    <Shell slug={v.ind?.slug} hit={v.isHit} warm={v.warm} minH={230}>
      <TitleRow desc={v.headline} icon="pie_chart" name={v.name} />
      <Big disp={`${Math.round(share)}`} unit="%" color={v.color} size={32} sub="상위 10종목이 가져간 몫" />
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="hz-tip" data-tip={barTip} style={{ display: "flex", height: 14, borderRadius: 4, overflow: "hidden" }}>
          {segs.map((s2) => (s2.pct <= 0 ? null : <div key={s2.key} style={{ width: `${s2.pct}%`, background: s2.fill }} />))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {segs.map((s2) =>
            s2.pct <= 0 ? null : (
              <div key={s2.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: 3, background: s2.fill, flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: C.label, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {s2.label}
                </span>
                <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: s2.ink }}>{s2.pct.toFixed(1)}%</span>
              </div>
            ),
          )}
        </div>
      </div>
      <Foot text={v.desc} />
    </Shell>
  );
}

/**
 * 코스피 신고가 괴리율 — 지수 괴리율 + 거래대금 상위 3종목의 괴리율.
 *
 * 목업에서 '수위 통'(세로 물통)이 빠졌다. 통은 전고점을 눈금처럼 읽히게 하려던 장치인데,
 * 큰 수치 -28% 가 이미 같은 말을 하고 있어 한 카드에서 같은 사실을 두 번 그렸다.
 * 남은 자리는 종목 세 줄이 가져간다 — 지수 숫자가 어디서 온 건지는 그쪽이 말한다.
 *
 * ⚠️ 막대 길이의 뜻이 예전과 **반대**다. 예전엔 '고점에 얼마나 가까운가'(깊을수록 짧음)
 * 였는데 목업은 '얼마나 빠졌나'(깊을수록 김)로 그린다. 50% 낙폭을 꽉 찬 막대로 둔다.
 */
function CardHighGap({ v, tops }: { v: Pick; tops: StockHighGap[] }) {
  const gap = v.raw ?? 0;
  const priorHigh = v.details?.prior_high;
  const num = (n: number) => n.toLocaleString("ko-KR", { maximumFractionDigits: 0 });
  // 순위대로 진한 파랑 → 옅은 파랑. 색조가 아니라 명도만 움직여 '서열'로 읽히게 한다.
  const rankColor = ["var(--c-blue-2)", "var(--c-blue-3)", "var(--c-blue-4)"];
  return (
    <Shell slug={v.ind?.slug} hit={v.isHit} warm={v.warm} minH={230}>
      <TitleRow
        desc={v.headline}
        icon="vertical_align_top"
        name={v.name}
        badge={sourceDateBadge(v) ?? "최근 거래일 기준"}
      />
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <Big disp={`${gap > 0 ? "+" : ""}${v.disp}`} unit={v.unit} color={v.color} size={32} sub={gap > 0 ? "이전 전고점 돌파" : "전고점으로부터"} />
        {typeof priorHigh === "number" && (
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--card-accent-ink)", background: "var(--card-accent-tint)", borderRadius: R.pill, padding: "5px 10px", whiteSpace: "nowrap" }}>
            전고점 {num(priorHigh)}
          </span>
        )}
      </div>
      {tops.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* 현재가·52주 고점 둘 다 야후 **종가**다. 실시간이 아니다 — 파이프라인이 하루 두 번
              받아 저장한 값을 읽기만 한다. 이 카드가 장중에 움직이면 왼쪽 지수 값·햇쩨 지수와
              시점이 갈리기 때문이다. */}
          <span
            className="hz-tip hz-tip-wide hz-tip-start"
            data-tip={`현재가와 52주 고점 모두 야후 파이낸스 종가 기준입니다${tops[0]?.priceDate ? ` (${tops[0].priceDate} 종가)` : ""}. 막대가 꽉 찰수록 고점에 가깝습니다.`}
            data-ga-tip="high_gap_source"
            style={{ fontSize: 11.5, fontWeight: 700, color: C.muted }}
          >
            거래대금 상위 종목의 52주 고점 근접도
          </span>
          {tops.map((st, i) => (
            <div key={st.code} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 76, flexShrink: 0, fontSize: 12.5, fontWeight: 600, color: C.label, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {st.name}
              </span>
              <div style={{ flex: 1, height: 7, borderRadius: R.pill, background: C.track, overflow: "hidden", minWidth: 0 }}>
                {/* 막대 = **고점 근접도**(52주 고점 = 꽉 찬 막대). 오른쪽 숫자는 그대로
                    괴리율이라, 둘을 더하면 늘 100 이다.

                    ⚠️ 2026-08-04 에 방향을 되돌렸다. 목업을 따라 '얼마나 빠졌나'(깊을수록
                    긴 막대, 축은 −50%)로 그렸는데 두 가지가 어긋났다.
                    ① **이 화면에서 꽉 찬 막대는 늘 뜨겁다는 뜻**인데, 이 카드만 꽉 찬
                       막대가 가장 차가운 종목(고점에서 가장 많이 빠진 종목)이었다.
                    ② 축 −50% 가 실제 값을 못 담았다. 실측(2026-08-04) −47.5 / −36.0 /
                       −51.1 은 95% · 72% · **100%(잘림)** 으로 그려져, 셋 다 거의 꽉 찬
                       데다 −51 과 −80 이 같은 그림이 된다.
                    근접도로 두면 축이 '고점 = 100' 이라 임의로 정한 수가 없고, 잘릴 일도
                    없다(같은 값이 52.5 · 64.0 · 48.9 로 갈린다). */}
                <div style={{ width: `${Math.max(0, Math.min(100, 100 + st.gapPct))}%`, height: "100%", borderRadius: R.pill, background: rankColor[i] ?? "var(--c-blue-4)" }} />
              </div>
              <span style={{ width: 50, textAlign: "right", fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.ink }}>
                {st.gapPct >= 0 ? "+" : ""}{st.gapPct.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      )}
      <Foot text={v.desc} />
    </Shell>
  );
}

/**
 * 코스피 상승 속도 — 60거래일 수익률(%).
 *
 * 목업이 60일 꺾은선을 **눈금 하나**로 바꿨다. 궤적은 "어떻게 왔나"를 말하지만 이 카드의
 * 질문은 "얼마나 빨리 왔나" 하나뿐이고, 그 답은 큰 수치와 눈금 위 위치로 끝난다.
 * 축은 ±20%로 고정한다 — 값에 따라 축이 움직이면 어제와 오늘의 위치를 견줄 수 없다.
 */
function CardSpeed({ v, path = [] }: { v: Pick; path?: ClosePoint[] }) {
  const from = v.details?.from_close;
  const to = v.details?.to_close;
  const spd = v.raw ?? 0;
  const num = (n: number) => n.toLocaleString("ko-KR", { maximumFractionDigits: 0 });
  // 차트는 지수 값이 아니라 **시작점 대비 %**를 그린다. 지수 값을 그리면 y축이 그 60일의
  // 최소~최대로 늘어나서 ±1% 든 ±30% 든 그림이 똑같아진다 — "얼마나" 움직였는지가
  // 통째로 사라진다. 시작점을 0%로 두면 y축이 곧 퍼센트라 높이가 그대로 크기다.
  const base = path[0]?.close ?? 0;
  const pts = base > 0 ? path.map((x) => ({ key: x.date, value: (x.close / base - 1) * 100 })) : [];
  const hi = pts.length ? Math.max(...pts.map((x) => x.value), 0) : null;
  const lo = pts.length ? Math.min(...pts.map((x) => x.value), 0) : null;
  return (
    <Shell slug={v.ind?.slug} hit={v.isHit} warm={v.warm} minH={230}>
      <TitleRow desc={v.headline} icon="trending_up" name={v.name} />
      <Big
        disp={`${spd >= 0 ? "+" : ""}${v.disp}`}
        unit={v.unit}
        color={v.color}
        size={32}
        sub={typeof from === "number" && typeof to === "number" ? `${num(from)} → ${num(to)}` : undefined}
      />
      {pts.length >= 2 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <AreaChart
            points={pts}
            baseline="zero"
            tip={(x) => `${shortDate(x.key)} · ${x.value >= 0 ? "+" : ""}${x.value.toFixed(1)}%`}
          />
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, color: C.sub }}>3개월 전 = 0%</span>
            {hi !== null && lo !== null && (
              <span style={{ fontSize: 11, color: C.sub }}>
                최고 {hi >= 0 ? "+" : ""}{hi.toFixed(1)}% · 최저 {lo.toFixed(1)}%
              </span>
            )}
          </div>
        </div>
      ) : (
        <HeatBar v={v} hideThreshold />
      )}
      <Foot text={v.desc} />
    </Shell>
  );
}

/**
 * VKOSPI — 숫자를 하나만 쓴다.
 *
 * 예전엔 "과열도 23"과 "실제 VKOSPI 87"을 같이 보여줬는데, 초보에겐 둘 중 뭘 봐야 하는지도,
 * 왜 하나는 낮고 하나는 높은지도(과열도는 낮을수록 과열이라 역방향) 알 수 없었다.
 * 지수 값 하나만 크게 두고, 그 값이 높은지 낮은지는 최근 30일 범위 안의 위치로 보여준다 —
 * "87"만 봐선 모르지만 "73~97 중 여기"면 바로 읽힌다.
 */
function CardVkospi({ v }: { v: Pick }) {
  const hist = v.history.filter((x) => typeof x === "number");
  const lo = hist.length ? Math.min(...hist) : null;
  const hi = hist.length ? Math.max(...hist) : null;
  const cur = v.raw;
  // 범위 안 위치(0=최저, 1=최고). 최근 30일이 평평하면 가운데로 둔다.
  const pos = cur !== null && lo !== null && hi !== null && hi > lo ? (cur - lo) / (hi - lo) : 0.5;
  const verdict = pos >= 0.66 ? "최근 30일 중 높은 편" : pos <= 0.33 ? "최근 30일 중 낮은 편" : "최근 30일 평균 수준";
  const knob = v.color;
  return (
    <Shell slug={v.ind?.slug} hit={v.isHit} warm={v.warm} minH={230}>
      <TitleRow desc={v.headline} icon="monitor_heart" name={v.name} />
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <Big disp={v.disp} color={v.color} size={32} sub="변동성지수" />
        <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--card-accent-ink)", background: "var(--card-accent-tint)", borderRadius: R.pill, padding: "5px 10px", whiteSpace: "nowrap" }}>
          {verdict}
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ position: "relative", height: 10 }}>
          <div style={{ height: "100%", borderRadius: R.pill, background: C.track, overflow: "hidden" }}>
            <div style={{ width: `${pos * 100}%`, height: "100%", borderRadius: R.pill, background: knob }} />
          </div>
          <HeatKnob left={pos * 100} color={knob} />
        </div>
        {/* 양 끝 라벨은 **변동성 자체**를 말한다(잔잔 ↔ 출렁). 예전엔 '방심 ↔ 불안'
            이었는데, 방심은 시장의 상태가 아니라 그 상태에 대한 평가라서 눈금 끝에
            적히면 무엇을 잰 값인지가 흐려졌다(2026-08-04). 낮은 쪽이 왜 과열 신호인지는
            셀 맨 아래 설명 한 줄이 맡는다. */}
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: C.muted }}>잔잔 {lo !== null ? Math.round(lo) : "-"}</span>
          <span style={{ fontSize: 11, color: C.sub }}>최근 30일 범위</span>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: C.muted }}>출렁 {hi !== null ? Math.round(hi) : "-"}</span>
        </div>
      </div>
      <Foot text={v.desc} />
    </Shell>
  );
}

function CardAsia({ v }: { v: Pick }) {
  const dt = v.details;
  const k = dt?.kospi ?? 0;
  const bars = dt
    ? [
        { label: "KOSPI", sub: "한국", index: 100, self: true },
        { label: "Nikkei", sub: "일본", index: 100 + ((dt.nikkei ?? 0) - k), self: false },
        { label: "HangSeng", sub: "홍콩", index: 100 + ((dt.hangseng ?? 0) - k), self: false },
        { label: "Taiex", sub: "대만", index: 100 + ((dt.taiex ?? 0) - k), self: false },
      ]
    : [];
  // 눈금 상한. 가장 큰 나라도 막대 끝에 딱 붙지 않게 4% 만큼 여유를 둔다 — 붙으면
  // "여기가 최대치"로 읽혀서, 실제로는 열려 있는 축이 닫힌 것처럼 보인다.
  const scaleMax = bars.length ? Math.max(...bars.map((b) => b.index)) * 1.04 : 1;
  const pct = (n: number) => `${Math.max(0, Math.min(100, (n / scaleMax) * 100))}%`;
  // 기준선(KOSPI)이 축 위에서 갖는 자리. 파선과 아래 캡션이 같은 값을 읽어야 어긋나지 않는다.
  const kospiPct = bars.length ? pct(bars[0].index) : "0%";
  // 라벨·값 칸 폭. 파선을 덮어씌우는 상자가 이 값을 그대로 되읽어야 막대 칸에 정확히
  // 겹친다(숫자를 두 곳에 적으면 반드시 어긋난다).
  const LABEL_W = 62;
  const VALUE_W = 34;
  const ROW_GAP = 9;
  return (
    <Shell slug={v.ind?.slug} hit={v.isHit} warm={v.warm} minH={230}>
      <TitleRow desc={v.headline} icon="public" name={v.name} badge="최근 한 달" />
      <Big
        disp={`${v.raw !== null && v.raw > 0 ? "+" : ""}${v.disp}`}
        unit={v.unit}
        color={v.color}
        size={32}
        sub="코스피 초과수익률"
      />
      {bars.length > 0 ? (
        // 세로 막대 넷을 **가로 막대 넷**으로 바꿨다. 세로로 세우면 네 나라의 차이가
        // 높이차로만 남는데, 100 대 107 처럼 붙은 값들은 그 차이가 몇 px 이라 안 보인다.
        // 가로로 눕히면 같은 차이가 훨씬 긴 축 위에 놓이고, 무엇보다 **기준선(KOSPI)을
        // 세로 파선 하나로 그을 수 있어** "우리보다 앞선 나라"가 선 오른쪽으로 갈린다.
        <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 10 }}>
          {/* 파선은 막대 칸에만 걸쳐야 한다 — 라벨·값 칸까지 가로지르면 표를 관통하는
              줄이 돼서 기준선으로 안 읽힌다. 좌우를 그 두 칸 폭만큼 물린 상자를 깔고
              그 안에서 %로 세운다. 아래 캡션 줄(12+gap 10)만큼 bottom 도 물린다.
              ⚠️ zIndex 1 — 이 상자는 DOM 에서 막대보다 **앞**이라, 그냥 두면 뒤에 깔려
              KOSPI 를 넘어선 나라의 막대가 파선을 덮는다. 기준선은 자기가 가르는 막대
              위에 보여야 "여기까지가 우리"로 읽히므로 맨 앞 레이어로 올린다. */}
          <span
            aria-hidden
            style={{
              position: "absolute",
              top: 0,
              bottom: 22,
              left: LABEL_W + ROW_GAP,
              right: VALUE_W + ROW_GAP,
              pointerEvents: "none",
              zIndex: 1,
            }}
          >
            <span style={{ position: "absolute", left: kospiPct, top: -2, bottom: 0, borderLeft: `1px dashed var(--c-blue-3)` }} />
          </span>
          {bars.map((b) => (
            <div key={b.label} style={{ display: "flex", alignItems: "center", gap: ROW_GAP }}>
              <span style={{ width: LABEL_W, flexShrink: 0, display: "flex", flexDirection: "column", gap: 1 }}>
                <span style={{ fontSize: 11, fontWeight: b.self ? 800 : 700, color: b.self ? C.ink : C.label, whiteSpace: "nowrap" }}>
                  {b.label}
                </span>
                <span style={{ fontSize: 11, fontWeight: 600, color: C.sub }}>{b.sub}</span>
              </span>
              <div style={{ position: "relative", flex: 1, minWidth: 0, height: 16 }}>
                <div style={{ position: "absolute", inset: 0, borderRadius: 4, background: C.track }} />
                {/* 기준국만 진한 파랑. 넷을 다 같은 색으로 두면 "누가 기준인지"를 라벨
                    굵기로만 말하게 되는데, 그건 막대를 훑는 눈에 안 걸린다. */}
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: pct(b.index),
                    borderRadius: 4,
                    background: b.self ? "var(--c-blue-1)" : "var(--c-blue-4)",
                  }}
                />
              </div>
              <span
                style={{
                  width: VALUE_W,
                  flexShrink: 0,
                  textAlign: "right",
                  fontFamily: MONO,
                  fontSize: 12,
                  fontWeight: 800,
                  color: b.self ? C.ink : C.label,
                }}
              >
                {Math.round(b.index)}
              </span>
            </div>
          ))}
          {/* 파선이 무슨 선인지 적는 줄. 파선과 같은 kospiPct 를 쓰되 오른쪽 기준으로
              뒤집어 잡는다 — left 로 두면 캡션이 길어질 때 왼쪽으로 자라 선에서 밀린다. */}
          <div style={{ display: "flex", alignItems: "center", gap: ROW_GAP }}>
            <span style={{ width: LABEL_W, flexShrink: 0 }} />
            <div style={{ position: "relative", flex: 1, minWidth: 0, height: 12 }}>
              <span
                style={{
                  position: "absolute",
                  right: `calc(100% - ${kospiPct})`,
                  top: 0,
                  transform: "translateX(50%)",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--c-cold-ink)",
                  whiteSpace: "nowrap",
                }}
              >
                KOSPI 100 기준
              </span>
            </div>
            <span style={{ width: VALUE_W, flexShrink: 0 }} />
          </div>
        </div>
      ) : (
        <HeatBar v={v} />
      )}
      <Foot text={v.desc} />
    </Shell>
  );
}

function CardGoldRatio({ v }: { v: Pick }) {
  const k = v.details?.kospi_close;
  const g = v.details?.gold_close;
  const num = (n: number) => n.toLocaleString("ko-KR", { maximumFractionDigits: 0 });
  const note = typeof k === "number" && typeof g === "number" ? `코스피 ${num(k)} ÷ 금 ${num(g)}` : "코스피 지수 ÷ 금 시세";
  return (
    <Shell slug={v.ind?.slug} hit={v.isHit} warm={v.warm} minH={230}>
      <TitleRow icon="balance" name={v.name} desc={v.headline} />
      <Big disp={v.disp} unit={v.unit} color={v.color} size={32} sub={note} />
      <HeatBar v={v} />
      <Foot text={v.desc} />
    </Shell>
  );
}

// 거래대금 급증도 — 30일 평균 vs 최근 거래일.
// 목업은 세로 막대 둘이 아니라 **가로 막대 두 줄**이다(라벨 왼쪽·금액 오른쪽). 세로 막대는
// 높이를 견주려고 눈이 위아래로 오가는데, 가로 두 줄은 같은 기준선에서 시작해 길이만 다르다.
function CardVolume({ v }: { v: Pick }) {
  const dt = v.details;
  const avg = dt?.avg_30d ?? null;
  const today = v.raw ?? null;
  const surge = dt?.surge_pct ?? null;
  const fmt = (n: number) => {
    const f = formatIndicatorValue(n, "억원");
    return `${f.display}${f.displayUnit}`;
  };
  // 두 막대는 같은 축 위에 있어야 길이 비교가 뜻을 갖는다 — 큰 쪽을 100%로 둔다.
  const max = Math.max(avg ?? 0, today ?? 0) || 1;
  const rows: { label: string; value: number | null; fill: string; strong: boolean }[] = [
    { label: "30일 평균", value: avg, fill: "var(--c-blue-5)", strong: false },
    { label: "최근 거래일", value: today, fill: C.blue, strong: true },
  ];
  return (
    <Shell slug={v.ind?.slug} hit={v.isHit} warm={v.warm} minH={230}>
      <TitleRow desc={v.headline} icon="groups" name={v.name} />
      {surge !== null && (
        <Big disp={`${surge >= 0 ? "+" : ""}${surge}`} unit="%" color={v.color} size={32} sub="평소 대비" />
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {rows.map((r) => (
          <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 60, flexShrink: 0, fontSize: 12, fontWeight: 600, color: C.sub2 }}>{r.label}</span>
            <div style={{ flex: 1, height: 9, borderRadius: R.pill, background: C.track, overflow: "hidden", minWidth: 0 }}>
              <div style={{ width: `${((r.value ?? 0) / max) * 100}%`, height: "100%", borderRadius: R.pill, background: r.fill }} />
            </div>
            <span style={{ width: 58, textAlign: "right", fontFamily: MONO, fontSize: 12.5, fontWeight: 700, color: r.strong ? C.ink : C.label }}>
              {r.value !== null ? fmt(r.value) : "-"}
            </span>
          </div>
        ))}
      </div>
      <Foot text={v.desc} />
    </Shell>
  );
}

// 원/달러 환율 변동성 — 최근 30일 출렁임.
// 알약 막대 열 개로 줄였다가 되돌렸다(2026-08-03). 이 지표의 뜻이 "잔잔한가"라서
// 값 하나하나보다 **선이 얼마나 평평한가**가 답이고, 막대는 그 평평함을 못 보여 준다.
function CardFx({ v }: { v: Pick }) {
  const pts = v.historyPoints.map((b) => ({ key: b.date, value: b.value }));
  return (
    <Shell slug={v.ind?.slug} hit={v.isHit} warm={v.warm} minH={230}>
      <TitleRow desc={v.headline} icon="waves" name={v.name} />
      <Big disp={`±${v.disp}`} unit={v.unit} color={v.color} size={32} sub="최근 30일" />
      <AreaChart points={pts} color={v.color} tip={(x) => `${shortDate(x.key)} · ±${x.value.toFixed(2)}%`} />
      <Foot text={v.desc} />
    </Shell>
  );
}

// 신용융자 잔고 — DB 미보유 placeholder ("준비 중").
// 목업은 점선 상승 곡선이 아니라 **점선 상자 + 모래시계**다. 곡선은 "이런 모양일 것"이라는
// 가짜 데이터라, 값이 없는 카드에 그려 두면 한 번은 진짜로 읽힌다.
function CardComingSoon() {
  return (
    <Shell minH={230}>
      <TitleRow icon="credit_score" name="신용융자 잔고" desc="빚내서 주식을 산 금액" badge="준비 중" />
      <div
        style={{
          flex: 1,
          minHeight: 96,
          borderRadius: R.control,
          border: `1.5px dashed ${C.line}`,
          background: C.soft,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        <Icon name="hourglass_empty" style={{ fontSize: 24, color: C.hint }} />
        <span style={{ fontSize: 12.5, fontWeight: 700, color: C.sub }}>데이터 준비 중</span>
      </div>
      <Foot text="빚내서 주식 사는 돈이 불어나면 과열 신호입니다" />
    </Shell>
  );
}

// ── 소셜 지표 카드들 ──────────────────────────────────────────────

// '평소 대비 N배' — 절대 건수가 없는 네이버 검색지수(0~100 상대지수)를 직관적으로
// 보여준다. ratio = 현재 / 최근 30일 평균. 가운데 눈금(1배=평소)을 기준으로
// 오른쪽으로 넘으면 평소보다 활발(과열 방향).
/**
 * 1배(평소) 축 위에서 값이 갖는 색.
 *
 * 이 축은 양극이다 — 가운데가 평소이고 오른쪽이 '많다', 왼쪽이 '적다'. 그래서 색을
 * 카드의 과열도(v.color)에서 가져오면 안 된다. 외식 검색 1.3배는 평소보다 **많은데**
 * 그 지표의 과열도가 아직 상온이라 파랑으로 떴다 — 막대는 오른쪽으로 뻗는데 색은
 * 차갑다고 말하는 꼴이었다(2026-08-03).
 * 축이 스스로 말하게 둔다: 1배 위는 빨강, 아래는 파랑, 정확히 1배면 중립.
 */
function VsAvg({ ratio, knob, showScale = true }: { ratio: number; knob: string; showScale?: boolean }) {
  // **1배를 축 한가운데에 못박는다.** 예전엔 0~2배를 0~100%로 폈는데(1배가 가운데인 건
  // 같지만) 축이 넓어 1.0배와 1.3배가 15%p 차이로 붙어 보였다. ±0.5배를 양 끝으로 두면
  // 같은 차이가 30%p 로 벌어진다. 검색 지수는 1배 근처에서 노는 값이라 이쪽이 맞다.
  const pos = Math.max(0, Math.min(100, 50 + (ratio - 1) * 100));
  // 채움을 **가운데에서 뻗어 나가게** 한다. 왼쪽 끝에서부터 채우면 1.0배(평소)도 절반이
  // 차 있어 "꽤 많다"로 읽힌다. 가운데 기준이면 평소는 채움이 없고, 채운 길이가 곧
  // '평소에서 얼마나 벗어났나'다 — 두 줄을 위아래로 놓았을 때 방향이 바로 갈린다.
  const fillLeft = Math.min(50, pos);
  const fillWidth = Math.abs(pos - 50);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      <div style={{ position: "relative", height: 12 }}>
        <div style={{ height: "100%", borderRadius: R.pill, background: C.track }} />
        <span
          style={{
            position: "absolute",
            left: `${fillLeft}%`,
            top: 0,
            height: 12,
            width: `${fillWidth}%`,
            background: knob,
            borderRadius: R.pill,
          }}
        />
        {/* 1배 눈금. 채움이 없는 줄(평소 수준)에서도 축의 기준이 어디인지 보여야 한다. */}
        <span
          style={{
            position: "absolute",
            left: "50%",
            top: -3,
            height: 18,
            width: 1.5,
            background: C.marker,
            transform: "translateX(-50%)",
          }}
        />
        {/* 노브는 흰 속을 둔 테두리 알약이다. 꽉 찬 점으로 두면 채움과 같은 색이라
            채움 끝에서 사라진다. clamp 로 양 끝에서도 트랙 밖으로 안 나간다. */}
        <span
          style={{
            position: "absolute",
            left: `clamp(7px, ${pos}%, 100% - 7px)`,
            top: -4,
            transform: "translateX(-50%)",
            width: 14,
            height: 18,
            borderRadius: 6,
            background: C.card,
            border: `3px solid ${knob}`,
            boxSizing: "border-box",
          }}
        />
      </div>
      {showScale && (
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          {/* 눈금 라벨은 --c-sub 이상으로. faint 는 장식용 선에만 쓴다(대비 규칙). */}
          <span style={{ fontSize: 11, fontWeight: 600, color: C.sub }}>적음</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: C.sub2 }}>평소(1배)</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: C.sub }}>많음</span>
        </div>
      )}
    </div>
  );
}

// 실물–증시 괴리 — 실물 강도 / 증시 강세를 각자 역대 백분위로 매겨 나란히 둔다.
// 괴리는 둘의 '곱'이 아니라 '차이'(lead = 증시%ile − 실물%ile)다.
// 목업은 큰 막대 둘을 **타일 두 칸**으로 줄였다 — 결론(누가 몇 % 앞서나)이 이미 큰 수치로
// 나와 있어서, 아래는 근거 두 값이 나란히 있으면 된다.
function CardDivergence({ v }: { v: Pick }) {
  const dt = v.details;
  const real = dt?.real_strength ?? 0;
  const market = dt?.market_strength ?? 0;
  const lead = dt?.lead ?? market - real; // +면 증시 강세, −면 실물 강세
  const marketLeads = lead >= 0;
  const leadWho = marketLeads ? "증시" : "실물 경제";
  const ccsi = dt?.ccsi_value;
  const gap = dt?.kospi_gap;
  const level = (x: number) => (x >= 66 ? "높음" : x >= 33 ? "보통" : "낮음");
  // ⚠️ 두 값의 **과열 방향이 반대**다. 이 지표의 과열도는 lead = 증시%ile − 실물%ile 이라
  // (calculate_score.py), 증시가 높을수록 과열이고 **실물이 높을수록 차갑다**("실물이 크게
  // 앞서면 차갑다로 읽히게 한다" — 그 주석). 그래서 색을 낼 때 실물만 100−값으로 뒤집는다.
  // 한때 둘 다 overheatColor(값) 으로 칠했는데, 그러면 실물 74(=건강)가 빨강으로 떠서
  // 카드가 "과열"이라고 말하는 꼴이었다(2026-08-03).
  const tiles = [
    {
      label: "실물 강도",
      hint: "소비심리(CCSI)",
      value: real,
      heat: 100 - real,
      tip:
        ccsi != null
          ? `한국은행 소비자심리지수(CCSI) 최신값은 ${ccsi}입니다. 이게 역대(2008~) 분포에서 몇 번째로 높은지를 0~100으로 매긴 값이 실물 강도입니다.`
          : undefined,
    },
    {
      label: "증시 강세",
      hint: "신고가 근접도",
      value: market,
      heat: market,
      tip:
        gap != null
          ? `코스피는 최근 종가 기준 전고점보다 ${Math.abs(gap)}% 아래입니다. 이 낙폭이 역대(10년) 분포에서 얼마나 얕은지를 0~100으로 매긴 값이 증시 강세입니다.`
          : undefined,
    },
  ];
  return (
    <Shell slug={v.ind?.slug} hit={v.isHit} warm={v.warm} minH={230}>
      <TitleRow desc={v.headline} icon="compare_arrows" name={v.name} />
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <strong style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-.03em", color: v.color, lineHeight: 1 }}>
          {leadWho} <span style={{ fontFamily: MONO }}>{Math.round(Math.abs(lead))}%</span>
        </strong>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: C.sub2 }}>강세</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10 }}>
        {tiles.map((t) => (
          <div key={t.label} style={{ background: C.soft, borderRadius: R.control, padding: 13, display: "flex", flexDirection: "column", gap: 6 }}>
            <span
              className={t.tip ? "hz-tip hz-tip-wide hz-tip-start" : undefined}
              data-tip={t.tip}
              style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11.5, fontWeight: 700, color: C.sub2 }}
            >
              {t.label}
              {t.tip && <Icon name="help" style={{ fontSize: 13, color: C.hint }} />}
            </span>
            <span style={{ fontSize: 11.5, color: C.muted }}>{t.hint}</span>
            {/* 색은 값이 아니라 **그 값이 뜻하는 과열도**(heat)로 낸다 — 위 주석 참고.
                예전엔 '앞서는 쪽'만 파랑이고 나머지는 먹색이라, 같은 눈금의 두 수가 서로 다른
                규칙으로 칠해져 비교가 안 됐다. 어느 쪽이 앞서는지는 위 큰 수치가 이미 말한다. */}
            <strong style={{ fontFamily: MONO, fontSize: 17, fontWeight: 800, color: overheatColor(t.heat) }}>
              {level(t.value)} {Math.round(t.value)}
              <span style={{ fontSize: 12, color: C.sub }}>/100</span>
            </strong>
          </div>
        ))}
      </div>
      <Foot text={v.desc} />
    </Shell>
  );
}

// 초보검색 / 깃헙 봇 / 베스트셀러 — 모양이 둘로 갈린다.
//  · details.vs_avg 가 있으면(네이버 검색지수) '평소 대비 N배' 눈금
//  · 없으면 값 + 초고온 기준선까지의 진행 막대
// 목업이 스파크라인을 걷어냈다. 30일 선은 "언제 뛰었나"를 말하는데, 이 셋의 질문은
// "지금 얼마나 뜨거운가" 하나뿐이라 기준선까지의 거리가 그 답을 그대로 그린다.
function CardTrend({ v, icon }: { v: Pick; icon: string }) {
  const vsAvg = v.details?.vs_avg ?? null;
  const arrow = vsAvg === null || vsAvg === 1 ? "" : vsAvg > 1 ? "↑" : "↓";
  // 진행 막대는 0 ~ 초고온 진입선을 축으로 쓴다. 카드가 "기준선 N"이라고 적는 그 값이다.
  const hot = v.ind?.latest?.details?.hot_threshold ?? null;
  const pct = hot && v.raw !== null ? Math.max(0, Math.min(100, (v.raw / hot) * 100)) : null;
  const chart = v.historyPoints.map((x) => ({ key: x.date, value: x.value }));
  return (
    <Shell slug={v.ind?.slug} hit={v.isHit} warm={v.warm} minH={230}>
      <TitleRow desc={v.headline} icon={icon} name={v.name} />
      {vsAvg !== null ? (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <strong style={{ fontFamily: MONO, fontSize: 32, fontWeight: 800, letterSpacing: "-.03em", color: v.color, lineHeight: 1 }}>
              {vsAvg.toFixed(1)}배
            </strong>
            {/* 화살표·막대·숫자가 **한 색**이어야 한다. 예전엔 숫자만 온도색이고
                화살표·막대는 평균 대비 방향(>1 이면 빨강)이라, 1.1배(과열도 저온) 카드가
                파란 숫자 옆에 빨간 화살표를 달고 있었다 — 한 줄이 두 말을 했다.
                방향은 이미 화살표 모양과 막대가 뻗는 쪽이 말한다. 색은 온도만 맡는다. */}
            {arrow && <span style={{ fontSize: 12.5, fontWeight: 700, color: v.color }}>{arrow}</span>}
            <span style={{ fontSize: 12.5, fontWeight: 600, color: C.sub2 }}>평소 대비</span>
          </div>
          <VsAvg ratio={vsAvg} knob={v.color} />
        </>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <Big disp={v.disp} unit={v.unit} color={v.color} size={32} />
            {v.hotDisp && (
              <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 700, color: C.sub, background: C.chip, borderRadius: R.pill, padding: "5px 10px", whiteSpace: "nowrap" }}>
                초고온 {v.hotDisp}
              </span>
            )}
          </div>
          {/* 진행 막대에서 차트로 되돌렸다(2026-08-03). 이 둘은 값이 하루하루
              오르내리는 계열이라 "지금 어디"보다 "어떻게 움직여 왔나"가 더 읽을 게 많다.
              기준선까지의 거리는 위 칩(초고온 N)이 그대로 말한다. */}
          {chart.length >= 2 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <AreaChart
                points={chart}
                color={v.color}
                tip={(x) => {
                  const g = formatIndicatorValue(x.value, v.ind?.unit ?? "");
                  return `${shortDate(x.key)} · ${g.display}${g.displayUnit}`;
                }}
              />
              {/* 기간은 차트의 캡션이지 큰 수치의 곁말이 아니다 — 차트 밑 오른쪽에 둔다. */}
              <span style={{ alignSelf: "flex-end", fontSize: 11, color: C.sub }}>최근 30일</span>
            </div>
          ) : (
            pct !== null && <HeatFill pct={pct} />
          )}
        </>
      )}
      <Foot text={v.desc} />
    </Shell>
  );
}

// 중앙 기준 감성/카운트 바 (커뮤니티/뉴스)
// 감성 지표(뉴스·커뮤니티) — 과열도가 아니라 비관↔낙관 양극 게이지로 보여준다.
// raw = (긍정-부정)/전체*100 이라 -100~+100 범위. 중앙=중립, 좌=비관, 우=낙관.
// 감성 카드의 헤드라인은 '낙관:비관 비율'(중립 제외) — 카더라 리포트의 테마 막대와
// 같은 언어다. 'N pt'(순감성)는 정확하지만 그 수가 뭔지 설명 없이는 안 읽혔다.
//
// 비율은 raw_value(순감성)만으로 되돌릴 수 없어(중립 건수가 사라진다) 파이프라인이
// details에 남긴 건수를 쓴다. 그 키가 아직 없는 과거 행은 예전 표기로 폴백한다 —
// 파이프라인이 한 번 더 돌면 자연히 새 표기로 바뀐다.
function sentimentRatio(
  details: Record<string, number> | null,
): { pos: number; neg: number; decided: number; total: number; days: number } | null {
  const p = details?.pos_count;
  const n = details?.neg_count;
  if (typeof p !== "number" || typeof n !== "number") return null;
  const decided = p + n;
  // 낙관+비관이 몇 건 안 되면 한두 건에 100:0이 찍혀 실제보다 단정적으로 보인다.
  // 카더라 테마 막대와 같은 하한(8건)을 쓴다.
  if (decided < 8) return null;
  const pos = Math.round((p / decided) * 100);
  // 전체 건수(중립 포함)는 '몇 건을 보고 낸 비율인지' 캡션에 쓴다. 옛 행에 없을 수 있어
  // 없으면 낙관+비관만으로 대신한다.
  const total = typeof details?.total_count === "number" ? details.total_count : decided;
  // 이 건수는 하루치가 아니라 **여러 날 합**이다(파이프라인이 감성 원자를 3일 풀링한다).
  // 며칠을 합쳤는지는 파이프라인이 pool_days 로 남기므로 3을 박지 말고 그걸 읽는다 —
  // 풀링 이전 행이나 시계열이 짧아 2일만 합쳐진 날에 "3일"은 거짓이 된다.
  const days = typeof details?.pool_days === "number" ? details.pool_days : 1;
  return { pos, neg: 100 - pos, decided, total, days };
}

function CardSentiment({
  v,
  icon,
  // 무엇을 센 건수인지는 지표마다 다르다(디시=글, 뉴스=뉴스).
  //
  // 지금은 **풀링이 없는 행에서만** 쓰인다. 건수가 여러 날 합이면 알약이 낱말 대신 창("3일")을
  // 적기 때문이다 — 둘 다 넣을 폭이 없다(아래 알약 주석의 실측표). 파이프라인이 감성 원자를
  // 3일 풀링하므로 실제 화면은 대부분 창 쪽으로 간다.
  //
  // ⚠️ **짧게 유지할 것.** 이 낱말은 아래 알약에 들어가고, 알약은 헤드라인 숫자와 한 줄을
  // 나눠 쓴다(flexWrap). 넘치면 알약이 다음 줄로 내려가면서 그 아래 막대까지 통째로
  // 밀려서, 옆 카드와 막대 높이가 어긋난다.
  countNoun,
}: {
  v: Pick;
  icon: string;
  countNoun: string;
}) {
  const raw = v.raw ?? 0;
  const ratio = sentimentRatio(v.details);
  // 막대는 헤드라인과 **같은 기준**을 써야 한다. 비율 표기가 가능한 날엔 낙관 비중을
  // 그대로 축에 올린다(50=중립). 한 카드 안에서 헤드라인은 낙관인데 막대는 비관을
  // 가리키는 모순이 생기지 않게 하려는 것 — 카더라 센티먼트의 색/라벨 어긋남과 같은 종류의
  // 사고를 여기서 미리 막는다.
  //
  // 건수가 없는 옛 행은 순감성(-100~100) 부호만 쓴다 — 세 칸 막대는 건수가 있어야
  // 그릴 수 있어서, 그 경우엔 반반으로 두고 큰 수치만 순감성으로 적는다.
  const optimistic = ratio ? ratio.pos >= 50 : raw >= 0;
  // 두 칸(비관 : 낙관)으로 나눈다. **중립은 빼고 판정된 것끼리만** 견준다 —
  // 헤드라인의 "63:37" 이 이미 중립을 뺀 비율이라, 막대에 중립 칸을 넣으면 같은 카드
  // 안에서 두 숫자가 다른 분모를 쓰게 된다(2026-08-03 되돌림).
  const negW = ratio ? 100 - ratio.pos : 50;
  const posW = ratio ? ratio.pos : 50;
  return (
    <Shell slug={v.ind?.slug} hit={v.isHit} warm={v.warm} minH={230}>
      <TitleRow desc={v.headline} icon={icon} name={v.name} />
      {ratio ? (
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            {/* 순서는 앱 전체에서 '비관 : 낙관'으로 통일한다(카더라 테마 막대도 동일). */}
            {/* 숫자도 막대와 같은 편을 든다 — 비관은 저온색, 낙관은 초고온색.
                한 색으로 적으면 "63:37" 중 어느 쪽이 어느 편인지 다시 라벨을 봐야 한다. */}
            <strong style={{ fontFamily: MONO, fontSize: 32, fontWeight: 800, letterSpacing: "-.03em", lineHeight: 1 }}>
              <span style={{ color: C.cold }}>{ratio.neg}</span>
              <span style={{ color: C.sub2 }}>:</span>
              <span style={{ color: C.mania }}>{ratio.pos}</span>
            </strong>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: C.sub2 }}>{sentimentTone(ratio.pos).label}</span>
          </div>
          {/* 표본 크기 알약. 낱말을 줄인 건 말맛이 아니라 **폭** 때문이다 — 이 알약은 왼쪽
              헤드라인(숫자 + 톤 라벨)과 한 줄을 나눠 쓰는데, 넘치면 다음 줄로 내려가면서
              아래 막대까지 밀어 옆 카드와 높이가 어긋난다.

              여기 건수는 하루치가 아니라 **N일 합**이라 창을 밝힌다(카더라 테마 막대와 같은
              규칙 — 창이 다른 수치를 라벨 없이 나란히 두지 않는다). 창을 적을 자리는 세는
              낱말(글·뉴스) 자리를 뺏어서 냈다. 아래 실측대로 **둘 다 넣을 폭이 없고**, 무엇을
              센 건지는 카드 이름과 아이콘에 남지만 창은 어디에도 안 남기 때문이다.

              4열(카드 247px, 사다리 전 구간의 최솟값)에서 잰 '줄바꿈 없이 버티는 최소 행 폭'.
              왼쪽 묶음은 톤 라벨이 "중립"이냐 "비관 우세"냐로 120 ↔ 144 를 오가므로 **넉 자
              라벨을 최악**으로 잡는다.
                글 8,961건            233  ✓ 여유 14  (옛 표기)
                3일 8,961건           240  ✓ 여유 7   ← 지금
                3일간 8,961건         250  ✗
                3일 글 8,961건        253  ✗ (낱말과 창을 둘 다 넣으면 넘친다)
                글 8,961건 · 3일      259  ✗
                최근 3일 8,961건      263  ✗
              ⚠️ 뉴스는 원래도 아슬아슬했다(뉴스 4,576건 = 243, 여유 4). 창 표기로 240 이 돼
              3px 벌었지만, **다섯 자리가 되면 248 로 여전히 넘친다**(옛 표기는 250). 그때는
              낱말이 아니라 이 줄의 구조를 고쳐야 한다. */}
          <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 700, color: C.sub, background: C.chip, borderRadius: R.pill, padding: "5px 10px", whiteSpace: "nowrap" }}>
            {ratio.days > 1 ? `${ratio.days}일` : countNoun} {ratio.total.toLocaleString("ko-KR")}건
          </span>
        </div>
      ) : (
        <Big disp={`${raw > 0 ? "+" : ""}${v.disp}`} unit={v.unit} color={v.color} size={32} sub="순감성" />
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", gap: 4, height: 12 }}>
          {/* 풋/콜 카드와 같은 어법이다 — 과열 쪽(낙관·콜)이 초고온색, 반대쪽(비관·풋)이
              저온색. 두 카드가 같은 '한쪽으로 쏠렸나'를 묻는 그림이라 색도 같아야 한다. */}
          <div style={{ width: `${negW}%`, borderRadius: "99px 0 0 99px", background: C.cold }} />
          <div style={{ width: `${posW}%`, borderRadius: "0 99px 99px 0", background: C.mania }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: 11.5, fontWeight: optimistic ? 600 : 700, color: C.cold }}>비관</span>
          <span style={{ fontSize: 11.5, fontWeight: optimistic ? 700 : 600, color: C.mania }}>낙관</span>
        </div>
      </div>
      <Foot text={v.desc} />
    </Shell>
  );
}

// 재테크 유튜브 조회수 — 평소(누적 평균) vs 오늘.
// 거래대금 급증도와 **같은 그림**이다(가로 두 줄). 같은 질문("평소보다 몇 배냐")에는
// 같은 그림을 쓴다는 규칙이라, 한쪽을 고치면 다른 쪽도 같이 봐야 한다.
function CardYoutube({ v }: { v: Pick }) {
  const ratio = v.raw && v.threshold ? v.raw / v.threshold : null;
  const fmt = (n: number) => {
    const f = formatIndicatorValue(n, v.ind?.unit ?? "");
    return `${f.display}${f.displayUnit}`;
  };
  const max = Math.max(v.threshold ?? 0, v.raw ?? 0) || 1;
  const rows = [
    { label: "평소", value: v.threshold, fill: "var(--c-blue-5)", strong: false },
    { label: "오늘", value: v.raw, fill: C.blue, strong: true },
  ];
  return (
    <Shell slug={v.ind?.slug} hit={v.isHit} warm={v.warm} minH={230}>
      <TitleRow desc={v.headline} icon="play_circle" name={v.name} />
      {ratio !== null && (
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <strong style={{ fontFamily: MONO, fontSize: 32, fontWeight: 800, letterSpacing: "-.03em", color: v.color, lineHeight: 1 }}>
            {ratio.toFixed(1)}배
          </strong>
          {/* 초보 검색량 카드와 같은 화살표 규칙 — 기준은 1배(평소)다. */}
          {ratio !== 1 && (
            <span style={{ fontSize: 12.5, fontWeight: 700, color: ratio < 1 ? C.cold : C.hot }}>{ratio > 1 ? "↑" : "↓"}</span>
          )}
          <span style={{ fontSize: 12.5, fontWeight: 600, color: C.sub2 }}>평소 대비</span>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {rows.map((r) => (
          <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 34, flexShrink: 0, fontSize: 12, fontWeight: 600, color: C.sub2 }}>{r.label}</span>
            <div style={{ flex: 1, height: 9, borderRadius: R.pill, background: C.track, overflow: "hidden", minWidth: 0 }}>
              <div style={{ width: `${((r.value ?? 0) / max) * 100}%`, height: "100%", borderRadius: R.pill, background: r.fill }} />
            </div>
            <span style={{ width: 78, textAlign: "right", fontFamily: MONO, fontSize: 12.5, fontWeight: 700, color: r.strong ? C.ink : C.label }}>
              {r.value != null ? fmt(r.value) : "-"}
            </span>
          </div>
        ))}
      </div>
      <Foot text={v.desc} />
    </Shell>
  );
}

// 여윳돈이 향하는 곳 — 명품·수입차 + 오마카세·파인다이닝. 지표 둘이 한 카드에 들어가는
// 유일한 카드다. 목업은 세로 구분선으로 반 가르지 않고 **두 줄을 위아래로** 쌓고,
// 눈금 라벨(적음·평소·많음)은 아래쪽 한 번만 적는다.
function SubSpend({ v, icon, showScale }: { v: Pick; icon: string; showScale: boolean }) {
  const ratio = v.details?.vs_avg ?? null;
  // 화살표와 색이 **같은 경계**를 써야 한다. 예전엔 화살표가 `ratio === 1` 로만 갈려서,
  // 0.98배(화면엔 "1.0배")가 색은 중립인데 화살표만 ↓ 로 떴다 — 한 줄이 두 말을 했다.
  // ±0.05 = 소수 첫째 자리로 1.0 으로 보이는 폭. 이 안에서는 화살표를 안 그린다.
  const flat = ratio === null || Math.abs(ratio - 1) < 0.05;
  const arrow = flat ? "" : (ratio as number) > 1 ? "↑" : "↓";
  const arrowColor = v.color;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Icon name={icon} style={{ fontSize: 18, color: "var(--c-blue-3)" }} />
        <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700, color: C.label, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {v.name}
        </span>
        <strong
          style={{
            fontFamily: MONO,
            fontSize: 16,
            fontWeight: 800,
            // 막대와 같은 색이어야 한다 — 숫자가 파랑인데 막대가 빨강이면 한 줄이 두 말을 한다.
            // 그 "같은 색"은 **온도**다(2026-08-04). 방향으로 맞췄더니 이번엔 이 줄만
            // 다른 카드와 규칙이 갈렸다.
            color: v.color,
            whiteSpace: "nowrap",
          }}
        >
          {ratio !== null ? `${ratio.toFixed(1)}배` : `${v.disp}${v.unit}`}
          {arrow && <span style={{ fontSize: 12, color: arrowColor }}> {arrow}</span>}
        </strong>
      </div>
      {ratio !== null && <VsAvg ratio={ratio} knob={v.color} showScale={showScale} />}
    </div>
  );
}

function CardSpending({ luxury, dining }: { luxury: Pick; dining: Pick }) {
  // 카드에 큰 수치가 없어 시트에서 이 셀만 리드아웃 자리가 비어 있었다(25칸이 같은
  // 높이에서 같은 종류를 만나야 표로 읽힌다). 지표가 둘인데 하나만 뽑아야 하므로
  // **평소에서 더 많이 벗어난 쪽**을 세운다 — 그게 이 카드가 하려는 말이다.
  const lr = luxury.details?.vs_avg ?? null;
  const dr = dining.details?.vs_avg ?? null;
  const lead =
    lr === null && dr === null
      ? null
      : lr === null
        ? { v: dining, r: dr as number, other: "명품" }
        : dr === null
          ? { v: luxury, r: lr, other: "외식" }
          : Math.abs(dr - 1) >= Math.abs(lr - 1)
            ? { v: dining, r: dr, other: "명품" }
            : { v: luxury, r: lr, other: "외식" };
  // 나머지 한쪽이 평소 수준이면 그렇다고 적는다 — 큰 숫자 하나만 두면 "둘 중 무엇이냐"가
  // 안 보인다. 0.05 는 소수 첫째 자리로 적었을 때 1.0 으로 보이는 폭이다.
  const otherR = lead && lead.other === "명품" ? lr : dr;
  const otherWord =
    otherR === null ? "" : Math.abs(otherR - 1) < 0.05 ? `${lead?.other}은 평소 수준` : `${lead?.other} ${otherR.toFixed(1)}배`;
  // 지표 둘이 한 셀이라 스크롤 목적지 id 는 하나만 붙는다(명품). 오마카세로 오는
  // 스크롤은 ANCHOR_ALIAS 가 이 id 로 돌려보낸다.
  return (
    <Shell slug={luxury.ind?.slug} hit={luxury.isHit || dining.isHit} warm={luxury.warm || dining.warm} minH={230}>
      <TitleRow icon="local_mall" name="여윳돈이 향하는 곳" desc="명품·외식 검색량으로 본 소비 심리" />
      {lead && (
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <strong style={{ fontFamily: MONO, fontSize: 32, fontWeight: 800, letterSpacing: "-.03em", color: lead.v.color, lineHeight: 1, whiteSpace: "nowrap" }}>
            {lead.r.toFixed(1)}배
          </strong>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: C.sub2, whiteSpace: "nowrap" }}>
            {lead.other === "명품" ? "외식" : "명품"} 검색{otherWord && ` · ${otherWord}`}
          </span>
        </div>
      )}
      <SubSpend v={luxury} icon="shopping_bag" showScale={false} />
      <SubSpend v={dining} icon="restaurant" showScale />
      {/* 지표가 둘이지만 설명은 하나로 합쳐 적는다. 두 문장을 이어 붙이면 이 카드만
          설명이 두 줄이 되어 같은 행 카드들과 밑선이 어긋난다. 제목("여윳돈이 향하는 곳")도
          DB 가 아니라 여기서 정하므로, 합친 문장도 같은 자리에 두는 게 맞다. */}
      <Foot text="명품·외식 검색이 늘면 여윳돈이 돈다는 뜻입니다" />
    </Shell>
  );
}

// 코인 투자 과열 지수 — 김치 프리미엄 + 코인 거래대금.
//
// 큰 숫자는 다른 카드와 같은 과열도(v.capped)다. 예전엔 raw_value 를 그대로 적었는데,
// 2026-08-01 재보정이 ceiling 85 를 얹으면서 둘이 갈렸다(과열도 = raw/85×100) —
// 초고온 배지가 켜지는 자리가 raw 63.75 라, 배지가 켜지는 날이면 언제나 75 에 못 미치는
// 수 옆에 배지가 붙게 돼 있었다. 레버리지 카드와 같은 이유로 같이 맞춘다.
function CardUpbit({ v }: { v: Pick }) {
  const dt = v.details;
  const heat = v.capped === null ? null : Math.round(v.capped);
  const volLabel = (x: number) => (x >= 100 ? "HIGH" : x >= 60 ? "MID" : "LOW");
  const premium = dt?.kimchi_premium ?? null;
  return (
    <Shell slug={v.ind?.slug} hit={v.isHit} warm={v.warm} minH={230}>
      <TitleRow desc={v.headline} icon="currency_bitcoin" name={v.name} />
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <strong style={{ fontFamily: MONO, fontSize: 32, fontWeight: 800, letterSpacing: "-.03em", color: v.color, lineHeight: 1 }}>
          {heat ?? "-"}
          <span style={{ fontSize: 17, fontWeight: 700, color: C.sub }}>/100</span>
        </strong>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: C.sub2 }}>과열도</span>
      </div>
      <HeatFill pct={heat ?? 0} />
      {dt && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10 }}>
          <div style={{ background: C.soft, borderRadius: R.control, padding: 13, display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: C.sub2 }}>김치 프리미엄</span>
            <strong style={{ fontFamily: MONO, fontSize: 17, fontWeight: 800, color: v.color }}>
              {premium !== null ? `${premium > 0 ? "+" : ""}${premium.toFixed(1)}%` : "-"}
            </strong>
          </div>
          <div style={{ background: C.soft, borderRadius: R.control, padding: 13, display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: C.sub2 }}>거래량 강도</span>
            {/* HIGH/MID/LOW 도 0~100 진행률에서 나온 말이라 같은 밴드 규칙으로 칠한다.
                파랑으로 못박아 두면 HIGH 일 때도 차분한 색이라 값과 색이 반대말을 한다. */}
            <strong style={{ fontSize: 17, fontWeight: 800, color: overheatColor(dt.volume_progress ?? 0) }}>
              {volLabel(dt.volume_progress ?? 0)}
            </strong>
          </div>
        </div>
      )}
      <Foot text={v.desc} />
    </Shell>
  );
}

// 고점권 외국인 매도 — 최근 5거래일 누적 + 일별 막대.
//
// 헤드라인은 raw 가 아니라 details.cum5(게이트 전 5일 누적)다. raw 는 고점권이 아니거나
// 외국인이 사는 중이면 0 인데, 최근 5년 기준 그런 날이 79% 라 raw 를 그대로 크게 띄우면
// 카드가 대부분의 날에 "0" 한 글자만 말하게 된다.
//
// ⚠️ 목업이 0선 기준 **양방향 막대를 한 방향**으로 바꿨다. 방향(순매수/순매도) 대신
// 크기만 그린다는 뜻이라, 부호는 색이 아니라 **막대 툴팁과 누적 수치의 라벨**이 들고 있다.
// 막대 색은 파랑 스케일에서 크기순으로 고른다 — 가장 크게 오간 날이 가장 진하다.
function CardNetBuy({ v }: { v: Pick }) {
  const dt = v.details as unknown as {
    daily5?: number[]; dates5?: number[]; cum5?: number; high_gap?: number; at_high?: number;
  } | null;
  const cum = dt?.cum5 ?? v.raw ?? 0;
  const atHigh = dt?.at_high === 1;
  const gap = dt?.high_gap;
  const daily = dt?.daily5 ?? [];
  // 거래일은 주말·휴장을 건너뛰어 화면에서 역산할 수 없다 — 파이프라인이 넣어준 값을 쓴다.
  const dates = dt?.dates5 ?? [];
  const ymdShort = (ymd: number) => shortDate(`${String(ymd).slice(0, 4)}-${String(ymd).slice(4, 6)}-${String(ymd).slice(6, 8)}`);
  const maxAbs = Math.max(1, ...daily.map((d) => Math.abs(d)));
  const isBuy = cum >= 0;
  return (
    <Shell slug={v.ind?.slug} hit={v.isHit} warm={v.warm} minH={230}>
      <TitleRow desc={v.headline} icon="public" name={v.name} />
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {/* ⚠️ 기간("최근 5거래일")을 큰 수치 **위**에 한 줄로 두면 안 된다. 그 한 줄만큼
            이 셀의 큰 수치가 아래로 밀려, 같은 줄에 놓인 다른 카드들의 큰 수치와 가로선이
            어긋난다 — 시트의 제1규칙이 "같은 줄의 메인 지수는 같은 높이"다.
            기간은 다른 카드들과 똑같이 수치 옆 sub 로 붙인다. */}
        {/* 색은 **온도**다. 매수/매도 방향으로 칠하면 이 카드만 규칙이 갈린다 — 게이트
            (52주 고점 −5%)를 못 넘은 날은 아무리 크게 팔아도 과열도가 0(저온)인데,
            숫자만 빨갛게 떠서 셀이 뜨거운 것처럼 읽혔다. 방향은 부호(+/−)와 아래 곁말
            ("순매도")이 이미 말한다. */}
        <Big
          disp={`${cum >= 0 ? "+" : ""}${formatEokMixed(cum)}`}
          color={v.color}
          size={32}
          sub={`최근 5거래일 ${isBuy ? "순매수" : "순매도"}`}
        />
        {/* 게이트 상태. 이 카드에서 가장 자주 받을 질문이 "왜 과열도가 0인가" 인데,
            답이 여기 있다 — 고점권이 아니면 아무리 크게 팔아도 점수에 안 들어간다.
            조건이 gap 을 보는 건 옛 행(개인 순매수 시절)에 판정 자료가 없기 때문이다. */}
        {gap != null && (
          <span
            style={{
              alignSelf: "flex-start",
              fontSize: 11.5,
              fontWeight: 700,
              padding: "4px 10px",
              borderRadius: R.pill,
              color: atHigh ? "var(--c-hot-ink)" : "var(--c-cold-ink)",
              background: atHigh ? "var(--c-mania-tint)" : "var(--c-blue-tint)",
            }}
          >
            {atHigh ? "고점권" : "고점권 아님"}
          </span>
        )}
      </div>
      {daily.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {/* 0선을 차트 전체에 한 줄로 긋고 막대가 위(순매수)·아래(순매도)로 자란다.
              방향이 곧 뜻이라 크기만 그리면 "샀나 팔았나"가 사라진다(2026-08-03 되돌림). */}
          <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ position: "absolute", left: 0, right: 0, top: "50%", height: 1, background: C.line }} />
            {daily.map((d, i) => {
              const px = Math.max(3, Math.round((Math.abs(d) / maxAbs) * 28));
              const buy = d >= 0;
              const ymd = dates[i];
              const label = ymd
                ? `${ymdShort(ymd)} · ${d >= 0 ? "+" : ""}${formatEokMixed(d)} ${d >= 0 ? "순매수" : "순매도"}`
                : `${d >= 0 ? "+" : ""}${formatEokMixed(d)}`;
              return (
                <div key={i} className="hz-tip" data-tip={label} style={{ flex: 1, position: "relative", height: 64 }}>
                  <div
                    style={{
                      position: "absolute",
                      left: "16%",
                      right: "16%",
                      height: px,
                      borderRadius: 4,
                      background: buy ? C.cold : C.hot,
                      ...(buy ? { bottom: "50%" } : { top: "50%" }),
                    }}
                  />
                </div>
              );
            })}
          </div>
          {/* 날짜는 막대 칸 **밖**에 둔다. 칸 안에 두면 가장 크게 판 날(= 가장 봐야 할 날)의
              막대가 라벨을 파고든다 — 예전에 실제로 9.5px 겹쳤다. */}
          {dates.length > 0 && (
            <div style={{ display: "flex", gap: 8 }}>
              {daily.map((_, i) => (
                <span key={i} style={{ flex: 1, textAlign: "center", fontFamily: MONO, fontSize: 11, color: C.sub }}>
                  {dates[i] ? ymdShort(dates[i]) : ""}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
      <Foot text={v.desc} />
    </Shell>
  );
}

/**
 * 급등 종목 비율 — 하루에 10% 넘게 오른 종목이 전체의 몇 %인가.
 *
 * 큰 수치를 퍼센트가 아니라 **종목 수**로 둔다. 이 지표에서 사람이 실제로 궁금해하는 게
 * "14.74%" 가 아니라 "뭐가 뛰었나"라서다. 퍼센트는 곁말로 분모와 함께 붙인다.
 *
 * ⚠️ 목업에서 등락률이 **알약 배지**가 됐고 색은 카드 상태(--card-accent)를 따른다.
 * 예전엔 30/20/10 에서 끊어 줄마다 강도를 색으로 갈랐는데, 새 팔레트가 빨강을 초고온에만
 * 쓰기로 해서 그 세 단계가 카드 안에서 갈 자리가 없어졌다. 강도별 개수는 아래 '외 N개'
 * 툴팁이 그대로 들고 있다.
 */
function CardLimitUp({ v }: { v: Pick }) {
  const dt = v.details as unknown as {
    limit_n?: number; up20_n?: number; up10_n?: number; listed_n?: number;
    limit_names?: unknown[]; up20_names?: unknown[]; up10_names?: unknown[];
  } | null;

  // 옛 행은 종목명 문자열 배열이고 새 행은 {n, p} 객체 배열이다. 둘 다 받는다.
  const norm = (arr: unknown[] | undefined) =>
    (arr ?? []).map((x) =>
      typeof x === "string" ? { n: x, p: null as number | null } : (x as { n: string; p: number }),
    );

  const buckets = [
    { label: "상한가", n: dt?.limit_n ?? 0, items: norm(dt?.limit_names) },
    { label: "+20~29%", n: dt?.up20_n ?? 0, items: norm(dt?.up20_names) },
    { label: "+10~20%", n: dt?.up10_n ?? 0, items: norm(dt?.up10_names) },
  ];
  const surged = buckets.reduce((a, b) => a + b.n, 0);
  const listed = dt?.listed_n ?? 0;

  const ROWS = 5;
  const rank = buckets
    .flatMap((b) => b.items.map((it) => ({ ...it, label: b.label })))
    .sort((a, b) => (b.p ?? 0) - (a.p ?? 0))
    .slice(0, ROWS);
  const rest = Math.max(0, surged - rank.length);

  return (
    <Shell slug={v.ind?.slug} hit={v.isHit} warm={v.warm} minH={230}>
      {/* KRX 일별매매정보는 하루이틀 늦게 열린다. 히어로가 페이지 전체를 "오늘 기준"으로
          액자에 넣으므로 이 카드만은 자기 자료일을 계속 밝힌다. */}
      <TitleRow desc={v.headline} icon="bolt" name={v.name} badge={sourceDateBadge(v) ?? "최근 거래일 기준"} />
      <Big
        disp={String(surged)}
        color={v.color}
        size={32}
        sub={`${listed ? `${listed.toLocaleString("ko-KR")}종목 중 ` : ""}${(v.raw ?? 0).toFixed(2)}%`}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {rank.length === 0 ? (
          <span style={{ fontSize: 12.5, color: C.sub }}>10% 넘게 오른 종목이 없습니다</span>
        ) : (
          rank.map((r, i) => (
            <div key={`${r.n}-${i}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, minWidth: 0 }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: C.label, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.n}
              </span>
              <span
                style={{
                  flexShrink: 0,
                  fontFamily: MONO,
                  fontSize: 12,
                  fontWeight: 800,
                  color: "var(--card-accent-ink, var(--c-cold-ink))",
                  background: "var(--card-accent-tint, var(--c-blue-tint))",
                  borderRadius: R.pill,
                  padding: "3px 9px",
                }}
              >
                {r.p === null ? r.label : `+${r.p.toFixed(1)}%`}
              </span>
            </div>
          ))
        )}
        {rest > 0 && (
          <span
            className="hz-tip hz-tip-wide hz-tip-lines hz-tip-start"
            data-tip={
              buckets.map((b) => `${b.label}: ${b.n}종목`).join("\n") +
              (listed ? `\n전체: ${listed.toLocaleString("ko-KR")}종목` : "")
            }
            style={{ fontSize: 11.5, color: C.sub }}
          >
            외 {rest}개
          </span>
        )}
      </div>
      <Foot text={v.desc} />
    </Shell>
  );
}

// 옵션 풋/콜 비율 — 콜(상승 베팅) vs 풋(하락 대비) 거래량 비중.
// 목업은 두 칸을 **gap 4 로 떼어** 각자 알약으로 두고, 아래에 비중과 뜻풀이를 두 줄로 깐다.
function CardPutCall({ v }: { v: Pick }) {
  const dt = v.details as unknown as {
    put_vol?: number; call_vol?: number; put_eok?: number; call_eok?: number;
  } | null;
  const put = dt?.put_vol ?? 0;
  const call = dt?.call_vol ?? 0;
  // 계약 수는 행사가마다 단가가 달라 규모 감각을 못 준다 — 툴팁엔 거래대금을 쓴다.
  const tip = (kind: "call" | "put") => {
    const vol = kind === "call" ? call : put;
    const eok = kind === "call" ? dt?.call_eok : dt?.put_eok;
    const head = kind === "call" ? "콜(상승 베팅)" : "풋(하락 대비)";
    return eok != null
      ? `${head} · ${formatEokMixed(eok)} · ${vol.toLocaleString("ko-KR")}계약`
      : `${head} · ${vol.toLocaleString("ko-KR")}계약`;
  };
  const total = put + call || 1;
  const callShare = (call / total) * 100;
  const ratio = call > 0 ? put / call : 0;
  const greedy = callShare >= 50;
  return (
    <Shell slug={v.ind?.slug} hit={v.isHit} warm={v.warm} minH={230}>
      <TitleRow desc={v.headline} icon="casino" name={v.name} />
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <Big disp={ratio.toFixed(2)} color={v.color} size={32} sub="풋/콜" />
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--card-accent-ink)", background: "var(--card-accent-tint)", borderRadius: R.pill, padding: "5px 10px", whiteSpace: "nowrap" }}>
          {greedy ? "콜 우세" : "풋 우세"}
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", gap: 4, height: 12 }}>
          {/* 콜은 상승 베팅(탐욕) 쪽이라 초고온색, 풋은 하락 대비라 저온색이다. */}
          <div className="hz-tip" data-tip={tip("call")} style={{ width: `${callShare}%`, borderRadius: "99px 0 0 99px", background: C.mania }} />
          <div className="hz-tip" data-tip={tip("put")} style={{ width: `${100 - callShare}%`, borderRadius: "0 99px 99px 0", background: C.cold }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.mania }}>콜 {Math.round(callShare)}%</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.cold }}>풋 {Math.round(100 - callShare)}%</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: 11, color: C.sub }}>콜 = 상승 베팅</span>
          <span style={{ fontSize: 11, color: C.sub }}>풋 = 하락 대비</span>
        </div>
      </div>
      <Foot text={v.desc} />
    </Shell>
  );
}

// 증권 앱 인기차트 순위 — 차트인 앱 수 + 최고 순위 + 앱 목록.
// 목업은 목록을 **회색 행**으로 깔고 순위를 흰 알약으로 앞에 세운다. 이름 길이가 제각각이라
// 오른쪽 정렬한 숫자는 눈이 매번 다른 자리를 찾아야 했는데, 왼쪽 알약은 자리가 고정이다.
function CardBrokerage({ v }: { v: Pick }) {
  const count = v.details?.count ?? 0;
  const topRank = v.details?.top_rank ?? null;
  const charted = (v.details as unknown as { charted?: { name: string; rank: number }[] })?.charted ?? [];
  // 긴 앱 이름을 짧게: 첫 구분자(-, (, ,) 앞부분만, 18자 제한
  const shortName = (n: string) => (n.split(/[-(,]/)[0].trim().slice(0, 18) || n);
  return (
    <Shell slug={v.ind?.slug} hit={v.isHit} warm={v.warm} minH={230}>
      <TitleRow desc={v.headline} icon="leaderboard" name={v.name} />
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <Big disp={`${count}개`} color={v.color} size={32} sub="인기차트 진입" />
        {topRank !== null && (
          <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: "var(--card-accent-ink)", background: "var(--card-accent-tint)", borderRadius: R.pill, padding: "5px 10px", whiteSpace: "nowrap" }}>
            최고 {topRank}위
          </span>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {charted.slice(0, 4).map((app, i) => (
          <div key={`${app.name}-${i}`} style={{ display: "flex", alignItems: "center", gap: 10, background: C.soft, borderRadius: 12, padding: "9px 12px", minWidth: 0 }}>
            <span style={{ flexShrink: 0, fontFamily: MONO, fontSize: 11.5, fontWeight: 800, color: i === 0 ? "var(--c-cold-ink)" : C.sub, background: C.card, borderRadius: 8, padding: "3px 8px" }}>
              {app.rank}위
            </span>
            <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: C.label, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {shortName(app.name)}
            </span>
          </div>
        ))}
      </div>
      <Foot text={v.desc} />
    </Shell>
  );
}

/**
 * 섹션 머리 — [제목 + 카드 수] ... [초고온 N].
 *
 * 가로줄을 걷었다. 줄은 "여기서부터 다른 묶음"이라는 것만 말하는데, 목업은 그 자리에
 * **숫자 둘**을 넣는다 — 이 묶음이 몇 장인지, 그중 몇 장이 지금 뜨거운지.
 *
 * 초고온 배지는 0일 때 회색이다. 빨간 알약에 "초고온 0"이라고 적으면 색이 먼저 읽혀서
 * 뜨겁다는 인상이 남는다. 색이 곧 값이어야 한다.
 *
 * ⚠️ count 는 **카드 수**지 지표 수가 아니다(감성은 명품·오마카세가 한 장이고, 시장엔
 * '준비 중' 카드가 한 장 더 있다). 사이드바의 SECTION_NAV 와 같은 값이라 함께 볼 것.
 */
function SectionHeading({ title, count, id }: { title: string; count: number; id: string }) {
  return (
    // 시트 위에 얹는 **배지**다. 예전엔 19px 굵은 제목 + 개수 알약 + 초고온 배지가 한 줄을
    // 다 썼고(시트가 '두 번째 화면'처럼 갈라 보였다), 그걸 걷어 10.5px 마이크로 캡스만
    // 남겼더니 이번엔 반대로 회색 바탕에 글자만 떠서 묶음의 시작이 안 짚였다.
    // 판을 깔되 크기는 미세 라벨 쪽에 두는 것이 그 사이다.
    //
    // 초고온 개수 배지는 걷은 그대로 둔다. 사라진 정보는 아니다 — 히어로가 '지표 분포'로
    // 전체 개수를, 브리핑 첫 문단이 "시장 지표 N개, 감성 지표 M개"로 묶음별 개수를 이미
    // 말한다. 같은 수를 화면에서 세 번 적고 있었다.
    //
    // 생김새는 .hz-section-badge(globals.css)가 진다 — 카더라·MDD 의 같은 줄도 이 클래스를
    // 쓰므로, 인라인으로 두면 페이지마다 값이 갈린다.
    //
    // marginTop 만 10 으로 누른다. 기준은 세 페이지 공통 "위 30 / 아래 16"인데, 이 배지를
    // 감싼 <section> 은 바깥 격자에서 gap 20 으로 떨어져 있어(카더라·MDD 는 16) 클래스
    // 기본값 14 를 그대로 쓰면 혼자 34 가 된다. 30 − 20 = 10.
    //
    // h2 와 id 는 유지한다 — 문서 구조상 이 줄이 묶음의 제목인 것도, 딥링크가 걸릴 자리인
    // 것도 그대로다(바뀐 건 생김새지 역할이 아니다).
    <div id={id} className="hz-section-badge" style={{ marginTop: 10 }}>
      <h2>{title}</h2>
      <span className="hz-section-badge-n">{count}</span>
    </div>
  );
}

// ── 페이지 ────────────────────────────────────────────────────────
// 목업에서 명시적으로 배치·결합·순서가 정해진 slug들. 이 목록에 없는
// 공개 지표는 각 섹션 끝에 일반 카드로 덧붙여 자동 노출을 유지한다.
const LAID_OUT = new Set([
  "buffett_index", "leverage_etf_volume", "market_actions_30d", "turnover_concentration",
  "kospi_high_gap", "kospi_speed_60d", "vkospi", "kospi_asia_relative_strength",
  "kospi_gold_ratio", "kospi_volume_surge", "usdkrw_volatility",
  "foreign_sell_at_high", "put_call_ratio", "limit_up_breadth",
  "naver_search_trend", "dcinside_post_count", "news_sentiment", "bestseller_finance_ratio",
  "youtube_finance_search_views", "luxury_consumption_index", "fine_dining_search_index",
  "upbit_speculation_index", "github_trading_bot_repos", "brokerage_app_rank",
  "small_business_crisis_index",
]);

const FALLBACK_ICONS: Record<string, string> = {
  시장: "insights",
  감성: "tag",
};

function GenericCard({ v, icon }: { v: Pick; icon: string }) {
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

export default async function Home() {
  const [dailyScore, indicators, topGaps, kospiPath] = await Promise.all([
    getLatestDailyScore(),
    getPublicIndicators(),
    getTopStockHighGaps(3),
    // 상승 속도 카드의 60일 궤적. 내부용 지표라 getPublicIndicators 에 안 잡힌다.
    getKospiCloseSeries(61),
  ]);

  const bySlug = new Map(indicators.map((i) => [i.slug, i]));
  const p = (slug: string) => pick(bySlug.get(slug));
  // 카드 isHit과 완전히 동일한 기준(youtube 예외 포함)으로 히어로 카운트를 맞춘다.
  const countHits = (cat: IndicatorCategory) =>
    indicators.filter((i) => i.category === cat && pick(i).isHit).length;

  const extra = (cat: IndicatorCategory) =>
    indicators.filter((i) => i.category === cat && !LAID_OUT.has(i.slug));

  // 히어로 '지표 분포' — 25개를 네 구간으로 센다.
  // 카드의 구간 판정(overheatColor)·초고온 배지(isHit)와 **같은 값**을 쓴다: capped(0~100)
  // 를 stageForScore 에 넣는다. 다른 기준으로 세면 "초고온 3개"라고 적어 놓고 시트에는
  // 빨간 셀이 둘만 보이는 일이 난다.
  // capped 가 null 인 지표(자료가 아직 안 온 것)는 **빼고** 센다 — isHit 은 null 을 0 으로
  // 떨어뜨리지만, 그건 '초고온이 아니다'를 판정하려는 것이지 '저온이다'라는 뜻이 아니다.
  //
  // 세는 김에 **이름도 같이 담는다** — 줄에 마우스를 올리면 그 구간의 지표가 목록으로
  // 열린다. 개수와 목록이 같은 순회에서 나오므로 둘이 갈릴 자리가 없다.
  const bandItems: BandItem[][] = [[], [], [], []];
  for (const i of indicators) {
    const v = pick(i).capped;
    if (v === null) continue;
    bandItems[BAND_LABELS.indexOf(stageForScore(v))].push({ slug: i.slug, name: i.name, heat: v });
  }
  // 구간 안에서는 뜨거운 것부터. 목록이 열두 줄까지 가는 구간이 있어서, 순서가 없으면
  // 그 구간에서 무엇이 경계에 가까운지가 안 읽힌다.
  for (const list of bandItems) list.sort((a, b) => b.heat - a.heat);
  const bandCounts = BAND_LABELS.map((label, i) => ({
    label,
    count: bandItems[i].length,
    fill: DIST_FILL[i],
    items: bandItems[i],
  }));
  const bandTotal = bandCounts.reduce((a, b) => a + b.count, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {dailyScore ? (
              <Hero
                dailyScore={dailyScore}
                tradHits={countHits("시장")}
                socialHits={countHits("감성")}
                bandCounts={bandCounts}
                bandTotal={bandTotal}
              />
            ) : (
              <section style={{ background: C.card, borderRadius: 16, padding: 44, textAlign: "center", color: C.sub }}>
                아직 계산된 스코어가 없습니다.
              </section>
            )}

            {/* 시장 지표 (category=시장) */}
            <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <SectionHeading id="market" title="시장 지표" count={15} />
              <div className="hz-cards">
                {/* 순서 = 가중치(config/indicator_weights.py) × 직관성 × 변동성.
                    ① 가중치 1·2위(4.5/4.0)를 2칸으로 맨 앞에 — 둘 다 설명이 필요 없는 지표다.
                    ② 그 다음 핵심 수급·심리를 1칸으로 묶고,
                    ③ 콘텐츠가 풍부한 2칸 카드들, ④ 해석이 한 단계 필요한 지표 순.
                    버핏지수는 예전에 맨 앞이었지만 분기 GDP 기반이라 30일 변동계수가
                    0.04로 거의 안 움직여(가중치 주석의 "느림·비타이밍"과 같은 이유) 뒤로 뺐다. */}
                <CardHighGap v={p("kospi_high_gap")} tops={topGaps} />
                <CardVolume v={p("kospi_volume_surge")} />
                <CardSpeed v={p("kospi_speed_60d")} path={kospiPath} />
                <CardLimitUp v={p("limit_up_breadth")} />
                <CardNetBuy v={p("foreign_sell_at_high")} />
                <CardTurnover v={p("turnover_concentration")} />
                <CardPutCall v={p("put_call_ratio")} />
                <CardMarketActions v={p("market_actions_30d")} />
                <CardVkospi v={p("vkospi")} />
                <CardLeverage v={p("leverage_etf_volume")} />
                <CardBuffett v={p("buffett_index")} />
                <CardGoldRatio v={p("kospi_gold_ratio")} />
                <CardFx v={p("usdkrw_volatility")} />
                <CardAsia v={p("kospi_asia_relative_strength")} />
                <CardComingSoon />
                {/* 순서 = 가중치 × 직관성 × 변동성. 칸 합계 20으로 5행이 정확히 채워진다.
                    VIX 대비 VKOSPI 스프레드는 내렸다 — 1년의 76%가 과열도 0이라 종합점수에
                    기여하지 못했고, VKOSPI 에서 파생된 지표라 VKOSPI 카드와 겹쳤다.
                    그 한 칸을 버핏지수(1→2칸)로 돌려 총량은 그대로다.
                    행 구성: [신고가2·거래대금·예탁금] [VKOSPI·순매수·풋콜·쏠림]
                             [안전장치2·위험자산2] [버핏2·레버리지2]
                             [환율·아시아2·준비중] */}
                {extra("시장").map((i) => (
                  <GenericCard key={i.id} v={pick(i)} icon={FALLBACK_ICONS["시장"]} />
                ))}
              </div>
            </section>

            {/* 감성 지표 (category=감성) */}
            <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <SectionHeading id="sentiment" title="감성 지표" count={10} />
              <div className="hz-cards">
                {/* 시장 지표와 같은 원칙으로 순서만 바꿨다 — 칸 수는 기존과 동일(12칸).
                    검색량(가중치 3.0)과 코인 투기를 앞세우고, 명품·오마카세는 재미는 크지만
                    가중치 0.5+0.5에 후행 지표라 뒤로, 베스트셀러는 30일간 값이 2종류뿐일
                    만큼 안 움직여 맨 뒤로 뺐다.
                    행 구성: [검색량·코인·디씨·뉴스] [증권앱·유튜브·실물괴리2]
                             [명품2·봇레포·베스트셀러] — 3행이 정확히 채워진다. */}
                <CardTrend v={p("naver_search_trend")} icon="search" />
                <CardSentiment v={p("news_sentiment")} icon="newspaper" countNoun="뉴스" />
                <CardSentiment v={p("dcinside_post_count")} icon="forum" countNoun="글" />
                <CardUpbit v={p("upbit_speculation_index")} />
                <CardSpending luxury={p("luxury_consumption_index")} dining={p("fine_dining_search_index")} />
                <CardDivergence v={p("small_business_crisis_index")} />
                <CardYoutube v={p("youtube_finance_search_views")} />
                <CardTrend v={p("bestseller_finance_ratio")} icon="menu_book" />
                <CardTrend v={p("github_trading_bot_repos")} icon="terminal" />
                <CardBrokerage v={p("brokerage_app_rank")} />
                {extra("감성").map((i) => (
                  <GenericCard key={i.id} v={pick(i)} icon={FALLBACK_ICONS["감성"]} />
                ))}
                <a
                  href="https://forms.gle/P4wzp2DkP2wyTPWP9"
                  target="_blank"
                  rel="noopener noreferrer"
                  data-ga="cta_click"
                  data-ga-cta="report_indicator"
                  data-ga-surface="sentiment_grid"
                  // 시트의 한 칸이라 **라운드를 주지 않는다.** 라운드를 두면 격자 안에서
                  // 이 칸만 안쪽으로 물러난 카드처럼 보인다. 점선 테두리가 이미 "이건
                  // 지표가 아니라 빈자리"를 말한다.
                  style={{
                    background: "var(--c-blue-tint2)",
                    border: "1.5px dashed var(--c-blue-4)",
                    padding: 22,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 10,
                    textAlign: "center",
                    minHeight: 180,
                    textDecoration: "none",
                  }}
                >
                  <div style={{ width: 44, height: 44, borderRadius: R.control, background: "var(--c-card)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Icon name="add_circle" style={{ fontSize: 23, color: "var(--c-blue)" }} />
                  </div>
                  <strong style={{ fontSize: 15, fontWeight: 800, color: "var(--c-ink)" }}>새로운 지표 제보하기</strong>
                  <span style={{ fontSize: 12.5, color: "var(--c-sub)" }}>아이디어가 있다면 알려주세요</span>
                </a>
              </div>
            </section>
    </div>
  );
}
