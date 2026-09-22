/**
 * `/api/revalidate` 본문에서 비울 경로 목록을 읽는 자리(app/api/revalidate/route.ts).
 *
 * 본문 없이 부르면 빈 배열이고, 그건 "루트 레이아웃 아래 전부"라는 뜻이다. 경로를 주면
 * 그 경로들만 비운다 — 파이프라인 한가운데서 카더라 두 화면만 비울 때 쓴다.
 *
 * 라우트 밖에 둔 이유는 순수 함수라 `npm test` 로 그냥 돌릴 수 있어서다
 * (tests/revalidate-paths.test.ts).
 */

/** 한 번에 받는 경로 수. 파이프라인이 부르는 건 둘뿐이고, 늘어도 화면 수를 넘지 않는다. */
export const MAX_PATHS = 20;
/** 한 번에 받는 라우트 패턴 수(`/theme/[theme]` 꼴). 패턴 하나가 그 꼴의 화면 전부를 덮으므로 몇 개면 된다. */
export const MAX_ROUTES = 10;
/** `revalidatePath` 의 경로 상한(next 문서). 넘으면 어차피 안 먹는다. */
export const MAX_PATH_LEN = 1024;

/**
 * `paths` 는 literal 경로(`/kadera`), `routes` 는 동적 구간이 든 라우트 패턴(`/theme/[theme]`)이다. 패턴은 라우트가
 * `revalidatePath(pattern, "page")` 로 불러 **그 꼴의 화면 전부**를 비운다(next 16 docs/…/revalidatePath.md).
 * 둘 다 비었으면 "루트 레이아웃 아래 전부"다.
 */
export type ParsedPaths = { paths: string[]; routes: string[] } | { reason: string };

/** 라우트 패턴 한 칸. 글자 칸(`theme`, `us`) 이거나 동적 칸(`[theme]`)이다. `[...slug]` · `[[...slug]]` 는 이 저장소에 없어 안 받는다. */
const ROUTE_SEGMENT = /^(?:[A-Za-z0-9_.-]+|\[[A-Za-z0-9_]+\])$/;

/**
 * 이미 JSON 으로 푼 본문에서 경로를 고른다. 본문이 없으면(`undefined`) 빈 배열이다.
 *
 * ⚠️ 동적 구간(`/stock/[code]`)은 안 받는다. 그런 패턴은 `revalidatePath` 가 두 번째
 *    인자를 요구하는데 파이프라인이 찍어 부르는 건 전부 literal 경로라 받을 자리가 없다.
 *    조용히 아무 일도 안 일어나는 것보다 400 으로 알리는 편이 낫다.
 */
export function parseRevalidatePaths(body: unknown): ParsedPaths {
  if (body === null || body === undefined) return { paths: [], routes: [] };
  if (typeof body !== "object" || Array.isArray(body)) return { reason: "본문은 객체여야 합니다" };
  const routes = parseRoutes((body as { routes?: unknown }).routes);
  if ("reason" in routes) return routes;
  const raw = (body as { paths?: unknown }).paths;
  if (raw === undefined) return { paths: [], routes: routes.routes };
  if (!Array.isArray(raw)) return { reason: "paths 는 배열이어야 합니다" };
  if (raw.length > MAX_PATHS) return { reason: `paths 는 ${MAX_PATHS}개까지입니다` };
  const paths: string[] = [];
  for (const p of raw) {
    if (typeof p !== "string") return { reason: "paths 의 값은 문자열이어야 합니다" };
    // `//evil.com` 은 프로토콜 상대 주소라 경로처럼 생겼지만 경로가 아니다.
    if (!p.startsWith("/") || p.startsWith("//")) return { reason: `경로가 아닙니다: ${p}` };
    if (p.length > MAX_PATH_LEN) return { reason: "경로가 너무 깁니다" };
    if (p.includes("[")) return { reason: `동적 구간은 paths 가 아니라 routes 로 보내십시오: ${p}` };
    // 공백이 낀 경로는 부르는 쪽이 인자를 하나로 뭉쳐 보낸 것이다("/kadera /kadera/us").
    // 앞이 "/" 라 여기를 그냥 지나가는데, 그러면 revalidatePath 가 없는 경로를 비우고
    // 아무 일도 안 일어난 채 200 이 돌아간다. 조용한 실패보다 400 이 낫다.
    if (/\s/.test(p)) return { reason: `경로에 공백이 있습니다: ${p}` };
    paths.push(p);
  }
  return { paths, routes: routes.routes };
}

/**
 * 라우트 패턴 목록. 칸마다 글자 칸이나 `[이름]` 이어야 하고, **동적 칸이 적어도 하나** 있어야 한다 — 없으면 literal
 * 경로라 `paths` 로 보낼 것이다(패턴으로 부르면 `type` 이 붙어 뜻이 달라진다).
 */
function parseRoutes(raw: unknown): { routes: string[] } | { reason: string } {
  if (raw === undefined) return { routes: [] };
  if (!Array.isArray(raw)) return { reason: "routes 는 배열이어야 합니다" };
  if (raw.length > MAX_ROUTES) return { reason: `routes 는 ${MAX_ROUTES}개까지입니다` };
  const routes: string[] = [];
  for (const r of raw) {
    if (typeof r !== "string") return { reason: "routes 의 값은 문자열이어야 합니다" };
    if (!r.startsWith("/") || r.startsWith("//")) return { reason: `라우트가 아닙니다: ${r}` };
    if (r.length > MAX_PATH_LEN) return { reason: "라우트가 너무 깁니다" };
    const segments = r.slice(1).split("/");
    if (!segments.every((seg) => ROUTE_SEGMENT.test(seg))) return { reason: `라우트 꼴이 아닙니다: ${r}` };
    if (!segments.some((seg) => seg.startsWith("["))) return { reason: `동적 구간이 없습니다 — paths 로 보내십시오: ${r}` };
    routes.push(r);
  }
  return { routes };
}
