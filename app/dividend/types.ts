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
  code: string;
  name: string;
  market: string | null;
  /** 전일 종가(원). null 이면 투자금·수익률을 못 낸다. */
  close: number | null;
  /** 시가총액(억원, 정수). 검색 결과에서 큰 회사를 앞에 세우는 데만 쓴다. */
  cap: number;
  /** 최근 12개월 1주당 현금배당 합(원). 0 이면 최근 1년 배당이 없다. */
  dps: number;
  yieldPct: number | null;
  /** 특별·청산배당이 섞였다(12개월 합이 그 전 회계연도의 두 배 초과). */
  unusual: boolean;
  /** 최근 12개월 지급 건 [달, 1주당 금액]. 달력이 달마다 얼마인지 그린다. */
  pays: [number, number][];
  streak: number;
  growth5: number | null;
  nextRecord: string | null;
};

export type BasketLite = {
  key: "steady" | "yield" | "growth";
  title: string;
  desc: string;
  rule: string;
  icon: string;
  codes: string[];
};
