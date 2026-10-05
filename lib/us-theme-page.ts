import "server-only";

import { cache } from "react";

import { getSupabaseAdmin } from "./supabase-server";
import { LLM_TEXT_CARRY_DAYS, addDaysISO, channelMeta, fetchAllRows } from "./telegram-data";
import { US_WINDOW_DAYS, getUsThemeRotation, usKaderaBaseDate, usQuotes } from "./us-telegram-data";
import { US_THEMES } from "./us-stock-themes";
import { getUsEventsForTickers } from "./kadera-us-why";
import { prevWindowRanks, thinDays, usableDays, withTodayRank } from "./theme-flow";
import { themeDetailWindow } from "./theme-window";
import { verifiedChangesOnce } from "./quoted-change";
import { RISER_FALLBACK_DAYS, risersWithFallback } from "./theme-risers";
import { fetchDailyHistory, yahooSymbol } from "./yahoo-history";
import {
  THEME_FLOW_DAYS,
  THEME_TREND_DAYS,
  briefFirstSentence,
  buildHotStocks,
  flowStats,
  parseBriefRow,
  themeDayTotals,
  themeQuotes,
  type BriefRow,
  type RiserRow,
  type ThemeMember,
  type ThemeOverview,
  type ThemePageData,
  type ThemeReasonRow,
  type ThemeRiser,
  type ThemeTrendPoint,
} from "./theme-page";

/**
 * 미장 테마 리포트(`/theme/us` · `/theme/us/[테마]`)의 자료. **국장(lib/theme-page.ts)과 같은 타입을 낸다** —
 * 화면은 한 벌(app/theme/ThemeIndexView.tsx · ThemeDetailView.tsx)이고 시장 키만 다르다.
 *
 * ## 국장과 다른 점
 *
 *   표        telegram_us_theme_daily · telegram_us_stock_daily · telegram_us_stock_move_reason · telegram_us_stock_event ·
 *             telegram_us_theme_brief(마이그레이션 082). 종목 열쇠는 6자리 코드가 아니라 **티커**고, 화면 타입의 `code` 에
 *             티커를, `market` 에 "US" 를 넣는다(로고·링크가 그걸로 가른다).
 *   시세      stocks 표의 KRX 종가가 없다. 히어로 '시세 반응'은 야후 시세(usQuotes, 30분 캐시)로 그 자리에서 낸다 —
 *             테마 하나가 최대 30종목이라 요청 30개, 카더라 미장이 같은 함수로 같은 양을 부른다.
 *   등락의 이유  change_rate 대신 **채널이 적은 등락률**(quoted_change_rate)이다(마이그레이션 069 머리말 — 미국장 하루와
 *             메시지 날짜가 어긋나 확정 종가를 안 붙인다). 화면이 그 사정을 툴팁에 적는다.
 */

/** 미장 테마 사전의 이름 목록(사전 순서). 주소·셸은 lib/theme-href.ts 의 US_THEME_NAMES 를 본다(같은 사전). */
export const US_THEME_NAME_LIST: string[] = Object.keys(US_THEMES);

/** 사전의 티커를 us_stocks 의 한글 표기로. 사전에 있어도 us_stocks 에 없는 티커는 빠진다(파이프라인 집계도 같다). */
async function usThemeMembers(theme: string): Promise<ThemeMember[] | null> {
  const tickers = US_THEMES[theme] ?? [];
  if (!tickers.length) return [];
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("us_stocks").select("ticker,name_ko").in("ticker", tickers);
  if (error) {
    console.error(`[usThemeMembers] ${theme} 종목을 못 읽었습니다`, error);
    return null;
  }
  const nameOf = new Map((data ?? []).map((r) => [r.ticker as string, r.name_ko as string]));
  return tickers.filter((t) => nameOf.has(t)).map((t) => ({ code: t, name: nameOf.get(t)!, market: "US" }));
}

