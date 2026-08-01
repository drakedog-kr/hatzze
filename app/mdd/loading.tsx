import { C } from "../ui";

/**
 * 클릭 직후 즉시 그려지는 자리표시자. 카더라(app/kadera/loading.tsx)와 같은 이유로 둔다 —
 * 이 파일이 없으면 MDD 정밀분석을 눌러도 화면이 이전 페이지에 그대로 머문다.
 *
 * ⚠️ **이 페이지에는 로딩이 두 겹이다.** 헷갈리지 말 것.
 *  1) 여기(route 단계) — 서버가 코스피 종목 목록(944행)을 실어 내려줄 때까지. 실측 ~0.5초.
 *  2) MddExplorer 안의 `Skeleton` — 그 다음 클라이언트가 /api/mdd 로 낙폭을 받아올 때까지.
 * 두 번째는 이미 있던 것이고 종목·기간을 바꿀 때마다 다시 뜬다. 여기서는 첫 번째만 맡는다.
 * 그래서 골격을 그쪽 `Skeleton` 과 같은 모양(mdd-grid + full 하나 + 2열)으로 맞춘다 —
 * 두 단계가 이어질 때 화면이 다른 모양으로 갈아타는 것처럼 보이면 안 된다.
 */

/** 결과와 같은 골격으로 은은하게 깜빡이는 블록. MddExplorer 의 Skeleton 과 같은 표현이다. */
function Block({ h, w = "100%", r = 10 }: { h: number; w?: number | string; r?: number }) {
  return <div className="hz-shimmer" style={{ height: h, width: w, borderRadius: r, background: C.bg }} />;
}

const card: React.CSSProperties = {
  background: C.card,
  border: `1px solid ${C.line}`,
  borderRadius: 16,
  padding: "var(--hz-card-pad)",
  minWidth: 0,
};

export default function Loading() {
  return (
    // position:relative 는 아래 hz-loading-float 의 기준 상자가 되기 위한 것이다.
    <div style={{ position: "relative", maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
      {/* 제목·설명은 자리표시자로 두지 않고 진짜 글자를 쓴다 — 어느 페이지로 왔는지는
          데이터를 기다릴 이유가 없다(카더라와 같은 원칙). */}
      <header>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: C.ink }}>MDD 정밀분석</h1>
          <div style={{ height: 1, flex: 1, background: C.line }} />
        </div>
        <p style={{ margin: "8px 0 0", color: C.sub, fontSize: 14, lineHeight: 1.6 }}>
          종목이 고점에서 <b style={{ color: C.ink }}>얼마나 빠졌는지</b>, 이만큼 빠진 적이{" "}
          <b style={{ color: C.ink }}>얼마나 드문지</b>, 과거엔 회복까지 <b style={{ color: C.ink }}>얼마나 걸렸는지</b>를 봅니다.
        </p>
      </header>

      {/* 조회 바(종목 검색 + 기간 탭). 실제 Controls 가 앉을 자리를 그대로 비워 둔다. */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }} aria-hidden>
        <Block h={44} w={260} r={12} />
        <Block h={44} w={218} r={999} />
      </div>

      {/* MddExplorer 의 Skeleton 과 같은 골격 — 넓은 카드 하나 + 2열 카드 둘. */}
      <div className="mdd-grid" aria-hidden>
        <div className="mdd-full">
          <section style={{ ...card, display: "flex", flexDirection: "column", gap: 14 }}>
            <Block h={22} />
            <Block h={54} />
            <Block h={176} />
          </section>
        </div>
        {[0, 1].map((i) => (
          <section key={i} style={{ ...card, display: "flex", flexDirection: "column", gap: 12 }}>
            <Block h={20} />
            <Block h={14} />
            <Block h={96} />
          </section>
        ))}
      </div>

      {/* 보이는 자리표시자의 한가운데(globals.css 의 hz-loading-float 주석). 이 페이지는
          자리표시자가 창보다 짧아서, 예전의 '창 한가운데'는 푸터 코앞에 찍혔다. */}
      <div className="hz-loading-float" aria-hidden>
        <span className="hz-loading-badge">
          <span className="hz-spinner" />
          10년치 들춰보는 중
        </span>
      </div>

      {/* 화면에는 안 보이고 스크린리더에만 읽힌다(전용 유틸 클래스가 레포에 없어 인라인). */}
      <span
        role="status"
        aria-live="polite"
        style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }}
      >
        MDD 정밀분석을 불러오는 중입니다.
      </span>
    </div>
  );
}
