import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";

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
 * 골격은 v2 실물과 같다(2026-10-03) — 첫 줄 띠 + 짝 모듈 줄 셋(.v2-in-pair). 범위(v2-kd v2-in)도 실물과 같아
 * 테두리 · 간격 · 폭 단계가 그대로 선다.
 * ⭐ 종목 상세 · 인물 상세도 이 파일을 물려받는다. 둘 다 첫 줄 띠 + 짝 모듈(.v2-tm-band)로 시작해 **눈에 보이는 위쪽이
 *   같은 모양**이다. 아래 장수는 다르지만 그쪽은 0.23~0.42초라 금방 제자리를 찾는다.
 * ⛔ 전체보기(`list/[kind]`)는 짝 모듈이 아니라 긴 목록이라 그 폴더에 자기 loading.tsx 를 따로 뒀다(카더라 국장↔미장과 같은 이유).
 */

function Block({ h, w = "100%", r = 4 }: { h: number; w?: number | string; r?: number }) {
  return <Skeleton style={{ height: h, width: w, borderRadius: r }} />;
}

/** v2 모듈 한 장 — 머리 띠(제목 자리) + 안쪽 블록 하나. */
function Mod({ h }: { h: number }) {
  return (
    <section className="v2-mod">
      <header className="v2-mod-head">
        <Block h={14} w={110} />
      </header>
      <div style={{ padding: "12px 14px 14px", flex: 1, display: "flex", flexDirection: "column" }}>
        <Block h={h} />
      </div>
    </section>
  );
}

export default function Loading() {
  return (
    // position:relative 는 아래 hz-loading-float 의 기준 상자가 되기 위한 것이다.
    <div className="hz-tx v2-kd v2-in" style={{ position: "relative" }} aria-hidden>
      <div className="v2-cover" style={{ height: 41 }} />
      {/* 짝 모듈 줄 셋 — 높이는 실물(1,440)에서 잰 값에 가깝게. */}
      {[0, 1, 2].map((i) => (
        <div key={i} className="v2-in-pair">
          <Mod h={260} />
          <Mod h={260} />
        </div>
      ))}

      <div className="hz-loading-float">
        <span className="hz-loading-badge">
          <Spinner />
          공시에 남은 기록을 모으는 중
        </span>
      </div>

      {/* 화면에는 안 보이고 스크린리더에만 읽힌다(전용 유틸 클래스가 레포에 없어 인라인). */}
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
