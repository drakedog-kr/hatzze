import "server-only";

import { cache } from "react";

import { getSupabaseAdmin } from "./supabase-server";
import {
  KADERA_WINDOW_DAYS,
  LLM_TEXT_CARRY_DAYS,
  addDaysISO,
  channelMeta,
  fetchAllRows,
  getThemeRotation,
  kaderaBaseDate,
  lastKaderaUpdatedAt,
} from "./telegram-data";
import { THEMES } from "./stock-themes";
import { expectedUsualMentions } from "./stock-usual";
import { prevWindowRanks, thinDays, usableDays, withTodayRank } from "./theme-flow";
import { themeDetailWindow } from "./theme-window";
import { getEventsForCodes, todayKst, type UpcomingEvent } from "./kadera-why";
import { isLoadFailed } from "./load-state";
import { RISER_FALLBACK_DAYS, risersWithFallback, type RiserRow, type ThemeRiser } from "./theme-risers";
import { changeRateOf, fetchYahooQuote } from "./yahoo-quote";

/**
 * 테마 실주소 화면(`/theme/반도체`)과 테마 목록(`/theme`)이 쓰는 자료.
 *
 * ## 왜 이 화면이 있나
 *
 * 우리 화면은 종목 하나(`/stock/…`)와 시장 전체(`/kadera`)에서만 "무슨 얘기가 도나"에
 * 답했다. 그 사이의 **테마** 단위가 비어 있었다. 사람들이 검색하는 말은 "로봇 관련주",
 * "원전 테마주"처럼 테마 단위이고, 다른 테마 사이트들은 시세로 묶은 종목 목록만 보여준다.
 * 채널에서 그 테마를 두고 무슨 얘기가 도는지는 언급 시계열을 가진 우리만 낼 수 있다.
 *
 * ## 무엇으로 만드나 — 전부 이미 있는 표다
 *
 *   telegram_theme_daily        일별 점유율·순위(30일 추이)
 *   telegram_stock_daily        테마 종목의 최근 사흘 언급(말 많은 종목)
 *   telegram_stock_move_reason  종목이 움직인 날의 한 줄 까닭(까닭 이력)
 *   telegram_stock_event        앞날의 일정
 *   telegram_theme_brief        요즘 무슨 얘기(LLM 두세 문장)·함께 언급된 테마·발췌 — 마이그레이션 080
 *                               + 갑자기 많이 언급된 종목과 까닭(riser jsonb) — 마이그레이션 081
 *
 * ⚠️ **발췌를 렌더 때 telegram_messages 에서 고르지 않는다.** 처음엔 "최근 사흘 · 이 테마 종목이
 *    태그된 글 · 조회순 15건"을 조인 한 번으로 받았는데, 반도체는 50ms 인 그 조회가 로봇에서는
 *    statement timeout(8초)으로 죽었다(2026-09-19 실측). 조회순 인덱스를 따라 내려가며 조인
 *    조건을 하나씩 확인하는 계획이라, 태그가 드문 테마일수록 훑는 행이 는다. 그래서 발췌는
 *    파이프라인이 테마마다 골라 brief 행에 넣어 두고(generate_theme_briefs.py), 화면은 읽기만 한다.
 *
 * ## ⚠️ 이 화면은 테마 수만큼이다(지금 26장)
 *
 * 종목 화면(464장)만큼 많지는 않지만 같은 규칙을 지킨다 — **야후를 부르지 않고**,
 * `.in()` 목록은 테마 하나의 종목 수(최대 55)라 URL 한도 안이다. 30일치 테마 집계는
 * 날짜당 한 행이라 1,000행 캡과 무관하다.
 *
 * ## 테마 이름이 주소다
 *
 * `/theme/${encodeURIComponent(테마)}`. 사전(lib/stock-themes.ts)의 키가 곧 주소라
 * 사전에 없는 이름은 404 다. 이름에 든 가운뎃점(전력기기·전선)은 퍼센트 부호화되어
 * 오가고, 화면은 decodeURIComponent 로 되돌려 사전을 찾는다.
 */

/** 추이 막대 기간(일). 종목 화면과 같은 30일이다. */
export const THEME_TREND_DAYS = 30;

/** 까닭 이력이 거슬러 올라가는 기간(일). 추이 막대와 같은 기간이라 점과 목록이 같은 날을 말한다. */
export const THEME_REASON_DAYS = THEME_TREND_DAYS;

// 주소 만들기·되돌리기는 lib/theme-href.ts 에 있다(셸도 읽어야 해서 server-only 밖이다).
export { THEME_NAMES, themeFromParam, themeHref, themeSlug } from "./theme-href";
export { RISER_MAX, RISER_MIN_MENTIONS, RISER_MIN_RATIO, parseRisers, type RiserRow, type ThemeRiser } from "./theme-risers";

export type ThemeMember = { code: string; name: string; market: string | null };

/**
 * 최근 거래일 테마 종목의 등락 묶음 — 히어로 '점유율' 칸의 '시세 반응'. 언급(말) 옆에 시세(값)를 두어
 * 값이 말을 따라왔는지 보인다. 시세는 stocks 표의 KRX 최근 종가라 날마다 아침에 전날 것으로 바뀐다
 * (project_daily_content: KRX 는 그날 종가를 다음 날 아침에 준다). 오른 종목·내린 종목 수만 적고 사고팔라는
 * 말은 두지 않는다.
 */
