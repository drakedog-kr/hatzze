import "server-only";
import { cache } from "react";

import { isAbroadEtf, leverMult } from "@/lib/etf-extras";
import { CALENDAR_CODE, indexLabel, paidBetween, type EtfPayment } from "@/lib/etf-flow";
import { etfGroup, type EtfGroup } from "@/lib/etf-groups";
import { getSupabaseServer } from "@/lib/supabase-server";
import { fetchAllRows } from "@/lib/telegram-data";

/**
 * ETF 상세 화면(/etf/[code])의 자료 — ETF 하나의 1년치 일별 값 · 세이브로 정보 · 분배금 · 같은 지수 ETF.
 *
 * ## 무엇을 앞에 두나(2026-10-12 리서치)
 *
 * 네이버 검색어 트렌드로 많이 찾는 ETF 여섯(TIGER 미국S&P500 · KODEX 200 …) 이름 뒤에 붙는 말을 쟀다(이름만 = 1).
 * 주가 · 차트 0.078 · 분배금 · 배당 0.019 · 연금 · ISA · 세금 0.004 · 지급일 0.004 · 보수 0.0005 · 구성종목 0.0001 · 괴리율 0.
 * 그래서 가격 추이(수익률 카드)와 분배금이 주인공이고, 우리만 가진 자료인 자금 흐름(좌수 변화 × NAV)이 그 옆에 선다.
 * 채널 언급은 두지 않는다 — 14일치 채널 글 5만 8,794건 중 'KODEX' 40 · 'TIGER' 44건이라 ETF 하나에는 너무 얇다.
 *
 * ## 기간
 *
 * 1주 · 1달 · 3달 · 6달은 5 · 20 · 60 · 120거래일, 1년은 커버드콜 · 레버리지 카드 · 메인 1년 뷰와 같은 날(최근 거래일에서 365일 앞 이전의
 * 가장 가까운 거래일)부터다. 수익률은 메인 화면 표와 같은 셈 — 기준일 종가에서 최근 종가까지 + 그 사이 기준일이 든 분배금(lib/etf-flow.ts 머리말).
 * 그 1년 안에 상장했으면 1년 대신 상장 이후를 쓴다.
 *
 * ## 셀 화면이 1,172장이다
 *
 * 메인 화면의 getEtfFlowBoard 를 부르지 않는다 — 그건 전 종목 날별 값 · 분배금 951행을 읽는 무거운 셈이라 상세 화면마다 부르면
 * 그 대가가 1,172배다. 여기서는 이 ETF 의 일별 행(1년 260행 안팎 · 한 번) · 정보 · 분배금 각 한 줄, 순위와 같은 지수를 가르는
 * 뷰 한 벌(1,172행 · 두 쪽), 같은 지수 후보의 정보 · 분배율만 읽는다.
 */

/** 일별 유입 막대의 거래일 수 — 석 달. */
export const FLOW_BARS = 60;

type DayRow = {
  trade_date: string;
  isu_nm: string | null;
  index_name: string | null;
  close_price: number | null;
  nav: number | null;
  fluc_rate: number | null;
  trade_value: number | null;
  net_asset: number | null;
  net_flow: number | null;
  index_value: number | null;
};
type InfoRow = {
  code: string;
  name: string | null;
  manager: string | null;
  fee_pct: number | null;
  setup_date: string | null;
  category: string | null;
  benchmark: string | null;
};
type DivRow = {
  code: string;
  cadence: string | null;
  ttm_yield_pct: number | null;
  estimated: boolean | null;
  payments: EtfPayment[] | null;
  next_pay_date: string | null;
  next_pay_amount: number | null;
};
type BoardRow = {
  isu_cd: string;
  isu_nm: string | null;
  index_name: string | null;
  net_asset: number | null;
  flow_20d: number | null;
  trade_value_5d: number | null;
};

