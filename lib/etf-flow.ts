import "server-only";
import { cache } from "react";

import { ETF_GROUPS, ETF_PICK_KEYS, etfGroup, etfPickTest, type EtfGroup } from "@/lib/etf-groups";
import { LOAD_FAILED, type MaybeFailed } from "@/lib/load-state";
import { getSupabaseServer } from "@/lib/supabase-server";
import { fetchAllRows } from "@/lib/telegram-data";

/**
 * ETF 자금 흐름 화면(/etf)의 자료 — 뷰 `etf_flow_board`(마이그레이션 094)를 ETF 하나에 한 줄로 읽는다.
 *
 * 순유입은 좌수 변화 × NAV 다(설정·환매로 실제로 들어오고 나간 돈). 셈의 근거와 함정은 수집기
 * data-pipeline/scripts/fetch_etf_flows.py 머리말에 있다.
 *
 * ## 표에 싣는 줄을 줄인다
 *
 * 1,172종목을 다 클라이언트로 보내지 않는다. 고르는 판(전체 · 파킹형·채권 빼고 · 유형 열셋 — lib/etf-groups.ts ETF_PICK_KEYS)마다 ·
 * 정렬(1주 · 1달)마다 · 방향(들어온 · 빠진)마다 앞의 TABLE_ROWS 줄만 있으면 어느 판을 골라도 표가 같다 — 그 합집합만 싣는다.
 *
 * 날짜 스무 개(1달 기간 · 히어로 누적 선)는 KODEX 200(069500, 2002년 상장 · 거래일마다 있다)의 행에서 뽑는다.
 * ETF 마다 날짜별 막대를 그리던 때는 실린 줄을 40종목씩 다시 읽었는데, 표 안 그래픽을 걷으며(2026-10-11) 그 조회도 걷었다.
 *
 * ## 기간
 *
 * 'ETF 자금 흐름' 카드는 하루 · 1주 · 1달을 고른다(2026-10-12 "다른 페이지처럼 기간을 고르게"). 하루는 가장 최근 거래일, 1주는 5거래일,
 * 1달은 20거래일이다. 기간마다 유입 · 수익률 · 순유입일을 ETF 하나에 한 묶음씩 싣는다(EtfRow.p).
 *   유입      1주 · 1달은 뷰의 합, 하루는 그날 값
 *   수익률    기간 첫날의 **앞 거래일** 종가에서 최근 종가까지 + 그 사이 기준일이 든 분배금(n거래일 순유입이 n번의 하루 변화이듯 수익률도
 *             n번의 하루 변화다). 분배금을 빼면 다달이 1~2% 나눠 주는 커버드콜 · 월배당이 그만큼 낮게 선다
 *   순유입일  기간 안 순유입이 0보다 큰 날 수 / 값이 있는 날 수
 * 그래서 최근 여섯 거래일(하루 · 1주의 날별 값과 1주 기준일)과 1달 기준일을 날마다 전 종목으로 읽는다. 1달 기준일 · 최근 거래일 값은
 * 아래 모듈(lib/etf-extras.ts)도 그대로 쓴다(EtfFlowBoard.month · 같은 날을 두 번 읽지 않는다).
 * 1년은 ETF 마다 한 줄로 미리 접은 머티리얼라이즈드 뷰 etf_flow_year(마이그레이션 097 · 수집기가 매일 새로 고친다)를 읽는다 —
 * 시작은 커버드콜 · 레버리지의 1년과 같은 달 말일이고, 그날 종가가 수익률의 기준이다. 뷰가 없거나(마이그레이션 전) 일별 표가 그 시작일까지
 * 차 있지 않으면(first_date > base_date) 1년을 켜지 않는다 — 몇 주치 합을 1년이라 적으면 틀린 값이다.
 */

/**
 * 표가 한 판에 펴는 줄 수 — 같은 카드 왼쪽 유형 목록(전체 · 파킹형·채권 빼고 · 유형 열셋 = 열다섯)과 같은 줄 수. 유형이 늘면 같이 는다. 두 칸 다 머리 줄 30 + 줄 44 라
 * 가로선이 하나하나 맞는다(요약 칸 줄은 두 칸 위에 카드 폭으로 선다 · app/etf/FlowCard.tsx · 2026-10-12).
 * (그 전: 표만 있던 판 스물 → 같은 지수끼리를 표 아래로 더하며 열넷 → 간단화 열셋 → 히어로 띠 열넷 → 배당 유형을 더해 열다섯.)
 */
export const TABLE_ROWS = ETF_PICK_KEYS.length;
/**
 * 히어로 띠 오른쪽 '수익률 상위 ETF' 줄 수 — 옆 브리핑 다섯 줄과 가로선이 맞는 수(2026-10-12 넷 → 다섯 · 브리핑도 '유출' 줄을 더해 다섯).
 * 브리핑이 다섯이 안 되는 날은 화면이 브리핑 줄 수만큼만 편다(app/etf/page.tsx). 배수 상품(레버리지 · 인버스 · 단일종목)은 뺀다 —
 * 넣으면 위가 다 2배 상품이라(2026-10-08 1달 기준) 기사 속 수익률 순위(배수 상품 빼고 테마끼리)와 다른 말이 된다.
 */
