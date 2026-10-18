import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
// ⚠️ Next 내부 모듈이다(공개 API 아님). 지금 그리는 라우트 이름을 읽는 데만 쓴다 — 아래 '페이지마다 따로' 절.
//    Next 판을 올리면 tests/read-cache.test.ts 가 이 경로를, 타입 검사가 `route` 가 살아 있는지 본다.
import { workAsyncStorage } from "next/dist/server/app-render/work-async-storage.external";

import { clearLoadFailure, noteLoadFailure } from "@/lib/load-state";
import { READ_CACHE_REVALIDATE, readCacheInit } from "@/lib/read-cache";

/**
 * 조회 응답을 Next 데이터 캐시에 어떻게 두나. 값과 요청 init 은 lib/read-cache.ts(순수 함수라 `npm test` 로 본다).
 *
 * ## 왜 캐시하나
 *
 * 이 캐시를 붙일 때(2026-09-17)는 화면이 전부 force-dynamic 이고 HTML 이 no-store 라,
 * **방문 한 번이 곧 Supabase 조회 한 벌**이었다. /kadera 한 번에 `.from()` 이 최대 35번, TTFB 는 /kadera 1.65초 · /dividend
 * 1.47초 · /insider 1.35초(2026-09-17 프로덕션 실측). 그런데 자료는 파이프라인이 하루 두 번
 * 바꿀 뿐이다. 같은 조회를 한 시간 안에 다시 하면 결과가 같은데 매번 DB 를 친 셈이다.
 *
 * ## 어디서 캐시하나 — 함수가 아니라 **fetch**
 *
 * `unstable_cache` 로 조회 함수를 감싸는 길도 있는데, 그러면 함수마다 돌려주는 값이
 * JSON 으로 오갈 수 있는지(Map·Set·Date 는 깨진다) 하나하나 봐야 하고, 실패한 결과(빈
 * 목록·LOAD_FAILED)도 그대로 굳는다. 대신 supabase-js 가 PostgREST 를 부르는 fetch 에
 * `next.revalidate` 를 붙인다. 그러면
 *   - 조회 하나하나(URL·헤더가 키)가 따로 캐시돼 페이징(`offset`·`limit` 쿼리)도 안 섞이고,
 *   - 200 이 아닌 응답은 Next 가 애초에 안 담아 실패는 굳지 않으며,
 *   - 응답이 JSON 텍스트라 값의 꼴을 안 따진다.
 * 야후·FRED 조회가 이미 같은 방식이다(lib/yahoo-quote.ts · lib/usd-krw.ts).
 *
 * ## 한 페이지 안이 따로따로 바뀌지 않게 — 시간으로 만료하지 않는다(2026-10-17)
 *
 * 예전엔 3600초였다. 그러면 파이프라인이 도는 도중(아침 06:10~08:30 · 저녁 17:10~20:00)에 기한이 지난
 * 조회가 **그 순간의 DB** 로 다시 받아졌다. 카더라 표는 오늘 것인데 총평 · 점수는 어제 것인 페이지가
 * 그렇게 나왔다. 그래서 기한을 두지 않는다(`false` — Next 문서의 '무기한'). 조회 사본은 파이프라인이
 * /api/revalidate 로 그 페이지를 비울 때만 새로 받아진다. 화면 사본(ISR)은 레이아웃 · 화면의 revalidate
 * 대로 다시 그려지지만 DB 값은 이 사본을 그대로 쓰니, 그사이 바뀌는 건 시세(야후 · 하이퍼리퀴드 fetch)뿐이다.
 * ⚠️ 그래서 시간이 지나 저절로 새로워지는 안전장치가 없다. 파이프라인의 마지막 비우기(finalize)가
 *    실패하면 다시 시도하고 알림을 연다(daily-update.yml finalize 잡).
 *
 * ## 페이지마다 따로 — 조회 키에 라우트를 넣는다(2026-10-17)
 *
 * 홈 · 카더라 · 테마 · MDD · 탑바 티커가 같은 조회(급부상 종목 · 테마 순위 · 미리보기)를 쓴다. 키가
 * 같으면 사본도 하나라, 카더라 화면을 먼저 비워 다시 그리면 그 공용 사본이 새 값으로 바뀌고 홈이 다음에
 * 다시 그려질 때 그걸 집어 간다 — 홈 안에서 급부상만 새 값, 점수 · 브리핑은 옛 값이 된다. 그래서 요청
 * 머리에 지금 그리는 라우트(`/kadera` · `/stock/[code]` …)를 붙여 **라우트마다 제 사본**을 갖게 한다.
 * revalidatePath 는 그 라우트의 사본만 낡았다고 표시하므로(docs/…/how-revalidation-works.md 의 soft tags),
 * 한 페이지는 파이프라인이 그 페이지를 비울 때 **한꺼번에** 바뀐다. PostgREST 는 모르는 머리를 무시한다.
 * ⚠️ 라우트를 못 읽으면(빌드 밖 · 스크립트) 머리 없이 보낸다 — 그때는 예전처럼 공용 사본이다.
 *
 * ⚠️ GET·HEAD 만 붙인다. RPC(POST)는 그대로 매번 부른다(지금 화면에 RPC 는 없다 — 2026-10-17 확인).
 *    2MB 를 넘는 응답은 Next 가 담지 않는다(PostgREST 한 쪽은 1,000행이라 거기 닿는 조회는 없다).
 * ⚠️ 이 상수를 0 으로 두면 캐시가 통째로 꺼진다 — 파이프라인 직후 확인이 급할 때의 탈출구.
 *
 * ## 화면 사본(ISR)의 주기
 *
 * Next 는 프리렌더되는 라우트 안의 fetch 들 중 **가장 짧은 revalidate 를 그 라우트의 ISR
 * 주기로 쓴다**(docs/incremental-static-regeneration.md). 이 조회가 300 이던 때는 모든 화면이 5분마다
 * 다시 그려졌다(2026-09-19). 무기한은 그 셈에서 빠지므로 주기는 레이아웃 · 화면 · 시세 fetch 가 정한다.
 * 비우기는 동적 화면(/mdd)과 API 까지 미친다(revalidatePath 가 그 아래 fetch 데이터 캐시까지 비운다).
 */

