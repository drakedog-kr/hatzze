import "server-only";

import { cache } from "react";

import { getSupabaseAdmin } from "./supabase-server";
import { KADERA_WINDOW_DAYS, kaderaBaseDate, windowBefore } from "./telegram-data";
import { THEMES } from "./stock-themes";

/**
 * 종목 한 종목의 실주소 화면(`/stock/005930`)이 쓰는 자료.
 *
 * ## 왜 이 화면이 따로 있나
 *
 * 여태 종목 하나를 가리키는 주소는 `/mdd?code=005930` 뿐이었다. 그 화면은 낙폭 계산을
 * **브라우저에서** 하므로, 크롤러가 받는 첫 HTML 에는 종목 이름조차 없다. 2026-09-01
 * 서치콘솔 실측으로 그런 주소 37개가 **전부 같은 제목**("MDD 정밀분석 | hatzze")으로
 * 평균 15위에 걸려 있었다. 검색어는 "램리서치 디시"·"이수페타시스 디시"·"메리츠증권
 * 텔레그램" 처럼 우리 자료가 실제로 답하는 것들이었는데, 답이 적힌 화면이 없었다.
 *
 * 그래서 **서버가 그리는** 종목 화면을 따로 연다. 여기 담기는 건 전부 우리 자료다 —
 * 어디서 몇 번 회자됐나. 시세·재무는 어디에나 있고 우리 원천도 아니라 곁다리로만 둔다.
 *
 * ## ⚠️ 이 화면은 464장이다
 *
 * 조회 하나를 잘못 고르면 그 대가가 464배로 돌아온다. 두 가지를 특히 피한다.
 *
 *   ① **야후를 부르지 않는다.** `getStockReport` 는 시세를 야후에서 받는데(stockQuote),
 *      크롤러가 훑으면 종목마다 바깥 요청이 하나씩 붙는다. 여기서는 `stocks` 표에
 *      KRX 로 받아 둔 종가를 쓴다(마이그레이션 015).
 *   ② **관심의 폭(서로 다른 채널 수)을 즉석에서 세지 않는다.** `recentChannelCount` 는
 *      저장값(telegram_stock_breadth)이 있는 종목만 싸고, 그 표는 상위 몇 종목만
 *      담는다. 나머지 450여 종목은 telegram_message_stocks 조인으로 떨어지는데 그게
 *      한 번에 수천 행이다(마이그레이션 028 머리말: 웜 931ms · 콜드 22초).
 *      그래서 이 화면은 **일별 채널 수**만 쓴다 — telegram_stock_daily 가 이미 들고
 *      있는 값이고, "그날 이 종목을 다룬 채널 수"라는 뜻 그대로 쓰면 정확하다.
 *      ⛔ 일별 값을 더하거나 최댓값을 '기간 채널 수'로 부르지 말 것. 날이 다르면 채널
 *         명단도 다르다 — 합집합은 일별 개수만으로 복원되지 않는다(telegram-data.ts
 *         recentChannelCount 머리말에 같은 함정이 적혀 있다).
 */

/** 막대로 그리는 기간(일). 30일이면 주 단위 리듬이 보이고 한 줄에도 들어간다. */
export const STOCK_TREND_DAYS = 30;

/**
 * 화면의 '최근' 수치와 사이트맵 자격을 함께 재는 기간(일).
 *
 * 지금 자료는 2026-07-12 부터라 90일을 잡아도 실제로는 52일이 담긴다. 그래도 90 으로
 * 적어 두는 이유는, 자료가 쌓여도 **자격 기준의 뜻이 안 변하게** 하기 위해서다.
 * "언급된 날 20일"은 분모가 있어야 뜻이 서는 값인데, 분모를 '가진 자료 전부'로 두면
 * 반년 뒤에 같은 20일이 훨씬 무른 조건이 된다.
 */
export const STOCK_STAT_DAYS = 90;

