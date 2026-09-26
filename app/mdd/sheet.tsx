"use client";

// 시트 틀·통계 칸·막대 줄·범례·골격·오류 카드. MddExplorer.tsx 에서 그대로 옮겨 왔다(shared.ts 머리말 참고).

import { Skeleton as SkeletonBlock } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { C, Icon, MONO } from "../ui";
import { SectionHead } from "../kadera/SectionHead";
import { UNRECOVERED, PAD } from "./shared";
import type { MddResult } from "./shared";
import type { IconName } from "@/lib/icon-names";

/**
 * "최근 10년" / "상장 이후·약 6년" — 화면 곳곳이 같은 말을 써야 해서 한곳에서 만든다.
 * 요청한 기간보다 상장 이력이 짧으면 "최근 10년"은 거짓이 되므로 실제 구간으로 바꾼다.
 */
export function periodLabelOf(data: MddResult): string {
  const a = data.analysis;
  const approxYears = (Date.parse(a.asOf) - Date.parse(a.firstDate)) / (365 * 86_400_000);
  const requested = data.years === "all" ? Infinity : Number(data.years);
  const truncated = data.years !== "all" && approxYears < requested - 0.5;
  return data.years === "all" || truncated ? `상장 이후·약 ${Math.max(1, Math.round(approxYears))}년` : `최근 ${data.years}년`;
}

/* ── 공통 프리미티브 ───────────────────────────────────────────────
   카드마다 제각각이던 머리·타일·막대를 셋으로 통일한다. 페이지 전체가 같은
   리듬(파란 아이콘 → 제목 → 한 줄 설명 → 데이터)으로 읽히게 하는 게 목적이다. */

/**
 * 시트 — 흰 판 + 헤어라인 + radius 14, **그림자 없음**. 시장 브리핑·카더라와 같은 판이다.
 * 세로 flex 라 각주 띠(Foot)가 늘 바닥에 붙고, 나란히 놓인 두 시트의 밑단이 맞는다.
 */
export function Sheet({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <section className="hz-sheet" style={{ display: "flex", flexDirection: "column", ...style }}>
      {children}
    </section>
  );
}

/**
 * 시트 바닥 각주 띠. 높이는 클래스가 39 로 못박는다 — 나란한 시트끼리 바닥 두께가
 * 다르면 같은 줄이 층진 것처럼 보인다(globals.css 의 .hz-sheet-foot 주석 참고).
 */
export function Foot({ children }: { children: React.ReactNode }) {
  return (
    <div className="hz-sheet-foot" style={{ marginTop: "auto" }}>
      {/* ⚠️ 안쪽에 세로 padding 을 주지 말 것. 띠가 이미 위아래 11px 을 들고 있어서, 겹치면
          한 줄 각주가 41 → 60px 이 된다(이 페이지의 바닥 띠만 다른 화면보다 18px 두꺼웠다).
          여기에 9px 이 있었던 건 띠가 `padding: 0 22px` 이던 시절의 잔재다 — 그때는 띠 자신에게
          세로 여백이 없어 안쪽이 그 일을 대신했다. */}
      <span style={{ fontSize: "var(--fs-12)", lineHeight: 1.6, color: C.sub, wordBreak: "keep-all" }}>{children}</span>
    </div>
  );
}

/**
 * 데이터가 없어 본문을 못 채우는 시트의 공통 껍데기.
 *
 * 시트를 통째로 숨기지 않는다. 종목을 바꿀 때마다 격자에서 빠지면 (1) 2열 짝이 어긋나
 * 옆 시트 가운데가 텅 비고, (2) 문턱이 절벽이라 시트가 깜빡인다 — 성격 시트는 −8% 문턱이라
 * KB금융(−7.9%)이 0.1%p 차이로 사라져, 하루 사이 생겼다 없어지면 "어제 있던 게 왜 없지"가
 * 된다. 자리를 지키고 왜 못 보여주는지를 적는다.
 */
export function AbsentSheet({ icon, title, sub, body }: { icon: IconName; title: string; sub: string; body: string }) {
  return (
    <Sheet>
      <SectionHead level={3} icon={icon} title={title} desc={sub} />
      <div style={{ padding: PAD }}>
        <p style={{ margin: 0, color: C.muted, fontSize: "var(--fs-12)", lineHeight: 1.7, wordBreak: "keep-all" }}>
          <Icon name="info" style={{ fontSize: "var(--fs-14)", verticalAlign: -2, marginRight: 4 }} />
          {body}
        </p>
      </div>
    </Sheet>
  );
}

