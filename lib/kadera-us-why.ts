import "server-only";
import { cache } from "react";
import { getSupabaseAdmin } from "./supabase-server";
import { addDaysISO, LLM_TEXT_CARRY_DAYS } from "./telegram-data";
import { todayKst, type DatePrecision, type UpcomingEvent } from "./kadera-why";
import { LOAD_FAILED, type MaybeFailed } from "./load-state";
import { fetchDailyHistory, yahooSymbol } from "./yahoo-history";

/**
 * 미장 '급등 종목' 과 '다가오는 일정' 자료. 국내 짝은 lib/kadera-why.ts.
 *
 * 표는 마이그레이션 069(telegram_us_stock_move_reason · telegram_us_stock_event).
 * 둘 다 **채널이 한 말**을 종목·날짜에 붙여 둔 것이지 우리가 확인한 사실이 아니다.
 *
 * ## ⚠️⚠️ 미장의 '그날'은 미국장 하루와 어긋난다
 *
 * 집계 기준은 **메시지 작성일(KST)** 이다. 그런데 미국장은 KST 새벽 5시에 닫히고 정리글이
 * 그날 아침에 쏟아진다(calculate_us_stock_daily.py 머리말: 새벽 4시~아침 8시가 미국 언급
 * 비중 20~28% 로 가장 높다). 그러니 작성일 D 의 글이 말하는 장은 **D 새벽에 닫힌 그 세션**,
 * 곧 ET 로 D-1 이다.
 *
 * 그래서 국내처럼 "그날 종가"를 못 쓴다. 야후 일봉에서 **`D-1` 이하의 마지막 봉**을 집어
 * 그 전 봉과 견준다 — 주말·휴장이 끼어도 자연히 직전 세션이 잡힌다. 화면 글자도 "그날"이
 * 아니라 **"직전 미국장 종가"** 다.
 *
 * ⛔ 표에 시세 컬럼을 두지 않은 까닭이 이것이다(마이그레이션 069 머리말). 국내는 다음 날
 *    KRX 가 확정값을 주지만 미장엔 그런 자리가 없어, 채워 두면 어느 세션인지 흐려진다.
 */

export type UsMoveReasonRow = {
  ticker: string;
  name: string;
  /** 집계 기준일(메시지 작성일, KST) */
  date: string;
  /** 직전 미국장 세션의 종가 등락률. 못 구하면 null */
  changeRate: number | null;
  /** 그 세션의 ET 날짜. 화면이 "9월 5일 종가"처럼 적는다 */
  sessionDate: string | null;
  closePrice: number | null;
  /** 채널이 말한 까닭. null = 그날 언급은 있었지만 까닭을 말한 글이 없다 */
  reason: string | null;
  channelCount: number;
  mentionCount: number;
  /** 채널 글에서 읽은 등락 표기(정렬 보조). 화면에 내지 않는다 */
  quotedChange: number | null;
};

export type UsMoveReasonBoard = { date: string; rows: UsMoveReasonRow[] };

/** 표에서 읽어 오는 최대 줄 수. 파이프라인 상한(generate_move_reasons.CAP)과 같다 */
const BOARD_MAX = 40;
/** 그중 야후 일봉을 실제로 부르는 줄 수. 국내와 같은 이유·같은 값(lib/kadera-why.ts QUOTE_ROWS) */
const QUOTE_ROWS = 24;
/** 기준일에서 이보다 오래된 까닭은 카드에 안 올린다(주말·연휴는 사흘까지 거슬러 본다) */
const BOARD_STALE_DAYS = 3;

type UsReasonRow = {
  date: string;
  ticker: string;
  reason: string | null;
  quoted_change_rate: number | string | null;
  mention_count: number | null;
  channel_count: number | null;
};

const num = (v: number | string | null | undefined): number | null =>
  v === null || v === undefined ? null : Number(v);

