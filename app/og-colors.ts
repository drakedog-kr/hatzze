/**
 * 공유 카드(OG)가 쓰는 색. Satori 는 CSS 변수를 못 읽어서 app/styles/theme.css 의 **라이트** 토큰 값을 여기 적는다.
 *
 * ⚠️ 손으로 베낀 값이라 팔레트를 바꾸면 조용히 뒤처진다. 실제로 두 번 그랬다 — 2026-08 콘솔 리디자인 뒤 넉 달치가
 *    옛 값으로 남았고, 홈 카드는 걷어 낸 4색(파랑·초록·주황·빨강) 게이지를 2026-09-30 까지 그렸다. 그래서 이 값들을
 *    tests/og-colors.test.ts 가 theme.css 와 맞춰 본다. 값마다 붙은 `--c-…` 주석이 그 대조표다.
 *
 * TSX(og-card.tsx)와 떼어 둔 까닭은 테스트가 JSX 없이 부를 수 있게 하려는 것뿐이다. 카드 파일들은 og-card.tsx 에서 가져온다.
 */

export const INK = "#333840"; // --c-ink
export const SUB = "#6a707a"; // --c-sub
export const CARD_BG = "#ffffff"; // --c-card
export const TRACK = "#ebedf1"; // --c-track
export const BLUE = "#3182f6"; // --c-blue
export const COLD = "#2371b2"; // --c-cold

/** 테마 지도(Treemap)의 칸 색 — 늘어남은 따뜻한 색, 줄어듦은 파랑, 그대로는 칩 회색(kadera.css .hz-tm-tile). */
export const WARM_2 = "#ef8f9a"; // --c-warm-2
export const BLUE_2 = "#3d9cf5"; // --c-blue-2
export const CHIP = "#eef0f3"; // --c-chip

/**
 * 과열도 네 구간. 화면(홈 히어로)과 같은 **50 경계 2색 체계**다 — 색은 차갑다·뜨겁다만 말하고, 네 구간의 구분은
 * 밴드의 명도가 진다(theme.css 의 온도 스케일 주석). 고온·초고온 잉크가 같은 것도 화면과 같다.
 *
 *   ink   큰 숫자·알약 글자(흰 카드 위 4.5:1 이상)
 *   tint  알약 바탕
 *   band  4칸 막대의 한 칸(히어로의 HERO_STRIP)
 */
export const OG_STAGES = [
  { label: "저온", ink: "#2371b2" /* --c-cold */, tint: "#e8f3fe" /* --c-cold-tint */, band: "#dbe9f7" /* --c-band-cold */ },
  { label: "상온", ink: "#1a72bd" /* --c-neutral */, tint: "#e7f1fb" /* --c-neutral-tint */, band: "#3d9cf5" /* --c-band-neutral */ },
  { label: "고온", ink: "#cd3945" /* --c-hot */, tint: "#fdecee" /* --c-hot-tint */, band: "#f7bcc2" /* --c-band-hot */ },
  { label: "초고온", ink: "#cd3945" /* --c-mania */, tint: "#fdecee" /* --c-mania-tint */, band: "#ef8f9a" /* --c-band-mania */ },
] as const;