/** 히어로 셀·성격 시트 바닥의 3분할 통계 한 칸 — 라벨 / 값 / 보조. */
export function StatCell({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
      {/* 한 줄 고정·말줄임은 클래스(.mdd-stat-clip)가 쥔다 — 폰에선 접어야 해서(sheets.css). */}
      <span className="mdd-stat-clip" style={{ fontSize: "var(--fs-11)", fontWeight: 700, letterSpacing: ".06em", color: C.sub }}>
        {label}
      </span>
      <strong style={{ fontSize: "var(--fs-15)", fontWeight: 800, color: tone ?? C.ink, letterSpacing: "-.02em" }}>{value}</strong>
      {sub && <span className="mdd-stat-clip" style={{ fontSize: "var(--fs-11)", color: C.muted }}>{sub}</span>}
    </div>
  );
}

/**
 * 이름 | 트랙 막대 | 값 한 줄. 원인 분해·테마 비교·낙폭 구간 분포가 공유한다.
 *
 * ⚠️ 라벨·값 칸은 고정폭이고 막대만 flex:1 이다. 라벨에 minWidth:0 이 없으면 긴 종목명이
 * 말줄임 대신 칸을 밀어 막대를 좁힌다 — 1440 에서는 안 보이고 좁은 폭에서만 드러난다.
 */
export function MeterRow({
  label,
  pct,
  value,
  color,
  strong,
  help,
  ink,
  labelWidth = 104,
  valueWidth = 48,
}: {
  label: string;
  pct: number;
  value: string;
  color: string;
  /** 강조 줄의 **글자**색. 없으면 막대색을 쓴다(둘이 같아도 되는 자리를 위해). */
  ink?: string;
  strong?: boolean;
  help?: string;
  labelWidth?: number;
  valueWidth?: number;
}) {
  return (
    <div className="hz-bar-row" style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ width: labelWidth, flex: "none", display: "flex", alignItems: "center", gap: 3, minWidth: 0 }}>
        <span
          style={{
            fontSize: "var(--fs-11-5)",
            fontWeight: strong ? 800 : 600,
            color: strong ? C.ink : C.sub,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            minWidth: 0,
          }}
        >
          {label}
        </span>
        {/* ⚠️ 아래 물음표 색이 hint 였다 — 점선·비활성 아이콘용 토큰이라 라이트 1.49 ·
            다크 2.3 이다. 툴팁이 있다는 유일한 표시라 SectionHead 와 같은 muted 로 맞춘다. */}
        {help && (
          <span className="hz-tip hz-tip-wide" data-tip={help} style={{ flexShrink: 0, display: "inline-flex", cursor: "help", color: C.muted }}>
            <Icon name="help" style={{ fontSize: "var(--fs-13)" }} />
          </span>
        )}
      </span>
      {/* shadcn 가로 막대 차트 꼴(Bar Chart · Horizontal / Custom Label, 2026-09-26) — 회색 트랙 없이 두툼한 둥근 막대,
          값은 막대 끝에 붙는다. 막대는 '칸 − 값 자리(valueWidth + 간격 8)' 안에서만 자란다 — 비율(82%)로 잡았더니
          폰 폭(칸 221px)에서 가장 긴 막대의 값이 줄 끝을 9px 넘었다. */}
      {/* 툴팁은 값이 먼저, 이름이 뒤(차트 지침). 값은 막대 끝에도 적혀 있어 툴팁은 거들기만 한다. */}
      <span className="hz-bar-track hz-tip" data-tip={`${value} · ${label}`} style={{ ["--hz-bar-val" as string]: `${valueWidth}px` }}>
        <span className="hz-bar" style={{ width: `calc((100% - var(--hz-bar-val) - 8px) * ${Math.max(2, Math.min(100, pct)) / 100})`, background: color }} />
        <span
          className="hz-bar-value"
          style={{
            fontWeight: strong ? 800 : 700,
            /* 막대색을 글자에 그대로 쓰면 안 된다. 램프의 --c-blue-1(#1b7fd4)은 흰 위
               명암비 4.17 이라 11.5px 값이 안 읽힌다 — 채우는 색과 읽는 색은 다른 물건이다
               (시장 브리핑의 --card-accent-ink 와 같은 규칙). */
            color: strong ? (ink ?? color) : C.sub,
          }}
        >
          {value}
        </span>
      </span>
    </div>
  );
}