const TOP_RETURN_ROWS = 5;
const UNRANKED: EtfGroup[] = ["레버리지", "인버스", "단일종목"];
/** 날짜별 막대의 거래일 수 — 뷰의 20거래일과 같다. */
const WINDOW = 20;
/** 거래일마다 있는 ETF — 날짜 스무 개를 이 종목의 행에서 뽑는다. */
const CALENDAR_CODE = "069500";
/**
 * '지수별 ETF 비교' 표에 세우는 지수 수 — 따르는 ETF 순자산 합이 큰 차례. 왼쪽 지수 목록 줄 수가 오른쪽 표 줄 수(다섯 줄 + '10개 더 보기' 줄 =
 * 여섯 · app/etf/MoreRow.tsx)와 같아야 가로선이 맞는다. 한때 여덟(일곱 줄 + '나머지 보기')이었다 — 2026-10-12 "5위까지 보이고 10개씩"으로
 * 표를 다섯 줄로 줄이며 여섯으로 줄였다(빠진 둘은 순자산 합 7 · 8위 코리아 밸류업 · 코스피).
 */
const COMPARE_INDEXES = 6;
/**
 * 비교표에 드는 지수의 ETF 수 하한 — 고를 거리가 있는 지수만. 둘 · 셋이면(KRX 반도체 · MSCI 코리아 TR) 비교표 줄이 모자라 옆 '같은 지수끼리'
 * 목록과 키가 어긋났다. 2026-10-11 다섯 이상이 꼭 여덟(코스피200 · S&P500 · 나스닥100 · 코스피200 TR ·
 * 코스닥150 · 미국배당다우존스 · 코리아 밸류업 · 코스피).
 */
const COMPARE_MIN_ETFS = 5;

/**
 * 같은 지수끼리 · 비교표에 넣는 ETF — **그 지수를 그대로 따르는 것만.**
 * KRX 추적 지수 칸엔 그 지수를 비교 기준으로만 쓰는 액티브(TIME 미국S&P500액티브 · 에셋플러스 글로벌…액티브)와 배수 상품
 * (TIGER 미국S&P500레버리지)까지 같은 이름으로 온다(2026-10-11 · 'S&P 500' 24개 중 9개). 커버드콜 · 파킹형 · 채권도 돈의 성격이
 * 달라 뺀다. 환헤지(H)는 같은 지수라 넣고 표에서 표시만 한다.
 */
function tracksIndex(name: string, group: EtfGroup): boolean {
  if (name.includes("액티브")) return false;
  return !["레버리지", "인버스", "단일종목", "커버드콜", "파킹형", "채권"].includes(group);
}

/** 비교표 칩의 짧은 이름 — KRX 지수 이름이 길거나 영문이라 자주 보는 것만 줄인다. 나머지는 그대로. */
const INDEX_LABELS: Record<string, string> = {
  "S&P 500": "S&P500",
  "NASDAQ 100": "나스닥100",
  "코스피 200": "코스피200",
  "코스닥 150": "코스닥150",
  "코스피 200 TR": "코스피200 TR",
  "KRX 300": "KRX300",
  "Dow Jones U.S. Dividend 100 Price Return Index": "미국배당다우존스",
  "MSCI Korea TR Index": "MSCI 코리아 TR",
  "코리아 밸류업 지수": "코리아 밸류업",
};
export const indexLabel = (index: string) => INDEX_LABELS[index] ?? index;

export type EtfRow = {
  code: string;
  name: string;
  group: EtfGroup;
  /** 최근 5거래일 순유입(억원) */
  w: number;
  /** 최근 20거래일 순유입(억원) */
  m: number;
  /** 20거래일 중 순유입 값이 있는 날 수 — 20보다 작으면 그 안에 상장했다(히어로 '새 상장') */
  flowDays: number;
  /** 가장 최근 거래일부터 거꾸로 순유입이 이어진 날 수 */
  streak: number;
  /** 순자산(억원) */
  netAsset: number;
  /** 기간마다 유입 · 수익률 · 순유입일(머리말 '기간'). 읽은 기간만 있다(EtfFlowBoard.periods) */
  p: Partial<Record<EtfPeriod, EtfPeriodStat>>;
};

/** 'ETF 자금 흐름' 카드의 기간 — 하루(가장 최근 거래일) · 1주(5거래일) · 1달(20거래일) · 1년(자료가 생기면). */
export type EtfPeriod = "d" | "w" | "m" | "y";
/** 한 기간의 ETF 하나. f 는 순유입(억원), r 은 수익률(%, 분배금 포함 · 그 안에 상장했거나 못 읽었으면 null),
 *  inDays / days 는 순유입이 0보다 큰 날 수 / 값이 있는 날 수(못 읽었으면 null). */
export type EtfPeriodStat = { f: number; r: number | null; inDays: number | null; days: number | null };

/** 한 거래일의 ETF 하나 값 — 기간 고르기의 날들(머리말 '기간')을 전 종목으로 읽어 둔다. flow 는 그날 순유입(원). */
export type EtfPriceRow = { code: string; close: number | null; nav: number | null; index: number | null; indexName: string | null; flow?: number | null };
/** 분배금 한 번(배당 화면의 분배금 표 etf_dividend.payments 한 칸). */
export type EtfPayment = { pay?: string | null; record?: string | null; amount?: number | string | null };
/** 1달 수익률의 두 날 — 서버에서만 쓴다(아래 모듈이 같은 날을 다시 읽지 않게 넘긴다 · 클라이언트로 안 넘긴다). */
export type EtfMonthPrices = {
  /** 20거래일 첫날의 앞 거래일 — 수익률을 이날 종가 · NAV 에서 잰다 */
  base: string;
  /** 20거래일의 첫 거래일 */
  start: string;
  /** 가장 최근 거래일 */
  asOf: string;
  baseRows: Map<string, EtfPriceRow>;
  lastRows: Map<string, EtfPriceRow>;
};

