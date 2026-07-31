import { getKospiCloseSeries, getLatestDailyScore, getPublicIndicators, getTopStockHighGaps } from "@/lib/data";
import type { ClosePoint, DailyScore, IndicatorCategory, IndicatorWithLatestValue, StockHighGap } from "@/lib/data";
import { formatEokMixed, formatIndicatorValue, formatKstUpdate, sentimentTone, shortDate } from "@/lib/format";
import { AiMark, C, Icon, MONO, stageForScore } from "./ui";

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
  span = 1,
  hit = false,
  minH = 230,
  children,
}: {
  span?: 1 | 2;
  hit?: boolean;
  minH?: number;
  children: React.ReactNode;
}) {
  return (
    <div
      className={span === 2 ? "hz-span2" : undefined}
      style={{
        background: C.card,
        borderRadius: 14,
        // 모든 카드의 divider(Foot 등) 가로 위치가 동일하도록 span과 무관하게
        // 안쪽 여백을 통일한다. 값은 폭에 따라 24 → 18 (globals.css 의 --hz-card-pad).
        padding: "var(--hz-card-pad)",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        minHeight: minH,
        // 카드는 그림자로 띄우지 않는다 — 바탕(--c-bg)과 카드(--c-card)의 명도 차이가
        // 이미 층을 만들고, 헤어라인 한 줄이 그 경계를 또렷하게 한다.
        // 예전의 0 4px 6px 그림자는 카드가 20개 깔린 화면에서 전부 겹쳐 바탕을 탁하게
        // 만들었다. 테두리 굵기는 두 상태가 같아야 한다 — 다르면 초고온 배지가 붙고
        // 떨어질 때 카드가 1px 씩 움찔한다.
        border: `1px solid ${hit ? C.mania : C.line}`,
        boxShadow: hit ? "0 0 0 3px var(--c-mania-tint)" : undefined,
      }}
    >
      {hit && <HitBadge small={span === 1} />}
      {children}
    </div>
  );
}

// 초고온 배지 — 진행률 75(= 카드에 적힌 기준선)를 넘은 지표에 붙는다.
// 예전엔 "🎯 HIT"이었는데, 그 이름이 "기준선에 도달했다"로 읽히는 게 문제였다.
// 실제 판정선은 초고온 진입이고, 서비스의 나머지 언어(저온·상온·고온·초고온)와도
// 어긋나 있었다. 이름을 구간 이름으로 맞춰 배지와 히어로·요약이 한 말을 쓰게 한다.
// 앞에 붙어 있던 🌋 는 뺐다 — 배지가 이미 초고온 색(mania)으로 꽉 찬 알약이라 표식이
// 겹치고, 컬러 이모지라 OS마다 글리프 높이가 달라 배지만 세로로 들쭉날쭉했다.
function HitBadge({ label = "초고온", small = false }: { label?: string; small?: boolean }) {
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
        // 1칸 카드는 제목이 짧아 배지를 6px 더 바깥으로 붙인다(그 차이만 유지한다).
        right: small ? "calc(var(--hz-card-pad) - 6px)" : "var(--hz-card-pad)",
        height: 22,
        display: "flex",
        alignItems: "center",
      }}
    >
      <span
        style={{
          background: C.mania,
          color: "var(--c-on-mania)",
          fontWeight: 700,
          fontSize: small ? 9 : 11,
          lineHeight: 1.2,
          padding: small ? "4px 9px" : "6px 12px",
          borderRadius: small ? 6 : 8,
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
  iconSize = 22,
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
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          justifyContent: right ? "space-between" : undefined,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Icon name={icon} style={{ fontSize: iconSize, color: C.blue }} />
          <span style={{ fontSize: 17, fontWeight: 700, color: C.ink, lineHeight: 1.2, wordBreak: "keep-all" }}>
            {name}
          </span>
          {badge && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 600,
                color: C.sub,
                background: C.bg,
                padding: "3px 8px",
                borderRadius: 999,
                whiteSpace: "nowrap",
              }}
            >
              {badge}
            </span>
          )}
        </div>
        {/* height:0 으로 감싸 제목 행의 높이 계산에서 뺀다. 제목(17px)보다 큰 숫자가
            right로 들어오면(괴리도 28px) 행이 그만큼 높아지고, alignItems:center가
            제목을 아래로 밀어 같은 행 카드들끼리 제목·부제 세로 위치가 어긋났다.
            폭은 그대로 차지하므로 space-between 배치는 유지되고, 내용은 행 중앙선에
            걸쳐 넘치며 시각적으로는 지금과 같은 위치에 보인다. */}
        {right && (
          <div style={{ height: 0, display: "flex", alignItems: "center", flexShrink: 0 }}>
            {right}
          </div>
        )}
      </div>
      {desc && (
        <p style={{ margin: "7px 0 0", fontSize: 12, lineHeight: 1.5, color: C.sub, wordBreak: "keep-all" }}>{desc}</p>
      )}
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
    <div style={{ display: "flex", alignItems: "flex-end", gap: 8, rowGap: 4, flexWrap: "wrap", marginBottom: 12 }}>
      <span
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
        {unit && <span style={{ fontSize: size * 0.5 }}>{unit}</span>}
      </span>
      {sub && <span style={{ fontSize: 12, fontWeight: 700, color, paddingBottom: 6, whiteSpace: "nowrap" }}>{sub}</span>}
    </div>
  );
}

