import "server-only";

import { getSupabaseAdmin, getSupabaseServer } from "@/lib/supabase-server";
import { fetchAllRows } from "@/lib/telegram-data";

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
  /** 주식인가 ETF 인가. */
  kind: "stock" | "etf";
  /** ETF 분배금을 옮긴 날(etf_dividend.as_of). 주식은 null. */
  asOf: string | null;
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
  /** 선언됐지만 아직 안 지급된 다음 건(미국). */
  nextPay: { date: string; amount: number } | null;
  isReit: boolean;
  shareKind: string | null;
  /** 고배당기업(배당소득 분리과세 대상, 2026~2028)으로 공시한 회사 — KIND 목록(kr_high_dividend). 국내 주식만. */
  highDiv: { payoutPct: number | null; growthPct: number | null; year: number | null } | null;
  /** 배당성향(%) — 국내는 KIND 배당정보의 지난 사업연도(year), 미국은 stockanalysis 의 12개월(year 는 null). 주식만. */
  payout: { pct: number; year: number | null } | null;
  /** 배당을 해마다 늘려 온 햇수(stockanalysis Growth Years). 미국 주식만. */
  growthYears: number | null;
  /** KIND 업종(금융·은행·보험·증권·통신…). 국내 주식만, 배당정보 표에 있는 회사만. */
  sector: string | null;
};

export type BasketKey =
  | "steady"
  | "yield"
  | "growth"
  | "monthly"
  | "covered"
  | "reit"
  | "aristocrat"
  | "payout"
  | "preferred"
  | "septax"
  | "finance"
  | "account";

/** 바스켓 줄 오른쪽에 무엇을 적나 — 성향마다 "왜 여기 들었나"를 말하는 숫자가 다르다. */
export type BasketMeta = "streak" | "yield" | "growth" | "months" | "growthYears" | "payout";

export type Basket = {
  key: BasketKey;
  title: string;
  /** 무엇을 우선하는 성향인가 — 시트 머리의 한 줄. */
  desc: string;
  /** 어떤 규칙으로 걸렀나 — 짧은 조각 서너 개. 화면에 알약으로 선다("우리가 골라 줬다"가 아니라 "이 조건으로 걸렀다"). */
  rules: string[];
  icon: string;
  codes: string[];
  meta: BasketMeta;
  /** '내 계좌 맞춤'만 — 연금 계좌를 골랐을 때의 목록(국내 ETF 만). codes 는 ISA 목록. */
  altPension?: string[];
  /** 바스켓 밑에 붙는 주의 한 줄(커버드콜·리츠·우선주). */
  caution?: string;
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
    kind: "stock",
    asOf: null,
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
    nextPay: null,
    isReit: Boolean(r.is_reit),
    shareKind: r.share_kind,
    highDiv: null,
    payout: null,
    growthYears: null,
    sector: null,
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
  ttm_payments: { pay: string; amount: number }[];
  next_pay_date: string | null;
  next_pay_amount: number | null;
  /** 마이그레이션 078 — stockanalysis 요약 칸. */
  payout_pct: number | null;
  growth_years: number | null;
  usdkrw: number | null;
  usdkrw_date: string | null;
  computed_for: string;
};

const US_COLUMNS =
  "ticker,name_ko,name_en,close,price_date,ttm_dps,ttm_method,ttm_yield_pct,streak_years,cut_years_5,growth_5y_pct,ttm_payments,next_pay_date,next_pay_amount,payout_pct,growth_years,usdkrw,usdkrw_date,computed_for";