export const getUsThemePage = cache(async (theme: string): Promise<ThemePageData | null> => {
  // 자기 키만 본다(국장 getThemePage 와 같은 까닭).
  if (!Object.hasOwn(US_THEMES, theme)) return null;
  const db = getSupabaseAdmin();

  const [members, baseDate] = await Promise.all([usThemeMembers(theme), usKaderaBaseDate()]);
  if (members === null) {
    return {
      theme, members: [], quotes: themeQuotes([]), baseDate, recentDays: [], recentShare: null, recentRank: null, shareDelta: null, rankChange: null,
      trend: [], hotStocks: [], reasons: [], events: [], brief: null, loadFailed: true,
    };
  }
  const tickers = members.map((m) => m.code);
  const byCode = new Map<string, ThemeMember>(members.map((m) => [m.code, m]));

  const { trendDays, recentDays: windowDays } = themeDetailWindow(baseDate, THEME_TREND_DAYS, US_WINDOW_DAYS);
  const first = trendDays[0];

  type ThemeDailyRow = { date: string; share_pct: number | string; rank: number | null; mention_count: number | null };
  type StockDailyRow = { id: number; date: string; ticker: string; mention_count: number | null; channel_count: number | null; weighted_score: number | string | null };
  type ReasonRow = { date: string; ticker: string; reason: string | null; quoted_change_rate: number | string | null; channel_count: number | null };

  let stockDailyFailed = false;
  const [themeDaily, stockDaily, reasonRows, events, rotation, briefRow, meta, quoteMap, dayTotals] = await Promise.all([
    db.from("telegram_us_theme_daily").select("date,share_pct,rank,mention_count").eq("theme", theme).gte("date", first).lte("date", baseDate).order("date"),
    fetchAllRows<StockDailyRow>(
      "id",
      () => db.from("telegram_us_stock_daily").select("id,date,ticker,mention_count,channel_count,weighted_score").in("ticker", tickers).gte("date", first).lte("date", baseDate),
      { onError: (e) => { stockDailyFailed = true; console.error(`[getUsThemePage] ${theme} 종목 집계를 못 읽었습니다`, e); } },
    ),
    db
      .from("telegram_us_stock_move_reason")
      .select("date,ticker,reason,quoted_change_rate,channel_count")
      .in("ticker", tickers)
      .gte("date", first)
      .lte("date", baseDate)
      .not("reason", "is", null)
      .order("date", { ascending: false })
      .limit(400),
    getUsEventsForTickers(tickers, 200),
    getUsThemeRotation(100),
    db
      .from("telegram_us_theme_brief")
      .select("date,brief,related,excerpts,message_count")
      .eq("theme", theme)
      .gte("date", addDaysISO(baseDate, -LLM_TEXT_CARRY_DAYS))
      .lte("date", baseDate)
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    channelMeta(),
    // 야후가 막히면 빈 맵 — 히어로의 '시세 반응' 칸만 빈다.
    usQuotes(tickers).catch((e) => {
      console.error(`[getUsThemePage] ${theme} 시세를 못 받았습니다`, e);
      return new Map<string, { price: number; changeRate: number | null; date?: string | null }>();
    }),
    // '평소 대비'의 분모 — 날마다의 미장 테마 대화 총량(국장 getThemePage 와 같은 규칙 · lib/stock-usual.ts).
    themeDayTotals("telegram_us_theme_daily", first, baseDate),
  ]);

  let loadFailed = false;
  if (themeDaily.error) {
    console.error(`[getUsThemePage] ${theme} 테마 집계를 못 읽었습니다`, themeDaily.error);
    loadFailed = true;
  }
  if (stockDailyFailed) loadFailed = true;
  if (reasonRows.error) console.error(`[getUsThemePage] ${theme} 이유를 못 읽었습니다`, reasonRows.error);
  // 표가 아직 없으면(마이그레이션 082 전) 42P01. 화면은 빈 칸으로 넘어간다.
  if (briefRow.error) console.error(`[getUsThemePage] ${theme} 요약을 못 읽었습니다`, briefRow.error);

  // ── 등락의 이유 ── 등락률은 채널이 적은 값(quoted_change_rate)을 실제 세션 값으로 맞춘 것이다. 국장처럼 그 날짜의 종가로 채우지
  // 않는다 — 미국장 하루와 메시지 날짜가 어긋나 '그날 종가'가 정의되지 않는다(마이그레이션 069).
  // 채널 숫자는 야후 일봉으로 맞춰 본다(lib/quoted-change.ts) — 그 글 앞 며칠 세션 가운데 가까운 실제 등락이 있으면 그 값, 없으면 비운다.
  // 채널 숫자를 그대로 실었더니 이유와 방향이 반대이거나(−3.00% '기술주 랠리') 터무니없는 값(엔비디아 하루 +22.10%)이 섰다(2026-10-04 점검).
  const reasonList = ((reasonRows.data ?? []) as ReasonRow[]).filter((r) => byCode.has(r.ticker) && r.reason);
  const barsOf = new Map(
    await Promise.all(
      [...new Set(reasonList.map((r) => r.ticker))].map(async (t) => [t, await fetchDailyHistory(yahooSymbol(t, "US"), 0.15).catch(() => null)] as const),
    ),
  );
  // 같은 세션은 종목마다 한 번만 싣는다(verifiedChangesOnce) — 나흘 연속 같은 +0.90% 가 섰다(2026-10-05 점검).
  const changeOf = new Map<ReasonRow, number | null>();
  for (const t of new Set(reasonList.map((r) => r.ticker))) {
    const mine = reasonList.filter((r) => r.ticker === t);
    const ch = verifiedChangesOnce(
      mine.map((r) => ({ quoted: r.quoted_change_rate == null ? null : Number(r.quoted_change_rate), date: r.date })),
      barsOf.get(t) ?? null,
    );
    mine.forEach((r, i) => changeOf.set(r, ch[i]));
  }
  const reasons: ThemeReasonRow[] = [];
  for (const r of reasonList) {
    const m = byCode.get(r.ticker)!;
    reasons.push({ ...m, date: r.date, reason: r.reason!, changeRate: changeOf.get(r) ?? null, close: null, channelCount: r.channel_count ?? 0 });
  }
  const reasonDates = new Set(reasons.map((r) => r.date));

  const dailyByDate = new Map(((themeDaily.data ?? []) as ThemeDailyRow[]).map((r) => [r.date, r]));
  // 표본이 거의 없는 날(기준일 아침)은 '집계 없음' — 국장 lib/theme-page.ts thinDays 와 같은 규칙.
  const thin = thinDays(dayTotals, trendDays);
  const trend: ThemeTrendPoint[] = trendDays.map((date) => {
    const r = thin.has(date) ? undefined : dailyByDate.get(date);
    return { date, share: r ? Number(r.share_pct) || 0 : 0, rank: r?.rank ?? null, mentions: r?.mention_count ?? 0, hasReason: reasonDates.has(date), thin: thin.has(date) };
  });

  // '최근 사흘'도 얇은 날을 뺀 끝에서 고른다 — 히어로 점유율(테마 로테이션 · lib/theme-flow.ts usableDays)과 같은 사흘이어야
  // 한 칸 안의 숫자가 같은 날을 말한다. 평소도 얇은 날은 뺀다.
  const recentDays = trendDays.filter((d) => !thin.has(d)).slice(-windowDays.length);
  const recentSet = new Set(recentDays);
  const usualDays = trendDays.filter((d) => !recentSet.has(d) && !thin.has(d));
  const hotStocks = buildHotStocks(
    stockDaily.map((r) => ({ date: r.date, code: r.ticker, mentions: r.mention_count, channels: r.channel_count, weight: r.weighted_score })),
    recentSet,
    usualDays.length,
    byCode,
    reasons,
    { usualDays, dayTotals },
    baseDate,
  );

  let recentShare: number | null = null;
  let recentRank: number | null = null;
  let shareDelta: number | null = null;
  let rankChange: number | null = null;
  if (rotation.date === null) {
    loadFailed = true;
  } else {
    const me = rotation.rows.find((r) => r.theme === theme);
    if (me) {
      recentShare = me.sharePct;
      recentRank = me.rank;
      shareDelta = me.shareDelta;
      rankChange = me.rankChange;
    }
  }

  // 시세 반응 — 야후 시세라 '종가 날짜'가 없다(date: null). 화면이 미장 캡션을 따로 단다(app/theme/market.ts).
  // 날짜는 시세의 미국 세션 날짜(가장 많은 종목) — 띠가 '10월 2일 미국장'처럼 기준일을 적는다(국장 짝 '10월 2일 종가').
  const quotes = themeQuotes(tickers.map((t) => ({ changeRate: quoteMap.get(t)?.changeRate ?? null, priceDate: quoteMap.has(t) ? (quoteMap.get(t)?.date ?? "US") : null })));
  if (quotes.date === "US") quotes.date = null;

  const brief = parseBriefRow((briefRow.data ?? null) as BriefRow | null, meta, (t) => t in US_THEMES);

  return { theme, members, quotes, baseDate, recentDays, recentShare, recentRank, shareDelta, rankChange, trend, hotStocks, reasons, events, brief, loadFailed };
});