export type ThemeQuotes = {
  /** 종가 날짜(가장 많은 종목이 가진 날짜). 등락이 하나도 없으면 null. */
  date: string | null;
  /** 등락이 있는 종목의 단순 평균(%). */
  avgChange: number | null;
  up: number;
  down: number;
  flat: number;
};

export type ThemeTrendPoint = {
  date: string;
  /** 그날 전체 주목도 중 이 테마 비중(%). 집계가 없는 날은 0. */
  share: number;
  /** 그날 점유율 순위. 집계가 없는 날은 null. */
  rank: number | null;
  mentions: number;
  /** 표본이 거의 없어 계산에서 뺀 날(기준일 아침 · lib/theme-flow.ts thinDays). 막대는 바닥선, 말풍선은 '집계 전' — 0.0% 로 적으면 틀린 값으로 읽혔다(2026-10-05 머지 전 점검). */
  thin?: boolean;
  /** 그날 이 테마 종목에 까닭 한 줄이 붙었나 — 추이 위에 점으로 찍는다. */
  hasReason: boolean;
};

export type ThemeHotStock = ThemeMember & {
  /** 최근 사흘 언급 합. */
  mentions: number;
  /**
   * 평소의 사흘치 언급 — 30일 기간에서 최근 사흘을 뺀 27일의 하루 평균 × 3. 종목 지도의 색과 표의 "평소 대비 +60%"가
   * 이것과 견준다. 0 이면 지난 한 달 언급이 없던 종목(새로 등장). 처음엔 '바로 앞 사흘'과 견줬는데 "앞 사흘의 58%"가
   * 직관적이지 않았다(2026-09-21) — 히어로의 '평소 대비'와 같은 잣대로 맞춘다.
   */
  usualMentions: number;
  /** 최근 사흘 중 하루 최다 채널 수. **기간 합집합이 아니다**(lib/stock-page.ts 머리말 ②). */
  channels: number;
  /**
   * 요즘 도는 얘기 한 줄(LLM 20~28자) — 파이프라인이 화면과 같은 규칙으로 고른 줄마다 써 둔 것(테마 요약 행의 talk ·
   * 마이그레이션 092). 그 종목 이야기가 발췌에 없었거나 고르는 규칙이 경계에서 갈렸으면 null.
   */
  talk: string | null;
};

export type ThemeReasonRow = ThemeMember & {
  date: string;
  reason: string;
  changeRate: number | null;
  /**
   * 그날 종가(원) — 국장은 KRX 확정 종가(telegram_stock_move_reason.close_price, 다음 날 등락률과 같이 채워진다), 오늘 줄은 야후 지금가.
   * 미장은 늘 null — 채널 글에 적힌 등락률뿐이라 '그날 종가'가 정의되지 않는다(마이그레이션 069). 화면 '등락의 이유'가 % 앞에 적는다(2026-10-04).
   */
  close: number | null;
  channelCount: number;
};

export type ThemeRelated = { theme: string; messages: number };

export type ThemeExcerpt = {
  channelHandle: string;
  messageId: number;
  channelTitle: string;
  channelPhotoUrl: string | null;
  postedAt: string;
  views: number;
  forwards: number;
  text: string;
  /** 이 메시지에 붙은 테마 종목명(태그). */
  stocks: string[];
};

export type ThemeBrief = {
  date: string;
  /**
   * LLM 두세 문장. null 이면 둘 중 하나다 — messageCount 가 0 이면 그 기간에 글이 없었던 것이고,
   * 0 이 아니면 만든 문장이 전부 검사(깨진 글자·매수·매도 표현)에 걸려 싣지 않은 것이다.
   */
  brief: string | null;
  messageCount: number;
  related: ThemeRelated[];
  /** 파이프라인이 고른 발췌. 채널 제목·사진은 렌더 때 붙인다. */
  excerpts: ThemeExcerpt[];
};

export type ThemePageData = {
  theme: string;
  /** 사전의 종목(사전 순서). 시세는 stocks 표의 KRX 값이다. */
  members: ThemeMember[];
  /** 최근 거래일 테마 종목의 등락 묶음(위 ThemeQuotes). */
  quotes: ThemeQuotes;
  baseDate: string;
  /** 최근 사흘(기준일 포함). 히어로 점유율(테마 로테이션)과 같은 창이다(lib/theme-window.ts). */
  recentDays: string[];
  /** 최근 사흘 평균 점유율(%)과 순위. 테마 로테이션 카드와 같은 계산이다. */
  recentShare: number | null;
  recentRank: number | null;
  shareDelta: number | null;
  rankChange: number | null;
  trend: ThemeTrendPoint[];
  hotStocks: ThemeHotStock[];
  reasons: ThemeReasonRow[];
  /** 오늘 이후 일정 전부(정밀도 무관, 가까운 날부터). 화면이 날짜 있는 것은 달력에, 달·분기만 짚인 것은 그 아래에 가른다. */
  events: UpcomingEvent[];
  brief: ThemeBrief | null;
  /** 집계(추이·말 많은 종목)를 못 읽었나. 실패를 '언급 없음'으로 위장하지 않으려는 표시. */
  loadFailed: boolean;
};

type MemberRow = ThemeMember & { changeRate: number | null; priceDate: string | null };