function toUsStock(r: UsRow): DividendStock {
  return {
    code: r.ticker,
    name: r.name_ko,
    market: "US",
    kind: "stock",
    asOf: null,
    currency: "USD",
    alias: r.name_en,
    close: n(r.close),
    priceDate: r.price_date,
    marketCap: null,
    dps: Number(r.ttm_dps ?? 0),
    count: 0,
    yieldPct: n(r.ttm_yield_pct),
    unusual: false,
    estimated: r.ttm_method === "annualized" || r.ttm_method === "events",
    // 지급 건은 stockanalysis 에서(마이그레이션 075). 비어 있으면 그 페이지에 없는 종목 — 달력에서 빠진다.
    payMonths: Array.isArray(r.ttm_payments) ? [...new Set(r.ttm_payments.map((p) => Number(p.pay.slice(5, 7))))] : [],
    payments: Array.isArray(r.ttm_payments) ? r.ttm_payments.map((p) => ({ record: p.pay, pay: p.pay, amount: Number(p.amount) })) : [],
    streak: r.streak_years ?? 0,
    cuts5: r.cut_years_5 ?? 0,
    growth5: n(r.growth_5y_pct),
    nextRecord: null,
    nextPay: r.next_pay_date && r.next_pay_amount != null ? { date: r.next_pay_date, amount: Number(r.next_pay_amount) } : null,
    isReit: false,
    shareKind: null,
    highDiv: null,
    payout: r.payout_pct != null ? { pct: Number(r.payout_pct), year: null } : null,
    growthYears: r.growth_years ?? null,
    sector: null,
  };
}

/* ── ETF (etf_dividend, 마이그레이션 074·076) ─────────────────────────────
   미국은 stockanalysis, 국내는 미래에셋 TIGER 분배 내역 — 둘 다 지난 1년 지급 건이라 달력에 든다
   (data-pipeline/scripts/fetch_etf_dividends.py). `as_of` 는 그 내역을 받은 날. 화면이 그 날짜를 적는다. */
type EtfRow = {
  code: string;
  market: string;
  currency: string;
  name_ko: string;
  name_en: string | null;
  cadence: string | null;
  ttm_dps: number;
  estimated: boolean;
  /** 지난 1년에 지급된 건. 국내(TIGER 분배 내역)는 record 가 있고 미국(stockanalysis)은 없다. */
  payments: { record?: string; pay: string; amount: number }[];
  pay_months: number[];
  as_of: string;
  close: number | null;
  price_date: string | null;
  ttm_yield_pct: number | null;
  usdkrw: number | null;
  usdkrw_date: string | null;
  /** 선언됐지만 아직 안 지급된 다음 건(마이그레이션 076). 미국 ETF 만 온다. */
  next_pay_date: string | null;
  next_pay_amount: number | null;
};

function toEtfStock(r: EtfRow): DividendStock {
  const us = r.market === "US";
  return {
    code: r.code,
    name: r.name_ko,
    market: us ? "US" : "KOSPI",
    kind: "etf",
    asOf: r.as_of,
    currency: us ? "USD" : "KRW",
    alias: r.name_en,
    close: n(r.close),
    priceDate: r.price_date,
    marketCap: null,
    dps: Number(r.ttm_dps ?? 0),
    count: Array.isArray(r.payments) ? r.payments.length : 0,
    yieldPct: n(r.ttm_yield_pct),
    unusual: false,
    estimated: Boolean(r.estimated),
    payMonths: Array.isArray(r.pay_months) ? r.pay_months.map(Number) : [],
    payments: Array.isArray(r.payments) ? r.payments.map((p) => ({ record: p.record ?? p.pay, pay: p.pay, amount: Number(p.amount) })) : [],
    streak: 0,
    cuts5: 0,
    growth5: null,
    nextRecord: null,
    nextPay: r.next_pay_date && r.next_pay_amount != null ? { date: r.next_pay_date, amount: Number(r.next_pay_amount) } : null,
    isReit: false,
    shareKind: "ETF",
    highDiv: null,
    payout: null,
    growthYears: null,
    sector: null,
  };
}

