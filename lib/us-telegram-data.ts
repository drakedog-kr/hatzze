/**
 * 미장 카더라(`/kadera/us`) 데이터층.
 *
 * 국내 짝은 `lib/telegram-data.ts`. **수집도 매칭 기계도 공유하고 갈리는 건 사전뿐**이라,
 * 여기서도 그쪽 헬퍼를 그대로 가져다 쓴다(fetchAllRows·channelMeta). 새로 짜지 않는 이유는
 * 그 헬퍼들이 이미 세 함정을 값비싸게 배워서 막고 있기 때문이다 —
 * 1,000행 캡 · 정렬 키 유일성 · 조회 실패가 빈 목록으로 위장하는 것.
 *
 * ⚠️ 이 표들은 **이미 1,000행을 넘는다**(us_stock_daily 2,784 · us_channel_daily 5,936).
 * 페이징 없이 읽으면 조용히 잘린다. 그래서 전부 fetchAllRows 를 탄다.
 *
 * 화면이 읽는 표(전부 migration_033):
 *   us_stocks                  티커 ↔ 한글 표기
 *   telegram_message_us_stocks 메시지 × 미국 종목
 *   telegram_us_stock_daily    날짜 × 티커 집계
 *   telegram_us_channel_daily  날짜 × 채널 (total/us/kr 메시지 수)
 *   telegram_us_comention      미국 × 국내 동시 언급(창 스냅샷)
 */
import { cache } from "react";

import { getSupabaseAdmin } from "@/lib/supabase-server";
import { sentimentTone } from "@/lib/format";
import { channelMeta, fetchAllRows, optimismPct, toPercents } from "@/lib/telegram-data";
import { changeRateOf, fetchYahooQuote } from "@/lib/yahoo-quote";
import { yahooSymbol } from "@/lib/yahoo-history";

/** 급부상 판정에서 '최근'으로 볼 일수. 국내(KADERA_WINDOW_DAYS)와 같게 둔다. */
export const US_WINDOW_DAYS = 3;
/** 막대 차트가 그리는 일수. 세는 창보다 길어야 추이가 읽힌다(국내와 같은 이유). */
export const US_CHART_DAYS = 7;
/**
 * 센티먼트 일별 막대가 그리는 일수. 톤은 종목보다 천천히 움직여 창이 더 길다.
 *
 * ⚠️ 12인 건 데이터가 아니라 **조판**이 정한 값이다. 이 카드는 반칸이고 옆에
 *    '미장에서만 나오는 말'(12줄)이 나란히 선다 — 둘 중 하나가 짧으면 그만큼이
 *    통째로 빈칸이 된다(줄 수와 일수를 서로 반대로 움직여 두 번 어긋났다).
 *    파이프라인의 ISSUE_KEYWORD_LIMIT(12) 와 짝이다. 한쪽만 고치면 반드시 한쪽이 빈다.
 */
export const US_SENTIMENT_SERIES_DAYS = 14;

/** ISO 날짜에 며칠 더한다. UTC 로 계산해 서머타임·로컬 타임존을 타지 않는다. */
function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * 배수 계산의 평활 상수. 국내와 같은 값·같은 이유다.
 *
 * 그냥 나누면 분모가 거의 0인 종목이 "▲162.8배"처럼 터무니없는 배수를 받는다.
 * 실제론 3일에 2회 언급인 종목이라 화면 신뢰도를 깎는다.
 */
const SHARE_SMOOTHING = 0.0006;

export type UsStock = { ticker: string; name: string };

export type UsSurgingStock = {
  ticker: string;
  name: string;
  recentMentions: number;
  channelCount: number | null;
  multiple: number;
  series: number[];
  seriesDates: string[];
  /** 야후 실시간 시세(USD). 못 받으면 null — 카드가 "시세를 못 받았습니다"로 적는다 */
  price: number | null;
  changeRate: number | null;
};

/**
 * 티커 여럿의 현재가를 한 번에. 국내는 KRX 저장 종가라는 폴백이 있지만 미국은 없어서,
 * 못 받으면 그냥 null 이다 — **틀린 숫자를 확신에 차서 그리는 것보다 빈칸이 낫다**
 * (fetchYahooQuote 주석의 같은 판단).
 *
 * ⚠️ 티커를 그대로 던지지 말고 **yahooSymbol 을 거친다.** 야후가 클래스까지 요구하는
 * 종목이 있어서다(버크셔 BRK → BRK-B). MDD 와 같은 함수를 쓰면 두 화면이 같은 종목에
 * 같은 심볼을 쓴다 — 한쪽만 예외를 알면 카드에는 시세가 뜨는데 MDD 는 못 여는 식이 된다.
 * 15분 재검증을 걸어 같은 티커 반복 조회의 야후 왕복을 줄인다.
 */
async function usQuotes(tickers: string[]): Promise<Map<string, { price: number; changeRate: number | null }>> {
  const out = new Map<string, { price: number; changeRate: number | null }>();
  const got = await Promise.all(
    tickers.map(async (t) => {
      const q = await fetchYahooQuote(yahooSymbol(t, "US"), { next: { revalidate: 900 } });
      return [t, q] as const;
    }),
  );
  for (const [t, q] of got) if (q) out.set(t, { price: q.price, changeRate: changeRateOf(q) });
  return out;
}

export type UsKrComention = {
  ticker: string;
  usName: string;
  stockCode: string;
  krName: string;
  pairCount: number;
  channelCount: number;
  dayCount: number;
  /** 창 안에서 이 미국 종목이 나온 글 수. 화면이 "N건 중 M건"의 N 으로 쓴다 */
  usCount: number;
  lift: number;
};