/** 테마의 종목 사전을 stocks 표의 코드로 옮긴다. 사전에 있어도 stocks 에 없는 이름은 빠진다(파이프라인도 같다). 등락도 같이 든다. */
async function themeMembers(theme: string): Promise<MemberRow[] | null> {
  const names = THEMES[theme] ?? [];
  if (!names.length) return [];
  const db = getSupabaseAdmin();
  // 테마 하나는 최대 55종목이라 한 번에 물어도 URL 이 짧다. 그래도 80씩 끊는다 —
  // 사전이 더 커져도 안 깨지게(telegram-data.ts themeStocks 의 같은 규칙).
  const out = new Map<string, MemberRow>();
  for (let i = 0; i < names.length; i += 80) {
    // 등락(change_rate·price_date)도 같은 조회로 받는다 — 히어로의 '시세 반응'이 쓴다(ThemeQuotes).
    const { data, error } = await db.from("stocks").select("code,name,market,change_rate,price_date").in("name", names.slice(i, i + 80));
    if (error) {
      console.error(`[themeMembers] ${theme} 종목 코드를 못 읽었습니다`, error);
      return null;
    }
    for (const r of data ?? []) {
      out.set(r.name as string, {
        code: r.code as string,
        name: r.name as string,
        market: (r.market as string) ?? null,
        changeRate: r.change_rate == null ? null : Number(r.change_rate),
        priceDate: (r.price_date as string | null) ?? null,
      });
    }
  }
  // 사전 순서를 지킨다 — 앞쪽이 대표 종목이다(lib/stock-themes.ts 머리말).
  return names.map((n) => out.get(n)).filter((m): m is MemberRow => Boolean(m));
}

/**
 * **오늘 날짜의 까닭 줄**에만 야후 등락률 · 지금가를 채운다. 까닭은 저녁에 만들어지는데 KRX 종가는 이튿날 낮에야 와서
 * (generate_move_reasons.fill_krx) 오늘 줄은 하루 동안 등락률이 비어 있었다. 데일리 노트가 오늘 글에만 야후를
 * 보는 규칙(lib/daily-note.ts getNoteStocks)을 그대로 따른다:
 *   - 오늘(KST)이고 change_rate 가 비어 있는 줄만. 어제 줄은 안 본다 — 야후의 등락률은 늘 '지금 세션'이라
 *     이튿날 장이 열리면 어제 줄에 오늘 값이 앉는다. 어제 줄은 KRX 가 낮에 채울 때까지 '종가 전'으로 둔다.
 *   - 못 구하면 null 그대로(화면이 '종가 전'을 적는다). 캐시는 데일리 노트와 같은 600초.
 * 오늘 까닭은 하루 몇 줄이라(테마 하나 5줄 안팎) 요청 수가 작다.
 */
async function fillTodayRates(reasons: ThemeReasonRow[]): Promise<void> {
  const today = todayKst();
  const todo = reasons.filter((r) => r.date === today && (r.changeRate == null || r.close == null));
  if (!todo.length) return;
  await Promise.all(
    todo.map(async (r) => {
      try {
        const q = await fetchYahooQuote(`${r.code}.${r.market === "KOSDAQ" ? "KQ" : "KS"}`, { next: { revalidate: 600 } });
        const rate = q ? changeRateOf(q) : null;
        if (r.changeRate == null && rate != null) r.changeRate = rate;
        if (r.close == null && q) r.close = q.price;
      } catch (e) {
        console.error(`[getThemePage] ${r.code} 오늘 등락을 야후에서 못 받았습니다`, e);
      }
    }),
  );
}

/** 종목 등락을 테마 하나의 묶음으로. 날짜는 가장 많은 종목이 가진 것 — 상장 직후 종목의 옛 날짜 하나에 끌려가지 않게. 미장(lib/us-theme-page.ts)도 쓴다. */
export function themeQuotes(rows: { changeRate: number | null; priceDate: string | null }[]): ThemeQuotes {
  const have = rows.filter((r) => r.changeRate != null && r.priceDate);
  if (!have.length) return { date: null, avgChange: null, up: 0, down: 0, flat: 0 };
  const byDate = new Map<string, number>();
  for (const r of have) byDate.set(r.priceDate!, (byDate.get(r.priceDate!) ?? 0) + 1);
  const date = [...byDate.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? 1 : -1))[0][0];
  const onDate = have.filter((r) => r.priceDate === date);
  const up = onDate.filter((r) => r.changeRate! > 0).length;
  const down = onDate.filter((r) => r.changeRate! < 0).length;
  return {
    date,
    avgChange: onDate.reduce((sum, r) => sum + r.changeRate!, 0) / onDate.length,
    up,
    down,
    flat: onDate.length - up - down,
  };
}

/** telegram_theme_brief · telegram_us_theme_brief 의 한 행(둘이 같은 열이다 — 마이그레이션 082). */
export type BriefExcerptRow = { channel_handle: string; message_id: number; posted_at: string; views?: number | null; forwards?: number | null; text: string; stocks?: string[] | null };
export type BriefRow = {
  date: string;
  brief: string | null;
  related: ThemeRelated[] | null;
  excerpts: BriefExcerptRow[] | null;
  message_count: number | null;
  /** 말 많은 종목마다 요즘 도는 얘기 {종목코드: 한 줄}(마이그레이션 092). 그 전 행은 null. */
  talk?: Record<string, unknown> | null;
};

/** 요약 행의 talk 를 {코드: 한 줄}로. 문자열이 아닌 값 · 빈 문자열은 버린다. */
export function talkOf(b: BriefRow | null): Map<string, string> {
  const out = new Map<string, string>();
  if (!b?.talk || typeof b.talk !== "object") return out;
  for (const [code, text] of Object.entries(b.talk)) {
    if (typeof text === "string" && text.trim()) out.set(code, text.trim());
  }
  return out;
}

