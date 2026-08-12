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
 * **알약 크기는 셋이 완전히 같고, 자리만 로고에 맞춘다**(Hun 결정, 2026-08-02).
 *
 * 맞추는 기준은 상자가 아니라 **글자**다 — 배지 '베' 의 ㅔ 가로선을 워드마크 'e' 의 위
 * 끝자락과 같은 높이에 둔다. 상자 윗선끼리 붙이면 로고가 작을수록 같은 배지가 로고를 더
 * 많이 덮어(30/26/23 에 배지 18 이면 60%/69%/78%) 위첨자가 아니라 로고에 걸터앉은 것처럼
 * 보인다. 눈이 읽는 건 상자가 아니라 글자의 높이다.
 *
 * lift 는 그 조건을 푼 것이다. 네 값 다 실측이고, 로고 크기에 비례하는 항은 워드마크 쪽
 * 둘뿐이라 식이 한 줄로 떨어진다.
 *   - 배지 상자 위 → 글자 베이스라인 = 11.5px (높이 18 · line-height 8 에서 나오는 고정값)
 *   - ㅔ 가로선    = 베이스라인 위 3.5px (8px pretendard 700, 글자 크기가 고정이라 상수)
 *   - 워드마크 상자 위 → 베이스라인 = 0.833em (Bricolage, line-height 1)
 *   - 'e' 잉크 꼭대기 = 베이스라인 위 0.539em (둥근 글자라 x-height 보다 살짝 넘친다)
 * 실측값은 30/26/23 에서 lift −0.8 / 0.4 / 1.2 다. 사이드바가 음수인 건 지금 그 자리가
 * 0.8px 만큼 위로 떠 있다는 뜻이라, 이 값이 들어가면 오히려 제자리로 내려온다.
 *
 * 높이를 글꼴에 맡기지 않고 못 박은 이유: 위아래 여백으로 만들면 line-height 가 섞여
 * 들어와 같은 값을 줘도 자리마다 몇 px 씩 달라지고, 그러면 위 11.5 가 흔들린다.
 *
 * 윗선 맞춤은 쓰는 쪽이 정한다 — 부모를 alignItems:flex-start 로 두거나(사이드바·탑바),
 * baseline 묶음 안에서는 alignSelf 로 빠져나온다(푸터). 그래서 여기서 정렬을 못 박지 않고
 * style 로 열어 둔다.
 */
const BETA_BADGE_HEIGHT = 18;
/** 배지 글자 크기. 서비스 전체의 글자 바닥은 11 이지만 **이 배지만 8 로 남긴다** —
    워드마크에 얹히는 상표 부속이지 읽는 글이 아니라, 키우면 로고가 배지에 눌린다.
    아래 두 값이 이 크기에 매여 있으니 셋을 따로 움직이지 말 것. */
const BETA_FONT = 8;
/** 배지 상자 위에서 글자 베이스라인까지(px).
    align-items:center + line-height 1 이면 글자 상자가 배지 가운데에 앉으므로
    (높이 − 글자크기)/2 만큼 내려간 자리에서 ascent 만큼 더 내려간 곳이 베이스라인이다.
    ascent 비율 0.8125 는 옛 값(높이 18 · 글자 8 · 베이스라인 11.5)에서 역산했다. */
const BADGE_BASELINE = (BETA_BADGE_HEIGHT - BETA_FONT) / 2 + 0.8125 * BETA_FONT;
/** ㅔ 가로선 중심이 베이스라인 위로 뜬 거리(px). 글자 크기에 비례한다(8px 일 때 3.5). */
const BAR_ABOVE_BASELINE = 3.5 * (BETA_FONT / 8);
/** 워드마크 상자 위에서 베이스라인까지(em). Bricolage + line-height 1 기준. */
const WORDMARK_BASELINE = 0.833;
/** 워드마크 'e' 잉크 꼭대기가 베이스라인 위로 뜬 거리(em). */
const WORDMARK_E_TOP = 0.539;

export function BetaBadge({ logoSize = 30, style }: { logoSize?: number; style?: React.CSSProperties }) {
  // ㅔ 가로선 = e 위 끝자락 이 되는 지점. 30/26/23 → -0.8 / 0.4 / 1.2
  const lift = BADGE_BASELINE - BAR_ABOVE_BASELINE - (WORDMARK_BASELINE - WORDMARK_E_TOP) * logoSize;
  return (
    <span
      style={{
        flexShrink: 0,
        display: "inline-flex",
        alignItems: "center",
        height: BETA_BADGE_HEIGHT,
        marginTop: -lift,
        padding: "0 8px",
        fontSize: BETA_FONT,
        fontWeight: 700,
        lineHeight: 1,
        /* ⚠️ 원색(--c-blue)이 아니라 잉크다. 원색은 흰 카드 위에서 고른 값이라 같은
           계열의 옅은 tint 위에서는 3.30(라이트)·3.59(다크)까지 떨어진다 — 8px 글자라
           더 아프다. 파란 tint 위 글자는 이 저장소가 --c-cold-ink 로 통일해 두었다
           (알약 Pill·.hz-more-btn·.mdd-period-btn 과 같은 값). 4.66/5.90 이 된다. */
        color: "var(--c-cold-ink)",
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
