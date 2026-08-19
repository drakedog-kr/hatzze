import type { MetadataRoute } from "next";

const SITE_URL = "https://hatzze.fun";

// /sitemap.xml 자동 생성 — 공개 라우트 목록. 지표는 매일 갱신되므로 changeFrequency=daily.
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: SITE_URL, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/kadera`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/kadera/us`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/mdd`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    // ⚠️ 이 줄이 없어서 색인이 안 됐다. 화면을 새로 만들 때 **사이트맵과 공유 카드**를
    // 같이 챙길 것 — 둘 다 화면 안에서는 안 보여서 빠뜨려도 티가 안 난다.
    { url: `${SITE_URL}/seohak`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    // 법정 고지라 내용이 거의 안 바뀐다. 지표 페이지와 같은 daily 로 두면 크롤러가
    // 매일 헛걸음하므로 yearly·낮은 우선순위로 둔다.
    { url: `${SITE_URL}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    // 버전을 올릴 때만 바뀐다. 법정 고지보다는 자주, 지표 화면보다는 훨씬 드물다.
    { url: `${SITE_URL}/changelog`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
  ];
}