/** 한 미국 종목과 그에 붙은 국내 종목들. 화면이 이 단위로 그린다. */
export type UsComentionGroup = {
  ticker: string;
  usName: string;
  /** 창 안 이 미국 종목의 총 언급 글 수(그룹의 분모) */
  usCount: number;
  partners: { stockCode: string; krName: string; pairCount: number; channelCount: number; dayCount: number; lift: number }[];
};

export type UsChannelShare = {
  handle: string;
  title: string;
  photoUrl: string | null;
  usMsgs: number;
  totalMsgs: number;
  share: number;
};

export type MarketSplitPoint = { date: string; total: number; us: number; kr: number };

export type UsKaderaSummary = {
  /** 미국 종목을 한 번이라도 언급한 채널 수 / 전체 채널 수 */
  usChannels: number;
  totalChannels: number;
  /** 창 안의 미국 종목 언급 수와 등장 종목 수 */
  mentions: number;
  tickers: number;
  /** 집계가 닿아 있는 마지막 날(KST). 화면의 '최종 업데이트'가 이걸 쓴다. */
  lastDate: string | null;
};

type DailyRow = { date: string; ticker: string; mention_count: number; channel_count: number; weighted_score: number };

/** 티커 → 한글 표기. 요청당 한 번만 읽는다(us_stocks 는 178행이라 통째로 받아도 가볍다). */
export const usNameMap = cache(async (): Promise<Map<string, string>> => {
  const db = getSupabaseAdmin();
  const rows = await fetchAllRows<{ ticker: string; name_ko: string }>("ticker", () =>
    db.from("us_stocks").select("ticker,name_ko"),
  );
  return new Map(rows.map((r) => [r.ticker, r.name_ko]));
});

/** 최근 N일치 일별 집계. 날짜 목록은 오름차순이다. */
async function loadUsStockDaily(days: number): Promise<{ rows: DailyRow[]; dates: string[] }> {
  const db = getSupabaseAdmin();
  const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  // ⚠️ 정렬 키는 date 가 아니라 id 다. 하루에 종목 수백 행이 달려 date 는 유일하지 않고,
  //    유일하지 않은 키로 페이징하면 경계에서 행이 빠지거나 겹친다(fetchAllRows 주석 [2]).
  const rows = await fetchAllRows<DailyRow>("id", () =>
    db.from("telegram_us_stock_daily").select("date,ticker,mention_count,channel_count,weighted_score").gte("date", since),
  );
  const dates = [...new Set(rows.map((r) => r.date))].sort();
  return { rows, dates };
}

/**
 * 급부상 미국 종목.
 *
 * **절대량이 아니라 그날 전체에서 차지한 몫(share)으로 견준다.** 주말이면 전체 언급량이
 * 평일의 1/10로 떨어져 절대량으로 비교하면 모든 종목이 '감소'로 보이고 카드가 빈다.
 * 국내 급부상이 같은 이유로 share 를 쓴다.
 *
 * ⚠️ **미국장 하루와 이 날짜는 하루 어긋난다.** 미국장은 KST 새벽에 닫히고 정리글이
 * 그날 아침에 쏟아진다(실측: 새벽 4시~아침 8시가 미국 언급 비중 20~28%로 가장 높다).
 * 화면에서 이 날짜를 "그날 장"이라고 쓰면 안 된다.
 */
export async function getUsSurgingStocks(limit = 6): Promise<UsSurgingStock[]> {
  const { rows, dates } = await loadUsStockDaily(14);
  if (!rows.length) return [];

  // 마지막 날은 아직 안 끝난 날이라 뺀다 — 오전에 보면 그날 몫이 늘 작아 보인다.
  const recentN = Math.min(US_WINDOW_DAYS, Math.max(1, dates.length - 1));
  const recentDates = new Set(dates.slice(-recentN));
  const priorCount = Math.max(dates.length - recentN, 1);

  const dayTotal = new Map<string, number>();
  for (const r of rows) dayTotal.set(r.date, (dayTotal.get(r.date) ?? 0) + (Number(r.weighted_score) || 0));

  const byTicker = new Map<
    string,
    { recentShare: number; recentM: number; priorShare: number; channels: number; byDate: Map<string, number> }
  >();
  for (const r of rows) {
    const a = byTicker.get(r.ticker) ?? { recentShare: 0, recentM: 0, priorShare: 0, channels: 0, byDate: new Map() };
    a.byDate.set(r.date, r.mention_count || 0);
    const total = dayTotal.get(r.date) || 0;
    const share = total > 0 ? (Number(r.weighted_score) || 0) / total : 0;
    if (recentDates.has(r.date)) {
      a.recentShare += share;
      a.recentM += r.mention_count || 0;
      // ⚠️ 여기서 센 값은 **쓰지 않는다.** 일별 채널 수는 여러 날을 묶어도 합집합이
      // 아니라, 합치면 겹쳐 세고 최댓값을 쓰면 실제보다 작다(엔비디아 100 vs 204).
      // 아래에서 telegram_us_stock_breadth 로 덮어쓴다. 이 줄은 그 표가 비었을 때의
      // 폴백으로만 남긴다.
      a.channels = Math.max(a.channels, r.channel_count || 0);
    } else {
      a.priorShare += share;
    }
    byTicker.set(r.ticker, a);
  }

  const nameOf = await usNameMap();
  const chartDates = dates.slice(-US_CHART_DAYS);

  const ranked = [...byTicker.entries()]
    .map(([ticker, a]) => {
      const recentPerDay = a.recentShare / recentN;
      const base = a.priorShare / priorCount;
      return {
        ticker,
        name: nameOf.get(ticker) ?? ticker,
        recentMentions: a.recentM,
        channelCount: a.channels || null,
        // 평활한 뒤 나눈다. 그냥 나누면 분모가 거의 0인 종목이 터무니없는 배수를 받는다.
        multiple: (recentPerDay + SHARE_SMOOTHING) / (base + SHARE_SMOOTHING),
        series: chartDates.map((d) => a.byDate.get(d) ?? 0),
        seriesDates: chartDates,
      };
    })
    // 표본이 너무 얇은 것은 뺀다 — 3일에 두어 번 언급된 종목이 배수만 크게 받는 걸 막는다.
    .filter((s) => s.recentMentions >= 3 && s.multiple > 1)
    .sort((a, b) => b.multiple - a.multiple)
    .slice(0, limit);

  // 시세는 **고른 것만** 받는다. 후보 전부를 물으면 카드에 못 오를 종목까지 왕복한다.
  const [quotes, breadth] = await Promise.all([usQuotes(ranked.map((s) => s.ticker)), usStockBreadth()]);
  const chOf = new Map(breadth.rows.map((r) => [r.ticker, r.channelCount]));
  return ranked.map((s) => ({
    ...s,
    // 창 전체의 **합집합**으로 덮어쓴다. 못 찾으면 위 폴백(일별 최댓값)이 남는다.
    channelCount: chOf.get(s.ticker) ?? s.channelCount,
    price: quotes.get(s.ticker)?.price ?? null,
    changeRate: quotes.get(s.ticker)?.changeRate ?? null,
  }));
}