async function loadEtf(): Promise<DividendStock[]> {
  try {
    const { data, error } = await getSupabaseServer().from("etf_dividend").select("*").order("code").limit(1000);
    if (error) throw error;
    return ((data ?? []) as unknown as EtfRow[]).map(toEtfStock);
  } catch (e) {
    console.error("[dividend] etf_dividend 조회 실패", e);
    return [];
  }
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

/* ── 고배당기업 (kr_high_dividend, 마이그레이션 077) ────────────────────────
   배당소득 분리과세(2026~2028) 대상으로 공시한 회사 목록. 없거나 실패하면 빈 Map — 표시만 빠진다. */
type HighDivRow = { code: string; payout_pct: number | null; div_growth_pct: number | null; biz_year: number | null };

async function loadHighDiv(): Promise<Map<string, DividendStock["highDiv"]>> {
  const out = new Map<string, DividendStock["highDiv"]>();
  try {
    const { data, error } = await getSupabaseServer().from("kr_high_dividend").select("code,payout_pct,div_growth_pct,biz_year").limit(1000);
    if (error) throw error;
    const rows = (data ?? []) as HighDivRow[];
    if (rows.length >= 1000) console.error("[dividend] kr_high_dividend 가 1,000행에 닿았다 — 페이징이 필요하다");
    for (const r of rows) out.set(r.code, { payoutPct: n(r.payout_pct), growthPct: n(r.div_growth_pct), year: r.biz_year });
  } catch (e) {
    console.error("[dividend] kr_high_dividend 조회 실패", e);
  }
  return out;
}

/* ── 배당성향 (kr_dividend_payout, 마이그레이션 078) ──────────────────────────
   KIND 배당정보 — 회사마다 지난 사업연도의 배당성향. 1,300행쯤이라 두 쪽. 없거나 실패하면 빈 Map. */
type PayoutRow = { code: string; payout_pct: number | null; biz_year: number | null; sector: string | null };

async function loadPayout(): Promise<Map<string, { payout: DividendStock["payout"]; sector: string | null }>> {
  const out = new Map<string, { payout: DividendStock["payout"]; sector: string | null }>();
  try {
    const db = getSupabaseServer();
    for (let from = 0; from < 10_000; from += 1000) {
      const { data, error } = await db.from("kr_dividend_payout").select("code,payout_pct,biz_year,sector").order("code").range(from, from + 999);
      if (error) throw error;
      const rows = (data ?? []) as PayoutRow[];
      for (const r of rows) out.set(r.code, { payout: r.payout_pct != null ? { pct: Number(r.payout_pct), year: r.biz_year } : null, sector: r.sector });
      if (rows.length < 1000) break;
    }
  } catch (e) {
    console.error("[dividend] kr_dividend_payout 조회 실패", e);
  }
  return out;
}

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
  const [us, etf, highDiv, payout] = await Promise.all([loadUs(), loadEtf(), loadHighDiv(), loadPayout()]);
  for (const s of kr) {
    s.highDiv = highDiv.get(s.code) ?? null;
    const p = payout.get(s.code);
    s.payout = p?.payout ?? null;
    s.sector = p?.sector ?? null;
  }
  // 환율이 없으면 미국 종목을 원화로 못 옮긴다 — 그날은 미국을 통째로 뺀다(반쪽 계산보다 낫다).
  const usStocks = us.fx ? us.stocks : [];
  const etfs = etf.filter((s) => s.currency === "KRW" || us.fx);
  return {
    stocks: [...kr, ...usStocks, ...etfs],
    baskets: pickBaskets(kr, usStocks, etfs, highDiv.size > 0),
    computedFor: loaded.computedFor,
    priceDate,
    usPriceDate: us.fx ? us.priceDate : null,
    usdkrw: us.fx,
  };
}

/* ── 종목 하나 — /stock/[code] 의 배당 카드 ───────────────────────────────
   464장이 부르는 자리라 조회는 기본키 셋뿐(kr_dividend_stock · kr_high_dividend · kr_dividend_payout).
   행이 없으면(비상장·ETF) null — 카드를 안 그린다. */
