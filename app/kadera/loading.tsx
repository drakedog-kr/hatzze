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

/** 결과와 같은 골격으로 은은하게 깜빡이는 블록. globals.css 의 hz-shimmer 를 쓴다. */
function Block({ h, w = "100%", r = 8 }: { h: number; w?: number | string; r?: number }) {
  return <div className="hz-shimmer" style={{ height: h, width: w, borderRadius: r, background: C.bg }} />;
}

/** 시트 머리 — 맨 아이콘 + 제목 + 부제(SectionHead 와 같은 골격·같은 padding). */
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

/** 시트 한 장 — 머리 + 본문 한 덩어리. */
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

/** 시트 사이의 마이크로 캡스 구간 머리. 자리를 지켜야 전환 때 아래가 밀리지 않는다. */
function Caps() {
  return (
    <div style={{ marginTop: 10 }}>
      <Block h={12} w={92} r={5} />
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
    <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 16 }} aria-hidden>
      {/* 히어로 — 25:25:50 세 칸. 여기만 셀을 따로 그린다(나머지 시트는 한 덩어리로
          충분하지만, 이 판은 첫 화면을 통째로 차지해서 칸이 셋이라는 게 보여야 한다). */}
      <section className="hz-sheet">
        <div className="hz-kd-hero">
          <div className="hz-kd-hero-q">
            <Block h={13} w={84} r={5} />
            <Block h={190} />
          </div>
          <div className="hz-kd-hero-q">
            <Block h={13} w={84} r={5} />
            <Block h={190} />
          </div>
          <div className="hz-kd-hero-h">
            <Block h={13} w={72} r={5} />
            <Block h={190} />
          </div>
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
