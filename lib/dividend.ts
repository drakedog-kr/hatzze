import "server-only";

import { getSupabaseServer } from "@/lib/supabase-server";

/**
 * 배당으로 살기(/dividend)의 자료 — `kr_dividend_stock` 한 표를 읽는다.
 *
 * 표는 파이프라인이 매일 만든다(data-pipeline/scripts/calculate_kr_dividend_stats.py):
 * 상장 종목 전부에 한 행씩, 최근 12개월 배당금·수익률·지급 건·연속 배당. 여기서는 그걸
 * 화면이 쓰는 모양으로 옮기고 성향별 바스켓을 고른다. 낙폭·이력 같은 건 없다 — 이
 * 화면은 "지금 이 종목을 이만큼 들면 1년에 얼마 받나"만 답한다(2026-09-11 결정).
 */

export type Payment = { record: string; pay: string | null; amount: number };

export type DividendStock = {
  /** 국내는 6자리 코드, 미국은 티커. */
  code: string;
  name: string;
  /** KOSPI · KOSDAQ · US */
  market: string | null;
  /** 미국은 USD. close·dps 가 달러다. */
  currency: "KRW" | "USD";
  /** 영문명(미국). 검색 별칭. */
  alias: string | null;
  /** 전일 종가(원). 없으면 계산기에서 투자금·수익률이 빠진다. */
  close: number | null;
  priceDate: string | null;
  marketCap: number | null;
  /** 최근 12개월 1주당 현금배당 합(원). 0 이면 최근 1년 배당이 없다. */
  dps: number;
  count: number;
  yieldPct: number | null;
  /** 특별·청산배당이 섞였다는 표시(12개월 합이 그 전 회계연도의 두 배 초과). 국내만. */
  unusual: boolean;
  /** 마지막 분기 × 4 추정값(미국). */
  estimated: boolean;
  payMonths: number[];
  payments: Payment[];
  streak: number;
  cuts5: number;
  growth5: number | null;
  nextRecord: string | null;
  isReit: boolean;
  shareKind: string | null;
};

export type BasketKey = "steady" | "yield" | "growth";

export type Basket = {
  key: BasketKey;
  title: string;
  /** 무엇을 우선하는 성향인가 — 시트 머리의 한 줄. */
  desc: string;
  /** 어떤 규칙으로 걸렀나. 화면에 그대로 적는다 — "우리가 골라 줬다"가 아니라 "이 조건으로 걸렀다". */
  rule: string;
  icon: string;
  codes: string[];
};

type Row = {
  code: string;
  name: string;
  market: string | null;
  close: number | null;
  price_date: string | null;
  market_cap: number | null;
  ttm_dps: number;
  ttm_count: number;
  ttm_yield_pct: number | null;
  ttm_unusual: boolean;
  pay_months: number[];
  ttm_payments: Payment[];
  streak_years: number;
  cut_years_5: number;
  growth_5y_pct: number | null;
  next_record_date: string | null;
  is_reit: boolean;
  share_kind: string | null;
  computed_for: string;
};

const COLUMNS =
  "code,name,market,close,price_date,market_cap,ttm_dps,ttm_count,ttm_yield_pct,ttm_unusual,pay_months,ttm_payments,streak_years,cut_years_5,growth_5y_pct,next_record_date,is_reit,share_kind,computed_for";

const n = (v: unknown): number | null => (v == null ? null : Number(v));

function toStock(r: Row): DividendStock {
  return {
    code: r.code,
    name: r.name,
    market: r.market,
    currency: "KRW",
    alias: null,
    close: n(r.close),
    priceDate: r.price_date,
    marketCap: n(r.market_cap),
    dps: Number(r.ttm_dps ?? 0),
    count: r.ttm_count ?? 0,
    yieldPct: n(r.ttm_yield_pct),
    unusual: Boolean(r.ttm_unusual),
    estimated: false,
    payMonths: Array.isArray(r.pay_months) ? r.pay_months.map(Number) : [],
    payments: Array.isArray(r.ttm_payments)
      ? r.ttm_payments.map((p) => ({ record: p.record, pay: p.pay ?? null, amount: Number(p.amount) }))
      : [],
    streak: r.streak_years ?? 0,
    cuts5: r.cut_years_5 ?? 0,
    growth5: n(r.growth_5y_pct),
    nextRecord: r.next_record_date,
    isReit: Boolean(r.is_reit),
    shareKind: r.share_kind,
  };
}

/**
 * 표 전체(상장 종목 2,777행). **페이징한다** — PostgREST 는 1,000행에서 조용히 자른다
 * (lib/supabase-server.ts 머리말, 이 저장소가 일곱 번 밟은 함정). code 가 유일 키라 그걸로 잇는다.
 */
