import { getSupabaseServer } from "@/lib/supabase-server";

/**
 * 서학개미 해부도의 **ETF 층** — 미국에 가는 두 번째 길.
 *
 * 원천은 `seohak_etf_daily`(KRX Open API `etp/etf_bydd_trd`). 국내 상장 미국 ETF 만
 * 담기므로 하루 273행이다.
 *
 * ## ⚠️ 이건 곁길이다. 화면에서 그렇게 밝혀야 한다
 *
 * 서학개미 보유의 62.9% 는 미국 보통주 직접 보유이고 펀드·ETF 는 20.6% 다(2025-06 조사).
 * ⚠️ 예전에 여기 적혀 있던 72.1/20.2 는 **2014년** 값이었다 — 한국 보유가 $59B 이던
 * 시절 숫자를 현재값처럼 인용했다. 지금 값은 seohak_equity_type 이 매년 갱신한다. 게다가
 * 여기 담긴 건 **국내 상장** ETF 라 미국에 직접 상장된 ETF(QQQ 같은)는 안 들어온다.
 *
 * ⚠️⚠️ **채권형은 뺀다**(`BOND_LIKE`). 272 → 217종목. 이 페이지가 '미국 주식' 이야기라
 * 순위표에 국채 ETF 가 끼면 어긋나 보인다. 그 여파로 세 카드의 수가 다 바뀐다 —
 * 괴리율 202 → 161종목, 자금이 오간 종목 84 → 69개, 하루 합계 +2,477 → +2,268억.
 * "서학개미가 어디에 있나"의 답이 아니라 "국내 상장 ETF 로는 어디로 갔나"의 답이다.
 *
 * ## 세 값이 서로 다른 것을 잰다
 *
 * - `trade_value` (거래대금) — 같은 돈이 오간 것까지 센다. 회전이지 유입이 아니다.
 * - `net_flow` (순유입) — 상장좌수 변화 × NAV. 설정·환매만 잡으므로 **실제로 남은 돈**이다.
 *   실측 2026-08-13 에 272종목 중 좌수가 변한 건 84종목뿐이었다.
 * - `premium_pct` (괴리율) — 종가와 NAV 의 차. ⛔ **화면에서 뺐다**(2026-08 '제값과의
 *   차이' 카드 삭제). `EtfRow.premium` 은 남겨 두었지만 쓰는 자리가 없다 — 되살릴 때
 *   히스토리에 괴리율을 원으로 옮기는 요령과 ±0.2% 문턱의 근거가 있다.
 */

/** 괴리율 순위에 넣을 최소 거래대금(원). 이보다 작으면 한두 호가에 값이 튄다. */
const MIN_TRADE_VALUE = 1e8;
/** 주간 카드가 견줄 영업일 수. */
const WEEK_DAYS = 5;
/**
 * 한 번에 받아 오는 **달력일** 수. 주간 카드가 6영업일(끝점 포함)을 쓰는데, 주말과
 * 연휴가 끼면 그게 달력으로 최대 열흘 남짓이라 14일이면 넉넉하다.
 *
 * ⚠️ **'며칠치'를 행 수로 세면 안 된다.** 처음엔 날짜 목록을 `.limit(400)` 으로 받아
 * distinct 를 떴는데, 하루가 272행이라 400행은 **이틀치**였다. 그래서 "최근 5영업일"
 * 카드가 조용히 하루짜리 창을 쓰고 있었다(화면엔 "08-12 ~ 08-13" 으로 찍혔다).
 * 날짜는 날짜로 잘라야 한다 — [[feedback_postgrest_1000_row_cap]] 와 같은 함정이다.
 */
const LOOKBACK_CALENDAR_DAYS = 14;

export type EtfRow = {
  code: string;
  name: string;
  premium: number;
  flucRate: number;
  tradeValue: number;
  netFlow: number;
  hedged: boolean;
  leverage: boolean;
};

export type SeohakEtf = {
  asOf: string;
  /** 그날 미국 ETF 전체. */
  rows: EtfRow[];
  /** 순유입 위·아래 끝. */
  inflow: EtfRow[];
  outflow: EtfRow[];
  netFlowTotal: number;
  hedgedFlow: number;
  unhedgedFlow: number;
  tradeValueTotal: number;
  leverageShare: number;
  /** 주간: 5영업일 등락과 그 기간 순유입 합. */
  weekFrom: string;
  week: { code: string; name: string; changePct: number; netFlow: number }[];
};

type Raw = {
  trade_date: string;
  isu_cd: string;
  isu_nm: string;
  close_price: number | null;
  premium_pct: number | null;
  fluc_rate: number | null;
  trade_value: number | null;
  net_flow: number | null;
  is_hedged: boolean | null;
  is_leverage: boolean | null;
};

/**
 * 최근 며칠치를 한 번에 받는다. 하루 273행이라 12일이면 3,300행 안쪽이고, 1000행 캡을
 * 넘으므로 페이지를 돈다.
 */
