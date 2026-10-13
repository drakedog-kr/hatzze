import "server-only";
import { cache } from "react";

import { getEtfFlowBoard, indexLabel, paidBetween, type EtfPayment, type EtfPriceRow, type EtfUniverseRow } from "@/lib/etf-flow";
import { abroadName, type EtfGroup } from "@/lib/etf-groups";
import { isLoadFailed } from "@/lib/load-state";
import { getSupabaseServer } from "@/lib/supabase-server";
import { fetchAllRows } from "@/lib/telegram-data";

/**
 * ETF 자금 흐름 화면(/etf) 아래쪽 모듈의 자료 — 커버드콜 · 레버리지(파킹형은 2026-10-12 걷었다).
 *
 * 위쪽(lib/etf-flow.ts)은 돈이 얼마나 들고 났나를 보고, 여기는 사람들이 ETF 를 고르며 묻는 것을 시세로 답한다.
 *
 *   커버드콜   분배금을 받은 만큼 가격이 깎였나 — 1년 동안 받은 분배금 · 가격 변화 · 합 · 기초 지수 ETF 의 합
 *   레버리지   '지수 × 배수'만큼 움직였나 — 지수 수익률 · 그 배수 · 실제 NAV 수익률(1년 · 1달)
 *
 * 곁가지다 — 어느 표를 못 읽어도 화면은 그리고 그 모듈만 빈다(실패를 렌더 목록에 안 적는다).
 *
 * ## 기간
 *
 * 1달은 위쪽 표와 같은 20거래일이다. 수익률은 그 첫날의 **앞 거래일** 종가에서 잰다 — 20거래일 순유입이 20번의 하루 변화이듯
 * 수익률도 20번의 하루 변화다. 그 두 날의 전 종목 값은 위쪽이 이미 읽어 둔 것을 쓴다(lib/etf-flow.ts EtfFlowBoard.month).
 * 1년은 asOf 에서 365일 앞 날짜 이전의 가장 가까운 달 말일(etf_price_snapshot, 마이그레이션 096)부터다.
 *
 * ## 분배금
 *
 * etf_dividend.payments(배당 화면의 분배금 표)의 기준일(record)로 기간 안에 든 것을 더한다. 기준일이 없으면 지급일로 본다.
 */

// 줄 수 — 다 싣고 화면은 앞 다섯 줄 + '10개 더 보기' 줄로 편다(app/etf/MoreRow.tsx). 한때 여덟 줄에서 끊었다 —
// 반씩 선 두 카드의 키를 맞추려던 수라 1년 넘은 커버드콜 48개 · 레버리지 지수×배수 21개 중 나머지를 볼 길이 없었다(2026-10-12).
// 상한은 순자산 차례로 끊는 안전판이다(커버드콜이 계속 상장한다). 1달 보기는 1년 안에 상장한 것까지 들어 62개라(2026-10-12)
// 60 에서 둘이 잘렸다 — 넉넉히 둔다.
const COVERED_ROWS = 120;
const LEVER_ROWS = 40;

/**
 * 커버드콜의 기초 지수 ETF — 커버드콜이 옵션을 팔아 분배금을 만드는 대신 놓친 상승을 견주려고 같은 지수의 가장 큰 ETF 를 곁에 둔다.
 * 이름 · 추적 지수에서 먼저 걸린 것. 코스피200 은 **지수 이름의 첫머리**로만 건다 — '코스피 200 금융 고배당 TOP 10 …'(KODEX
 * 금융고배당TOP10타겟위클리커버드콜)은 코스피200 이 아니다.
 */
const COVERED_BASES: { test: RegExp; code: string; label: string }[] = [
  { test: /^코스피 ?200 (타겟|위클리|커버드콜)/, code: "069500", label: "코스피200" },
  { test: /NASDAQ.?100|나스닥\s?100/i, code: "133690", label: "나스닥100" },
  { test: /S&P\s?500/i, code: "360750", label: "S&P500" },
  { test: /Dow ?Jones U\.?S\.? Dividend 100|배당다우존스/i, code: "458730", label: "미국배당다우존스" },
];
function coveredBase(name: string, index: string | null) {
  const idx = (index ?? "").trim();
  return COVERED_BASES.find((b) => b.test.test(idx) || (b.code !== "069500" && b.test.test(name))) ?? null;
}

/** 배수 — 이름으로 읽는다. 국내 상장 배수 ETF 는 2배 · 인버스 1배 · 인버스 2배 셋뿐이다(2026-10-11 63종목 전수). */
export function leverMult(name: string): number | null {
  if (/인버스\s?2X/i.test(name)) return -2;
  if (name.includes("인버스")) return -1;
  if (/2X|레버리지/i.test(name)) return 2;
  return null;
}