function Foot({ text, color = C.sub }: { text: string; color?: string }) {
  return (
    // 바깥 div: marginTop auto 로 카드 바닥에 붙이고(같은 줄 divider 높이 일치),
    // paddingTop 으로 divider 위에 항상 여백을 둔다 — 콘텐츠가 카드를 꽉 채워
    // auto 여백이 0이 돼도 divider가 콘텐츠에 붙지 않도록. 설명 영역은 2줄
    // (minHeight)로 통일한다.
    <div style={{ marginTop: "auto", paddingTop: 20 }}>
      <p
        style={{
          margin: 0,
          boxSizing: "border-box",
          minHeight: 53,
          paddingTop: 16,
          fontSize: 12,
          color,
          fontWeight: 600,
          borderTop: "1px solid var(--c-divider)",
          lineHeight: 1.5,
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
function HeatBar({ v, hideThreshold = false }: { v: Pick; hideThreshold?: boolean }) {
  if (v.capped === null) return null;
  const c = overheatColor(v.capped);
  return (
    <div style={{ background: C.bg, borderRadius: 10, padding: "16px 18px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 700, marginBottom: 8 }}>
        <span style={{ color: C.sub }}>과열도</span>
        <span style={{ color: c, fontFamily: MONO }}>
          {Math.round(v.capped)}
          <span style={{ color: "var(--c-faint)" }}>/100</span>
        </span>
      </div>
      <div style={{ position: "relative", height: 10, background: C.track, borderRadius: 999, overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: `${v.capped}%`,
            background: v.isHit ? `linear-gradient(90deg, ${C.hot}, ${C.mania})` : c,
            borderRadius: 999,
          }}
        />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, fontWeight: 600, color: C.sub, marginTop: 7 }}>
        <span>안심</span>
        <span style={{ color: C.hot }}>과열 100</span>
      </div>
      {v.hotDisp && !hideThreshold && (
        <p style={{ margin: "8px 0 0", textAlign: "center", fontSize: 10, fontWeight: 600, color: C.sub, fontFamily: MONO }}>
          초고온 기준선 {v.hotDisp} {v.dirLabel}
        </p>
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
  초고온: { icon: "volcano", color: C.mania, tint: "var(--c-mania-tint)", zone: "초고온 구간" },
};

// 히어로 배지의 4칸 막대에서 몇 칸을 켤지. 구간 순서를 숫자로 적어 둔 것뿐이라
// STAGE_META 와 키가 어긋나면 안 된다(어긋나면 막대가 0칸이 된다).
const STAGE_LEVEL: Record<string, number> = { 저온: 1, 상온: 2, 고온: 3, 초고온: 4 };

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
function gaugeX(score: number): number {
  const theta = ((180 - (Math.max(0, Math.min(100, score)) / 100) * 180) * Math.PI) / 180;
  return 150 + 124 * Math.cos(theta);
}

/** 구간 라벨과 그 구간의 한가운데 점수. 경계는 25·50·75(stageForScore 와 같은 값). */
const STAGE_TICKS: { label: string; mid: number; color: string }[] = [
  { label: "저온", mid: 12.5, color: C.cold },
  { label: "상온", mid: 37.5, color: C.neutral },
  { label: "고온", mid: 62.5, color: C.hot },
  { label: "초고온", mid: 87.5, color: C.mania },
];

function HeroGauge({ score }: { score: number }) {
  const s = Math.max(0, Math.min(100, score));
  const arcLen = 389.6;
  const dashoffset = arcLen * (1 - s / 100);
  const theta = ((180 - (s / 100) * 180) * Math.PI) / 180;
  const nx = 150 + 124 * Math.cos(theta);
  const ny = 150 - 124 * Math.sin(theta);
  return (
    <svg viewBox="0 0 300 172" style={{ width: "100%", height: "100%", display: "block", overflow: "visible" }}>
      <defs>
        <linearGradient id="heroThermal" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={C.cold} />
          <stop offset="33%" stopColor={C.neutral} />
          <stop offset="66%" stopColor={C.hot} />
          <stop offset="100%" stopColor={C.mania} />
        </linearGradient>
      </defs>
      <path d="M 26 150 A 124 124 0 0 1 274 150" fill="none" stroke={C.track} strokeWidth={22} strokeLinecap="round" />
      <path
        d="M 26 150 A 124 124 0 0 1 274 150"
        fill="none"
        stroke="url(#heroThermal)"
        strokeWidth={22}
        strokeLinecap="round"
        strokeDasharray={arcLen}
        strokeDashoffset={dashoffset}
      />
      <circle cx={nx} cy={ny} r={12} fill={C.blue} stroke={C.card} strokeWidth={4} />
    </svg>
  );
}

function Hero({ dailyScore, tradHits, socialHits }: { dailyScore: DailyScore; tradHits: number; socialHits: number }) {
  // 저장된 stage 문자열 대신 점수에서 직접 구간을 계산해, 라벨 변경/과거 데이터에도 견고.
  const stageLabel = stageForScore(dailyScore.score);
  const stage = STAGE_META[stageLabel] ?? { icon: "sunny", color: C.neutral, tint: "var(--c-neutral-tint)", zone: stageLabel };
  // 도수는 정수로 — 소수점 둘째 자리(6.16℃)는 없는 정밀도를 있는 것처럼 보이게 한다.
  // 지수는 25개 지표의 가중평균을 다시 앵커로 매핑한 값이라 0.01 단위에 의미가 없다.
  const scoreDisplay = Math.round(dailyScore.score).toString();
  return (
    <section
      className="hz-hero"
      style={{
        background: C.card,
        borderRadius: 16,
        border: `1px solid ${C.line}`, /* 그림자 대신 헤어라인 — Shell 주석 참고 */
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
      }}
    >
      {/* 게이지는 300px 고정이었는데, 375px 화면에선 본문 폭(285px)보다 넓어 페이지에
          가로 스크롤이 생겼다(실측 10px). 폭을 min(300px,100%) 로 두고 안쪽을 전부
          비율(aspect-ratio·%)로 잡아 좁은 화면에서 같이 줄어들게 한다. */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, flex: "0 1 300px", minWidth: 0, maxWidth: 300 }}>
        <div style={{ position: "relative", width: "100%", aspectRatio: "300 / 172" }}>
          <HeroGauge score={dailyScore.score} />
          {/* top 78 / 172 = 45.3% — 게이지가 줄어도 숫자가 호 안 같은 자리에 남는다. */}
          <div style={{ position: "absolute", left: 0, right: 0, top: "45.3%", textAlign: "center" }}>
            <div style={{ fontFamily: MONO, fontSize: 58, fontWeight: 700, color: C.ink, letterSpacing: "-0.04em", lineHeight: 1 }}>
              {scoreDisplay}
              <span style={{ fontSize: 30 }}>℃</span>
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: stage.color, marginTop: 6 }}>지금 · {stage.zone}</div>
          </div>
        </div>
        {/* 라벨을 각자 맡은 구간의 한가운데(호 위 x좌표)에 놓는다. 예전엔 space-between 이라
            넷이 균등 간격으로 놓였는데, 구간 경계는 25·50·75 이고 호는 반원이라 라벨이
            자기 구간 아래가 아니었다 — 상온(12.5~50 한가운데 x≈103)이 x≈80 에, 저온은
            호가 시작하기도 전인 x≈17 에 있었다. HeroGauge 와 같은 식으로 x 를 구한다. */}
        <div style={{ position: "relative", width: "100%", height: 14, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em" }}>
          {STAGE_TICKS.map((t) => (
            <span
              key={t.label}
              style={{
                position: "absolute",
                // 게이지가 줄어도 라벨이 따라가도록 px 이 아니라 % 로 건다(뷰박스 폭 300 기준).
                left: `${(gaugeX(t.mid) / 300) * 100}%`,
                transform: "translateX(-50%)",
                color: t.color,
                whiteSpace: "nowrap",
              }}
            >
              {t.label}
            </span>
          ))}
        </div>
      </div>
      {/* flex-basis 280 + minWidth 0. basis 로 "280 이 안 되면 아랫줄로" 를 유지하되,
          일단 아랫줄로 내려간 뒤에는 남은 폭(모바일 245px)까지 줄어들 수 있게 한다 —
          minWidth:280 이던 때는 줄바꿈 후에도 280 을 고집해 카드가 화면 밖으로 나갔다. */}
      <div style={{ flex: "1 1 280px", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: C.blue }}>햇쩨 지수</span>
            {/* 카더라 SectionHead 의 도움말과 같은 패턴(hz-tip-wide + help 아이콘). */}
            <span
              className="hz-tip hz-tip-wide hz-tip-below"
              data-tip="시장·감성 지표 25개의 과열도를 가중 평균한 값입니다. 지표마다 신호의 무게가 달라 다른 가중치로 합산합니다. 25·50·75를 경계로 저온·상온·고온·초고온이 나뉩니다."
              data-ga-tip="hatzze_index"
              style={{ display: "inline-flex", cursor: "help" }}
            >
              <Icon name="help" style={{ fontSize: 16, color: C.sub }} />
            </span>
          </span>
          {/* 상태 텍스트는 옆의 "햇쩨 지수"(22px)와 같은 크기로 둔다 — 둘이 한 쌍으로 읽히는 자리라
              크기가 다르면 상태 쪽이 부속처럼 보인다. */}
          {/* 아이콘은 색을 물려받으므로 구간 색이 글자·아이콘·배경에 한 번에 걸린다. */}
          {/* 재질·치수는 globals.css 의 .hz-stage* 가 맡고, 여기서는 구간 색 두 개만
              커스텀 속성으로 넘긴다 — 색을 CSS 에 박으면 구간마다 규칙을 네 벌 써야 한다.
              막대는 장식이라 aria-hidden 으로 빼고, 구간은 옆의 글자가 이미 말한다. */}
          <span
            className="hz-stage"
            style={{ "--stage": stage.color, "--stage-tint": stage.tint } as React.CSSProperties}
          >
            <span className="hz-stage-meter" aria-hidden="true">
              {[1, 2, 3, 4].map((n) => (
                <i key={n} className={n <= STAGE_LEVEL[stageLabel] ? "on" : undefined} />
              ))}
            </span>
            <Icon name={stage.icon} style={{ fontSize: 22 }} className="ms-fill" />
            {stageLabel}
          </span>
        </div>
        <p style={{ margin: "0 0 4px", fontSize: 11, color: C.sub, fontFamily: MONO }}>최종 업데이트 · {formatKstUpdate(dailyScore.updated_at)}</p>
        <div style={{ marginTop: 20, background: C.bg, borderRadius: 12, padding: "22px 24px", display: "flex", gap: 14 }}>
          <AiMark size={22} style={{ flexShrink: 0 }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 15, lineHeight: 1.6, color: "var(--c-ink-soft)", fontWeight: 500 }}>
            {/* 고정 오프너 — 두 문장을 한 문단으로. 이 아래 LLM 문장들이 각각 한 문단씩
                붙어 전체가 3문단 정도가 된다. */}
            {/* "기준선을 넘었습니다"였는데, 배지가 켜지는 지점(진행률 75)과 카드에 적힌
                기준선(진행률 100)이 서로 달라서 기준선에 못 미친 지표까지 세고 있었다.
                이제 카드의 기준선 자체가 초고온 진입선이라 두 문장이 같은 뜻이지만,
                구간 이름으로 말하는 쪽이 저온·상온·고온·초고온 언어와도 맞는다. */}
            <p style={{ margin: 0 }}>오늘은 시장 지표 <b style={{ color: C.ink }}>{tradHits}개</b>, 감성 지표 <b style={{ color: C.ink }}>{socialHits}개</b>가 초고온 구간에 들었습니다. 지표들이 가리키는 현재 시장 온도는 <b style={{ color: stage.color }}>{stageLabel}</b> 구간입니다.</p>
            {/* LLM(generate_daily_summary.py) 상세 요약을 문장별로 줄바꿈해 이어붙인다.
                없으면(마이그레이션 전이거나 생성 실패) 오프너만 보여준다. */}
            {dailyScore.ai_summary
              ? dailyScore.ai_summary
                  .split("\n")
                  .map((s) => s.trim())
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((para, i) => (
                    <p key={i} style={{ margin: 0 }}>{renderRichSummary(para)}</p>
                  ))
              : null}
          </div>
        </div>
        <p style={{ margin: "12px 2px 0", fontSize: 11, lineHeight: 1.5, color: "var(--c-muted)" }}>
          저온·상온·고온·초고온은 시장의 과열 정도를 나타낸 표현일 뿐, 재미·참고용이며 매수·매도 신호가 아닙니다.
        </p>
      </div>
    </section>
  );
}

// ── 소형 시각화 조각 ──────────────────────────────────────────────
function Donut({ pct, color }: { pct: number; color: string }) {
  const circ = 2 * Math.PI * 15.5;
  const fill = (Math.max(0, Math.min(100, pct)) / 100) * circ;
  return (
    <svg width="116" height="116" viewBox="0 0 36 36">
      <circle cx="18" cy="18" r="15.5" fill="none" stroke={C.track} strokeWidth="5" />
      <circle cx="18" cy="18" r="15.5" fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" strokeDasharray={`${fill} ${circ - fill}`} transform="rotate(-90 18 18)" />
    </svg>
  );
}


// 우상향/우하향 추세를 암시하는 장식용 라인 (실제 시계열이 아님).
// 최근 값들의 실제 추세 스파크라인. data는 시간순(오래된→최신). 차트는 위 영역을
// 꽉 채우고(선 두께는 non-scaling-stroke로 일정), 라벨은 차트에 겹치지 않게 아래
// 오른쪽에 둔다.
function Sparkline({
  data,
  color,
  label = "최근 30일",
  tips,
}: {
  data: number[];
  color: string;
  label?: string;
  /** 지점별 툴팁 문구. data 와 길이가 같을 때만 적용한다. */
  tips?: string[];
}) {
  if (data.length < 2) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 600, color: C.sub }}>
        추세 데이터 쌓이는 중
      </div>
    );
  }
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const W = 100;
  const H = 40;
  const pad = 4;
  const pts = data.map((val, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = pad + (1 - (val - min) / range) * (H - 2 * pad);
    return [x, y] as const;
  });
  const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${line} L${W} ${H} L0 ${H} Z`;
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, position: "relative" }}>
        <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ position: "absolute", inset: 0 }}>
          <path d={area} fill={color} opacity={0.12} />
          <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
        {/* 선 위에 보이지 않는 세로 띠를 깔아 지점별 툴팁을 준다. SVG path 자체에는
            hover 영역이 거의 없어서(선 두께 2px) 띠로 받아야 실제로 잡힌다. */}
        {tips && tips.length === data.length && (
          <div style={{ position: "absolute", inset: 0, display: "flex" }}>
            {tips.map((tip, i) => {
              // 띠 하나가 7~8px 인데 툴팁은 100px 남짓이라, 가운데 정렬(기본)이면 양 끝
              // 지점에서 카드 밖으로 나간다 — 좁은 화면에선 페이지에 가로 스크롤까지 생겼다.
              // MDD 차트와 같은 규칙으로 끝쪽 15%는 안쪽으로 열리게 방향을 튼다.
              const at = tips.length <= 1 ? 0 : i / (tips.length - 1);
              const edge = at < 0.15 ? " hz-tip-start" : at > 0.85 ? " hz-tip-end" : "";
              return <div key={i} className={`hz-tip hz-vline${edge}`} data-tip={tip} style={{ flex: 1, position: "relative" }} />;
            })}
          </div>
        )}
      </div>
      <span style={{ alignSelf: "flex-end", fontSize: 9, fontWeight: 600, color: C.sub, marginTop: 4 }}>{label}</span>
    </div>
  );
}

// 레버리지 카드의 서브 진행률 바 (ETF 거래대금 / 선물 미결제약정)
function LevSubBar({ label, amount, value, color }: { label: string; amount: string | null; value: number; color: string }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: C.sub, marginBottom: 4 }}>{label}</div>
      {amount && <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700, color: C.ink, marginBottom: 7 }}>{amount}</div>}
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, fontWeight: 600, color: C.sub, marginBottom: 5 }}>
        <span>과열도</span>
        <span style={{ color }}>
          {Math.round(value)}
          <span style={{ color: "var(--c-faint)" }}>/100</span>
        </span>
      </div>
      <div style={{ height: 8, background: C.track, borderRadius: 999, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
      </div>
    </div>
  );
}

// 매수쏠림 카드의 다이버징 카운트 바 (매수 / 매도 / CB)
function DivRow({ label, w, color }: { label: string; w: number; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ width: 82, fontSize: 11, fontWeight: 700, color, textAlign: "right" }}>{label}</span>
      <div style={{ flex: 1, height: 16, position: "relative", background: C.track, borderRadius: 999 }}>
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${Math.max(0, Math.min(100, w))}%`, background: color, borderRadius: 999 }} />
      </div>
    </div>
  );
}

// 비교 막대들의 차이를 시각적으로 강조한다 — 0이 아니라 최솟값 기준으로 스케일해
// 작은 차이도 눈에 띄게 만든다(정확한 크기는 각 막대의 숫자/배지로 전달). 값이 모두
// 같으면 전부 100으로 둔다.
function emphasizedHeights(values: number[], floorPct = 30): number[] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max <= min) return values.map(() => 100);
  return values.map((v) => floorPct + ((v - min) / (max - min)) * (100 - floorPct));
}

// "평소/평균 대비 오늘" 비교 막대 높이 [평소, 오늘]. 평소를 중간 높이(baseH)에
// 고정하고 오늘을 비율만큼 비례시킨다 — 비율이 1이면 둘 다 같은 높이, 2배면 오늘이
// 두 배 높이. emphasizedHeights와 달리 작은 차이를 과장하지 않는다(1.0배≈동일 높이).
function ratioBarHeights(baseline: number | null, current: number | null, baseH = 55): [number, number] {
  if (!baseline || !current || baseline <= 0) return [baseH, baseH];
  return [baseH, Math.max(10, Math.min(100, (current / baseline) * baseH))];
}

/* 아시아 카드 막대의 세로 치수. 카드가 코스피 높이에 기준선을 그으려면 막대 최대 높이와
   라벨 줄 높이를 알아야 해서, 값을 흩어 두지 않고 여기 모은다. */
const ASIA_BAR_MAX = 108;
const ASIA_LABEL_H = 26; // 나라 이름 두 줄. span 에 height 로 못 박아 두어 계산이 확정된다
const ASIA_COL_GAP = 6; // 막대 ↔ 라벨 사이(칸 안 flex gap)
/** 컨테이너 바닥에서 막대 밑변까지의 거리 — 기준선을 막대 끝에 정확히 걸기 위해 쓴다. */
const ASIA_BAR_BASE = ASIA_LABEL_H + ASIA_COL_GAP;

// 아시아 카드의 4개국 상대 막대 (KOSPI=100 기준). heightPct는 차이를 강조한 0~100.
// self(코스피)만 파랑으로 세우고 이웃 셋은 같은 중립색 — 색이 아니라 높이로 비교하게 한다.
// 그 중립색은 --c-track(막대 트랙 배경)이 아니라 --c-bar 다. track 은 카드 배경과
// 명암비가 라이트 1.46:1·다크 1.27:1 뿐이라 기둥 셋이 카드에 묻었다.
function AsiaBar({ label, sub, index, heightPct, self }: { label: string; sub: string; index: number; heightPct: number; self: boolean }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: ASIA_COL_GAP }}>
      <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: self ? C.blue : C.sub }}>{Math.round(index)}</span>
      <div
        style={{
          width: "100%",
          height: Math.max(10, (heightPct / 100) * ASIA_BAR_MAX),
          background: self ? C.blue : C.bar,
          borderRadius: "6px 6px 0 0",
        }}
      />
      <span
        style={{
          height: ASIA_LABEL_H,
          fontSize: 9,
          fontWeight: 700,
          color: self ? C.ink : C.sub,
          textAlign: "center",
          lineHeight: 1.25,
        }}
      >
        {label}
        <br />
        {sub}
      </span>
    </div>
  );
}

// 업비트 카드의 서브 바 (김치 프리미엄 / 거래량 강도) — 값 라벨은 우측 표시
//
// 진행률이 0이면 막대가 통째로 비어, 옆의 "LOW" 글자만 떠 있고 바는 렌더가 덜 된 것처럼
// 보인다. 바닥값을 둬 어떤 값이든 눈에 띄는 조각은 남긴다 — 0과 5%가 같아 보이는 대가는
// 있지만, 이 바는 정확한 크기가 아니라 LOW/MID/HIGH 를 눈으로 거드는 자리다.
//
// %가 아니라 px로 잡는다. 카드 폭에 비례하는 %는 좁은 화면에서 다시 점만 해지고, 무엇보다
// 높이(8)보다 넉넉히 넓어야 원이 아니라 '짧은 막대'로 읽힌다(MDD 회복 막대의 REC_BAR_MIN_W
// 와 같은 이유 — 4%로 뒀더니 실제로 동그란 점 하나로 보였다).
const SUB_BAR_MIN_W = 18;

