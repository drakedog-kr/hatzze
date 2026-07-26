import type { MetadataRoute } from "next";

const SITE_URL = "https://hatzze.fun";

// /sitemap.xml 자동 생성 — 공개 라우트 목록. 지표는 매일 갱신되므로 changeFrequency=daily.
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: SITE_URL, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/kadera`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/mdd`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    // 법정 고지라 내용이 거의 안 바뀐다. 지표 페이지와 같은 daily 로 두면 크롤러가
    // 매일 헛걸음하므로 yearly·낮은 우선순위로 둔다.
    { url: `${SITE_URL}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];
}