/**
 * 사이트맵에 싣는 문턱 — 최근 STOCK_STAT_DAYS 일 중 **언급된 날이 며칠 이상**인가.
 *
 * 2026-09-01 실측 분포(자료 52일):
 *   1일+ 2,636종목 · 5일+ 1,822 · 10일+ 1,113 · 15일+ 696 · **20일+ 467** · 30일+ 230
 *
 * ⚠️ 이 467 과 사이트맵에 실리는 464 는 **다른 잣대다.** 위 분포는 가진 자료 전부를
 *    센 것이고, 실제 판정은 기준일을 빼고(아직 반나절뿐이라) `mention_count > 0` 인
 *    날만 센다. 숫자가 안 맞아 보이면 이 둘부터 확인할 것.
 *
 * 20 으로 잡은 까닭은 아래쪽이 **하루 이틀 스쳐 간 종목**이기 때문이다. 그런 종목의
 * 화면은 막대가 거의 비어 있어 색인해 봐야 얇은 페이지가 2,000장 느는 것뿐이고,
 * 크롤링 예산도 그만큼 먹는다(그 예산이 이미 아바타 이미지 71장에 새고 있었다).
 *
 * ⚠️ 문턱 아래 종목도 **화면은 열린다.** 사람이 링크를 타고 올 수 있어서다. 다만
 *    그 화면은 metadata 에서 noindex 를 단다 — 사이트맵과 색인 정책이 어긋나면 안 된다.
 */
export const STOCK_INDEX_MIN_DAYS = 20;

export type StockTrendPoint = {
  date: string;
  mentions: number;
  /** 그날 이 종목을 다룬 채널 수. **기간 합집합이 아니다**(머리말 ② 참고). */
  channels: number;
};

export type StockPageData = {
  code: string;
  name: string;
  market: string | null;
  /** KRX 종가. 야후가 아니라 `stocks` 표에서 온다. */
  price: number | null;
  changeRate: number | null;
  priceDate: string | null;
  /** 막대용. 언급이 없는 날도 0으로 채워 STOCK_TREND_DAYS 칸이 늘 찬다. */
  trend: StockTrendPoint[];
  /** 최근 STOCK_STAT_DAYS 일 언급 합. */
  totalMentions: number;
  /** 그중 언급이 있던 날 수. 사이트맵 자격과 같은 잣대다. */
  activeDays: number;
  /** 하루에 가장 많이 언급된 날. 언급이 아예 없으면 null. */
  peak: { date: string; mentions: number } | null;
  /** 하루 채널 수의 최댓값과 그날. '기간 채널 수'가 아니라 **하루** 값이다. */
  peakChannels: { date: string; channels: number } | null;
  /** 카더라 리포트와 같은 창(기준일 앞 사흘) 언급 합. LLM 문장이 말하는 기간이다. */
  recentMentions: number;
  /** 파이프라인이 써 둔 LLM 한 문장. 상위 몇 종목만 있고 나머지는 null. */
  narrative: string | null;
  /** 이 종목이 속한 테마(사전 기준). 없으면 빈 배열. */
  themes: string[];
  /** 색인 대상인가 — 사이트맵 자격과 같은 규칙. `loadFailed` 면 판정할 수 없어 늘 false 다. */
  indexable: boolean;
  /**
   * 일별 집계를 **못 읽었나.**
   *
   * ⛔ 이 값이 없으면 조회 실패가 "언급이 한 번도 없는 종목"과 화면에서 똑같아진다.
   *    그 자체로도 거짓말이지만 더 나쁜 게 있다 — 언급 0 은 문턱 미달이라 **noindex** 가
   *    붙는다. DB 가 한 번 삐끗한 사이에 크롤러가 왔다면 멀쩡한 화면이 색인에서 빠진다.
   *    그래서 실패일 때는 색인 여부를 **말하지 않는다**(robots 자체를 안 붙인다).
   */
  loadFailed: boolean;
  /** 집계의 기준일(카더라와 같은 값). */
  baseDate: string;
};

/** 종목코드 형식. `/api/mdd`·`/mdd` 의 국내 검증과 같은 규칙이어야 한다. */
export const KR_CODE_RE = /^[0-9A-Z]{6}$/;

/** 종목명 → 그 종목이 속한 테마들. 사전을 한 번만 뒤집어 둔다. */
const THEMES_BY_STOCK: Map<string, string[]> = (() => {
  const m = new Map<string, string[]>();
  for (const [theme, names] of Object.entries(THEMES)) {
    for (const name of names) {
      const cur = m.get(name);
      if (cur) cur.push(theme);
      else m.set(name, [theme]);
    }
  }
  return m;
})();

/**
 * 종목 화면 한 장치.
 *
 * `stocks` 에 없는 코드면 null 을 돌려 호출부가 404 를 내게 한다. 조회가 **실패한**
 * 경우와 구분해야 해서 실패는 로그에 남긴다 — 실재하는 종목이 조회 한 번 실패했다고
 * 404 가 되면 그 화면이 색인에서 빠진다(getStockReport 가 같은 자리에 같은 경고를 단다).
 */
