import { Skeleton } from "@/components/ui/skeleton";

/**
 * 둘째 줄(결과 셋 — 1년에 받는 배당 · 달마다 · 일정)의 자리표시자. loading.tsx 와 계산기(DividendCalculator)가 같이 쓴다.
 *
 * 결과 셋은 담은 종목이 있을 때만 서는데, 담은 종목은 브라우저 저장소에 있어 서버 HTML 은 모른다. 그래서 첫 HTML 은 결과 셋 없이
 * 띠 다음에 '내 종목'을 그리고, 저장소를 읽은 뒤 결과 셋이 위에 끼어들어 내용이 크게 밀렸다(폰에서 '내 종목' top → 1,422px,
 * 2026-10-04 점검). 이제 루트 레이아웃의 첫 그림 전 스크립트(PREF_SCRIPT)가 저장된 종목이 있으면 <html data-dv-has> 를 달고,
 * 이 자리표시자는 그때만 선다(v2.css .v2-dv-band-ph). 계산기는 저장소를 읽기 전까지만 이것을 그린다.
 */
function Block({ h, w = "100%", r = 4 }: { h: number; w?: number | string; r?: number }) {
  return <Skeleton style={{ height: h, width: w, borderRadius: r }} />;
}

/** v2 모듈 한 장 — 머리 띠(제목 자리) + 안쪽 블록들. */
export function SkeletonMod({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`v2-mod${className ? ` ${className}` : ""}`}>
      <header className="v2-mod-head">
        <Block h={14} w={96} />
      </header>
      <div style={{ padding: "12px 14px 14px", display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>{children}</div>
    </section>
  );
}

export function BandSkeleton() {
  return (
    <div className="v2-dv-band v2-dv-band-ph" aria-hidden>
      <SkeletonMod className="v2-dv-sum">
        <Block h={28} w={160} />
        <Block h={120} />
      </SkeletonMod>
      <SkeletonMod>
        <Block h={180} />
      </SkeletonMod>
      <SkeletonMod className="v2-dv-up">
        <Block h={180} />
      </SkeletonMod>
    </div>
  );
}
