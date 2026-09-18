import { cache } from "react";

/**
 * 조회 **실패**를 정상적인 **빈 값**과 가르는 표시.
 *
 * ## 왜 필요한가
 *
 * 데이터 함수들은 조회가 깨져도 폴백(`[]` · `null` · `{}`)을 돌려준다. 던지면 표 하나
 * 때문에 화면이 통째로 죽기 때문이고, 그 판단은 `warnIfRowCapped` 주석에 적힌 그대로다.
 * 그런데 폴백이 "자료가 없다"와 똑같이 생겨서 **화면이 거짓말을 한다** — 2026-08-06 에
 * 카더라 종목 카드가 "언급 1,002회 · 0개 채널"로 떴던 게 그것이다. 1,002번 언급됐는데
 * 채널이 0일 수는 없다.
 *
 * PR #394 가 그 실패를 로그로 남기게 했다. 여기는 그 다음 절반이다 — **읽는 사람에게도
 * 알린다.** 카드가 "아직 …없습니다" 대신 "불러오지 못했습니다"라고 말하게 한다.
 *
 * ## 왜 심볼이 아니라 문자열인가
 *
 * 이 값은 서버 컴포넌트에서 클라이언트 컴포넌트로 넘어갈 수 있고, 그 경계는 RSC 직렬화를
 * 탄다. `Symbol` 은 직렬화되지 않아 경계를 넘는 순간 죽는다. 문자열은 그냥 넘어간다.
 *
 * ⚠️ 실제 데이터와 부딪히지 않을 값이어야 한다. 밑줄 두 개로 감싼 이 이름이 테마명이나
 *    종목 코드로 나올 일은 없다.
 */
export const LOAD_FAILED = "__load_failed__" as const;

/** `T` 이거나, 조회가 실패했다는 표시이거나. */
export type MaybeFailed<T> = T | typeof LOAD_FAILED;

/**
 * 실패 표시인지 가른다. 타입 가드라 이 뒤에서는 `T` 로 좁혀진다.
 *
 * ⭐ **`if (!rows)` 로 갈음하지 말 것.** `LOAD_FAILED` 는 truthy 라 그 검사에 안 걸리고,
 *    반대로 빈 배열도 truthy 다. 실패와 빈 값을 가르는 것이 이 파일의 존재 이유이므로
 *    검사도 그 둘을 명시적으로 나눠 써야 한다.
 */
export function isLoadFailed<T>(v: MaybeFailed<T>): v is typeof LOAD_FAILED {
  return v === LOAD_FAILED;
}

/**
 * 이번 렌더에서 난 조회 실패의 목록. **요청(렌더) 하나에 하나**다 — React `cache` 가 같은
 * 렌더 안에서는 같은 객체를 돌려준다.
 *
 * ## 왜 필요한가
 *
 * 화면을 캐시(ISR)로 돌리면 렌더 결과가 몇 분 동안 모두에게 간다. 그런데 위의 폴백 방식은
 * 실패를 **정상 렌더의 일부**로 만든다 — "불러오지 못했습니다" 카드가 그려진 페이지도
 * Next 에게는 성공이라 사본에 담긴다. 그러면 DB 가 잠깐 아팠던 순간이 5분짜리 화면이 된다.
 *
 * 반대로 렌더가 **던지면** Next 는 사본을 안 만들고(재생성이었으면 마지막 성공본을 계속
 * 내보내고, 사본이 없으면 error.tsx) 다음 요청에서 다시 시도한다. 그래서 실패를 여기에
 * 모아 두었다가 페이지 끝에서 `assertLoaded` 로 한 번에 던진다.
 *
 * 모으는 자리는 둘이다.
 *   - `lib/supabase-server.ts` 의 fetch 가 5xx·끊김을 만나면 `noteLoadFailure` — 조회를
 *     감싼 코드가 폴백을 돌려주든 LOAD_FAILED 를 돌려주든 상관없이 잡힌다.
 *   - 페이지가 손에 든 LOAD_FAILED 값들(`assertLoaded` 의 두 번째 인자).
 *
 * ⚠️ 4xx 는 안 센다. 없는 행(406)·잘못된 질의(400)는 다시 해도 같은 답이라 사본에 담겨도
 *    해가 없고, `/stock/없는코드` 는 그 406 을 보고 notFound() 로 가야 한다.
 */
export class LoadFailedError extends Error {
  constructor(where: string, failed: readonly string[]) {
    super(`[${where}] 조회 실패라 화면을 사본에 담지 않습니다: ${failed.join(", ")}`);
    this.name = "LoadFailedError";
  }
}

const loadFailures = cache((): Map<string, string> => new Map());

/**
 * 조회 실패를 이번 렌더의 목록에 적는다. 던지지 않는다 — 던지는 것은 `assertLoaded`.
 *
 * `key` 는 같은 조회를 다시 시도했을 때 같아야 한다(메서드 + 전체 URL). supabase-js 가
 * 끊김·503 을 스스로 다시 시도해 성공하면 `clearLoadFailure` 로 지운다 — 첫 시도의
 * 실패만 보고 던지면 결국 받아 온 화면을 버리게 된다.
 */
export function noteLoadFailure(key: string, detail: string): void {
  loadFailures().set(key, detail);
}

/** 같은 조회가 나중에 성공했다. 앞서 적은 실패를 지운다. */
export function clearLoadFailure(key: string): void {
  loadFailures().delete(key);
}

/**
 * 이번 렌더에서 실패한 조회가 있으면 던진다. 페이지가 자료를 다 받은 뒤(JSX 를 돌려주기
 * 전)에 부른다. `results` 에는 페이지가 손에 든 MaybeFailed 값들을 이름 붙여 넘긴다.
 *
 * ⚠️ 자료를 **다 받은 뒤**여야 한다. Promise.all 앞에서 부르면 아직 아무것도 안 적혀 있다.
 *    Suspense 로 따로 흐르는 구간(kadera 의 TrendingSection)은 자기 자료를 받은 뒤 따로 부른다.
 */
export function assertLoaded(where: string, results: Record<string, MaybeFailed<unknown>> = {}): void {
  const named = Object.entries(results)
    .filter(([, v]) => isLoadFailed(v))
    .map(([k]) => k);
  const noted = [...loadFailures().values()];
  if (!named.length && !noted.length) return;
  throw new LoadFailedError(where, [...named, ...noted]);
}
