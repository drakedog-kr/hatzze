import Head from "next/head";
import Link from "next/link";

/**
 * 서버가 화면을 그리다 멈췄을 때의 500 화면. **Pages Router 파일**이다 — 이 저장소에서
 * 유일하다.
 *
 * 왜 여기냐: 화면은 캐시(ISR)로 돌아가고, 조회가 실패한 렌더는 사본에 담기지 않게 일부러
 * 던진다(lib/load-state.ts 의 assertLoaded). 그 던짐이 **사본이 없는 요청**(배포·비운 직후의
 * 첫 방문)에서 나면 Next 는 app/error.tsx 를 안 쓴다 — 정적 렌더의 실패는 오류 경계로
 * 안 흐르고 서버의 500 응답으로 끝난다. 그때 Next 가 찾는 순서가 app 의 `/500` → pages 의
 * `/500` → `/_error` → 맨몸 "Internal Server Error" 텍스트인데(next/dist/server/base-server.js
 * renderErrorToResponse), app 쪽 `/500` 은 매니페스트 키가 `/500/page` 라 절대 안 잡힌다.
 * 그래서 pages 쪽에 둔다. 로컬 스텁으로 실제로 맨몸 텍스트가 나오는 것을 보고 만들었다.
 *
 * 제약: 루트 레이아웃(사이드바·탑바)과 globals.css 를 못 쓴다(pages 는 app 트리 밖).
 * 그래서 색·글꼴을 여기 인라인으로 들고, 테마는 쿠키가 아니라 OS 설정(prefers-color-scheme)
 * 을 따른다. 값은 app/styles/theme.css 의 --c-* 와 같다.
 *
 * ⚠️ pages/ 가 있으면 Next 가 next-env.d.ts 에 compat 타입을 넣어 `usePathname()` 이
 *    `string | null` 이 된다(pages 에서 부르면 null 일 수 있어서). app 쪽에서는 null 이
 *    없지만 타입은 같이 바뀌므로, 부르는 자리 일곱 곳이 `?? "/"` 로 받는다.
 * ⚠️ getInitialProps 를 두면 안 된다 — 정적 500 이 아니게 되어 오류 중에 또 렌더를 탄다.
 * ⚠️ `/500` 주소로도 열린다(Next 가 그렇게 둔다). 색인은 막는다.
 */
export default function ServerErrorPage() {
  return (
    <>
      <Head>
        <title>화면을 그리다 멈췄습니다 | hatzze</title>
        <meta name="robots" content="noindex, nofollow" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <style>{`
        :root { --ink: #0e2136; --sub: #556a84; --bg: #f7fafd; --card: #ffffff; --line: #eaf0f7; color-scheme: light; }
        @media (prefers-color-scheme: dark) {
          :root { --ink: #e4e4e5; --sub: #9e9ea4; --bg: #101013; --card: #202027; --line: #2f2f39; color-scheme: dark; }
        }
        html, body { margin: 0; background: var(--bg); color: var(--ink);
          font-family: Pretendard, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Segoe UI", Roboto, sans-serif; }
        .hz-500 { max-width: 68ch; margin: 0 auto; padding: 72px 20px; }
        .hz-500 a { display: inline-flex; align-items: center; height: 38px; padding: 0 14px; border-radius: 10px;
          border: 1px solid var(--line); background: var(--card); color: var(--ink); text-decoration: none; font-size: 14px; font-weight: 600; }
      `}</style>
      <main className="hz-500">
        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", color: "var(--sub)" }}>오류</p>
        <h1 style={{ margin: "8px 0 0", fontSize: 24, fontWeight: 700, letterSpacing: "-0.01em" }}>화면을 그리다 멈췄습니다</h1>
        <p style={{ margin: "14px 0 0", fontSize: 14, lineHeight: 1.85, color: "var(--sub)" }}>
          자료를 불러오지 못했습니다. 잠시 뒤 다시 시도하면 대개 그대로 열립니다.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 22 }}>
          {/* 같은 주소로 다시 — 서버가 다시 그려 보고, 되면 그 결과가 사본에 담긴다. */}
          <a href="">다시 시도</a>
          <Link href="/">시장 브리핑</Link>
        </div>
      </main>
    </>
  );
}
