import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // OG 이미지(app/opengraph-image.tsx)가 런타임에 읽는 Pretendard OTF를 프로덕션
  // 번들에 확실히 포함시킨다 — 없으면 배포 환경에서 폰트 로딩이 실패할 수 있다.
  outputFileTracingIncludes: {
    "/opengraph-image": ["./node_modules/pretendard/dist/public/static/Pretendard-*.otf"],
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
