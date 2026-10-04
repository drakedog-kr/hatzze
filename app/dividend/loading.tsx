import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { BandSkeleton, SkeletonMod } from "./BandSkeleton";

/**
 * `/dividend` 의 자리표시자. 없으면 서버가 표 셋(국내 2,777 · 미국 579 · ETF 243행)을 다 읽을 때까지
 * 첫 바이트를 안 보내 1초 넘게 눌렀는데 아무 일도 안 난 것처럼 보인다(개발 서버 실측 1.8초 · insider/loading.tsx 머리말).
 * 골격은 실물과 같다(v2, 2026-10-03) — 첫 줄 띠, 결과 셋(담은 종목이 있을 때만), 내 종목(검색 + 갈래 셋),
 * 바스켓 표 + 읽기 칸. 범위(v2-kd v2-dv)도 실물과 같아 테두리 · 간격 · 폭 단계가 그대로 선다.
 */

function Block({ h, w = "100%", r = 4 }: { h: number; w?: number | string; r?: number }) {
  return <Skeleton style={{ height: h, width: w, borderRadius: r }} />;
}

export default function Loading() {
  return (
    <div className="hz-tx v2-kd v2-dv" style={{ position: "relative" }} aria-hidden>
      <div className="v2-cover" style={{ height: 41 }} />
      {/* 결과 셋은 담은 종목이 있을 때만 — 없는 사람에게 그렸다가 걷으면 아래가 통째로 올라간다(BandSkeleton 머리말). */}
      <BandSkeleton />
      <SkeletonMod>
        <Block h={44} r={6} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 14 }}>
          {[0, 1, 2].map((i) => (
            <Block key={i} h={150} />
          ))}
        </div>
      </SkeletonMod>
      <div className="v2-dv-bk">
        <SkeletonMod>
          <Block h={420} />
        </SkeletonMod>
        <SkeletonMod>
          <Block h={420} />
        </SkeletonMod>
      </div>

      <div className="hz-loading-float">
        <span className="hz-loading-badge">
          <Spinner />
          배당 기록을 모으는 중
        </span>
      </div>
      <span role="status" aria-live="polite" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }}>
        배당으로 살기를 불러오는 중입니다
      </span>
    </div>
  );
}