export async function getStockDividend(code: string): Promise<DividendStock | null> {
  try {
    const db = getSupabaseServer();
    const [row, high, payout] = await Promise.all([
      db.from("kr_dividend_stock").select(COLUMNS).eq("code", code).maybeSingle(),
      db.from("kr_high_dividend").select("payout_pct,div_growth_pct,biz_year").eq("code", code).maybeSingle(),
      db.from("kr_dividend_payout").select("payout_pct,biz_year,sector").eq("code", code).maybeSingle(),
    ]);
    if (row.error) throw row.error;
    if (!row.data) return null;
    const s = toStock(row.data as unknown as Row);
    const h = high.data as { payout_pct: number | null; div_growth_pct: number | null; biz_year: number | null } | null;
    const p = payout.data as { payout_pct: number | null; biz_year: number | null; sector: string | null } | null;
    s.highDiv = h ? { payoutPct: n(h.payout_pct), growthPct: n(h.div_growth_pct), year: h.biz_year } : null;
    s.payout = p && p.payout_pct != null ? { pct: Number(p.payout_pct), year: p.biz_year } : null;
    s.sector = p?.sector ?? null;
    return s;
  } catch (e) {
    console.error("[dividend] 종목 배당 조회 실패", code, e);
    return null;
  }
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

/** 미국 ETF 의 손순서 — 커버드콜·달마다 받기 바스켓이 쓴다(page.tsx 의 목록과 같은 이름들). */
const US_ETF_COVERED = ["JEPI", "JEPQ", "QYLD", "XYLD", "RYLD", "DIVO"];
const US_ETF_MONTHLY = ["JEPI", "JEPQ", "DIVO"];
/** 리츠가 아닌 인프라 펀드 — 맥쿼리인프라·KB발해인프라. */
const KR_INFRA = new Set(["088980", "415640"]);
const FINANCE_SECTORS = new Set(["금융", "은행", "보험", "증권"]);
/** 원금을 돌려주는 상품이 섞이는 선. 커버드콜·리츠 바스켓은 이 위를 뺀다(줄 안내도 30% 에서 켜진다). */
const MAX_YIELD_ETF = 30;

const byCap = (a: DividendStock, b: DividendStock) => (b.marketCap ?? 0) - (a.marketCap ?? 0);
const yieldOf = (s: DividendStock) => s.yieldPct ?? 0;
const byYield = (a: DividendStock, b: DividendStock) => yieldOf(b) - yieldOf(a);
const months = (s: DividendStock) => new Set(s.payments.filter((p) => p.pay).map((p) => Number((p.pay as string).slice(5, 7))));

/** 미국 손순서와 국내 목록을 하나씩 번갈아 — 한 바스켓이 한쪽으로만 차지 않게. */
function zip(a: DividendStock[], b: DividendStock[]): DividendStock[] {
  const out: DividendStock[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i]) out.push(a[i]);
    if (b[i]) out.push(b[i]);
  }
  return out;
}

/**
 * 달마다 받기 — 지급 달이 다른 종목을 엮어 열두 달을 채운다. 앞에서부터 "아직 빈 달을 가장 많이 채우는"
 * 종목을 고른다(같으면 목록 순). 분기·반기 배당(지급 달 2~5개)으로 먼저 엮고 — 월배당 하나가 열두 달을 다
 * 덮으면 '조합'이 아니다(리얼티인컴 하나로 끝났다, 2026-09-13) — 그래도 빈 달이 남으면 월배당(주식·ETF)으로
 * 막는다. 열 종목이 차기 전에 다 채워지면 남는 자리는 목록 순으로 채운다.
 */