function UpbitSubBar({ label, value, pct, color }: { label: string; value: string; pct: number; color: string }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 600, color: C.sub, marginBottom: 6 }}>
        <span>{label}</span>
        <span style={{ color }}>{value}</span>
      </div>
      <div style={{ height: 8, background: C.track, borderRadius: 999, overflow: "hidden" }}>
        {/* 안쪽에도 borderRadius 를 준다 — 바닥값만큼 짧을 때 오른쪽 끝이 네모로 잘려
            막대가 아니라 잘린 조각처럼 보인다. */}
        <div style={{ height: "100%", width: `${Math.max(0, Math.min(100, pct))}%`, minWidth: SUB_BAR_MIN_W, background: color, borderRadius: 999 }} />
      </div>
    </div>
  );
}

// 김치 프리미엄 전용 양극 바 — 0을 중앙에 두고 음수(역프)면 왼쪽(파랑), 양수면
// 오른쪽(빨강)으로 채운다. ±10%를 최대로 스케일한다(업비트 기준값과 동일).
function UpbitKimchiBar({ premium }: { premium: number }) {
  const norm = Math.max(-1, Math.min(1, premium / 10));
  const pos = 50 + norm * 50;
  const color = premium >= 0 ? C.hot : C.cold;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 600, color: C.sub, marginBottom: 6 }}>
        <span>김치 프리미엄</span>
        <span style={{ color }}>{premium > 0 ? "+" : ""}{premium.toFixed(1)}%</span>
      </div>
      <div style={{ position: "relative", height: 8, background: C.track, borderRadius: 999 }}>
        <div style={{ position: "absolute", left: "50%", top: -2, bottom: -2, width: 2, background: "var(--c-marker)" }} />
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            background: color,
            borderRadius: 999,
            ...(premium >= 0 ? { left: "50%", width: `${pos - 50}%` } : { right: "50%", width: `${50 - pos}%` }),
          }}
        />
      </div>
    </div>
  );
}

// VIX/VKOSPI 카드의 백분위 바. 각 지수를 자기 1년 분포 내 백분위(0~100)로 바꾸면

// ── 시장 지표 카드들 (목업 순서대로) ──────────────────────────────

// 1. 버핏지수 — 경제(GDP) vs 증시 시총 비교 (실제 값으로 복원 가능)
function CardBuffett({ v }: { v: Pick }) {
  const dt = v.details;
  const ratio = v.raw !== null ? v.raw / 100 : null; // 시총/GDP 배수
  const gdpWidth = v.raw && v.raw > 0 ? Math.min(100, (100 / v.raw) * 100) : 46;
  const jo = (won: number) => Math.round(won / 1e12).toLocaleString("ko-KR"); // 원 → 조원
  return (
    <Shell span={2} hit={v.isHit} minH={236}>
      <TitleRow desc={v.headline} icon="payments" name={v.name} />
      {/* 주요 수치 크기는 VKOSPI 카드(40)를 기준으로 맞춘다. */}
      <Big disp={v.disp} unit={v.unit} color={v.color} size={40} sub={ratio !== null ? `${ratio.toFixed(1)}배` : undefined} />
      <div style={{ background: C.bg, borderRadius: 10, padding: "18px 18px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 600, color: C.sub, marginBottom: 6 }}>
            {/* 1칸 카드라 폭이 좁다 — 분기 표기는 "~26년 1분기"로 줄여 한 줄에 들어가게 한다. */}
            <span style={{ whiteSpace: "nowrap" }}>
              나라 경제 (GDP)
              {dt && dt.gdp_year ? (
                <span style={{ color: "var(--c-faint)", fontWeight: 600 }}> · ~{String(dt.gdp_year).slice(2)}년 {dt.gdp_q}분기</span>
              ) : null}
            </span>
            <span style={{ fontFamily: MONO, whiteSpace: "nowrap" }}>{dt && dt.gdp ? `약 ${jo(dt.gdp)}조원` : "기준 100"}</span>
          </div>
          <div style={{ height: 18, background: C.track, borderRadius: 6, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${gdpWidth}%`, background: C.bar, borderRadius: 6 }} />
          </div>
        </div>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 700, color: v.color, marginBottom: 6 }}>
            <span>증시 시가총액</span>
            <span style={{ fontFamily: MONO }}>
              {dt && dt.market_cap ? `약 ${jo(dt.market_cap)}조원 · ` : `${v.disp} · `}
              {ratio !== null ? `${ratio.toFixed(1)}배` : "-"}
            </span>
          </div>
          <div style={{ height: 18, background: C.track, borderRadius: 6, overflow: "hidden" }}>
            <div style={{ height: "100%", width: "100%", background: `linear-gradient(90deg,${C.hot},${C.mania})`, borderRadius: 6 }} />
          </div>
        </div>
        <p style={{ margin: "2px 0 0", fontSize: 11, fontWeight: 600, color: "var(--c-ink-soft)", textAlign: "center" }}>
          증시가 실물 경제보다 <span style={{ color: v.color }}>{ratio !== null ? `${ratio.toFixed(1)}배 커진` : "커진"}</span> 상태입니다
        </p>
      </div>
      <Foot text={v.desc} />
    </Shell>
  );
}

// 2. 레버리지 지수 — 역대 범위 바 + ETF/선물 서브 진행률 (details 있으면 목업 원본)
function CardLeverage({ v }: { v: Pick }) {
  const dt = v.details;
  // 종합 과열도 = ETF 거래대금·선물 미결제약정 과열도의 평균(아래 두 서브바의 평균).
  const heat = dt
    ? Math.round(((dt.etf_progress ?? 0) + (dt.futures_progress ?? 0)) / 2)
    : Math.round(v.capped ?? 0);
  // 종합 과열도(0~100) 자체의 구간 색을 쓴다 — v.color(기준선 진행률 기준)와 달리
  // 이 게이지는 50이 과열 시작이라 heat값을 그대로 stage 색에 매핑한다.
  const heatC = overheatColor(heat);
  const etfAmount =
    dt?.etf_value != null
      ? (() => {
          const f = formatIndicatorValue(dt.etf_value, "억원");
          return `${f.display}${f.displayUnit}`;
        })()
      : null;
  const oiAmount =
    dt?.futures_oi != null ? `${Math.round(dt.futures_oi).toLocaleString("ko-KR")}계약` : null;
  return (
    <Shell span={2} hit={v.isHit} minH={236}>
      <TitleRow desc={v.headline} icon="rocket_launch" name={v.name} />
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 12 }}>
        {/* 주요 수치 크기는 VKOSPI 카드(40)를 기준으로 맞춘다. */}
        <span style={{ fontFamily: MONO, fontSize: 40, fontWeight: 700, color: heatC, lineHeight: 1, letterSpacing: "-0.03em" }}>{heat}</span>
        <span style={{ fontSize: 18, fontWeight: 700, color: "var(--c-faint)" }}>/ 100</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.sub, paddingBottom: 4 }}>종합 과열도</span>
      </div>
      <div style={{ background: C.bg, borderRadius: 10, padding: 18, display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <div style={{ position: "relative", height: 12, background: C.track, borderRadius: 999 }}>
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${Math.min(100, heat)}%`, background: `linear-gradient(90deg,${C.hot},${C.mania})`, borderRadius: 999 }} />
            <div style={{ position: "absolute", top: "50%", left: `${Math.min(100, heat)}%`, transform: "translate(-50%,-50%)", width: 14, height: 14, borderRadius: 999, background: heatC, border: `3px solid ${C.card}` }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, fontWeight: 600, color: C.sub, marginTop: 7 }}>
            <span>안심</span>
            <span style={{ color: C.hot }}>과열</span>
          </div>
        </div>
        {dt && (
          <>
            <div style={{ height: 1, background: "var(--c-divider-strong)" }} />
            <div style={{ display: "flex", gap: 22 }}>
              <LevSubBar label="ETF 거래대금" amount={etfAmount} value={dt.etf_progress ?? 0} color={C.hot} />
              <LevSubBar label="선물 미결제약정" amount={oiAmount} value={dt.futures_progress ?? 0} color={C.mania} />
            </div>
          </>
        )}
      </div>
      <Foot text={v.desc} />
    </Shell>
  );
}

/**
 * 최근 한 달 매매 안전장치 동향 — 매수/매도/CB 발동 건수.
 *
 * 세부 건수가 없을 때 쓰던 예비 화면을 걷어냈다. 그 화면은 raw 의 부호로 매수/매도를
 * 가르고 "최근 30일 순 쏠림"이라 적었는데, 2026-07-20 공식 교체로 raw 가 0~1 비중이 돼
 * 음수가 될 수 없다 — 즉 옛 공식을 전제한 죽은 코드였다. fetch 가 건수를 항상 함께
 * 저장하므로 그 경로는 실제로 실행되지도 않았다.
 */
function CardMarketActions({ v }: { v: Pick }) {
  const dt = v.details;
  const buyN = dt?.buy ?? 0;
  const sellN = dt?.sell ?? 0;
  const maxC = Math.max(1, buyN, sellN, dt?.cb ?? 0);
  // 매수/매도 안전장치 중 무엇이 우세했는지 — 종합 점수가 0이어도 방향은 보여준다.
  const verdict =
    buyN > sellN
      ? { t: "매수 우세", c: C.hot }
      : sellN > buyN
        ? { t: "매도 우세", c: C.cold }
        : { t: "균형", c: C.neutral };
  return (
    <Shell span={2} hit={v.isHit} minH={236}>
      <TitleRow desc={v.headline} icon="speed" name={v.name} badge="최근 한 달" />
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, marginBottom: 12 }}>
        {/* 다른 카드의 주요 수치(191%·48)와 '눈에 보이는 크기'를 맞춘 값이다. 한글은
            같은 font-size 라도 글리프가 em box 를 더 꽉 채워 숫자보다 커 보인다 —
            Pretendard 800 기준 실측으로 40px 일 때 숫자는 글자높이 29.1px, "매도 우세"는
            35.9px 였다. 32px 면 28.7px 라 숫자와 거의 같아진다. */}
        <span style={{ fontSize: 32, fontWeight: 700, color: verdict.c, lineHeight: 1 }}>{verdict.t}</span>
      </div>
      {/* 2칸 카드라 같은 줄의 1칸 카드들에 맞춰 늘어나는데 내용은 세 줄뿐이라, 예전엔
          막대 아래로 100px 넘게 비었다. 묶음에 flex:1 을 주고 세 줄을 그 안에서 고르게
          펴 카드를 채운다(남는 높이가 없으면 gap 14 그대로다). */}
      <div style={{ flex: 1, background: C.bg, borderRadius: 10, padding: 18, display: "flex", flexDirection: "column", gap: 14, justifyContent: "space-evenly" }}>
        <DivRow label={`매수 ${buyN}건`} w={(buyN / maxC) * 100} color={C.hot} />
        <DivRow label={`매도 ${sellN}건`} w={(sellN / maxC) * 100} color={C.cold} />
        <DivRow label={`CB ${dt?.cb ?? 0}건`} w={((dt?.cb ?? 0) / maxC) * 100} color={C.sub} />
      </div>
      <Foot text={v.desc} />
    </Shell>
  );
}

// 거래대금 쏠림도 — 상위10 거래대금 비중 도넛 + 상위 종목 목록 (details 활용)
function CardTurnover({ v }: { v: Pick }) {
  const c = overheatColor(v.capped);
  const share = v.raw ?? 0; // 상위10 거래대금 비중 %
  const dt = v.details as unknown as { top5?: { name: string; share: number }[]; total_jo?: number } | null;
  const top5 = dt?.top5 ?? [];
  // 비중만으론 "얼마"인지 안 보인다 — 전체 거래대금(total_jo)에 비중을 곱해 금액으로 준다.
  const totalJo = dt?.total_jo ?? null;
  const donutTip =
    totalJo != null
      ? `전체 ${totalJo.toLocaleString("ko-KR")}조원 중 상위 10종목이 ${((totalJo * share) / 100).toFixed(1)}조원`
      : `상위 10종목이 전체 거래대금의 ${share.toFixed(1)}%`;
  return (
    <Shell hit={v.isHit} minH={230}>
      <TitleRow desc={v.headline} icon="pie_chart" name={v.name} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14 }}>
        <div style={{ position: "relative", width: 116, height: 116 }}>
          <Donut pct={share} color={c} />
          {/* 툴팁은 도넛 바깥이 아니라 안쪽 라벨에 건다 — 116px 도넛 위에 걸면 툴팁이
              카드 제목·설명 자리까지 올라가 글자를 덮는다(실측 확인). */}
          <div className="hz-tip" data-tip={donutTip} style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontFamily: MONO, fontSize: 22, fontWeight: 700, color: c, lineHeight: 1 }}>{Math.round(share)}%</span>
            <span style={{ fontSize: 8, fontWeight: 600, color: C.sub, marginTop: 2 }}>상위10 거래</span>
          </div>
        </div>
        <div style={{ width: "100%", display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: 18, rowGap: 6 }}>
          {top5.slice(0, 4).map((s, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, fontWeight: 600, gap: 6 }}>
              <span style={{ color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
              <span style={{ fontFamily: MONO, fontWeight: 700, color: C.sub, flexShrink: 0 }}>{s.share}%</span>
            </div>
          ))}
        </div>
      </div>
      <Foot text={v.desc} />
    </Shell>
  );
}

