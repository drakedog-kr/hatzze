import type { Metadata } from "next";
import { GoogleAnalytics } from "@next/third-parties/google";
import "./globals.css";
import AppShell from "./AppShell";
import { THEME_PUBLIC } from "./screen-flags";
import { SLOGAN } from "./brand";
import { SITE_NAME, SITE_URL, pageMetadata } from "./seo";
import { ICON_FONT_HREF } from "@/lib/icon-names";
import { PRETENDARD_CSS, PRETENDARD_PRELOAD } from "@/lib/fonts";


// 서치콘솔·서치어드바이저 소유확인 토큰. 값이 없으면 메타 태그 자체를 만들지 않는다
// (content가 빈 태그는 두 콘솔 모두 '소유확인 실패'로 처리한다).
const GOOGLE_VERIFICATION = process.env.GOOGLE_SITE_VERIFICATION;
const NAVER_VERIFICATION = process.env.NAVER_SITE_VERIFICATION;

// GA4 측정 ID. 값이 없으면 스크립트 자체를 넣지 않는다 — 로컬·프리뷰에서 찍힌
// 방문이 프로덕션 통계에 섞이는 걸 막는다(검증할 때만 .env.local 에서 켠다).
// NEXT_PUBLIC_ 은 빌드 시점에 인라인되므로 Vercel 에 넣은 뒤 재배포해야 반영된다.
const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

const TITLE = `${SITE_NAME} | ${SLOGAN}`;
// ⚠️ 이 한 문장이 **두 곳**에 나간다 — 홈의 meta description 과, 아래 JSON-LD 의
//    WebSite.description(=검색엔진이 읽는 **사이트 전체** 소개)이다. 그래서 시장
//    브리핑 하나만 설명하면 안 된다. 예전 문장("버핏지수·VKOSPI·레버리지 등 25개
//    지표를 매일 하나의 과열도 점수로 환산합니다")은 다섯 화면짜리 서비스를 지수
//    하나로 소개하고 있었다.
//    질문형 첫 문장은 남긴다 — 검색 결과에서 눌러 볼 이유를 주는 자리다.
const DESCRIPTION =
  "오늘 코스피는 얼마나 뜨겁습니까. 25개 지표로 잰 과열도와 함께, 주식 텔레그램에서 오간 이야기와 미국 공시에 남은 기록을 매일 정리합니다.";

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
    // 뒤쪽 여섯은 브리핑 밖 화면들의 낱말이다. 앞의 아홉만 있을 때는 카더라·내부자·
    // 서학개미가 한 번도 안 나와, 다섯 화면 중 하나만 신고하는 목록이었다.
    // (구글은 2009년부터 이 메타를 랭킹에 쓰지 않는다. 네이버 쪽은 확인하지 않았다.)
    keywords: [
      "코스피 과열도", "시장 과열도", "버핏지수", "VKOSPI", "공포탐욕지수", "증시 심리", "코스피 지표", "hatzze", "햇쩨",
      "카더라", "주식 텔레그램", "내부자 거래", "13F", "서학개미", "MDD",
    ],
    verification: {
      ...(GOOGLE_VERIFICATION ? { google: GOOGLE_VERIFICATION } : {}),
      ...(NAVER_VERIFICATION
        ? { other: { "naver-site-verification": NAVER_VERIFICATION } }
        : {}),
    },
  };
}