/** 레버리지 표의 기초 지수 이름 — KRX 추적 지수가 길어 자주 보는 것만 줄인다. 나머지는 비교표와 같은 줄임(indexLabel). */
const LEVER_LABELS: Record<string, string> = {
  "코스피 200 선물지수": "코스피200 선물",
  "F-코스닥150 지수": "코스닥150 선물",
  "KRX SK하이닉스 지수": "SK하이닉스",
  "KRX 삼성전자 지수": "삼성전자",
  "KRX SK하이닉스 선물 지수": "SK하이닉스 선물",
  "KRX 삼성전자 선물 지수": "삼성전자 선물",
};
/** 나머지는 앞의 지수 회사 이름 · 끝의 '지수'를 떼어 줄인다('FnGuide 2차전지 산업 지수' → '2차전지 산업'). */
const leverLabel = (index: string) =>
  LEVER_LABELS[index] ??
  indexLabel(index)
    .replace(/^(FnGuide|KRX|iSelect)\s+/, "")
    .replace(/\s*(지수|Index)(\s*\((PR|Price Return)\))?$/i, "")
    .replace(/^코스피 200 /, "코스피200 ");

export type EtfCoveredRow = {
  code: string;
  name: string;
  netAsset: number;
  /** 기간 동안 받은 분배금 합 ÷ 기준일 종가(%) */
  dist: number;
  /** 종가 변화(%) */
  price: number;
  total: number;
  /** 기간 안 분배 횟수 */
  pays: number;
  /** 같은 지수의 기초 ETF 가 같은 기간에 낸 합(가격 + 분배금, %) — 짝이 없으면 null */
  base: { label: string; name: string; total: number } | null;
};

export type EtfLeverRow = {
  code: string;
  name: string;
  /** 기초 지수(줄인 이름) */
  index: string;
  mult: number;
  /** 지수 수익률(%) */
  idx: number;
  /** 실제 NAV 수익률(%) */
  actual: number;
  netAsset: number;
};


export type EtfExtras = {
  asOf: string;
  /** 1달 수익률의 기준일(20거래일 앞 거래일) */
  monthBase: string;
  /** 1년 비교의 기준일(달 말일) — 스냅숏이 없으면 null */
  yearBase: string | null;
  /** 커버드콜 — 1년(기준일 종가가 있는 것 · 스냅숏이 없으면 빈 배열) · 1달(20거래일 앞 기준일 종가가 있는 것). 화면이 머리 세그먼트로 고른다. */
  coveredYear: EtfCoveredRow[];
  coveredMonth: EtfCoveredRow[];
  leverYear: EtfLeverRow[];
  leverMonth: EtfLeverRow[];
};

type InfoRow = { code: string; fee_pct: number | null; setup_date: string | null; category: string | null; benchmark: string | null };

const pct = (a: number, b: number) => (a / b - 1) * 100;
const n = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

/** 해외 기초 ETF 인가 — 괴리율 · 레버리지 표에서 뺀다. 해외 기초는 NAV 가 전날 해외 종가로 셈해져 괴리가 구조적이고,
 *  지수 값과 NAV 의 날짜 · 통화가 어긋난다(2026-10-11 TIGER 미국필라델피아반도체레버리지 1달 지수 +7.6% · 매일 2배 복리 +14.4% · NAV +23.1%). */
function isAbroad(u: EtfUniverseRow, indexName: string | null, info: InfoRow | undefined): boolean {
  return isAbroadEtf(u.group, u.name, indexName, info?.category ?? null, info?.benchmark ?? null);
}

