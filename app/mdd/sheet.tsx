"use client";

// 시트 틀·통계 칸·막대 줄·범례·골격·오류 카드. MddExplorer.tsx 에서 그대로 옮겨 왔다(shared.ts 머리말 참고).

import { Skeleton as SkeletonBlock } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { C, Icon } from "../ui";
import { SectionHead } from "../kadera/SectionHead";
import { PAD, periodInfo } from "./shared";
import type { MddResult } from "./shared";
import type { IconName } from "@/lib/icon-names";

/**
 * "최근 10년" / "상장 이후·약 6년" — 화면 곳곳이 같은 말을 써야 해서 한곳에서 만든다.
 * 요청한 기간보다 상장 이력이 짧으면 "최근 10년"은 거짓이 되므로 실제 구간으로 바꾼다.
 */
export function periodLabelOf(data: MddResult): string {
  return periodInfo(data.years, data.analysis.firstDate, data.analysis.asOf).label;
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

/** 지금 낙폭 칸 바닥의 3분할 통계 한 칸 — 라벨 / 값. 보조 줄은 걷었다(2026-10-03, 옆 칸 · 띠와 같은 말이었다). */
export function StatCell({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
      {/* 한 줄 고정·말줄임은 클래스(.mdd-stat-clip)가 쥔다 — 폰에선 접어야 해서(sheets.css). */}
      <span className="mdd-stat-clip mdd-stat-label" style={{ fontSize: "var(--fs-11)", fontWeight: 700, letterSpacing: ".06em", color: C.sub }}>
        {label}
      </span>
      <strong className="mdd-stat-value" style={{ fontSize: "var(--fs-15)", fontWeight: 800, color: tone ?? C.ink, letterSpacing: "-.02em" }}>{value}</strong>
    </div>
  );
}

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
  // 실제 결과와 같은 골격(모듈 셋 + 전폭 차트 + 2:1 짝)으로 깜빡여, 로딩 뒤
  // 레이아웃이 튀지 않는다.
  const block = (h: number) => <SkeletonBlock style={{ height: h }} />;
  const body = (children: React.ReactNode) => (
    <div style={{ padding: PAD, display: "flex", flexDirection: "column", gap: 12 }}>{children}</div>
  );
  return (
    // position:relative 는 아래 hz-loading-float 의 기준 상자가 되기 위한 것이다.
    <div style={{ position: "relative" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }} aria-hidden>
        {/* 첫 줄 띠(키 41) — 결과의 MddCover 자리. */}
        <div className="v2-cover" style={{ height: 41 }} />
        {/* v2: 둘째 줄은 모듈 셋(Hero.tsx HeroStrip 과 같은 .v2-md-band). */}
        <div className="v2-md-band">
          {[0, 1, 2].map((i) => (
            <section key={i} className="hz-sheet">
              {body(
                <>
                  {block(14)}
                  {block(38)}
                  {block(48)}
                </>,
              )}
            </section>
          ))}
        </div>
        <section className="hz-sheet">{body(block(201))}</section>
        <div className="v2-md-row is-21">
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
