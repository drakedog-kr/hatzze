import { C } from "../ui";
import { CARD_GRID } from "./DailyCards";
import { S } from "./scale";

/**
 * `/seohak` 의 자리표시자.
 *
 * ## ⚠️ 없으면 **0.6초 동안 아무것도 안 나간다**
 *
 * 이 화면은 스트리밍을 안 한다. `page.tsx` 가 개요를 먼저 await 하고 그다음 다섯을
 * `Promise.all` 로 묶어 기다린 뒤에야 한 덩어리로 뱉는다. loading.tsx 가 없으면 Next 가
 * 그동안 첫 바이트를 안 보내므로, 눌러도 화면이 직전 페이지에 그대로 멈춰 있다.
 * 실측(2026-08-27, 따뜻한 서버, 3회): TTFB **0.53~0.62초**. 같은 시각 `/kadera` 0.07초,
 * `/insider` 0.07초 — 뒤 둘이 빠른 건 코드가 빨라서가 아니라 각자 이 파일이 있어서다.
 *
 * ⭐ 여기가 비어 있으면 손해가 하나 더 있었다. 사이드바가 이 주소를 프리페치할 때
 *   받아 갈 것이 없어 본문이 `[null,null]` 인 **113바이트짜리 빈 응답**이었는데,
 *   전 라우트가 동적이라 그 빈 응답에도 함수가 한 번씩 깨어났다. 지금은 프리페치를
 *   의도 보인 링크로만 좁혀 두었지만(`AppShell` 의 `useIntentPrefetch`), 나중에 다시
 *   켜더라도 이 파일이 있어야 프리페치가 값을 갖는다.
 */

/** 결과와 같은 골격으로 은은하게 깜빡이는 블록. globals.css 의 hz-shimmer 를 쓴다. */
function Block({ h, w = "100%", r = 8 }: { h: number; w?: number | string; r?: number }) {
  return <div className="hz-shimmer" style={{ height: h, width: w, borderRadius: r, background: C.bg }} />;
}

/** 시트 머리(아이콘 + 제목 + 부제). `.hz-sheet-head` 가 치수를 쥐므로 여기선 알맹이만 흉내 낸다. */
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

/**
 * 시트 한 장.
 *
 * ⚠️ `h` 는 **본문 안쪽 높이**다(머리 74px 과 아래 padding 을 뺀 값). 프로덕션에서 잰
 * 바깥 높이 484 / 435 / 457 / 513 에서 역산했다(2026-08-27, 1440px). 좁은 폭에서는 격자가
 * 1열로 접혀 실제 카드가 더 길어지므로 딱 맞지는 않는다 — 자리를 잡아 두는 것이 목적이라
 * 그 정도면 된다.
 */
function Sheet({ h, pad = 14 }: { h: number; pad?: number }) {
  return (
    <section className="hz-sheet">
      <SheetHead />
      <div style={{ padding: `${pad}px 22px` }}>
        <Block h={h} />
      </div>
    </section>
  );
}

/** 구간 머리 배지(SectionCaps) 자리. 실제 배지가 24px 이다. */
function Cap() {
  return <Block h={24} w={148} r={12} />;
}

export default function Loading() {
  return (
    // position:relative 는 아래 hz-loading-float 의 기준 상자가 되기 위한 것이다.
    // gap 은 page.tsx 의 세로 흐름과 같은 S.lg 여야 전환 때 안 튄다.
    <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: S.lg }}>
      {/* ⚠️ aria-hidden 은 **여기 자리표시자들에만** 건다. 루트에 걸면 맨 아래
          `role="status"` 안내까지 접근성 트리에서 통째로 빠져 스크린리더가 아무 말도
          안 듣는다 — 이웃 loading 넷(kadera·kadera/us·insider·insider/list)이 지금
          그 상태다. 여기는 mdd/loading.tsx 쪽을 따른다. */}
      {/* 히어로 = 달력(CalendarHero). 이 화면에서 가장 눈에 붙는 그림이라 제일 크다. */}
      <div aria-hidden>
        <Sheet h={373} pad={18} />
      </div>

      {/* 세 구간 × 시트 두 장. page.tsx 와 **같은 CARD_GRID** 를 쓴다 — 손으로 적었다가
          칸 사이가 갈린 적이 있어 그쪽 상수를 그대로 들여온다. */}
      {[332, 354, 410].map((h, i) => (
        <div key={i} style={{ display: "flex", flexDirection: "column", gap: S.lg }} aria-hidden>
          <Cap />
          <div style={CARD_GRID}>
            <Sheet h={h} />
            <Sheet h={h} />
          </div>
        </div>
      ))}

      <div className="hz-loading-float">
        <span className="hz-loading-badge">
          <span className="hz-spinner" />
          장부를 펼치는 중
        </span>
      </div>

      {/* 화면에는 안 보이고 스크린리더에만 읽힌다(전용 유틸 클래스가 레포에 없어 인라인). */}
      <span
        role="status"
        aria-live="polite"
        style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }}
      >
        서학개미 장부를 불러오는 중입니다.
      </span>
    </div>
  );
}