/** 요약 행을 화면 타입으로. 채널 제목·사진은 여기서 붙인다. related 는 사전에 있는 이름만 남긴다. */
export function parseBriefRow(b: BriefRow | null, meta: Awaited<ReturnType<typeof channelMeta>>, known: (theme: string) => boolean): ThemeBrief | null {
  if (!b) return null;
  const excerpts: ThemeExcerpt[] = (Array.isArray(b.excerpts) ? b.excerpts : [])
    .filter((r) => r && typeof r.text === "string" && r.text.trim())
    .map((r) => ({
      channelHandle: r.channel_handle,
      messageId: r.message_id,
      channelTitle: meta.titleOf.get(r.channel_handle) ?? r.channel_handle,
      channelPhotoUrl: meta.photoUrlOf.get(r.channel_handle) ?? null,
      postedAt: r.posted_at,
      views: r.views ?? 0,
      forwards: r.forwards ?? 0,
      text: r.text.trim(),
      stocks: Array.isArray(r.stocks) ? r.stocks : [],
    }));
  return {
    date: b.date,
    brief: b.brief?.trim() ? b.brief : null,
    messageCount: b.message_count ?? 0,
    related: Array.isArray(b.related) ? b.related.filter((x) => x && typeof x.theme === "string" && known(x.theme)) : [],
    excerpts,
  };
}

/** 종목 일별 집계 한 행 — 국장(telegram_stock_daily)·미장(telegram_us_stock_daily)을 같은 꼴로 받는다. */
export type StockDailyLike = { date: string; code: string; mentions: number | null; channels: number | null; weight: number | string | null };

/**
 * '이 테마의 주인공' — 최근 창 언급 합 순. usualMentions 는 **평소 몫으로 본 최근 창의 기대 언급 수**다
 * (lib/stock-usual.ts expectedUsualMentions — 앞날들의 언급 합 ÷ 그날들 테마 대화 총량 × 최근 창 총량). 언급 수 그대로
 * 하루 평균 × 창 길이로 재던 때는 요일을 탔다. `share` 가 없거나 총량을 못 읽었으면 그 옛 식으로 물러선다.
 * 국장·미장이 같은 규칙으로 줄을 세운다(lib/us-theme-page.ts). ⚠️ 파이프라인 짝(data-pipeline/common/theme_hot.py)이 같은 규칙으로
 * 줄을 골라 '요즘 도는 얘기'를 써 둔다 — 차례를 바꾸면 그쪽도 같이 고친다(안 그러면 경계의 줄이 빈다).
 */
export function buildHotStocks(
  rows: StockDailyLike[],
  recentSet: Set<string>,
  usualDayCount: number,
  byCode: Map<string, ThemeMember>,
  /** 요즘 도는 얘기 {코드: 한 줄}(talkOf). */
  talk: Map<string, string>,
  share?: { usualDays: string[]; dayTotals: Map<string, number> | null },
): ThemeHotStock[] {
  const agg = new Map<string, { m: number; c: number; w: number; u: number }>();
  const usualSet = new Set(share?.usualDays ?? []);
  for (const r of rows) {
    const a = agg.get(r.code) ?? { m: 0, c: 0, w: 0, u: 0 };
    if (recentSet.has(r.date)) {
      a.m += r.mentions || 0;
      a.c = Math.max(a.c, r.channels || 0);
      a.w += Number(r.weight) || 0;
    } else if (!share || usualSet.has(r.date)) {
      // 평소 합 — 평소 날(얇은 날 제외)의 행만. 계산에서 뺀 기준일 아침 행까지 더하면 분모(평소 날수)와 어긋나 '새로 등장'이
      // '평소의 10배 넘게'로 찍혔다(2026-10-05 머지 전 점검). 행이 없는 날은 0회라 날수는 그대로 나눈다.
      a.u += r.mentions || 0;
    }
    agg.set(r.code, a);
  }
  return [...agg.entries()]
    // 앞 사흘에만 언급되고 최근 사흘엔 없는 종목은 '말 많은 종목'이 아니다.
    .filter(([code, a]) => byCode.has(code) && a.m > 0)
    .sort((x, y) => y[1].m - x[1].m || y[1].w - x[1].w || x[0].localeCompare(y[0]))
    .map(([code, a]) => {
      return {
        ...byCode.get(code)!,
        mentions: a.m,
        usualMentions: share
          ? expectedUsualMentions({ usualSum: a.u, recentDays: [...recentSet], usualDays: share.usualDays, dayTotals: share.dayTotals })
          : usualDayCount > 0
            ? (a.u / usualDayCount) * recentSet.size
            : 0,
        channels: a.c,
        talk: talk.get(code) ?? null,
      };
    });
}

/**
 * 날짜 → 그날 **테마 대화 총량**(모든 테마의 mention_count 합 — 사전 종목 언급을 테마마다 센 것). '평소 대비'의 분모다
 * (lib/stock-usual.ts). 파이프라인의 테마 급부상(common/theme_risers.py pick_risers)이 같은 값을 행에서 직접 센다.
 *
 * 국장 26테마 × 30일 = 780행 남짓이라 가볍다. 테마가 늘어 1,000행 캡을 넘어도 (date, theme) 순으로 이어 받는다.
 * 못 읽으면 null — buildHotStocks 가 옛 식(하루 평균 × 일수)으로 물러선다. 실패는 fetch 자리에서 적혀(noteLoadFailure)
 * 페이지 끝 assertLoaded 가 사본에 안 담는다.
 */