async function loadAll(): Promise<{ rows: Row[]; computedFor: string | null }> {
  const db = getSupabaseServer();
  const rows: Row[] = [];
  let last: string | null = null;
  for (;;) {
    let q = db.from("kr_dividend_stock").select(COLUMNS).order("code").limit(1000);
    if (last) q = q.gt("code", last);
    const { data, error } = await q;
    if (error) throw error;
    const page = (data ?? []) as unknown as Row[];
    rows.push(...page);
    if (page.length < 1000) break;
    last = page[page.length - 1].code;
  }
  const computedFor = rows.reduce<string | null>((m, r) => (r.computed_for > (m ?? "") ? r.computed_for : m), null);
  return { rows, computedFor };
}

/* ── 미국 (us_dividend_stock, 마이그레이션 073) ───────────────────────────
   배당은 SEC 공시, 시세는 핀허브, 환율은 FRED. 국내 표와 같은 모양으로 옮긴다. 지급 건이 없어
   달력에는 못 들어가고, 시가총액이 없어 칩·바스켓에도 안 선다 — 계산기와 검색에서만 산다. */
type UsRow = {
  ticker: string;
  name_ko: string;
  name_en: string | null;
  close: number | null;
  price_date: string | null;
  ttm_dps: number;
  ttm_method: string;
  ttm_yield_pct: number | null;
  streak_years: number;
  cut_years_5: number;
  growth_5y_pct: number | null;
  usdkrw: number | null;
  usdkrw_date: string | null;
  computed_for: string;
};

const US_COLUMNS =
  "ticker,name_ko,name_en,close,price_date,ttm_dps,ttm_method,ttm_yield_pct,streak_years,cut_years_5,growth_5y_pct,usdkrw,usdkrw_date,computed_for";

function toUsStock(r: UsRow): DividendStock {
  return {
    code: r.ticker,
    name: r.name_ko,
    market: "US",
    currency: "USD",
    alias: r.name_en,
    close: n(r.close),
    priceDate: r.price_date,
    marketCap: null,
    dps: Number(r.ttm_dps ?? 0),
    count: 0,
    yieldPct: n(r.ttm_yield_pct),
    unusual: false,
    estimated: r.ttm_method === "annualized",
    payMonths: [],
    payments: [],
    streak: r.streak_years ?? 0,
    cuts5: r.cut_years_5 ?? 0,
    growth5: n(r.growth_5y_pct),
    nextRecord: null,
    isReit: false,
    shareKind: null,
  };
}

export type UsdKrw = { rate: number; date: string | null };

/** 표가 없거나 실패하면 빈 목록 — 미국이 빠져도 국내 계산기는 그대로 뜬다. */
async function loadUs(): Promise<{ stocks: DividendStock[]; fx: UsdKrw | null; priceDate: string | null }> {
  try {
    const { data, error } = await getSupabaseServer().from("us_dividend_stock").select(US_COLUMNS).order("ticker").limit(1000);
    if (error) throw error;
    const rows = (data ?? []) as unknown as UsRow[];
    const fxRow = rows.find((r) => r.usdkrw != null);
    const priceDate = rows.reduce<string | null>((m, r) => (r.price_date && r.price_date > (m ?? "") ? r.price_date : m), null);
    return {
      stocks: rows.map(toUsStock),
      fx: fxRow?.usdkrw != null ? { rate: Number(fxRow.usdkrw), date: fxRow.usdkrw_date } : null,
      priceDate,
    };
  } catch (e) {
    console.error("[dividend] us_dividend_stock 조회 실패", e);
    return { stocks: [], fx: null, priceDate: null };
  }
}

export type DividendData = {
  stocks: DividendStock[];
  baskets: Basket[];
  /** 요약을 계산한 날(KST). 화면의 '기준' 문구. */
  computedFor: string | null;
  /** 종가의 날짜(KRX 전일 종가). */
  priceDate: string | null;
  /** 미국 시세의 날짜(미국 장 기준). 미국 표가 없으면 null. */
  usPriceDate: string | null;
  /** 원/달러(FRED). 미국 표가 없으면 null — 그때 화면은 미국 종목 없이 뜬다. */
  usdkrw: UsdKrw | null;
};

