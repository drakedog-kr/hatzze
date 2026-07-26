import type { Metadata } from "next";
import localFont from "next/font/local";
import { cookies } from "next/headers";
import { GoogleAnalytics } from "@next/third-parties/google";
import "./globals.css";
import AppShell from "./AppShell";
import { SITE_NAME, SITE_URL, pageMetadata } from "./seo";
import { getLatestDailyScore } from "@/lib/data";
import type { DailyScore } from "@/lib/data";

const pretendard = localFont({
  src: "../node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2",
  variable: "--font-pretendard",
  display: "swap",
  weight: "45 920",
});

// 서치콘솔·서치어드바이저 소유확인 토큰. 값이 없으면 메타 태그 자체를 만들지 않는다
// (content가 빈 태그는 두 콘솔 모두 '소유확인 실패'로 처리한다).
const GOOGLE_VERIFICATION = process.env.GOOGLE_SITE_VERIFICATION;
const NAVER_VERIFICATION = process.env.NAVER_SITE_VERIFICATION;

// GA4 측정 ID. 값이 없으면 스크립트 자체를 넣지 않는다 — 로컬·프리뷰에서 찍힌
// 방문이 프로덕션 통계에 섞이는 걸 막는다(검증할 때만 .env.local 에서 켠다).
// NEXT_PUBLIC_ 은 빌드 시점에 인라인되므로 Vercel 에 넣은 뒤 재배포해야 반영된다.
const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

const TITLE = "hatzze | 데이터와 감성으로 읽는 시장";
const DESCRIPTION =
  "오늘 코스피는 얼마나 뜨겁습니까. 버핏지수·VKOSPI·레버리지 등 25개 지표를 매일 하나의 과열도 점수로 환산합니다.";

// 홈도 하위 페이지와 같은 pageMetadata()를 쓴다 — og:image URL 에 오늘 날짜·도수가
// 실려 있어(카톡 캐시를 깨려고) 여기만 손으로 적어 두면 홈과 /kadera·/mdd 가 서로 다른
// 이미지를 가리키게 된다. 여기서는 홈에만 있는 것(metadataBase·키워드·소유확인)만 얹는다.
//
// `export const metadata` 가 아니라 generateMetadata 인 이유: 상수는 모듈이 로드될 때
// 한 번만 계산돼서 서버가 살아 있는 동안 어제 날짜의 URL 을 계속 내보낸다.
export async function generateMetadata(): Promise<Metadata> {
  return {
    ...(await pageMetadata({ title: TITLE, description: DESCRIPTION, path: "/" })),
    metadataBase: new URL(SITE_URL),
    keywords: ["코스피 과열도", "시장 과열도", "버핏지수", "VKOSPI", "공포탐욕지수", "증시 심리", "코스피 지표", "hatzze", "햇쩨"],
    verification: {
      ...(GOOGLE_VERIFICATION ? { google: GOOGLE_VERIFICATION } : {}),
      ...(NAVER_VERIFICATION
        ? { other: { "naver-site-verification": NAVER_VERIFICATION } }
        : {}),
    },
  };
}