/* ── 거울 막대 ─────────────────────────────────────────────────────
   리스크 프로필 앞 두 패널이 공유하는 한 줄. 0선을 가운데 두고 왼쪽(파랑=하락)과
   오른쪽(빨강=회복·수익)으로 갈라 "어느 쪽이 긴가"만 보면 읽히게 한다.

   막대 폭은 **반폭 기준**이다 — |값| / 최댓값 × 50%. 한쪽이 최댓값이면 그 반쪽을 꽉 채운다.

   ⚠️ 기간처럼 자릿수 차가 큰 값(33일 ~ 1,387일)은 선형 눈금이면 짧은 막대가 1%로
   사라진다. 제곱근 눈금과 min-width 5px 을 함께 쓴다. */
/* 라벨 칸 폭. 가장 긴 라벨이 `2026.12`(10px/700 실측 42.1px)라 44 로 잡는다.
   예전 34 는 네 자리 연도에 월을 붙이면 넘쳐서, 월이 붙는 줄만 `26.2` 로 줄여 쓰게 했다 —
   한 화면에서 연도 표기가 두 벌이 되는 값이라 칸을 넓히는 쪽으로 되돌렸다(2026-08-04).
   늘어난 10px 은 가운데 막대 칸(flex:1)에서 나온다. 3열이 가장 좁아지는 1000px 에서도
   막대 칸이 181 → 171 이라 반쪽 막대가 85px 씩 남는다. */

/* 폰(≤560)에선 글자가 11 → 12 라 칸도 넓힌다 — 값은 sheets.css 의 --mdd-mirror-* (2026-09-23). 인라인 숫자로 두면
   미디어쿼리가 못 바꿔서 CSS 변수로 받는다. 넓은 화면은 뒤의 기본값 그대로다. */
const MIRROR_LABEL_W = "var(--mdd-mirror-label, 44px)";

const MIRROR_LEFT_W = "var(--mdd-mirror-left, 40px)";

const MIRROR_RIGHT_W = "var(--mdd-mirror-right, 44px)";

/* 줄 글자는 다른 화면의 막대 라벨·값과 같은 11 이다(2026-09-23 — 12 로 키웠다가 다른 화면에 맞춰 되돌렸다). */
const ROW_TEXT: React.CSSProperties = { flex: "none", fontFamily: MONO, fontSize: "var(--fs-11)", whiteSpace: "nowrap" };

export function MirrorRow({
  label,
  left,
  right,
  tip,
}: {
  label: string;
  /** 막대 칸에 올리면 뜨는 글(값이 먼저). 두 값을 한 툴팁에 — 한쪽 막대를 짚지 않아도 둘 다 읽힌다. */
  tip?: string;
  left: { pct: number; value: string; color: string; ink: string };
  right: { pct: number; value: string; color: string; ink: string; dashed?: boolean };
}) {
  // 막대는 shadcn 막대 차트 꼴로 두툼하게(8 → 12) · 바깥 끝만 둥글게(2026-09-26).
  const bar: React.CSSProperties = { position: "absolute", top: 1, height: 12, minWidth: 5 };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ ...ROW_TEXT, width: MIRROR_LABEL_W, fontWeight: 700, color: C.sub2 }}>{label}</span>
      <span style={{ ...ROW_TEXT, width: MIRROR_LEFT_W, textAlign: "right", fontWeight: 800, color: left.ink }}>{left.value}</span>
      <div className={tip ? "hz-tip hz-bar-hit" : undefined} data-tip={tip} style={{ position: "relative", flex: 1, minWidth: 0, height: 14 }}>
        <span style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1.5, background: C.line }} />
        <span style={{ ...bar, right: "50%", width: `${left.pct}%`, borderRadius: "4px 0 0 4px", background: left.color }} />
        <span style={{ ...bar, left: "50%", width: `${right.pct}%`, borderRadius: "0 4px 4px 0", background: right.dashed ? UNRECOVERED : right.color }} />
      </div>
      <span style={{ ...ROW_TEXT, width: MIRROR_RIGHT_W, fontWeight: 800, color: right.ink }}>{right.value}</span>
    </div>
  );
}

/** 축 이름 앞의 색 점. 범례를 따로 두지 않고 축 이름이 그 일을 겸한다(2026-09-23 — 범례와 축 이름이
 *  "그 해 최악 낙폭·그 해 수익" / "낙폭·수익"처럼 같은 말을 두 번 했다). */
