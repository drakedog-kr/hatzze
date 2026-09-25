import type { IconName } from "@/lib/icon-names";
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
  /** 국내 상장 리츠·인프라 펀드. IRP 는 개별 주식은 못 담아도 상장 리츠는 담을 수 있다(2020-07부터). */
  reit: boolean;
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
  /** 최근 12개월 지급 건 [달, 1주당 금액, 날]. 달력이 달마다 얼마인지 그리고, 다가오는 일정이 '지난해 이 날' 로 다음 지급을 어림한다. */
  pays: [number, number, number][];
  streak: number;
  growth5: number | null;
  nextRecord: string | null;
  /** 선언됐지만 아직 안 지급된 다음 건 — 확정값. [지급일, 1주당 금액]. 국내 주식은 배당 결정 공시에서 오고 지급일이 null 일 수 있다
      (그때는 nextRecord 가 기준일). */
  nextPay: [string | null, number] | null;
  /** dps 가운데 실제로 과세되는 몫. null 이면 모름(전액 과세로 센다). 국내 ETF 는 운용사 공시 과표 합, 국내 주식은 감액배당을 뺀 값. */
  taxable: number | null;
  /** 감액배당(비과세)이라고 공시한 문장. 국내 주식만. */
  taxFreeNote: string | null;
  /** 고배당기업(배당소득 분리과세 대상, 2026~2028)으로 공시한 회사. [사업연도, 배당성향 %]. 국내 주식만. */
  highDiv: [number | null, number | null] | null;
  /** 배당성향 [사업연도(미국은 null), %]. 국내는 KIND 배당정보, 미국은 stockanalysis. 주식만. */
  payout: [number | null, number] | null;
  /** 배당을 해마다 늘려 온 햇수(미국 주식, stockanalysis). */
  growthYears: number | null;
  /** 우선주가 보통주보다 몇 % 아래에 거래되나. 우선주만. */
  discount: number | null;
};

/** 서버가 클라이언트로 보내는 꼴 — StockLite 에서 값이 없는 칸(null·false·0)을 뺀 것. 종목 4,366개를 HTML 에 통째로 싣는데
    null 칸이 절반이라 2.2MB 였다(2026-09-17, 모바일에서 페이지가 재시작된다는 제보). 클라이언트가 inflate() 로 다시 채운다. */
export type StockWire = Pick<StockLite, "code" | "name" | "kind" | "currency" | "pays"> & Partial<Omit<StockLite, "code" | "name" | "kind" | "currency" | "pays">>;

/** 뺀 칸을 기본값으로 채운다. 화면 코드는 전부 StockLite(null 이 있는 꼴)를 본다. */
export function inflate(w: StockWire): StockLite {
  return {
    code: w.code,
    name: w.name,
    market: w.market ?? null,
    kind: w.kind,
    reit: w.reit ?? false,
    asOf: w.asOf ?? null,
    currency: w.currency,
    alias: w.alias ?? null,
    close: w.close ?? null,
    cap: w.cap ?? 0,
    dps: w.dps ?? 0,
    yieldPct: w.yieldPct ?? null,
    unusual: w.unusual ?? false,
    estimated: w.estimated ?? false,
    pays: w.pays,
    streak: w.streak ?? 0,
    growth5: w.growth5 ?? null,
    nextRecord: w.nextRecord ?? null,
    nextPay: w.nextPay ?? null,
    taxable: w.taxable ?? null,
    taxFreeNote: w.taxFreeNote ?? null,
    highDiv: w.highDiv ?? null,
    payout: w.payout ?? null,
    growthYears: w.growthYears ?? null,
    discount: w.discount ?? null,
  };
}

export type BasketLite = {
  key: string;
  title: string;
  desc: string;
  rules: string[];
  icon: IconName;
  codes: string[];
  /** 줄 오른쪽에 적는 숫자의 종류(lib/dividend.ts 의 BasketMeta). */
  meta: "streak" | "yield" | "growth" | "months" | "growthYears" | "payout" | "discount" | "septax";
  /** '내 계좌 맞춤'만 — 연금저축을 골랐을 때의 목록. */
  altPension?: string[];
  /** '내 계좌 맞춤'만 — IRP 를 골랐을 때의 목록(안전자산 30% 포함). */
  altIrp?: string[];
  /** '내 계좌 맞춤'만 — 연금저축·IRP 를 골랐을 때 rules 대신 보이는 알약. */
  rulesPension?: string[];
  rulesIrp?: string[];
  /** 바스켓 밑에 붙는 주의 한 줄. */
  caution?: string;
};

/**
 * 판마다 '더 보기'를 열면 서는 묶음들 — 라벨 하나에 칩 여덟까지. 칩(요즘 여덟)에 이미 선 종목과
 * 앞 묶음에 든 종목은 뒤 묶음에서 뺀다(같은 로고가 한 판에 두 번 서지 않게). 어떤 규칙으로 묶는지는
 * page.tsx 에 있다. `note` 는 묶음 밑에 적는 한 줄 — 여기 없는 건 검색으로 찾으라는 안내와 담긴 수.
 */
export type MoreRow = { label: string; codes: string[] };
export type MoreLists = Record<"kr" | "us" | "etf", { rows: MoreRow[]; note: string }>;
