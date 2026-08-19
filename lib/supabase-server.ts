import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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
