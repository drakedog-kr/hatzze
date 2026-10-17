import type { NextRequest } from "next/server";

import { LOGO_CACHE, LOGO_TICKER_RE, isLogoSize, krLogoCode, logoUpstreamPath, logoVerdict, type LogoSourceRow } from "@/lib/stock-logo";
import { getSupabaseAdmin } from "@/lib/supabase-server";

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
 * 무료 한도를 넘긴 동안(429)은 15분짜리 빈 그림으로 바꿔 준다. 그동안 방문마다 logo.dev 를 두 번씩
 * 두드리던 것이 CDN 에서 멈추고, 화면은 머리글자 배지가 즉시 뜬다.
 *
 * 국장 종목은 파이프라인이 판정해 둔 길(티커 · 홈페이지 도메인 · 없음)로 묻는다(lib/stock-logo.ts logoUpstreamPath ·
 * 2026-10-18). 판정표 조회도 다른 화면 조회처럼 데이터 캐시에 담겨, CDN 이 빈 때에도 DB 를 매번 치지 않는다.
 */

const UPSTREAM = "https://img.logo.dev/";
const REVALIDATE_SEC = 86400;

export async function GET(req: NextRequest, ctx: RouteContext<"/api/logo/[ticker]">) {
  const { ticker } = await ctx.params;
  const size = Number(req.nextUrl.searchParams.get("s"));
  // 꼴이 다른 요청은 캐시도 업스트림도 안 태운다. 코드 자리를 무작위로 돌려 한도를 태우는
  // 길을 좁히는 것이기도 하다(티커 12자 · 크기 여섯 눈금).
  if (!LOGO_TICKER_RE.test(ticker) || !isLogoSize(size)) return new Response(null, { status: 400 });

  // 키는 이제 서버만 본다. 새 이름 LOGO_DEV_KEY 를 먼저 보고, 없으면 처음부터 있던
  // NEXT_PUBLIC_ 이름을 읽는다(.env.example 참고). 둘 다 없으면 배지로 간다.
  const key = process.env.LOGO_DEV_KEY ?? process.env.NEXT_PUBLIC_LOGO_DEV_KEY;
  if (!key) return reply("error");

  const path = logoUpstreamPath(ticker, await logoSource(ticker));
  if (path === null) return reply("missing");

  let upstream: Response;
  try {
    // fallback=404: 기본 폴백은 티커 숫자로 만든 레터마크("4")라 우리 머리글자 배지보다 못하다.
    upstream = await fetch(`${UPSTREAM}${path}?token=${key}&size=${size}&format=webp&fallback=404`, {
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

/**
 * 국장 종목의 판정 행(stock_logo_source). 미국 종목 · 표가 없을 때(마이그레이션 103 전) · 조회 실패는 null —
 * 그때는 예전처럼 티커로 묻는다. 로고 하나 때문에 그림을 못 주는 일은 없게 한다.
 */
async function logoSource(ticker: string): Promise<LogoSourceRow> {
  const code = krLogoCode(ticker);
  if (!code) return null;
  try {
    const { data, error } = await getSupabaseAdmin().from("stock_logo_source").select("source,domain").eq("code", code).maybeSingle();
    // PGRST205 = 표가 없다(마이그레이션 103 전). 그땐 예전 길이 정답이라 로그를 남기지 않는다.
    if (error) {
      if (error.code !== "PGRST205") console.error(`[api/logo] ${code} 로고 판정을 못 읽었습니다 — 티커로 묻습니다`, error);
      return null;
    }
    return (data as LogoSourceRow) ?? null;
  } catch {
    return null;
  }
}

/**
 * 그림이 없는 두 경우. **200 + 1×1 투명 GIF** 로 준다. 클라이언트(StockLogo)는 폭이 1px 인 그림을
 * '없음'으로 읽고 머리글자 배지로 넘어간다.
 *
 * 한때 404 였다. 동작은 같았지만 브라우저가 없는 로고마다 콘솔에 "Failed to load resource … 404" 를
 * 찍어, 로고 없는 코스닥 종목이 넷 선 /preview 에 오류 넷이 쌓였다(2026-09-27 점검). 200 이라
 * CDN 캐시(s-maxage)도 전처럼 걸린다 — 없는 로고 때문에 logo.dev 를 다시 두드리지 않는다.
 */
const BLANK_GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

function reply(verdict: "missing" | "error") {
  return new Response(BLANK_GIF, {
    headers: { "Content-Type": "image/gif", "Cache-Control": LOGO_CACHE[verdict], "X-Logo": verdict },
  });
}
