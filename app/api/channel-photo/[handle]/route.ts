import type { NextRequest } from "next/server";

import { verifyChannelPhotoSig } from "@/lib/channel-photo";
import { getSupabaseAdmin } from "@/lib/supabase-server";

/**
 * 채널 프로필 사진을 캐시 가능한 이미지로 준다. 왜 인라인 base64 를 걷어냈는지는
 * lib/channel-photo.ts 주석 참고.
 *
 * 브라우저는 사진 하나를 한 번만 받아 탭·카드·다음 방문까지 재사용한다 — 같은 사진이
 * 한 페이지에 세 번 나와도 요청은 한 번이다. HTML 에서 빠진 2.5MB 가 여기서 64건의
 * 병렬 요청으로 바뀌는데, 이쪽은 렌더를 막지 않고 캐시가 먹는다.
 */

// 사진은 sync_telegram_channels.py 가 이따금 갱신할 뿐 거의 안 바뀐다. 하루 지나면
// 조용히 뒤에서 새로 받아 오게 두고(stale-while-revalidate), 그동안 화면은 즉시 뜬다.
// 채널이 프사를 바꾸면 최대 하루 늦게 반영되는데, 아바타 32px 짜리에 그 이상은 과하다.
const CACHE = "public, max-age=86400, stale-while-revalidate=2592000";

export async function GET(req: NextRequest, ctx: RouteContext<"/api/channel-photo/[handle]">) {
  const { handle } = await ctx.params;

  // 서명이 안 맞으면 채널이 있든 없든 똑같이 404 — 감시 목록을 캐낼 수 없게 한다.
  if (!verifyChannelPhotoSig(handle, req.nextUrl.searchParams.get("v"))) {
    return new Response(null, { status: 404 });
  }

  const { data } = await getSupabaseAdmin()
    .from("telegram_channels")
    .select("photo")
    .eq("handle", handle)
    .maybeSingle<{ photo: string | null }>();

  // "data:image/jpeg;base64,...." 를 mime 과 본문으로 가른다. 정규식으로 통째로 잡지
  // 않는 건 본문에 줄바꿈이 섞이면 . 이 못 넘기 때문이다(tsconfig target 이 ES2017 이라
  // s 플래그도 못 쓴다). 앞머리만 확인하고 나머지는 그대로 디코딩한다.
  const uri = data?.photo ?? "";
  const comma = uri.indexOf(",");
  const head = comma < 0 ? "" : uri.slice(0, comma); // "data:image/jpeg;base64"
  if (!head.startsWith("data:image/") || !head.endsWith(";base64")) {
    return new Response(null, { status: 404 });
  }

  return new Response(Buffer.from(uri.slice(comma + 1), "base64"), {
    headers: {
      "Content-Type": head.slice("data:".length, -";base64".length),
      "Cache-Control": CACHE,
    },
  });
}