function coverMonths(kr: DividendStock[], us: DividendStock[], monthlyEtfs: DividendStock[]): DividendStock[] {
  const picked: DividendStock[] = [];
  const covered = new Set<number>();
  const isPeriodic = (s: DividendStock) => months(s).size >= 2 && months(s).size <= 5;
  // 국내로 먼저 채우고(4·5·6·8·9·11·12월이 찬다) 남는 달(1·2·3·7·10월)을 미국 분기 배당으로 — 미국을 같이 놓고
  // 고르면 지급 달이 다섯인 낯선 미국 리츠가 맨 앞에 선다.
  const periodic = [...kr.filter(isPeriodic), ...us.filter(isPeriodic)];
  const monthlyStocks = [...kr, ...us].filter((s) => months(s).size >= 6);
  const pickFrom = (pool: DividendStock[]) => {
    while (picked.length < SIZE && covered.size < 12) {
      let best: DividendStock | null = null;
      let gain = 0;
      for (const s of pool) {
        if (picked.includes(s)) continue;
        const g = [...months(s)].filter((m) => !covered.has(m)).length;
        if (g > gain) {
          gain = g;
          best = s;
        }
      }
      if (!best) return;
      picked.push(best);
      for (const m of months(best)) covered.add(m);
    }
  };
  pickFrom(kr.filter(isPeriodic));
  pickFrom(us.filter(isPeriodic));
  pickFrom([...monthlyStocks, ...monthlyEtfs]);
  for (const s of periodic) {
    if (picked.length >= SIZE) break;
    if (!picked.includes(s)) picked.push(s);
  }
  return picked;
}

