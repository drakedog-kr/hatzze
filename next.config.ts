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
    "/opengraph-image": [
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
};

export default nextConfig;