function Dot({ color }: { color: string }) {
  return <span aria-hidden style={{ width: 7, height: 7, borderRadius: 2, background: color, flex: "none" }} />;
}

const AXIS_TEXT: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 5, fontSize: "var(--fs-11)", fontWeight: 700, letterSpacing: ".06em", color: C.sub, whiteSpace: "nowrap" };

/** 거울 막대 위의 축 이름. **값 열에 맞춘다** — 막대 위가 아니라 숫자 위에 서야 읽힌다. */
export function MirrorAxis({ left, right }: { left: { label: string; color: string }; right: { label: string; color: string } }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ width: MIRROR_LABEL_W, flex: "none" }} />
      <span style={{ ...AXIS_TEXT, flex: "none", minWidth: MIRROR_LEFT_W, justifyContent: "flex-end" }}>
        <Dot color={left.color} />
        {left.label}
      </span>
      <div style={{ flex: 1, minWidth: 0 }} />
      <span style={{ ...AXIS_TEXT, flex: "none", minWidth: MIRROR_RIGHT_W }}>
        <Dot color={right.color} />
        {right.label}
      </span>
    </div>
  );
}

/* ── 나란한 두 막대 ────────────────────────────────────────────────
   리스크 프로필 셋째 패널('혼자 빠지나, 같이 빠지나')의 한 줄 — 이 종목의 낙폭과 지수의 낙폭을
   **같은 방향**으로 나란히 세운다(2026-09-23). 예전엔 거울 막대라 지수 낙폭이 오른쪽, 곧 앞 두
   패널에서 '수익·회복'이 서던 자리에 놓였고, 같은 화면의 '시장 탓일까, 종목 탓일까' 시트는 같은
   질문을 같은 방향 막대로 그리고 있었다. 길이를 견주는 그림은 기준선이 하나여야 한다. */
export function TwinRow({
  label,
  a,
  b,
  tip,
}: {
  label: string;
  /** 막대 칸에 올리면 뜨는 글(값이 먼저). */
  tip?: string;
  a: { pct: number; value: string; color: string; ink: string };
  b: { pct: number; value: string; color: string; ink: string };
}) {
  // shadcn 막대 차트(Multiple) 꼴로 두툼하게(6 → 8) · 데이터 끝만 둥글고 기준선 쪽은 각지게 · 두 막대 사이 2px(2026-09-26).
  const bar = (pct: number, color: string): React.CSSProperties => ({ display: "block", height: 8, width: `${pct}%`, minWidth: pct > 0 ? 4 : 0, borderRadius: "0 4px 4px 0", background: color, transition: "filter .12s ease" });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ ...ROW_TEXT, width: MIRROR_LABEL_W, fontWeight: 700, color: C.sub2 }}>{label}</span>
      <div className={tip ? "hz-tip hz-bar-hit" : undefined} data-tip={tip} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={bar(a.pct, a.color)} />
        <span style={bar(b.pct, b.color)} />
      </div>
      <span style={{ ...ROW_TEXT, width: MIRROR_LEFT_W, textAlign: "right", fontWeight: 800, color: a.ink }}>{a.value}</span>
      <span style={{ ...ROW_TEXT, width: MIRROR_LEFT_W, textAlign: "right", fontWeight: 800, color: b.ink }}>{b.value}</span>
    </div>
  );
}

/** 나란한 두 막대 위의 이름 — 색 점 둘. 값 열의 순서(이 종목 · 지수)와 막대의 위아래 순서가 같다. */
export function TwinAxis({ a, b }: { a: { label: string; color: string }; b: { label: string; color: string } }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ width: MIRROR_LABEL_W, flex: "none" }} />
      <div style={{ flex: 1, minWidth: 0, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <span style={AXIS_TEXT}>
          <Dot color={a.color} />
          {a.label}
        </span>
        <span style={AXIS_TEXT}>
          <Dot color={b.color} />
          {b.label}
        </span>
      </div>
    </div>
  );
}

/* ── 이 하락의 맥락 ────────────────────────────────────────────────
   히어로 셋째 셀의 해설 문단. **LLM 을 쓰지 않는다** — 전부 이 페이지가 이미 가진 수치를
   문장으로 옮긴 것이라, 반짝 아이콘도 AI 고지도 붙이지 않는다.

   ⚠️ 문단마다 재료가 없을 수 있다(테마 미등록·회복 전례 없음·상장 직후). 없으면 그 문단만
   빠지고 나머지는 남는다 — 셋을 한 덩이로 묶으면 하나가 비어도 셋이 다 사라진다. */

