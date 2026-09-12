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
 * 판마다 '전체 보기'에 세우는 순서 — 배당이 있는 종목 전부의 코드. 칩(여덟)과 같은 잣대라
 * 목록은 칩의 연장으로 읽힌다. 국장·미장은 요즘 채널 언급 순, ETF 는 미국 손순서와 국내 자금
 * 유입 순을 번갈아. 정렬은 브라우저에서 바꿀 수 있고(수익률·이름·시총) 이건 그 기본값이다.
 */
export type BrowseLists = { kr: string[]; us: string[]; etf: string[] };
