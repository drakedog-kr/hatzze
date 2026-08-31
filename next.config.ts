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

  // OG 이미지(app/opengraph-image/route.tsx)가 런타임에 읽는 폰트를 프로덕션 번들에
  // 확실히 포함시킨다 — 없으면 배포 환경에서 폰트 로딩이 실패할 수 있다.
  // 본문·설명은 Pretendard(한글), 워드마크는 브랜드 서체 Bricolage Grotesque.
  outputFileTracingIncludes: {
    // 홈은 매 요청 그리는 라우트라 런타임에 폰트를 읽는다. /kadera·/mdd 카드는 빌드
    // 시점에 굳지만, Next 가 요청 시 렌더로 돌려도 죽지 않도록 같이 넣어 둔다.
    "/opengraph-image": [
      "./node_modules/pretendard/dist/public/static/Pretendard-*.otf",
      "./node_modules/@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-700-normal.woff",
    ],
    "/kadera/opengraph-image": [
      "./node_modules/pretendard/dist/public/static/Pretendard-*.otf",
      "./node_modules/@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-700-normal.woff",
    ],
    "/mdd/opengraph-image": [
      "./node_modules/pretendard/dist/public/static/Pretendard-*.otf",
      "./node_modules/@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-700-normal.woff",
    ],
  },

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
   * ⚠️ 경로를 손으로 적는다. 새 화면에 `opengraph-image.tsx` 를 놓으면 여기 한 줄을
   *    같이 넣을 것 — 안 넣어도 화면은 멀쩡해서 티가 안 난다.
   */
  async headers() {
    const noindex = { key: "X-Robots-Tag", value: "noindex" };
    return [
      "/opengraph-image",
      "/kadera/opengraph-image",
      "/kadera/us/opengraph-image",
      "/mdd/opengraph-image",
      "/seohak/opengraph-image",
    ].map((source) => ({ source, headers: [noindex] }));
  },
};

export default nextConfig;