/**
 * 코스피 신고가 괴리율 — 지수 괴리율(왼쪽) + 거래대금 상위 3종목의 괴리율(오른쪽).
 *
 * 지수만 보면 "-25%"라는 한 덩어리 숫자뿐이라 그 안에서 주도주들이 어떤 상태인지 안
 * 보인다. 지금 돈이 몰리는 종목들이 각자 고점에서 얼마나 떨어져 있는지를 나란히 두면
 * 지수 숫자가 어디서 온 건지 읽힌다(종목 선정·산출은 lib/data.ts getTopStockHighGaps).
 */
function CardHighGap({ v, tops }: { v: Pick; tops: StockHighGap[] }) {
  // 지수·개별 종목 모두 KRX 종가 기준으로 통일하고, 그 기준일을 배지로 항상 밝힌다.
  // 야후 실시간을 섞으면 카드 안에서 기준이 갈리고(왼쪽 종가 vs 오른쪽 실시간),
  // 점수(daily_score)가 쓰는 값과도 달라진다.
  const gap = v.raw ?? 0;
  const fillH = Math.max(0, Math.min(100, 100 - Math.abs(gap)));
  const priorHigh = v.details?.prior_high;
  const num = (n: number) => n.toLocaleString("ko-KR", { maximumFractionDigits: 0 });
  return (
    <Shell span={2} hit={v.isHit} minH={230}>
      <TitleRow
        desc={v.headline}
        icon="vertical_align_top"
        name={v.name}
        badge={sourceDateBadge(v) ?? "최근 거래일 기준"}
      />
      {/* flexWrap — 모바일(1열)에서 이 2칸 카드가 285px 로 좁아지는데, 왼쪽 묶음이
          flexShrink:0 이라 오른쪽 종목 목록에 13px 밖에 안 남아 이름·수치가 카드 밖으로
          삐져나갔다(페이지 가로 스크롤의 원인이었다). 자리가 모자라면 목록을 아랫줄로. */}
      <div style={{ display: "flex", gap: 24, flex: 1, flexWrap: "wrap" }}>
        {/* alignSelf:flex-start 로 이 묶음이 세로로 내용만큼만 차지하게 한다 — 그래야
            옆의 세로 막대가 (기본 stretch 로) 왼쪽 텍스트 칸과 **위아래 끝이 정확히
            일치**한다. 예전엔 묶음이 카드 본문 전체 높이로 늘어나 막대만 위아래로
            삐져나왔다. */}
        <div style={{ display: "flex", alignSelf: "flex-start", gap: 16, flexShrink: 0 }}>
          {/* -25%·"전고점으로부터"를 막대 높이에 맞춰 세로 가운데로 — 종가 블록을 빼면서
              위로 몰려 보이던 걸 막대와 눈높이가 맞게 중앙 정렬한다. */}
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <span style={{ fontFamily: MONO, fontSize: 34, fontWeight: 700, color: v.color, letterSpacing: "-0.03em" }}>{gap > 0 ? "+" : ""}{v.disp}{v.unit}</span>
            <span style={{ fontSize: 10, fontWeight: 600, color: C.sub, marginTop: 4 }}>{gap > 0 ? "이전 전고점 돌파" : "전고점으로부터"}</span>
          </div>
          {/* 전고점을 수위 눈금처럼 읽는 통. 세 가지를 고쳤다.
              (1) 전고점 라벨을 통 안 우상단에서 통 바로 위로 뺐다 — 통의 윗변이 곧 전고점이라
                  라벨이 그 선에 붙어 있어야 '눈금'으로 읽힌다(안에 있으면 그냥 캡션이었다).
              (2) 수면에 실선을 그었다. 색 덩어리만 있으면 어디까지가 '지금'인지 눈이 못 짚는다.
              (3) 그라데이션의 #7cbde6 은 팔레트 밖 하드코딩이라 테마를 안 따랐다 — 단색+투명도로.
              막대 높이는 고정한다(예전엔 옆 텍스트 칸에 맞춰 늘어났는데 그 칸이 없어졌다). */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: C.sub, whiteSpace: "nowrap" }}>
              전고점{typeof priorHigh === "number" ? ` ${num(priorHigh)}` : ""}
            </span>
            <div style={{ width: 92, height: 134, position: "relative", background: C.bg, borderRadius: 10, overflow: "hidden" }}>
              <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: `${fillH}%`, background: C.cold, opacity: 0.75 }} />
              <div style={{ position: "absolute", left: 0, right: 0, bottom: `${fillH}%`, height: 2, background: C.cold }} />
            </div>
          </div>
        </div>
        {/* flex-basis 240 — 이만큼도 안 남으면 아랫줄로 내려간다. 구분선은 그때 왼쪽에
            있으면 안 되므로(아랫줄에선 위가 맞다) globals.css 의 .hz-peer-list 가 맡는다. */}
        {tops.length > 0 && (
          <div className="hz-peer-list" style={{ flex: "1 1 240px", minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: 10 }}>
            {/* 현재가·52주 고점 둘 다 야후 **종가**다. 실시간이 아니다 — 파이프라인이 하루 두 번
                받아 저장한 값을 읽기만 한다(lib/data.getTopStockHighGaps 주석 참고).
                이 카드가 장중에 움직이면 왼쪽 지수 게이지·햇쩨 지수와 시점이 갈리기 때문이다.
                툴팁은 출처와 기준일 한 줄로 끝낸다(2026-07-29 요청, 길어서 줄였다).
                직전 판에는 "실시간이 아니다"와 "고점이 장중 고가라 3%쯤 깊게 나온다"가
                더 붙어 있었다. 둘 다 사실이지만 툴팁 한 칸에 세 문장은 안 읽힌다 —
                되살릴 일이 있으면 lib/data.getTopStockHighGaps 주석에 근거가 남아 있다.
                기준일은 값이 있을 때만 붙인다 — 지수 배지와 같은 날이라 평소엔 되풀이지만,
                갈리는 날에 아무 말도 없는 게 더 나쁘다. */}
            {/* hz-tip-end — 이 라벨은 2칸 카드의 오른쪽 절반에 있어, 좁은 화면에선 가운데
                정렬 툴팁(240px)의 절반이 화면 밖으로 나가 가로 스크롤이 생겼다(실측 59px). */}
            <span
              className="hz-tip hz-tip-wide hz-tip-end"
              data-tip={`현재가와 52주 고점 모두 야후 파이낸스 종가 기준입니다${
                tops[0]?.priceDate ? ` (${tops[0].priceDate} 종가)` : ""
              }.`}
              data-ga-tip="high_gap_source"
              style={{ fontSize: 10, fontWeight: 700, color: C.sub }}
            >
              거래대금 상위 종목의 52주 고점 대비
            </span>
            {tops.map((s) => {
              // 고점 대비 낙폭이 클수록 막대가 짧다 — 지수 게이지와 같은 읽기 방향.
              const pct = Math.max(0, Math.min(100, 100 + s.gapPct));
              return (
                <div key={s.code} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: C.ink, width: 68, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</span>
                  <div style={{ flex: 1, height: 6, borderRadius: 999, background: C.track, overflow: "hidden", minWidth: 0 }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: C.cold, borderRadius: 999 }} />
                  </div>
                  <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: C.cold, width: 46, textAlign: "right" }}>
                    {s.gapPct >= 0 ? "+" : ""}{s.gapPct.toFixed(1)}%
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <Foot text={v.desc} />
    </Shell>
  );
}

// 코스피 상승 속도 — '얼마나 높이 왔나'(위 신고가 카드)와 짝을 이루는 '얼마나 빨리 왔나'.
// 둘은 같은 종가에서 나오지만 실측 상관이 +0.13으로 거의 직교한다: 같은 전고점 근처라도
// 두 달 만에 온 것과 1년에 걸쳐 온 것은 다르다. details 에 기간 양끝 종가가 들어 있어
// "6,418 → 6,798" 처럼 근거를 그대로 보여준다.
/**
 * 코스피 상승 속도 — 60거래일 수익률(%).
 *
 * 차트는 지수 값이 아니라 **시작점 대비 %**를 그린다. 지수 값을 그리면 y축이 그 60일의
 * 최소~최대로 늘어나서 ±1% 든 ±30% 든 그림이 똑같아진다 — "얼마나" 움직였는지가 통째로
 * 사라진다. 시작점을 0%로 두면 y축이 곧 퍼센트라 높이가 그대로 크기다.
 *
 * 0선 위는 hot, 아래는 cold 로 나눠 칠한다. 같은 −5% 라도 곧게 빠진 것과 크게 올랐다
 * 무너진 것이 면적으로 갈린다.
 *
 * 호버 크로스헤어는 MDD 낙폭 차트와 같은 어법이다 — SVG 위에 투명한 세로 띠를 깔고
 * 각 띠가 hz-vline(기준선)과 hz-tip(툴팁)을 낸다.
 *
 * ⚠️ preserveAspectRatio="none" 이라 획이 가로로 늘어난다. 모든 stroke 에
 * vectorEffect="non-scaling-stroke" 를 걸어야 지정한 두께로 그려진다.
 */
function CardSpeed({ v, path = [] }: { v: Pick; path?: ClosePoint[] }) {
  const from = v.details?.from_close;
  const to = v.details?.to_close;
  const spd = v.raw ?? 0;
  const up = spd >= 0;
  const num = (n: number) => n.toLocaleString("ko-KR", { maximumFractionDigits: 0 });

  const base = path[0]?.close ?? 0;
  const pts = base > 0 ? path.map((p) => ({ date: p.date, pct: (p.close / base - 1) * 100 })) : [];
  const hi = pts.length ? Math.max(...pts.map((p) => p.pct), 0) : 0;
  const lo = pts.length ? Math.min(...pts.map((p) => p.pct), 0) : 0;
  // 0선이 가운데 오도록 위아래를 같은 폭으로 잡는다 — 눈금을 읽기 쉬워진다.
  const span = Math.max(Math.abs(hi), Math.abs(lo), 5) * 1.12;
  const H = 72;
  const y = (t: number) => H / 2 - (t / span) * (H / 2);
  const line = pts.map((p, i) => `${(i / Math.max(1, pts.length - 1)) * 100},${y(p.pct)}`).join(" ");
  const step = span > 25 ? 20 : span > 12 ? 10 : 5;
  const ticks: number[] = [];
  for (let t = -Math.floor(span / step) * step; t <= span; t += step) ticks.push(t);

  return (
    <Shell hit={v.isHit} minH={210}>
      <TitleRow desc={v.headline} icon="trending_up" name={v.name} />
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 10 }}>
        <span style={{ fontFamily: MONO, fontSize: 30, fontWeight: 700, color: v.color, letterSpacing: "-0.03em" }}>
          {up ? "+" : ""}{v.disp}{v.unit}
        </span>
        {typeof from === "number" && typeof to === "number" && (
          <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 11, color: "var(--c-muted)" }}>
            {num(from)} → {num(to)}
          </span>
        )}
      </div>

      {pts.length < 2 ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", paddingTop: 18 }}>
          <HeatBar v={v} hideThreshold />
        </div>
      ) : (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ flex: 1, position: "relative", height: H, minWidth: 0 }}>
              <svg viewBox={`0 0 100 ${H}`} style={{ width: "100%", height: H, display: "block" }} preserveAspectRatio="none">
                <defs>
                  {/* 0선 위/아래를 따로 칠하려면 반씩 잘라야 한다. 이 카드는 한 장뿐이라 id 를 고정으로 둔다. */}
                  <clipPath id="spd-up"><rect x="0" y="0" width="100" height={H / 2} /></clipPath>
                  <clipPath id="spd-dn"><rect x="0" y={H / 2} width="100" height={H / 2} /></clipPath>
                </defs>
                {ticks.map((t) => (
                  <line
                    key={t} x1="0" y1={y(t)} x2="100" y2={y(t)}
                    stroke={t === 0 ? C.ink : C.line} strokeWidth={t === 0 ? 1 : 0.6}
                    opacity={t === 0 ? 0.5 : 0.75} vectorEffect="non-scaling-stroke"
                  />
                ))}
                <polygon points={`0,${H / 2} ${line} 100,${H / 2}`} fill={C.hot} opacity={0.26} clipPath="url(#spd-up)" />
                <polygon points={`0,${H / 2} ${line} 100,${H / 2}`} fill={C.cold} opacity={0.26} clipPath="url(#spd-dn)" />
                <polyline points={line} fill="none" stroke={v.color} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
              </svg>
              {/* 크로스헤어 — MDD 낙폭 차트와 같은 어법. 끝쪽 지점은 툴팁이 카드 밖으로
                  넘치지 않게 여는 방향을 튼다(안 그러면 가로 스크롤이 생긴다). */}
              <div style={{ position: "absolute", inset: 0, display: "flex" }}>
                {pts.map((p, i) => {
                  const at = pts.length <= 1 ? 0 : i / (pts.length - 1);
                  const edge = at < 0.25 ? " hz-tip-start" : at > 0.75 ? " hz-tip-end" : "";
                  return (
                    <div
                      key={p.date}
                      className={`hz-tip hz-vline${edge}`}
                      data-tip={`${shortDate(p.date)} · ${p.pct >= 0 ? "+" : ""}${p.pct.toFixed(1)}%`}
                      style={{ flex: 1, position: "relative" }}
                    />
                  );
                })}
              </div>
            </div>
            <div style={{ position: "relative", width: 26, height: H, flexShrink: 0 }}>
              {ticks.map((t) => (
                <span key={t} style={{ position: "absolute", top: y(t) - 6, right: 0, fontFamily: MONO, fontSize: 8.5, fontWeight: 600, color: t === 0 ? C.sub : "var(--c-muted)" }}>
                  {t > 0 ? "+" : ""}{t}
                </span>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9.5, fontFamily: MONO, color: "var(--c-muted)" }}>
            <span>90일 전 = 0%</span>
            <span>
              최고 <span style={{ color: C.hot, fontWeight: 700 }}>{hi >= 0 ? "+" : ""}{hi.toFixed(1)}%</span>
              {" · "}최저 <span style={{ color: C.cold, fontWeight: 700 }}>{lo.toFixed(1)}%</span>
            </span>
          </div>
        </div>
      )}
      <Foot text={v.desc} />
    </Shell>
  );
}