/** 표가 없거나 조회가 실패하면 null — 화면은 "아직 자료가 없습니다"를 낸다. */
export async function getDividendData(): Promise<DividendData | null> {
  let loaded: { rows: Row[]; computedFor: string | null };
  try {
    loaded = await loadAll();
  } catch (e) {
    console.error("[dividend] kr_dividend_stock 조회 실패", e);
    return null;
  }
  if (!loaded.rows.length) return null;
  const all = loaded.rows.map(toStock);
  const priceDate = all.reduce<string | null>((m, s) => (s.priceDate && s.priceDate > (m ?? "") ? s.priceDate : m), null);
  // 종가 날짜가 최신이 아닌 종목은 상장폐지된 것이다(`stocks` 는 지우지 않는다 — fetch_krx_stocks.py).
  // 거래정지는 KRX 목록에 그대로 있어 여기 안 걸린다. 검색에 뜨면 옛 값으로 계산되니 뺀다.
  const kr = priceDate ? all.filter((s) => s.priceDate === priceDate) : all;
  const us = await loadUs();
  // 환율이 없으면 미국 종목을 원화로 못 옮긴다 — 그날은 미국을 통째로 뺀다(반쪽 계산보다 낫다).
  const usStocks = us.fx ? us.stocks : [];
  return {
    stocks: [...kr, ...usStocks],
    baskets: pickBaskets(kr),
    computedFor: loaded.computedFor,
    priceDate,
    usPriceDate: us.fx ? us.priceDate : null,
    usdkrw: us.fx,
  };
}

/* ── 성향별 바스켓 ─────────────────────────────────────────────────────
   규칙은 전부 화면에 글자로 나간다(`rule`). 규칙이 드러난 필터라야 추천이 아니라 분류다 —
   이 화면은 매수·매도를 말하지 않는다. 사용자는 담은 뒤 종목을 빼고 넣을 수 있다.

   ⚠️ 공통 문턱. 시가총액 3,000억 미만은 뺀다(거래가 얇은 종목이 수익률 상위를 채운다).
      수익률 12% 초과와 `unusual`(특별·청산배당 섞임)도 뺀다 — 1년 뒤에도 그 배당이 올
      것처럼 계산기에 들어가면 안 된다. 스팩은 배당이 없지만 이름으로 한 번 더 막는다. */
const MIN_CAP = 3_000e8;
const MAX_YIELD = 12;
const SIZE = 10;

function eligible(s: DividendStock): boolean {
  return (
    s.yieldPct != null &&
    s.yieldPct > 0 &&
    s.yieldPct <= MAX_YIELD &&
    !s.unusual &&
    s.close != null &&
    s.close > 0 &&
    (s.marketCap ?? 0) >= MIN_CAP &&
    !s.name.includes("스팩")
  );
}

export function pickBaskets(stocks: DividendStock[]): Basket[] {
  const pool = stocks.filter(eligible);
  const yieldOf = (s: DividendStock) => s.yieldPct ?? 0;

  // 꾸준함 — 5년 연속 주고 한 번도 안 줄인 회사 중 큰 회사부터. 수익률 순이 아니다 —
  // 그러면 아래 '지금 수익률'과 같은 목록이 된다. 큰 회사부터인 까닭은 이 성향이 묻는 게
  // "안 끊기겠나"이고, 그 답에 가장 가까운 사실이 규모라서다.
  const steady = pool
    .filter((s) => s.streak >= 5 && s.cuts5 === 0 && yieldOf(s) >= 2)
    .sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0))
    .slice(0, SIZE);

  // 지금 수익률 — 3년은 줬어야 한다. 한 해 반짝은 위 공통 문턱이 거르지만, 첫 배당인
  // 회사도 뺀다(1년 뒤에 또 줄지 모른다).
  const high = pool
    .filter((s) => s.streak >= 3)
    .sort((a, b) => yieldOf(b) - yieldOf(a))
    .slice(0, SIZE);

  // 성장 — 5년 연속 주면서 연평균 10% 넘게 늘려 온 회사. 수익률은 낮아도 된다(1% 이상).
  const growth = pool
    .filter((s) => s.streak >= 5 && (s.growth5 ?? 0) >= 10 && yieldOf(s) >= 1)
    .sort((a, b) => (b.growth5 ?? 0) - (a.growth5 ?? 0))
    .slice(0, SIZE);

  return [
    {
      key: "steady",
      title: "꾸준함 우선",
      desc: "오래, 안 줄이고 준 회사",
      rule: "5년 연속 현금배당 · 그 사이 한 번도 안 줄임 · 수익률 2% 이상 · 시가총액 큰 순 10개",
      icon: "verified",
      codes: steady.map((s) => s.code),
    },
    {
      key: "yield",
      title: "지금 수익률 우선",
      desc: "지금 가격에 배당이 가장 큰 회사",
      rule: "3년 연속 현금배당 · 최근 12개월 수익률 높은 순 10개 · 12% 초과와 특별배당은 뺌",
      icon: "trending_up",
      codes: high.map((s) => s.code),
    },
    {
      key: "growth",
      title: "성장 우선",
      desc: "배당을 해마다 늘려 온 회사",
      rule: "5년 연속 현금배당 · 5년 연평균 증가율 10% 이상 · 증가율 높은 순 10개 · 수익률 1% 이상",
      icon: "stairs",
      codes: growth.map((s) => s.code),
    },
  ];
}