async function loadRecent(): Promise<Raw[]> {
  const db = getSupabaseServer();
  // 최신 거래일 한 줄만 집어 거기서 달력으로 거슬러 자른다.
  const { data: days, error: dayErr } = await db
    .from("seohak_etf_daily")
    .select("trade_date")
    .order("trade_date", { ascending: false })
    .limit(1);
  if (dayErr || !days?.length) return [];

  const latest = new Date(`${days[0].trade_date as string}T00:00:00Z`);
  latest.setUTCDate(latest.getUTCDate() - LOOKBACK_CALENDAR_DAYS);
  const oldest = latest.toISOString().slice(0, 10);

  const out: Raw[] = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await db
      .from("seohak_etf_daily")
      .select(
        "trade_date, isu_cd, isu_nm, close_price, premium_pct, fluc_rate, trade_value, net_flow, is_hedged, is_leverage",
      )
      .gte("trade_date", oldest)
      .order("trade_date", { ascending: false })
      .order("isu_cd", { ascending: true })
      .range(start, start + 999);
    if (error) return out;
    const page = (data ?? []) as Raw[];
    out.push(...page);
    if (page.length < 1000) return out;
  }
}

const n = (v: number | null | undefined) => Number(v ?? 0);

/**
 * 채권형·채권혼합형을 걸러 낸다. 이 페이지는 **미국 주식** 이야기다.
 *
 * 원천(KRX `etp/etf_bydd_trd`)에 자산군 칸이 없어서 이름으로 자를 수밖에 없다. 272종목
 * 중 55개가 걸리고, 실측으로 **빠진 것 전부가 실제 채권형**이었다(국채·회사채·하이일드·
 * 머니마켓·혼합50).
 *
 * ⚠️⚠️ **`CP` 를 넣으면 안 된다.** 기업어음을 잡으려고 넣었다가 `KIWOOM 미국CPU반도체
 * TOP4+` 와 `KODEX 미국CPU반도체TOP10` 이 채권으로 빠졌다. CP 만 담는 상품은 목록에
 * 없으니 아예 뺀다. 같은 이유로 `금리` 도 안 넣는다.
 *
 * ⚠️ '혼합50'(주식 절반 + 국채 절반)은 **뺀다.** 절반이 주식이라 아깝지만, 남기면
 * 자금 유입 순위에 "S&P500미국채혼합50" 이 S&P500 과 나란히 서서 같은 것으로 읽힌다.
 *
 * ⭐ 남는 쪽에 커버드콜·배당·리츠·우선증권이 있는 건 맞다. 전부 주식(과 그 파생)이라
 * 이 페이지의 이야기 안이다.
 */
const BOND_LIKE = /국채|채권|회사채|혼합|하이일드|크레딧|머니마켓|MMF|TIPS/;

export async function getSeohakEtf(): Promise<SeohakEtf | null> {
  const raw = await loadRecent();
  if (!raw.length) return null;

  const dates = [...new Set(raw.map((r) => r.trade_date))].sort().reverse();
  const asOf = dates[0];
  const today = raw.filter((r) => r.trade_date === asOf);
  if (!today.length) return null;

  const rows: EtfRow[] = today
    .filter((r) => !BOND_LIKE.test(r.isu_nm))
    .map((r) => ({
    code: r.isu_cd,
    name: r.isu_nm,
    premium: n(r.premium_pct),
    flucRate: n(r.fluc_rate),
    tradeValue: n(r.trade_value),
    netFlow: n(r.net_flow),
    hedged: !!r.is_hedged,
    leverage: !!r.is_leverage,
    }));

  const byFlow = [...rows].sort((a, b) => b.netFlow - a.netFlow);
  const tradeValueTotal = rows.reduce((s, r) => s + r.tradeValue, 0);

  // ── 주간: 5영업일 전과 견준다. 그 사이 휴장이 끼어도 '영업일 5개'로 센다.
  const weekDates = dates.slice(0, WEEK_DAYS + 1);
  const weekFrom = weekDates[weekDates.length - 1];
  const closeAt = (day: string) => {
    const m = new Map<string, number>();
    for (const r of raw) if (r.trade_date === day) m.set(r.isu_cd, n(r.close_price));
    return m;
  };
  const start = closeAt(weekFrom);
  const end = closeAt(asOf);
  const flowSum = new Map<string, number>();
  for (const r of raw) {
    if (r.trade_date <= weekFrom || r.trade_date > asOf) continue;
    flowSum.set(r.isu_cd, (flowSum.get(r.isu_cd) ?? 0) + n(r.net_flow));
  }
  const week = rows
    .filter((r) => (start.get(r.code) ?? 0) > 0 && r.tradeValue >= MIN_TRADE_VALUE)
    .map((r) => ({
      code: r.code,
      name: r.name,
      changePct: ((end.get(r.code) ?? 0) / (start.get(r.code) ?? 1) - 1) * 100,
      netFlow: flowSum.get(r.code) ?? 0,
    }));

  return {
    asOf,
    rows,
    // 카드가 좌우 두 칸으로 갈렸다. 한 칸에 다섯씩이면 두 칸 높이가 맞고, 값이 0 이
    // 아닌 종목이 84개라 재료는 넉넉하다.
    inflow: byFlow.filter((r) => r.netFlow > 0).slice(0, 5),
    outflow: byFlow.filter((r) => r.netFlow < 0).slice(-5).reverse(),
    netFlowTotal: rows.reduce((s, r) => s + r.netFlow, 0),
    hedgedFlow: rows.filter((r) => r.hedged).reduce((s, r) => s + r.netFlow, 0),
    unhedgedFlow: rows.filter((r) => !r.hedged).reduce((s, r) => s + r.netFlow, 0),
    tradeValueTotal,
    leverageShare: tradeValueTotal
      ? (rows.filter((r) => r.leverage).reduce((s, r) => s + r.tradeValue, 0) / tradeValueTotal) *
        100
      : 0,
    weekFrom,
    week,
  };
}
