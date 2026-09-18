import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { clearLoadFailure, noteLoadFailure } from "@/lib/load-state";

/**
 * 조회 응답을 Next 데이터 캐시에 두는 시간(초).
 *
 * ## 왜 캐시하나
 *
 * 이 캐시를 붙일 때(2026-09-17)는 화면이 전부 force-dynamic 이고 HTML 이 no-store 라,
 * **방문 한 번이 곧 Supabase 조회 한 벌**이었다. /kadera 한 번에 `.from()` 이 최대 35번, TTFB 는 /kadera 1.65초 · /dividend
 * 1.47초 · /insider 1.35초(2026-09-17 프로덕션 실측). 그런데 자료는 파이프라인이 하루 두 번
 * 바꿀 뿐이다. 같은 조회를 5분 안에 다시 하면 결과가 같은데 매번 DB 를 친 셈이다.
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
 * 야후·FRED 조회가 이미 같은 방식이다(lib/yahoo-quote.ts · lib/seohak-external.ts).
 *
 * ## 무엇이 달라지나
 *
 * 파이프라인이 끝난 뒤 최대 5분까지 옛 값이 보일 수 있다. 화면의 '최종 업데이트' 시각은
 * 자료에서 나오므로 보이는 값과 어긋나지 않는다. 데일리 노트를 손으로 올린 직후에도 같은
 * 5분이 걸린다. 캐시 기한이 지나면 **먼저 옛 값을 주고 뒤에서 새로 받는다**(Next 데이터
 * 캐시의 stale-while-revalidate) — 기한이 지난 첫 방문자가 느려지지 않는다.
 *
 * ⚠️ GET·HEAD 만 붙인다. RPC(POST)는 그대로 매번 부른다. 2MB 를 넘는 응답은 Next 가
 *    담지 않는다(PostgREST 한 쪽은 1,000행이라 거기 닿는 조회는 없다).
 * ⚠️ 이 상수를 0 으로 두면 캐시가 통째로 꺼진다 — 파이프라인 직후 확인이 급할 때의 탈출구.
 */
export const READ_CACHE_SECONDS = 300;

/** Next 의 fetch 확장(next.revalidate)까지 받는 init 타입(lib/yahoo-quote.ts 와 같은 꼴). */
type FetchInit = RequestInit & { next?: { revalidate?: number } };

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
  if (READ_CACHE_SECONDS <= 0 || (method !== "GET" && method !== "HEAD")) return noteIfFailed(input, method, fetch(input, init));
  const withCache: FetchInit = { ...init, next: { revalidate: READ_CACHE_SECONDS } };
  return noteIfFailed(input, method, fetch(input, withCache));
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