export function pickBaskets(kr: DividendStock[], us: DividendStock[], etfs: DividendStock[], haveHighDiv: boolean): Basket[] {
  const pool = kr.filter(eligible);
  const isPref = (s: DividendStock) => s.shareKind != null && s.shareKind !== "보통주";
  const isReit = (s: DividendStock) => s.isReit || KR_INFRA.has(s.code);
  const common = pool.filter((s) => !isPref(s) && !isReit(s));
  const usPayers = us.filter((s) => s.dps > 0 && s.close != null && yieldOf(s) >= 1.5 && yieldOf(s) <= 10);
  const etfByCode = new Map(etfs.map((s) => [s.code, s]));
  const usEtfs = (codes: string[]) => codes.map((c) => etfByCode.get(c)).filter((s): s is DividendStock => !!s && s.close != null);
  const krEtfs = (re: RegExp) => etfs.filter((s) => s.currency === "KRW" && s.dps > 0 && s.close != null && re.test(s.name) && yieldOf(s) >= 2 && yieldOf(s) <= MAX_YIELD_ETF).sort(byYield);

  // 꾸준함 — 5년 연속 주고 한 번도 안 줄인 회사 중 큰 회사부터. 수익률 순이 아니다 —
  // 그러면 아래 '지금 수익률'과 같은 목록이 된다. 큰 회사부터인 까닭은 이 성향이 묻는 게
  // "안 끊기겠나"이고, 그 답에 가장 가까운 사실이 규모라서다.
  const steady = common.filter((s) => s.streak >= 5 && s.cuts5 === 0 && yieldOf(s) >= 2).sort(byCap).slice(0, SIZE);
  // 지금 수익률 — 3년은 줬어야 한다. 한 해 반짝은 위 공통 문턱이 거르지만, 첫 배당인 회사도 뺀다.
  const high = common.filter((s) => s.streak >= 3).sort(byYield).slice(0, SIZE);
  // 성장 — 5년 연속 주면서 연평균 10% 넘게 늘려 온 회사. 수익률은 낮아도 된다(1% 이상).
  const growth = common
    .filter((s) => s.streak >= 5 && (s.growth5 ?? 0) >= 10 && yieldOf(s) >= 1)
    .sort((a, b) => (b.growth5 ?? 0) - (a.growth5 ?? 0))
    .slice(0, SIZE);
  // 달마다 받기 — 국내 큰 회사(1조·2%)와 미국 배당주(오래 늘린 순)를 섞어 열두 달을 채운다.
  const monthly = coverMonths(
    common.filter((s) => (s.marketCap ?? 0) >= 1e12 && yieldOf(s) >= 2 && s.streak >= 3).sort(byCap),
    usPayers.filter((s) => (s.growthYears ?? 0) >= 10).sort((a, b) => (b.growthYears ?? 0) - (a.growthYears ?? 0)),
    usEtfs(US_ETF_MONTHLY),
  );
  // 커버드콜 — 미국 손순서와 TIGER 커버드콜(수익률 순)을 번갈아. 30% 초과(일드맥스류)는 뺀다.
  const covered = zip(usEtfs(US_ETF_COVERED).filter((s) => yieldOf(s) <= MAX_YIELD_ETF), krEtfs(/커버드콜/)).slice(0, SIZE);
  // 리츠·인프라 — 큰 것부터. 청산·특별분배로 30% 를 넘는 건 뺀다.
  const reit = kr.filter((s) => isReit(s) && s.close != null && yieldOf(s) > 0 && yieldOf(s) <= MAX_YIELD_ETF).sort(byCap).slice(0, SIZE);
  // 배당귀족 — 해마다 배당을 25년 넘게 늘려 온 미국 회사, 오래 늘린 순.
  const aristocrat = usPayers
    .filter((s) => (s.growthYears ?? 0) >= 25)
    .sort((a, b) => (b.growthYears ?? 0) - (a.growthYears ?? 0))
    .slice(0, SIZE);
  // 여유 있는 회사 — 배당성향 50% 이하이면서 5년간 배당을 늘려 온 회사. 국내는 시총 1조 이상을 큰 순으로,
  // 미국은 10년 넘게 늘려 온 회사를 오래 늘린 순으로, 번갈아. (증가율 순으로 세웠더니 작은 회사만 섰다.)
  const roomy = (list: DividendStock[], minYield: number) =>
    list.filter((s) => s.payout != null && s.payout.pct > 0 && s.payout.pct <= 50 && s.streak >= 5 && (s.growth5 ?? 0) >= 5 && yieldOf(s) >= minYield);
  const payout = zip(
    roomy(common, 2).filter((s) => (s.marketCap ?? 0) >= 1e12).sort(byCap),
    roomy(usPayers, 1.5).filter((s) => (s.growthYears ?? 0) >= 10).sort((a, b) => (b.growthYears ?? 0) - (a.growthYears ?? 0)),
  ).slice(0, SIZE);
  // 우선주 — 시총 1,000억 이상, 수익률 순. 12% 초과는 공통 문턱이 거른다.
  const preferred = pool.filter((s) => isPref(s) && (s.marketCap ?? 0) >= 1_000e8 && yieldOf(s) >= 2).sort(byYield).slice(0, SIZE);
  // 분리과세 — 고배당기업으로 공시한 회사 중 수익률 3%·시총 1조 이상, 큰 순.
  const septax = common.filter((s) => s.highDiv && yieldOf(s) >= 3 && (s.marketCap ?? 0) >= 1e12).sort(byCap).slice(0, SIZE);
  // 금융주 — KIND 업종이 금융·은행·보험·증권. 큰 순.
  const finance = common.filter((s) => s.sector != null && FINANCE_SECTORS.has(s.sector) && yieldOf(s) >= 2).sort(byCap).slice(0, SIZE);
  // 내 계좌 맞춤 — ISA 는 국내 큰 회사 일곱(수익률 3% 이상, 시총 큰 순) + 배당 지수 ETF 셋, 연금 계좌는 국내 ETF 열
  // (수익률 2~12%, 높은 순 — 커버드콜의 두 자릿수는 뺀다, 은퇴 계좌라).
  const krEtfSteady = etfs.filter((s) => s.currency === "KRW" && s.dps > 0 && s.close != null && yieldOf(s) >= 2 && yieldOf(s) <= MAX_YIELD).sort(byYield);
  const isa = [
    ...common.filter((s) => s.streak >= 3 && yieldOf(s) >= 3 && (s.marketCap ?? 0) >= 1e12).sort(byCap).slice(0, 7),
    ...krEtfSteady.filter((s) => /배당/.test(s.name) && !/커버드콜/.test(s.name)).slice(0, 3),
  ];
  const pension = krEtfSteady.filter((s) => !/커버드콜/.test(s.name)).slice(0, SIZE);

  const codes = (list: DividendStock[]) => list.map((s) => s.code);
  return [
    {
      key: "steady",
      title: "꾸준함 우선",
      desc: "오래, 안 줄이고 준 회사",
      rules: ["5년 연속 배당", "안 줄임", "배당수익률 2%+", "큰 회사 순"],
      icon: "verified",
      codes: codes(steady),
      meta: "streak",
    },
    {
      key: "yield",
      title: "지금 배당수익률 우선",
      desc: "지금 가격에 배당이 가장 큰 회사",
      rules: ["3년 연속 배당", "배당수익률 높은 순", "12% 초과·특별배당 제외"],
      icon: "trending_up",
      codes: codes(high),
      meta: "yield",
    },
    {
      key: "growth",
      title: "성장 우선",
      desc: "배당을 해마다 늘려 온 회사",
      rules: ["5년 연속 배당", "5년 연 +10% 이상", "증가율 순", "배당수익률 1%+"],
      icon: "stairs",
      codes: codes(growth),
      meta: "growth",
    },
    {
      key: "monthly",
      title: "달마다 받기",
      desc: "지급 달이 다른 종목을 엮어 열두 달을 채운 조합",
      rules: ["국내 분기·반기 배당 먼저", "빈 달은 미국 분기 배당", "그래도 빈 달은 월배당", "시총 1조+"],
      icon: "calendar_month",
      codes: codes(monthly),
      meta: "months",
    },
    {
      key: "covered",
      title: "커버드콜 현금흐름",
      desc: "옵션 프리미엄으로 달마다 높은 분배금을 주는 ETF",
      rules: ["미국·TIGER 커버드콜 번갈아", "분배율 30% 이하"],
      icon: "toll",
      codes: codes(covered),
      meta: "yield",
      caution: "분배금엔 주가 상승분을 미리 떼어 받는 몫이 섞입니다. 목표 분배율은 약속이 아닙니다.",
    },
    {
      key: "reit",
      title: "리츠·인프라",
      desc: "건물과 도로가 벌어 주는 임대·통행 수입",
      rules: ["국내 리츠·인프라 펀드", "큰 순", "분배율 30% 이하"],
      icon: "apartment",
      codes: codes(reit),
      meta: "yield",
      caution: "높은 분배율엔 주가 하락과 특별분배가 섞입니다.",
    },
    {
      key: "aristocrat",
      title: "배당귀족",
      desc: "25년 넘게 해마다 배당을 늘려 온 미국 회사",
      rules: ["25년 넘게 해마다 늘림", "배당수익률 1.5~10%", "오래 늘린 순"],
      icon: "workspace_premium",
      codes: codes(aristocrat),
      meta: "growthYears",
    },
    {
      key: "payout",
      title: "여유 있는 회사",
      desc: "번 것의 절반 아래만 배당으로 주면서도 늘려 온 회사",
      rules: ["배당성향 50% 이하", "5년 연 +5% 이상", "국내(1조+)·미국(10년+ 늘림) 번갈아"],
      icon: "shield",
      codes: codes(payout),
      meta: "payout",
    },
    {
      key: "preferred",
      title: "우선주",
      desc: "같은 회사 보통주보다 배당수익률이 높은 우선주",
      rules: ["우선주", "시총 1,000억+", "배당수익률 2~12%", "높은 순"],
      icon: "star",
      codes: codes(preferred),
      meta: "yield",
      caution: "의결권이 없고 거래가 적어 배당수익률이 높아 보입니다. 오래 둘 돈에 맞습니다.",
    },
    {
      key: "septax",
      title: "분리과세",
      desc: "배당이 2,000만원을 넘어도 종합과세에 안 합치는 회사",
      rules: haveHighDiv ? ["고배당기업 공시", "배당수익률 3%+", "시총 1조+", "큰 순"] : ["고배당기업 목록이 아직 없습니다"],
      icon: "receipt_long",
      codes: codes(septax),
      meta: "yield",
    },
    {
      key: "finance",
      title: "금융주",
      desc: "은행·보험·증권·금융지주",
      rules: ["업종 금융·은행·보험·증권", "배당수익률 2%+", "큰 순"],
      icon: "account_balance",
      codes: codes(finance),
      meta: "yield",
    },
    {
      key: "account",
      title: "내 계좌 맞춤",
      desc: "ISA엔 국내 주식·ETF, 연금 계좌엔 국내 ETF만 담긴다",
      rules: ["ISA: 국내 큰 회사 7 + 배당 지수 ETF 3", "연금 계좌: 국내 ETF 10", "커버드콜 제외"],
      icon: "account_balance_wallet",
      codes: codes(isa),
      altPension: codes(pension),
      meta: "yield",
    },
  ];
}