/**
 * 함께 언급된 국내 종목. **이 페이지의 존재 이유다.**
 *
 * 미국 언급 메시지의 36.4%가 국내 종목을 같이 말한다(실측). 영어권 서비스가 못 만드는
 * 화면인데, 미국 기업 소식이 **어느 국내 종목으로 옮겨붙는지**는 한국 채널만 말하기 때문이다.
 *
 * ⚠️ **빈도로 줄 세우면 안 된다.** 유명한 것끼리 붙어 시시해진다 —
 * 엔비디아×SK하이닉스가 427회지만 lift 1.2 로 사실상 우연이다. 그래서 lift 로 정렬한다.
 *
 * 창은 **파이프라인이 정해 행에 박아 둔 것**(as_of_date·window_days)을 그대로 쓴다.
 * 읽기 시점에 창을 다시 잡으면 파이프라인이 쓴 lift 와 끝점이 어긋나 숫자가 갈린다.
 */
export async function getUsKrComentions(limit = 12): Promise<{ asOf: string | null; windowDays: number; rows: UsKrComention[] }> {
  const db = getSupabaseAdmin();
  const latest = await db
    .from("telegram_us_comention")
    .select("as_of_date,window_days")
    .order("as_of_date", { ascending: false })
    .limit(1);
  const head = latest.data?.[0];
  if (latest.error || !head) {
    if (latest.error) console.error("[getUsKrComentions] 최신 창을 못 읽었습니다", latest.error);
    return { asOf: null, windowDays: 0, rows: [] };
  }

  const raw = await fetchAllRows<{
    ticker: string;
    stock_code: string;
    pair_count: number;
    channel_count: number;
    day_count: number;
    us_count: number;
    lift: number;
  }>("id", () =>
    db
      .from("telegram_us_comention")
      .select("ticker,stock_code,pair_count,channel_count,day_count,us_count,lift")
      .eq("as_of_date", head.as_of_date)
      .eq("window_days", head.window_days),
  );

  const [usName, krName] = await Promise.all([usNameMap(), krNameMap(raw.map((r) => r.stock_code))]);

  return {
    asOf: head.as_of_date,
    windowDays: head.window_days,
    rows: raw
      .map((r) => ({
        ticker: r.ticker,
        usName: usName.get(r.ticker) ?? r.ticker,
        stockCode: r.stock_code,
        krName: krName.get(r.stock_code) ?? r.stock_code,
        pairCount: r.pair_count,
        channelCount: r.channel_count,
        dayCount: r.day_count,
        usCount: r.us_count,
        lift: Number(r.lift) || 0,
      }))
      .sort((a, b) => b.lift - a.lift)
      .slice(0, limit),
  };
}

/**
 * 함께 언급된 국내 종목을 **미국 종목 단위로 묶어** 준다.
 *
 * ## 왜 묶나
 * lift 순으로 줄을 세우면 같은 미국 종목이 여러 줄에 흩어진다(퍼스트솔라가 1위와 3위).
 * 읽는 사람에게는 "퍼스트솔라 얘기엔 OCI홀딩스와 한화솔루션이 붙는다"가 한 덩어리다.
 *
 * ## 왜 lift 를 화면에서 걷어냈나
 * "260배"는 계산이 필요한 숫자다. 툴팁으로 설명해도 읽는 사람이 그 배수로 무엇을 해야
 * 할지 모른다. 대신 **"이 종목 얘기 9건 중 5건"** 을 보여 준다 — 분모와 분자가 다 있어
 * 눈으로 확인되고, 표본 크기가 저절로 드러난다(5회짜리가 279배로 보이던 문제도 같이 풀린다).
 *
 * ⚠️ **정렬은 여전히 lift 다.** 비율로 세우면 국내에서 흔한 종목이 위로 올라온다 —
 * 아무 미국 종목 얘기에나 끼는 이름이 "특별히 붙어 다니는 짝"으로 뒤바뀐다.
 * 화면에 안 보일 뿐 순서는 그대로다(각주가 그 사실을 적는다).
 */