// 6. VKOSPI — 반원 게이지 (과열도 + 실제 값)
/**
 * VKOSPI — 숫자를 하나만 쓴다.
 *
 * 예전엔 "과열도 23/100"과 "실제 VKOSPI 87"을 같이 보여줬는데, 초보에겐 둘 중 뭘 봐야
 * 하는지도, 왜 하나는 낮고 하나는 높은지도(과열도는 낮을수록 과열이라 역방향) 알 수
 * 없었다. 지수 값 하나만 크게 두고, 그 값이 높은지 낮은지는 최근 30일 범위 안의
 * 위치로 보여준다 — "87"만 봐선 모르지만 "73~97 중 여기"면 바로 읽힌다.
 */
function CardVkospi({ v }: { v: Pick }) {
  const hist = v.history.filter((x) => typeof x === "number");
  const lo = hist.length ? Math.min(...hist) : null;
  const hi = hist.length ? Math.max(...hist) : null;
  const cur = v.raw;
  // 범위 안 위치(0=최저, 1=최고). 최근 30일이 평평하면 가운데로 둔다.
  const pos = cur !== null && lo !== null && hi !== null && hi > lo ? (cur - lo) / (hi - lo) : 0.5;
  // 색은 '불안의 크기' 기준 — 변동성이 높을수록 시장이 불안하다(과열도와 방향이 반대).
  const c = pos >= 0.66 ? C.cold : pos <= 0.33 ? C.hot : C.sub;
  const verdict = pos >= 0.66 ? "최근 30일 중 높은 편" : pos <= 0.33 ? "최근 30일 중 낮은 편" : "최근 30일 평균 수준";
  return (
    <Shell hit={v.isHit} minH={230}>
      <TitleRow desc={v.headline} icon="monitor_heart" name={v.name} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
          <span style={{ fontFamily: MONO, fontSize: 40, fontWeight: 700, color: c, letterSpacing: "-0.03em", lineHeight: 1 }}>{v.disp}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.sub }}>변동성지수</span>
          <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: c }}>{verdict}</span>
        </div>
        <div>
          <div style={{ position: "relative", height: 8, borderRadius: 999, background: `linear-gradient(90deg, ${C.hot}, var(--c-track), ${C.cold})` }}>
            <span
              style={{
                position: "absolute",
                left: `${pos * 100}%`,
                top: -3,
                transform: "translateX(-50%)",
                width: 14,
                height: 14,
                borderRadius: "50%",
                background: C.ink,
                border: `2px solid ${C.card}`,
              }}
            />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 7, fontSize: 9, fontWeight: 700 }}>
            <span style={{ color: C.hot }}>방심 {lo !== null ? Math.round(lo) : "-"}</span>
            <span style={{ color: C.sub }}>최근 30일 범위</span>
            <span style={{ color: C.cold }}>불안 {hi !== null ? Math.round(hi) : "-"}</span>
          </div>
        </div>
      </div>
      <Foot text={v.desc} />
    </Shell>
  );
}


// 8. 코스피 vs 아시아 — 4개국 상대 막대 (details 있으면 목업 원본, 없으면 과열도)
function CardAsia({ v }: { v: Pick }) {
  const dt = v.details;
  if (!dt) {
    return (
      <Shell span={2} hit={v.isHit} minH={230}>
        <TitleRow desc={v.headline} icon="public" name={v.name} badge="최근 한 달" />
        <Big disp={v.raw !== null && v.raw > 0 ? `+${v.disp}` : v.disp} unit={v.unit} color={v.color} size={40} sub="아시아 3국 평균 대비" />
        <HeatBar v={v} />
        <Foot text={v.desc} />
      </Shell>
    );
  }
  const k = dt.kospi ?? 0;
  // 나라마다 다른 색(파랑·주황·하늘·베이지)을 주던 걸 걷었다. 그 색들은 아무 뜻도
  // 없으면서 "일본은 뜨겁고 대만은 식었다"처럼 읽혔다. 이 카드의 질문은 하나다 —
  // "코스피가 이웃보다 앞섰나". 그래서 코스피만 파랑, 나머지 셋은 같은 중립색으로
  // 두고, 코스피 높이에 기준선을 그어 위아래를 한눈에 재게 한다.
  const bars = [
    { label: "KOSPI", sub: "한국", index: 100, self: true },
    { label: "Nikkei", sub: "일본", index: 100 + ((dt.nikkei ?? 0) - k), self: false },
    { label: "HangSeng", sub: "홍콩", index: 100 + ((dt.hangseng ?? 0) - k), self: false },
    { label: "Taiex", sub: "대만", index: 100 + ((dt.taiex ?? 0) - k), self: false },
  ];
  // floorPct를 55로 올려 강조는 유지하되 과하지 않게 — 최소 막대가 55%까지만
  // 내려가 100 vs 117 같은 차이가 지나치게 벌어지지 않는다.
  const heights = emphasizedHeights(bars.map((b) => b.index), 55);
  const kospiHeight = heights[0];
  return (
    <Shell span={2} hit={v.isHit} minH={230}>
      <TitleRow desc={v.headline} icon="public" name={v.name} badge="최근 한 달" />
      <div style={{ fontSize: 9, color: "var(--c-muted)", fontWeight: 600, marginBottom: 4 }}>
        KOSPI를 100으로 둔 상대 지수 · 코스피 초과수익률 {v.raw !== null && v.raw > 0 ? "+" : ""}
        {v.disp}
        {v.unit}
      </div>
      {/* 코스피 높이에 파선을 그어, 이웃이 그 선 위로 나갔는지 아래인지가 바로 보이게 한다.
          라벨 줄(약 26px)은 기준선 계산에서 빼야 선이 막대 끝에 정확히 걸린다. */}
      <div style={{ flex: 1, position: "relative", display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, paddingTop: 6 }}>
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: ASIA_BAR_BASE + (kospiHeight / 100) * ASIA_BAR_MAX,
            borderTop: `1px dashed ${C.blue}`,
            opacity: 0.45,
          }}
        />
        {bars.map((b, i) => (
          <AsiaBar key={b.label} label={b.label} sub={b.sub} index={b.index} heightPct={heights[i]} self={b.self} />
        ))}
      </div>
      <Foot text={v.desc} />
    </Shell>
  );
}


// 결합 카드는 두 서브값을 위쪽 행에, 두 간단 설명을 아래쪽 행에 나눠 담고, 그 사이에
// 카드 전체 폭 divider를 둔다 — 다른 카드들과 divider 가로 위치를 맞추기 위해서다.
function SubNote({ text }: { text: string }) {
  return (
    <p style={{ flex: 1, margin: 0, fontSize: 11, color: C.sub, fontWeight: 600, lineHeight: 1.5 }}>{text}</p>
  );
}

// 2026-07-23 코스닥 칸을 뺐다 — 지표 자체를 점수에서 내렸기 때문이다(카드 한 칸을
// kospi_speed_60d 에 내줬다. data-pipeline/config/indicator_thresholds.py 참고).
// 남은 금 비율 하나뿐이라 2칸 → 1칸으로 줄이고 이름도 실제 내용에 맞춘다.
function CardGoldRatio({ v }: { v: Pick }) {
  // "1.65배"가 어디서 나온 값인지 두 원값으로 바로 드러낸다 — 공식만 적어 두면
  // (예전의 "코스피 지수 ÷ 금 시세") 배수가 큰지 작은지 가늠할 근거가 없다.
  const k = v.details?.kospi_close;
  const g = v.details?.gold_close;
  const num = (n: number) => n.toLocaleString("ko-KR", { maximumFractionDigits: 0 });
  const note =
    typeof k === "number" && typeof g === "number"
      ? `코스피 ${num(k)} ÷ 금 ${num(g)}`
      : "코스피 지수 ÷ 금 시세";
  return (
    <Shell hit={v.isHit} minH={210}>
      <TitleRow icon="balance" name={v.name} desc={v.headline} />
      <div>
        <span style={{ fontFamily: MONO, fontSize: 30, fontWeight: 700, color: v.color, letterSpacing: "-0.03em" }}>{v.disp}{v.unit}</span>
        <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: C.sub, marginTop: 6 }}>{note}</span>
      </div>
      {/* paddingTop 으로 과열도 박스와의 최소 간격을 보장한다 — flex-end 만으로는 카드가
          짧을 때 근거 줄에 바로 붙어 두 덩어리가 한 블록처럼 보인다. */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", paddingTop: 18 }}>
        <HeatBar v={v} />
      </div>
      <Foot text={v.desc} />
    </Shell>
  );
}

// 10. 거래대금 급증도 — 오늘 vs 30일 평균 (details 있으면 실제 평균, 없으면 과열기준 폴백)
function CardVolume({ v }: { v: Pick }) {
  const dt = v.details;
  const avg = dt?.avg_30d ?? null;
  const today = v.raw ?? null;
  const [avgH, todayH] = ratioBarHeights(avg, today);
  const avgFmt = avg !== null ? formatIndicatorValue(avg, "억원") : null;
  const surge = dt?.surge_pct ?? null;
  return (
    <Shell hit={v.isHit} minH={230}>
      <TitleRow desc={v.headline} icon="groups" name={v.name} />
      {/* 급증률은 제목 행의 right 자리에 있었는데, 거기는 초고온 배지가 뜨는 자리라
          이 카드가 초고온에 들면 둘이 겹친다(괴리 카드와 같은 이유로 본문으로 내렸다).
          내려놓고 보니 이 숫자가 카드의 결론이라 다른 1칸 카드처럼 큰 수치로 두는 게 맞다. */}
      {surge !== null && (
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, margin: "2px 0 10px" }}>
          <span style={{ fontFamily: MONO, fontSize: 26, fontWeight: 700, color: surge >= 0 ? C.hot : C.cold, letterSpacing: "-0.03em", lineHeight: 1 }}>
            {surge >= 0 ? "+" : ""}
            {surge}%
          </span>
          <span style={{ fontSize: 11, fontWeight: 600, color: C.sub }}>평소 대비</span>
        </div>
      )}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flex: 1, minHeight: 88 }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 6, height: "100%" }}>
          <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.neutral }}>
            {avgFmt ? `${avgFmt.display}${avgFmt.displayUnit}` : v.thDisp ?? "-"}
          </span>
          <div style={{ width: "100%", height: `${avgH}%`, background: C.line, borderRadius: "6px 6px 0 0" }} />
          <span style={{ fontSize: 9, fontWeight: 600, color: C.sub }}>{avg !== null ? "30일 평균" : "과열 기준"}</span>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 6, height: "100%" }}>
          <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: v.color }}>{v.disp}{v.unit}</span>
          <div style={{ width: "100%", height: `${todayH}%`, background: v.color, borderRadius: "6px 6px 0 0" }} />
          <span style={{ fontSize: 9, fontWeight: 600, color: C.sub }}>최근 거래일</span>
        </div>
      </div>
      <Foot text={v.desc} />
    </Shell>
  );
}

// 11. 원/달러 환율 변동성 — 값 + 장식 파동 + 과열도
function CardFx({ v }: { v: Pick }) {
  return (
    <Shell hit={v.isHit} minH={230}>
      <TitleRow desc={v.headline} icon="waves" name={v.name} />
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
        <span style={{ fontFamily: MONO, fontSize: 30, fontWeight: 700, color: v.color, letterSpacing: "-0.03em" }}>±{v.disp}{v.unit}</span>
      </div>
      <div style={{ flex: 1, position: "relative", minHeight: 50 }}>
        <Sparkline
          data={v.history}
          color={v.color}
          tips={v.historyPoints.map((pt) => `${shortDate(pt.date)} · ±${pt.value.toFixed(2)}%`)}
        />
      </div>
      <Foot text={v.desc} />
    </Shell>
  );
}