// 사이드바/탑바는 모든 페이지가 공유하므로 레이아웃에서 점수를 받아 셸에 넘긴다.
// env가 없는 빌드 환경에서도 죽지 않도록 실패 시 null로 둔다(탑바가 —로 표시).
export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  let dailyScore: DailyScore | null = null;
  try {
    dailyScore = await getLatestDailyScore();
  } catch {
    dailyScore = null;
  }

  // 테마는 쿠키로 관리한다 — 서버가 여기서 읽어 <html data-theme>를 SSR하면
  // 클라이언트와 값이 일치해 hydration 불일치도, 첫 페인트 깜빡임도 없다.
  //
  // 기본값은 다크다(2026-07-27 전환). 쿠키가 없으면 다크로 열리고, 라이트는 이용자가
  // 토글을 눌러 쿠키를 남긴 경우에만 나온다. 지표 수치와 인포그래픽이 어두운 바탕에서
  // 더 또렷하게 읽힌다는 판단이다.
  //
  // 이 한 줄이 기본 테마의 유일한 정의다 — 셸의 토글도 여기서 내려준 값을 초기값으로
  // 받으므로, 기본값을 되돌리려면 비교 대상을 "light" 에서 "dark" 로 뒤집으면 된다.
  // 다만 globals.css 의 color-scheme 과 아래 theme-color 메타는 이 값을 따라가야 한다.
  const theme = (await cookies()).get("hz-theme")?.value === "light" ? "light" : "dark";

  return (
    <html lang="ko" data-theme={theme} className={`${pretendard.variable} h-full antialiased`}>
      <head>
        {/* 모바일 브라우저의 주소창·상태바 색. 기본이 다크가 되면서 이걸 안 주면 어두운
            화면 위에 흰 주소창이 얹혀 페이지가 잘린 것처럼 보인다. 쿠키로 정한 theme 을
            그대로 따르므로 토글과 어긋나지 않는다.
            값은 globals.css 의 --c-bg 와 같아야 한다(메타 태그에는 var() 를 못 쓴다). */}
        <meta name="theme-color" content={theme === "dark" ? "#0e131c" : "#d4daea"} />
        {/* 본문·숫자는 전부 Pretendard(위에서 next/font/local로 자체 호스팅)라 CDN에서
            받아오는 건 두 가지뿐이다: 워드마크 전용 Bricolage Grotesque와 Material Symbols
            아이콘. 둘 다 빌드 시점 폰트 페치 실패를 피하려고 런타임 CDN 링크로 둔다.
            (예전엔 Plus Jakarta Sans·JetBrains Mono도 받았는데, 한글 글리프가 없어 서체가
             갈리는 원인이라 Pretendard로 통일하며 걷어냈다.) */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0&display=block"
          rel="stylesheet"
        />
        {/* 기기별 수집 제외 스위치. ?ga=off 로 한 번 들어온 기기는 gtag 의 공식
            무력화 플래그(ga-disable-<측정ID>)가 켜져 히트를 아예 보내지 않는다.
            ?ga=on 이면 해제. 상태를 localStorage 에 남기므로 IP 가 매번 바뀌는
            휴대폰 LTE 처럼 내부 트래픽 필터로 못 거르는 기기를 걸러낼 수 있다.
            gtag.js 는 hydration 이후에 실리므로 head 의 동기 스크립트인 이쪽이
            항상 먼저 실행된다 — 플래그를 놓쳐 히트가 새 나갈 일이 없다. */}
        {GA_ID ? (
          <script
            dangerouslySetInnerHTML={{
              __html: `(function(){try{var k=${JSON.stringify(`ga-disable-${GA_ID}`)};var v=new URLSearchParams(location.search).get("ga");if(v==="off")localStorage.setItem(k,"1");else if(v==="on")localStorage.removeItem(k);if(localStorage.getItem(k))window[k]=true;}catch(e){}})();`,
            }}
          />
        ) : null}
        {/* 구조화 데이터(JSON-LD) — 검색엔진에 사이트/조직 정보를 명시적으로 제공. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": "WebSite",
                  "@id": `${SITE_URL}/#website`,
                  url: SITE_URL,
                  name: SITE_NAME,
                  alternateName: "햇쩨",
                  description: DESCRIPTION,
                  inLanguage: "ko-KR",
                  publisher: { "@id": `${SITE_URL}/#organization` },
                },
                {
                  "@type": "Organization",
                  "@id": `${SITE_URL}/#organization`,
                  name: SITE_NAME,
                  url: SITE_URL,
                  logo: `${SITE_URL}/icon.svg`,
                },
              ],
            }),
          }}
        />
      </head>
      {/* 일부 브라우저 확장(예: ColorZilla의 cz-shortcut-listen)이 hydration 전에
          <body>에 속성을 주입해 불일치 경고를 낸다. body 자신의 속성 불일치만
          무시한다 — 내부 컴포넌트 hydration 검사에는 영향 없다. */}
      <body className="font-sans" suppressHydrationWarning>
        <AppShell dailyScore={dailyScore} theme={theme}>
          {children}
        </AppShell>
      </body>
      {/* gtag.js 는 hydration 이후에 실린다(LCP 를 밀지 않는다). 라우트 이동
          페이지뷰는 GA4 의 '향상된 측정'이 history 이벤트로 알아서 잡으므로
          여기서 따로 쏘지 않는다 — 직접 쏘면 이중 집계된다. */}
      {GA_ID ? <GoogleAnalytics gaId={GA_ID} /> : null}
    </html>
  );
}
