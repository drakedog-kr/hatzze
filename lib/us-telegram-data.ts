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
 *   telegram_us_comention      미국 × 국내 동시 언급 — **화면은 안 읽는다.**
                             카드를 걷어냈고(2026-08-11), 지금은 '오늘의 요약' 셋째 대목의
                             재료로만 쓴다(generate_us_telegram_narratives.py 가 직접 읽는다).
 */
import { cache } from "react";

import { getSupabaseAdmin } from "@/lib/supabase-server";
import { sentimentTone } from "@/lib/format";
import { channelMeta, fetchAllRows, lastKaderaUpdatedAt, optimismPct, toPercents } from "@/lib/telegram-data";
import { changeRateOf, fetchYahooQuote } from "@/lib/yahoo-quote";
import { yahooSymbol } from "@/lib/yahoo-history";
import { US_THEMES } from "@/lib/us-stock-themes";

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
 *
 * ⚠️ 내부자 리포트(lib/insider-data.ts)도 이 함수를 쓴다. 두 화면이 **같은 심볼 규칙과
 * 같은 캐시**를 타야 한 종목이 한쪽에서만 시세가 뜨는 일이 없다. 고칠 때 둘 다 볼 것.
 */
export async function usQuotes(tickers: string[]): Promise<Map<string, { price: number; changeRate: number | null }>> {
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
  /** 집계가 닿아 있는 마지막 날(KST). */
  lastDate: string | null;
  /** 파이프라인이 마지막으로 수집한 시각. 히어로 '최종 업데이트'가 이걸 쓴다 —
      국장 히어로와 **같은 원천**이라 두 화면이 같은 시각을 말한다. */
  lastUpdated: string | null;
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
  // 셋은 서로 안 기댄다 — 나란히 띄운다.
  const [channelRows, { rows, dates }, lastUpdated] = await Promise.all([
    loadChannelDaily(),
    loadUsStockDaily(US_WINDOW_DAYS),
    // 국장과 같은 규칙으로 '이 화면이 만들어진 시각'을 쓴다(telegram-data 의 주석 참고).
    lastKaderaUpdatedAt(getSupabaseAdmin(), "telegram_us_daily_brief"),
  ]);
  const handles = new Set(channelRows.map((r) => r.channel_handle));
  const usHandles = new Set(channelRows.filter((r) => (r.us_msgs || 0) > 0).map((r) => r.channel_handle));
  return {
    usChannels: usHandles.size,
    totalChannels: handles.size,
    mentions: rows.reduce((s, r) => s + (r.mention_count || 0), 0),
    tickers: new Set(rows.map((r) => r.ticker)).size,
    lastDate: dates.at(-1) ?? null,
    lastUpdated,
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
  /** 테마별 낙관↔비관(중립 제외). 표본을 같이 넘긴다 — 얇은 테마는 100:0 같은 극단값이
   *  나오는데, 몇 건 기준인지 보여줘야 그 숫자를 제대로 읽을 수 있다(국장과 같은 규칙). */
  byTheme: { name: string; pos: number; positive: number; negative: number; total: number }[];
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
  /** 최근 3일 평균 점유율 − 그 이전 평균(%p). trend 와 **같은 뺄셈**에서 나온다 —
      trend 는 여기에 flat 문턱만 더한 것이다(migration_038). 비교할 과거가 없으면 null */
  shareDelta: number | null;
  computedFor: string;
};

/**
 * 히어로 센티먼트 칸에 막대로 그릴 테마 수와, 막대에 오를 최소 표본.
 *
 * 국장(lib/telegram-data.ts 의 THEME_TOP_N · THEME_MIN_DECIDED)과 **같은 값**이다.
 * 두 화면이 같은 자리에서 다른 개수를 그리면 오갈 때 어느 쪽이 규칙인지 알 수 없다.
 * 4개인 것은 조판이 정한 값이다 — 이 칸은 히어로의 25% 폭이라 왼쪽 큰 숫자 블록과
 * 높이가 맞는 한계가 4줄이다.
 *
 * ⚠️ 국장은 이 두 값을 총평 생성기(generate_telegram_narratives.py)와도 맞춰야 했다.
 *    미장 총평(generate_us_telegram_narratives.py)은 **테마별 톤을 재료로 안 쓴다** —
 *    그래서 여기서는 짝이 없다. 미장 총평에 테마 톤을 넣게 되면 그때 같이 맞출 것.
 */
const US_THEME_TOP_N = 4;
const US_THEME_MIN_DECIDED = 8;

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
  //
  // ⚠️ scope 를 안 거른다 — 테마별 막대까지 같은 조회에서 나온다. 14일 × 17스코프라
  //    1,000행 캡에 못 미친다(전체 표가 484행). 캡 근처가 되면 fetchAllRows 로 옮길 것.
  const from = addDays(base, -(US_SENTIMENT_SERIES_DAYS - 1));
  const { data, error } = await db
    .from("telegram_us_sentiment_daily")
    .select("date,scope,positive_count,neutral_count,negative_count,message_count")
    .gte("date", from)
    .lte("date", base);
  if (error || !data?.length) {
    if (error) console.error("[getUsSentiment] 집계를 못 읽었습니다", error);
    return null;
  }
  const all = data as UsSentimentRow[];
  const rows = all.filter((r) => r.scope === "overall");
  if (!rows.length) return null;

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

  // 테마별 막대는 **큰 숫자와 같은 창**(창 안 합계)을 쓴다. 하루치로 그리면 옆의
  // 76% 와 다른 사흘을 말하게 되어, 같은 칸 안에서 두 값이 어긋난다.
  const themeAgg = new Map<string, { pos: number; neg: number; total: number }>();
  for (const r of all) {
    if (r.scope === "overall" || r.date < windowFrom) continue;
    const a = themeAgg.get(r.scope) ?? { pos: 0, neg: 0, total: 0 };
    a.pos += r.positive_count ?? 0;
    a.neg += r.negative_count ?? 0;
    a.total += r.message_count ?? 0;
    themeAgg.set(r.scope, a);
  }
  // 언급이 많은 테마부터 넷. '가장 밝은 테마'로 세우면 표본 얇은 테마가 늘 위에 선다.
  const byTheme = [...themeAgg.entries()]
    .filter(([, a]) => a.pos + a.neg >= US_THEME_MIN_DECIDED)
    .map(([name, a]) => ({
      name,
      pos: optimismPct(a.pos, a.neg) ?? 50,
      positive: a.pos,
      negative: a.neg,
      total: a.total,
    }))
    .sort((x, y) => y.total - x.total)
    .slice(0, US_THEME_TOP_N);

  return {
    score,
    label,
    tone,
    positive,
    neutral,
    negative,
    messageCount: sum.total,
    windowDays: win.length || US_WINDOW_DAYS,
    byTheme,
    series: rows
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((r) => ({ date: r.date, score: optimismPct(r.positive_count ?? 0, r.negative_count ?? 0) }))
      .filter((p): p is { date: string; score: number } => p.score !== null),
  };
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
    .select("rank,keyword,mention_count,total_count,skew,channel_count,day_count,trend,share_delta,computed_for")
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
    // 0 도 뜻이 있는 값이라(움직이지 않았다) `?? null` 이 아니라 null 검사를 한다.
    shareDelta: r.share_delta === null || r.share_delta === undefined ? null : Number(r.share_delta),
    computedFor: r.computed_for as string,
  }));
}

