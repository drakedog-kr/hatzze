import { C, Icon } from "../ui";
import { card as cardStyle } from "./parts";

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
 * 골격은 page.tsx 와 같은 순서·같은 칸수(hz-c*)로 둔다. 칸수가 어긋나면 전환 순간
 * 그리드가 다른 모양이었다가 제자리를 찾는 것처럼 보인다. 높이는 실제 카드와 정확히
 * 같을 필요는 없다 — 이 화면은 결과가 오면 통째로 교체되지, 카드별로 하나씩 채워지는
 * 방식이 아니기 때문이다(그건 Suspense 를 카드마다 걸었을 때 이야기다).
 */

/** 결과와 같은 골격으로 은은하게 깜빡이는 블록. globals.css 의 hz-shimmer 를 쓴다. */
function Block({ h, w = "100%", r = 10 }: { h: number; w?: number | string; r?: number }) {
  return <div className="hz-shimmer" style={{ height: h, width: w, borderRadius: r, background: C.bg }} />;
}

/** 카드 한 장 — 머리(아이콘 타일·제목·부제)와 본문 줄 몇 개. */
function CardSkeleton({ className, h }: { className?: string; h: number }) {
  return (
    <div className={className} style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 14 }}>
      {/* SectionHead 와 같은 골격 — 40×40 타일 옆에 제목·부제가 쌓인다. 자리표시자가
          결과와 다른 모양이면 전환 순간 머리가 한 번 튄다. */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <Block h={40} w={40} r={13} />
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          <Block h={15} w={132} r={6} />
          <Block h={12} w={188} r={6} />
        </div>
      </div>
      <Block h={h} />
    </div>
  );
}

export default function Loading() {
  return (
    // position:relative 는 아래 hz-loading-float 의 기준 상자가 되기 위한 것이다.
    <div style={{ position: "relative", maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
      {/* 소개는 자리표시자로 두지 않고 진짜 글자를 쓴다 — 이 문단은 데이터를 기다릴
          이유가 없고, 회색 막대보다 글이 있는 편이 '열렸다'는 느낌을 준다. 제목은
          여기서 안 그린다(셸의 본문 헤더가 이미 그린다 — page.tsx 와 같은 이유).
          page.tsx 의 소개 카드와 같은 조판이라 전환 순간 이 자리는 움직이지 않는다. */}
      <section style={{ ...cardStyle, display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: "var(--r-icon)",
            background: "var(--c-blue-tint)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon name="forum" style={{ fontSize: 21, color: C.blue }} />
        </div>
        <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.75, color: C.inkSoft, textWrap: "pretty" }}>
          한국 주식 텔레그램 채널들이 <b style={{ fontWeight: 800, color: C.ink }}>지금 무엇에 주목하는지</b>를 모아 보여줍니다.
          조회·확산·언급량을 종합한 <b style={{ fontWeight: 800, color: C.ink }}>화제성</b> 지표이며, 매수·매도 신호가 아닙니다.
        </p>
      </section>

      {/* page.tsx 의 카드 순서·칸수와 1:1 로 맞춘다. */}
      <div className="hz-grid" aria-hidden>
        <CardSkeleton h={300} />                          {/* 모니터링 현황 */}
        <CardSkeleton className="hz-c3" h={300} />        {/* 생태계 센티먼트 */}
        <CardSkeleton className="hz-c4" h={200} />        {/* 급부상 종목 */}
        <CardSkeleton className="hz-c4" h={330} />        {/* 트렌딩 메시지 */}
        <CardSkeleton className="hz-c2" h={420} />        {/* 테마 로테이션 */}
        <CardSkeleton className="hz-c2" h={420} />        {/* 주요 종목 리포트 */}
        <CardSkeleton className="hz-c2" h={420} />        {/* 채널 파워 랭킹 */}
        <CardSkeleton h={420} />                          {/* 뜨는 채널 */}
        <CardSkeleton h={420} />                          {/* 이슈 키워드 */}
      </div>

      {/* 스켈레톤만 두면 "멈춘 건지 오는 중인지"가 덜 분명하다. 자리표시자가 뜬 뒤에도
          내용이 오기까지 0.7~1.1초가 더 걸리므로(프로덕션 실측) 도는 표시를 같이 둔다.
          자리는 '보이는 자리표시자의 한가운데' — 처음엔 제목 옆에 뒀는데 눈에 잘 안 띄었다.
          기준을 창이 아니라 이 상자로 잡는 이유는 globals.css 의 hz-loading-float 주석에.
          알맹이가 아니라 진행 표시라 pointer-events 는 CSS 에서 꺼 둔다. */}
      <div className="hz-loading-float" aria-hidden>
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