/** 기간(start, end] 에 기준일이 든 분배금 합과 횟수. 기준일이 없으면 지급일로 본다. */
export function paidBetween(pays: EtfPayment[] | undefined, start: string, end: string) {
  let sum = 0;
  let count = 0;
  for (const p of pays ?? []) {
    const day = p.record ?? p.pay;
    if (!day || day <= start || day > end) continue;
    sum += Number(p.amount ?? 0);
    count += 1;
  }
  return { sum, count };
}

/** 유형 하나의 순유입(억원) — w · m 은 히어로 브리핑이, p 는 'ETF 자금 흐름' 카드의 유형 목록이 쓴다. */
export type EtfGroupFlow = { group: EtfGroup; w: number; m: number; count: number; p: Partial<Record<EtfPeriod, number>> };
/** 'ETF 자금 흐름' 카드 요약 칸 — 고른 판(전체 · 파킹형·채권 빼고 · 유형) 하나의 셈. 표에 실린 줄은 일부라 서버가 전 종목으로 센다. */
export type EtfPickFacts = {
  /** 1달 순유입이 +0.5억 넘는 · −0.5억 아래인 ETF 수(±0.5억 안쪽은 안 센다) */
  inN: number;
  outN: number;
  /** 순유입이 0 보다 큰 ETF 의 합 · 0 보다 작은 ETF 의 합(억원) — 순 합(유형 목록의 금액) 안에서 들고 난 돈의 크기. 요약 칸 '순유입 금액' · '순유출 금액'(2026-10-13 '위 3개 비중'을 걷고 더함). */
  inSum: number;
  outSum: number;
  /** 순자산 합(억원)과 그 대비 1달 순유입(%) — 한 달 사이 이 판이 얼마나 불었나(파킹형 순자산이 한 달에 10% 안팎 늘었다).
   *  '20거래일 중 들어온 날 평균'을 먼저 두었다가 걷었다 — 거래가 거의 없는 작은 ETF 가 많아 2.2일처럼 뜻 없는 값이 나왔다(2026-10-11). */
  netAsset: number;
  rate: number | null;
};
/** 같은 지수를 따르는 ETF 를 운용사 상관없이 합친 것(액티브 · 배수 · 커버드콜 · 파킹형 · 채권은 뺀다 · tracksIndex). */
export type EtfIndexFlow = { index: string; label: string; count: number; w: number; m: number };

/** '지수별 ETF 비교' 표의 한 줄. 금액은 억원, 보수 · 분배율은 %. */
export type EtfCompareRow = {
  code: string;
  /** 이름에서 '(H)'를 뺀 것 — 환헤지는 hedged 로 따로 표시한다 */
  name: string;
  hedged: boolean;
  manager: string | null;
  /** 총보수(연 %, 세이브로 ETF종합정보). 못 받았으면 null */
  fee: number | null;
  setupYear: number | null;
  netAsset: number;
  /** 그 지수 ETF 순자산 합 중 이 ETF 몫(%) */
  share: number;
  /** 최근 5거래일 하루 평균 거래대금(억원) */
  tradeValue: number;
  w: number;
  m: number;
  /** 1년 수익률(%, 종가 + 기간 안 분배금 · 'ETF 자금 흐름' 표의 1년과 같은 셈). 1년 안에 상장했거나 1년 보기가 없으면 null */
  r: number | null;
  /** 최근 1년 분배율(%, 배당 화면의 분배금 표). 분배하지 않거나(TR) 기록이 없으면 null */
  yld: number | null;
  /** 분배율이 상장 1년 미만이라 남은 차례를 채운 1년치인가(etf_dividend.estimated · 배당 화면의 '추정' 알약과 같은 뜻) */
  yldEst: boolean;
};
/** 화면 아래 모듈들(lib/etf-extras.ts)이 쓰는 ETF 전체 목록 — 서버에서만 쓴다(클라이언트로 안 넘긴다). */
export type EtfUniverseRow = { code: string; name: string; group: EtfGroup; netAsset: number; tradeValue: number; m: number };
export type EtfCompareIndex = { key: string; label: string; count: number; netAsset: number; w: number; m: number; rows: EtfCompareRow[] };
export type EtfFlowBoard = {
  /** 가장 최근 거래일(YYYY-MM-DD) */
  asOf: string;
  /** 그날 상장된 ETF 수 */
  count: number;
  /** 전체 순자산(억원) */
  netAsset: number;
  /** 전체 5 · 20거래일 순유입(억원) */
  totalW: number;
  totalM: number;
  /** 표에 싣는 줄(판 · 기간 · 정렬 · 방향마다 앞 TABLE_ROWS 줄의 합집합) — 표가 쓰는 칸만 */
  rows: EtfFlowRow[];
  /** 갈래별 순유입 — 20거래일 큰 차례 */
  groups: EtfGroupFlow[];
  /** '지수별 ETF 비교' — 따르는 ETF 순자산 합이 큰 지수 COMPARE_INDEXES 개 */
  compare: EtfCompareIndex[];
  /** 1달(20거래일)의 첫 거래일 — 아래 모듈들이 같은 기간을 쓴다 */
  monthStart: string | null;
  /** ETF 전체의 하루 순유입(억원, 20거래일 · 오래된 날 → 최근). 하루라도 못 읽으면 빈 배열(히어로 선을 안 그린다) */
  daily: { date: string; flow: number }[];
  /** ETF 전체의 하루 거래대금(억원, 최근 5거래일 평균의 합) */
  tradeValue: number;
  /** 히어로 브리핑 재료 — 아래 표에 없는 요약(app/etf/brief.ts). */
  /** 1달 순유입이 큰 위 10개 ETF 의 합이 전체 순유입의 몇 % 인가(전체가 0 이하면 null) */
  top10Share: number | null;
  /** 가장 길게 이어서 들어온 ETF(최근 거래일부터 거꾸로 센 날 수) — 브리핑이 이름을 상세로 잇는다(code) */
  streakTop: { code: string; name: string; streak: number } | null;
  /** 1달 동안 가장 많이 빠진 ETF(빠진 ETF 가 없으면 null) */
  outTop: { code: string; name: string; m: number } | null;
  /** ETF 전체의 1년 순유입(억원) — 1년 보기가 없으면 null(순유입 카드의 기간 줄) */
  totalY: number | null;
  /** 1달(20거래일) 안에 새로 상장한 ETF 수와 그중 1달 순유입이 가장 큰 것 */
  newCount: number;
  /** 고르는 판마다 · 기간마다 요약 칸 셈(키는 lib/etf-groups.ts ETF_PICK_KEYS) */
  picks: Record<string, Partial<Record<EtfPeriod, EtfPickFacts>>>;
  /** 고를 수 있는 기간 — 날별 값을 못 읽으면 하루가 빠진다 */
  periods: EtfPeriod[];
  newTop: { code: string; name: string; m: number } | null;
  /** 1달 수익률(분배금 포함)이 큰 ETF — 배수 상품 빼고 TOP_RETURN_ROWS 개. 1달 수익률을 못 냈으면 빈 배열 */
  topReturns: { code: string; name: string; r: number }[];
  universe: EtfUniverseRow[];
  /** 1달 수익률의 두 날 전 종목 값(서버 전용) — 날짜가 모자라거나 못 읽었으면 null */
  month: EtfMonthPrices | null;
};