/* ────────────────────────────────────────────────────────────────────────────
 * 테마 로테이션 · 트렌딩 메시지 (migration_035)
 * ──────────────────────────────────────────────────────────────────────────── */

/** 테마 호버 목록의 한 줄. 누르면 그 종목의 MDD 정밀분석이 열린다(국장과 같은 어법). */
export type UsThemeStock = { ticker: string; name: string; mentions: number };

export type UsThemeRow = {
  theme: string;
  sharePct: number;
  mentionCount: number;
  stockCount: number;
  rank: number;
  /** 일주일 전 순위 대비 변동. 올라갔으면 양수. 비교할 과거가 없으면 null */
  rankChange: number | null;
  /** 같은 7일 전과 견준 점유율 변동(%p). 순위와 **같은 비교일**을 쓴다 —
      두 값이 다른 날을 가리키면 "점유율은 늘었는데 순위는 그대로"가 설명이 안 된다 */
  shareDelta: number | null;
  /** 최근 N일 점유율 추이(오름차순). 막대 스파크라인이 그린다 */
  series: number[];
  /** 이 테마를 이룬 종목 — 창 안 언급 순. 줄에 마우스를 올리면 열린다 */
  stocks: UsThemeStock[];
};

/**
 * 테마 → 창 안에서 실제로 언급된 종목 목록.
 *
 * ⚠️ **종목 수를 여기서 낸다**(집계표의 stock_count 를 안 쓴다). 그 값은 하루치라
 * 창 전체에 쓰려면 최댓값을 잡는 수밖에 없는데, 그러면 목록의 길이와 안 맞는다 —
 * 국장이 같은 자리에서 겪은 일이다("반도체는 최대 6이지만 사흘 동안 언급된 종목은 7개").
 * 언급 수는 창 전체 합인데 종목만 하루치 최대면 잣대가 어긋난다.
 */