/**
 * 화면 사본(ISR)의 수명. 루트 레이아웃에 두면 아래 모든 화면의 기본값이 된다.
 *
 * 한 번 그린 HTML 을 이 시간 동안 캐시에서 내보내고, 지나면 **먼저 옛 사본을 주고 뒤에서
 * 새로 그린다**(stale-while-revalidate). 예전엔 여기가 force-dynamic 이었고, 그 전엔 위의
 * cookies() 가 전 라우트를 동적으로 만들고 있었다.
 *
 * ## 새로 그리는 때는 시계가 아니라 파이프라인이 정한다
 *
 * 자료가 바뀌는 때는 파이프라인(아침·저녁)과 발송·스캔뿐이고, 파이프라인은 끝나면서
 * /api/revalidate 를 불러 사본을 비우고 주요 화면을 한 번씩 열어 데운다
 * (.github/workflows/daily-update.yml 마지막 스텝 · 데일리 노트 올리기 스크립트도 같은
 * 호출). 이 숫자는 그 호출이 안 왔을 때의 안전장치라 1시간이다.
 *
 * ⚠️ 5분이었다가 늘렸다(2026-09-19). 자료는 하루 두 번 바뀌는데 13개 라우트를 5분마다
 *    다시 그리니 하루 3,700번 중 3,690번이 같은 그림이었고, 그 헛일이 세 줄로 청구됐다 —
 *    1.3MB 사본이 함수에서 CDN 으로 매번 나가는 원천 전송(+1GB/일), 그리는 CPU, 그리고
 *    글자 하나라도 바뀐 사본의 ISR 쓰기(카더라 "N시간 전", app/kadera/time-ago.ts).
 *    방문마다 그리던 때보다 다섯 배가 나갔다. 방문이 아니라 시계가 그리기를 정하는 구조라
 *    방문자가 적을수록 손해가 커진다는 게 핵심이다.
 * ⚠️ 시세처럼 스스로 움직이는 값이 있는 화면은 자기 파일에서 더 짧게 건다 — 카더라 두
 *    페이지 1800(종목 카드 시세 · 10분 야후 캐시), 미리보기 600(밤사이 시세). 여러 값이
 *    겹치면 **가장 짧은 것**이 그 라우트의 주기다(Next 문서).
 * ⚠️ 정적으로 읽히는 리터럴이어야 한다(`60 * 60` 은 안 된다 — Next 문서).
 * ⚠️ 요청마다 그려야 하는 화면은 자기 파일에서 force-dynamic 을 건다(/mdd ·
 *    /insider/stock/[ticker] — searchParams 를 읽어 어차피 동적이다).
 * ⚠️ 실패한 조회가 든 렌더는 사본에 담기면 안 된다. 페이지가 자료를 다 받은 뒤
 *    assertLoaded 로 던진다(lib/load-state.ts). 던지면 마지막 성공본이 남는다.
 * ⚠️ 라우트 안의 fetch 중 **가장 짧은 revalidate 도 그 라우트의 주기가 된다**(Next 문서).
 *    Supabase 조회의 데이터 캐시(lib/supabase-server.ts READ_CACHE_SECONDS)가 300 이던 때는
 *    이 값이 뭐든 모든 화면이 5분이었다 — 그래서 그쪽도 3600 이고, 시세 fetch 는 화면마다
 *    제 주기(카더라 1800 · 미리보기 600 · 데일리 노트 600)로 맞춰 둔다.
 */
export const revalidate = 3600;

/**
 * 모바일 브라우저의 주소창·상태바 색. 안 주면 다크에서 어두운 화면 위에 흰 주소창이
 * 얹혀 페이지가 잘린 것처럼 보인다.
 * 값은 globals.css 의 --c-bg 와 **같아야 한다**(메타 태그에는 var() 를 못 쓴다).
 * 팔레트를 갈면서 여기가 옛 값(#0e131c / #d4daea)으로 남아 주소창만 이전 팔레트를
 * 띠고 있었다 — --c-bg 를 바꿀 땐 이 줄을 같이 볼 것.
 */
const THEME_COLOR = { light: "#e8f0fa", dark: "#101013" } as const;

/**
 * 테마·통화 쿠키를 **브라우저가** 페인트 전에 읽어 <html> 에 붙이는 스크립트.
 *
 * 예전에는 서버가 `cookies()` 로 읽어 `<html data-theme data-cur>` 를 SSR 했다. 그러면
 * 루트 레이아웃이 요청마다 달라져 **전 라우트가 동적**이 되고(캐시 불가), 방문마다 함수가
 * 페이지를 새로 그린다. 같은 값을 이 동기 스크립트가 붙이면 결과는 같고 HTML 은 모두에게
 * 같아진다 — 캐시에 넣어도 남의 다크 화면이 나에게 올 일이 없다.
 *
 * ⚠️ `<head>` 의 **동기** 스크립트여야 한다. 지연시키면 라이트로 한 번 그린 뒤 다크로
 *    바뀌어 첫 페인트가 깜빡인다. gtag 의 ga-disable 스위치와 같은 자리·같은 방식이다.
 * ⚠️ 셸의 토글은 이 속성을 **읽어서** 시작한다(AppShell.tsx 의 ThemeToggle·CurrencyToggle).
 *    아이콘과 눌린 칸은 CSS 가 뿌리 속성을 보고 고르므로 리액트가 깨기 전에도 맞다.
 *
 * 기본값은 라이트다(2026-07-27 원복). 쿠키가 없거나 "light" 면 속성을 안 붙이고, 그러면
 * theme.css 의 :root 가 라이트다. 다크는 이용자가 토글을 눌러 쿠키를 남긴 경우에만 나온다.
 * 한동안 다크가 기본이었는데, 팔레트를 새로 잡으면서(흰 카드 + 옅은 회색 바탕) 라이트 쪽
 * 가독성이 올라가 되돌렸다. 기본값을 뒤집으려면 여기의 비교와 theme.css 의 :root 블록을
 * 같이 뒤집어야 한다.
 *
 * 통화(`hz-cur`)는 값이 **세 가지**다 — 없음(아직 안 고름) · krw · usd. "안 고름"이면
 * 속성을 안 붙여서 **화면이 자기 기본값을 쓴다**(서학개미는 원화, 내부자 리포트는 달러,
 * mobile.css 의 `[data-cur-default]`). "안 고름"과 "원화 고름"을 반드시 갈라야 한다 —
 * 안 가르면 /insider 에서 ₩ 를 눌러도 다시 달러로 돌아간다.
 */
