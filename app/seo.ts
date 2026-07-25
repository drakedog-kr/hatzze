import type { Metadata } from "next";

export const SITE_URL = "https://hatzze.fun";
export const SITE_NAME = "hatzze";

/**
 * 하위 페이지의 메타데이터를 만든다.
 *
 * Next.js는 세그먼트별 metadata를 "얕게" 병합하면서 중복 키를 통째로 교체한다.
 * 즉 page.tsx가 openGraph를 직접 선언하면 루트 레이아웃의 type·locale·siteName까지
 * 같이 날아간다. 반대로 선언을 안 하면 루트의 openGraph.title(홈 제목)이 그대로
 * 남아서, 카톡·X에 하위 페이지를 공유해도 홈 설명이 뜬다. 어느 쪽도 손으로 하면
 * 틀리기 쉬워서 공통 필드를 여기서 한 번에 채운다.
 *
 * og:image도 여기서 같이 넣어야 한다. app/opengraph-image.tsx(파일 컨벤션)가 자동으로
 * 채워주는 건 그 세그먼트가 openGraph를 직접 선언하지 않았을 때뿐이라, 아래에서 openGraph를
 * 선언하는 순간 이미지까지 통째로 날아간다(실제로 하위 페이지 미리보기가 이미지 없이
 * 떴었다). 해시 쿼리 없는 /opengraph-image 로도 같은 PNG가 200으로 응답하므로 그걸 쓴다.
 */
const OG_IMAGE = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: "hatzze | 데이터와 감성으로 읽는 시장",
};
export function pageMetadata({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  /** 사이트 루트 기준 경로. 예: "/kadera" */
  path: string;
}): Metadata {
  return {
    title,
    description,
    // 루트가 canonical "/"를 선언해 하위 페이지가 그대로 물려받는다. 그대로 두면
    // 이 페이지가 홈의 중복이라고 선언하는 셈이라 검색엔진이 색인하지 않는다.
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      locale: "ko_KR",
      url: `${SITE_URL}${path}`,
      siteName: SITE_NAME,
      title,
      description,
      images: [OG_IMAGE],
    },
    twitter: { card: "summary_large_image", title, description, images: [OG_IMAGE] },
  };
}
