/**
 * `/insider` 아래에서 `notFound()` 가 던져졌을 때. 루트의 `app/not-found.tsx` 와 같은 화면이다.
 *
 * 왜 따로 두나: 이 세그먼트는 `loading.tsx` 가 둘 겹친다(`insider/loading.tsx` 와
 * `insider/list/[kind]/loading.tsx`). 전체보기(`/insider/list/zzz`)에서 던진 notFound() 가
 * 그 두 Suspense 경계를 건너 루트 경계까지 못 올라가, 골격이 영원히 남았다(2026-09-17 실측).
 * 경계를 이 세그먼트에 하나 두면 한 경계만 건너면 되어 종목·인물 상세(`/insider/stock/ZZZZZ`)와
 * 같은 길이 된다.
 */
export { default } from "../not-found";