/** 미장 테마 목록 — 국장 listThemeOverview 와 같은 꼴. 흐름은 기준일을 **포함한** 열흘. */
export async function listUsThemeOverview(): Promise<ThemeOverview[] | null> {
  const db = getSupabaseAdmin();
  const [rotation, baseDate] = await Promise.all([getUsThemeRotation(100), usKaderaBaseDate()]);
  if (rotation.date === null) return null;

  const { data, error } = await db
    .from("telegram_us_theme_daily")
    .select("date,theme,share_pct,mention_count")
    .lte("date", baseDate)
    .gte("date", addDaysISO(baseDate, -THEME_FLOW_DAYS * 2))
    .order("date", { ascending: false })
    .limit(1000);
  if (error) {
    console.error("[listUsThemeOverview] 테마 집계를 못 읽었습니다", error);
    return null;
  }
  const rows = (data ?? []) as { date: string; theme: string; share_pct: number | string; mention_count: number | null }[];
  // 표본이 거의 없는 날(기준일 아침)은 흐름에서 뺀다 — 테마 로테이션 · 테마 상세와 같은 규칙(lib/theme-flow.ts usableDays).
  // 넣으면 언급 4건인 날 반도체 100% 가 '하루 더 오른 날'로 세어져, 목록과 상세의 'n일째 오르는 중'이 갈렸다(2026-10-04 점검).
  const dayTotals = new Map<string, number>();
  for (const r of rows) dayTotals.set(r.date, (dayTotals.get(r.date) ?? 0) + (r.mention_count ?? 0));
  const dates = usableDays(dayTotals, [...new Set(rows.map((r) => r.date))].sort()).slice(-THEME_FLOW_DAYS);
  const rankOn = new Map<string, Map<string, number>>();
  const shareOn = new Map<string, Map<string, number>>();
  for (const d of dates) {
    const day = rows.filter((r) => r.date === d && r.theme in US_THEMES).sort((a, b) => Number(b.share_pct) - Number(a.share_pct));
    rankOn.set(d, new Map(day.map((r, i) => [r.theme, i + 1])));
    shareOn.set(d, new Map(day.map((r) => [r.theme, Number(r.share_pct) || 0])));
  }

  const briefOf = new Map<string, string>();
  const briefs = await db
    .from("telegram_us_theme_brief")
    .select("theme,date,brief")
    .gte("date", addDaysISO(baseDate, -LLM_TEXT_CARRY_DAYS))
    .lte("date", baseDate)
    .order("date", { ascending: false })
    .limit(200);
  if (briefs.error) console.error("[listUsThemeOverview] 테마 요약을 못 읽었습니다", briefs.error);
  for (const r of (briefs.data ?? []) as { theme: string; date: string; brief: string | null }[]) {
    if (!briefOf.has(r.theme) && r.brief?.trim()) briefOf.set(r.theme, r.brief);
  }

  const prevRank3 = prevWindowRanks(shareOn, dates, Object.keys(US_THEMES), US_WINDOW_DAYS);
  return rotation.rows
    .filter((r) => r.theme in US_THEMES)
    .map((r) => {
      const flow = dates.map((d) => rankOn.get(d)?.get(r.theme) ?? null);
      const shareFlow = dates.map((d) => shareOn.get(d)?.get(r.theme) ?? 0);
      const { streak, topDays, label } = flowStats(withTodayRank(flow, r.rank));
      return {
        theme: r.theme,
        rank: r.rank,
        sharePct: r.sharePct,
        shareDelta: r.shareDelta,
        rankChange: r.rankChange,
        flow,
        shareFlow,
        flowDates: dates,
        prevRank3: prevRank3.get(r.theme) ?? null,
        streak,
        topDays,
        label,
        topStocks: r.stocks.slice(0, 3).map((s) => ({ code: s.ticker, name: s.name, mentions: s.mentions })),
        stockCount: r.stockCount,
        briefLine: briefFirstSentence(briefOf.get(r.theme)),
      };
    })
    .sort((a, b) => a.rank - b.rank);
}

/** 미장 '테마별 급부상 종목' — 요약 행의 riser(파이프라인 common/us_theme_risers.py 가 고른 것)를 읽어 줄만 세운다. */
export async function listUsThemeRisers(): Promise<{ risers: ThemeRiser[]; asOf: string | null } | null> {
  const db = getSupabaseAdmin();
  const baseDate = await usKaderaBaseDate();
  const { data, error } = await db
    .from("telegram_us_theme_brief")
    .select("theme,date,riser")
    // 그날 줄이 없으면 앞 날로 채운다(국장 listThemeRisers · risersWithFallback 과 같은 까닭).
    .gte("date", addDaysISO(baseDate, -RISER_FALLBACK_DAYS))
    .lte("date", baseDate)
    // riser 가 빈 행도 받는다(국장 listThemeRisers 와 같은 까닭). 16테마 × 여드레.
    .order("date", { ascending: false })
    .limit(300);
  if (error) {
    console.error("[listUsThemeRisers] 테마 요약의 종목 칸을 못 읽었습니다", error);
    return null;
  }
  return risersWithFallback((data ?? []) as RiserRow[], (t) => t in US_THEMES, addDaysISO(baseDate, -LLM_TEXT_CARRY_DAYS));
}
