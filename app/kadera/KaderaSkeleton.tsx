import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";

/**
 * 국장 · 미장 카더라의 자리표시자(v2, 2026-10-03). 두 화면이 같은 얼개라 골격도 한 벌이다 — 첫 줄 띠, 둘째 줄 모듈 셋
 * (여론 · 테마 · 일정), 셋째 줄 [급부상 | 오늘의 요약] · [크게 움직인 | 이슈 키워드] · [많이 언급].
 * 모듈 id 가 실물과 같아 v2.css 의 영역 이름 · 폭 단계가 그대로 선다(1,000 미만 한 줄기 · 폰 한 칸).
 *
 * 왜 자리표시자가 필요한지(사이드바 클라이언트 전환 · 프리페치 경계)는 app/kadera/loading.tsx 머리말.
 * ⚠️ 실물에서 모듈을 빼거나 옮기면 여기도 같이 본다 — 로딩이 끝나는 순간 판이 다른 모양이었다가 제자리를 찾는 것처럼 보인다.
 */

function Block({ h, w = "100%", r = 4 }: { h: number; w?: number | string; r?: number }) {
  return <Skeleton style={{ height: h, width: w, borderRadius: r }} />;
}

/** v2 모듈 한 장 — 머리 띠(제목 자리) + 안쪽 블록 하나. 키는 실물(1,440 실측)에 맞춘다. */
function Mod({ id, h }: { id: string; h: number }) {
  return (
    <section id={id} className="v2-mod">
      <header className="v2-mod-head">
        <Block h={14} w={96} />
      </header>
      <div style={{ padding: "12px 14px 14px", flex: 1, display: "flex", flexDirection: "column" }}>
        <Block h={h} />
      </div>
    </section>
  );
}

export function KaderaSkeleton({ badge, label }: { badge: string; label: string }) {
  return (
    // position:relative 는 아래 hz-loading-float 의 기준 상자가 되기 위한 것이다.
    <div className="hz-tx v2-kd" style={{ position: "relative" }} aria-hidden>
      <div className="v2-cover" style={{ height: 41 }} />
      <div className="v2-band">
        <Mod id="mood" h={300} />
        <Mod id="themes" h={300} />
        <Mod id="events" h={300} />
      </div>
      <div className="v2-grid">
        <Mod id="surging" h={410} />
        <Mod id="brief" h={410} />
        <Mod id="why" h={410} />
        <Mod id="keywords" h={410} />
        <Mod id="talk" h={426} />
      </div>

      {/* 스켈레톤만 두면 "멈춘 건지 오는 중인지"가 덜 분명하다 — 보이는 자리표시자의 한가운데에 도는 표시를 둔다(globals.css hz-loading-float). */}
      <div className="hz-loading-float">
        <span className="hz-loading-badge">
          <Spinner />
          {badge}
        </span>
      </div>

      {/* 화면에는 안 보이고 스크린리더에만 읽힌다(전용 유틸 클래스가 레포에 없어 인라인). */}
      <span
        role="status"
        aria-live="polite"
        style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }}
      >
        {label}
      </span>
    </div>
  );
}
