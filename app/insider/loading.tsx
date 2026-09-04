import { C } from "../ui";

/**
 * `/insider` 의 자리표시자.
 *
 * ## ⚠️⚠️ 없으면 **1초 동안 아무것도 안 나간다**
 *
 * loading.tsx 가 없으면 Next 는 서버 컴포넌트 트리가 다 풀릴 때까지 첫 바이트를 안
 * 보낸다. 실측(2026-08-25, 따뜻한 서버): `/insider` **1.00초**, `/kadera` 0.02초,
 * `/mdd` 0.02초. 뒤 둘이 빠른 건 코드가 빨라서가 아니라 **이 파일이 있어서**다.
 * 그 1초 동안 화면은 직전 페이지에 멈춰 있어서, 눌렀는데 아무 일도 안 난 것처럼 보인다.
 *
 * ⭐ 종목 상세·인물 상세도 이 파일을 물려받는다. 셋 다 머리가 `hz-kd-hero` 의 q/q/h
 *   라 **눈에 보이는 위쪽이 같은 모양**이다. 아래 시트 장수는 다르지만 그쪽은
 *   0.23~0.42초라 금방 제자리를 찾는다.
 * ⛔ 전체보기(`list/[kind]`)는 히어로가 없어 이 골격을 물려받으면 안 된다. 그래서
 *   그 폴더에 자기 loading.tsx 를 따로 뒀다(카더라 국장↔미장과 같은 이유).
 */

/** 결과와 같은 골격으로 은은하게 깜빡이는 블록. globals.css 의 hz-shimmer 를 쓴다. */
function Block({ h, w = "100%", r = 8 }: { h: number; w?: number | string; r?: number }) {
  return <div className="hz-shimmer" style={{ height: h, width: w, borderRadius: r, background: C.bg }} />;
}

function HeroPane({ lines }: { lines: number }) {
  return (
    <div className="hz-kd-hero-q">
      <div className="hz-kd-hero-title">
        <Block h={14} w={104} r={5} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 12 }}>
        {Array.from({ length: lines }, (_, i) => (
          <Block key={i} h={20} r={5} />
        ))}
      </div>
    </div>
  );
}

function SheetHead() {
  return (
    <div className="hz-sheet-head">
      <Block h={18} w={18} r={5} />
      <div className="hz-sheet-head-txt">
        <Block h={14} w={128} r={5} />
        <Block h={12} w={206} r={5} />
      </div>
    </div>
  );
}

/** 짝을 이루는 시트 한 장. page.tsx 의 HalfSheet 와 같은 폭 규칙이라야 전환 때 안 튄다. */
function HalfSheet({ h }: { h: number }) {
  return (
    <section className="hz-sheet" style={{ flex: "1 1 calc(50% - 8px)", minWidth: "min(460px, 100%)" }}>
      <SheetHead />
      <div style={{ padding: "16px 22px" }}>
        <Block h={h} />
      </div>
    </section>
  );
}

/** 구간 제목(SectionIntro) 자리 — 장 번호 + 제목 한 줄, 높이 26(20 × 1.3).
    ⚠️ **실물의 눈금이 바뀌면 여기도 같이 고친다.** 부제 줄이 자리표시자에만 남아 있어서
    로딩이 끝나는 순간 아래가 18px 튄 적이 있다. 자리표시자는 실물과 같은 골격이어야 한다. */
function Cap() {
  return (
    <div className="hz-tx-intro">
      <div style={{ display: "flex", alignItems: "center", gap: 8, height: 26 }}>
        <Block h={12} w={16} r={4} />
        <Block h={20} w={168} r={6} />
      </div>
    </div>
  );
}

export default function Loading() {
  return (
    <div className="hz-tx" style={{ position: "relative" }} aria-hidden>
      {/* 머리 — 모니터링 현황 · 오늘의 업데이트 · 오늘의 요점(넓은 칸). */}
      <section className="hz-sheet">
        <div className="hz-kd-hero">
          <HeroPane lines={3} />
          <HeroPane lines={3} />
          <div className="hz-kd-hero-h">
            <div className="hz-kd-hero-title">
              <Block h={14} w={90} r={5} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 12 }}>
              {Array.from({ length: 4 }, (_, i) => (
                <Block key={i} h={20} r={5} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 네 구간 × 시트 두 장. 높이는 실제 카드에서 잰 값이다. */}
      {[318, 300, 330, 300].map((h, i) => (
        <div key={i} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Cap />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
            <HalfSheet h={h} />
            <HalfSheet h={h} />
          </div>
        </div>
      ))}

      <div className="hz-loading-float">
        <span className="hz-loading-badge">
          <span className="hz-spinner" />
          공시에 남은 기록을 모으는 중
        </span>
      </div>

      <span
        role="status"
        aria-live="polite"
        style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }}
      >
        내부자 리포트를 불러오는 중입니다.
      </span>
    </div>
  );
}
