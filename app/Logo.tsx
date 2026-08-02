// HATZZE 로고 — 소문자 워드마크(hatzze) + 유령 심볼 + 가로 lockup.
//
// 워드마크: Bricolage Grotesque 700, tracking -0.035em. 색은 테마 인식
//   var(--c-logo-ink)(라이트=잉크 / 다크=흰색). 폰트는 layout.tsx의 Google
//   Fonts CDN 링크로 로드한다.
// 심볼: 브랜드 유령. 원본 SVG는 #0064ff 고정이지만, 앱 전반의 블루와 함께
//   다크모드에서 밝아지도록 몸통/눈동자를 var(--c-blue)로 참조한다(눈은 흰색).

const FONT = "'Bricolage Grotesque', sans-serif";

export function Wordmark({
  size = 30,
  color = "var(--c-logo-ink)",
}: {
  size?: number;
  color?: string;
}) {
  return (
    <span
      style={{
        fontFamily: FONT,
        fontWeight: 700,
        fontSize: size,
        letterSpacing: "-0.035em",
        lineHeight: 1,
        color,
        display: "inline-block",
      }}
    >
      hatzze
    </span>
  );
}

// 브랜드 유령 심볼. size는 높이(px), 폭은 viewBox 비율(100/104)로 따라간다.
export function GhostSymbol({
  size = 30,
  color = "var(--c-blue)",
}: {
  size?: number;
  color?: string;
}) {
  return (
    <svg
      width={size * (100 / 104)}
      height={size}
      viewBox="0 0 100 104"
      fill="none"
      role="img"
      aria-label="hatzze"
      style={{ display: "block", flexShrink: 0 }}
    >
      <path
        d="M12,84 C6,42 22,8 50,8 C78,8 94,42 88,84 C86,95 80,95 77,87 C74,80 67,80 64,88 C61,96 54,96 51,88 C48,80 41,80 38,88 C35,96 28,96 25,87 C22,80 15,93 12,84 Z"
        fill={color}
      />
      <ellipse cx="39" cy="50" rx="9.5" ry="12" fill="#fff" />
      <circle cx="66" cy="52" r="7" fill="#fff" />
      <circle cx="42" cy="45" r="3" fill={color} />
    </svg>
  );
}

/**
 * 베타 배지 — 로고 우측 상단에 위첨자처럼 붙는다.
 *
 * 서비스 **전체**가 베타라는 표시라서, 페이지마다 다는 게 아니라 브랜드가 나오는
 * 자리마다 붙인다(사이드바 · 모바일 탑바 · 푸터 셋).
 *
 * **알약 크기는 셋이 완전히 같고, 자리만 로고에 맞춰 올린다**(Hun 결정, 2026-08-02).
 *
 * 그냥 윗선에 붙이면 로고가 작을수록 같은 배지가 로고를 더 많이 덮는다 — 로고 30/26/23
 * 에 배지 18 이면 60%/69%/**78%** 다. 78% 는 로고 밑선까지 5px 밖에 안 남아 위첨자가
 * 아니라 로고에 걸터앉은 것처럼 보인다(모바일에서 "내려앉았다"는 지적이 실제로 나왔다).
 * 눈이 보는 건 배지의 절대 크기가 아니라 **로고와의 관계**다.
 *
 * 그래서 로고 아래로 남는 여백이 로고 높이의 40% 가 되도록 끌어올린다. 기준이 사이드바
 * (18/30 = 60%)라 거기서는 lift 가 0 이고, 작은 로고일수록 배지가 로고 윗선 밖으로 솟는다.
 * 크기를 줄여 맞추는 길도 있었지만 그러면 알약이 자리마다 달라진다 — 그건 "같은 배지"가
 * 아니다.
 *
 * 높이를 글꼴에 맡기지 않고 못 박은 이유: 위아래 여백으로 만들면 line-height 가 섞여
 * 들어와 같은 값을 줘도 자리마다 몇 px 씩 달라지고, 그러면 lift 계산의 기준이 흔들린다.
 *
 * 윗선 맞춤은 쓰는 쪽이 정한다 — 부모를 alignItems:flex-start 로 두거나(사이드바·탑바),
 * baseline 묶음 안에서는 alignSelf 로 빠져나온다(푸터). 그래서 여기서 정렬을 못 박지 않고
 * style 로 열어 둔다.
 */
const BETA_BADGE_HEIGHT = 18;

export function BetaBadge({ logoSize = 30, style }: { logoSize?: number; style?: React.CSSProperties }) {
  const lift = Math.round(BETA_BADGE_HEIGHT - logoSize * 0.6); // 30→0 · 26→2 · 23→4
  return (
    <span
      style={{
        flexShrink: 0,
        display: "inline-flex",
        alignItems: "center",
        height: BETA_BADGE_HEIGHT,
        marginTop: -lift,
        padding: "0 8px",
        fontSize: 8,
        fontWeight: 700,
        lineHeight: 1,
        color: "var(--c-blue)",
        background: "var(--c-blue-tint)",
        borderRadius: 999,
        ...style,
      }}
    >
      베타
    </span>
  );
}

// 가로 lockup(심볼 + 워드마크) — 사이드바/헤더용.
export function LogoLockup({
  symbolSize = 30,
  wordmarkSize = 32,
  gap = 11,
}: {
  symbolSize?: number;
  wordmarkSize?: number;
  gap?: number;
}) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap }}>
      <GhostSymbol size={symbolSize} />
      <Wordmark size={wordmarkSize} />
    </span>
  );
}
