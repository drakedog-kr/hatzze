/**
 * Supabase 읽기 요청의 데이터 캐시 설정 — lib/supabase-server.ts 의 cachedFetch 가 쓴다.
 *
 * 순수 함수만 둔다(`server-only` 를 안 불러 `npm test` 로 바로 돈다 · tests/read-cache.test.ts).
 * 왜 무기한인지 · 왜 라우트를 키에 넣는지는 lib/supabase-server.ts 머리 주석에 있다.
 */

/**
 * 조회 사본의 기한. 프로덕션은 `false`(무기한) — 파이프라인이 그 페이지를 비울 때만 새로 받는다. 0 이면 캐시를 끈다.
 * ⚠️ 로컬 개발 서버(`next dev`)는 예전처럼 3600초다. 무기한이면 로컬 화면의 DB 값이 서버를 다시 띄울 때까지 옛것으로
 *    남는다 — 로컬에서 확인하는 쪽이 헷갈린다. 페이지 안이 따로 바뀌는지는 파이프라인 도중의 프로덕션 문제라 거기서만 막는다.
 */
export function readCacheRevalidate(nodeEnv: string | undefined): number | false {
  return nodeEnv === "production" ? false : 3600;
}

export const READ_CACHE_REVALIDATE: number | false = readCacheRevalidate(process.env.NODE_ENV);

/** 조회 요청 머리에 붙이는 라우트 이름. Next 데이터 캐시의 키가 머리까지 보므로 라우트마다 사본이 갈린다. */
export const ROUTE_HEADER = "x-hz-route";

/** Next 의 fetch 확장(next.revalidate)까지 받는 init 타입(lib/yahoo-quote.ts 와 같은 꼴). */
export type FetchInit = RequestInit & { next?: { revalidate?: number | false } };

/** 읽기 요청의 init — 데이터 캐시를 무기한으로 걸고, 라우트를 알면 머리에 붙인다. */
export function readCacheInit(
  init: RequestInit | undefined,
  route: string | undefined,
  revalidate: number | false = READ_CACHE_REVALIDATE,
): FetchInit {
  const headers = new Headers(init?.headers);
  if (route) headers.set(ROUTE_HEADER, route);
  return { ...init, headers, next: { revalidate } };
}
