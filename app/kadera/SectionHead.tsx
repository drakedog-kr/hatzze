import { C, Icon, R } from "../ui";

/**
 * 카더라 리포트 **시트**의 머리(아이콘 + 제목 + 우측 보조 + 설명).
 *
 * page.tsx 안에 있었는데, 트렌딩 메시지의 기간 탭이 이 머리의 우측에 들어가면서
 * 클라이언트 컴포넌트(TrendingTabs)도 같은 머리를 그려야 해서 파일로 분리했다.
 * "use client" 를 붙이지 않아 서버에서도 그대로 쓰이고, 서버 전용 의존이 없어
 * 클라이언트 번들에 들어가도 안전하다(색·아이콘은 ../ui 프리미티브뿐).
 *
 * 2026-08 콘솔 리디자인: 카드 머리 → **시트 머리**로 바뀌었다. 달라진 것 셋.
 *   ① 아이콘이 40×40 파란 타일이 아니라 **맨 아이콘 18px**(--c-muted). 시트는 판이
 *      하나뿐이라 타일로 시작점을 맞출 카드가 애초에 없고, 타일 25개가 만들던
 *      파란 세로줄이 시장 브리핑에서 먼저 걷혔다.
 *   ② 제목 14.5 → 13, 설명 12.5 → 11.5. 시트 머리는 카드 제목이 아니라 **구간 이름**
 *      이라, 안쪽 셀 제목(14)보다 작아야 위계가 맞는다.
 *   ③ 머리 자체가 아래와 헤어라인으로 갈린다(.hz-sheet-head). marginBottom 은 없다 —
 *      간격은 그 선 아래 내용이 자기 padding 으로 잡는다.
 */
export function SectionHead({
  icon,
  title,
  note,
  desc,
  meta,
  noteHelp,
  right,
}: {
  icon: string;
  title: string;
  note?: string;
  desc?: string;
  /** 설명 아래 한 줄 더(예: "최종 업데이트 · …"). 없으면 그리지 않는다. */
  meta?: string;
  noteHelp?: string;
  /** 우측에 붙일 임의의 조작부(예: 기간 탭). note 와 동시에 쓰지 않는다. */
  right?: React.ReactNode;
}) {
  return (
    <div className="hz-sheet-head" style={{ flexWrap: right ? "wrap" : "nowrap" }}>
      {/* marginTop:1 — 18px 아이콘의 광학 중심을 13px 제목 첫 줄에 맞춘다. */}
      <Icon name={icon} style={{ fontSize: 18, color: C.muted, marginTop: 1, flexShrink: 0 }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: right ? "1 1 200px" : 1, minWidth: 0 }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: C.ink, letterSpacing: "-.01em", wordBreak: "keep-all" }}>
          {title}
        </h3>
        {desc && <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.45, color: C.sub2, wordBreak: "keep-all" }}>{desc}</p>}
        {meta && <p style={{ margin: 0, fontSize: 11, lineHeight: 1.5, color: C.muted }}>{meta}</p>}
      </div>
      {right && <div style={{ flexShrink: 0, marginLeft: "auto" }}>{right}</div>}
      {/* 기간 표기는 알약으로. 회색 맨글씨로 두면 제목 오른쪽에 떠 있는 부스러기처럼
          보이는데, 테두리 없는 알약이면 "이 시트의 조건"이라는 한 덩어리로 읽힌다. */}
      {!right && note && (
        <span
          style={{
            flexShrink: 0,
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 10,
            fontWeight: 700,
            color: C.sub,
            /* 타이틀 칸(--c-title-band) 위에 얹히는 알약이라 **카드색**이다.
               회색 칩(--c-chip #f2f6fb)은 띠(#eef3f9)와 네 단위 차이라 배지가 띠에
               녹아 안 보였다. 카드색이면 라이트에선 더 밝게, 다크에선 더 어둡게 —
               양쪽에서 저절로 갈린다. 헤어라인은 그 경계를 한 번 더 굳힌다. */
            background: C.card,
            border: `1px solid ${C.line}`,
            padding: "2px 8px",
            borderRadius: R.pill,
            whiteSpace: "nowrap",
          }}
        >
          {note}
          {/* 이 알약은 늘 시트 오른쪽 끝에 붙는다 — 툴팁이 가운데 정렬(기본)이면 240px
              폭의 절반이 시트 밖으로 나가고, 좁은 화면에선 페이지에 가로 스크롤까지
              생긴다. 안쪽으로 열리게 방향을 고정한다. */}
          {noteHelp && (
            <span className="hz-tip hz-tip-wide hz-tip-end" data-tip={noteHelp} data-ga-tip={title} style={{ display: "inline-flex", cursor: "help" }}>
              <Icon name="help" style={{ fontSize: 12, color: C.hint }} />
            </span>
          )}
        </span>
      )}
    </div>
  );
}
