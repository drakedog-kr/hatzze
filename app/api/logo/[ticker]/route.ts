import type { NextRequest } from "next/server";
import sharp from "sharp";

import {
  LOGO_CACHE,
  LOGO_SHAPE_SIZE,
  LOGO_TICKER_RE,
  isLogoSize,
  krLogoCode,
  logoCrop,
  logoUpstreamPath,
  logoVerdict,
  squarePadding,
  type LogoSourceRow,
} from "@/lib/stock-logo";
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
 *
 * 22px 동그라미에 맞게 다듬는다(마이그레이션 104).
 *   - 가로로 긴 글자 로고는 판정표의 자를 상자(crop)대로 첫 덩어리(심볼 · 브랜드 첫 글자)를 잘라 정사각형으로 준다. logo.dev 에서
 *     LOGO_SHAPE_SIZE 그림을 받아(데이터 캐시) sharp 로 자른다 — 그림을 저장하지 않고, 결과는 다른 로고처럼 CDN 이 하루 둔다.
 *   - logo.dev 에 없는 종목(source = own)은 판정표의 그림(회사 홈페이지 로고를 다듬은 PNG)을 요청 크기로 줄여 준다.
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
    // 자를 로고는 큰 그림을 PNG 로 받는다(sharp 가 자르고 줄인다).
    const want = crop ? `size=${LOGO_SHAPE_SIZE}&format=png` : `size=${size}&format=webp`;
    upstream = await fetch(`${UPSTREAM}${path}?token=${key}&${want}&fallback=404`, {
      next: { revalidate: REVALIDATE_SEC },
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    return reply("error");
  }

  const type = upstream.headers.get("content-type");
  const verdict = logoVerdict(upstream.status, type);
  if (verdict !== "ok") return reply(verdict);
  const body = Buffer.from(await upstream.arrayBuffer());
  if (crop) {
    const shaped = await cropToSquare(body, crop, size);
    // 자르다 실패하면(그림이 바뀌어 상자가 밖으로 나가는 등) 자르지 않은 그림을 요청 크기로 준다 — 배지보다는 낫다.
    const out = shaped ?? (await toSize(body, size));
    if (out) return image(out);
    return reply("error");
  }
  return new Response(body, {
    headers: { "Content-Type": type ?? "image/webp", "Cache-Control": LOGO_CACHE.ok },
  });
}

function image(out: Buffer) {
  return new Response(new Uint8Array(out), { headers: { "Content-Type": "image/webp", "Cache-Control": LOGO_CACHE.ok } });
}

/** 그림 안 상자를 잘라 투명 여백을 둔 정사각형으로, 요청 크기의 WebP 로. 실패하면 null. */
async function cropToSquare(body: Buffer, crop: [number, number, number, number], size: number): Promise<Buffer | null> {
  try {
    const meta = await sharp(body).metadata();
    const W = meta.width ?? LOGO_SHAPE_SIZE;
    const H = meta.height ?? LOGO_SHAPE_SIZE;
    const left = Math.min(W - 1, Math.max(0, Math.round(crop[0] * W)));
    const top = Math.min(H - 1, Math.max(0, Math.round(crop[1] * H)));
    const width = Math.max(1, Math.min(W - left, Math.round(crop[2] * W)));
    const height = Math.max(1, Math.min(H - top, Math.round(crop[3] * H)));
    const piece = await sharp(body).extract({ left, top, width, height }).png().toBuffer();
    const pad = squarePadding(width, height);
    return await sharp(piece)
      .extend({ top: pad.top, bottom: pad.bottom, left: pad.left, right: pad.right, background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .resize(size, size)
      .webp({ quality: 90 })
      .toBuffer();
  } catch (e) {
    console.error("[api/logo] 로고를 자르지 못했습니다 — 자르지 않은 그림을 줍니다", e);
    return null;
  }
}

async function toSize(body: Buffer, size: number): Promise<Buffer | null> {
  try {
    return await sharp(body).resize(size, size, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } }).webp({ quality: 90 }).toBuffer();
  } catch {
    return null;
  }
}

/** 판정표에 둔 우리 그림(source = own) — 요청 크기로 줄여 준다. 그림이 없거나 못 읽으면 없는 로고. */
async function ownLogo(ticker: string, size: number) {
  const code = krLogoCode(ticker);
  if (!code) return reply("missing");
  try {
    const { data, error } = await getSupabaseAdmin().from("stock_logo_source").select("image").eq("code", code).maybeSingle();
    const b64 = (data as { image?: string | null } | null)?.image;
    if (error || !b64) return reply(error ? "error" : "missing");
    const out = await toSize(Buffer.from(b64, "base64"), size);
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
    const db = getSupabaseAdmin();
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
    headers: { "Content-Type": "image/gif", "Cache-Control": LOGO_CACHE[verdict], "X-Logo": verdict },
  });
}