/* ── 보조 ─────────────────────────────────────────────────────── */
/**
 * 이 페이지의 **두 번째** 로딩이다. 첫 번째는 app/mdd/loading.tsx(라우트가 열릴 때까지),
 * 여기는 그 뒤 /api/mdd 로 낙폭을 받아올 때까지 — 그리고 종목·기간을 바꿀 때마다 다시 뜬다.
 *
 * 배지를 여기도 두는 이유: 둘은 회색 골격이 거의 똑같이 생겼는데 배지만 도중에 사라지면
 * **아직 오는 중인데 다 온 것처럼 보이는 구간**이 생긴다. 배지를 넣은 목적이 "멈춘 건지
 * 오는 중인지"를 가르는 것이었으니, 기다림이 더 긴 이쪽에 없으면 앞뒤가 안 맞는다.
 *
 * 문구는 **무엇이 바뀌어서 다시 뜨느냐로 갈린다**(2026-08-02 결정).
 *  - 첫 진입 · 종목 변경 — "10년치 들춰보는 중". 종목이 바뀌면 그 종목의 시세를 처음부터
 *    들춰 오는 것이라 1단계와 같은 일이다. 특히 첫 진입은 1단계 배지 바로 뒤에 이어
 *    붙으므로 **글자 그대로 같아야 한다** — 다르면 1.5초 안에 글자가 갈아끼워져 진행이
 *    아니라 깜빡임으로 읽힌다.
 *  - 기간 변경 — "고점부터 되짚는 중". 종목은 그대로고 창만 달라져 고점을 다시 잡는
 *    일이라 말이 다르다. 1년·3년을 골라 놓고 "10년치"라고 하면 거짓말이 되기도 한다.
 *
 * 가르는 값은 `data` 유무가 아니라 **조작 자체**다(아래 onSelect/onYears). 종목과 기간을
 * 구분해야 하는데 결과 유무로는 둘이 같아 보인다.
 */
export function Skeleton({ periodOnly }: { periodOnly: boolean }) {
  // 실제 결과와 같은 골격(히어로 스트립 + 전폭 차트 + 50:50 짝)으로 깜빡여, 로딩 뒤
  // 레이아웃이 튀지 않는다.
  const block = (h: number) => <SkeletonBlock style={{ height: h }} />;
  const body = (children: React.ReactNode) => (
    <div style={{ padding: PAD, display: "flex", flexDirection: "column", gap: 12 }}>{children}</div>
  );
  return (
    // position:relative 는 아래 hz-loading-float 의 기준 상자가 되기 위한 것이다.
    <div style={{ position: "relative" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }} aria-hidden>
        <section className="hz-sheet" style={{ display: "flex", flexWrap: "wrap" }}>
          {[290, 300, 300].map((basis, i) => (
            <div key={i} style={{ flex: `1 1 ${basis}px`, minWidth: 0, padding: "20px 22px", display: "flex", flexDirection: "column", gap: 12 }}>
              {block(14)}
              {block(38)}
              {block(48)}
            </div>
          ))}
        </section>
        <section className="hz-sheet">{body(block(201))}</section>
        <div className="mdd-pair">
          {[0, 1].map((i) => (
            <section key={i} className="hz-sheet">
              {body(
                <>
                  {block(16)}
                  {block(112)}
                </>,
              )}
            </section>
          ))}
        </div>
      </div>

      <div className="hz-loading-float" aria-hidden>
        <span className="hz-loading-badge">
          <Spinner />
          {periodOnly ? "고점부터 되짚는 중" : "10년치 들춰보는 중"}
        </span>
      </div>

      {/* 화면에는 안 보이고 스크린리더에만 읽힌다(전용 유틸 클래스가 레포에 없어 인라인).
          종목·기간을 바꿀 때마다 다시 마운트되므로 바뀐 것도 그때그때 읽힌다. */}
      <span
        role="status"
        aria-live="polite"
        style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }}
      >
        낙폭을 계산하는 중입니다.
      </span>
    </div>
  );
}

export function ErrorCard({ message }: { message: string }) {
  return (
    <Sheet>
      <div style={{ padding: PAD, display: "flex", alignItems: "center", gap: 10, color: C.sub, fontSize: "var(--fs-13)" }}>
        <Icon name="error_outline" style={{ fontSize: "var(--fs-20)", color: C.mania }} />
        {message}
      </div>
    </Sheet>
  );
}
