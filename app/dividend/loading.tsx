import { C } from "../ui";

/**
 * `/dividend` 의 자리표시자. 없으면 서버가 표 셋(국내 2,777 · 미국 579 · ETF 243행)을 다 읽을 때까지
 * 첫 바이트를 안 보내 1초 넘게 눌렀는데 아무 일도 안 난 것처럼 보인다(개발 서버 실측 1.8초 · insider/loading.tsx 머리말).
 * 골격은 실물과 같다 — 01 구간 제목, 시트(머리 + 큰 숫자 + 타일 셋 + 검색 + 판 셋), 02 구간 제목, 투자금 카드, 바스켓 세 장.
 */

function Block({ h, w = "100%", r = 8 }: { h: number; w?: number | string; r?: number }) {
  return <div className="hz-shimmer" style={{ height: h, width: w, maxWidth: "100%", borderRadius: r, background: C.bg }} />;
}

function SheetHead() {
  return (
    <div className="hz-sheet-head">
      <Block h={18} w={18} r={5} />
      <div className="hz-sheet-head-txt">
        <Block h={14} w={64} r={5} />
        <Block h={12} w={196} r={5} />
      </div>
    </div>
  );
}

function Cap() {
  return (
    <div className="hz-tx-intro">
      <div style={{ display: "flex", alignItems: "center", gap: 8, height: 26 }}>
        <Block h={12} w={16} r={4} />
        <Block h={20} w={140} r={6} />
      </div>
    </div>
  );
}

export default function Loading() {
  return (
    <div className="hz-tx" style={{ position: "relative" }} aria-hidden>
      <Cap />
      <section className="hz-sheet">
        <SheetHead />
        <div style={{ padding: "22px 26px 4px" }}>
          <Block h={13} w={96} r={5} />
          <div style={{ marginTop: 6 }}>
            <Block h={34} w={220} r={8} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginTop: 12, maxWidth: 640 }}>
            {[0, 1, 2].map((i) => (
              <Block key={i} h={58} r={12} />
            ))}
          </div>
        </div>
        <div style={{ padding: "12px 26px 26px", display: "flex", flexDirection: "column", gap: 14 }}>
          <Block h={44} r={12} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
            {[0, 1, 2].map((i) => (
              <Block key={i} h={200} r={12} />
            ))}
          </div>
        </div>
      </section>

      <Cap />
      <section className="hz-sheet">
        <div style={{ padding: "18px 26px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
          <Block h={26} w={220} r={6} />
          <Block h={8} r={999} />
        </div>
      </section>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 16 }}>
        {[0, 1, 2].map((i) => (
          <section key={i} className="hz-sheet">
            <SheetHead />
            <div style={{ padding: "16px 26px 20px" }}>
              <Block h={420} r={12} />
            </div>
          </section>
        ))}
      </div>

      <div className="hz-loading-float">
        <span className="hz-loading-badge">
          <span className="hz-spinner" />
          배당 기록을 모으는 중
        </span>
      </div>
      <span role="status" aria-live="polite" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }}>
        배당으로 살기를 불러오는 중입니다
      </span>
    </div>
  );
}