/** isAbroad 의 속 — ETF 상세(lib/etf-detail.ts)도 같은 잣대로 '추적 지수 대비'를 국내 기초에만 세운다. */
export function isAbroadEtf(group: EtfGroup, name: string, indexName: string | null, category: string | null, benchmark: string | null): boolean {
  if (group === "미국 대표지수" || group === "해외 업종·테마" || group === "금·원자재·통화") return true;
  if (abroadName(name) || abroadName(indexName ?? "")) return true;
  if (/^(해외지수|상품|통화)\//.test(category ?? "")) return true;
  return /원화환산|환헤지|USD/i.test(benchmark ?? "");
}

export const getEtfExtras = cache(async (): Promise<EtfExtras | null> => {
  const board = await getEtfFlowBoard();
  if (!board || isLoadFailed(board)) return null;
  // 1달 수익률의 두 날(기준일 · 최근 거래일) 전 종목 값 — 위쪽이 읽어 둔 것(못 읽었으면 이 모듈들도 비운다).
  const month = board.month;
  if (!month) return null;
  const db = getSupabaseServer();
  const monthBase = month.base;
  const asOf = month.asOf;
  const base = month.baseRows;
  const last = month.lastRows;

  const yearAgo = new Date(Date.parse(`${asOf}T00:00:00Z`) - 365 * 864e5).toISOString().slice(0, 10);
  // 순자산 큰 차례 — 아래 모듈들은 모두 '큰 것부터 몇 개'를 싣는다.
  const universe = [...board.universe].sort((a, b) => b.netAsset - a.netAsset);
  const covered = universe.filter((u) => u.group === "커버드콜");
  const lever = universe.filter((u) => u.group === "레버리지" || u.group === "인버스" || u.group === "단일종목");

  let infoFailed = false;
  const [anchorRes, infoRows] = await Promise.all([
    db.from("etf_price_snapshot").select("trade_date").lte("trade_date", yearAgo).order("trade_date", { ascending: false }).limit(1),
    fetchAllRows<InfoRow>("code", () => db.from("etf_info").select("code,fee_pct,setup_date,category,benchmark"), { onError: () => (infoFailed = true) }),
  ]);
  const info = new Map(infoFailed ? [] : infoRows.map((r) => [r.code, r]));
  const yearBase = (anchorRes.data?.[0]?.trade_date as string | undefined) ?? null;

  const baseCodes = COVERED_BASES.map((b) => b.code);
  const snapCodes = [...new Set([...covered, ...lever].map((u) => u.code).concat(baseCodes))];
  const divCodes = [...new Set(covered.map((u) => u.code).concat(baseCodes))];
  const [snapRes, divRes] = await Promise.all([
    yearBase ? db.from("etf_price_snapshot").select("code,close_price,nav,index_value").eq("trade_date", yearBase).in("code", snapCodes) : Promise.resolve({ data: [] }),
    db.from("etf_dividend").select("code,payments").in("code", divCodes),
  ]);
  const snap = new Map(
    ((snapRes.data ?? []) as { code: string; close_price: number | null; nav: number | null; index_value: number | null }[]).map((r) => [
      r.code,
      { code: r.code, close: n(r.close_price), nav: n(r.nav), index: n(r.index_value), indexName: null } satisfies EtfPriceRow,
    ]),
  );
  const payments = new Map(((divRes.data ?? []) as { code: string; payments: EtfPayment[] | null }[]).map((r) => [r.code, r.payments ?? []]));
  const nameOf = new Map(universe.map((u) => [u.code, u.name]));

  // 커버드콜 — 기간 첫날 종가가 있는 것만(1년이면 그 안에 상장한 것은 빠진다), 순자산 큰 차례. 1년 · 1달 두 벌을 지어 화면이 머리
  // 세그먼트로 고른다(2026-10-12 "1달 · 1년 옵션 · 1년 기본"). 1달의 첫날 · 분배금 셈은 'ETF 자금 흐름' 표 1달 수익률과 같다.
  const coveredTotal = (code: string, from: EtfPriceRow | undefined, to: EtfPriceRow | undefined, since: string) => {
    if (!from?.close || !to?.close) return null;
    const paid = paidBetween(payments.get(code), since, asOf);
    const dist = (paid.sum / from.close) * 100;
    const price = pct(to.close, from.close);
    return { dist, price, total: dist + price, pays: paid.count };
  };
  const coveredRows = (from: Map<string, EtfPriceRow>, since: string) => {
    const rows: EtfCoveredRow[] = [];
    for (const u of covered) {
      const t = coveredTotal(u.code, from.get(u.code), last.get(u.code), since);
      if (!t) continue;
      const b = coveredBase(u.name, last.get(u.code)?.indexName ?? null);
      const bt = b ? coveredTotal(b.code, from.get(b.code), last.get(b.code), since) : null;
      rows.push({ code: u.code, name: u.name, netAsset: u.netAsset, ...t, base: b && bt ? { label: b.label, name: nameOf.get(b.code) ?? b.code, total: bt.total } : null });
      if (rows.length >= COVERED_ROWS) break;
    }
    return rows;
  };

  // 레버리지 — 국내 기초만. 같은 지수 · 같은 배수는 순자산이 가장 큰 하나로(운용사만 다른 같은 상품이다).
  const leverRows = (from: Map<string, EtfPriceRow>) => {
    const best = new Map<string, EtfLeverRow>();
    for (const u of lever) {
      const to = last.get(u.code);
      const fr = from.get(u.code);
      const mult = leverMult(u.name);
      const indexName = to?.indexName?.trim();
      if (!mult || !indexName || !to?.nav || !to.index || !fr?.nav || !fr.index) continue;
      if (isAbroad(u, indexName, info.get(u.code))) continue;
      const key = `${indexName}|${mult}`;
      if ((best.get(key)?.netAsset ?? -1) >= u.netAsset) continue;
      const idx = pct(to.index, fr.index);
      best.set(key, { code: u.code, name: u.name, index: leverLabel(indexName), mult, idx, actual: pct(to.nav, fr.nav), netAsset: u.netAsset });
    }
    return [...best.values()].sort((a, b) => b.netAsset - a.netAsset).slice(0, LEVER_ROWS);
  };

  return {
    asOf,
    monthBase,
    yearBase,
    coveredYear: yearBase ? coveredRows(snap, yearBase) : [],
    coveredMonth: coveredRows(base, monthBase),
    leverYear: yearBase ? leverRows(snap) : [],
    leverMonth: leverRows(base),
  };
});