export async function getUsComentionGroups(
  limitPairs = 10,
): Promise<{ asOf: string | null; windowDays: number; groups: UsComentionGroup[] }> {
  const { asOf, windowDays, rows } = await getUsKrComentions(limitPairs);
  const byTicker = new Map<string, UsComentionGroup>();
  for (const r of rows) {
    const g = byTicker.get(r.ticker) ?? {
      ticker: r.ticker,
      usName: r.usName,
      usCount: r.usCount,
      partners: [],
    };
    g.partners.push({
      stockCode: r.stockCode,
      krName: r.krName,
      pairCount: r.pairCount,
      channelCount: r.channelCount,
      dayCount: r.dayCount,
      lift: r.lift,
    });
    byTicker.set(r.ticker, g);
  }
  // 그룹 순서는 그 안의 **가장 강한 짝**이 정한다. 그래야 lift 순서가 묶은 뒤에도 남는다.
  const groups = [...byTicker.values()]
    .map((g) => ({ ...g, partners: g.partners.sort((a, b) => b.lift - a.lift) }))
    .sort((a, b) => (b.partners[0]?.lift ?? 0) - (a.partners[0]?.lift ?? 0));
  return { asOf, windowDays, groups };
}

/** 국내 종목코드 → 이름. `.in()` 목록도 1,000개 캡에 걸리므로 조각내어 부른다. */
async function krNameMap(codes: string[]): Promise<Map<string, string>> {
  const uniq = [...new Set(codes)];
  if (!uniq.length) return new Map();
  const db = getSupabaseAdmin();
  const out = new Map<string, string>();
  for (let i = 0; i < uniq.length; i += 300) {
    const { data, error } = await db.from("stocks").select("code,name").in("code", uniq.slice(i, i + 300));
    if (error) {
      console.error("[krNameMap] 종목명을 못 읽었습니다", error);
      continue;
    }
    for (const r of data ?? []) out.set(r.code as string, r.name as string);
  }
  return out;
}

/** 채널별 미장 비중과 국장 vs 미장 배분이 **같은 표 하나**를 본다. */
const loadChannelDaily = cache(async (days = 30) => {
  const db = getSupabaseAdmin();
  const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  return fetchAllRows<{ date: string; channel_handle: string; total_msgs: number; us_msgs: number; kr_msgs: number }>(
    "id",
    () =>
      db
        .from("telegram_us_channel_daily")
        .select("date,channel_handle,total_msgs,us_msgs,kr_msgs")
        .gte("date", since),
  );
});

/**
 * 채널의 미장 비중 — "이 채널이 미국을 얼마나 다루나".
 *
 * ⭐ **텔레그램 어디에도 없는 숫자다.** 채널 제목에도 소개에도 안 나온다.
 * 그리고 제목은 신호가 아니다 — 제목에 '미국'이 든 29채널이 만든 언급은 전체의 21%뿐이고,
 * 79%가 제목에 아무 표시 없는 평범한 국내 채널에서 나온다(증권사 전략팀 채널이 반쯤 미국이다).
 *
 * 최소 발행량을 거는 이유: 30일에 열 건 쓴 채널이 그중 다섯 건이 미국이면 50%가 되는데,
 * 그건 '미국을 많이 다루는 채널'이 아니라 표본이 없는 것이다.
 */
export async function getUsChannelShare(limit = 10, minMsgs = 100): Promise<UsChannelShare[]> {
  const [rows, { titleOf, photoUrlOf }] = await Promise.all([loadChannelDaily(), channelMeta()]);
  const agg = new Map<string, { us: number; total: number }>();
  for (const r of rows) {
    const a = agg.get(r.channel_handle) ?? { us: 0, total: 0 };
    a.us += r.us_msgs || 0;
    a.total += r.total_msgs || 0;
    agg.set(r.channel_handle, a);
  }
  return [...agg.entries()]
    .filter(([, a]) => a.total >= minMsgs && a.us > 0)
    .map(([handle, a]) => ({
      handle,
      title: titleOf.get(handle) ?? handle,
      photoUrl: photoUrlOf.get(handle) ?? null,
      usMsgs: a.us,
      totalMsgs: a.total,
      share: a.us / a.total,
    }))
    .sort((a, b) => b.share - a.share)
    .slice(0, limit);
}

/**
 * 국장 vs 미장 관심 배분 — 오늘 텔레그램이 어디를 보고 있나.
 *
 * ⭐ 두 시장을 다 가진 우리만 낼 수 있는 숫자다.
 * ⚠️ 미국·국내는 **겹칠 수 있다**(한 메시지가 양쪽을 다 말한다). 합이 100%가 아니다 —
 * 화면에서 100%로 채우는 그래픽(누적 막대)을 쓰면 거짓이 된다.
 */
export async function getMarketAttentionSplit(days = 14): Promise<MarketSplitPoint[]> {
  const rows = await loadChannelDaily();
  const byDate = new Map<string, MarketSplitPoint>();
  for (const r of rows) {
    const p = byDate.get(r.date) ?? { date: r.date, total: 0, us: 0, kr: 0 };
    p.total += r.total_msgs || 0;
    p.us += r.us_msgs || 0;
    p.kr += r.kr_msgs || 0;
    byDate.set(r.date, p);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-days);
}

