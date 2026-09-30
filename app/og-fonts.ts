/**
 * 공유 카드가 런타임에 읽는 폰트 파일(프로젝트 루트 기준). app/og-card.tsx 의 loadOgFonts 가 읽고, next.config.ts 의
 * outputFileTracingIncludes 가 **이 셋만** 배포 번들에 싣는다. 둘이 어긋나면 배포에서만 카드가 죽으므로
 * tests/og-routes.test.ts 가 맞춰 본다. 굵기를 더하면 여기와 next.config.ts 를 같이 고친다.
 *
 * TSX(og-card.tsx)와 떼어 둔 까닭은 테스트가 JSX 없이 부를 수 있게 하려는 것뿐이다.
 */
const PRETENDARD = "node_modules/pretendard/dist/public/static";

export const OG_FONT_FILES = {
  extraBold: `${PRETENDARD}/Pretendard-ExtraBold.otf`,
  medium: `${PRETENDARD}/Pretendard-Medium.otf`,
  // 워드마크는 본문과 서체가 다르다(app/Logo.tsx 의 브랜드 규격 Bricolage Grotesque 700).
  wordmark: "node_modules/@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-700-normal.woff",
} as const;