export type EtfDetailPeriodKey = "w" | "m" | "q" | "h" | "y";
/** 기간 하나 — 수익률(%, 분배금 포함) · 추적 지수 변화(%, 국내 기초만) · 순유입(억원) · 순유입일 / 값이 있는 날. 기간만큼 자료가 없으면 null. */
export type EtfDetailPeriod = {
  key: EtfDetailPeriodKey;
  label: string;
  from: string;
  ret: number | null;
  idx: number | null;
  flow: number;
  inDays: number;
  days: number;
};
export type EtfDetailPayment = {
  record: string | null;
  pay: string | null;
  amount: number;
  /** 기준일 종가 대비(%) */ pct: number | null;
};
export type EtfSibling = {
  code: string;
  name: string;
  /** 환헤지(H) — 이름에서 떼고 꼬리표로 단다(메인 비교표와 같다) */
  hedged: boolean;
  netAsset: number;
  fee: number | null;
  tradeValue: number;
  m: number;
  /** 1년 수익률(%, 종가 + 기간 안 분배금 — 메인 비교표와 같은 셈 · 같은 시작일). 1년 안에 상장했으면 null */
  r: number | null;
  yld: number | null;
  yldEst: boolean;
  self: boolean;
};

export type EtfDetail = {
  code: string;
  name: string;
  group: EtfGroup;
  /** 가장 최근 거래일 */
  asOf: string;
  close: number | null;
  /** 그날 등락률(%, KRX FLUC_RT) */
  changeRate: number | null;
  /** 순자산(억원) */
  netAsset: number;
  /** 최근 5거래일 하루 평균 거래대금(억원) */
  tradeValue: number;
  /** 가장 최근 거래일 괴리율(%, 종가 ÷ NAV − 1) */
  gap: number | null;
  manager: string | null;
  fee: number | null;
  setupDate: string | null;
  /** 추적 지수 — KRX 이름과 줄인 이름(비교표와 같은 줄임) · 세이브로 기초지수 전문 */
  index: { name: string; label: string; benchmark: string | null } | null;
  /** 해외 기초인가 — '추적 지수 대비'를 세우지 않는다(지수 값과 NAV 의 날짜 · 통화가 어긋난다 · lib/etf-extras.ts isAbroadEtf) */
  abroad: boolean;
  /** 수익률 카드의 큰 숫자 기간 — 1년, 그 안에 상장했으면 상장 이후 */
  head: EtfDetailPeriod & { sinceListing: boolean };
  periods: EtfDetailPeriod[];
  /** 수익률 카드의 선 — 큰 숫자 기간의 일별 종가 */
  line: { date: string; close: number; change: number | null }[];
  high: { date: string; close: number } | null;
  low: { date: string; close: number } | null;
  /** 하루 순유입(억원) — 가장 최근 거래일 */
  flowDay: number | null;
  /** 일별 유입 막대 — 최근 FLOW_BARS 거래일 */
  flows: { date: string; flow: number | null; close: number | null }[];
  /** 가장 최근 거래일부터 거꾸로 순유입이 이어진 날 수 */
  streak: number;
  /** 1달 순유입 순위(전 ETF) */
  rank: { flow: number; of: number } | null;
  /** 순자산 순위(전 ETF) — 브리핑 메움 줄 '규모' */
  sizeRank: number | null;
  dist: {
    cadence: string | null;
    yld: number | null;
    estimated: boolean;
    /** 1년(수익률 카드와 같은 기간) 분배금 합 · 횟수 */
    yearSum: number;
    yearCount: number;
    payments: EtfDetailPayment[];
    next: { date: string; amount: number | null } | null;
  } | null;
  siblings: EtfSibling[];
};

const EOK = 1e8;
const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
const pct = (a: number, b: number) => (a / b - 1) * 100;

const PERIODS: {
  key: Exclude<EtfDetailPeriodKey, "y">;
  label: string;
  days: number;
}[] = [
  { key: "w", label: "1주", days: 5 },
  { key: "m", label: "1달", days: 20 },
  { key: "q", label: "3달", days: 60 },
  { key: "h", label: "6달", days: 120 },
];