/** 모니터링 현황. 카드 머리의 '무엇을 얼마나 보고 있나'를 채운다. */
export async function getUsKaderaSummary(): Promise<UsKaderaSummary> {
  const [channelRows, { rows, dates }] = await Promise.all([loadChannelDaily(), loadUsStockDaily(US_WINDOW_DAYS)]);
  const handles = new Set(channelRows.map((r) => r.channel_handle));
  const usHandles = new Set(channelRows.filter((r) => (r.us_msgs || 0) > 0).map((r) => r.channel_handle));
  return {
    usChannels: usHandles.size,
    totalChannels: handles.size,
    mentions: rows.reduce((s, r) => s + (r.mention_count || 0), 0),
    tickers: new Set(rows.map((r) => r.ticker)).size,
    lastDate: dates.at(-1) ?? null,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * 무슨 얘기가 오갔나 — 생태계 센티먼트 · 미장 화제어 (migration_034)
 *
 * 두 카드 다 **새로 분류하지 않는다.** 메시지별 톤·화제어는 시장 중립이라 국장이
 * 이미 붙여 둔 것을 미국 언급 메시지만 골라 세면 된다(실측 커버리지 98%).
 * 집계는 calculate_us_telegram_sentiment.py 가 하고 여기서는 읽기만 한다.
 * ──────────────────────────────────────────────────────────────────────────── */

export type UsSentiment = {
  /** 낙관도 = 중립을 뺀 낙관:비관 중 낙관 쪽. 국장 카드와 **같은 평활(k=5)** 을 쓴다 */
  score: number;
  label: string;
  tone: "hot" | "neutral" | "cold";
  positive: number;
  neutral: number;
  negative: number; // 셋의 합은 항상 100(반올림 보정)
  messageCount: number;
  windowDays: number;
  /** 같은 창의 **전체 대화** 낙관도. 없으면 null — 비교 줄을 안 그린다 */
  overallScore: number | null;
  /** 최근 14일 낙관도 추이(오름차순). 그날 표본이 없으면 그 날은 빠진다 */
  series: { date: string; score: number }[];
};

export type UsIssueKeyword = {
  rank: number;
  keyword: string;
  /** 최근 7일, 미국 종목을 언급한 메시지에서의 언급 수 */
  mentionCount: number;
  /** 같은 기간 전체 메시지에서의 언급 수 */
  totalCount: number;
  /** 전체 대비 미국 쪽에 몰린 정도. 1이면 전체와 같은 정도 */
  skew: number;
  channelCount: number;
  dayCount: number;
  trend: "up" | "flat" | "down" | null;
  computedFor: string;
};

type UsSentimentRow = {
  date: string;
  scope: string;
  positive_count: number;
  neutral_count: number;
  negative_count: number;
  message_count: number;
};

/**
 * 미장 센티먼트.
 *
 * 창의 끝점을 **미장 표의 마지막 날**로 잡는다. 국장 기준일(kaderaBaseDate)을 쓰면
 * 두 파이프라인이 갈린 날 창이 어긋나는데, 그건 이미 한 번 겪은 함정이다
 * (저장된 문장 vs 재계산 숫자 — 창은 길이만이 아니라 끝점도 맞아야 한다).
 */
export async function getUsSentiment(): Promise<UsSentiment | null> {
  const db = getSupabaseAdmin();
  const latest = await db
    .from("telegram_us_sentiment_daily")
    .select("date")
    .eq("scope", "overall")
    .order("date", { ascending: false })
    .limit(1);
  const base = latest.data?.[0]?.date as string | undefined;
  if (latest.error || !base) {
    if (latest.error) console.error("[getUsSentiment] 기준일을 못 읽었습니다", latest.error);
    return null;
  }

  // 추이 막대(14일)까지 한 번에 받는다. 창(3일)은 그 부분집합이라 조회가 하나면 된다.
  const from = addDays(base, -(US_SENTIMENT_SERIES_DAYS - 1));
  const { data, error } = await db
    .from("telegram_us_sentiment_daily")
    .select("date,scope,positive_count,neutral_count,negative_count,message_count")
    .eq("scope", "overall")
    .gte("date", from)
    .lte("date", base);
  if (error || !data?.length) {
    if (error) console.error("[getUsSentiment] 집계를 못 읽었습니다", error);
    return null;
  }
  const rows = data as UsSentimentRow[];

  // 창은 **기준일 포함 최근 N일**이다. 국장의 windowBefore 는 기준일을 빼는데,
  // 그건 그쪽 기준일이 '오늘'이라 하루가 덜 찼기 때문이다. 미장 기준일은 이미
  // 집계가 끝난 마지막 날이라 뺄 이유가 없다.
  const windowFrom = addDays(base, -(US_WINDOW_DAYS - 1));
  const win = rows.filter((r) => r.date >= windowFrom);
  const sum = win.reduce(
    (a, r) => ({
      pos: a.pos + (r.positive_count ?? 0),
      neu: a.neu + (r.neutral_count ?? 0),
      neg: a.neg + (r.negative_count ?? 0),
      total: a.total + (r.message_count ?? 0),
    }),
    { pos: 0, neu: 0, neg: 0, total: 0 },
  );
  if (!sum.total) return null;

  const [positive, neutral, negative] = toPercents(sum.pos, sum.neu, sum.neg);
  const score = optimismPct(sum.pos, sum.neg) ?? 50;
  const { label, tone } = sentimentTone(score);

  return {
    score,
    label,
    tone,
    positive,
    neutral,
    negative,
    messageCount: sum.total,
    windowDays: win.length || US_WINDOW_DAYS,
    overallScore: await overallOptimism(windowFrom, base),
    series: rows
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((r) => ({ date: r.date, score: optimismPct(r.positive_count ?? 0, r.negative_count ?? 0) }))
      .filter((p): p is { date: string; score: number } => p.score !== null),
  };
}

/**
 * 같은 창의 **전체 대화** 낙관도 — "미국 얘기가 전체보다 밝은가"를 한 줄로 말하는 재료.
 *
 * ⚠️ 이건 '국장 낙관도'가 **아니다.** telegram_sentiment_daily 의 `overall` 은 미국
 *    언급 메시지까지 포함한 코퍼스 전체다. 화면에서 "국장"이라고 쓰면 거짓이 되므로
 *    "전체 대화"로 적는다. 국장만 따로 세려면 국내 언급 메시지로 한 번 더 집계해야
 *    하는데, 두 집합이 36.4% 겹쳐서 '국장 낙관도'라는 말 자체가 애매해진다.
 */
async function overallOptimism(from: string, to: string): Promise<number | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("telegram_sentiment_daily")
    .select("positive_count,negative_count")
    .eq("scope", "overall")
    .gte("date", from)
    .lte("date", to);
  if (error || !data?.length) {
    if (error) console.error("[overallOptimism] 전체 센티먼트를 못 읽었습니다", error);
    return null;
  }
  const pos = data.reduce((s, r) => s + ((r.positive_count as number) ?? 0), 0);
  const neg = data.reduce((s, r) => s + ((r.negative_count as number) ?? 0), 0);
  return optimismPct(pos, neg);
}

/**
 * 미장 화제어 — **빈도가 아니라 쏠림 순이다.**
 *
 * 빈도로 뽑으면 국장 카드와 10줄 중 6줄이 겹친다(실측). 같은 채널이 쓴 같은 코퍼스라
 * 흔한 말은 양쪽에서 똑같이 흔하기 때문이다. 전체 대비 미국 쪽에 몰린 정도로 세우면
 * 겹치는 줄이 0이 된다 — 함께 언급 카드가 빈도 대신 lift 를 쓴 것과 같은 판단이다.
 *
 * 순위는 파이프라인이 정해 표에 박아 둔다. 여기서 다시 정렬하지 않는다.
 */
export async function getUsIssueKeywords(): Promise<UsIssueKeyword[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("telegram_us_issue_keyword")
    .select("rank,keyword,mention_count,total_count,skew,channel_count,day_count,trend,computed_for")
    .order("rank");
  if (error) {
    console.error("[getUsIssueKeywords] 화제어를 못 읽었습니다", error);
    return [];
  }
  return (data ?? []).map((r) => ({
    rank: r.rank as number,
    keyword: r.keyword as string,
    mentionCount: r.mention_count as number,
    totalCount: r.total_count as number,
    skew: Number(r.skew) || 1,
    channelCount: r.channel_count as number,
    dayCount: r.day_count as number,
    trend: (r.trend as UsIssueKeyword["trend"]) ?? null,
    computedFor: r.computed_for as string,
  }));
}

/* ────────────────────────────────────────────────────────────────────────────
 * 테마 로테이션 · 트렌딩 메시지 (migration_035)
 * ──────────────────────────────────────────────────────────────────────────── */

export type UsThemeRow = {
  theme: string;
  sharePct: number;
  mentionCount: number;
  stockCount: number;
  rank: number;
  /** 일주일 전 순위 대비 변동. 올라갔으면 양수. 비교할 과거가 없으면 null */
  rankChange: number | null;
  /** 최근 N일 점유율 추이(오름차순). 막대 스파크라인이 그린다 */
  series: number[];
};

export type UsTrendingMessage = {
  channelHandle: string;
  messageId: number;
  channelTitle: string;
  channelPhotoUrl: string | null;
  text: string;
  views: number;
  forwards: number;
  replies: number;
  postedAt: string;
  /** 이 메시지에 붙은 **미국** 종목의 한글 표기(최대 3개) */
  stocks: string[];
};

/** 테마 카드가 보는 일수. 순위 변동은 이 창 안에서 7일 전과 견준다. */
const THEME_SERIES_DAYS = 14;
const THEME_RANK_LOOKBACK = 7;

/**
 * 미장 테마 로테이션.
 *
 * ⚠️ **국장 테마 점유율과 나란히 두면 안 된다.** 분모가 서로 다르다 — 이쪽은 그날
 * '미국 종목 전체' 주목도이고, 저쪽은 '국내 종목 전체'다. 각자 자기 시장 안에서의
 * 비중이라 두 수치의 대소는 아무 뜻이 없다.
 */
export async function getUsThemeRotation(limit = 8): Promise<{ date: string | null; rows: UsThemeRow[] }> {
  const db = getSupabaseAdmin();
  const latest = await db
    .from("telegram_us_theme_daily")
    .select("date")
    .order("date", { ascending: false })
    .limit(1);
  const base = latest.data?.[0]?.date as string | undefined;
  if (latest.error || !base) {
    if (latest.error) console.error("[getUsThemeRotation] 기준일을 못 읽었습니다", latest.error);
    return { date: null, rows: [] };
  }

  const from = addDays(base, -(THEME_SERIES_DAYS - 1));
  // 하루 16행 × 14일이라 1,000행 캡에 한참 못 미친다. 그래도 페이징 헬퍼를 쓰는 이유는
  // 테마가 늘어날 여지가 있어서다 — 캡에 걸리면 조용히 잘린다.
  const rows = await fetchAllRows<{
    date: string;
    theme: string;
    share_pct: number;
    mention_count: number;
    stock_count: number;
    rank: number;
  }>("id", () =>
    db
      .from("telegram_us_theme_daily")
      .select("date,theme,share_pct,mention_count,stock_count,rank")
      .gte("date", from)
      .lte("date", base),
  );
  if (!rows.length) return { date: base, rows: [] };

  const dates = [...new Set(rows.map((r) => r.date))].sort();
  const byTheme = new Map<string, Map<string, (typeof rows)[number]>>();
  for (const r of rows) {
    const m = byTheme.get(r.theme) ?? new Map();
    m.set(r.date, r);
    byTheme.set(r.theme, m);
  }

  // 7일 전 순위. 그날 집계가 없으면(주말 결측 등) 비교하지 않는다 — 없는 날을 0으로
  // 치면 모든 테마가 크게 올라간 것처럼 보인다.
  const prevDate = dates.filter((d) => d <= addDays(base, -THEME_RANK_LOOKBACK)).at(-1) ?? null;

  return {
    date: base,
    rows: [...byTheme.entries()]
      .map(([theme, m]) => {
        const today = m.get(base);
        if (!today) return null;
        const prev = prevDate ? m.get(prevDate) : undefined;
        return {
          theme,
          sharePct: Number(today.share_pct) || 0,
          mentionCount: today.mention_count ?? 0,
          stockCount: today.stock_count ?? 0,
          rank: today.rank ?? 0,
          // 순위는 작을수록 위다 — 올라간 것을 양수로 만들려면 (과거 − 현재)다.
          rankChange: prev ? (prev.rank ?? 0) - (today.rank ?? 0) : null,
          series: dates.map((d) => Number(m.get(d)?.share_pct ?? 0)),
        };
      })
      .filter((r): r is UsThemeRow => r !== null)
      .sort((a, b) => a.rank - b.rank)
      .slice(0, limit),
  };
}

/** 트렌딩 메시지가 볼 수 있는 창. 파이프라인이 저장한 window_key 와 일대일. */
export type UsTrendingWindow = "today" | "w7" | "w30";

/**
 * 미장 트렌딩 메시지.
 *
 * 순위·본문은 파이프라인이 정해 표에 박아 둔다(국내와 같은 이유 — 창마다 표를 훑어
 * 점수로 다시 세우는 일을 렌더 시점에 하면 안 된다). 여기서는 채널 이름·사진만 붙인다.
 */
export async function getUsTrendingMessages(window: UsTrendingWindow, limit = 36): Promise<UsTrendingMessage[]> {
  const db = getSupabaseAdmin();
  const [{ data, error }, { titleOf, photoUrlOf }] = await Promise.all([
    db
      .from("telegram_us_trending_message")
      .select("channel_handle,message_id,text,views,forwards,replies,posted_at,stocks")
      .eq("window_key", window)
      .order("rank")
      .limit(limit),
    channelMeta(),
  ]);
  if (error) {
    console.error("[getUsTrendingMessages] 목록을 못 읽었습니다", error);
    return [];
  }
  return (data ?? []).map((r) => ({
    channelHandle: r.channel_handle as string,
    messageId: r.message_id as number,
    channelTitle: titleOf.get(r.channel_handle as string) ?? (r.channel_handle as string),
    channelPhotoUrl: photoUrlOf.get(r.channel_handle as string) ?? null,
    text: r.text as string,
    views: (r.views as number) ?? 0,
    forwards: (r.forwards as number) ?? 0,
    replies: (r.replies as number) ?? 0,
    postedAt: r.posted_at as string,
    stocks: (r.stocks as string[]) ?? [],
  }));
}

/* ────────────────────────────────────────────────────────────────────────────
 * LLM 문장 두 자리 — 오늘의 요약 · 주요 종목 리포트 (migration_036)
 *
 * 문장은 파이프라인(generate_us_telegram_narratives.py)이 만들어 표에 넣는다.
 * 여기서는 **읽기만** 한다 — 화면이 LLM 을 부르는 일은 없다.
 * ──────────────────────────────────────────────────────────────────────────── */

export type UsStockReport = {
  ticker: string;
  name: string;
  recentMentions: number;
  channelCount: number | null;
  series: number[];
  seriesDates: string[];
  price: number | null;
  changeRate: number | null;
  /** LLM 흐름 요약. 아직 생성 전이면 null — 카드가 그 자리에 이유를 적는다 */
  narrative: string | null;
};

/**
 * 오늘의 요약(총평).
 *
 * ⚠️ **`.eq("date", 기준일)` 로 집는다.** 최신 한 행을 집으면 그날 생성이 실패했을 때
 * 어제 문장이 오늘 숫자 옆에 붙는다(국내에서 실제로 그랬다). 못 찾으면 문장 없이 둔다 —
 * 틀린 기간을 말하는 문장을 붙이는 것보다 없는 편이 낫다.
 */
export async function getUsDailyBrief(): Promise<{ date: string | null; paragraphs: string[] }> {
  const db = getSupabaseAdmin();
  const latest = await db
    .from("telegram_us_sentiment_daily")
    .select("date")
    .eq("scope", "overall")
    .order("date", { ascending: false })
    .limit(1);
  const base = latest.data?.[0]?.date as string | undefined;
  if (latest.error || !base) {
    if (latest.error) console.error("[getUsDailyBrief] 기준일을 못 읽었습니다", latest.error);
    return { date: null, paragraphs: [] };
  }
  const { data, error } = await db
    .from("telegram_us_daily_brief")
    .select("sentiment_summary")
    .eq("date", base)
    .maybeSingle();
  if (error) {
    console.error("[getUsDailyBrief] 총평을 못 읽었습니다", error);
    return { date: base, paragraphs: [] };
  }
  const raw = (data?.sentiment_summary as string | null) ?? "";
  // 파이프라인이 세 대목을 빈 줄로 이어 저장한다. 그 빈 줄이 곧 문단 경계다.
  return { date: base, paragraphs: raw.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean) };
}