export async function themeDayTotals(
  table: "telegram_theme_daily" | "telegram_us_theme_daily",
  first: string,
  last: string,
): Promise<Map<string, number> | null> {
  const db = getSupabaseAdmin();
  let failed = false;
  const rows = await fetchAllRows<{ date: string; theme: string; mention_count: number | null }>(
    "theme",
    () => db.from(table).select("date,theme,mention_count").gte("date", first).lte("date", last).order("date"),
    { onError: (e) => { failed = true; console.error(`[themeDayTotals] ${table} 총량을 못 읽었습니다`, e); } },
  );
  if (failed) return null;
  const out = new Map<string, number>();
  for (const r of rows) out.set(r.date, (out.get(r.date) ?? 0) + (r.mention_count ?? 0));
  return out;
}

/**
 * 테마 화면 한 장치. 사전에 없는 테마면 null(404).
 *
 * 조회는 서로 독립이라 한꺼번에 던진다. 하나가 실패해도 나머지 칸은 그린다 — 대신
 * 실패한 칸은 "불러오지 못했습니다"라고 말한다(loadFailed).
 */
export const getThemePage = cache(async (theme: string): Promise<ThemePageData | null> => {
  // 자기 키만 본다 — `in` 이면 "constructor" 가 통과해 아래 themeMembers 가 names.slice 에서 죽는다(lib/theme-href.ts).
  if (!Object.hasOwn(THEMES, theme)) return null;
  const db = getSupabaseAdmin();

  const [members, baseDate] = await Promise.all([themeMembers(theme), kaderaBaseDate()]);
  if (members === null) {
    // 종목 코드를 못 읽으면 아래 조회를 하나도 못 만든다. 빈 화면을 사본에 담지 않게 실패로 표시한다.
    return {
      theme, members: [], quotes: themeQuotes([]), baseDate, recentDays: [], recentShare: null, recentRank: null, shareDelta: null, rankChange: null,
      trend: [], hotStocks: [], reasons: [], events: [], brief: null, loadFailed: true,
    };
  }
  const codes = members.map((m) => m.code);
  const byCode = new Map<string, ThemeMember>(members.map((m) => [m.code, { code: m.code, name: m.name, market: m.market }]));
  const quotes = themeQuotes(members);

  // 기준일을 넣은 30일 — 히어로의 점유율·순위(테마 로테이션)가 기준일을 넣은 사흘이라 막대·말 많은 종목도 그 사흘을 센다.
  // 종목의 '평소' = 최근 사흘을 뺀 나머지 27일. 종목 집계는 이 30일을 다 받는다(테마 55종목 × 30일 ≤ 1,650행, 페이징).
  const { trendDays, recentDays: windowDays } = themeDetailWindow(baseDate, THEME_TREND_DAYS, KADERA_WINDOW_DAYS);
  const first = trendDays[0];
  const last = trendDays[trendDays.length - 1];

  type ThemeDailyRow = { date: string; share_pct: number | string; rank: number | null; mention_count: number | null };
  type StockDailyRow = { id: number; date: string; stock_code: string; mention_count: number | null; channel_count: number | null; weighted_score: number | string | null };
  type ReasonRow = { date: string; stock_code: string; reason: string | null; change_rate: number | string | null; close_price: number | string | null; channel_count: number | null };

  let stockDailyFailed = false;
  const [themeDaily, stockDaily, reasonRows, events, rotation, briefRow, meta, dayTotals] = await Promise.all([
    db.from("telegram_theme_daily").select("date,share_pct,rank,mention_count").eq("theme", theme).gte("date", first).lte("date", last).order("date"),
    codes.length
      ? fetchAllRows<StockDailyRow>(
          "id",
          () => db.from("telegram_stock_daily").select("id,date,stock_code,mention_count,channel_count,weighted_score").in("stock_code", codes).gte("date", first).lte("date", last),
          { onError: (e) => { stockDailyFailed = true; console.error(`[getThemePage] ${theme} 종목 집계를 못 읽었습니다`, e); } },
        )
      : Promise.resolve([] as StockDailyRow[]),
    // 까닭은 종목·날짜당 한 행이고 하루 상한이 40이라, 한 테마 30일치는 몇백 행을 넘지 않는다.
    codes.length
      ? db
          .from("telegram_stock_move_reason")
          .select("date,stock_code,reason,change_rate,close_price,channel_count")
          .in("stock_code", codes)
          .gte("date", first)
          .lte("date", baseDate)
          .not("reason", "is", null)
          .order("date", { ascending: false })
          .limit(400)
      : Promise.resolve({ data: [] as ReasonRow[], error: null }),
    // 종목 55개면 앞으로 몇 달치가 50건 안팎(2026-09-21 반도체 46건). 달력이 5주로 거르니 넉넉히 받는다.
    getEventsForCodes(codes, 200),
    getThemeRotation(100),
    // 기준일분이 아직 없으면 하루까지 거슬러 가장 최근 것을 쓴다(LLM_TEXT_CARRY_DAYS).
    db
      .from("telegram_theme_brief")
      .select("date,brief,related,excerpts,message_count,talk")
      .eq("theme", theme)
      .gte("date", addDaysISO(baseDate, -LLM_TEXT_CARRY_DAYS))
      .lte("date", baseDate)
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    channelMeta(),
    // '평소 대비'의 분모 — 날마다의 테마 대화 총량(모든 테마). 종목 언급을 몫으로 견줘 요일을 지운다.
    themeDayTotals("telegram_theme_daily", first, last),
  ]);

  let loadFailed = false;
  if (themeDaily.error) {
    console.error(`[getThemePage] ${theme} 테마 집계를 못 읽었습니다`, themeDaily.error);
    loadFailed = true;
  }
  if (stockDailyFailed) loadFailed = true; // 로그는 fetchAllRows 의 onError 가 남겼다.
  // 까닭·발췌·요약은 곁다리다. 못 읽으면 그 칸만 비우고 로그에 남긴다.
  if (reasonRows.error) console.error(`[getThemePage] ${theme} 까닭을 못 읽었습니다`, reasonRows.error);
  // 표가 아직 없으면(마이그레이션 080 전) 42P01 로 온다. 그것도 여기 걸리지만 화면은 빈 칸으로 넘어간다.
  if (briefRow.error) console.error(`[getThemePage] ${theme} 요약을 못 읽었습니다`, briefRow.error);

  // ── 까닭 이력 ──
  const reasons: ThemeReasonRow[] = [];
  for (const r of (reasonRows.data ?? []) as ReasonRow[]) {
    const m = byCode.get(r.stock_code);
    if (!m || !r.reason) continue;
    reasons.push({
      ...m,
      date: r.date,
      reason: r.reason,
      changeRate: r.change_rate == null ? null : Number(r.change_rate),
      close: r.close_price == null ? null : Number(r.close_price),
      channelCount: r.channel_count ?? 0,
    });
  }
  await fillTodayRates(reasons);
  const reasonDates = new Set(reasons.map((r) => r.date));

  // ── 추이 ── 언급이 0인 날은 표에 행이 없다. 빈 날을 0으로 메워야 막대 개수가 늘 같다.
  const dailyByDate = new Map(((themeDaily.data ?? []) as ThemeDailyRow[]).map((r) => [r.date, r]));
  const thin = thinDays(dayTotals, trendDays);
  const trend: ThemeTrendPoint[] = trendDays.map((date) => {
    const r = thin.has(date) ? undefined : dailyByDate.get(date);
    return {
      date,
      share: r ? Number(r.share_pct) || 0 : 0,
      rank: r?.rank ?? null,
      mentions: r?.mention_count ?? 0,
      hasReason: reasonDates.has(date),
      thin: thin.has(date),
    };
  });

  // ── 말 많은 종목 ── 최근 사흘 언급 합 순. 머리가 "많이 언급된 순서"라고 말하니 잣대도 언급 수다
  // (테마 로테이션 팝오버는 주목도순인데, 그쪽은 "점유율을 만든 종목"이라 잣대가 다르다). 동률은 주목도.
  // '최근 사흘'도 얇은 날을 뺀 끝에서 고른다 — 히어로 점유율(테마 로테이션 · lib/theme-flow.ts usableDays)과 같은 사흘이어야
  // 한 칸 안의 숫자가 같은 날을 말한다. 평소도 얇은 날은 뺀다.
  const recentDays = trendDays.filter((d) => !thin.has(d)).slice(-windowDays.length);
  const recentSet = new Set(recentDays);
  const usualDays = trendDays.filter((d) => !recentSet.has(d) && !thin.has(d));
  const hotStocks = buildHotStocks(
    stockDaily.map((r) => ({ date: r.date, code: r.stock_code, mentions: r.mention_count, channels: r.channel_count, weight: r.weighted_score })),
    recentSet,
    usualDays.length,
    byCode,
    talkOf((briefRow.data ?? null) as BriefRow | null),
    { usualDays, dayTotals },
  );

  // ── 점유율·순위 ── 테마 로테이션과 같은 값이어야 카드에서 이 화면으로 넘어와도 숫자가 같다.
  let recentShare: number | null = null;
  let recentRank: number | null = null;
  let shareDelta: number | null = null;
  let rankChange: number | null = null;
  if (isLoadFailed(rotation)) {
    loadFailed = true;
  } else {
    const me = rotation.find((r) => r.theme === theme);
    if (me) {
      recentShare = me.sharePct;
      recentRank = me.rank;
      shareDelta = me.shareDelta;
      rankChange = me.rankChange;
    }
  }

  // ── 요약·함께 언급된 테마·발췌 ── 전부 파이프라인이 써 둔 한 행에서 온다.
  const brief = parseBriefRow((briefRow.data ?? null) as BriefRow | null, meta, (t) => t in THEMES);

  return {
    theme,
    members: members.map((m) => ({ code: m.code, name: m.name, market: m.market })),
    quotes,
    baseDate,
    recentDays,
    recentShare,
    recentRank,
    shareDelta,
    rankChange,
    trend,
    hotStocks,
    reasons,
    events,
    brief,
    loadFailed,
  };
});

