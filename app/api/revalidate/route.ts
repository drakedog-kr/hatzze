import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

/**
 * 화면 사본(ISR)을 전부 비운다. 파이프라인이 자료를 다 쓰고 나서 부른다
 * (.github/workflows/daily-update.yml 의 마지막 스텝).
 *
 * 왜 필요한가: 루트 레이아웃의 `revalidate`(300초)만으로는 파이프라인이 07:00 에 새 값을
 * 써도 최대 5분 동안 옛 사본이 나가고, 그 사이 아무도 안 온 화면은 **다음 첫 방문자가
 * 옛 사본을 받는다**(만료 뒤 첫 요청은 옛것을 주고 뒤에서 새로 그린다). 여기서 비우면
 * 비운 뒤 첫 방문자가 새로 그린 화면을 받고, 그다음부터는 다시 캐시다.
 *
 * `revalidatePath("/", "layout")` 은 루트 레이아웃 아래 전부다 — 화면의 사본과, 그 화면이
 * 쓴 fetch 데이터 캐시(Supabase 조회 300초) 둘 다 비운다.
 *
 * 비밀은 `REVALIDATE_SECRET`(Vercel 환경변수 · 깃헙 시크릿 같은 값). 없으면 이 라우트는
 * 아무것도 안 하고 503 — 잠그지 않은 채 열어 두면 누구나 우리 캐시를 비워 함수 비용을
 * 올릴 수 있다.
 *
 * ⚠️ 이 라우트 자체는 캐시되면 안 된다(force-dynamic). POST 라 어차피 안 되지만 명시한다.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, reason: "REVALIDATE_SECRET 이 설정되어 있지 않습니다" }, { status: 503 });
  }
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true, revalidated: "/ (layout)", at: new Date().toISOString() });
}