/**
 * 주요 종목 리포트 — 최근 창에서 가장 많이 회자된 미국 종목 + 흐름 요약.
 *
 * 종목 선정은 **파이프라인과 같은 규칙**이어야 한다(창 안 언급 수 내림차순). 규칙이
 * 갈리면 화면에 뜨는 종목의 문장이 비는데, 그게 가장 알아채기 어려운 어긋남이다 —
 * 파이프라인은 자기 목록만 보고 "다 만들었다"고 끝낸다.
 */
export async function getUsStockReports(limit = 4): Promise<UsStockReport[]> {
  const db = getSupabaseAdmin();
  const [{ rows, dates }, nameOf] = await Promise.all([loadUsStockDaily(14), usNameMap()]);
  if (!rows.length) return [];

  const windowFrom = dates.slice(-US_WINDOW_DAYS)[0] ?? dates[0];
  const agg = new Map<string, { mentions: number; channels: number; byDate: Map<string, number> }>();
  for (const r of rows) {
    const a = agg.get(r.ticker) ?? { mentions: 0, channels: 0, byDate: new Map() };
    a.byDate.set(r.date, r.mention_count || 0);
    if (r.date >= windowFrom) {
      a.mentions += r.mention_count || 0;
      // 일별 채널 수는 **최댓값**을 쓴다. 합치면 같은 채널을 며칠치 겹쳐 센다.
      a.channels = Math.max(a.channels, r.channel_count || 0);
    }
    agg.set(r.ticker, a);
  }

  const top = [...agg.entries()]
    .filter(([, a]) => a.mentions > 0)
    .sort((x, y) => y[1].mentions - x[1].mentions)
    .slice(0, limit);
  if (!top.length) return [];

  const base = dates.at(-1)!;
  const { data, error } = await db
    .from("telegram_us_stock_narrative")
    .select("ticker,narrative")
    .eq("date", base)
    .in("ticker", top.map(([t]) => t));
  if (error) console.error("[getUsStockReports] 흐름 요약을 못 읽었습니다", error);
  const narrativeOf = new Map((data ?? []).map((r) => [r.ticker as string, r.narrative as string]));

  const chartDates = dates.slice(-US_CHART_DAYS);
  const [quotes, breadth] = await Promise.all([usQuotes(top.map(([t]) => t)), usStockBreadth()]);
  const chOf = new Map(breadth.rows.map((r) => [r.ticker, r.channelCount]));
  return top.map(([ticker, a]) => ({
    ticker,
    name: nameOf.get(ticker) ?? ticker,
    recentMentions: a.mentions,
    // 창 전체 합집합. 없으면 일별 최댓값 폴백(getUsSurgingStocks 주석과 같은 이유).
    channelCount: chOf.get(ticker) ?? a.channels ?? null,
    series: chartDates.map((d) => a.byDate.get(d) ?? 0),
    seriesDates: chartDates,
    price: quotes.get(ticker)?.price ?? null,
    changeRate: quotes.get(ticker)?.changeRate ?? null,
    narrative: narrativeOf.get(ticker) ?? null,
  }));
}