async function usThemeStocks(windowDates: string[]): Promise<Map<string, UsThemeStock[]>> {
  const out = new Map<string, UsThemeStock[]>();
  if (!windowDates.length) return out;
  const db = getSupabaseAdmin();

  const themesOf = new Map<string, string[]>();
  for (const [theme, tickers] of Object.entries(US_THEMES)) {
    for (const t of tickers) themesOf.set(t, [...(themesOf.get(t) ?? []), theme]);
  }

  // 창이 3일이라 지금은 1,000행에 못 미치지만, 추출 종목이 늘면 조용히 잘린다 — 페이징한다.
  const [daily, nameOf] = await Promise.all([
    fetchAllRows<{ ticker: string; mention_count: number; weighted_score: number }>("id", () =>
      db
        .from("telegram_us_stock_daily")
        .select("ticker,mention_count,weighted_score")
        .in("date", windowDates),
    ),
    usNameMap(),
  ]);

  const agg = new Map<string, Map<string, { m: number; w: number }>>();
  for (const r of daily) {
    for (const theme of themesOf.get(r.ticker) ?? []) {
      const per = agg.get(theme) ?? new Map<string, { m: number; w: number }>();
      const a = per.get(r.ticker) ?? { m: 0, w: 0 };
      a.m += r.mention_count || 0;
      a.w += Number(r.weighted_score) || 0;
      per.set(r.ticker, a);
      agg.set(theme, per);
    }
  }

  for (const [theme, per] of agg) {
    out.set(
      theme,
      [...per.entries()]
        // ⚠️ 언급 수가 아니라 **주목도(weighted)** 순이다 — 테마 점유율을 매긴 잣대와 같아야
        // "1등 테마를 끌어올린 게 누구인가"가 목록 맨 위에 온다(국장과 같은 규칙).
        // 그래서 옆에 적히는 회수는 순서와 안 맞을 수 있고, 머리에 '주목도순'이라 밝힌다.
        // 동점은 티커로 못박는다 — 안 그러면 렌더마다 순서가 흔들린다.
        .sort((a, b) => b[1].w - a[1].w || a[0].localeCompare(b[0]))
        .map(([ticker, a]) => ({ ticker, name: nameOf.get(ticker) ?? ticker, mentions: a.m })),
    );
  }
  return out;
}

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

/**
 * 테마 카드의 창. **국장(lib/telegram-data.ts)과 같은 값·같은 규칙이다.**
 *
 * 예전엔 기준일 **하루치**를 7일 전 하루와 견줬다. 그러면 주말·수집이 얇은 날에
 * 점유율이 통째로 요동친다 — 국장 쪽 주석이 그래서 창을 며칠씩 묶어 쓴다고 적어 두었다.
 *
 * 최근 3일 평균 vs **5일 이상 이전** 평균. 사이 이틀(3·4일 전)을 비워 두는 이유는
 * 겹침을 막으려는 게 아니라(공백 없이도 안 겹친다) 경계를 갓 넘어온 날을 막으려는
 * 것이다 — 공백이 없으면 기준 창의 가장 최근 날이 '어제까지 최근 창에 있던 날'이라,
 * 최근 3일을 하루 밀린 자기 자신과 견주는 꼴이 된다.
 */