/** etf_flow_year 한 줄(마이그레이션 097). 금액은 원. */
type YearRow = {
  isu_cd: string;
  base_date: string | null;
  first_date: string | null;
  flow_1y: number | null;
  in_days: number | null;
  flow_days: number | null;
  base_close: number | null;
};

type BoardRow = {
  isu_cd: string;
  as_of: string | null;
  isu_nm: string | null;
  index_name: string | null;
  net_asset: number | null;
  flow_5d: number | null;
  flow_20d: number | null;
  in_days: number | null;
  flow_days: number | null;
  streak: number | null;
  trade_value_5d: number | null;
};

const EOK = 1e8;
const eok = (won: number | null) => Number(won ?? 0) / EOK;
const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
/** 'ETF 자금 흐름' 표로 보내는 줄 — 표가 쓰는 칸만(EtfRow 의 나머지는 서버에서 히어로 · 비교표가 쓴다). 기간 셋 × 줄 수백이 클라이언트로
 *  간다. ⛔ 값을 미리 반올림해 줄이지 말 것 — 화면이 한 번 더 반올림해 숫자가 1씩 달라졌다(2026-10-12 · 들어온 ETF 275 → 276). */
export type EtfFlowRow = Pick<EtfRow, "code" | "name" | "group" | "streak" | "netAsset" | "p">;

/** 히어로 브리핑 재료 셋 — 쏠림(위 10개 몫) · 가장 긴 연속 유입 · 새 상장. 새 상장은 20거래일 중 순유입 값이 있는 날이 20보다 적은 ETF 다
 *  (상장 첫날은 직전 좌수가 없어 값이 비므로 flowDays 가 상장 뒤 날 수 − 1). */
function heroFacts(rows: EtfRow[], total: number) {
  const top10 = [...rows].sort((a, b) => b.m - a.m).slice(0, 10).reduce((s, r) => s + r.m, 0);
  const streak = [...rows].sort((a, b) => b.streak - a.streak || b.m - a.m)[0];
  const fresh = rows.filter((r) => r.flowDays > 0 && r.flowDays < WINDOW).sort((a, b) => b.m - a.m);
  const out = rows.reduce<EtfRow | null>((m, r) => (r.m < 0 && (!m || r.m < m.m) ? r : m), null);
  return {
    top10Share: total > 0 ? (top10 / total) * 100 : null,
    streakTop: streak && streak.streak > 0 ? { code: streak.code, name: streak.name, streak: streak.streak } : null,
    outTop: out ? { code: out.code, name: out.name, m: out.m } : null,
    newCount: fresh.length,
    newTop: fresh[0] ? { code: fresh[0].code, name: fresh[0].name, m: fresh[0].m } : null,
  };
}

