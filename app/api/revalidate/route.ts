import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { allExceptTargets, parseRevalidatePaths, refreshKeys } from "@/lib/revalidate-paths";

/**
 * 화면 사본(ISR)을 비운다. 파이프라인이 자료를 쓰고 나서 부른다
 * (.github/workflows/daily-update.yml 이 scripts/revalidate.sh 로 일곱 자리에서).
 *
 * 왜 필요한가: 화면의 DB 조회 사본은 라우트마다 따로이고 시간으로 만료되지 않는다(lib/read-cache.ts · 2026-10-17 —
 * 파이프라인 도중에 한 페이지 안이 따로따로 바뀌지 않게). 화면 사본(ISR)은 레이아웃 · 화면 주기대로 다시 그려져도
 * DB 값은 그대로라, 이 호출이 새 자료를 보이게 하는 **유일한** 길이다. 비운 라우트만 다음 방문 때 DB 를 다시 읽는다
 * — 다른 라우트는 같은 조회라도 제 사본을 쓴다. 시크릿이 비어 있으면 화면의 DB 값이 안 바뀐다.
 *
 * `revalidatePath("/", "layout")` 은 루트 레이아웃 아래 전부다 — 화면의 사본과, 그 화면이
 * 쓴 fetch 데이터 캐시(Supabase 조회 3600초 · 동적 화면과 API 몫까지) 둘 다 비운다.
 *
 * ## 본문으로 경로를 찍을 수 있다
 *
 *     {"paths": ["/kadera", "/kadera/us"]}
 *
 * 본문이 없으면 예전처럼 전부 비운다. 찍어 부르는 자리는 파이프라인 한가운데 여섯이고,
 * 화면마다 **자기 자료가 다 쓰인 직후**다.
 *
 *   미리보기 쌍 표 직후      `/preview`     (발사 70초)
 *   개장 전 지금 값 직후     `/preview`     (그 화면이 읽는 둘째 표 · KRX 게이트 뒤)
 *   미장 총평 직후          `/kadera/us`
 *   국장 총평 직후          `/kadera`
 *   테마 요약 직후          `/theme` · `/theme/us` + 상세 두 패턴(routes, 아래 절)
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
 * ## 이것만 빼고 전부 — `except`(2026-10-17)
 *
 *     {"except": ["/preview"]}
 *
 * 최상위 자리(TOP_SEGMENTS)를 하나씩 비우고 찍은 것만 남긴다. 아침 마지막 비우기가 미리보기를 뺀다 — 06:31 에
 * 페이지째 바뀐 미리보기가 08시대에 첫 줄 칩만 또 바뀌면 한 페이지 안이 따로 바뀐다.
 *
 * ## 동적 구간은 `routes` 로 찍는다
 *
 *     {"paths": ["/theme", "/theme/us"], "routes": ["/theme/[theme]", "/theme/us/[theme]"]}
 *
 * 패턴 하나가 **그 꼴의 화면 전부**를 비운다 — `revalidatePath(pattern, "page")`(next 16 docs/…/revalidatePath.md).
 * 테마 상세 42장이 그렇다. 목록 두 장만 찍던 때는 요약이 막 들어가도 상세는 잡 끝 전체 비우기까지(최대 한 시간 반)
 * 옛 사본이 나갔다(2026-09-23). 패턴을 `paths` 에 넣으면 여전히 400 이다 — `type` 없이 부르면 조용히 아무 일도 안 일어난다.
 *
 * 비밀은 `REVALIDATE_SECRET`(Vercel 환경변수 · 깃헙 시크릿 같은 값). 없으면 이 라우트는
 * 아무것도 안 하고 503 — 잠그지 않은 채 열어 두면 누구나 우리 캐시를 비워 함수 비용을
 * 올릴 수 있다.
 *
 * ## 비운 시각을 적는다(2026-10-18)
 *
 * 비우기 **앞에** 비운 자리마다 지금 시각을 page_refresh 표에 적는다(supabase/migration_105_page_refresh.sql). 첫 줄
 * '업데이트' 라벨이 그 값을 읽는다(lib/refreshed-at.ts). 처음엔 화면 조회 사본의 응답 시각을 라벨로 썼는데, 운영 Vercel 에선
 * 배포 즈음에 그 사본이 다시 받아져 파이프라인이 안 돌았는데도 라벨이 바뀌었다(10-18 저녁 '오후 7시 30분'→'오후 8시').
 * DB 값은 다음에 그 자리를 비울 때만 바뀐다. 적다가 실패해도 비우기는 그대로 한다 — 라벨만 앞 시각에 머문다.
 *
 * ⚠️ 이 라우트 자체는 캐시되면 안 된다(force-dynamic). POST 라 어차피 안 되지만 명시한다.
 */
export const dynamic = "force-dynamic";

/**
 * 비운 자리마다 지금 시각을 page_refresh 표에 적는다(줄 이름은 lib/revalidate-paths.ts refreshKeys).
 * ⚠️ 비우기 **앞**이다 — 비운 뒤 처음 그리는 화면이 이 값을 읽어야 한다.
 * ⚠️ 데이터 캐시를 안 타게 supabase-js(lib/supabase-server.ts 의 cachedFetch) 말고 PostgREST 를 바로 부른다.
 */
async function stampRefresh(keys: string[]): Promise<boolean> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key || keys.length === 0) return false;
  const at = new Date().toISOString();
  try {
    const res = await fetch(`${url}/rest/v1/page_refresh?on_conflict=target`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(keys.map((target) => ({ target, refreshed_at: at }))),
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      console.error(`[revalidate] page_refresh 를 못 적었습니다 — ${res.status} ${(await res.text()).slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[revalidate] page_refresh 를 못 적었습니다", e);
    return false;
  }
}

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
  const stamped = await stampRefresh(refreshKeys(parsed));
  if (parsed.except) {
    // 이것만 빼고 전부 — 최상위 자리를 하나씩 비운다(lib/revalidate-paths.ts TOP_SEGMENTS).
    for (const t of allExceptTargets(parsed.except)) {
      if (t.type) revalidatePath(t.path, t.type);
      else revalidatePath(t.path);
    }
    return NextResponse.json({ ok: true, revalidated: "all", except: parsed.except, stamped, at: new Date().toISOString() });
  }
  if (parsed.paths.length === 0 && parsed.routes.length === 0) {
    revalidatePath("/", "layout");
    return NextResponse.json({ ok: true, revalidated: "/ (layout)", stamped, at: new Date().toISOString() });
  }
  for (const path of parsed.paths) revalidatePath(path);
  for (const route of parsed.routes) revalidatePath(route, "page");
  return NextResponse.json({ ok: true, revalidated: parsed.paths, routes: parsed.routes, stamped, at: new Date().toISOString() });
}
