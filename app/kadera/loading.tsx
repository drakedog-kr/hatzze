import { C } from "../ui";

/**
 * 클릭 직후 즉시 그려지는 자리표시자.
 *
 * 이 파일이 없으면 카더라 리포트를 눌러도 **화면이 이전 페이지에 그대로 머문다.**
 * 사이드바가 next/link 라 클라이언트 전환인데, 보여줄 중간 상태가 정의돼 있지 않으면
 * Next 는 서버 페이로드가 다 올 때까지 전환을 커밋하지 않는다. /kadera 는 데이터 가지가
 * 12개라 그게 0.7~1.5초였다(프로덕션 실측). `/` 0.13초·`/mdd` 0.3~0.5초는 같은 구조인데
 * 빨라서 티가 안 났을 뿐이다.
 *
 * 서버 시간을 줄이는 파일이 아니다. **기다림을 눈앞에서 없애는 파일이다.**
 *
 * 덤이 하나 더 있다. 동적 라우트의 기본 프리페치는 "가장 가까운 loading 경계까지"인데,
 * 지금은 경계가 없어 사실상 아무것도 미리 받지 않는다. 이 파일이 그 경계가 되어 준다.
 *
 * 골격은 page.tsx 와 같은 순서·같은 시트 구성으로 둔다. 어긋나면 전환 순간 판이 다른
 * 모양이었다가 제자리를 찾는 것처럼 보인다. 높이는 실제 시트와 정확히 같을 필요는
 * 없다 — 이 화면은 결과가 오면 통째로 교체되지, 시트별로 하나씩 채워지는 방식이
 * 아니기 때문이다(그건 Suspense 를 시트마다 걸었을 때 이야기다).
 */

/** 결과와 같은 골격으로 은은하게 깜빡이는 블록. globals.css 의 hz-shimmer 를 쓴다.
 *
 * ⚠️ `maxWidth: "100%"` 가 있어야 한다. 폭을 픽셀로 준 블록(340·420)은 좁은 화면에서
 * 칸보다 넓어져 카드 밖으로 삐져나왔다(375px 에서 6px, 2026-09-05 실측). 골격은 결과가
 * 들어올 자리를 잡아 두는 것이라 결과보다 커지면 안 된다. */
function Block({ h, w = "100%", r = 8 }: { h: number; w?: number | string; r?: number }) {
  return (
    <div className="hz-shimmer" style={{ height: h, width: w, maxWidth: "100%", borderRadius: r, background: C.bg }} />
  );
}

/** 시트 머리 — 맨 아이콘 + 제목 + 부제(SectionHead 와 같은 골격·같은 padding). */
function SheetHead() {
  return (
    <div className="hz-sheet-head hz-sheet-head-bold">
      <Block h={40} w={40} r={12} />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 5 }}>
        <Block h={17} w={140} r={5} />
        <Block h={12} w={220} r={5} />
      </div>
    </div>
  );
}

/** 시트 한 장 — 머리 + 본문 한 덩어리. */
function Sheet({ h, style }: { h: number; style?: React.CSSProperties }) {
  return (
    <section className="hz-sheet" style={style}>
      <SheetHead />
      <div style={{ padding: "4px 26px 24px" }}>
        <Block h={h} />
      </div>
    </section>
  );
}

/** 구간 제목(SectionIntro) 자리 — 장 번호 + 제목 한 줄, 높이 26(20 × 1.3).
    ⚠️ **실물의 눈금이 바뀌면 여기도 같이 고친다.** 부제 줄이 자리표시자에만 남아 있어서
    로딩이 끝나는 순간 아래가 18px 튄 적이 있다. 자리표시자는 실물과 같은 골격이어야 한다. */
function Caps() {
  return (
    <div className="hz-tx-intro">
      <div style={{ display: "flex", alignItems: "center", gap: 8, height: 26 }}>
        <Block h={12} w={16} r={4} />
        <Block h={20} w={150} r={6} />
      </div>
    </div>
  );
}

/** 50:50 두 시트. page.tsx 의 flex-wrap 값과 같아야 한다. */
function Pair({ h }: { h: number }) {
  const half: React.CSSProperties = { flex: "1 1 calc(50% - 8px)", minWidth: 320 };
  return (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
      <Sheet h={h} style={half} />
      <Sheet h={h} style={half} />
    </div>
  );
}

export default function Loading() {
  return (
    // position:relative 는 아래 hz-loading-float 의 기준 상자가 되기 위한 것이다.
    <div className="hz-tx" style={{ position: "relative" }} aria-hidden>
      {/* 히어로 — 브리핑(왼쪽) + 타일 세 덩이(오른쪽). page.tsx 의 .hz-tx-hero 와 같은
          골격이라 전환 순간 판이 다른 모양이었다가 제자리를 찾는 것처럼 보이지 않는다. */}
      <section className="hz-sheet hz-tx-hero hz-tx-hero-flip">
        <div className="hz-tx-hero-main">
          <Block h={13} w={96} r={5} />
          <Block h={34} w={340} r={8} />
          <Block h={150} />
        </div>
        <div className="hz-tx-note hz-tx-spot">
          <Block h={30} w={420} r={15} />
        </div>
        <div className="hz-tx-hero-side">
          <Block h={214} r={16} />
          <div className="hz-tx-stats">
            <Block h={66} r={14} />
            <Block h={66} r={14} />
            <Block h={66} r={14} />
            <Block h={66} r={14} />
          </div>
          <Block h={42} r={12} />
        </div>
      </section>

      <Caps />
      <Sheet h={330} />
      <Pair h={420} />

      <Caps />
      <Sheet h={430} />
      <Sheet h={300} />

      <Caps />
      <Pair h={400} />

      {/* 스켈레톤만 두면 "멈춘 건지 오는 중인지"가 덜 분명하다. 자리표시자가 뜬 뒤에도
          내용이 오기까지 0.7~1.1초가 더 걸리므로(프로덕션 실측) 도는 표시를 같이 둔다.
          자리는 '보이는 자리표시자의 한가운데' — 처음엔 제목 옆에 뒀는데 눈에 잘 안 띄었다.
          기준을 창이 아니라 이 상자로 잡는 이유는 globals.css 의 hz-loading-float 주석에.
          알맹이가 아니라 진행 표시라 pointer-events 는 CSS 에서 꺼 둔다. */}
      <div className="hz-loading-float">
        <span className="hz-loading-badge">
          <span className="hz-spinner" />
          다들 뭐에 꽂혔는지 보는 중
        </span>
      </div>

      {/* 화면에는 안 보이고 스크린리더에만 읽힌다(전용 유틸 클래스가 레포에 없어 인라인). */}
      <span
        role="status"
        aria-live="polite"
        style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }}
      >
        카더라 리포트를 불러오는 중입니다.
      </span>
    </div>
  );
}
