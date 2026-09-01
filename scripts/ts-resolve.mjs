/**
 * TypeScript 소스를 Node 로 그대로 불러오기 위한 해석 훅.
 *
 * Node 는 타입을 벗겨 낼 줄은 알지만(`--experimental-strip-types`), 확장자 없는 상대
 * import(`./brand`)는 못 찾는다. 번들러가 하던 일이라 런타임에는 규칙이 없다.
 * 여기서 `.ts` · `.tsx` · `/index.ts` 를 차례로 대 본다.
 *
 * 검사 스크립트(scripts/check-routes.mjs)만 쓴다. 앱 실행 경로와는 무관하다.
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function resolve(specifier, context, next) {
  if (specifier.startsWith(".") && context.parentURL) {
    const base = new URL(specifier, context.parentURL).href;
    for (const candidate of [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`]) {
      if (existsSync(fileURLToPath(candidate))) return next(candidate, context);
    }
  }
  return next(specifier, context);
}