/* ────────────────────────────────────────────────────────────────────────────
 * 관심의 폭 — 몇 곳이 말하나 (migration_037)
 * ──────────────────────────────────────────────────────────────────────────── */

export type UsStockBreadth = {
  ticker: string;
  name: string;
  channelCount: number;
  mentionCount: number;
};

/**
 * 종목별 **서로 다른** 채널 수. 파이프라인이 창을 정해 세어 둔 것을 그대로 읽는다.
 *
 * ⚠️ `telegram_us_stock_daily.channel_count` 로 갈음하면 안 된다. 그 열은 **그날 하루**의
 * 채널 수라 여러 날을 묶어도 합집합이 아니다. 합치면 같은 채널을 며칠치 겹쳐 세고,
 * 최댓값을 쓰면 실제보다 크게 작아진다(실측: 엔비디아 최댓값 100 vs 창 전체 204).
 * 국내가 같은 함정을 겪고 telegram_stock_breadth 를 판 이유가 이것이다.
 *
 * 렌더에서 직접 세지 않는 이유: 원자료 38,319행을 통째로 읽어야 하고 실측 2.37초다
 * (페이지 전체 렌더보다 오래 걸린다).
 */
export const usStockBreadth = cache(async (): Promise<{ asOf: string | null; windowDays: number; rows: UsStockBreadth[] }> => {
  const db = getSupabaseAdmin();
  const latest = await db
    .from("telegram_us_stock_breadth")
    .select("as_of_date,window_days")
    .order("as_of_date", { ascending: false })
    .limit(1);
  const head = latest.data?.[0];
  if (latest.error || !head) {
    if (latest.error) console.error("[usStockBreadth] 기준일을 못 읽었습니다", latest.error);
    return { asOf: null, windowDays: 0, rows: [] };
  }
  const { data, error } = await db
    .from("telegram_us_stock_breadth")
    .select("ticker,channel_count,mention_count")
    .eq("as_of_date", head.as_of_date)
    .eq("window_days", head.window_days)
    .order("channel_count", { ascending: false });
  if (error) {
    console.error("[usStockBreadth] 관심의 폭을 못 읽었습니다", error);
    return { asOf: head.as_of_date as string, windowDays: head.window_days as number, rows: [] };
  }
  const nameOf = await usNameMap();
  return {
    asOf: head.as_of_date as string,
    windowDays: head.window_days as number,
    rows: (data ?? []).map((r) => ({
      ticker: r.ticker as string,
      name: nameOf.get(r.ticker as string) ?? (r.ticker as string),
      channelCount: r.channel_count as number,
      mentionCount: r.mention_count as number,
    })),
  };
});

/** '몇 곳이 말하나' 카드가 그리는 상위 N개 + 전체 채널 수(막대의 분모). */
export async function getUsStockBreadth(limit = 10): Promise<{
  asOf: string | null;
  windowDays: number;
  totalChannels: number;
  rows: UsStockBreadth[];
}> {
  const [{ asOf, windowDays, rows }, { titleOf }] = await Promise.all([usStockBreadth(), channelMeta()]);
  return { asOf, windowDays, totalChannels: titleOf.size, rows: rows.slice(0, limit) };
}
