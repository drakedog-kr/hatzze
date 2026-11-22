import type { NextRequest } from "next/server";

import { UPSTREAM_HEADER, authorize, forwardHeaders, kindTarget } from "@/lib/kind-relay";

/**
 * KIND 서울 경유. 파이프라인(해외 러너)이 KIND 를 직접 부르면 IP 단위 일시 차단 403 을 자주 맞아, 이 함수(서울 icn1)가 대신 묻고
 * 받은 그대로 돌려준다. 왜 · 무엇을 막는지는 lib/kind-relay.ts 머리말.
 *
 *     POST /api/kind/disclosure/details.do          (폼 본문 그대로)
 *     GET  /api/kind/corpgeneral/corpList.do?method=download&searchType=13
 *     Authorization: Bearer <KIND_PROXY_SECRET 또는 REVALIDATE_SECRET>
 *
 * KIND 의 상태 코드 · 본문 · content-type 을 그대로 준다(본문은 흘려보낸다 — 상장회사 목록 1.2MB · 배당정보 3,000줄).
 * 그 응답에만 X-Kind-Upstream 이 붙는다. 이 라우트 자신의 실패(비밀 · 허락 밖 경로 · KIND 가 안 열림)에는 없다 —
 * 파이프라인은 그걸 보고 서울 경유를 접고 직접 묻는다(data-pipeline/common/kind.py).
 */
export const dynamic = "force-dynamic";
// KIND 배당정보 3,000줄이 느린 날을 덮는다. 파이프라인 쪽 한 요청 시간 상한(90초)보다 길게 둔다.
export const maxDuration = 120;
const UPSTREAM_TIMEOUT_MS = 100_000;

export async function GET(req: NextRequest, ctx: RouteContext<"/api/kind/[...path]">) {
  return relay(req, ctx, "GET");
}

export async function POST(req: NextRequest, ctx: RouteContext<"/api/kind/[...path]">) {
  return relay(req, ctx, "POST");
}

async function relay(req: NextRequest, ctx: RouteContext<"/api/kind/[...path]">, method: "GET" | "POST") {
  const auth = authorize(req.headers.get("authorization"), process.env.KIND_PROXY_SECRET || process.env.REVALIDATE_SECRET);
  if (auth === "unset") return Response.json({ ok: false, reason: "비밀이 설정되어 있지 않습니다" }, { status: 503 });
  if (auth === "denied") return new Response(null, { status: 401 });

  const { path } = await ctx.params;
  const target = kindTarget(path, req.nextUrl.search);
  if (!target) return new Response(null, { status: 400 });

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method,
      headers: forwardHeaders(req.headers),
      body: method === "POST" ? await req.arrayBuffer() : undefined,
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (e) {
    console.error(`[api/kind] KIND 에 못 닿았습니다 ${target}`, e);
    return new Response(null, { status: 504 });
  }
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
      "Cache-Control": "no-store",
      [UPSTREAM_HEADER]: String(upstream.status),
    },
  });
}