/* ── 앞에 세울 것 고르기 — 우리 자료로 잰 '요즘' ─────────────────────────
   칩 여덟 개를 무엇으로 고르나. 시가총액 순은 늘 같은 얼굴이라(2026-09-12 지적) 우리가 매일 재는
   두 가지로 바꾼다 — 텔레그램 채널 언급(국장·미장)과 국내 상장 ETF 의 설정·환매 자금(ETF).
   둘 다 이 저장소가 이미 매일 쌓는 표라 새 원천이 없다. 미국 ETF 는 그런 자료가 없어 손으로 적은
   순서다(SCHD·JEPI·JEPQ·QYLD). */
export type Trends = {
  /** 국장 종목 코드 → 최근 30일 채널 언급 수 */
  krMentions: Map<string, number>;
  /** 미장 티커 → 최근 30일 채널 언급 수 */
  usMentions: Map<string, number>;
  /** 국내 상장 ETF 코드 → 최근 30일 순유입(원). 미국 기초자산 ETF 만 있다(seohak_etf_daily). */
  etfFlow: Map<string, number>;
};

const TREND_DAYS = 30;

export async function getTrends(): Promise<Trends> {
  const db = getSupabaseAdmin();
  const since = new Date(Date.now() - TREND_DAYS * 86400e3).toISOString().slice(0, 10);
  const krMentions = new Map<string, number>();
  const usMentions = new Map<string, number>();
  const etfFlow = new Map<string, number>();
  // 세 표 다 하루에 수백 행이라 30일이면 1,000행을 넘는다 — 페이징 필수(lib/supabase-server.ts 머리말).
  const [kr, us, etf] = await Promise.all([
    fetchAllRows<{ id: string; stock_code: string; mention_count: number }>("id", () =>
      db.from("telegram_stock_daily").select("id,stock_code,mention_count").gte("date", since),
    ),
    fetchAllRows<{ id: string; ticker: string; mention_count: number }>("id", () =>
      db.from("telegram_us_stock_daily").select("id,ticker,mention_count").gte("date", since),
    ),
    // seohak_etf_daily 는 (trade_date, isu_cd) 가 키라 id 가 없다. 헬퍼가 뒤에 isu_cd 정렬을 붙이므로
    // 여기서 trade_date 를 먼저 걸어 (trade_date, isu_cd) 순 — 유일 키라야 페이지 경계에서 안 빠진다.
    fetchAllRows<{ trade_date: string; isu_cd: string; net_flow: number | null }>("isu_cd", () =>
      db.from("seohak_etf_daily").select("trade_date,isu_cd,net_flow").gte("trade_date", since).order("trade_date"),
    ),
  ]);
  for (const r of kr) krMentions.set(r.stock_code, (krMentions.get(r.stock_code) ?? 0) + (r.mention_count ?? 0));
  for (const r of us) usMentions.set(r.ticker, (usMentions.get(r.ticker) ?? 0) + (r.mention_count ?? 0));
  for (const r of etf) etfFlow.set(r.isu_cd, (etfFlow.get(r.isu_cd) ?? 0) + Number(r.net_flow ?? 0));
  return { krMentions, usMentions, etfFlow };
}