const THEME_SERIES_DAYS = 14;
const THEME_RECENT_DAYS = 3;
const THEME_PRIOR_GAP_DAYS = 5;

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

  const dayMs = 86_400_000;
  const daysBefore = (d: string) =>
    (new Date(`${base}T00:00:00Z`).getTime() - new Date(`${d}T00:00:00Z`).getTime()) / dayMs;

  const recentDates = dates.slice(-THEME_RECENT_DAYS);
  // recent 는 **개수**로, prior 는 **날짜 간격**으로 잡는다. 수집이 며칠 끊기면 recent 가
  // 5일 전보다 더 뒤까지 손을 뻗어 같은 날이 양쪽에 들어가므로 명시적으로 뺀다(국장이
  // 실제로 겪은 함정 — 카더라 수집은 2026-07-26~28 에 이틀 멈춘 적이 있다).
  const priorDates = dates.filter(
    (d) => daysBefore(d) >= THEME_PRIOR_GAP_DAYS && !recentDates.includes(d),
  );

  const themeNames = [...byTheme.keys()];
  // 그날 안 뜬 테마는 0 으로 치므로 **창 전체 일수**로 나눈다(등장한 날 수가 아니다).
  const avgShare = (win: string[]) =>
    new Map(
      themeNames.map((t) => {
        const m = byTheme.get(t)!;
        const sum = win.reduce((a, d) => a + (Number(m.get(d)?.share_pct) || 0), 0);
        return [t, sum / Math.max(1, win.length)];
      }),
    );
  const rankMap = (shares: Map<string, number>) =>
    new Map([...shares].sort((a, b) => b[1] - a[1]).map(([t], i) => [t, i + 1]));

  const stocksOf = await usThemeStocks(recentDates);
  const recentShare = avgShare(recentDates);
  const priorShare = priorDates.length ? avgShare(priorDates) : null;
  const currRank = rankMap(recentShare);
  const prevRank = priorShare ? rankMap(priorShare) : null;

  return {
    date: base,
    rows: themeNames
      .map((theme) => {
        const m = byTheme.get(theme)!;
        const share = recentShare.get(theme) ?? 0;
        const prior = priorShare?.get(theme) ?? null;
        return {
          theme,
          sharePct: share,
          // 언급 수는 창 전체 합. 점유율이 창 평균이므로 여기만 하루치면 두 숫자가
          // 다른 기간을 말하게 된다.
          mentionCount: recentDates.reduce((a, d) => a + (m.get(d)?.mention_count ?? 0), 0),
          // 종목 수는 **목록의 길이**다. 집계표의 stock_count(하루치)를 쓰면 호버로 열리는
          // 목록과 숫자가 어긋난다(usThemeStocks 주석).
          stockCount: stocksOf.get(theme)?.length ?? 0,
          stocks: stocksOf.get(theme) ?? [],
          rank: currRank.get(theme) ?? 0,
          // 순위는 작을수록 위다 — 올라간 것을 양수로 만들려면 (과거 − 현재)다.
          rankChange: prevRank ? (prevRank.get(theme) ?? 0) - (currRank.get(theme) ?? 0) : null,
          shareDelta: prior === null ? null : share - prior,
          series: dates.map((d) => Number(m.get(d)?.share_pct ?? 0)),
        };
      })
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

/* '비관이 앞선 종목' 카드의 조회(getUsNegativeStocks)가 여기 있었다. 화면은 걷었고
   (2026-08-12 · 나중에 다시 만든다), 재료인 telegram_us_stock_tone 은 파이프라인이 계속
   채운다 — 되살릴 때 표를 새로 파거나 소급 집계할 필요가 없다. 설계와 두 함정(시황
   나열글이 40종목에 비관을 나눠 주는 것 · 인용글이 시장 코멘트로 뽑히는 것)은
   supabase/migration_039_add_us_stock_tone.sql 머리 주석에 그대로 남아 있다. */

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
