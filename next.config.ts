import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 빌드 디렉터리를 환경변수로 가를 수 있게 한다. 기본값은 그대로 ".next" 라
  // Vercel·CI·`npm run dev`·`npm run build` 의 동작은 하나도 바뀌지 않는다.
  //
  // 이게 필요한 이유: 같은 폴더에서 next 프로세스를 둘 이상 돌리면 서로의 빌드
  // 디렉터리를 덮어써서 라우트 매니페스트가 날아간다. 그러면 API 는 200 으로
  // 멀쩡히 답하는데 페이지만 404 나 무한 대기가 된다(서버 문제로 오진하기 딱 좋다).
  // 포트를 달리 줘도 소용없다 — 충돌하는 건 포트가 아니라 이 디렉터리다.
  // 로컬 프로덕션 미리보기(`npm run build:local`)가 dev 서버를 죽이던 게 그 경우다.
  distDir: process.env.NEXT_DIST_DIR || ".next",

  // 이미지 최적화(`/_next/image`)는 쓰지 않는다 — next/image 를 한 곳도 안 쓴다(종목 로고는 /api/logo 가 크기를 맞춘다).
  // 그래도 경로는 기본으로 열려 있어, 16.3.3 에서야 고쳐진 AVIF 원격 코드 실행 권고(GHSA, 이미지 최적화 API)의
  // 공격면이 된다. 쓰지 않는 것은 닫는다(2026-09-26).
  images: { unoptimized: true },

  // 공유 카드(opengraph-image)가 런타임에 읽는 폰트를 프로덕션 번들에 확실히 싣는다 — 없으면 배포 환경에서
  // 폰트 로딩이 실패한다. 본문은 Pretendard(한글) 두 굵기, 워드마크는 브랜드 서체 Bricolage Grotesque.
  //
  // ⭐ 키는 **카드 전부**를 잡는 패턴이다(picomatch · Next 문서 output.md). 예전엔 홈·/kadera·/mdd 셋만 적혀 있어
  //    /kadera/us 와 요청 시 그리는 테마 42장이 빠져 있었다(2026-09-30 점검). 값은 카드가 실제로 읽는 세 파일뿐이다
  //    (app/og-fonts.ts) — 예전 glob `Pretendard-*.otf` 는 안 쓰는 일곱 굵기까지 약 14MB 를 실었다.
  //    둘이 어긋나지 않는지 tests/og-routes.test.ts 가 본다.
  outputFileTracingIncludes: Object.fromEntries(
    ["/opengraph-image", "/**/opengraph-image"].map((route) => [
      route,
      [
        "./node_modules/pretendard/dist/public/static/Pretendard-ExtraBold.otf",
        "./node_modules/pretendard/dist/public/static/Pretendard-Medium.otf",
        "./node_modules/@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-700-normal.woff",
      ],
    ]),
  ),

  // 카더라 리포트가 /telegram 으로 먼저 배포됐다(2026-07-20). /kadera 로 옮기면서
  // 옛 주소로 들어오는 방문자·검색엔진을 넘긴다. permanent=true 는 308(301과 동등하게
  // 취급되고 메서드를 보존한다)이라 검색엔진이 색인을 새 주소로 이관한다.
  // 주의: 308 은 브라우저가 영구 캐시하므로, 되돌리려면 이 항목을 지우는 것만으로는
  // 이미 방문한 사용자에게 즉시 반영되지 않는다.
  async redirects() {
    return [{ source: "/telegram", destination: "/kadera", permanent: true }];
  },

  /**
   * 공유 카드 이미지는 **가져가게 두되 색인에는 넣지 않는다.**
   *
   * 홈 카드 주소에는 카카오 캐시를 깨려고 `?v=<기준일>-<도수>` 가 붙는다(app/seo.ts).
   * 그래서 **날마다 새 URL 이 하나씩 생기고**, 크롤러는 그걸 매번 새 페이지로 보고
   * 가져간 뒤 "크롤링됨 - 색인이 생성되지 않음" 으로 쌓아 둔다. 2026-09-01 서치콘솔에
   * 그렇게 쌓인 게 77건이었다(71건은 채널 아바타, 6건이 이 카드들).
   *
   * robots.txt 로 막으면 간단하지만 **그러면 안 된다** — 카카오·페이스북·X 의 미리보기
   * 크롤러가 robots.txt 를 따르기 때문에, 막는 순간 공유 카드가 통째로 죽는다.
   * `X-Robots-Tag: noindex` 는 가져가는 것은 그대로 두고 색인만 뗀다.
   *
   * ⭐ 경로는 **패턴 하나**다(`:path*` 뒤에 opengraph-image — 홈의 `/opengraph-image` 도 잡는다). 예전엔 카드 열세 곳을
   *    손으로 적었고 "새 카드를 놓으면 여기 한 줄을 같이 넣을 것 — 안 넣어도 화면은 멀쩡해서 티가 안 난다"는 주석이
   *    지키는 전부였다. 사이트맵을 두 번 빠뜨린 것과 같은 자리라 패턴으로 바꾸고, 카드 파일마다 이 패턴에 걸리는지
   *    tests/og-routes.test.ts 가 Next 의 매처로 확인한다.
   */
  async headers() {
    const noindex = { key: "X-Robots-Tag", value: "noindex" };
    return [
      /**
       * 모든 응답에 붙는 보안 헤더. 2026-09-09 전수조사 때 프로덕션에 HSTS(Vercel 이
       * 준다) 말고는 하나도 없었다.
       *
       * 넷 다 **화면이 부르는 자원에는 손대지 않는** 것만 골랐다. script-src·img-src 같은
       * 자원 제한은 GA4·구글 폰트·인라인 스크립트를 하나하나 열어 줘야 해서
       * 빠뜨리면 화면이 조용히 깨진다. 그건 nonce 를 붙일 수 있을 때 따로 한다.
       *
       * - nosniff: 응답의 Content-Type 을 브라우저가 추측하지 않게 한다. API 셋
       *   (channel-photo·ticker·mdd)과 공유 카드는 전부 타입을 명시해 낸다(확인했다).
       * - frame-ancestors 'none' + X-Frame-Options DENY: 다른 사이트의 iframe 에 못 담는다
       *   (클릭재킹). 우리가 어디에 끼워 넣는 화면은 없다. 앱인토스 같은 입점은 정책상
       *   막혀 있어(2026-08-27 검토) 잃는 것도 없다. 옛 브라우저용으로 XFO 를 같이 둔다.
       * - object-src 'none' · base-uri 'self': 플러그인 임베드와 <base> 주입을 막는다.
       *   둘 다 이 화면이 쓰지 않는 것이다.
       * - Referrer-Policy: 밖으로 나가는 링크에 우리 주소의 경로를 안 흘린다. 브라우저
       *   기본값과 같지만, 명시해 두면 기본값이 바뀌어도 그대로다.
       * - Permissions-Policy: 카메라·마이크·위치·결제를 쓰지 않는다고 못박는다.
       */
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
        ],
      },
      /**
       * 본문 글꼴 조각(scripts/copy-pretendard.mjs 가 복사한 것). 경로에 버전이 들어 있어(`/fonts/pretendard-1.3.9/…`)
       * 파일이 바뀌면 주소가 바뀐다 — 그래서 1년 불변 캐시를 걸어도 된다. `public/` 의 기본값(max-age=0, 매번 확인)이면
       * 화면을 열 때마다 조각 스무 개 남짓을 서버에 다시 묻는다.
       */
      {
        source: "/fonts/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      { source: "/:path*/opengraph-image", headers: [noindex] },
    ];
  },
};

export default nextConfig;