function pickFacts(rows: EtfRow[], per: EtfPeriod): EtfPickFacts {
  const f = (r: EtfRow) => r.p[per]?.f ?? 0;
  const netAsset = rows.reduce((s, r) => s + r.netAsset, 0);
  const sum = rows.reduce((s, r) => s + f(r), 0);
  return {
    inN: rows.filter((r) => f(r) >= 0.5).length,
    outN: rows.filter((r) => f(r) <= -0.5).length,
    inSum: rows.reduce((s, r) => s + Math.max(0, f(r)), 0),
    outSum: rows.reduce((s, r) => s + Math.min(0, f(r)), 0),
    netAsset,
    rate: netAsset > 0 ? (sum / netAsset) * 100 : null,
  };
}

export const getEtfFlowBoard = cache(async (): Promise<MaybeFailed<EtfFlowBoard | null>> => {
  const db = getSupabaseServer();
  let failed = false;
  // 세이브로 분류(etf_info)는 갈래의 마지막 구멍을 막는 곁가지다 — 못 읽으면 이름 규칙만으로 가른다(lib/etf-groups.ts etfGroup).
  // 날짜는 스물하나 — 앞 하나는 1달 수익률의 기준일이다(머리말 '1달 수익률').
  const [raw, cats, days] = await Promise.all([
    fetchAllRows<BoardRow>(
      "isu_cd",
      () =>
        db
          .from("etf_flow_board")
          .select("isu_cd,as_of,isu_nm,index_name,net_asset,flow_5d,flow_20d,in_days,flow_days,streak,trade_value_5d"),
      { onError: () => (failed = true) },
    ),
    fetchAllRows<{ code: string; category: string | null }>("code", () => db.from("etf_info").select("code,category")),
    db
      .from("etf_flow_daily")
      .select("trade_date")
      .eq("isu_cd", CALENDAR_CODE)
      .order("trade_date", { ascending: false })
      .limit(WINDOW + 1),
  ]);
  if (failed) return LOAD_FAILED;
  if (!raw.length) return null;
  const category = new Map(cats.map((c) => [c.code, c.category]));
  const cal = (days.data ?? []).map((d) => d.trade_date as string).reverse();
  const dates = cal.slice(-WINDOW);
  const monthBase = cal.length > WINDOW ? cal[0] : null;
  const lastDay = cal.at(-1) ?? null;

  const all = raw.map((r) => {
    const name = r.isu_nm ?? r.isu_cd;
    const group = etfGroup(r.isu_cd, name, r.index_name, category.get(r.isu_cd));
    return {
      row: {
        code: r.isu_cd,
        name,
        group,
        w: eok(r.flow_5d),
        m: eok(r.flow_20d),
        flowDays: Number(r.flow_days ?? 0),
        streak: Number(r.streak ?? 0),
        netAsset: eok(r.net_asset),
        // 1달은 뷰에서 바로 — 수익률과 하루 · 1주는 아래에서 날별 값 · 분배금을 읽은 뒤 채운다.
        p: { m: { f: eok(r.flow_20d), r: null, inDays: Number(r.in_days ?? 0), days: Number(r.flow_days ?? 0) } } as Partial<Record<EtfPeriod, EtfPeriodStat>>,
      } satisfies EtfRow,
      tradeValue: eok(r.trade_value_5d),
      asOf: r.as_of,
      index: r.index_name,
    };
  });

  const groupMap = new Map<EtfGroup, EtfGroupFlow>(ETF_GROUPS.map((g) => [g, { group: g, w: 0, m: 0, count: 0, p: {} }]));
  for (const a of all) {
    const g = groupMap.get(a.row.group)!;
    g.count += 1;
    g.w += a.row.w;
    g.m += a.row.m;
  }

  // 같은 지수끼리 — 그 지수를 그대로 따르는 ETF 만(tracksIndex). ETF 하나뿐인 지수는 표의 그 줄과 같은 말이라 싣지 않는다.
  const indexMap = new Map<string, EtfIndexFlow & { netAsset: number; members: typeof all }>();
  for (const a of all) {
    const idx = a.index?.trim();
    if (!idx || !tracksIndex(a.row.name, a.row.group)) continue;
    const f = indexMap.get(idx) ?? { index: idx, label: indexLabel(idx), count: 0, w: 0, m: 0, netAsset: 0, members: [] };
    f.count += 1;
    f.w += a.row.w;
    f.m += a.row.m;
    f.netAsset += a.row.netAsset;
    f.members.push(a);
    indexMap.set(idx, f);
  }
  const indexes = [...indexMap.values()].filter((f) => f.count >= 2);

  // 비교표 — 순자산이 큰 지수 몇 개의 ETF 를 보수 · 분배율과 함께 싣는다. 보수 · 분배율 표를 못 읽어도(마이그레이션 전 · 분배 기록 없음)
  // 화면은 그대로 그리고 그 칸만 비운다 — 곁가지다.
  const picked = indexes.filter((f) => f.count >= COMPARE_MIN_ETFS).sort((a, b) => b.netAsset - a.netAsset).slice(0, COMPARE_INDEXES);
  const compareCodes = picked.flatMap((f) => f.members.map((a) => a.row.code));

  // 기간 고르기의 날들(머리말 '기간') — 날짜마다 전 종목(하루 1,172행이라 fetchAllRows 가 isu_cd 차례로 쪽을 나눈다). 날짜 하나에 코드가
  // 하나라 isu_cd 하나로 줄 세워도 쪽이 겹치지 않는다(여러 날을 한 번에 읽으면 정렬 키가 겹친다).
  const readDay = async (day: string) => {
    let dayFailed = false;
    const got = await fetchAllRows<{
      isu_cd: string;
      close_price: number | null;
      nav: number | null;
      index_value: number | null;
      index_name: string | null;
      net_flow: number | null;
    }>("isu_cd", () => db.from("etf_flow_daily").select("isu_cd,close_price,nav,index_value,index_name,net_flow").eq("trade_date", day), {
      onError: () => (dayFailed = true),
    });
    if (dayFailed) return null;
    return new Map<string, EtfPriceRow>(
      got.map((r) => [
        r.isu_cd,
        { code: r.isu_cd, close: num(r.close_price), nav: num(r.nav), index: num(r.index_value), indexName: r.index_name, flow: num(r.net_flow) },
      ]),
    );
  };
  // 1달의 스무 날 전 종목 순유입 — 히어로 선(날별 합)과 그 사이 상장폐지된 ETF 의 몫(아래 '상장폐지 몫')을 같이 낸다. 하루 1,172행이라
  // 1,000행 캡을 넘어 날짜 하나에 두 쪽(isu_cd 차례)씩, 스무 날을 동시에. 하루라도 못 읽으면 null — 선을 안 그리고 상장폐지 몫은 1년만 남는다.
  const perDay = Math.ceil((all.length + 100) / 1000);
  type WindowRow = { isu_cd: string; isu_nm: string | null; index_name: string | null; net_flow: number | null };
  const windowRowsP = Promise.all(
    dates.map(async (d) => {
      const pages = await Promise.all(
        Array.from({ length: perDay }, (_, k) =>
          db.from("etf_flow_daily").select("isu_cd,isu_nm,index_name,net_flow").eq("trade_date", d).order("isu_cd").range(k * 1000, k * 1000 + 999),
        ),
      );
      return pages.some((pg) => pg.error) ? null : pages.flatMap((pg) => (pg.data ?? []) as WindowRow[]);
    }),
  );
  // 최근 여섯 거래일(오래된 → 최근) — 앞 하나는 1주 수익률의 기준일, 뒤 다섯은 1주 순유입일, 끝 둘은 하루 수익률의 기준일 · 그날.
  const recentDays = cal.length >= 6 ? cal.slice(-6) : [];
  // 분배금은 국내 ETF 전부(951행 · 2026-10-12) — 어느 ETF 가 1달 수익률 줄 세우기 앞에 설지 몰라 미리 거를 수 없다.
  let payFailed = false;
  let yearFailed = false;
  const [[infoRes, divRes], baseRows, recentRows, payRows, yearRows] = await Promise.all([
    compareCodes.length
      ? Promise.all([
          db.from("etf_info").select("code,manager,fee_pct,setup_date").in("code", compareCodes),
          db.from("etf_dividend").select("code,ttm_yield_pct,estimated").in("code", compareCodes),
        ])
      : Promise.resolve([{ data: [] }, { data: [] }] as const),
    monthBase ? readDay(monthBase) : Promise.resolve(null),
    Promise.all(recentDays.map(readDay)),
    fetchAllRows<{ code: string; payments: EtfPayment[] | null }>("code", () => db.from("etf_dividend").select("code,payments").eq("market", "KR"), {
      onError: () => (payFailed = true),
    }),
    // 1년 합 — 뷰가 아직 없으면(마이그레이션 097 전) 에러가 오고 1년만 빠진다.
    fetchAllRows<YearRow>("isu_cd", () => db.from("etf_flow_year").select("isu_cd,base_date,first_date,flow_1y,in_days,flow_days,base_close"), {
      onError: () => (yearFailed = true),
    }),
  ]);
  const recentOk = recentDays.length === 6 && recentRows.every(Boolean);
  const day = recentOk ? (recentRows as Map<string, EtfPriceRow>[]) : [];
  const lastRows = day.at(-1) ?? null;
  const month: EtfMonthPrices | null =
    monthBase && lastDay && dates.length && baseRows && lastRows ? { base: monthBase, start: dates[0], asOf: lastDay, baseRows, lastRows } : null;

  // 분배금 표를 못 읽으면 수익률을 비운다 — 분배금 없이 세우면 커버드콜 · 월배당이 1~2%p 낮게 서서 틀린 값이 된다.
  const payments = payFailed ? null : new Map(payRows.map((p) => [p.code, p.payments ?? []]));
  const ret = (code: string, from: Map<string, EtfPriceRow> | null | undefined, fromDay: string | null | undefined) => {
    const a = from?.get(code)?.close;
    const b = lastRows?.get(code)?.close;
    if (!payments || !fromDay || !lastDay || !a || !b) return null;
    return ((b + paidBetween(payments.get(code), fromDay, lastDay).sum) / a - 1) * 100;
  };
  // 날별 값을 못 읽으면 하루는 빼고 1주는 유입만 싣는다(1주 · 1달 합은 뷰에 있다).
  const periods: EtfPeriod[] = recentOk ? ["d", "w", "m"] : ["w", "m"];
  const y0 = yearRows[0];
  const yearBase = !yearFailed && y0?.base_date && y0.first_date && y0.first_date <= y0.base_date ? y0.base_date : null;
  const year = yearBase ? new Map(yearRows.map((r) => [r.isu_cd, r])) : null;
  const yearClose = year
    ? new Map<string, EtfPriceRow>(yearRows.map((r) => [r.isu_cd, { code: r.isu_cd, close: num(r.base_close), nav: null, index: null, indexName: null }]))
    : null;
  if (year) periods.push("y");
  for (const a of all) {
    const { code, p } = a.row;
    if (recentOk) {
      const flows = day.slice(1).map((d) => d.get(code)?.flow ?? null);
      const last = flows.at(-1) ?? null;
      p.d = { f: eok(last), r: ret(code, day[4], recentDays[4]), inDays: last != null && last > 0 ? 1 : 0, days: last != null ? 1 : 0 };
      p.w = { f: a.row.w, r: ret(code, day[0], recentDays[0]), inDays: flows.filter((f) => f != null && f > 0).length, days: flows.filter((f) => f != null).length };
    } else {
      p.w = { f: a.row.w, r: null, inDays: null, days: null };
    }
    p.m!.r = ret(code, baseRows, monthBase);
    if (year) {
      // 그 1년 안에 상장한 ETF 는 뷰에 시작일 종가가 없어 수익률이 빈다(상장 뒤 합만 유입으로).
      const yr = year.get(code);
      p.y = { f: eok(yr?.flow_1y ?? null), r: ret(code, yearClose, yearBase), inDays: Number(yr?.in_days ?? 0), days: Number(yr?.flow_days ?? 0) };
    }
    const g = groupMap.get(a.row.group)!;
    for (const per of periods) g.p[per] = (g.p[per] ?? 0) + (p[per]?.f ?? 0);
  }

  // 상장폐지 몫(2026-10-13) — 기간 안에 순유입이 있었지만 가장 최근 거래일에 행이 없는 ETF. 대부분 만기형 채권 ETF 가 만기에 돌려준 돈이다
  // (1달 다섯 개 −1,151억 · 1년 마흔하나 −2.82조). 뷰(etf_flow_board)는 지금 상장된 ETF 만 실어, 합에서 이 돈이 빠져 'ETF 전체 순유입'이
  // 1.5~2% 높게 섰다(1달 +7.52조 대 +7.40조). 그래서 **합에만** 더한다 — 히어로 합 · 날별 선 · 유형 목록 · 요약 칸. 표 · 수익률 상위 · 비교표는
  // 지금 상장된 ETF 만이다(상세 화면이 없다). 한때 반대로 선(날별 합)에서 이 몫을 뺐다 — 큰 숫자(뷰 합)와 선 끝이 어긋나서였다(2026-10-11).
  const listed = new Set(all.map((a) => a.row.code));
  const windowRows = await windowRowsP;
  const windowOk = windowRows.every((r): r is WindowRow[] => r !== null);
  const goneDays = new Map<string, { name: string; index: string | null; flows: (number | null)[] }>();
  if (windowOk) {
    windowRows.forEach((rows, i) => {
      for (const r of rows) {
        if (listed.has(r.isu_cd)) continue;
        const g = goneDays.get(r.isu_cd) ?? { name: r.isu_nm ?? r.isu_cd, index: r.index_name, flows: dates.map(() => null) };
        g.flows[i] = num(r.net_flow);
        goneDays.set(r.isu_cd, g);
      }
    });
  }
  // 스무 날 앞에 사라져 1년 합에만 남은 것 — 갈래를 가르려고 마지막 행 하나씩(종목 · 날짜 차례 색인을 탄다).
  const yearOnly = year ? yearRows.filter((r) => !listed.has(r.isu_cd) && !goneDays.has(r.isu_cd) && eok(r.flow_1y) !== 0) : [];
  const yearOnlyNames = await Promise.all(
    yearOnly.map((r) =>
      db.from("etf_flow_daily").select("isu_nm,index_name").eq("isu_cd", r.isu_cd).order("trade_date", { ascending: false }).limit(1).maybeSingle(),
    ),
  );
  const stat = (flows: (number | null)[]): EtfPeriodStat => ({
    f: flows.reduce<number>((s, f) => s + eok(f), 0),
    r: null,
    inDays: flows.filter((f) => f != null && f > 0).length,
    days: flows.filter((f) => f != null).length,
  });
  const goneRow = (code: string, name: string, index: string | null, flows: (number | null)[]): EtfRow => {
    const p: Partial<Record<EtfPeriod, EtfPeriodStat>> = { w: stat(flows.slice(-5)), m: stat(flows) };
    if (periods.includes("d")) p.d = { f: 0, r: null, inDays: 0, days: 0 };
    const yr = year?.get(code);
    if (year) p.y = { f: eok(yr?.flow_1y ?? null), r: null, inDays: Number(yr?.in_days ?? 0), days: Number(yr?.flow_days ?? 0) };
    const group = etfGroup(code, name, index, category.get(code));
    return { code, name, group, w: p.w!.f, m: p.m!.f, flowDays: p.m!.days ?? 0, streak: 0, netAsset: 0, p };
  };
  const gone: EtfRow[] = [
    ...[...goneDays].map(([code, g]) => goneRow(code, g.name, g.index, g.flows)),
    ...yearOnly.map((r, i) => {
      const n = yearOnlyNames[i].data as { isu_nm: string | null; index_name: string | null } | null;
      return goneRow(r.isu_cd, n?.isu_nm ?? r.isu_cd, n?.index_name ?? null, []);
    }),
  ];
  for (const r of gone) {
    const g = groupMap.get(r.group)!;
    g.w += r.w;
    g.m += r.m;
    for (const per of periods) g.p[per] = (g.p[per] ?? 0) + (r.p[per]?.f ?? 0);
  }

  // 표에 싣는 줄 — 칩 · 기간 · 정렬(유입 · 수익률) · 방향마다 앞 TABLE_ROWS 줄. 수익률이 없는 줄은 그 정렬에서 맨 아래라 앞 줄에 들 일이 없다.
  const keep = new Set<string>();
  for (const pick of ETF_PICK_KEYS) {
    const test = etfPickTest(pick);
    const pool = all.map((a) => a.row).filter((r) => test(r.group));
    for (const per of periods) {
      for (const key of ["f", "r"] as const) {
        const val = (r: EtfRow) => r.p[per]?.[key] ?? null;
        const sorted = pool.filter((r) => val(r) != null).sort((a, b) => val(b)! - val(a)!);
        for (const r of sorted.slice(0, TABLE_ROWS)) keep.add(r.code);
        for (const r of sorted.slice(-TABLE_ROWS)) keep.add(r.code);
      }
    }
  }
  const info = new Map(((infoRes.data ?? []) as { code: string; manager: string | null; fee_pct: number | null; setup_date: string | null }[]).map((r) => [r.code, r]));
  const divs = new Map(((divRes.data ?? []) as { code: string; ttm_yield_pct: number | null; estimated: boolean | null }[]).map((r) => [r.code, r]));
  const compare: EtfCompareIndex[] = picked.map((f) => ({
    key: f.index,
    label: f.label,
    count: f.count,
    netAsset: f.netAsset,
    w: f.w,
    m: f.m,
    rows: f.members
      .map((a) => {
        const i = info.get(a.row.code);
        const d = divs.get(a.row.code);
        const y = d?.ttm_yield_pct;
        return {
          code: a.row.code,
          name: a.row.name.replace(/\s*\(H\)/, ""),
          hedged: /\(H\)|합성 H/.test(a.row.name),
          manager: i?.manager ?? null,
          fee: i?.fee_pct == null ? null : Number(i.fee_pct),
          setupYear: i?.setup_date ? Number(i.setup_date.slice(0, 4)) : null,
          netAsset: a.row.netAsset,
          share: f.netAsset > 0 ? (a.row.netAsset / f.netAsset) * 100 : 0,
          tradeValue: a.tradeValue,
          w: a.row.w,
          m: a.row.m,
          r: a.row.p.y?.r ?? null,
          yld: y == null || Number(y) <= 0 ? null : Number(y),
          yldEst: y != null && Number(y) > 0 && Boolean(d?.estimated),
        } satisfies EtfCompareRow;
      })
      .sort((a, b) => b.netAsset - a.netAsset),
  }));

  const rows: EtfFlowRow[] = all
    .map((a) => a.row)
    .filter((r) => keep.has(r.code))
    .map(({ code, name, group, streak, netAsset, p }) => ({ code, name, group, streak, netAsset, p }));

  // ETF 전체의 하루 순유입 — 히어로 선. 날마다 상장폐지된 ETF 까지 전 종목을 더한다(위 '상장폐지 몫' · 선 끝이 큰 숫자와 같다).
  const dayTotals = windowOk ? dates.map((d, i) => ({ date: d, flow: windowRows[i].reduce((s, r) => s + eok(r.net_flow), 0) })) : [];

  const asOf = all.map((a) => a.asOf).filter((d): d is string => !!d).sort().at(-1) ?? "";
  const totalW = [...all.map((a) => a.row), ...gone].reduce((s, r) => s + r.w, 0);
  const totalM = [...all.map((a) => a.row), ...gone].reduce((s, r) => s + r.m, 0);
  return {
    asOf,
    count: all.length,
    netAsset: all.reduce((s, a) => s + a.row.netAsset, 0),
    totalW: totalW,
    totalM: totalM,
    rows,
    groups: [...groupMap.values()].sort((a, b) => b.m - a.m),
    compare,
    monthStart: dates[0] ?? null,
    daily: dayTotals,
    tradeValue: all.reduce((s, a) => s + a.tradeValue, 0),
    ...heroFacts(all.map((a) => a.row), totalM),
    totalY: periods.includes("y") ? [...all.map((a) => a.row), ...gone].reduce((s, r) => s + (r.p.y?.f ?? 0), 0) : null,
    picks: Object.fromEntries(
      ETF_PICK_KEYS.map((k) => {
        // 요약 칸은 상장폐지 몫까지 — 들고 난 돈 · ETF 수가 유형 목록 합과 맞게(위 '상장폐지 몫').
        const pool = [...all.map((a) => a.row), ...gone].filter((r) => etfPickTest(k)(r.group));
        return [k, Object.fromEntries(periods.map((per) => [per, pickFacts(pool, per)]))];
      }),
    ),
    periods,
    topReturns: all
      .flatMap((a) => (UNRANKED.includes(a.row.group) || a.row.p.m?.r == null ? [] : [{ code: a.row.code, name: a.row.name, r: a.row.p.m.r }]))
      .sort((x, y) => y.r - x.r)
      .slice(0, TOP_RETURN_ROWS),
    universe: all.map((a) => ({ code: a.row.code, name: a.row.name, group: a.row.group, netAsset: a.row.netAsset, tradeValue: a.tradeValue, m: a.row.m })),
    month,
  };
});
