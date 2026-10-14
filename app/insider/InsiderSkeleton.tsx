import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { CoverSkeleton, type CoverCell } from "../CoverSkeleton";

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
 * 내부자 화면 셋의 골격. brief 는 본 화면만 — 첫 줄 띠 아래 둘째 줄 [매매 방향 | 오늘의 브리핑](2026-10-04) 자리를 둔다.
 * 종목 · 인물 상세는 브리핑이 없어 자기 loading.tsx 가 brief 없이 부른다(없으면 이 파일을 물려받아 없는 판이 섰다 사라진다).
 */
/** 첫 줄 띠의 흔한 꼴 — 본 화면 · 종목 상세 · 인물 상세. 폰 390 실물 92 · 208 · 164(app/CoverSkeleton.tsx 머리말). */
export const INSIDER_COVER: CoverCell[] = [
  { kind: "idx", k: "새 신고", v: [["임원", "17장", "10/9"], ["의원", "3장", "10/12"]] },
  { kind: "cur" },
  { kind: "meta", text: "10월 9일(금) 공시까지" },
];
export const STOCK_COVER: CoverCell[] = [
  { kind: "id", title: "NVDA", sub: "엔비디아", logo: true },
  { kind: "cell", k: "현재가", v: "$228.52 306,704원", chg: "+0.94%", price: true },
  { kind: "cell", k: "52주 위치", v: "86%", chg: "$165.17 ~ $239.24" },
  { kind: "idx", k: "수익률", v: [["1개월", "+8.3%"], ["3개월", "+7.5%"], ["1년", "+26.9%"]] },
  { kind: "cur" },
  { kind: "meta", text: "10/13 언급 기준" },
];
export const INVESTOR_COVER: CoverCell[] = [
  { kind: "id", title: "조지 소로스", sub: "소로스 펀드" },
  { kind: "cell", k: "미국 주식 보유액", v: "$5.9B 7.9조원", chg: "전 분기보다 +6.0%" },
  { kind: "idx", k: "보유", v: [["", "224종목"], ["상위 5종목", "22%"], ["카더라 언급", "54종목"]] },
  { kind: "cur" },
  { kind: "meta", text: "2026 Q2 13F · 분기말 기준" },
];

export function InsiderSkeleton({ brief, cover, crumb = false }: { brief: boolean; cover: CoverCell[]; crumb?: boolean }) {
  return (
    // position:relative 는 아래 hz-loading-float 의 기준 상자가 되기 위한 것이다.
    // aria-hidden 은 바깥에 걸지 않는다 — 아래 '불러오는 중' 알림까지 숨어 화면 읽기 기계에 안 읽혔다(2026-10-14). 골격 블록은 빈 상자라 안 읽힌다.
    <div className="hz-tx v2-kd v2-in" style={{ position: "relative" }}>
      {/* 상세(종목 · 인물)는 띠 위에 이동 경로 줄(내부자 리포트 › 이름, 20px)이 있다 — 없으면 띠 아래 판이 32px 움직였다. */}
      {crumb && <Block h={20} w={180} />}
      <CoverSkeleton cells={cover} />
      {/* 둘째 줄 — 매매 방향 | 오늘의 브리핑(.v2-in-band). 키는 1,440 실물에 맞춘다. */}
      {brief && (
        <div className="v2-in-band">
          <Mod h={208} />
          <Mod h={208} />
        </div>
      )}
      {/* 짝 모듈 줄 셋 — 높이는 실물(1,440)에서 잰 값에 가깝게. */}
      {[0, 1, 2].map((i) => (
        <div key={i} className="v2-in-pair">
          <Mod h={260} />
          <Mod h={260} />
        </div>
      ))}

      <div className="hz-loading-float" aria-hidden>
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
