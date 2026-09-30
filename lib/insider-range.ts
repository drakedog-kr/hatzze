/**
 * 미장 종목 상세(`/insider/stock/…`)의 **차트 기간**과 그 주소.
 *
 * DB 를 안 만지는 순수 값이라 따로 둔다 — 단위 테스트(tests/insider-range.test.ts)가 그대로 부르고,
 * 조회(lib/insider-detail.ts)와 화면(app/insider/stock/…)이 같은 표를 본다.
 *
 * ## 기간은 쿼리가 아니라 경로다 (2026-09-30)
 *
 * 예전엔 `?p=1y` 였다. searchParams 를 읽는 화면은 사본(ISR)에 못 담겨 이 화면만 방문마다 새로 그렸고,
 * 크롤러가 오는 기본 주소까지 같이 느렸다. 지금은 기본 기간이 `/insider/stock/NVDA`, 나머지가
 * `/insider/stock/NVDA/1y` 라 둘 다 사본이 된다. 옛 `?p=` 주소는 next.config.ts 의 리다이렉트가 넘긴다.
 * ⛔ 기간 주소는 색인 대상이 아니다. canonical 은 늘 기본 주소다(같은 화면의 차트 창만 다르다).
 */

/**
 * 차트 기간 선택지.
 *
 * ## ⚠️ 주가가 아니라 **공시가 어디까지 있느냐**로 정했다
 *
 * 벤치마킹한 쪽은 1W·1M·3M·1Y·5Y·ALL 이다. 그쪽 차트의 주인공은 주가지만 **우리 차트의
 * 주인공은 매매 시점**이라, 공시가 없는 구간은 빈 선일 뿐이다. 실측(2026-08-21):
 *
 *   창      임원 장내매매      의원 매매        13F 분기
 *   1개월   2,280건           104건           0개   ← 거물 배지를 눌러도 빈 화면
 *   3개월   8,062건           444건           1개
 *   6개월   11,018건(99.96%)  1,312건         2개   ← 분기 비교가 성립하는 최소
 *   1년     11,021건          2,211건(92%)    3개
 *   2년     11,022건(전부)     2,401건(99.9%)  3개   ← 우리가 가진 전부
 *
 * ⛔ 1주·1개월을 넣지 말 것 — 13F 분기가 0개라 "거물"을 골라도 아무것도 안 뜬다.
 *    눌러서 빈 화면이 나오는 선택지는 두면 안 된다.
 * ⛔ 5년·전체도 넣지 말 것 — 우리 공시가 최대 2년이라 3년이 빈 선이고 마커가 오른쪽
 *    끝에 뭉친다.
 */
export const PRICE_RANGES = [
  { key: "3m", label: "3개월", years: 0.25 },
  { key: "6m", label: "6개월", years: 0.5 },
  { key: "1y", label: "1년", years: 1 },
  { key: "2y", label: "2년", years: 2 },
] as const;

export type PriceRangeKey = (typeof PRICE_RANGES)[number]["key"];

/** 기본 창. 임원이 사실상 전부 들어오고 13F 두 분기가 잡히는 최소다. */
export const PRICE_RANGE_DEFAULT: PriceRangeKey = "6m";

export const yearsOf = (key: string | undefined): number =>
  PRICE_RANGES.find((r) => r.key === key)?.years ??
  PRICE_RANGES.find((r) => r.key === PRICE_RANGE_DEFAULT)!.years;

/** 주소에 올 수 있는 기간 열쇠인가. */
export const isPriceRange = (key: string | undefined): key is PriceRangeKey => PRICE_RANGES.some((r) => r.key === key);

/**
 * 기간 경로(`/insider/stock/NVDA/1y`)가 받는 열쇠 — 기본 기간은 뺀다. 기본 기간에는 경로가 따로 없다
 * (기본 주소 하나가 그 화면이다). next.config.ts 의 옛 `?p=` 리다이렉트도 이 목록과 같아야 한다
 * (tests/insider-range.test.ts 가 맞춰 본다).
 */
export const ALT_RANGE_KEYS: PriceRangeKey[] = PRICE_RANGES.map((r) => r.key).filter((k) => k !== PRICE_RANGE_DEFAULT);

/** 종목 상세의 주소. 기본 기간(또는 기간 없음)이면 기본 주소다. 티커는 부호화한다(`BRK.B` · `UHAL-B`). */
export function stockDetailHref(ticker: string, range?: string): string {
  const base = `/insider/stock/${encodeURIComponent(ticker)}`;
  return range && range !== PRICE_RANGE_DEFAULT && isPriceRange(range) ? `${base}/${range}` : base;
}