// 15. 신용융자 잔고 — DB 미보유 placeholder ("준비 중")
function CardComingSoon() {
  return (
    <Shell minH={230}>
      <div style={{ opacity: 0.85, display: "flex", flexDirection: "column", flex: 1 }}>
        <TitleRow
          icon="credit_score"
          name={<span style={{ color: "var(--c-muted)" }}>신용융자 잔고</span>}
          desc="빚내서 주식을 산 금액"
          right={
            <span style={{ background: "var(--c-blue-tint)", color: C.blue, fontWeight: 700, padding: "4px 9px", borderRadius: 6, fontSize: 9 }}>준비 중</span>
          }
        />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="100%" height="70" viewBox="0 0 100 40" preserveAspectRatio="none">
            <path d="M0 34 L20 32 L40 28 L60 22 L80 15 L100 8" fill="none" stroke={C.line} strokeDasharray="4,3" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        </div>
        <Foot text="빚내서 주식 사는 돈이 불어나면 과열의 대표 신호로 볼 수 있습니다." color="var(--c-muted)" />
      </div>
    </Shell>
  );
}

// ── 소셜 지표 카드들 ──────────────────────────────────────────────

// '평소 대비 N배' — 절대 건수가 없는 네이버 검색지수(0~100 상대지수)를 직관적으로
// 보여준다. ratio = 현재 / 최근 30일 평균. 가운데 눈금(1배=평소)을 기준으로
// 오른쪽으로 넘으면 평소보다 활발(과열 방향).
function VsAvg({ ratio, size = 26 }: { ratio: number; size?: number }) {
  const c = ratio > 1.05 ? C.hot : ratio < 0.95 ? C.cold : C.sub;
  const arrow = ratio > 1.05 ? "↑" : ratio < 0.95 ? "↓" : "";
  const fill = Math.max(4, Math.min(100, (ratio / 2) * 100)); // 2배 = 꽉 참, 1배 = 50%
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: C.sub, marginBottom: 2 }}>평소 대비</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4, whiteSpace: "nowrap" }}>
        <span style={{ fontFamily: MONO, fontSize: size, fontWeight: 700, color: c, letterSpacing: "-0.03em" }}>{ratio.toFixed(1)}배</span>
        <span style={{ fontSize: 15, fontWeight: 700, color: c }}>{arrow}</span>
      </div>
      <div style={{ position: "relative", height: 8, background: C.track, borderRadius: 999, marginTop: 8, overflow: "hidden" }}>
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${fill}%`, background: c, borderRadius: 999 }} />
        <div style={{ position: "absolute", left: "50%", top: -2, bottom: -2, width: 2, background: "var(--c-marker)" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, fontWeight: 600, color: C.sub, marginTop: 5 }}>
        <span>적음</span>
        <span>평소(1배)</span>
        <span>많음</span>
      </div>
    </div>
  );
}

// 실물–증시 괴리 — 두 축(실물 강도 / 증시 강세)을 각자 역대 백분위로 매겨 나란히 둔다.
// 괴리는 둘의 '곱'이 아니라 '차이'(lead = 증시%ile − 실물%ile)다 — 2026-07-22 PR #69 에서
// 양방향 게이지로 바꿨는데 이 주석만 옛 설계(곱·실물 스트레스)에 머물러 있었다.
function DivergenceBar({
  label,
  hint,
  value,
  color,
  tip,
  tipEdge = "start",
}: {
  label: string;
  hint: string;
  value: number;
  color: string;
  tip?: string;
  /** 툴팁이 열리는 방향. 오른쪽 막대는 "end"(안쪽=왼쪽으로) 로 둔다. */
  tipEdge?: "start" | "end";
}) {
  const level = value >= 66 ? "높음" : value >= 33 ? "보통" : "낮음";
  return (
    <div style={{ flex: 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.ink }}>{label}</span>
        {/* 이 막대는 늘 둘씩 나란히 놓인다. 240px 툴팁을 가운데 정렬로 두면 오른쪽 막대
            것이 카드 밖으로 나갔다(좁은 화면에선 페이지 가로 스크롤까지). 왼쪽 막대는
            오른쪽으로, 오른쪽 막대는 왼쪽으로 열어 둘 다 카드 안에 머문다. */}
        {tip && (
          <span
            className={`hz-tip hz-tip-wide ${tipEdge === "end" ? "hz-tip-end" : "hz-tip-start"}`}
            data-tip={tip}
            data-ga-tip={label}
            style={{ display: "inline-flex", cursor: "help" }}
          >
            <Icon name="help" style={{ fontSize: 13, color: C.sub }} />
          </span>
        )}
      </div>
      <div style={{ fontSize: 10, fontWeight: 600, color: C.sub, marginBottom: 6 }}>{hint}</div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontWeight: 700, marginBottom: 4 }}>
        <span style={{ color: C.sub }}>{level}</span>
        <span style={{ color, fontFamily: MONO }}>
          {Math.round(value)}
          <span style={{ color: "var(--c-faint)" }}>/100</span>
        </span>
      </div>
      <div style={{ height: 8, background: C.track, borderRadius: 999, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.max(0, Math.min(100, value))}%`, background: color, borderRadius: 999 }} />
      </div>
    </div>
  );
}

function CardDivergence({ v }: { v: Pick }) {
  const dt = v.details;
  // 양방향 게이지: 실물·증시를 각자 역대 백분위(0~100)로 매기고, 어느 쪽이 앞서는지 보여준다.
  const real = dt?.real_strength ?? 0;
  const market = dt?.market_strength ?? 0;
  const lead = dt?.lead ?? market - real; // +면 증시 강세, −면 실물 강세
  const marketLeads = lead >= 0;
  const leadColor = marketLeads ? C.hot : C.blue;
  // 헤드라인: "증시 63% 강세" / "실물 63% 강세". 부호로 방향, 크기로 격차.
  const leadWho = marketLeads ? "증시" : "실물 경제";
  // 실물 강도 툴팁 — 실제 CCSI 지수와 백분위 변환 근거.
  const ccsi = dt?.ccsi_value;
  const realTip =
    ccsi != null
      ? `한국은행 소비자심리지수(CCSI) 최신값은 ${ccsi}입니다. 이게 역대(2008~) 분포에서 몇 번째로 높은지를 0~100으로 매긴 값이 실물 강도입니다. 그래서 ${ccsi} → ${Math.round(real)}/100(역대 ${Math.round(real)}% 지점)이 됩니다.`
      : undefined;
  // 증시 강세 툴팁 — 전고점 대비 낙폭과 백분위 변환 근거.
  const gap = dt?.kospi_gap;
  const marketTip =
    gap != null
      ? // "지금"이라고 쓰면 신고가 카드의 실시간 값(-24%)과 어긋나 보인다. 이 숫자는 점수
        // 계산에 쓰는 KRX **종가** 기준이라 근거를 밝힌다 — 장중 값으로 과열도를 매기면
        // 하루 종일 점수가 흔들리므로 여기는 종가를 쓰는 게 맞다.
        `코스피는 최근 종가 기준 전고점보다 ${Math.abs(gap)}% 아래입니다. 이 낙폭이 역대(10년) 분포에서 얼마나 얕은지를 0~100으로 매긴 값이 증시 강세입니다. 그래서 ${Math.round(market)}/100(역대 ${Math.round(market)}% 지점)이 됩니다.`
      : undefined;
  return (
    <Shell span={2} hit={v.isHit} minH={236}>
      <TitleRow desc={v.headline} icon="compare_arrows" name={v.name} />
      {/* 결론 수치는 제목 행의 right 자리에 있었는데, 거기는 초고온 배지가 뜨는 자리라
          이 카드가 초고온에 들면 둘이 겹친다. 카드 본문 맨 위로 내려 배지와 자리를 나눈다 —
          span=2 인데 내용이 짧아 남던 공간도 이 줄이 채운다. */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, margin: "2px 0 0" }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: C.sub }}>{leadWho}</span>
        <span style={{ fontFamily: MONO, fontSize: 32, fontWeight: 700, color: leadColor, letterSpacing: "-0.02em", lineHeight: 1 }}>{Math.round(Math.abs(lead))}</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--c-faint)" }}>%</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.sub }}>강세</span>
      </div>
      {/* span=2 인데 내용이 짧아 남는 공간을 박스·Foot 이 auto 마진으로 나눠 갖는다. */}
      <div style={{ background: C.bg, borderRadius: 10, padding: 16, marginTop: "auto", display: "flex", gap: 22 }}>
        <DivergenceBar label="실물 강도" hint="소비심리(CCSI)" value={real} color={C.blue} tip={realTip} />
        <DivergenceBar label="증시 강세" hint="신고가 근접도" value={market} color={C.hot} tip={marketTip} tipEdge="end" />
      </div>
      <Foot text={v.desc} />
    </Shell>
  );
}

// 라인+마커형 (초보검색/재테크도서/GitHub)
// 네이버 검색지수(초보검색)는 details.vs_avg가 있어 '평소 대비 N배'로,
// 그 외(재테크도서·GitHub)는 기존 값+과열기준 라인으로 보여준다.
function CardTrend({ v, icon, span }: { v: Pick; icon: string; span?: 1 | 2 }) {
  const vsAvg = v.details?.vs_avg ?? null;
  return (
    <Shell span={span} hit={v.isHit} minH={210}>
      <TitleRow desc={v.headline} icon={icon} name={v.name} />
      {vsAvg !== null ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <VsAvg ratio={vsAvg} />
        </div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
            <span style={{ fontFamily: MONO, fontSize: 28, fontWeight: 700, color: v.color, letterSpacing: "-0.03em" }}>{v.disp}{v.unit}</span>
            {v.hotDisp && <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 700, color: C.hot }}>초고온 기준 {v.hotDisp}</span>}
          </div>
          <div style={{ flex: 1, position: "relative", minHeight: 52 }}>
            <Sparkline data={v.history} color={v.color} />
          </div>
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
): { pos: number; neg: number; decided: number; total: number } | null {
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
  return { pos, neg: 100 - pos, decided, total };
}

function CardSentiment({
  v,
  icon,
  // 무엇을 센 건수인지는 지표마다 다르다(디시=게시글, 뉴스=뉴스). "낙관:비관 · N건"처럼
  // 비율 설명을 반복하는 것보다, 표본이 뭔지 알려주는 쪽이 정보량이 크다.
  countNoun,
  span = 1,
}: {
  v: Pick;
  icon: string;
  countNoun: string;
  span?: 1 | 2;
}) {
  const raw = v.raw ?? 0;
  const ratio = sentimentRatio(v.details);
  // 막대는 헤드라인과 **같은 기준**을 써야 한다. 비율 표기가 가능한 날엔 낙관 비중을
  // 그대로 축에 올린다(50=중립). 한 카드 안에서 헤드라인은 낙관인데 막대는 비관을
  // 가리키는 모순이 생기지 않게 하려는 것 — 카더라 센티먼트의 색/라벨 어긋남과 같은 종류의
  // 사고를 여기서 미리 막는다.
  //
  // 건수가 없는 옛 행은 순감성(-100~100)으로 폴백한다. 뉴스·디시 모두 (긍정-부정)/전체×100
  // 이라 단위가 같으므로 공유 절대 축(bar 절반폭 = |순감성%|, ±50 캡)을 쓴다 — 지표별
  // details.scale로 정규화하면 디시가 자기 범위의 극단이라 뉴스보다 길어 보이는 착시가 났다.
  const pos = ratio ? ratio.pos : 50 + Math.max(-50, Math.min(50, raw));
  const optimistic = ratio ? ratio.pos >= 50 : raw >= 0;
  // 색도 라벨과 같은 3구간을 따른다. 단순히 50 기준으로 갈라 칠하면 55:45가 "중립"이라고
  // 적힌 채 낙관색이 되는, 카더라에서 고친 것과 똑같은 어긋남이 생긴다.
  const tone = ratio ? sentimentTone(ratio.pos).tone : null;
  const barColor = tone
    ? tone === "hot"
      ? C.hot
      : tone === "cold"
        ? C.cold
        : C.sub
    : raw === 0
      ? C.neutral
      : optimistic
        ? C.hot
        : C.cold;
  return (
    <Shell span={span} hit={v.isHit} minH={210}>
      <TitleRow desc={v.headline} icon={icon} name={v.name} />
      {ratio ? (
        /* 카더라 생태계 센티먼트와 같은 짜임 — 큰 수치 + 우세 라벨, 그 아래 기준 캡션.
           라벨·색 구간도 그쪽과 공유한다(lib/format.ts sentimentTone). */
        <div style={{ margin: "8px 0 0" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
            {/* 순서는 앱 전체에서 '비관 : 낙관'으로 통일한다(카더라 테마 막대도 동일). */}
            <span style={{ fontFamily: MONO, fontSize: 30, fontWeight: 700, letterSpacing: "-0.03em" }}>
              <span style={{ color: C.cold }}>{ratio.neg}</span>
              <span style={{ color: C.sub }}>:</span>
              <span style={{ color: C.hot }}>{ratio.pos}</span>
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, color: barColor }}>{sentimentTone(ratio.pos).label}</span>
          </div>
          <div style={{ fontSize: 10, color: C.sub, marginTop: 4 }}>
            {countNoun} <span style={{ fontFamily: MONO }}>{ratio.total.toLocaleString("ko-KR")}</span>건 분석
          </div>
        </div>
      ) : (
        <div style={{ fontFamily: MONO, fontSize: 30, fontWeight: 700, color: barColor, letterSpacing: "-0.03em", margin: "8px 0 0" }}>
          {raw > 0 ? "+" : ""}
          {v.disp}
          {v.unit}
        </div>
      )}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
        <div style={{ position: "relative", height: 16, background: C.track, borderRadius: 999 }}>
          <div style={{ position: "absolute", left: "50%", top: -3, bottom: -3, width: 2, background: "var(--c-marker)" }} />
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              background: barColor,
              borderRadius: 999,
              ...(optimistic ? { left: "50%", width: `${pos - 50}%` } : { right: "50%", width: `${50 - pos}%` }),
            }}
          />
          <div style={{ position: "absolute", top: "50%", left: `${pos}%`, transform: "translate(-50%,-50%)", width: 14, height: 14, borderRadius: 999, background: barColor, border: `3px solid ${C.card}` }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, fontWeight: 700, marginTop: 8 }}>
          <span style={{ color: C.cold }}>비관</span>
          <span style={{ color: C.sub }}>중립</span>
          <span style={{ color: C.hot }}>낙관</span>
        </div>
      </div>
      <Foot text={v.desc} />
    </Shell>
  );
}