async function usNames(tickers: string[]): Promise<Map<string, string>> {
  const db = getSupabaseAdmin();
  const out = new Map<string, string>();
  // `.in()` 목록이 길면 URL 이 커져 요청이 안 나간다 — 조각내어 묻는다.
  for (let i = 0; i < tickers.length; i += 200) {
    const { data, error } = await db
      .from("us_stocks")
      .select("ticker,name_ko")
      .in("ticker", tickers.slice(i, i + 200));
    if (error) {
      console.error("[kadera-us-why] 종목 이름을 못 읽었습니다", error);
      continue;
    }
    for (const r of data ?? []) out.set(r.ticker as string, r.name_ko as string);
  }
  return out;
}

/**
 * 작성일 `date` 기준 **직전 미국장 세션**의 종가 등락률. 머리말의 하루 어긋남을 여기서 흡수한다.
 * 그 세션(ET) 이 `date - 1일` 이하의 마지막 봉이다.
 */
async function lastUsSession(
  ticker: string,
  date: string,
): Promise<{ rate: number; close: number; sessionDate: string } | null> {
  const bars = await fetchDailyHistory(yahooSymbol(ticker, "US"), 0.2).catch(() => null);
  if (!bars) return null;
  const cutoff = addDaysISO(date, -1);
  let i = -1;
  for (let k = bars.length - 1; k >= 0; k--) {
    if (bars[k].date <= cutoff) {
      i = k;
      break;
    }
  }
  if (i <= 0) return null;
  const prev = bars[i - 1].close;
  if (!prev) return null;
  return { rate: (bars[i].close / prev - 1) * 100, close: bars[i].close, sessionDate: bars[i].date };
}

/**
 * 미장 '급등 종목' 카드 — 가장 최근 날짜의 까닭 목록, **오른 종목만** 오름폭 순.
 *
 * ⛔ 파이프라인은 양방향을 만든다. 내린 종목의 까닭은 표에 남는다 — 지금은 읽는 화면이
 *    없지만(미국 종목엔 아직 실주소가 없다) 국내와 같은 규칙으로 둔다.
 */
export const getUsMoveReasons = cache(async (): Promise<MaybeFailed<UsMoveReasonBoard | null>> => {
  const db = getSupabaseAdmin();
  const base = todayKst();
  const { data: latest, error: e1 } = await db
    .from("telegram_us_stock_move_reason")
    .select("date")
    .lte("date", base)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (e1) {
    console.error("[getUsMoveReasons] 최신 날짜를 못 읽었습니다", e1);
    return LOAD_FAILED;
  }
  const date = latest?.date as string | undefined;
  if (!date || date < addDaysISO(base, -BOARD_STALE_DAYS)) return null;

  const { data, error } = await db
    .from("telegram_us_stock_move_reason")
    .select("date,ticker,reason,quoted_change_rate,mention_count,channel_count")
    .eq("date", date)
    .limit(BOARD_MAX);
  if (error) {
    console.error("[getUsMoveReasons] 까닭 목록을 못 읽었습니다", error);
    return LOAD_FAILED;
  }
  const rows = (data ?? []) as UsReasonRow[];
  if (!rows.length) return { date, rows: [] };

  const names = await usNames(rows.map((r) => r.ticker));
  // 야후를 부를 줄 고르기 — 채널 글의 표기로 어림한다. 부호를 살려 많이 오른 줄부터.
  const hint = (r: UsReasonRow) => num(r.quoted_change_rate) ?? 0;
  const willQuote = new Set(
    [...rows]
      .sort((a, b) => hint(b) - hint(a))
      .slice(0, QUOTE_ROWS)
      .map((r) => r.ticker),
  );
  const out: UsMoveReasonRow[] = await Promise.all(
    rows.map(async (r) => {
      const session = willQuote.has(r.ticker) ? await lastUsSession(r.ticker, date) : null;
      return {
        ticker: r.ticker,
        name: names.get(r.ticker) ?? r.ticker,
        date,
        changeRate: session?.rate ?? null,
        sessionDate: session?.sessionDate ?? null,
        closePrice: session?.close ?? null,
        reason: r.reason ?? null,
        channelCount: r.channel_count ?? 0,
        mentionCount: r.mention_count ?? 0,
        quotedChange: num(r.quoted_change_rate),
      };
    }),
  );
  // 오른 줄만. 세션 등락률이 있으면 그것이 판정이고, 없으면 채널 글의 표기로 가른다.
  const risers = out.filter((r) => (r.changeRate !== null ? r.changeRate > 0 : (r.quotedChange ?? 0) > 0));
  risers.sort((a, b) => {
    const ka = a.changeRate ?? a.quotedChange ?? 0;
    const kb = b.changeRate ?? b.quotedChange ?? 0;
    if (kb !== ka) return kb - ka;
    return b.channelCount - a.channelCount;
  });
  return { date, rows: risers };
});