export const getStockPage = cache(async (code: string): Promise<StockPageData | null> => {
  if (!KR_CODE_RE.test(code)) return null;
  const db = getSupabaseAdmin();

  const { data: stock, error } = await db
    .from("stocks")
    .select("name,market,close_price,change_rate,price_date")
    .eq("code", code)
    .maybeSingle();
  if (error) console.error(`[getStockPage] ${code} 종목 정보를 못 읽었습니다`, error);
  if (!stock) return null;

  const baseDate = await kaderaBaseDate();
  // 기준일은 뺀다 — 아직 하루가 덜 차서 넣으면 막대가 늘 짧고 합계에도 반쪽이 섞인다.
  // (windowBefore 가 그 규칙을 갖고 있다. 창을 쓰는 곳마다 따로 계산하지 않는다.)
  const statDays = windowBefore(baseDate, STOCK_STAT_DAYS);
  const trendDays = statDays.slice(-STOCK_TREND_DAYS);
  const recentDays = statDays.slice(-KADERA_WINDOW_DAYS);
  const last = statDays[statDays.length - 1];

  // 일별 집계 행. Supabase 가 select 문자열로 타입을 못 좁히므로 여기서 한 번만 적는다.
  type DailyRow = { date: string; mention_count: number | null; channel_count: number | null };

  const [dailyRes, narrative] = await Promise.all([
    db
      .from("telegram_stock_daily")
      .select("date,mention_count,channel_count")
      .eq("stock_code", code)
      .gte("date", statDays[0])
      .lte("date", last)
      .order("date"),
    // 문장은 기준일 한 벌만 있다. 상위 몇 종목만 있고 나머지는 없는 게 정상이라
    // 실패와 부재를 구분하지 않는다 — 어느 쪽이든 문장을 안 그린다.
    (async () => {
      const { data } = await db
        .from("telegram_stock_narrative")
        .select("narrative")
        .eq("date", baseDate)
        .eq("stock_code", code)
        .maybeSingle();
      return (data?.narrative as string | undefined) ?? null;
    })().catch(() => null),
  ]);
  // ⚠️ 90일치라도 종목 하나는 90행을 못 넘는다(날짜당 한 행). 1,000행 캡과 무관하다.
  if (dailyRes.error) console.error(`[getStockPage] ${code} 언급 집계를 못 읽었습니다`, dailyRes.error);

  const loadFailed = Boolean(dailyRes.error);
  const rows = (dailyRes.data ?? []) as DailyRow[];
  const byDate = new Map(rows.map((r) => [r.date, r]));
  // 언급이 0인 날은 표에 행이 자체가 없다. 있는 행만 그리면 종목마다 막대 개수가 달라져
  // 나란히 놓인 두 화면이 서로 다른 기간을 그린다(getStockReport 주석에 같은 경고).
  const trend: StockTrendPoint[] = trendDays.map((date) => {
    const r = byDate.get(date);
    return {
      date,
      mentions: r?.mention_count ?? 0,
      channels: r?.channel_count ?? 0,
    };
  });

  let totalMentions = 0;
  let activeDays = 0;
  let peak: StockPageData["peak"] = null;
  let peakChannels: StockPageData["peakChannels"] = null;
  for (const r of rows) {
    const m = r.mention_count || 0;
    const c = r.channel_count || 0;
    totalMentions += m;
    if (m > 0) activeDays += 1;
    if (m > 0 && (!peak || m > peak.mentions)) peak = { date: r.date, mentions: m };
    if (c > 0 && (!peakChannels || c > peakChannels.channels))
      peakChannels = { date: r.date, channels: c };
  }

  const recentSet = new Set(recentDays);
  const recentMentions = rows.reduce(
    (s: number, r: DailyRow) => (recentSet.has(r.date) ? s + (r.mention_count || 0) : s),
    0,
  );

  const name = stock.name as string;
  return {
    code,
    name,
    market: (stock.market as string) ?? null,
    price: (stock.close_price as number | null) ?? null,
    changeRate: (stock.change_rate as number | null) ?? null,
    priceDate: (stock.price_date as string | null) ?? null,
    trend,
    totalMentions,
    activeDays,
    peak,
    peakChannels,
    recentMentions,
    narrative,
    themes: THEMES_BY_STOCK.get(name) ?? [],
    indexable: !loadFailed && activeDays >= STOCK_INDEX_MIN_DAYS,
    loadFailed,
    baseDate,
  };
});

export type IndexableStock = { code: string; name: string; market: string | null; activeDays: number };