// 유튜브 — 평소(기준) vs 오늘 막대 (HIT)
function CardYoutube({ v }: { v: Pick }) {
  const ratio = v.raw && v.threshold ? v.raw / v.threshold : null;
  const [baseH, todayH] = ratioBarHeights(v.threshold, v.raw);
  return (
    <Shell hit={v.isHit} minH={210}>
      <TitleRow desc={v.headline} icon="play_circle" name={v.name} />
      {/* 예전엔 26px 짜리 막대 둘이 왼쪽에 몰려 있고 조회수만 오른쪽에 크게 떠 있었다.
          이 카드가 말하려는 건 절대 조회수가 아니라 '평소보다 몇 배'인데 그 문구가 9px 로
          제일 작았다. 배수를 큰 수치로 올리고, 비교 막대는 거래대금 급증도 카드와 같은
          짜임(전폭 두 칸 · 막대 위에 값)으로 맞춘다 — 같은 질문에는 같은 그림. */}
      {ratio !== null && (
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, margin: "2px 0 10px" }}>
          <span style={{ fontFamily: MONO, fontSize: 26, fontWeight: 700, color: v.color, letterSpacing: "-0.03em", lineHeight: 1 }}>
            {ratio.toFixed(1)}배
          </span>
          <span style={{ fontSize: 11, fontWeight: 600, color: C.sub }}>평소 대비</span>
        </div>
      )}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flex: 1, minHeight: 88 }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 6, height: "100%" }}>
          <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.sub }}>{v.thDisp ?? "-"}</span>
          <div style={{ width: "100%", height: `${baseH}%`, background: C.line, borderRadius: "6px 6px 0 0" }} />
          <span style={{ fontSize: 9, fontWeight: 600, color: C.sub }}>평소</span>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 6, height: "100%" }}>
          <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: v.color }}>{v.disp}{v.unit}</span>
          <div style={{ width: "100%", height: `${todayH}%`, background: v.color, borderRadius: "6px 6px 0 0" }} />
          <span style={{ fontSize: 9, fontWeight: 600, color: C.sub }}>오늘</span>
        </div>
      </div>
      <Foot text={v.desc} />
    </Shell>
  );
}

// 여윳돈이 향하는 곳 — 명품/오마카세 결합
function SubSpend({ v, icon }: { v: Pick; icon: string }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Icon name={icon} style={{ fontSize: 18, color: C.sub }} />
        <span style={{ fontSize: 12, fontWeight: 600, wordBreak: "keep-all" }}>{v.name}</span>
      </div>
      {v.details?.vs_avg != null ? (
        <VsAvg ratio={v.details.vs_avg} />
      ) : (
        <div style={{ display: "flex", alignItems: "flex-end", gap: 12 }}>
          <span style={{ fontFamily: MONO, fontSize: 26, fontWeight: 700, color: v.color }}>{v.disp}{v.unit}</span>
        </div>
      )}
    </div>
  );
}

function CardSpending({ luxury, dining }: { luxury: Pick; dining: Pick }) {
  return (
    <Shell span={2} hit={luxury.isHit || dining.isHit} minH={210}>
      <TitleRow icon="local_mall" name="여윳돈이 향하는 곳" desc="명품·외식 검색량으로 본 소비 심리" />
      <div style={{ display: "flex", gap: 32, flex: 1 }}>
        <SubSpend v={luxury} icon="shopping_bag" />
        <div style={{ width: 1, background: C.line }} />
        <SubSpend v={dining} icon="restaurant" />
      </div>
      {/* 지표가 둘인 카드의 설명 줄. Foot 과 박스 모델을 똑같이 맞춰야 같은 행에 놓인
          카드끼리 divider 가 같은 높이에 온다 — marginTop:auto 로 바닥에 붙이고,
          바깥 paddingTop 20 + 안쪽 minHeight 53/paddingTop 16 까지 Foot 과 동일하게 둔다.
          (예전엔 marginTop:16 에 minHeight 가 없어 안전장치 카드와 3px 어긋났다.) */}
      <div style={{ marginTop: "auto", paddingTop: 20 }}>
        <div style={{ display: "flex", gap: 32, boxSizing: "border-box", minHeight: 53, paddingTop: 16, borderTop: "1px solid var(--c-divider)" }}>
          <SubNote text={luxury.desc} />
          <div style={{ width: 1 }} />
          <SubNote text={dining.desc} />
        </div>
      </div>
    </Shell>
  );
}

// 업비트 — 김치프리미엄 / 거래량 강도 서브바 (details 있으면 목업 원본)
function CardUpbit({ v }: { v: Pick }) {
  const dt = v.details;
  const volLabel = (p: number) => (p >= 100 ? "HIGH" : p >= 60 ? "MID" : "LOW");
  return (
    <Shell hit={v.isHit} minH={210}>
      <TitleRow desc={v.headline} icon="currency_bitcoin" name={v.name} />
      {/* 이 지표의 raw_value는 두 서브지표의 '기준값 대비 진행률' 가중평균이라 0~100
          과열도 점수다 — 감성 지표의 pt(순감성)와는 축이 다르다. 같은 'pt'를 달면
          둘이 같은 단위처럼 보여 오해를 키우므로 '/100'으로 척도를 드러낸다.
          v.disp 대신 직접 반올림한다 — formatIndicatorValue 는 절댓값 10 미만이면
          소수점 둘째자리까지 쓰는데(작은 숫자는 소수가 의미 있다는 규칙), 100점 척도
          위의 "1.47/100"에선 그 두 자리가 있으나 마나다. 그 규칙은 "0.5배" 같은 배수
          지표를 위한 것이라 전역으로 못 바꾸고, 척도를 아는 이 카드에서만 눌러 준다. */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 3, marginBottom: 6 }}>
        <span style={{ fontFamily: MONO, fontSize: 28, fontWeight: 700, color: v.color, letterSpacing: "-0.03em" }}>
          {v.raw !== null ? Math.round(v.raw).toLocaleString("ko-KR") : v.disp}
        </span>
        <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 600, color: C.sub }}>/100</span>
        <span style={{ fontSize: 10, fontWeight: 600, color: C.sub, marginLeft: 4 }}>과열도</span>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
        {dt ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <UpbitKimchiBar premium={dt.kimchi_premium ?? 0} />
            <UpbitSubBar label="거래량 강도" value={volLabel(dt.volume_progress ?? 0)} pct={dt.volume_progress ?? 0} color={C.hot} />
          </div>
        ) : (
          <HeatBar v={v} />
        )}
      </div>
      <Foot text={v.desc} />
    </Shell>
  );
}

