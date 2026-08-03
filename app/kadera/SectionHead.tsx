import { C, Icon, R } from "../ui";

/**
 * 카더라 리포트 카드의 머리(아이콘 + 제목 + 우측 보조 + 설명).
 *
 * page.tsx 안에 있었는데, 트렌딩 메시지의 기간 탭이 이 머리의 우측에 들어가면서
 * 클라이언트 컴포넌트(TrendingTabs)도 같은 머리를 그려야 해서 파일로 분리했다.
 * "use client" 를 붙이지 않아 서버에서도 그대로 쓰이고, 서버 전용 의존이 없어
 * 클라이언트 번들에 들어가도 안전하다(색·아이콘은 ../ui 프리미티브뿐).
 *
 * 골격은 MDD 정밀분석의 CardHead 와 같다 — 제목·설명은 왼쪽 한 덩어리, 보조는
 * 오른쪽. 세로 정렬을 flex-start 로 두어 제목이 두 줄이 되어도 우측 알약이
 * 제목 첫 줄에 붙는다(center 면 아래로 흘러내렸다).
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
  const captions = (
    <>
      {/* 설명은 sub2, 그 아래 meta 는 한 톤 더 옅게. 시장 브리핑 카드의 부제와 같은 값이다
          (예전엔 sub 여서 제목만큼 진했고, 제목이 14.5 로 작아진 지금은 둘이 붙어 보인다). */}
      {desc && <p style={{ margin: "3px 0 0", fontSize: 12.5, lineHeight: 1.45, color: C.sub2, wordBreak: "keep-all" }}>{desc}</p>}
      {meta && <p style={{ margin: "4px 0 0", fontSize: 11.5, lineHeight: 1.5, color: C.muted }}>{meta}</p>}
    </>
  );

  return (
    // 아이콘은 제목 옆에 얹힌 맨글씨가 아니라 **타일**(40×40 둥근 사각) 안에 든다.
    // 시장 브리핑의 카드 머리(app/page.tsx 의 TitleRow)와 같은 골격이다 — 타일이
    // 생기면서 카드마다 시작점이 같아져 아홉 장이 한 격자로 읽힌다.
    <div style={{ marginBottom: 18, display: "flex", alignItems: "flex-start", gap: 12 }}>
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: R.icon,
          background: "var(--c-blue-tint)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon name={icon} style={{ fontSize: 21, color: C.blue }} />
      </div>
      {/* 제목·설명·우측 조작부는 전부 타일 **오른쪽 칸** 안에서 논다. 설명을 타일 밑까지
          내리면 제목과 왼쪽 끝이 어긋나 두 문단처럼 보인다.
          설명이 붙는 자리는 우측 내용에 따라 다르다.
          - note 알약(작다): 제목 줄 밖, 이 칸의 폭을 다 쓰는 자리. 제목과 같은 줄에 두면
            설명까지 알약 폭만큼 좁아져 ¼ 카드의 "최근 구독자가 많이 늘어난 채널"이 접혔다.
          - right 조작부(기간 탭, 크다): 제목과 같은 줄. 좁은 화면에서 탭이 아랫줄로
            내려가는데, 설명이 밖에 있으면 제목 → 탭 → 설명 순이 되어 설명이 뒤로 밀린다. */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* 줄바꿈은 우측이 조작부(right)일 때만 켠다. 기간 탭 3개는 230px 이나 되고 줄어들지도
            않아서, 좁은 카드에선 제목이 탭 뒤에 깔린다 — 이때만 탭을 아랫줄로 내린다.
            note 알약("6일"·"7일")은 폭이 작아 ¼ 카드에서도 제목과 같은 줄에 들어가므로
            줄바꿈을 막는다(허용하면 알약만 혼자 아랫줄로 떨어져 제목 옆이 허전해진다).
            alignItems:flex-start — 제목이 두 줄이 되어도 알약은 첫 줄에 붙는다. */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 10,
            flexWrap: right ? "wrap" : "nowrap",
          }}
        >
          <div style={{ flex: right ? "1 1 200px" : "0 1 auto", minWidth: 0 }}>
            {/* 40px 타일과 첫 줄 가운데를 맞추려고 minHeight 를 준다. 제목이 한 줄일 때
                타일이 제목보다 크므로, 안 주면 제목이 타일 위쪽에 붙어 보인다. */}
            <h3
              style={{
                margin: 0,
                fontSize: 14.5,
                fontWeight: 800,
                color: C.ink,
                letterSpacing: "-.01em",
                lineHeight: 1.25,
                wordBreak: "keep-all",
              }}
            >
              {title}
            </h3>
            {right && captions}
          </div>
          {right && <div style={{ flexShrink: 0, marginLeft: "auto" }}>{right}</div>}
          {/* 기간 표기는 알약으로. 회색 맨글씨로 두면 제목 오른쪽에 떠 있는 부스러기처럼
              보이는데, 테두리 없는 알약이면 "이 카드의 조건"이라는 한 덩어리로 읽힌다.
              크기·색은 시장 브리핑 카드의 배지(app/page.tsx 의 TitleRow)와 같은 값이다. */}
          {!right && note && (
            <span
              style={{
                flexShrink: 0,
                marginLeft: "auto",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 10.5,
                fontWeight: 700,
                color: C.muted,
                background: C.chip,
                padding: "3px 8px",
                borderRadius: R.pill,
                whiteSpace: "nowrap",
              }}
            >
              {note}
              {/* 이 알약은 늘 카드 오른쪽 끝에 붙는다 — 툴팁이 가운데 정렬(기본)이면 240px
                  폭의 절반이 카드 밖으로 나가고, 좁은 화면에선 페이지에 가로 스크롤까지
                  생긴다. 안쪽으로 열리게 방향을 고정한다. */}
              {noteHelp && (
                <span className="hz-tip hz-tip-wide hz-tip-end" data-tip={noteHelp} data-ga-tip={title} style={{ display: "inline-flex", cursor: "help" }}>
                  <Icon name="help" style={{ fontSize: 13, color: C.hint }} />
                </span>
              )}
            </span>
          )}
        </div>
        {!right && captions}
      </div>
    </div>
  );
}
