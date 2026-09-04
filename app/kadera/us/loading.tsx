import { C } from "../../ui";

/**
 * `/kadera/us` 의 자리표시자.
 *
 * **부모의 loading.tsx 를 그대로 물려받으면 안 되는 이유**가 있어 따로 둔다.
 * Next 는 가장 가까운 경계를 쓰므로, 이 파일이 없으면 미장을 눌러도 국장의 골격
 * (히어로 세 칸 + 시트 여덟 장)이 뜬다. 미장은 히어로가 없고 시트가 다섯 장이라,
 * 결과가 오는 순간 판이 통째로 다른 모양이었다가 제자리를 찾는 것처럼 보인다.
 *
 * 자세한 배경(왜 loading.tsx 가 필요한지, 프리페치 경계 이야기)은 ../loading.tsx 주석에.
 */

/** 결과와 같은 골격으로 은은하게 깜빡이는 블록. globals.css 의 hz-shimmer 를 쓴다. */
function Block({ h, w = "100%", r = 8 }: { h: number; w?: number | string; r?: number }) {
  return <div className="hz-shimmer" style={{ height: h, width: w, borderRadius: r, background: C.bg }} />;
}

function SheetHead() {
  return (
    <div className="hz-sheet-head">
      <Block h={18} w={18} r={5} />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 5 }}>
        <Block h={13} w={116} r={5} />
        <Block h={11} w={196} r={5} />
      </div>
    </div>
  );
}

function Sheet({ h, style }: { h: number; style?: React.CSSProperties }) {
  return (
    <section className="hz-sheet" style={style}>
      <SheetHead />
      <div style={{ padding: "20px 22px" }}>
        <Block h={h} />
      </div>
    </section>
  );
}

function Caps() {
  return (
    <div style={{ marginTop: 10 }}>
      <Block h={12} w={92} r={5} />
    </div>
  );
}

export default function Loading() {
  // page.tsx 의 SHEET_PAIR_MIN 과 같은 값이어야 한다. 다르면 접히는 폭이 어긋나
  // 전환 순간 두 장이던 것이 한 장으로 바뀐다.
  const half: React.CSSProperties = { flex: "1 1 calc(50% - 8px)", minWidth: "min(460px, 100%)" };
  return (
    <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 16 }} aria-hidden>
      {/* 머리 — 숫자 세 칸(모니터링 현황). */}
      <section className="hz-sheet">
        <SheetHead />
        <div className="hz-panelgrid hz-panelgrid-3">
          <div className="hz-panel-pad">
            <Block h={56} />
          </div>
          <div className="hz-panel-pad">
            <Block h={56} />
          </div>
          <div className="hz-panel-pad">
            <Block h={56} />
          </div>
        </div>
      </section>

      <Caps />
      <Sheet h={430} />

      <Caps />
      <Sheet h={400} />

      <Caps />
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <Sheet h={330} style={half} />
        <Sheet h={330} style={half} />
      </div>

      <Caps />
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <Sheet h={470} style={half} />
        <Sheet h={470} style={half} />
      </div>

      <div className="hz-loading-float">
        <span className="hz-loading-badge">
          <span className="hz-spinner" />
          미장 종목 얘기를 모으는 중
        </span>
      </div>

      <span
        role="status"
        aria-live="polite"
        style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }}
      >
        미장 카더라를 불러오는 중입니다.
      </span>
    </div>
  );
}
