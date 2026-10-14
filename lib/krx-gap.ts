import "server-only";

import { getSupabaseAdmin } from "./supabase-server";
import { changeRateOf, type YahooQuote } from "./yahoo-quote";

/**
 * KRX 일별 종가(stock_price_daily, 마이그레이션 093)로 야후 일봉의 빈 봉을 메운다 — 국장 종목만.
 *
 * 야후는 가끔 지난 거래일 봉의 종가를 비운 채 준다(timestamp 는 있고 close 가 null). 2026-10-12 국내 종목 전부가 그랬고
 * (^KS11 은 멀쩡) 2025-09-19 도 같았다. 그 봉을 건너뛰면 다음 날 등락이 이틀치가 되어 카더라 '지금 등락' · '크게 움직인 종목' ·
 * MDD 가 삼성전자 −11.5%(실제 −7.4%)를 적었다(2026-10-13 점검). 같은 날 KRX 종가는 다음 날 08:00 에 이 표에 들어온다.
 *
 * ⚠️ 야후 종가는 수정주가, KRX 는 원종가다. 분할 · 병합이 낀 기간이면 둘이 갈리므로 맞춰 보고 갈리면 메우지 않는다(호출부).
 */
export type KrxClose = { close: number; changeRate: number | null };

/** 그 종목의 날짜별 KRX 종가. 못 읽거나 없으면 빈 Map — 메우기는 곁다리라 화면을 막지 않는다. */
export async function krxClosesOn(code: string, dates: string[]): Promise<Map<string, KrxClose>> {
  const out = new Map<string, KrxClose>();
  if (!dates.length) return out;
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("stock_price_daily")
      .select("date,close,change_rate")
      .eq("code", code)
      .in("date", dates);
    if (error || !data) return out;
    for (const r of data as { date: string; close: number | string | null; change_rate: number | string | null }[]) {
      const close = Number(r.close);
      if (!(close > 0)) continue;
      const cr = r.change_rate == null ? null : Number(r.change_rate);
      out.set(r.date, { close, changeRate: cr != null && Number.isFinite(cr) ? cr : null });
    }
  } catch {
    /* 메우기 실패는 지금처럼 빈 봉을 건너뛴 값으로 둔다 */
  }
  return out;
}

/** 야후 심볼이 국장 종목인가('005930.KS' · '247540.KQ' · '0039P0.KQ'). 지수(^KS11)와 ETF 도 6자리라 걸리지만 표에 없으면 빈다. */
export function krxCodeOf(symbol: string): string | null {
  const m = /^([0-9A-Z]{6})\.K[SQ]$/.exec(symbol);
  return m ? m[1] : null;
}

/**
 * 야후 시세의 등락률(%) — 전 거래일 봉이 비었으면(q.prevGap) 국장은 그날 KRX 종가로 셈한다. 미장 · 못 메우면 null(호출부가 '없음'이나
 * 저장값으로 떨어진다). 이틀치 숫자를 하루치로 적는 것보다 빈칸이 낫다.
 */
export async function quoteChangeRate(q: YahooQuote, symbol: string): Promise<number | null> {
  const rate = changeRateOf(q);
  if (rate !== null || !q.prevGap) return rate;
  const code = krxCodeOf(symbol);
  if (!code) return null;
  const prev = (await krxClosesOn(code, [q.prevGap])).get(q.prevGap);
  return prev ? (q.price / prev.close - 1) * 100 : null;
}