/** 지금 그리는 라우트(`/kadera` · `/stock/[code]` · `/api/ticker`). 렌더 밖이면 undefined. */
export function currentRoute(): string | undefined {
  try {
    return workAsyncStorage.getStore()?.route;
  } catch {
    return undefined;
  }
}

/**
 * 조회 실패를 이번 렌더의 목록에 적는다(lib/load-state.ts 의 noteLoadFailure).
 *
 * supabase-js 는 fetch 가 던지거나 5xx 를 받아도 `{ error }` 로 바꿔 돌려주고, 그걸 받은
 * 코드는 대개 로그만 남기고 폴백을 돌려준다(빈 목록·LOAD_FAILED). 화면이 캐시(ISR)라면
 * 그 폴백이 담긴 페이지가 몇 분 동안 모두에게 간다. 그래서 **모든 Supabase 조회가 지나는
 * 이 자리**에서 실패를 적어 두고, 페이지 끝의 `assertLoaded` 가 던진다. 조회를 감싼 코드는
 * 하나도 안 고쳐도 된다.
 *
 * 5xx 와 끊김(fetch 가 던짐)만 센다. 4xx 는 다시 해도 같은 답이라(없는 행 406 · 잘못된
 * 질의 400) 사본에 담겨도 해가 없고, notFound() 로 가야 하는 경로가 여기 걸리면 안 된다.
 *
 * 곁가지 조회(withScopedLoadFailures 안에서 시작한 것)의 실패는 그 자리 목록으로 간다 — 홈 히어로 칩.
 */
function noteIfFailed(input: RequestInfo | URL, method: string, res: Promise<Response>): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  // 같은 조회의 재시도는 같은 키다. supabase-js 가 끊김·503 을 다시 시도해 성공하면 지운다.
  const key = `${method} ${url}`;
  // 로그에 남길 자리 이름. 호스트와 쿼리를 뗀 경로(rest/v1/표이름)만.
  const where = url.replace(/^https?:\/\/[^/]+\//, "").replace(/\?.*$/, "");
  return res.then(
    (r) => {
      if (r.status >= 500) noteLoadFailure(key, `${where} ${r.status}`);
      else clearLoadFailure(key);
      return r;
    },
    (e: unknown) => {
      noteLoadFailure(key, `${where} ${e instanceof Error ? e.name : "fetch"}`);
      throw e;
    },
  );
}

/** supabase-js 에 넘기는 fetch. 읽기 요청에만 데이터 캐시를 걸고(위 주석), 실패는 적어 둔다. */
function cachedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const method = (init?.method ?? "GET").toUpperCase();
  if (READ_CACHE_REVALIDATE === 0 || (method !== "GET" && method !== "HEAD")) return noteIfFailed(input, method, fetch(input, init));
  return noteIfFailed(input, method, fetch(input, readCacheInit(init, currentRoute())));
}

let client: SupabaseClient | null = null;

/**
 * Supabase 클라이언트를 모듈 로드 시점이 아니라 첫 호출 시점에 생성한다.
 *
 * 모듈 최상위에서 곧바로 만들면, 환경변수가 없는 빌드 환경(예: Vercel에
 * SUPABASE_* 가 아직 설정되지 않은 상태)에서 `next build`의 page-data 수집
 * 단계가 이 모듈을 import하자마자 throw해 빌드 자체가 실패한다. 지연 초기화하면
 * 빌드는 통과하고, 실제 요청으로 데이터를 조회하는 시점에만(그때도 env가
 * 없으면) 명확한 에러로 실패한다 — fail-fast는 유지하되 빌드를 막지 않는다.
 */
