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
/** `revalidatePath` 의 경로 상한(next 문서). 넘으면 어차피 안 먹는다. */
export const MAX_PATH_LEN = 1024;

export type ParsedPaths = { paths: string[] } | { reason: string };

/**
 * 이미 JSON 으로 푼 본문에서 경로를 고른다. 본문이 없으면(`undefined`) 빈 배열이다.
 *
 * ⚠️ 동적 구간(`/stock/[code]`)은 안 받는다. 그런 패턴은 `revalidatePath` 가 두 번째
 *    인자를 요구하는데 파이프라인이 찍어 부르는 건 전부 literal 경로라 받을 자리가 없다.
 *    조용히 아무 일도 안 일어나는 것보다 400 으로 알리는 편이 낫다.
 */
export function parseRevalidatePaths(body: unknown): ParsedPaths {
  if (body === null || body === undefined) return { paths: [] };
  if (typeof body !== "object" || Array.isArray(body)) return { reason: "본문은 객체여야 합니다" };
  const raw = (body as { paths?: unknown }).paths;
  if (raw === undefined) return { paths: [] };
  if (!Array.isArray(raw)) return { reason: "paths 는 배열이어야 합니다" };
  if (raw.length > MAX_PATHS) return { reason: `paths 는 ${MAX_PATHS}개까지입니다` };
  const paths: string[] = [];
  for (const p of raw) {
    if (typeof p !== "string") return { reason: "paths 의 값은 문자열이어야 합니다" };
    // `//evil.com` 은 프로토콜 상대 주소라 경로처럼 생겼지만 경로가 아니다.
    if (!p.startsWith("/") || p.startsWith("//")) return { reason: `경로가 아닙니다: ${p}` };
    if (p.length > MAX_PATH_LEN) return { reason: "경로가 너무 깁니다" };
    if (p.includes("[")) return { reason: `동적 구간은 받지 않습니다: ${p}` };
    // 공백이 낀 경로는 부르는 쪽이 인자를 하나로 뭉쳐 보낸 것이다("/kadera /kadera/us").
    // 앞이 "/" 라 여기를 그냥 지나가는데, 그러면 revalidatePath 가 없는 경로를 비우고
    // 아무 일도 안 일어난 채 200 이 돌아간다. 조용한 실패보다 400 이 낫다.
    if (/\s/.test(p)) return { reason: `경로에 공백이 있습니다: ${p}` };
    paths.push(p);
  }
  return { paths };
}