/**
 * 사이트맵에 실을 종목 목록 — 최근 STOCK_STAT_DAYS 일 중 언급된 날이
 * STOCK_INDEX_MIN_DAYS 일 이상인 종목.
 *
 * ## 왜 30번을 나눠 묻나
 *
 * "종목별로 며칠이나 언급됐나"는 한 줄짜리 GROUP BY 인데 **PostgREST 가 집계 함수를
 * 막아 뒀다**(실측: `select=stock_code,date.count()` → PGRST123 "Use of aggregate
 * functions is not allowed"). 그래서 행을 받아 와서 여기서 센다.
 *
 * 순차로 돌면 왕복 30번이 그대로 더해진다. **먼저 총 행수를 묻고 페이지 수만큼 한꺼번에
 * 던진다** — 실측(2026-09-01, 29,977행/30페이지) 총 1.25초 중 병렬 수집이 0.57초였다.
 * 순차였다면 왕복 30번이다.
 *
 * ⏳ 자료가 쌓이면 페이지 수가 는다. 90일 정상 상태에서 하루 600행 안팎이니 54페이지
 *    언저리에서 멎는다(창이 90일로 잘려 있어 무한정 늘지 않는다). 그보다 느려지면
 *    Supabase 에 뷰를 하나 만들어 한 번에 받는 쪽으로 옮긴다 —
 *    `create view … select stock_code, count(*) … group by stock_code`.
 *    뷰는 SQL editor 에서 만들어야 해서(수동 단계) 지금은 안 만들었다.
 *
 * 실패하면 **빈 목록이 아니라 null** 이다. 빈 사이트맵은 "실을 게 없다"고 말하는데,
 * 실은 못 읽은 것이라서 그 둘이 크롤러에게 같은 뜻이 되면 안 된다(호출부가 500 을 낸다).
 */
export async function listIndexableStocks(): Promise<IndexableStock[] | null> {
  const db = getSupabaseAdmin();
  const baseDate = await kaderaBaseDate();
  const days = windowBefore(baseDate, STOCK_STAT_DAYS);
  const [from, to] = [days[0], days[days.length - 1]];

  const PAGE = 1000;
  /**
   * ⚠️⚠️ **`order` 를 빼지 말 것.** PostgREST 의 `range` 는 SQL 의 OFFSET/LIMIT 인데,
   * ORDER BY 가 없으면 SQL 은 행 순서를 **약속하지 않는다.** 아래에서 30페이지를 한꺼번에
   * 던지는데, 그중 몇은 Postgres 가 병렬 스캔으로 풀어 서로 다른 순서를 돌려준다.
   * 그러면 같은 행이 두 페이지에 겹쳐 오고 다른 행은 어디에도 안 온다.
   *
   * 처음엔 정렬 없이 짰고 손으로 한 번 재서 464개가 나와 통과시켰다. 다섯 번 이어서
   * 재 보니 **347 · 348 · 339 · 345 · 464** 였다(2026-09-01). 요청마다 100개 넘는 종목이
   * 조용히 사라진다. 에러도 경고도 없고, 사이트맵은 여전히 멀쩡한 XML 이다.
   *
   * `id` 는 이 표의 기본키라 유일하고 인덱스가 있다. 유일하지 않은 키로 정렬하면
   * 같은 값끼리의 순서가 또 안 정해져 같은 병이 남는다.
   */
  const base = () =>
    db
      .from("telegram_stock_daily")
      .select("stock_code,date")
      .gte("date", from)
      .lte("date", to)
      .gt("mention_count", 0)
      .order("id");

  // 총 행수는 여기서 한 번만 센다. `count: "exact"` 는 요청마다 표를 통째로 세므로
  // 30페이지에 다 붙이면 같은 COUNT 를 30번 돌린다.
  const head = await db
    .from("telegram_stock_daily")
    .select("stock_code", { count: "exact", head: true })
    .gte("date", from)
    .lte("date", to)
    .gt("mention_count", 0);
  if (head.error) {
    console.error("[listIndexableStocks] 행수를 못 셌습니다", head.error);
    return null;
  }
  const total = head.count ?? 0;
  // count 를 못 받으면(헤더가 없거나 0) 아래 페이지 계산이 0이 돼 목록이 조용히 빈다.
  // 그건 "실을 게 없다"로 위장한 실패라, 못 셌으면 못 셌다고 말한다.
  if (!total) {
    console.error(`[listIndexableStocks] 창 ${from}~${to} 에 행이 없습니다`);
    return null;
  }

  const pages = Math.ceil(total / PAGE);
  const chunks = await Promise.all(
    Array.from({ length: pages }, (_, i) => base().range(i * PAGE, i * PAGE + PAGE - 1)),
  );
  if (chunks.some((c) => c.error)) {
    console.error("[listIndexableStocks] 일부 페이지를 못 읽었습니다 — 목록이 잘리지 않게 통째로 물러납니다");
    return null;
  }

  const days_ = new Map<string, Set<string>>();
  for (const c of chunks) {
    for (const r of c.data ?? []) {
      const code = r.stock_code as string;
      let s = days_.get(code);
      if (!s) days_.set(code, (s = new Set()));
      s.add(r.date as string);
    }
  }
  const codes = [...days_.entries()]
    .filter(([, s]) => s.size >= STOCK_INDEX_MIN_DAYS)
    .sort((a, b) => b[1].size - a[1].size)
    .map(([code, s]) => ({ code, activeDays: s.size }));
  if (!codes.length) return [];

  // 이름·시장은 사이트맵엔 안 쓰지만 호출부(테마 이웃·디버깅)가 쓴다. 목록이 500개
  // 안팎이라 `.in()` URL 이 길어진다 — 이 저장소가 여러 번 물린 자리라 조각내어 묻는다.
  const CHUNK = 200;
  const known = new Map<string, { name: string; market: string | null }>();
  for (let i = 0; i < codes.length; i += CHUNK) {
    const slice = codes.slice(i, i + CHUNK).map((c) => c.code);
    const { data, error } = await db.from("stocks").select("code,name,market").in("code", slice);
    if (error) {
      console.error("[listIndexableStocks] 종목 이름을 못 읽었습니다", error);
      return null;
    }
    for (const r of data ?? []) known.set(r.code as string, { name: r.name as string, market: (r.market as string) ?? null });
  }

  // `stocks` 에 없는 코드는 뺀다 — 화면이 404 를 내므로 사이트맵에 실으면 안 된다.
  return codes
    .filter((c) => known.has(c.code))
    .map((c) => ({ code: c.code, name: known.get(c.code)!.name, market: known.get(c.code)!.market, activeDays: c.activeDays }));
}

