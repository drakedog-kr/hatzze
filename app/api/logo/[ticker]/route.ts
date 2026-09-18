import type { NextRequest } from "next/server";

import { LOGO_CACHE, LOGO_TICKER_RE, isLogoSize, logoVerdict } from "@/lib/stock-logo";

/**
 * 종목 로고를 logo.dev 에서 받아 캐시 가능한 그림으로 준다. 왜 브라우저 직결을 걷어냈는지는
 * lib/stock-logo.ts 주석 참고.
 *
 * 캐시는 두 겹이다.
 *   - Vercel CDN: 아래 Cache-Control 로. 히트면 이 함수는 돌지 않는다. 다만 캐시 키에 배포 URL 이
 *     들어가 배포마다 비므로,
 *   - Next 데이터 캐시(fetch 의 next.revalidate): 배포를 넘어 유지된다. 배포 직후에도 logo.dev
 *     까지는 안 간다. 200 만 저장하므로 없는 로고는 배포마다 한 번씩 다시 물어본다(배당 페이지
 *     12장 남짓).
 *
 * 무료 한도를 넘긴 동안(429)은 15분짜리 404 로 바꿔 준다. 그동안 방문마다 logo.dev 를 두 번씩
 * 두드리던 것이 CDN 에서 멈추고, 화면은 머리글자 배지가 즉시 뜬다.
 */

const UPSTREAM = "https://img.logo.dev/ticker/";
const REVALIDATE_SEC = 86400;

export async function GET(req: NextRequest, ctx: RouteContext<"/api/logo/[ticker]">) {
  const { ticker } = await ctx.params;
  const size = Number(req.nextUrl.searchParams.get("s"));
  // 꼴이 다른 요청은 캐시도 업스트림도 안 태운다. 코드 자리를 무작위로 돌려 한도를 태우는
  // 길을 좁히는 것이기도 하다(티커 12자 · 크기 여섯 눈금).
  if (!LOGO_TICKER_RE.test(ticker) || !isLogoSize(size)) return new Response(null, { status: 400 });

  // 키는 이제 서버만 본다. 이름은 Vercel 에 이미 있는 값과 맞추려 그대로 둔다(.env.example 참고).
  const key = process.env.NEXT_PUBLIC_LOGO_DEV_KEY;
  if (!key) return reply("error");

  let upstream: Response;
  try {
    // fallback=404: 기본 폴백은 티커 숫자로 만든 레터마크("4")라 우리 머리글자 배지보다 못하다.
    upstream = await fetch(`${UPSTREAM}${ticker}?token=${key}&size=${size}&format=webp&fallback=404`, {
      next: { revalidate: REVALIDATE_SEC },
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    return reply("error");
  }

  const type = upstream.headers.get("content-type");
  const verdict = logoVerdict(upstream.status, type);
  if (verdict !== "ok") return reply(verdict);
  return new Response(await upstream.arrayBuffer(), {
    headers: { "Content-Type": type ?? "image/webp", "Cache-Control": LOGO_CACHE.ok },
  });
}

/** 그림이 없는 두 경우. 상태는 같은 404 라 클라이언트는 onError 하나로 배지로 넘어간다. */
function reply(verdict: "missing" | "error") {
  return new Response(null, { status: 404, headers: { "Cache-Control": LOGO_CACHE[verdict] } });
}