const PREF_SCRIPT = `(function(){try{var c=document.cookie.split("; "),t,u,s;for(var i=0;i<c.length;i++){var p=c[i].split("=");if(p[0]==="hz-theme")t=p[1];else if(p[0]==="hz-cur")u=p[1];else if(p[0]==="hz-side")s=p[1];}var d=document.documentElement;if(s==="icon")d.setAttribute("data-sidebar","icon");if(t==="dark"){d.setAttribute("data-theme","dark");var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",${JSON.stringify(THEME_COLOR.dark)});}if(u==="usd"||u==="krw")d.setAttribute("data-cur",u);}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: 위 스크립트가 하이드레이션 전에 <html> 에 data-theme·
    // data-cur 를 붙인다. 리액트가 그린 속성 목록과 어긋나지만 리액트는 자기가 안 그린
    // 속성을 지우지 않으므로 값은 남고, 개발 모드의 불일치 경고만 이 요소에서 끈다.
    // 자식 트리의 하이드레이션 검사에는 영향이 없다(body 의 것과 같은 범위).
    <html lang="ko" suppressHydrationWarning
          className="h-full antialiased">
      <head>
        {/* 라이트 값으로 내보내고, 다크 쿠키면 아래 PREF_SCRIPT 가 페인트 전에 바꾼다.
            토글을 누를 때는 AppShell 의 ThemeToggle 이 --c-bg 를 읽어 다시 맞춘다. */}
        <meta name="theme-color" content={THEME_COLOR.light} />
        <script dangerouslySetInnerHTML={{ __html: PREF_SCRIPT }} />
        {/* 본문·숫자는 전부 Pretendard 쪼갠 판(자체 호스팅, lib/fonts.ts)이다. 화면에 나온 글자가 든 조각만 받는다.
            예전엔 전체판 2MB 를 next/font 로 모든 화면이 미리 받았고, 주소에 배포마다 바뀌는 ?dpl= 가 붙어
            재방문자도 배포마다 다시 받았다(2026-09-26). 미리 받는 건 모든 화면이 쓰는 12조각뿐이다.
            ⚠️ 미리 받기에는 crossOrigin 이 있어야 한다 — 글꼴은 CORS 모드로 받으므로, 없으면 같은 파일을 두 번 받는다. */}
        <link rel="stylesheet" href={PRETENDARD_CSS} />
        {PRETENDARD_PRELOAD.map((href) => (
          <link key={href} rel="preload" href={href} as="font" type="font/woff2" crossOrigin="anonymous" />
        ))}
        {/* CDN 에서 받아오는 건 두 가지뿐이다: 워드마크 전용 Bricolage Grotesque와 Material Symbols
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
        {/* 아이콘은 쓰는 것만 잘라 받는다(lib/icon-names.ts). */}
        <link href={ICON_FONT_HREF} rel="stylesheet" />
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
        {/* 테마 리포트를 사이드바 링크로 낼지는 서버가 정한다(AppShell 의 ShellEnv 주석) — 열었거나, 배포가 아닌 로컬. */}
        <AppShell themeNav={THEME_PUBLIC || !process.env.VERCEL_ENV}>
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
