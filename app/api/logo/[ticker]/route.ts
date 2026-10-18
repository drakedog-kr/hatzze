import type { NextRequest } from "next/server";

import {
  LOGO_CACHE,
  LOGO_FETCH_SIZE,
  LOGO_SHAPE_SIZE,
  LOGO_TICKER_RE,
  isLogoSize,
  krLogoCode,
  logoCrop,
  logoUpstreamPath,
  logoVerdict,
  type LogoSourceRow,
} from "@/lib/stock-logo";
import { containWebp, fitLogoWebp } from "@/lib/logo-image";
import { getSupabaseAdminFresh } from "@/lib/supabase-server";

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
 * 2026-10-18). 판정표는 데이터 캐시 없이 읽는다(getSupabaseAdminFresh) — 화면 조회 사본은 파이프라인이 비울 때만 새로워져
 * 고친 판정이 하루 넘게 안 닿았다. CDN 이 응답을 종목 · 크기마다 하루 들고 있어 DB 를 거의 안 친다.
 *
 * 로고 칸(둥근 네모 마스크)에 맞게 다듬는다(lib/logo-image.ts). 그림을 logo.dev 에서 LOGO_FETCH_SIZE PNG 로 받아(데이터
 * 캐시 · 요청 크기와 상관없이 종목마다 한 장) sharp 로 바탕을 걷고 같은 크기로 얹는다 — 그림을 저장하지 않고, 결과는 CDN 이 하루 둔다.
 *   - 가로로 긴 글자 로고는 판정표의 자를 상자(crop · 마이그레이션 104)대로 첫 덩어리(심볼 · 브랜드 첫 글자)만 얹는다.
 *   - logo.dev 에 없는 종목(source = own)은 판정표의 그림(회사 홈페이지 로고를 다듬은 PNG)을 같은 셈으로 얹는다.
 *   - 원본이 작아 흐린 단색 로고는 경계를 다시 세운다(lib/logo-crisp.ts). 한 색뿐인 그림(새까만 네모)은 없는 로고로 준다.
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

  const row = await logoSource(ticker);
  if (row?.source === "own") return ownLogo(ticker, size);
  const path = logoUpstreamPath(ticker, row);
  if (path === null) return reply("missing");
  const crop = logoCrop(row?.crop);

  let upstream: Response;
  try {
    // fallback=404: 기본 폴백은 티커 숫자로 만든 레터마크("4")라 우리 머리글자 배지보다 못하다.
    // 화면이 받는 가장 큰 크기의 두 배를 PNG 로 받는다 — 바탕을 걷고 키워도 뭉개지지 않게(sharp 가 다듬고 줄인다).
    // 자를 로고는 첫 글자만 남기므로 더 큰 그림에서 자른다.
    const fetchSize = crop ? LOGO_SHAPE_SIZE : LOGO_FETCH_SIZE;
    upstream = await fetch(`${UPSTREAM}${path}?token=${key}&size=${fetchSize}&format=png&fallback=404`, {
      next: { revalidate: REVALIDATE_SEC },
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    return reply("error");
  }

  const type = upstream.headers.get("content-type");
  const verdict = logoVerdict(upstream.status, type);
  if (verdict !== "ok") return reply(verdict);
  // 잘라 줄 로고가 아니면(LOGO_FETCH_SIZE 그림) 흐린 단색 로고의 경계를 다시 세운다.
  const out = await shape(Buffer.from(await upstream.arrayBuffer()), size, crop, !crop);
  if (out === "blank") return reply("missing");
  return out ? image(out) : reply("error");
}

/**
 * 캐시 머리. 로컬(개발 서버)에서는 캐시하지 않는다 — 다듬는 셈을 고쳐 가며 화면을 보는데, 브라우저가 7일 들고 있던 옛 그림을
 * 보여 줬다(삼성전기가 고친 뒤에도 작은 네모로 보임, 2026-10-19).
 */
function cacheFor(verdict: "ok" | "missing" | "error"): string {
  return process.env.NODE_ENV === "production" ? LOGO_CACHE[verdict] : "no-store";
}

function image(out: Buffer) {
  return new Response(new Uint8Array(out), { headers: { "Content-Type": "image/webp", "Cache-Control": cacheFor("ok") } });
}

/**
 * 로고 칸에 맞춘 size × size WebP(lib/logo-image.ts). 한 색뿐인 그림(logo.dev 가 로고 대신 주는 새까만 네모)이면 "blank" — 없는
 * 로고로 준다. 다듬다 실패하면(그림이 바뀌어 상자가 밖으로 나가는 등) 다듬지 않은 그림을 요청 크기로 준다 — 배지보다는 낫다.
 * 그것도 못 읽으면 null.
 */
async function shape(
  body: Buffer,
  size: number,
  crop?: [number, number, number, number] | null,
  crisp = false,
): Promise<Buffer | "blank" | null> {
  try {
    return (await fitLogoWebp(body, size, crop, crisp)) ?? "blank";
  } catch (e) {
    console.error("[api/logo] 로고를 다듬지 못했습니다 — 그대로 줄여 줍니다", e);
  }
  try {
    return await containWebp(body, size);
  } catch {
    return null;
  }
}

/** 판정표에 둔 우리 그림(source = own) — 같은 셈으로 칸에 맞춰 준다. 그림이 없거나 못 읽으면 없는 로고. */
async function ownLogo(ticker: string, size: number) {
  const code = krLogoCode(ticker);
  if (!code) return reply("missing");
  try {
    const { data, error } = await getSupabaseAdminFresh().from("stock_logo_source").select("image").eq("code", code).maybeSingle();
    const b64 = (data as { image?: string | null } | null)?.image;
    if (error || !b64) return reply(error ? "error" : "missing");
    const out = await shape(Buffer.from(b64, "base64"), size);
    if (out === "blank") return reply("missing");
    return out ? image(out) : reply("error");
  } catch {
    return reply("error");
  }
}

/**
 * 국장 종목의 판정 행(stock_logo_source). 미국 종목 · 표가 없을 때(마이그레이션 103 전) · 조회 실패는 null —
 * 그때는 예전처럼 티커로 묻는다. 로고 하나 때문에 그림을 못 주는 일은 없게 한다.
 */
async function logoSource(ticker: string): Promise<LogoSourceRow> {
  const code = krLogoCode(ticker);
  if (!code) return null;
  try {
    const db = getSupabaseAdminFresh();
    let { data, error } = await db.from("stock_logo_source").select("source,domain,crop").eq("code", code).maybeSingle();
    // 42703 = 칸이 없다(마이그레이션 104 전) — 자르지 않고 103 처럼 돈다.
    if (error?.code === "42703") ({ data, error } = await db.from("stock_logo_source").select("source,domain").eq("code", code).maybeSingle());
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
    headers: { "Content-Type": "image/gif", "Cache-Control": cacheFor(verdict), "X-Logo": verdict },
  });
}
