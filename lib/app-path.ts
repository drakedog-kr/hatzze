/**
 * 화면이 읽는 경로를 한 꼴로 맞춘다 — 홈을 "/index" 로 받는 경우를 "/" 로 되돌린다.
 *
 * Vercel 이 ISR 로 홈을 다시 그릴 때 라우터 첫머리가 ["", "index"] 가 되어(HTML 안의 `"c":["","index"]`),
 * 서버 렌더 안의 usePathname() 이 "/index" 를 돌려준다. 셸이 그 경로로 사이드바를 뒤지면 "/"(시장 브리핑)를
 * 못 찾아 제목 칸을 비우고, 브라우저는 실제 주소 "/" 로 제목을 그려 하이드레이션이 어긋났다
 * (React #418, 2026-09-23 프로덕션 홈에서 매번). 그 서버 HTML 에는 <h1> 과 구조화 데이터도 없었다.
 * 갓 빌드한 HTML 은 ["", ""] 라 멀쩡해서 로컬 빌드로는 재현이 안 된다 — 배포 뒤 ISR 이 한 번 돈 뒤에만 보인다.
 *
 * "/index" 라는 화면은 없다(로컬에서 부르면 404). 그래서 이 경로는 늘 홈으로 읽어도 된다.
 */
export function appPath(pathname: string | null | undefined): string {
  if (!pathname || pathname === "/index") return "/";
  return pathname;
}