// 고점권 외국인 매도 — 최근 5거래일 누적 + 일별 순매수/순매도 다이버징 바
//
// 헤드라인은 raw 가 아니라 details.cum5(게이트 전 5일 누적)다. raw 는 고점권이 아니거나
// 외국인이 사는 중이면 0 인데, 최근 5년 기준 그런 날이 86% 라 raw 를 그대로 크게 띄우면
// 카드가 대부분의 날에 "0" 한 글자만 말하게 된다. 대신 실제 수급을 보여주고, 그게 점수에
// 반영되는 조건(고점권)인지 아닌지를 배지로 따로 알린다.
function CardNetBuy({ v }: { v: Pick }) {
  const dt = v.details as unknown as {
    daily5?: number[];
    dates5?: number[];
    cum5?: number;
    high_gap?: number;
    at_high?: number;
  } | null;
  // cum5 가 없는 옛 행(개인 순매수 시절)에서는 raw 로 떨어진다.
  const cum = dt?.cum5 ?? v.raw ?? 0;
  const atHigh = dt?.at_high === 1;
  const gap = dt?.high_gap;
  const daily = dt?.daily5 ?? [];
  // 거래일은 주말·휴장을 건너뛰어 화면에서 역산할 수 없다 — 파이프라인이 넣어준
  // YYYYMMDD 정수를 그대로 쓴다. 옛 행에는 없을 수 있어 빈 배열로 폴백한다.
  const dates = dt?.dates5 ?? [];
  // YYYYMMDD 정수 → "M/D"(shortDate 는 하이픈 문자열을 받는다).
  const ymdShort = (ymd: number) => shortDate(`${String(ymd).slice(0, 4)}-${String(ymd).slice(4, 6)}-${String(ymd).slice(6, 8)}`);
  const maxAbs = Math.max(1, ...daily.map((d) => Math.abs(d)));
  const isBuy = cum >= 0;
  // ⚠️ 색이 개인 순매수 때와 **반대**다. 여기서 froth 는 외국인이 파는 쪽이라
  // 순매도가 hot, 순매수가 cold 다. 옛 카드 색을 그대로 옮기면 뜻이 뒤집힌다.
  const tone = isBuy ? C.cold : C.hot;
  return (
    <Shell hit={v.isHit} minH={210}>
      <TitleRow desc={v.headline} icon="public" name={v.name} />
      <div style={{ margin: "6px 0 2px" }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: C.sub }}>최근 5거래일 누적</span>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          {/* "12,929억"은 한눈에 안 읽히고 "1.3조원"은 끝자리가 날아간다 — 둘을 함께 쓴다. */}
          <span style={{ fontFamily: MONO, fontSize: 24, fontWeight: 700, color: tone, letterSpacing: "-0.03em" }}>
            {cum >= 0 ? "+" : ""}{formatEokMixed(cum)}
          </span>
          <span style={{ fontSize: 12, fontWeight: 700, color: tone }}>{isBuy ? "순매수" : "순매도"}</span>
        </div>
        {/* 게이트 상태. 이 카드에서 가장 자주 받는 질문이 "왜 과열도가 0인가" 일 텐데,
            답이 여기 있다 — 고점권이 아니면 아무리 크게 팔아도 점수에 안 들어간다.
            gap 이 없는 옛 행에서는 이 줄을 통째로 뺀다(빈 괄호가 남지 않게). */}
        {gap != null && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }}>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: "2px 7px",
                borderRadius: 999,
                color: atHigh ? C.hot : C.sub,
                background: atHigh ? "var(--c-blue-tint)" : C.track,
              }}
            >
              {atHigh ? "고점권" : "고점권 아님"}
            </span>
            <span style={{ fontFamily: MONO, fontSize: 10.5, color: "var(--c-muted)" }}>
              52주 고점 대비 {gap.toFixed(1)}%
            </span>
          </div>
        )}
      </div>
      {/* 0선을 칸마다 하나씩 긋던 걸 차트 전체에 한 줄로 바꿨다. 예전엔 5개 조각으로
          끊겨 있어 기준선으로 안 보이고, 막대가 허공에 뜬 사각형처럼 읽혔다.
          막대 높이 한도도 24 → 30 으로 올려 하루치 차이가 실제로 보이게 한다. */}
      <div style={{ flex: 1, position: "relative", display: "flex", alignItems: "center", gap: 8, minHeight: 60 }}>
        <div style={{ position: "absolute", left: 0, right: 0, top: "50%", height: 1, background: C.line }} />
        {daily.map((d, i) => {
          const px = Math.round((Math.abs(d) / maxAbs) * 30);
          const buy = d >= 0;
          const ymd = dates[i];
          const label = ymd
            ? `${ymdShort(ymd)} · ${d >= 0 ? "+" : ""}${formatEokMixed(d)} ${d >= 0 ? "순매수" : "순매도"}`
            : `${d >= 0 ? "+" : ""}${formatEokMixed(d)}`;
          return (
            <div
              key={i}
              className="hz-tip"
              data-tip={label}
              style={{ flex: 1, position: "relative", height: 68 }}
            >
              <div style={{ position: "absolute", left: "18%", right: "18%", height: px, background: buy ? C.cold : C.hot, borderRadius: 2, ...(buy ? { bottom: "50%" } : { top: "50%" }) }} />
              {/* 날짜를 막대마다 붙인다 — 다섯 개뿐이라 자리가 되고, 양 끝에만 적으면
                  가운데 막대가 언제인지 툴팁을 열어봐야 했다. */}
              {ymd && (
                <span
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    bottom: 0,
                    textAlign: "center",
                    fontSize: 9,
                    fontWeight: 600,
                    fontFamily: MONO,
                    color: "var(--c-faint)",
                  }}
                >
                  {ymdShort(ymd)}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <Foot text={v.desc} />
    </Shell>
  );
}

/**
 * 급등 종목 비율 — 코스피에서 장중 10% 넘게 오른 종목의 비율(%).
 *
 * 카드는 **랭킹**이다. 큰 숫자를 퍼센트가 아니라 종목 수로 둔 이유는, 이 지표에서
 * 사람이 실제로 궁금해하는 게 "6%"가 아니라 "뭐가 뛰었나"라서다. 퍼센트는 옆에
 * 작게 붙여 두 값을 다 준다.
 *
 * 줄은 등락률 순이다. 파이프라인이 버킷별로 거래대금 상위 10종목만 details 에
 * 넣으므로, 여기 서는 건 "크게 오른 것들 중 거래가 두꺼운 종목"이다. 잡주 하나가
 * 30% 올랐다고 목록을 차지하지 않는다.
 *
 * 색 막대는 강도(상한가 / +20~29% / +10~20%)다. 맨 아래 '외 N개'에 마우스를 올리면
 * 강도별 개수가 뜬다.
 */
function CardLimitUp({ v }: { v: Pick }) {
  const c = overheatColor(v.capped);
  const dt = v.details as unknown as {
    limit_n?: number; up20_n?: number; up10_n?: number; listed_n?: number;
    limit_names?: unknown[]; up20_names?: unknown[]; up10_names?: unknown[];
  } | null;

  // 옛 행은 종목명 문자열 배열이고 새 행은 {n, p} 객체 배열이다. 둘 다 받는다 —
  // 등락률이 없던 시절 행에서도 카드가 이름만으로 서야 한다.
  const norm = (arr: unknown[] | undefined) =>
    (arr ?? []).map((x) =>
      typeof x === "string" ? { n: x, p: null as number | null } : (x as { n: string; p: number }),
    );

  const buckets = [
    { label: "상한가", n: dt?.limit_n ?? 0, items: norm(dt?.limit_names), tone: C.mania },
    { label: "+20~29%", n: dt?.up20_n ?? 0, items: norm(dt?.up20_names), tone: C.hot },
    { label: "+10~20%", n: dt?.up10_n ?? 0, items: norm(dt?.up10_names), tone: C.neutral },
  ];
  const surged = buckets.reduce((a, b) => a + b.n, 0);
  const listed = dt?.listed_n ?? 0;

  // 등락률 순으로 세운다. 등락률이 없는 옛 행은 강도 순(버킷 순서)이 그대로 남는다.
  const ROWS = 5;
  const rank = buckets
    .flatMap((b) => b.items.map((it) => ({ ...it, tone: b.tone, label: b.label })))
    .sort((a, b) => (b.p ?? 0) - (a.p ?? 0))
    .slice(0, ROWS);
  const rest = Math.max(0, surged - rank.length);

  return (
    <Shell hit={v.isHit} minH={210}>
      {/* KRX 일별매매정보는 하루이틀 늦게 열린다. 히어로가 페이지 전체를 "오늘 기준"으로
          액자에 넣으므로 이 카드만은 자기 자료일을 계속 밝힌다(예탁금 카드에서 물려받은 처리). */}
      <TitleRow desc={v.headline} icon="bolt" name={v.name} badge={sourceDateBadge(v) ?? "최근 거래일 기준"} />

      <div style={{ display: "flex", alignItems: "baseline", gap: 5, margin: "6px 0 12px" }}>
        <span style={{ fontFamily: MONO, fontSize: 30, fontWeight: 700, color: c, letterSpacing: "-0.03em" }}>{surged}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.sub }}>종목</span>
        {/* 퍼센트만 있으면 "무엇의 6.15%"인지 모른다. 분모를 붙여 둔다. */}
        <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 11.5, fontWeight: 700, color: c, whiteSpace: "nowrap" }}>
          {listed ? `${listed.toLocaleString("ko-KR")}종목 중 ` : ""}
          {(v.raw ?? 0).toFixed(2)}%
        </span>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, justifyContent: "center" }}>
        {rank.length === 0 ? (
          <span style={{ fontSize: 12, color: "var(--c-muted)" }}>10% 넘게 오른 종목이 없습니다</span>
        ) : (
          rank.map((r, i) => (
            <div key={`${r.n}-${i}`} style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
              <span style={{ width: 3, height: 14, borderRadius: 2, background: r.tone, flexShrink: 0 }} />
              <span style={{ fontSize: 12.5, fontWeight: 600, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.n}
              </span>
              <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 11.5, fontWeight: 700, color: r.tone, whiteSpace: "nowrap", flexShrink: 0 }}>
                {r.p === null ? r.label : `+${r.p.toFixed(1)}%`}
              </span>
            </div>
          ))
        )}
        {rest > 0 && (
          <span
            // 강도별 개수는 여기 한 곳에 모은다. 줄마다 붙이면 랭킹이 라벨로 시끄러워진다.
            // 커서는 건드리지 않는다(globals.css 의 .hz-tip 주석).
            // hz-tip-lines: data-tip 의 줄바꿈을 살린다. 한 줄로 이으면 세 단계가
            // 눈에 안 들어온다.
            className="hz-tip hz-tip-wide hz-tip-lines hz-tip-start"
            data-tip={
              buckets.map((b) => `${b.label}  ${b.n}종목`).join("\n") +
              (listed ? `\n전체  ${listed.toLocaleString("ko-KR")}종목` : "")
            }
            style={{ fontSize: 11, fontWeight: 600, color: "var(--c-muted)", marginTop: 1 }}
          >
            외 {rest}개
          </span>
        )}
      </div>
      <Foot text={v.desc} />
    </Shell>
  );
}

// 옵션 풋/콜 비율 — 콜(탐욕) vs 풋(공포) 거래량 비중. (KRX 옵션 API 승인 전까지 임시 데이터)
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
  const ratio = call > 0 ? put / call : 0; // 풋/콜
  const greedy = callShare >= 50;
  const c = greedy ? C.hot : C.cold;
  return (
    <Shell hit={v.isHit} minH={210}>
      <TitleRow desc={v.headline} icon="casino" name={v.name} />
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "6px 0 14px" }}>
        <span style={{ fontFamily: MONO, fontSize: 26, fontWeight: 700, color: c, letterSpacing: "-0.03em" }}>{ratio.toFixed(2)}</span>
        <span style={{ fontSize: 11, fontWeight: 600, color: C.sub }}>풋/콜</span>
        <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: c }}>{greedy ? "콜 우세" : "풋 우세"}</span>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 8 }}>
        <div style={{ display: "flex", height: 24, borderRadius: 8, overflow: "hidden" }}>
          <div className="hz-tip" data-tip={tip("call")} style={{ width: `${callShare}%`, background: C.hot, display: "flex", alignItems: "center", paddingLeft: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: "#fff" }}>콜 {Math.round(callShare)}%</span>
          </div>
          <div className="hz-tip" data-tip={tip("put")} style={{ width: `${100 - callShare}%`, background: C.cold, display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: "#fff" }}>풋 {Math.round(100 - callShare)}%</span>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, fontWeight: 700 }}>
          <span style={{ color: C.hot }}>콜 = 상승 베팅</span>
          <span style={{ color: C.cold }}>풋 = 하락 대비</span>
        </div>
      </div>
      <Foot text={v.desc} />
    </Shell>
  );
}

// 증권 앱 인기차트 순위 — 차트인 앱 수 + 최고 순위 + 앱 목록 (details 활용)
function CardBrokerage({ v }: { v: Pick }) {
  const c = overheatColor(v.capped);
  const count = v.details?.count ?? 0;
  const topRank = v.details?.top_rank ?? null;
  const charted =
    (v.details as unknown as { charted?: { name: string; rank: number }[] })?.charted ?? [];
  // 긴 앱 이름을 짧게: 첫 구분자(-, (, ,) 앞부분만, 18자 제한
  const shortName = (n: string) => (n.split(/[-(,]/)[0].trim().slice(0, 18) || n);
  return (
    <Shell hit={v.isHit} minH={210}>
      <TitleRow desc={v.headline} icon="leaderboard" name={v.name} />
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "6px 0 10px" }}>
        <span style={{ fontFamily: MONO, fontSize: 30, fontWeight: 700, color: c, letterSpacing: "-0.03em" }}>{count}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: C.sub }}>개 앱 인기차트 진입</span>
        {topRank !== null && (
          <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: c }}>최고 {topRank}위</span>
        )}
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
        {charted.slice(0, 4).map((app, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, fontWeight: 600, gap: 8 }}>
            <span style={{ color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{shortName(app.name)}</span>
            <span style={{ fontFamily: MONO, fontWeight: 700, color: C.sub, flexShrink: 0 }}>{app.rank}위</span>
          </div>
        ))}
      </div>
      <Foot text={v.desc} />
    </Shell>
  );
}

function SectionHeading({ title }: { title: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28 }}>
      <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: C.ink }}>{title}</h2>
      <div style={{ height: 1, flex: 1, background: C.line }} />
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
    <Shell hit={v.isHit} minH={210}>
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

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: 56 }}>
            {dailyScore ? (
              <Hero dailyScore={dailyScore} tradHits={countHits("시장")} socialHits={countHits("감성")} />
            ) : (
              <section style={{ background: C.card, borderRadius: 16, padding: 44, textAlign: "center", color: C.sub }}>
                아직 계산된 스코어가 없습니다.
              </section>
            )}

            {/* 시장 지표 (category=시장) */}
            <section>
              <SectionHeading title="시장 지표" />
              <div className="hz-grid">
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
                <CardPutCall v={p("put_call_ratio")} />
                <CardTurnover v={p("turnover_concentration")} />
                <CardMarketActions v={p("market_actions_30d")} />
                <CardVkospi v={p("vkospi")} />
                <CardGoldRatio v={p("kospi_gold_ratio")} />
                <CardBuffett v={p("buffett_index")} />
                <CardLeverage v={p("leverage_etf_volume")} />
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
            <section>
              <SectionHeading title="감성 지표" />
              <div className="hz-grid">
                {/* 시장 지표와 같은 원칙으로 순서만 바꿨다 — 칸 수는 기존과 동일(12칸).
                    검색량(가중치 3.0)과 코인 투기를 앞세우고, 명품·오마카세는 재미는 크지만
                    가중치 0.5+0.5에 후행 지표라 뒤로, 베스트셀러는 30일간 값이 2종류뿐일
                    만큼 안 움직여 맨 뒤로 뺐다.
                    행 구성: [검색량·코인·디씨·뉴스] [증권앱·유튜브·실물괴리2]
                             [명품2·봇레포·베스트셀러] — 3행이 정확히 채워진다. */}
                <CardTrend v={p("naver_search_trend")} icon="search" />
                <CardUpbit v={p("upbit_speculation_index")} />
                <CardSentiment v={p("dcinside_post_count")} icon="forum" countNoun="게시글" />
                <CardSentiment v={p("news_sentiment")} icon="newspaper" countNoun="뉴스" />
                <CardBrokerage v={p("brokerage_app_rank")} />
                <CardYoutube v={p("youtube_finance_search_views")} />
                <CardDivergence v={p("small_business_crisis_index")} />
                <CardSpending luxury={p("luxury_consumption_index")} dining={p("fine_dining_search_index")} />
                <CardTrend v={p("github_trading_bot_repos")} icon="terminal" />
                <CardTrend v={p("bestseller_finance_ratio")} icon="menu_book" />
                {extra("감성").map((i) => (
                  <GenericCard key={i.id} v={pick(i)} icon={FALLBACK_ICONS["감성"]} />
                ))}
                <a href="https://forms.gle/P4wzp2DkP2wyTPWP9" target="_blank" rel="noopener noreferrer" data-ga="cta_click" data-ga-cta="report_indicator" data-ga-surface="sentiment_grid" style={{ border: `2px dashed ${C.line}`, borderRadius: 14, padding: 24, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, minHeight: 210, color: C.sub, textAlign: "center" }}>
                  <Icon name="add_circle" style={{ fontSize: 34 }} />
                  <span style={{ fontSize: 14, fontWeight: 600 }}>새로운 지표 제보하기</span>
                  <span style={{ fontSize: 11, fontWeight: 500, color: "var(--c-muted)" }}>아이디어가 있다면 알려주세요</span>
                </a>
              </div>
            </section>
    </div>
  );
}