/** 종목 실주소. 한 곳에서만 만든다 — 링크와 사이트맵이 어긋나면 안 된다. */
export const stockHref = (code: string) => `/stock/${code}`;

/** 그 종목의 MDD 정밀분석 주소(도구 화면). */
export const stockMddHref = (code: string, market: string | null) =>
  `/mdd?code=${code}${market ? `&market=${market}` : ""}`;

/** 날짜를 "8월 29일" 로. 화면 여러 곳이 같은 꼴을 쓴다. */
export function fmtKoDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(m)}월 ${Number(d)}일`;
}

/**
 * 같은 테마에 속한 다른 종목들 — 화면 아래쪽 '함께 보는 종목' 줄이 쓴다.
 *
 * ## 왜 굳이 링크를 다나
 *
 * 종목 화면 464장은 **서로 이어져 있지 않으면 크롤러가 못 닿는다.** 사이트맵에만 있는
 * 주소는 발견은 되어도 우선순위가 낮게 잡힌다. 사전이 이미 종목을 테마로 묶어 두고
 * 있으니, 새 자료 없이 화면마다 이웃 대여섯 개를 이어 줄 수 있다.
 *
 * ⚠️ 사전은 **손으로 고른 대표 바스켓**이다(lib/stock-themes.ts 머리말). 업종 전체를
 *    대표하는 통계가 아니므로 화면에서도 "이 테마의 전부"라고 말하지 않는다.
 * ⚠️ 앞에서부터 자른다 — 사전의 앞쪽이 대형주라 MDD 비교 대상과 같은 순서다.
 *    순서를 흔들면 저쪽 비교군까지 같이 바뀐다.
 */
export async function themePeerStocks(
  code: string,
  themes: string[],
  limit = 8,
): Promise<{ code: string; name: string }[]> {
  if (!themes.length) return [];
  // 여러 테마에 걸친 종목은 첫 테마만 쓴다. 둘을 합치면 이웃이 20개가 넘어 줄이 길어지고,
  // 무엇을 기준으로 묶인 목록인지도 흐려진다.
  const names = (THEMES[themes[0]] ?? []).slice(0, limit + 4);
  if (!names.length) return [];
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("stocks").select("code,name").in("name", names);
  if (error) {
    // 곁다리 줄이다. 못 읽으면 그 줄만 안 그린다 — 화면 전체를 막지 않는다.
    console.error(`[themePeerStocks] ${themes[0]} 이웃 종목을 못 읽었습니다`, error);
    return [];
  }
  const byName = new Map((data ?? []).map((r) => [r.name as string, r.code as string]));
  return names
    .map((name) => ({ name, code: byName.get(name) ?? "" }))
    .filter((s) => s.code && s.code !== code)
    .slice(0, limit);
}
