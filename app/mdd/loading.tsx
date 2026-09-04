import { C } from "../ui";

/**
 * 클릭 직후 즉시 그려지는 자리표시자. 카더라(app/kadera/loading.tsx)와 같은 이유로 둔다 —
 * 이 파일이 없으면 MDD 정밀분석을 눌러도 화면이 이전 페이지에 그대로 머문다.
 *
 * ⚠️ **이 페이지에는 로딩이 두 겹이다.** 헷갈리지 말 것.
 *  1) 여기(route 단계) — 서버가 코스피 종목 목록(944행)을 실어 내려줄 때까지. 실측 ~0.5초.
 *  2) MddExplorer 안의 `Skeleton` — 그 다음 클라이언트가 /api/mdd 로 낙폭을 받아올 때까지.
 * 두 번째는 이미 있던 것이고 종목·기간을 바꿀 때마다 다시 뜬다. 여기서는 첫 번째만 맡는다.
 *
 * ⭐ **골격은 그쪽 `Skeleton` 과 글자 그대로 같아야 한다.** 두 단계가 이어 붙는데 모양이
 * 다르면 화면이 갈아타는 것처럼 보인다. 그래서 시트 배치(히어로 3분할 → 전폭 차트 →
 * 50:50 짝)를 여기서도 그대로 그린다.
 *
 * ⚠️ **폭 상한을 여기서 걸지 말 것.** 셸(AppShell)이 본문 상자를 이미 1340 으로 잡는다.
 * 예전엔 `maxWidth:1180, margin:"0 auto"` 가 있었는데, 세로 flex 안에서 가로 margin:auto 가
 * `align-items:stretch` 를 꺼 버려 자리표시자만 좁게(fit-content) 떴다 — MddExplorer 와 같은
 * 함정이라 두 파일을 같이 고쳤다.
 */

/**
 * 결과와 같은 골격으로 은은하게 깜빡이는 블록. MddExplorer 의 Skeleton 과 같은 표현이다.
 *
 * ⚠️ 바탕색을 자리에 맞춰 골라야 한다. 기본값 `--c-bg` 는 **시트(흰 판) 안**에서만 보인다 —
 * 조회 바처럼 시트 밖(페이지 바탕 위)에 놓이는 블록에 그대로 쓰면 바탕과 같은 색이라
 * 아예 안 보인다. 그 자리는 실제 검색창과 같은 `--c-track` 을 쓴다.
 */
function Block({ h, w = "100%", r = 8, bg = C.bg }: { h: number; w?: number | string; r?: number; bg?: string }) {
  return <div className="hz-shimmer" style={{ height: h, width: w, borderRadius: r, background: bg }} />;
}

/** 시트 안쪽 본문 — MddExplorer 의 PAD 와 같은 값. */
const body: React.CSSProperties = { padding: "18px 22px", display: "flex", flexDirection: "column", gap: 12 };

export default function Loading() {
  return (
    // position:relative 는 아래 hz-loading-float 의 기준 상자가 되기 위한 것이다.
    <div className="hz-tx" style={{ position: "relative" }}>
      {/* 조회 바(종목 검색 + 기간 탭). 실제 Controls 가 앉을 자리를 그대로 비워 둔다. */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }} aria-hidden>
        <div style={{ flex: "1 1 260px", minWidth: 220 }}>
          <Block h={44} r={12} bg={C.track} />
        </div>
        <Block h={44} w={218} r={9} bg={C.track} />
      </div>

      {/* MddExplorer 의 Skeleton 과 같은 골격 — 히어로 3분할 + 전폭 차트 + 50:50 짝. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }} aria-hidden>
        <section className="hz-sheet" style={{ display: "flex", flexWrap: "wrap" }}>
          {[290, 300, 300].map((basis, i) => (
            <div key={i} style={{ flex: `1 1 ${basis}px`, minWidth: 0, padding: "20px 22px", display: "flex", flexDirection: "column", gap: 12 }}>
              <Block h={14} />
              <Block h={38} />
              <Block h={48} />
            </div>
          ))}
        </section>
        <section className="hz-sheet">
          <div style={body}>
            <Block h={201} />
          </div>
        </section>
        <div className="mdd-pair">
          {[0, 1].map((i) => (
            <section key={i} className="hz-sheet">
              <div style={body}>
                <Block h={16} />
                <Block h={112} />
              </div>
            </section>
          ))}
        </div>
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
