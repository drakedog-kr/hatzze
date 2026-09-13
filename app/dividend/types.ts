/**
 * 서버(page.tsx)가 브라우저(DividendCalculator)로 내려보내는 종목 한 줄.
 *
 * lib/dividend.ts 의 DividendStock 을 **계산기가 쓰는 칸만** 남겨 줄인 것이다. 상장 종목
 * 2,777개를 전부 실어 보내므로(검색·담기가 서버를 안 부르게) 칸 하나가 곧 수백 KB 다 —
 * 시가총액·지급일 전체·연도별 합은 서버에서만 쓰고 여기 없다.
 *
 * ⚠️ 이 파일은 `server-only` 가 아니다. 클라이언트 컴포넌트가 타입을 읽는다.
 */
export type StockLite = {
  /** 국내는 6자리 코드, 미국은 티커. */
  code: string;
  name: string;
  /** KOSPI · KOSDAQ · US */
  market: string | null;
  /** 주식인가 ETF 인가. ETF 는 배지가 붙고, 분배금이 손으로 옮긴 값이라 기준일(asOf)을 적는다. */
  kind: "stock" | "etf";
  /** ETF 분배금을 운용사 공시에서 옮긴 날. 주식은 null. */
  asOf: string | null;
  /** 금액 단위. 미국은 달러 — close·dps 가 전부 달러다. 화면이 usdkrw 로 원화를 같이 낸다. */
  currency: "KRW" | "USD";
  /** 검색에만 쓰는 영문명(미국). "coca" 로도 코카콜라가 걸리게. */
  alias: string | null;
  /** 전일 종가(원 또는 달러). null 이면 투자금·수익률을 못 낸다. */
  close: number | null;
  /** 시가총액(억원, 정수). 검색 결과에서 큰 회사를 앞에 세우는 데만 쓴다. */
  cap: number;
  /** 최근 12개월 1주당 현금배당 합(원). 0 이면 최근 1년 배당이 없다. */
  dps: number;
  yieldPct: number | null;
  /** 특별·청산배당이 섞였다(12개월 합이 그 전 회계연도의 두 배 초과). 국내만. */
  unusual: boolean;
  /** 마지막 분기를 네 배 한 추정값이다(미국, 연 행이 없는 회사). 화면이 '추정'이라 적는다. */
  estimated: boolean;
  /** 최근 12개월 지급 건 [달, 1주당 금액]. 달력이 달마다 얼마인지 그린다. */
  pays: [number, number][];
  streak: number;
  growth5: number | null;
  nextRecord: string | null;
  /** 선언됐지만 아직 안 지급된 다음 건(미국 주식·ETF). [지급일, 1주당 금액]. */
  nextPay: [string, number] | null;
  /** 고배당기업(배당소득 분리과세 대상, 2026~2028)으로 공시한 회사. [사업연도, 배당성향 %]. 국내 주식만. */
  highDiv: [number | null, number | null] | null;
};

export type BasketLite = {
  key: "steady" | "yield" | "growth";
  title: string;
  desc: string;
  rule: string;
  icon: string;
  codes: string[];
};

/**
 * 판마다 '더 보기'를 열면 서는 묶음들 — 라벨 하나에 칩 여덟까지. 칩(요즘 여덟)에 이미 선 종목과
 * 앞 묶음에 든 종목은 뒤 묶음에서 뺀다(같은 로고가 한 판에 두 번 서지 않게). 어떤 규칙으로 묶는지는
 * page.tsx 에 있다. `note` 는 묶음 밑에 적는 한 줄 — 여기 없는 건 검색으로 찾으라는 안내와 담긴 수.
 */
export type MoreRow = { label: string; codes: string[] };
export type MoreLists = Record<"kr" | "us" | "etf", { rows: MoreRow[]; note: string }>;