// ─── 테마 목록(/theme) ────────────────────────────────────────────────────

/** 목록 화면의 흐름 칸 수(거래일이 아니라 집계가 있는 날). 열흘이면 지속·첫 등장·간헐이 갈린다. */
export const THEME_FLOW_DAYS = 10;
/** '상위'의 기준 순위. 26테마 중 5위 안이면 그날 화제였다고 본다. */
export const THEME_FLOW_TOP = 5;

export type ThemeFlowLabel = "streak" | "new" | "intermittent" | "quiet";

export type ThemeOverview = {
  theme: string;
  rank: number;
  sharePct: number;
  shareDelta: number | null;
  rankChange: number | null;
  /** 최근 THEME_FLOW_DAYS 일 각 날의 순위(오래된→최신). 집계가 없는 날은 null. */
  flow: (number | null)[];
  /** 같은 날들의 점유율(%). 집계가 없는 날은 0. 목록의 작은 막대가 그린다. */
  shareFlow: number[];
  /** flow 의 날짜(오래된→최신). 표본이 거의 없는 날은 뺐다(lib/theme-flow.ts usableDays). */
  flowDates: string[];
  /** 하루 앞에서 끝나는 최근 3일 평균 점유율 순위 — '5위 밖으로 밀린 테마'를 표 순위와 같은 잣대로 견준다(prevWindowRanks). */
  prevRank3: number | null;
  /** 최신일부터 거슬러 며칠 연속 상위였나. */
  streak: number;
  /** 열흘 중 상위였던 날 수. */
  topDays: number;
  label: ThemeFlowLabel;
  /** 최근 사흘에 언급된 종목 중 주목도 상위 셋. */
  topStocks: { code: string; name: string; mentions: number }[];
  stockCount: number;
  /** '요즘 무슨 얘기'(telegram_theme_brief)의 첫 문장. 아직 없으면 null. */
  briefLine: string | null;
};

