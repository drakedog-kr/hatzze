import { isLoadFailed } from "@/lib/load-state";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import {
  KADERA_WINDOW_DAYS,
  fetchAllRows,
  getSurgingStocks,
  getThemeRotation,
  kaderaBaseDate,
  windowBefore,
} from "@/lib/telegram-data";
import type { SearchIndex } from "@/lib/search-rank";
import { THEME_NAMES, US_THEME_NAMES } from "@/lib/theme-href";
import { US_WINDOW_DAYS, getUsSurgingStocks, getUsThemeRotation, usKaderaBaseDate } from "@/lib/us-telegram-data";

/**
 * ⌘K 검색(components/command-palette.tsx)이 여는 순간 한 번 받는 목록.
 *
 * 왜 따로 받나. 목록을 화면 HTML 에 같이 실으면 모든 방문이 이걸 받는다 — 배당 화면이 종목 4,366개를
 * 통째로 실어 gzip 219KB 가 된 것과 같은 자리다. 검색을 여는 사람만 받게 여기로 뺐다.
 *
 * ## 무엇을 싣나 (2026-09-26 개편)
 *
 * 예전엔 사이트맵과 같은 기준(90일 중 언급된 날 20일 이상, 약 750종목)만 실었다. 그건 얇은 화면을 색인에서
 * 빼려는 잣대라 검색 목록 잣대로는 안 맞았다 — 최근 7일에 언급된 1,268종목 중 602종목(그 주 언급량의
 * 16.2%)이 빠졌고, 그 종목들도 화면은 멀쩡히 있다(noindex 일 뿐). 미장은 아예 없었다. 그래서:
 *
 *   kr     국장 `stocks` 전부(약 2,800) — [코드, 이름, 최근 3일 언급]. 화면이 있는 종목 전부다.
 *   us     미장 사전 `us_stocks` 전부(약 200) — [티커, 한글 이름, 영문명, 최근 3일 언급]. 가는 곳은
 *          /insider/stock/티커 — 그 화면이 카더라 언급 추이로 시작하는 미장 종목 화면이다.
 *   trend  빈 검색창에 띄울 '지금 뜨는 종목' — MDD 검색창 추천(app/mdd/page.tsx loadSuggestions)의
 *          급부상 묶음과 같은 계산·같은 자리 나눔(국장 3 · 미장 2).
 *   themes '지금 뜨는 테마' — 카더라 테마 로테이션의 점유율 증감 상위(국장 2 · 미장 1).
 *
 * 크기는 압축해서 30KB 안팎이다(2,781종목 + 3일 언급 실측 28KB · 예전 750종목 8.6KB).
 *
 * ## 언급 수는 종목 화면과 같은 창이다
 *
 * '최근 3일'은 카더라 창(KADERA_WINDOW_DAYS · 기준일을 뺀 앞 사흘)이다. 종목 화면 히어로의 "최근 3일 N회"와
 * 같은 계산이라 검색에서 본 숫자가 눌러 들어간 화면에도 그대로 있다. ⛔ 못 셌으면 0 이 아니라 null 을
 * 보낸다 — 0 은 "아무도 말 안 했다"는 뜻이 분명한 답이라, 조회 실패를 그걸로 위장하면 안 된다.
 *
 * ## 실패는 따로따로
 *
 * 국장 종목 목록을 못 읽으면 503(검색이 설 자리가 없다). 나머지(언급 수·미장·추천·테마)는 각자 비워서
 * 보낸다 — 추천 하나가 삐끗했다고 종목 검색까지 막을 까닭이 없다.
 *
 * 한 시간마다 새로 만든다(목록과 집계가 하루 두 번 파이프라인에서만 바뀐다).
 */
export const revalidate = 3600;

/** '지금 뜨는 종목' 줄 수와 그중 미장 자리 — MDD 추천(SUGGEST_ROWS · SUGGEST_US_ROWS)과 같은 값. */
const TREND_ROWS = 5;
const TREND_US_ROWS = 2;
/** '지금 뜨는 테마' 줄 수. 국장 둘 · 미장 하나. */
const THEME_KR_ROWS = 2;
const THEME_US_ROWS = 1;

const fail = (where: string) => (e: unknown) => console.error(`[search-index] ${where}`, e);

/** 창 안 종목별 언급 합. 조회가 한 번이라도 실패하면 null(부분 합을 진짜처럼 쓰지 않는다). */
async function mentionSums(table: "telegram_stock_daily" | "telegram_us_stock_daily", key: "stock_code" | "ticker", days: string[]) {
  let failed = false;
  // ⚠️ 정렬 키는 date 가 아니라 id 다 — 하루에 종목 수백 행이 달려 date 는 유일하지 않다(fetchAllRows 주석 [2]).
  const rows = await fetchAllRows<Record<string, string | number>>(
    "id",
    () =>
      getSupabaseAdmin()
        .from(table)
        .select(`${key},mention_count`)
        .gte("date", days[0])
        .lte("date", days[days.length - 1])
        .gt("mention_count", 0),
    {
      onError: (e) => {
        failed = true;
        fail(`${table} 언급 수를 못 읽었습니다`)(e);
      },
    },
  );
  if (failed) return null;
  const sum = new Map<string, number>();
  for (const r of rows) sum.set(r[key] as string, (sum.get(r[key] as string) ?? 0) + (Number(r.mention_count) || 0));
  return sum;
}

