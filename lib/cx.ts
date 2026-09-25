/**
 * 클래스 이름을 이어 붙이기만 한다(거짓 값은 뺀다).
 *
 * shadcn 부품은 `cn`(clsx + tailwind-merge 대체) 으로 클래스를 합친다. 그런데 `cn` 은 Tailwind 클래스 충돌 표를
 * 담고 있어 gzip 19.6KB 다 — 모든 화면에 붙는 부품(⌘K 칩 · 경로 표시)이 부르면 그만큼이 **모든 화면**에 실렸다
 * (2026-09-25 프로덕션 빌드 실측). 그 부품들은 넘겨받는 클래스가 기본 클래스와 부딪치지 않으므로 이어 붙이면 된다.
 * ⚠️ 덮어쓰기가 필요한 부품(대화상자의 top-1/2 를 top-1/3 으로 바꾸는 CommandDialog 등)은 `cn` 을 그대로 쓴다.
 */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}
