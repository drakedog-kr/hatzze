import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";

/* 내부자 화면의 자리표시자 얼개 — 왜 있는지는 app/insider/loading.tsx 머리말. */

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

/**
 * 내부자 화면 셋의 골격. brief 는 본 화면만 — 첫 줄 띠 아래 '오늘의 브리핑'(2026-10-04) 자리를 판 폭 한 장으로 둔다.
 * 종목 · 인물 상세는 브리핑이 없어 자기 loading.tsx 가 brief 없이 부른다(없으면 이 파일을 물려받아 없는 판이 섰다 사라진다).
 */
export function InsiderSkeleton({ brief }: { brief: boolean }) {
  return (
    // position:relative 는 아래 hz-loading-float 의 기준 상자가 되기 위한 것이다.
    <div className="hz-tx v2-kd v2-in" style={{ position: "relative" }} aria-hidden>
      <div className="v2-cover" style={{ height: 41 }} />
      {/* 브리핑 판 — 1,440 실물 173(머리 42 + 줄 둘)에 맞춘다. */}
      {brief && <Mod h={105} />}
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
