import { C, Icon, R } from "../ui";

/** 시트 제목의 생김새. h2·h3 가 이 하나를 나눠 쓴다(태그만 갈리고 화면은 같다). */
const HEAD_STYLE = { margin: 0, fontSize: 14, fontWeight: 700, color: C.ink, letterSpacing: "-.01em", wordBreak: "keep-all" } as const;

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
 *      ↳ 2026-08-04 되돌렸다(제목 14/700, 설명 12.5). 위계를 크기로만 만들려다 큰
 *        화면에서 안 읽히는 지경까지 내려갔다. 위계는 굵기·색이 지고, 크기는
 *        읽히는 바닥 위에 둔다(globals.css 의 '읽히는 잉크 램프' 주석 참고).
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
  level = 3,
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
  /**
   * 이 머리가 문서에서 몇 층인가. **생김새는 하나도 안 바뀐다** — 태그만 바뀐다.
   *
   * 기본값이 3 인 이유: 내부자 리포트와 홈은 시트 위에 구간 제목(h2)이 한 겹 더 있어서
   * 시트가 h3 인 게 맞다(app/insider/parts.tsx 의 GroupTitle 주석 참고). 거기가 다수라
   * 기본을 그쪽에 맞추고, **구간 제목이 없는 화면만 `level={2}` 를 준다.**
   *
   * 왜 손대나: `/kadera` 서버 HTML 에 h1 하나와 h3 일곱 개가 있고 h2 가 한 개도 없었다
   * (2026-09-01 실측). 한 층을 건너뛴 문서가 된다.
   */
  level?: 2 | 3;
}) {
  return (
    /* ⚠️⚠️ **좁은 화면에서는 줄바꿈이 켜져야 한다**(globals.css 의 ≤560 규칙). 알약은
       flexShrink:0 · whiteSpace:nowrap 이라 절대 안 줄어들어서, 자리가 모자라면 **줄어들
       수 있는 쪽인 글 칸이 혼자 다 내준다.** 375px 전체보기에서 머리 331 중 알약이 190 을
       먹고 글 칸에 71px 만 남아 제목 두 줄·설명 다섯 줄이 됐고, 320px 에서는 서학개미
       머리까지 같은 꼴이 됐다(2026-08-25 실측). 넘치는 게 아니라 **눌리는** 것이라
       가로 스크롤 검사에는 0건으로 잡힌다.
       ⚠️ 여기서 nowrap 을 인라인으로 도로 박지 말 것 — 인라인은 미디어쿼리를 이긴다. */
    <div className="hz-sheet-head" style={right ? { flexWrap: "wrap" } : undefined}>
      {/* marginTop:1 — 18px 아이콘의 광학 중심을 13px 제목 첫 줄에 맞춘다. */}
      <Icon name={icon} style={{ fontSize: 18, color: C.muted, marginTop: 1, flexShrink: 0 }} />
      {/* ⚠️ flex 를 인라인으로 두지 말 것. 좁은 화면에서 basis 를 줘야(≤560 에서 150px)
          "그 아래로 눌리느니 알약을 아랫줄로 내린다"가 성립하는데, 인라인이면 그 규칙이
          안 먹는다. basis 0(`flex:1`)이면 글 칸이 끝없이 눌린다. */}
      <div className={`hz-sheet-head-txt${right ? " hz-sheet-head-txt-wide" : ""}`}>
        {/* 800 → 700. 13px 에 800 은 획이 붙어 도리어 흐릿해 보였다. 크기를 올리고
            굵기를 한 단 내린다 — 커진 만큼 무게는 이미 붙는다. */}
        {/* 태그만 갈린다. style 은 둘이 같은 것을 쓰므로 화면은 픽셀 하나 안 바뀐다. */}
        {level === 2 ? (
          <h2 style={HEAD_STYLE}>{title}</h2>
        ) : (
          <h3 style={HEAD_STYLE}>{title}</h3>
        )}
        {/* 설명은 이 페이지에서 가장 자주 읽히는 작은 글씨다(시트마다 한 줄).
            11.5/sub2(명암비 2.7)로는 큰 화면에서 안 읽혔다. */}
        {desc && <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: C.sub, wordBreak: "keep-all" }}>{desc}</p>}
        {meta && <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.5, color: C.sub2 }}>{meta}</p>}
      </div>
      {right && <div className="hz-sheet-head-side" style={{ flexShrink: 0, marginLeft: "auto" }}>{right}</div>}
      {/* 기간 표기는 알약으로. 회색 맨글씨로 두면 제목 오른쪽에 떠 있는 부스러기처럼
          보이는데, 테두리 없는 알약이면 "이 시트의 조건"이라는 한 덩어리로 읽힌다. */}
      {!right && note && (
        <span
          className="hz-sheet-head-side"
          style={{
            flexShrink: 0,
            // 아랫줄로 내려간 경우 오른쪽 끝에 붙는다. 같은 줄일 때는 앞 칸이 이미
            // 자라 있어 아무 영향이 없다(right 가지가 쓰는 규칙과 같다).
            marginLeft: "auto",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 11,
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
              {/* ⚠️ `C.hint`(#c7d5e3) 였다. 그 토큰은 **점선·비활성 아이콘**용이라 흰 카드
                  위 명암비가 1.49 다 — 그림에 요구되는 3:1 에도 한참 못 미친다. 누를 수
                  있는 표시가 안 보이면 툴팁이 있다는 걸 알 길이 없다. muted 는 4.79.
                  ⚠️ 이 머리는 다섯 화면이 함께 쓴다. 여기 물음표가 뜨는 모든 카드가 같이
                  진해진다(서학개미 장부에서 재다 찾았지만 고장은 공용이었다). */}
              <Icon name="help" label="설명" style={{ fontSize: 12, color: C.muted }} />
            </span>
          )}
        </span>
      )}
    </div>
  );
}
