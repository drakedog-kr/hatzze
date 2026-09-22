import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { parseRevalidatePaths } from "@/lib/revalidate-paths";

/**
 * 화면 사본(ISR)을 비운다. 파이프라인이 자료를 쓰고 나서 부른다
 * (.github/workflows/daily-update.yml 이 scripts/revalidate.sh 로 여섯 자리에서).
 *
 * 왜 필요한가: 루트 레이아웃의 `revalidate`(3600초 · 카더라 1800 · 미리보기 600)만으로는
 * 파이프라인이 07:00 에 새 값을 써도 최대 한 시간 동안 옛 사본이 나가고, 그 사이 아무도
 * 안 온 화면은 **다음 첫 방문자가 옛 사본을 받는다**(만료 뒤 첫 요청은 옛것을 주고 뒤에서
 * 새로 그린다). 여기서 비우면 비운 뒤 첫 방문자가 새로 그린 화면을 받고, 그다음부터는
 * 다시 캐시다. 시계 주기를 5분에서 1시간으로 늘리면서(2026-09-19) 이 호출이 안전장치가
 * 아니라 본선이 됐다 — 시크릿이 비어 있으면 자료가 최대 한 시간 늦게 보인다.
 *
 * `revalidatePath("/", "layout")` 은 루트 레이아웃 아래 전부다 — 화면의 사본과, 그 화면이
 * 쓴 fetch 데이터 캐시(Supabase 조회 3600초 · 동적 화면과 API 몫까지) 둘 다 비운다.
 *
 * ## 본문으로 경로를 찍을 수 있다
 *
 *     {"paths": ["/kadera", "/kadera/us"]}
 *
 * 본문이 없으면 예전처럼 전부 비운다. 찍어 부르는 자리는 파이프라인 한가운데 다섯이고,
 * 화면마다 **자기 자료가 다 쓰인 직후**다.
 *
 *   미리보기 쌍 표 직후      `/preview`     (발사 70초)
 *   개장 전 지금 값 직후     `/preview`     (그 화면이 읽는 둘째 표 · KRX 게이트 뒤)
 *   미장 총평 직후          `/kadera/us`
 *   국장 총평 직후          `/kadera`
 *   히어로 요약 직후        `/`            (마감 리포트 발송 앞)
 *
 * 그때 전부 비우면 아직 이 실행의 값을 못 받은 화면까지 사본과 데이터 캐시를 버리고 다시
 * 그린다(하루 두 번이던 전량 재생성이 열두 번이 된다).
 *
 * ⭐ 경로를 주면 **그 경로가 쓴 데이터 캐시도 같이** 비워진다. 문서 문장만 믿지 않고
 *    프로덕션 빌드로 쟀다(2026-09-22) — 원천 값을 바꿔도 캐시가 살아 있는 동안은 옛 값이
 *    나오는 화면을 만들어 두고, 그 경로만 찍어 부르니 곧바로 새 값이 나왔다. 다른 경로를
 *    찍었을 때는 그대로였다. 그래서 태그를 따로 달 필요가 없고, 범위도 실제로 좁다.
 *
 * ⚠️ 동적 구간(`/stock/[code]`)은 안 받는다. 그런 패턴은 `revalidatePath` 가 두 번째
 *    인자를 요구하는데, 파이프라인이 찍어 부르는 건 전부 literal 경로라 받을 자리가
 *    없다. 잘못 부르면 조용히 아무 일도 안 일어나는 대신 400 으로 알린다.
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
  // 본문 없이 부르는 게 기본 사용법이라 빈 본문은 '전부 비우기'다. 다만 **본문이 있는데
  // 안 풀리는 것**은 다르다 — 그걸 빈 본문과 같이 보면 경로를 찍어 부른 쪽의 오타가
  // 조용히 전량 재생성으로 바뀌고, 로그만 봐서는 구분이 안 된다.
  const text = (await req.text()).trim();
  let body: unknown;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      return NextResponse.json({ ok: false, reason: "본문이 JSON 이 아닙니다" }, { status: 400 });
    }
  }
  const parsed = parseRevalidatePaths(body);
  if ("reason" in parsed) {
    return NextResponse.json({ ok: false, reason: parsed.reason }, { status: 400 });
  }
  if (parsed.paths.length === 0) {
    revalidatePath("/", "layout");
    return NextResponse.json({ ok: true, revalidated: "/ (layout)", at: new Date().toISOString() });
  }
  for (const path of parsed.paths) revalidatePath(path);
  return NextResponse.json({ ok: true, revalidated: parsed.paths, at: new Date().toISOString() });
}