export const getEtfDetail = cache(async (code: string): Promise<EtfDetail | null> => {
  const db = getSupabaseServer();
  const { data: dayData, error: dayErr } = await db
    .from("etf_flow_daily")
    .select("trade_date,isu_nm,index_name,close_price,nav,fluc_rate,trade_value,net_asset,net_flow,index_value")
    .eq("isu_cd", code)
    // 420일 — 1년 + 기준일 여유 + 6달 · 막대 60거래일을 덮는다. 창 없이 오름차순 1,000행이면 표가 4년을 넘는 날 최신 행을 못 읽는다.
    .gte("trade_date", new Date(Date.now() - 420 * 864e5).toISOString().slice(0, 10))
    .order("trade_date", { ascending: true })
    .limit(1000);
  if (dayErr) throw dayErr;
  const rows = ((dayData ?? []) as DayRow[]).map((r) => ({
    date: r.trade_date,
    name: r.isu_nm,
    indexName: r.index_name?.trim() || null,
    close: num(r.close_price),
    nav: num(r.nav),
    change: num(r.fluc_rate),
    tradeValue: num(r.trade_value),
    netAsset: num(r.net_asset),
    flow: num(r.net_flow),
    index: num(r.index_value),
  }));
  if (!rows.length) return null;
  const last = rows[rows.length - 1];
  const asOf = last.date;
  const name = last.name ?? code;

  const [infoRes, divRes, board] = await Promise.all([
    db.from("etf_info").select("code,name,manager,fee_pct,setup_date,category,benchmark").eq("code", code).maybeSingle(),
    db.from("etf_dividend").select("code,cadence,ttm_yield_pct,estimated,payments,next_pay_date,next_pay_amount").eq("code", code).maybeSingle(),
    fetchAllRows<BoardRow>("isu_cd", () => db.from("etf_flow_board").select("isu_cd,isu_nm,index_name,net_asset,flow_20d,trade_value_5d")),
  ]);
  const info = (infoRes.data ?? null) as InfoRow | null;
  const div = (divRes.data ?? null) as DivRow | null;
  const group = etfGroup(code, name, last.indexName, info?.category);
  const abroad = isAbroadEtf(group, name, last.indexName, info?.category ?? null, info?.benchmark ?? null);
  // 거래일 목록 — 수익률에 더하는 분배금을 기준일 대신 분배락일로 가른다(lib/etf-flow.ts paidBetween).
  const cal = rows.map((r) => r.date);
  // 신규 ETF 의 예상 건(est)은 배당 달력용 앞날 값이라 수익률 · 분배 이력 · 브리핑에 넣지 않는다.
  const payments = (div?.payments ?? []).filter((p) => !p.est);

  // 기간 하나 — base 는 기준일 행의 자리(그 종가에서 잰다), 그 뒤 행들의 순유입을 더한다.
  const period = (key: EtfDetailPeriodKey, label: string, base: number): EtfDetailPeriod => {
    const b = rows[base];
    const after = rows.slice(base + 1);
    const flows = after.map((r) => r.flow);
    const ret = b.close && last.close ? pct(last.close + paidBetween(payments, b.date, asOf, cal).sum, b.close) : null;
    const idx = !abroad && b.index && last.index ? pct(last.index, b.index) : null;
    return {
      key,
      label,
      from: b.date,
      ret,
      idx,
      flow: flows.reduce<number>((s, f) => s + (f ?? 0), 0) / EOK,
      inDays: flows.filter((f) => f != null && f > 0).length,
      days: flows.filter((f) => f != null).length,
    };
  };
  const periods: EtfDetailPeriod[] = PERIODS.filter((p) => rows.length > p.days).map((p) => period(p.key, p.label, rows.length - 1 - p.days));

  // 1년 — 365일 앞 날짜 이전의 가장 가까운 거래일(메인 1년 뷰 etf_flow_year · 커버드콜 · 레버리지와 같은 날). 일별 표가 그날까지 차 있어야 한다
  // (2025-09-08 부터 있다). 예전엔 그 앞 달 말일이라 12~13개월을 1년으로 적었다.
  const yearAgo = new Date(Date.parse(`${asOf}T00:00:00Z`) - 365 * 864e5).toISOString().slice(0, 10);
  let yearBase = -1;
  for (let i = 0; i < rows.length - 1; i++) {
    if (rows[i].date > yearAgo) break;
    yearBase = i;
  }
  const year = yearBase >= 0 ? period("y", "1년", yearBase) : null;
  if (year) periods.push(year);
  // 큰 숫자 — 1년, 없으면 상장 이후(첫 행 · 상장 첫날 종가부터).
  const head = year ? { ...year, sinceListing: false } : { ...period("y", "상장 이후", 0), sinceListing: true };
  const lineFrom = year ? yearBase : 0;
  const line = rows.slice(lineFrom).flatMap((r) => (r.close ? [{ date: r.date, close: r.close, change: r.change }] : []));
  const high = line.reduce<{ date: string; close: number } | null>((m, r) => (!m || r.close > m.close ? r : m), null);
  const low = line.reduce<{ date: string; close: number } | null>((m, r) => (!m || r.close < m.close ? r : m), null);

  let streak = 0;
  for (let i = rows.length - 1; i >= 0 && (rows[i].flow ?? 0) > 0; i--) streak += 1;
  const recent = rows.slice(-5);

  // 순위 · 같은 지수 — 뷰 한 벌(지금 상장된 ETF).
  const ranked = [...board].sort((a, b) => Number(b.flow_20d ?? 0) - Number(a.flow_20d ?? 0));
  const at = ranked.findIndex((r) => r.isu_cd === code);
  const sizeAt = [...board].sort((a, b) => Number(b.net_asset ?? 0) - Number(a.net_asset ?? 0)).findIndex((r) => r.isu_cd === code);
  const peers = last.indexName ? board.filter((r) => r.index_name?.trim() === last.indexName) : [];
  const peerCodes = peers.map((r) => r.isu_cd);
  // 1년 수익률 — 시작일은 메인 1년 뷰(etf_flow_year)와 같은 거래일(069500 의 365일 앞 이전 마지막 거래일)이고 그날 종가를 일별 표에서
  // 바로 읽는다. 뷰의 시작일을 따르면 뷰를 새로 만들기 전(마이그레이션 100)엔 이 ETF 의 1년과 다른 날에서 재 순위가 섞였다.
  // 끝은 기준일 종가, 사이 분배금을 더한다.
  const peerBase = peerCodes.length
    ? (((
        await db.from("etf_flow_daily").select("trade_date").eq("isu_cd", CALENDAR_CODE).lte("trade_date", yearAgo).order("trade_date", { ascending: false }).limit(1)
      ).data?.[0]?.trade_date as string | undefined) ?? null)
    : null;
  const [peerInfo, peerDiv, peerYear, peerLast] = peerCodes.length
    ? await Promise.all([
        db.from("etf_info").select("code,manager,fee_pct,category").in("code", peerCodes),
        db.from("etf_dividend").select("code,ttm_yield_pct,estimated,payments").in("code", peerCodes),
        peerBase ? db.from("etf_flow_daily").select("isu_cd,close_price").eq("trade_date", peerBase).in("isu_cd", peerCodes) : Promise.resolve({ data: [] }),
        db.from("etf_flow_daily").select("isu_cd,close_price").eq("trade_date", asOf).in("isu_cd", peerCodes),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];
  const pYear = new Map(
    ((peerYear.data ?? []) as { isu_cd: string; close_price: number | null }[]).map((r) => [r.isu_cd, num(r.close_price)]),
  );
  const pLast = new Map(((peerLast.data ?? []) as { isu_cd: string; close_price: number | null }[]).map((r) => [r.isu_cd, num(r.close_price)]));
  const pInfo = new Map(
    (
      (peerInfo.data ?? []) as {
        code: string;
        manager: string | null;
        fee_pct: number | null;
        category: string | null;
      }[]
    ).map((r) => [r.code, r]),
  );
  const pDiv = new Map(
    (
      (peerDiv.data ?? []) as {
        code: string;
        ttm_yield_pct: number | null;
        estimated: boolean | null;
        payments: EtfPayment[] | null;
      }[]
    ).map((r) => [r.code, r]),
  );
  const peerYearRet = (c: string): number | null => {
    if (c === code) return year?.ret ?? null;
    const from = pYear.get(c) ?? null;
    const to = pLast.get(c) ?? null;
    // 시작일에 행이 없으면(그 뒤 상장했거나 일별 표가 그날까지 안 찼으면) 1년이 아니다.
    if (!peerBase || !from || !to) return null;
    return pct(to + paidBetween(pDiv.get(c)?.payments ?? [], peerBase, asOf, cal).sum, from);
  };
  // 같은 지수 · 같은 유형 · 같은 배수 · 액티브끼리만(커버드콜과 그 기초 ETF, 레버리지와 1배는 같은 지수라도 다른 상품이다).
  const active = name.includes("액티브");
  const mult = leverMult(name);
  const siblings: EtfSibling[] = peers
    .filter((r) => {
      const nm = r.isu_nm ?? r.isu_cd;
      return etfGroup(r.isu_cd, nm, r.index_name, pInfo.get(r.isu_cd)?.category) === group && nm.includes("액티브") === active && leverMult(nm) === mult;
    })
    .map((r) => {
      const y = num(pDiv.get(r.isu_cd)?.ttm_yield_pct);
      return {
        code: r.isu_cd,
        name: (r.isu_nm ?? r.isu_cd).replace(/\s*\(H\)/, ""),
        hedged: /\(H\)|합성 H/.test(r.isu_nm ?? ""),
        netAsset: Number(r.net_asset ?? 0) / EOK,
        fee: num(pInfo.get(r.isu_cd)?.fee_pct),
        tradeValue: Number(r.trade_value_5d ?? 0) / EOK,
        m: Number(r.flow_20d ?? 0) / EOK,
        r: peerYearRet(r.isu_cd),
        yld: y != null && y > 0 ? y : null,
        yldEst: y != null && y > 0 && Boolean(pDiv.get(r.isu_cd)?.estimated),
        self: r.isu_cd === code,
      };
    })
    .sort((a, b) => b.netAsset - a.netAsset);

  // 분배금 — 최근 차례(기준일 늦은 것부터). 기준일 종가 대비 % 는 일별 표에 그날(또는 그 앞 거래일)이 있을 때만.
  const closeOn = (day: string | null) => {
    if (!day) return null;
    let c: number | null = null;
    for (const r of rows) {
      if (r.date > day) break;
      if (r.close) c = r.close;
    }
    return rows[0].date <= day ? c : null;
  };
  const distRows: EtfDetailPayment[] = [...payments]
    .map((p) => ({
      record: p.record ?? null,
      pay: p.pay ?? null,
      amount: Number(p.amount ?? 0),
    }))
    .filter((p) => p.amount > 0)
    .sort((a, b) => ((b.record ?? b.pay ?? "") > (a.record ?? a.pay ?? "") ? 1 : -1))
    .map((p) => {
      const c = closeOn(p.record ?? p.pay);
      return { ...p, pct: c ? (p.amount / c) * 100 : null };
    });
  const yearPaid = paidBetween(payments, head.from, asOf);
  const yld = num(div?.ttm_yield_pct);

  return {
    code,
    name,
    group,
    asOf,
    close: last.close,
    changeRate: last.change,
    netAsset: (last.netAsset ?? 0) / EOK,
    tradeValue: recent.reduce((s, r) => s + (r.tradeValue ?? 0), 0) / recent.length / EOK,
    gap: last.close && last.nav ? pct(last.close, last.nav) : null,
    manager: info?.manager ?? null,
    fee: num(info?.fee_pct),
    setupDate: info?.setup_date ?? null,
    index: last.indexName
      ? {
          name: last.indexName,
          label: indexLabel(last.indexName),
          benchmark: info?.benchmark ?? null,
        }
      : null,
    abroad,
    head,
    periods,
    line,
    high,
    low,
    flowDay: last.flow == null ? null : last.flow / EOK,
    flows: rows.slice(-FLOW_BARS).map((r) => ({
      date: r.date,
      flow: r.flow == null ? null : r.flow / EOK,
      close: r.close,
    })),
    streak,
    rank: at >= 0 ? { flow: at + 1, of: ranked.length } : null,
    sizeRank: sizeAt >= 0 ? sizeAt + 1 : null,
    dist: distRows.length
      ? {
          cadence: div?.cadence ?? null,
          yld: yld != null && yld > 0 ? yld : null,
          estimated: Boolean(div?.estimated),
          yearSum: yearPaid.sum,
          yearCount: yearPaid.count,
          payments: distRows,
          next: div?.next_pay_date ? { date: div.next_pay_date, amount: num(div.next_pay_amount) } : null,
        }
      : null,
    siblings: siblings.length > 1 ? siblings : [],
  };
});