/**
 * 요약의 첫 문장. 목록 한 줄에 실을 만큼만 — "SK하이닉스가 인텔과 … 소식이 화제였습니다."
 * 문장 끝은 '다.' 뒤의 공백으로 가른다. 첫 문장이 너무 짧으면(20자 미만) 둘째까지 잇는다.
 */
export function briefFirstSentence(brief: string | null | undefined): string | null {
  const text = (brief ?? "").trim();
  if (!text) return null;
  const parts = text.split(/(?<=다\.)\s+/);
  let out = parts[0] ?? text;
  if (out.length < 20 && parts[1]) out = `${out} ${parts[1]}`;
  return out;
}

/** 열흘 순위 목록의 지속·첫 등장·간헐 판정. 미장 목록(lib/us-theme-page.ts)도 같은 규칙이다. */
export function flowStats(flow: (number | null)[]): { streak: number; topDays: number; label: ThemeFlowLabel } {
  const isTop = (v: number | null) => v != null && v <= THEME_FLOW_TOP;
  let streak = 0;
  for (let i = flow.length - 1; i >= 0 && isTop(flow[i]); i--) streak += 1;
  const topDays = flow.filter(isTop).length;
  // 지금 상위이고 그 전 열흘엔 없었으면 첫 등장(이틀까지), 지금 상위면 며칠째인지, 지금은 아니지만
  // 열흘 안에 상위였던 날이 있으면 간헐, 열흘 내내 상위 밖이면 조용.
  const label: ThemeFlowLabel = streak > 0 && topDays === streak && streak <= 2 ? "new" : streak > 0 ? "streak" : topDays > 0 ? "intermittent" : "quiet";
  return { streak, topDays, label };
}

/**
 * 테마 목록 히어로 '오늘의 브리핑'의 **최종 업데이트** 시각 — 카더라 히어로와 **같은 값**이다(lastKaderaUpdatedAt).
 *
 * 테마는 같은 실행에서 카더라 바로 뒤에 쓰이고 같은 수집 자료를 읽는다 — 히어로의 숫자(점유율·순위·변화)는 카더라
 * 앞 스텝의 집계이고, 급부상 종목은 카더라 총평 뒤 7분쯤에 들어간다. 그러니 두 화면이 한 실행에 다른 시각을 말할
 * 까닭이 없다. 처음엔 테마 요약 표의 updated_at 을 따로 읽었는데, 요약을 손으로 다시 돌린 날 "오전 3시경 기준"처럼
 * 정기 실행과 다른 시각이 떠서 다른 화면과 어긋났다(2026-09-23 "다른 페이지들 동일하게"). 국장은 국장 총평,
 * 미장은 미장 총평의 시각을 쓴다 — 두 카더라 화면이 쓰는 그대로다.
 */
export function themeUpdatedAt(market: "kr" | "us"): Promise<string | null> {
  return lastKaderaUpdatedAt(getSupabaseAdmin(), market === "us" ? "telegram_us_daily_brief" : "telegram_daily_brief");
}

/**
 * 테마 목록 — 로테이션(점유율·순위·변화)에 **열흘 흐름**을 더한 것.
 *
 * 흐름은 다른 테마 사이트의 '테마 흐름' 표에서 형식을 가져왔다: 칸마다 그날 순위, 라벨은
 * 지속·첫 등장·간헐. 그쪽은 급등 종목 수를 세고 우리는 언급 점유율 순위를 센다.
 *
 * 순위는 집계표의 rank 열이 아니라 여기서 다시 센다 — 그 열은 파이프라인이 그날 계산한
 * 값이라 사전이 바뀐 뒤 재계산된 날과 안 된 날이 섞일 수 있다. 같은 표의 share_pct 로
 * 날마다 줄 세우면 26테마가 언제나 같은 잣대다.
 */
