import { SITE_NAME, SITE_URL } from "./brand";

/**
 * 화면별 구조화 데이터(JSON-LD).
 *
 * 루트 레이아웃(app/layout.tsx)이 **사이트 전체**를 말한다 — WebSite 와 Organization
 * 둘이다. 그런데 그 둘뿐이면 검색엔진 입장에서 이 사이트는 화면 하나짜리다. 실제로
 * 2026-09-01 서치콘솔에서 색인 43건 중 실제 화면은 여섯이었고, 각 화면이 무엇인지는
 * 어디에도 안 적혀 있었다. 여기서 **이 화면이 무엇인가**를 화면마다 말한다.
 *
 * ## 왜 BreadcrumbList 를 같이 내나
 *
 * 셋 중 검색 결과에 **실제로 그려지는 건 이것 하나**다. 구글이 결과 줄의 주소 자리를
 * `hatzze.fun › 내부자 리포트 › 미 하원의원이 사고판 것` 처럼 바꿔 준다. 나머지는
 * 이해를 돕는 값이지 화면에 뜨는 값이 아니다.
 *
 * ⚠️ **여기 적는 이름은 화면에 보이는 이름과 같아야 한다.** 구조화 데이터에만 있는
 *    이름을 지어 넣으면 구글 스팸 정책의 '보이지 않는 콘텐츠'에 걸린다. 그래서
 *    breadcrumb 의 name 은 사이드바 NAV·페이지 h1 과 같은 문자열을 그대로 받는다.
 *
 * ⚠️ 루트의 WebSite 를 여기서 다시 선언하지 않는다. `isPartOf` 로 그 `@id` 를 가리키기만
 *    한다 — 같은 것을 두 번 선언하면 어느 쪽이 참인지 모호해진다.
 */

export type Crumb = {
  /** 화면에 보이는 이름 그대로. */
  name: string;
  /** 사이트 루트 기준 경로. 예: "/insider" */
  path: string;
};

export function PageJsonLd({
  title,
  description,
  path,
  trail = [],
  /**
   * 이 화면이 어떤 종류인가.
   *  - `CollectionPage` 목록을 보여주는 화면(카더라·내부자·전체보기)
   *  - `WebPage`        그 밖(법률 문서·소식)
   * 도구 성격이 강한 MDD 도 CollectionPage 가 아니라 WebPage 로 둔다 — 목록이 아니라
   * 고른 종목 하나를 파고드는 화면이다.
   */
  kind = "WebPage",
}: {
  title: string;
  description: string;
  path: string;
  /** 홈과 이 화면 **사이**의 단계들. 홈과 자기 자신은 여기서 자동으로 붙는다. */
  trail?: Crumb[];
  kind?: "WebPage" | "CollectionPage";
}) {
  const crumbs: Crumb[] = [{ name: "홈", path: "/" }, ...trail, { name: title, path }];
  // 홈 자신처럼 단계가 하나뿐이면 BreadcrumbList 를 내지 않는다 — 구글이 무시하고,
  // 무시당할 값을 내는 것보다 없는 편이 읽기 쉽다.
  const hasTrail = crumbs.length > 1 && path !== "/";
  const graph = [
    {
      "@type": kind,
      "@id": `${SITE_URL}${path}#webpage`,
      url: `${SITE_URL}${path}`,
      name: title,
      description,
      inLanguage: "ko-KR",
      isPartOf: { "@id": `${SITE_URL}/#website` },
      publisher: { "@id": `${SITE_URL}/#organization` },
      ...(hasTrail ? { breadcrumb: { "@id": `${SITE_URL}${path}#breadcrumb` } } : {}),
    },
    ...(hasTrail
      ? [
          {
            "@type": "BreadcrumbList",
            "@id": `${SITE_URL}${path}#breadcrumb`,
            itemListElement: crumbs.map((c, i) => ({
              "@type": "ListItem",
              position: i + 1,
              name: c.name,
              item: `${SITE_URL}${c.path}`,
            })),
          },
        ]
      : []),
  ];

  return (
    <script
      type="application/ld+json"
      // 화면에 아무것도 그리지 않는다. JSON.stringify 가 값을 이스케이프하므로
      // 종목명·채널명에 따옴표가 섞여도 안전하다.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify({ "@context": "https://schema.org", "@graph": graph }),
      }}
    />
  );
}

/** 화면 제목에서 사이트 이름 꼬리를 뗀다. "국장 카더라 | hatzze" → "국장 카더라". */
export function bareTitle(title: string) {
  return title.replace(new RegExp(`\\s*\\|\\s*${SITE_NAME}\\s*$`), "");
}