export function getSupabaseServer(): SupabaseClient {
  if (client) return client;

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY 환경변수가 설정되어 있지 않습니다.",
    );
  }

  // 읽기 전용 조회이므로 service_role이 아닌 publishable(anon) 키를 사용한다.
  // indicators/indicator_values/daily_score 테이블은 RLS에 공개 SELECT 정책이 있다.
  client = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
    global: { fetch: cachedFetch },
  });

  return client;
}

let adminClient: SupabaseClient | null = null;

/**
 * service_role(secret) 키로 만든 서버 전용 Supabase 클라이언트.
 *
 * 카더라 리포트의 telegram_* 테이블은 감시 목록·원본을 비공개로 두려고 공개 SELECT
 * 정책을 두지 않았다(anon 키로는 못 읽음). 이 클라이언트는 RLS를 우회하므로 반드시
 * 서버(server-only)에서만 쓰고, 브라우저로 새어나가지 않게 한다. getSupabaseServer와
 * 같은 이유로 지연 초기화한다(빌드 시 env 부재로 실패하지 않도록).
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (adminClient) return adminClient;

  const supabaseUrl = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !secretKey) {
    throw new Error(
      "SUPABASE_URL / SUPABASE_SECRET_KEY 환경변수가 설정되어 있지 않습니다.",
    );
  }

  adminClient = createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false },
    global: { fetch: cachedFetch },
  });

  return adminClient;
}

/**
 * PostgREST 의 **1,000행 캡**에 잘렸는지 살펴 로그를 남긴다.
 *
 * ## ⚠️⚠️ 이 고장은 에러가 안 난다
 *
 * 페이징 없이 조회하면 서버가 조용히 앞 1,000행만 준다. 그러면 화면은 **"자료가
 * 적네"** 로 보인다 — 빈 값도 아니고 예외도 아니라서 눈에 안 띈다. 이 저장소가 같은
 * 캡에 걸린 게 **일곱 번**이고, 매번 사람이 우연히 알아채서 고쳤다.
 *
 *   · 순매수가 $112.6B → $164.1B → $106.7B 로 튀었다(정렬 없는 페이징)
 *   · ETF 하루 순유입이 **0억**으로 찍혔다(직전 좌수 조회가 잘려 "좌수가 안 변했다"가 됐다)
 *   · 검사하려고 짠 스크립트마저 같은 캡에 걸려 없는 고장을 만들어 냈다
 *
 * ## ⚠️ 왜 던지지 않고 로그만 남기나
 *
 * 던지면 **정확히 1,000행인 표**가 생기는 순간 화면이 통째로 죽는다. 지금 이 가드를 다는
 * 자리는 전부 최대 33행이라 그럴 일이 없지만, 프로덕션에서 화면을 내리는 값은 크다.
 * 조용한 절단을 **시끄러운 로그**로 바꾸는 것이 이 함수의 전부다.
 *
 * ⭐ `console.error` 다. Vercel 로그에서 경고보다 눈에 띈다.
 *
 * @param where 어느 조회인지. 로그만 보고 자리를 찾을 수 있어야 한다.
 */
export function warnIfRowCapped(rows: readonly unknown[] | null | undefined, where: string) {
  if (rows?.length === 1000) {
    console.error(
      `[1000행 캡] ${where} 가 정확히 1,000행을 받았다 — 잘렸을 가능성이 크다. ` +
        `.range() 페이징을 붙일 것(lib/supabase-server.ts 의 warnIfRowCapped 주석 참고).`,
    );
  }
}

let freshAdminClient: SupabaseClient | null = null;

/**
 * 데이터 캐시를 거치지 않는 service_role 클라이언트 — 종목 로고 판정표(/api/logo)만 쓴다.
 *
 * 화면의 조회 사본은 시간으로 만료되지 않고 파이프라인이 화면을 비울 때만 새로 받는다(위 cachedFetch 주석 · 2026-10-17).
 * 로고 라우트가 그 사본으로 판정표를 읽으니, 판정을 고쳐도(손 보충 · 다시 판정) 다음 비우기까지 옛 판정으로 그림을 만들고
 * 그 그림을 CDN 이 하루 더 들고 있었다(강원랜드가 고친 뒤에도 홍보 사진, 2026-10-19). 로고 응답은 CDN 이 종목 · 크기마다
 * 하루 들고 있으므로 판정표는 매번 새로 읽어도 DB 를 거의 치지 않는다. 한 화면 안이 따로 바뀌는 문제도 로고에는 없다.
 */
export function getSupabaseAdminFresh(): SupabaseClient {
  if (freshAdminClient) return freshAdminClient;

  const supabaseUrl = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !secretKey) {
    throw new Error(
      "SUPABASE_URL / SUPABASE_SECRET_KEY 환경변수가 설정되어 있지 않습니다.",
    );
  }

  freshAdminClient = createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });

  return freshAdminClient;
}