async function loadKr(base: string) {
  const db = getSupabaseAdmin();
  let failed = false;
  const [stocks, sums] = await Promise.all([
    // `stocks` 는 2,700행을 넘는다 — 1,000행 캡에 걸리지 않게 이어 받는다(정렬 키 code 는 유일하다).
    fetchAllRows<{ code: string; name: string }>("code", () => db.from("stocks").select("code,name"), {
      onError: (e) => {
        failed = true;
        fail("국장 종목 목록을 못 읽었습니다")(e);
      },
    }),
    mentionSums("telegram_stock_daily", "stock_code", windowBefore(base, KADERA_WINDOW_DAYS)),
  ]);
  if (failed || !stocks.length) return null;
  return stocks.map((s): [string, string, number | null] => [s.code, s.name, sums ? (sums.get(s.code) ?? 0) : null]);
}

async function loadUs(): Promise<SearchIndex["us"]> {
  const db = getSupabaseAdmin();
  const [{ data, error }, sums] = await Promise.all([
    // 사전은 200행 남짓이라 한 번에 받는다(1,000행 캡 아래).
    db.from("us_stocks").select("ticker,name_ko,name_en").order("ticker"),
    usKaderaBaseDate().then((b) => mentionSums("telegram_us_stock_daily", "ticker", windowBefore(b, US_WINDOW_DAYS))),
  ]);
  if (error) {
    fail("미장 사전을 못 읽었습니다")(error);
    return [];
  }
  return (data ?? []).map((r) => {
    const t = r.ticker as string;
    return [t, (r.name_ko as string) || t, (r.name_en as string | null) ?? null, sums ? (sums.get(t) ?? 0) : null];
  });
}

async function loadTrend(krList: Promise<SearchIndex["kr"] | null>): Promise<SearchIndex["trend"]> {
  const [kr, us, list] = await Promise.all([
    getSurgingStocks(TREND_ROWS, { withQuotes: false }).catch((e) => {
      fail("국장 급부상을 못 읽었습니다")(e);
      return [];
    }),
    getUsSurgingStocks(TREND_US_ROWS, { withQuotes: false }).catch((e) => {
      fail("미장 급부상을 못 읽었습니다")(e);
      return [];
    }),
    krList,
  ]);
  const krNames = new Map((list ?? []).map(([code, name]) => [code, name]));
  // 이름은 검색 목록의 이름을 쓴다 — 같은 종목이 추천과 검색 결과에서 다른 표기로 보이지 않게.
  // 목록에 없는 코드(상폐 등)는 뺀다. 눌러도 화면이 404 다.
  const krRows = kr
    .filter((s) => krNames.has(s.code))
    .map((s) => ({ market: "kr" as const, code: s.code, name: krNames.get(s.code)!, ratio: s.isNew ? null : s.ratio }));
  const usRows = us.map((s) => ({ market: "us" as const, code: s.ticker, name: s.name, ratio: s.multiple }));
  // 국장을 다 받아 두고 미장이 채운 만큼만 잘라 낸다 — 미장 집계가 비는 날에도 다섯 줄이 찬다(MDD 와 같은 규칙).
  return [...krRows.slice(0, TREND_ROWS - usRows.length), ...usRows];
}

async function loadThemes(): Promise<SearchIndex["themes"]> {
  const [kr, us] = await Promise.all([
    getThemeRotation(100).catch((e) => {
      fail("국장 테마 로테이션을 못 읽었습니다")(e);
      return [];
    }),
    getUsThemeRotation(US_THEME_NAMES.length).catch((e) => {
      fail("미장 테마 로테이션을 못 읽었습니다")(e);
      return { date: null, rows: [] };
    }),
  ]);
  // 점유율이 **는** 테마만. 준 테마를 '뜨는' 자리에 올리지 않는다. 사전에 없는 테마는 눌러도 갈 곳이 없어 뺀다.
  const krRows = (isLoadFailed(kr) ? [] : kr)
    .filter((t) => t.shareDelta != null && t.shareDelta > 0 && THEME_NAMES.includes(t.theme))
    .sort((a, b) => b.shareDelta! - a.shareDelta! || a.theme.localeCompare(b.theme, "ko"))
    .slice(0, THEME_KR_ROWS)
    .map((t) => ({ market: "kr" as const, name: t.theme, delta: t.shareDelta! }));
  const usRows = us.rows
    .filter((t) => t.shareDelta != null && t.shareDelta > 0 && US_THEME_NAMES.includes(t.theme))
    .sort((a, b) => b.shareDelta! - a.shareDelta! || a.theme.localeCompare(b.theme, "ko"))
    .slice(0, THEME_US_ROWS)
    .map((t) => ({ market: "us" as const, name: t.theme, delta: t.shareDelta! }));
  return [...krRows, ...usRows];
}

export async function GET() {
  const base = await kaderaBaseDate();
  const krList = loadKr(base);
  const [kr, us, themes, trend] = await Promise.all([krList, loadUs(), loadThemes(), loadTrend(krList)]);
  if (kr === null) {
    return Response.json({ error: "종목 목록을 불러오지 못했습니다" }, { status: 503 });
  }
  const body: SearchIndex = { kr, us, trend, themes, asOf: base };
  return Response.json(body);
}
