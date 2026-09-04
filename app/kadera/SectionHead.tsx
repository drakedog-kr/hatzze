import { C, Icon, R } from "../ui";

/**
 * 시트의 머리(아이콘 + 제목 + 우측 보조 + 설명). **여섯 화면이 함께 쓴다** —
 * 시장 브리핑·국장/미장 카더라·내부자·MDD·서학개미·종목·미리보기.
 *
 * ⭐ **마크업은 한 벌이고 생김새는 스코프가 정한다**(2026-09-04). 예전엔 `bold` 프롭으로
 *   마크업을 갈랐는데, 그러면 화면을 새 결로 옮길 때마다 호출부를 하나씩 손대야 했다.
 *   지금은 페이지 뿌리에 `hz-tx` 한 줄을 붙이면 그 화면의 모든 시트 머리가 같이 바뀐다
 *   (아이콘이 40px 하늘색 타일이 되고 제목이 17/800 이 된다 — globals.css).
 *   토스의 '곱하기 방식'이다: 옵션을 늘리지 말고 축을 나눠 조합한다.
 *
 * ⚠️ 그래서 **크기·색을 인라인 style 로 되돌리지 말 것.** 인라인은 스코프 규칙을 이겨서
 *   그 자리만 옛 모습으로 남는다(이 저장소가 :hover·미디어쿼리에서 여러 번 밟은 함정).
 *
 * 2026-08 콘솔 리디자인의 결정 셋은 그대로다: 아이콘은 타일이 아니라 맨 글리프(기본),
 * 제목은 구간 이름이라 셀 제목보다 작고, 머리 아래는 헤어라인으로 갈린다.
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
   * 기본값이 3 인 이유: 시트 위에 구간 제목(h2)이 한 겹 더 있는 화면이 다수다.
   * **구간 제목이 없는 화면만 `level={2}` 를 준다.**
   */
  level?: 2 | 3;
}) {
  return (
    /* ⚠️⚠️ **좁은 화면에서는 줄바꿈이 켜져야 한다**(globals.css 의 ≤560 규칙). 알약은
       flexShrink:0 · whiteSpace:nowrap 이라 절대 안 줄어들어서, 자리가 모자라면 **줄어들
       수 있는 쪽인 글 칸이 혼자 다 내준다.** 375px 전체보기에서 머리 331 중 알약이 190 을
       먹고 글 칸에 71px 만 남아 제목 두 줄·설명 다섯 줄이 됐다(2026-08-25 실측).
       넘치는 게 아니라 **눌리는** 것이라 가로 스크롤 검사에는 0건으로 잡힌다.
       ⚠️ 여기서 nowrap 을 인라인으로 도로 박지 말 것 — 인라인은 미디어쿼리를 이긴다. */
    <div className="hz-sheet-head" style={right ? { flexWrap: "wrap" } : undefined}>
      {/* 아이콘 상자. 기본은 맨 글리프고 `.hz-tx` 아래에서만 하늘색 타일이 된다. */}
      <span className="hz-sheet-head-ico">
        <Icon name={icon} />
      </span>
      {/* ⚠️ flex 를 인라인으로 두지 말 것. 좁은 화면에서 basis 를 줘야(≤560 에서 150px)
          "그 아래로 눌리느니 알약을 아랫줄로 내린다"가 성립하는데, 인라인이면 그 규칙이
          안 먹는다. basis 0(`flex:1`)이면 글 칸이 끝없이 눌린다. */}
      <div className={`hz-sheet-head-txt${right ? " hz-sheet-head-txt-wide" : ""}`}>
        {/* 태그만 갈린다. 생김새는 클래스가 쥐고 있으므로 화면은 픽셀 하나 안 바뀐다. */}
        {level === 2 ? (
          <h2 className="hz-sheet-head-title">{title}</h2>
        ) : (
          <h3 className="hz-sheet-head-title">{title}</h3>
        )}
        {/* 설명은 이 페이지에서 가장 자주 읽히는 작은 글씨다(시트마다 한 줄).
            11.5/sub2(명암비 2.7)로는 큰 화면에서 안 읽혔다. */}
        {desc && <p className="hz-sheet-head-desc">{desc}</p>}
        {meta && <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.5, color: C.sub2 }}>{meta}</p>}
      </div>
      {right && <div className="hz-sheet-head-side" style={{ flexShrink: 0, marginLeft: "auto" }}>{right}</div>}
      {/* 기간 표기는 알약으로. 회색 맨글씨로 두면 제목 오른쪽에 떠 있는 부스러기처럼
          보이는데, 테두리 없는 알약이면 "이 시트의 조건"이라는 한 덩어리로 읽힌다.
          바탕·테두리는 클래스(.hz-sheet-head-note)가 쥔다 — 스코프마다 앉는 면이 달라서다
          (기본은 회색 띠 위라 카드색, 이번 리디자인에선 흰 바탕이라 회색 칩). */}
      {!right && note && (
        <span
          className="hz-sheet-head-side hz-sheet-head-note"
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
                  있는 표시가 안 보이면 툴팁이 있다는 걸 알 길이 없다. muted 는 4.79. */}
              <Icon name="help" style={{ fontSize: 12, color: C.muted }} />
            </span>
          )}
        </span>
      )}
    </div>
  );
}
