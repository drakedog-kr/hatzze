import type { Metadata } from "next";

import { getLatestDailyScore } from "@/lib/data";

import { SITE_NAME, SITE_URL, SLOGAN } from "./brand";
import { stageForScore } from "./ui";

// 정의는 app/brand.ts 에 있다. 여기서는 기존 import 경로를 지키려고 다시 내보내기만 한다.
export { SITE_NAME, SITE_URL };

type OgImage = { url: string; width: number; height: number; type: string; alt: string };

const OG_SIZE = { width: 1200, height: 630, type: "image/png" } as const;

/** 점수를 못 읽었을 때. 이때 이미지는 숫자 없는 고정 브랜드 카드로 폴백한다. */
const OG_FALLBACK = {
  url: "/opengraph-image",
  ...OG_SIZE,
  alt: `${SITE_NAME} | ${SLOGAN}`,
};

/**
 * og:image 로 쓸 이미지 서술자. **URL 에 날짜와 도수를 실어 매일 새 URL이 되게 한다.**
 *
 * 카카오톡은 og:image 를 URL 기준으로 자기 서버에 캐시한다. 이미지 내용만 매일
 * 바꾸고 URL 을 그대로 두면 카톡에서는 며칠 전 이미지가 계속 뜬다. 반대로 매번 다른
 * 값(타임스탬프 등)을 넣으면 바뀐 게 없어도 재수집을 부르므로, **이미지에 실제로
 * 찍히는 값(기준일·정수 도수)만** 키로 쓴다. 구간 라벨은 도수에서 나오므로 따로 안 넣는다.
 *
 * 쿼리는 캐시 키일 뿐이라 이미지 라우트는 이 값을 읽지 않는다(항상 최신을 그린다).
 * 조회가 실패하면 버전 없는 URL 로 두는데, 그 URL 이 그리는 폴백 카드는 날마다
 * 같은 그림이라 버전을 붙일 것도 없다.
 */
async function ogImage(): Promise<OgImage> {
  try {
    const latest = await getLatestDailyScore();
    if (!latest) return OG_FALLBACK;
    const deg = Math.round(latest.score);
    return {
      url: `/opengraph-image?v=${latest.date}-${deg}`,
      ...OG_SIZE,
      alt: `hatzze 오늘의 코스피 과열도 ${deg}℃ · ${stageForScore(latest.score)} 구간`,
    };
  } catch {
    return OG_FALLBACK;
  }
}

/**
 * 홈·하위 페이지가 공유하는 메타데이터를 만든다.
 *
 * Next.js는 세그먼트별 metadata를 "얕게" 병합하면서 중복 키를 통째로 교체한다.
 * 즉 page.tsx가 openGraph를 직접 선언하면 루트 레이아웃의 type·locale·siteName까지
 * 같이 날아간다. 반대로 선언을 안 하면 루트의 openGraph.title(홈 제목)이 그대로
 * 남아서, 카톡·X에 하위 페이지를 공유해도 홈 설명이 뜬다. 어느 쪽도 손으로 하면
 * 틀리기 쉬워서 공통 필드를 여기서 한 번에 채운다.
 *
 * ## og:image 를 넣는 자리
 * 아래에서 openGraph 를 선언하는 순간 물려받은 이미지가 통째로 날아간다(실제로 하위
 * 페이지 미리보기가 이미지 없이 떴었다). 그래서 이미지도 여기서 같이 정한다.
 *
 * 페이지마다 써야 할 카드가 다른데, 파일 컨벤션은 **여기에 전혀 끼어들지 못한다.**
 * 하위 세그먼트에서 실측한 결과는 이렇다.
 *  - images 를 선언하면 → 그게 이긴다(자기 폴더의 opengraph-image.tsx 는 무시된다).
 *  - images 를 비우면 → 컨벤션이 채워 주지 **않는다**. og:image 가 통째로 사라진다.
 * 즉 어느 쪽이든 URL 을 손으로 가리켜야 한다. 다행히 컨벤션 파일이 만든 경로는
 * 해시 쿼리 없이도 같은 PNG 를 200 으로 주므로 그 경로를 그대로 쓴다.
 * (루트는 규칙이 또 반대라, 컨벤션이 layout 의 images 를 도로 덮어썼다. 그래서 홈
 *  카드만 컨벤션을 못 쓰고 라우트 핸들러로 뺐다 — app/opengraph-image/route.tsx 주석 참고.)
 *
 * 그래서 `ownImage` 를 주면 그 페이지의 `{path}/opengraph-image` 를, 안 주면
 * 홈의 과열도 카드를(사이트 대표 카드라 /privacy 같은 페이지에 무난하다) 가리킨다.
 *
 * 데이터를 읽어야 해서 async 다. 호출부는 `export const metadata` 가 아니라
 * `generateMetadata` 여야 요청마다(=날짜가 바뀌면) 새 URL 이 나간다.
 */
export async function pageMetadata({
  title,
  description,
  path,
  ownImage,
}: {
  title: string;
  description: string;
  /** 사이트 루트 기준 경로. 예: "/kadera" */
  path: string;
  /**
   * 이 폴더에 opengraph-image.tsx 가 있을 때, 그 카드의 alt(=og-copy.ts 의 alt).
   * URL 은 path 에서 만들어지므로 따로 안 받는다.
   */
  ownImage?: string;
}): Promise<Metadata> {
  const images = [
    ownImage ? { url: `${path}/opengraph-image`, ...OG_SIZE, alt: ownImage } : await ogImage(),
  ];
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
      images,
    },
    twitter: { card: "summary_large_image", title, description, images },
  };
}