// ─── 다가오는 일정 ─────────────────────────────────────────────────────────

type UsEventRow = {
  channel_handle: string;
  ticker: string;
  event_date: string;
  date_precision: DatePrecision;
  event: string;
  posted_at: string;
};

/** 한 날짜의 최대 줄 수. 달력은 하루씩 보여주므로 사실상 안 자른다(폭주만 막는다). */
const EVENTS_PER_DATE = 30;

/**
 * 미장 카드용 — 오늘부터 `days` 일 안, **날짜가 적혀 있던 것(day)만.**
 * 국내와 같은 규칙이다(lib/kadera-why.ts getUpcomingEvents): 달·분기·연 단위는 달력에 놓을
 * 자리가 없고, 모델이 "연말"을 12-31 로 굳혀 쓴 값이라 그 자리에 두면 거짓이 된다.
 *
 * `UpcomingEvent` 를 그대로 쓴다 — `code` 에 티커가, `market` 에 "US" 가 들어간다.
 * 그래야 달력 컴포넌트(app/kadera/EventsCalendar.tsx)를 두 화면이 같이 쓴다.
 */
export const getUsUpcomingEvents = cache(async (days = 35, limit = 400): Promise<MaybeFailed<UpcomingEvent[]>> => {
  const db = getSupabaseAdmin();
  const from = todayKst();
  const to = addDaysISO(from, days);
  const { data, error } = await db
    .from("telegram_us_stock_event")
    .select("channel_handle,ticker,event_date,date_precision,event,posted_at")
    .eq("date_precision", "day")
    .gte("event_date", from)
    .lte("event_date", to)
    .limit(1000);
  if (error) {
    console.error("[getUsUpcomingEvents] 일정을 못 읽었습니다", error);
    return LOAD_FAILED;
  }
  const rows = (data ?? []) as UsEventRow[];
  // (티커, 날짜)로 묶는다. 행사 문구는 채널마다 조금씩 달라 가장 많이 쓰인 표기를 대표로 삼는다.
  const groups = new Map<string, UsEventRow[]>();
  for (const r of rows) {
    const k = `${r.ticker}|${r.event_date}`;
    const g = groups.get(k);
    if (g) g.push(r);
    else groups.set(k, [r]);
  }
  const grouped = [...groups.values()].map((g) => {
    const texts = new Map<string, { text: string; n: number }>();
    for (const r of g) {
      const key = r.event.replace(/[\s·,.()]/g, "");
      const cur = texts.get(key);
      if (cur) cur.n += 1;
      else texts.set(key, { text: r.event, n: 1 });
    }
    const top = [...texts.values()].sort((a, b) => b.n - a.n)[0];
    return {
      code: g[0].ticker,
      market: "US" as const,
      date: g[0].event_date,
      precision: g[0].date_precision,
      event: top.text,
      channels: new Set(g.map((r) => r.channel_handle)).size,
      firstSeen: g.map((r) => r.posted_at).sort()[0],
    };
  });
  grouped.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : b.channels - a.channels));
  const perDate = new Map<string, number>();
  const capped = grouped.filter((e) => {
    const n = perDate.get(e.date) ?? 0;
    if (n >= EVENTS_PER_DATE) return false;
    perDate.set(e.date, n + 1);
    return true;
  });
  const names = await usNames([...new Set(capped.map((e) => e.code))]);
  return capped.slice(0, limit).map((e) => ({ ...e, name: names.get(e.code) ?? e.code }));
});

/** 미장 카드가 문장을 하루 늦게까지 물려받는 규칙은 국내와 같다. */
export const US_LLM_TEXT_CARRY_DAYS = LLM_TEXT_CARRY_DAYS;