export async function listThemeOverview(): Promise<ThemeOverview[] | null> {
  const db = getSupabaseAdmin();
  const [rotation, baseDate] = await Promise.all([getThemeRotation(100), kaderaBaseDate()]);
  if (isLoadFailed(rotation)) return null;

  // 집계가 있는 날 열흘, **기준일까지**. 화면이 끝 두 칸을 '어제·오늘'로 읽고('새로 상위에 오른 테마' · '어제까지
  // 5위 안'), 옆의 점유율·순위(로테이션)도 기준일을 넣은 사흘이다. 한동안 "아직 하루가 덜 찼다"며 기준일을 빼서 두 칸이
  // 그저께·어제였다 — 오늘 뜬 테마는 오늘 보여야 한다(2026-09-29 결정). 미장 목록(listUsThemeOverview)과 같은 규칙.
  // 21일 × 26테마 = 546행이라 1,000행 캡 안이다.
  const { data, error } = await db
    .from("telegram_theme_daily")
    .select("date,theme,share_pct,mention_count")
    .lte("date", baseDate)
    .gte("date", addDaysISO(baseDate, -THEME_FLOW_DAYS * 2))
    .order("date", { ascending: false });
  if (error) {
    console.error("[listThemeOverview] 테마 집계를 못 읽었습니다", error);
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
    const day = rows.filter((r) => r.date === d && r.theme in THEMES).sort((a, b) => Number(b.share_pct) - Number(a.share_pct));
    rankOn.set(d, new Map(day.map((r, i) => [r.theme, i + 1])));
    shareOn.set(d, new Map(day.map((r) => [r.theme, Number(r.share_pct) || 0])));
  }

  // '요즘 무슨 얘기' 첫 문장 — 테마마다 가장 최근 것 하나. 기준일분이 없으면 하루 거슬러 간다(LLM_TEXT_CARRY_DAYS).
  // 표가 아직 없거나 조회가 실패해도 목록은 그린다(그 줄만 종목 이름으로 대신한다).
  const briefOf = new Map<string, string>();
  const briefs = await db
    .from("telegram_theme_brief")
    .select("theme,date,brief")
    .gte("date", addDaysISO(baseDate, -LLM_TEXT_CARRY_DAYS))
    .lte("date", baseDate)
    .order("date", { ascending: false })
    .limit(200);
  if (briefs.error) console.error("[listThemeOverview] 테마 요약을 못 읽었습니다", briefs.error);
  for (const r of (briefs.data ?? []) as { theme: string; date: string; brief: string | null }[]) {
    if (!briefOf.has(r.theme) && r.brief?.trim()) briefOf.set(r.theme, r.brief);
  }

  const prevRank3 = prevWindowRanks(shareOn, dates, Object.keys(THEMES), KADERA_WINDOW_DAYS);
  return rotation
    .filter((r) => r.theme in THEMES)
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
        topStocks: r.stocks.slice(0, 3).map((s) => ({ code: s.code, name: s.name, mentions: s.mentions })),
        stockCount: r.stockCount,
        briefLine: briefFirstSentence(briefOf.get(r.theme)),
      };
    })
    .sort((a, b) => a.rank - b.rank);
}

// ─── 갑자기 많이 언급된 종목(/theme 카드) ───────────────────────────────
// 문턱 상수·타입·줄 세우기(parseRisers)는 lib/theme-risers.ts 에 있다(순수 함수라 따로 테스트한다).

/**
 * 테마마다 **앞 사흘보다 언급이 가장 많이 는 종목** 하나와 까닭. 종목 지도(테마 화면)가 색으로 보이는 것을
 * 목록에 한 줄로 모은 것이다. 카더라 급부상은 시장 전체 상위 여섯이고 이건 테마마다 하나라 대상이 다르다.
 *
 * **고르는 것도 쓰는 것도 파이프라인이다**(data-pipeline/common/theme_risers.py → generate_theme_briefs.py).
 * 화면은 요약 행(telegram_theme_brief.riser, 마이그레이션 081)에 적힌 것을 읽어 줄만 세운다. 처음엔 여기서
 * 종목 집계를 받아 같은 규칙으로 골랐는데, 그러면 규칙이 TS·Python 두 벌이라 하나만 손봐도 까닭 없는
 * 줄이 나간다(급부상 한 줄 요약이 겪은 사고). 문턱 상수는 문서(noteHelp)에 쓰려고 남겨 뒀고 값은
 * theme_risers.py 와 같아야 한다.
 *
 * 줄 세우기: 새로 등장(앞 사흘 0회)이 맨 앞, 그다음 배수 순. 같은 배수면 언급이 많은 쪽. 최대 RISER_MAX 줄.
 * 후보가 하나도 없는 테마는 줄이 없다 — 변화가 큰 테마가 여덟이면 여덟 줄만 선다.
 * 기준일분이 없으면 하루 거슬러 간다(LLM_TEXT_CARRY_DAYS) — 요약과 같은 규칙.
 */
export async function listThemeRisers(): Promise<{ risers: ThemeRiser[]; asOf: string | null } | null> {
  const db = getSupabaseAdmin();
  const baseDate = await kaderaBaseDate();
  const { data, error } = await db
    .from("telegram_theme_brief")
    .select("theme,date,riser")
    // 그날 줄이 없으면 앞 날로 채운다(risersWithFallback) — 그래서 RISER_FALLBACK_DAYS 만큼 받는다.
    .gte("date", addDaysISO(baseDate, -RISER_FALLBACK_DAYS))
    .lte("date", baseDate)
    // riser 가 빈 행도 받는다 — 오늘 후보가 없다는 행이 있어야 어제 riser 로 거슬러 가지 않는다(parseRisers).
    // 26테마 × 여드레라 300 안이다.
    .order("date", { ascending: false })
    .limit(300);
  if (error) {
    // 표에 riser 열이 아직 없으면(마이그레이션 081 전) 42703. 카드는 비고 나머지는 그린다.
    console.error("[listThemeRisers] 테마 요약의 종목 칸을 못 읽었습니다", error);
    return null;
  }
  return risersWithFallback((data ?? []) as RiserRow[], (t) => t in THEMES, addDaysISO(baseDate, -LLM_TEXT_CARRY_DAYS));
}
