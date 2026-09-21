import "server-only";

import { cache } from "react";

import { getSupabaseAdmin } from "./supabase-server";
import {
  KADERA_WINDOW_DAYS,
  LLM_TEXT_CARRY_DAYS,
  addDaysISO,
  channelMeta,
  getThemeRotation,
  kaderaBaseDate,
  windowBefore,
} from "./telegram-data";
import { THEMES } from "./stock-themes";
import { getEventsForCodes, type UpcomingEvent } from "./kadera-why";
import { isLoadFailed } from "./load-state";

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
export { THEME_NAMES, themeFromParam, themeHref } from "./theme-href";

export type ThemeMember = { code: string; name: string; market: string | null };

export type ThemeTrendPoint = {
  date: string;
  /** 그날 전체 주목도 중 이 테마 비중(%). 집계가 없는 날은 0. */
  share: number;
  /** 그날 점유율 순위. 집계가 없는 날은 null. */
  rank: number | null;
  mentions: number;
  /** 그날 이 테마 종목에 까닭 한 줄이 붙었나 — 추이 위에 점으로 찍는다. */
  hasReason: boolean;
};

export type ThemeHotStock = ThemeMember & {
  /** 최근 사흘 언급 합. */
  mentions: number;
  /** 그 앞 사흘 언급 합. 종목 지도의 색(배수)이 쓴다. */
  priorMentions: number;
  /** 최근 사흘 중 하루 최다 채널 수. **기간 합집합이 아니다**(lib/stock-page.ts 머리말 ②). */
  channels: number;
  /** 최근 사흘 안의 가장 최근 까닭 한 줄. 없으면 null(정상). */
  reason: { date: string; reason: string; changeRate: number | null } | null;
};

export type ThemeReasonRow = ThemeMember & {
  date: string;
  reason: string;
  changeRate: number | null;
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
  baseDate: string;
  /** 최근 사흘(기준일 제외). 카더라와 같은 창이다. */
  recentDays: string[];
  /** 최근 사흘 평균 점유율(%)과 순위. 테마 로테이션 카드와 같은 계산이다. */
  recentShare: number | null;
  recentRank: number | null;
  shareDelta: number | null;
  rankChange: number | null;
  trend: ThemeTrendPoint[];
  hotStocks: ThemeHotStock[];
  reasons: ThemeReasonRow[];
  events: UpcomingEvent[];
  brief: ThemeBrief | null;
  /** 집계(추이·말 많은 종목)를 못 읽었나. 실패를 '언급 없음'으로 위장하지 않으려는 표시. */
  loadFailed: boolean;
};

/** 테마의 종목 사전을 stocks 표의 코드로 옮긴다. 사전에 있어도 stocks 에 없는 이름은 빠진다(파이프라인도 같다). */
async function themeMembers(theme: string): Promise<ThemeMember[] | null> {
  const names = THEMES[theme] ?? [];
  if (!names.length) return [];
  const db = getSupabaseAdmin();
  // 테마 하나는 최대 55종목이라 한 번에 물어도 URL 이 짧다. 그래도 80씩 끊는다 —
  // 사전이 더 커져도 안 깨지게(telegram-data.ts themeStocks 의 같은 규칙).
  const out = new Map<string, ThemeMember>();
  for (let i = 0; i < names.length; i += 80) {
    const { data, error } = await db.from("stocks").select("code,name,market").in("name", names.slice(i, i + 80));
    if (error) {
      console.error(`[themeMembers] ${theme} 종목 코드를 못 읽었습니다`, error);
      return null;
    }
    for (const r of data ?? []) out.set(r.name as string, { code: r.code as string, name: r.name as string, market: (r.market as string) ?? null });
  }
  // 사전 순서를 지킨다 — 앞쪽이 대표 종목이다(lib/stock-themes.ts 머리말).
  return names.map((n) => out.get(n)).filter((m): m is ThemeMember => Boolean(m));
}

/**
 * 테마 화면 한 장치. 사전에 없는 테마면 null(404).
 *
 * 조회는 서로 독립이라 한꺼번에 던진다. 하나가 실패해도 나머지 칸은 그린다 — 대신
 * 실패한 칸은 "불러오지 못했습니다"라고 말한다(loadFailed).
 */
export const getThemePage = cache(async (theme: string): Promise<ThemePageData | null> => {
  if (!(theme in THEMES)) return null;
  const db = getSupabaseAdmin();

  const [members, baseDate] = await Promise.all([themeMembers(theme), kaderaBaseDate()]);
  if (members === null) {
    // 종목 코드를 못 읽으면 아래 조회를 하나도 못 만든다. 빈 화면을 사본에 담지 않게 실패로 표시한다.
    return {
      theme, members: [], baseDate, recentDays: [], recentShare: null, recentRank: null, shareDelta: null, rankChange: null,
      trend: [], hotStocks: [], reasons: [], events: [], brief: null, loadFailed: true,
    };
  }
  const codes = members.map((m) => m.code);
  const byCode = new Map(members.map((m) => [m.code, m]));

  const trendDays = windowBefore(baseDate, THEME_TREND_DAYS);
  const recentDays = trendDays.slice(-KADERA_WINDOW_DAYS);
  // 종목 지도의 색이 견줄 '앞 사흘'. 테마 점유율의 변화(닷새 넘게 이전)와 창이 다르다 — 종목은 하루 언급이
  // 몇 회뿐인 것이 많아 닷새 뒤 평균과 견주면 배수가 요동친다. 바로 앞 사흘이면 "그제까지보다 늘었나"로 읽힌다.
  const priorDays = trendDays.slice(-KADERA_WINDOW_DAYS * 2, -KADERA_WINDOW_DAYS);
  const first = trendDays[0];
  const last = trendDays[trendDays.length - 1];

  type ThemeDailyRow = { date: string; share_pct: number | string; rank: number | null; mention_count: number | null };
  type StockDailyRow = { date: string; stock_code: string; mention_count: number | null; channel_count: number | null; weighted_score: number | string | null };
  type ReasonRow = { date: string; stock_code: string; reason: string | null; change_rate: number | string | null; channel_count: number | null };
  type BriefExcerptRow = { channel_handle: string; message_id: number; posted_at: string; views?: number | null; forwards?: number | null; text: string; stocks?: string[] | null };
  type BriefRow = { date: string; brief: string | null; related: ThemeRelated[] | null; excerpts: BriefExcerptRow[] | null; message_count: number | null };

  const [themeDaily, stockDaily, reasonRows, events, rotation, briefRow, meta] = await Promise.all([
    db.from("telegram_theme_daily").select("date,share_pct,rank,mention_count").eq("theme", theme).gte("date", first).lte("date", last).order("date"),
    codes.length
      ? db.from("telegram_stock_daily").select("date,stock_code,mention_count,channel_count,weighted_score").in("stock_code", codes).in("date", [...priorDays, ...recentDays])
      : Promise.resolve({ data: [] as StockDailyRow[], error: null }),
    // 까닭은 종목·날짜당 한 행이고 하루 상한이 40이라, 한 테마 30일치는 몇백 행을 넘지 않는다.
    codes.length
      ? db
          .from("telegram_stock_move_reason")
          .select("date,stock_code,reason,change_rate,channel_count")
          .in("stock_code", codes)
          .gte("date", first)
          .lte("date", baseDate)
          .not("reason", "is", null)
          .order("date", { ascending: false })
          .limit(400)
      : Promise.resolve({ data: [] as ReasonRow[], error: null }),
    getEventsForCodes(codes, 12),
    getThemeRotation(100),
    // 기준일분이 아직 없으면 하루까지 거슬러 가장 최근 것을 쓴다(LLM_TEXT_CARRY_DAYS).
    db
      .from("telegram_theme_brief")
      .select("date,brief,related,excerpts,message_count")
      .eq("theme", theme)
      .gte("date", addDaysISO(baseDate, -LLM_TEXT_CARRY_DAYS))
      .lte("date", baseDate)
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    channelMeta(),
  ]);

  let loadFailed = false;
  if (themeDaily.error) {
    console.error(`[getThemePage] ${theme} 테마 집계를 못 읽었습니다`, themeDaily.error);
    loadFailed = true;
  }
  if (stockDaily.error) {
    console.error(`[getThemePage] ${theme} 종목 집계를 못 읽었습니다`, stockDaily.error);
    loadFailed = true;
  }
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
      channelCount: r.channel_count ?? 0,
    });
  }
  const reasonDates = new Set(reasons.map((r) => r.date));

  // ── 추이 ── 언급이 0인 날은 표에 행이 없다. 빈 날을 0으로 메워야 막대 개수가 늘 같다.
  const dailyByDate = new Map(((themeDaily.data ?? []) as ThemeDailyRow[]).map((r) => [r.date, r]));
  const trend: ThemeTrendPoint[] = trendDays.map((date) => {
    const r = dailyByDate.get(date);
    return {
      date,
      share: r ? Number(r.share_pct) || 0 : 0,
      rank: r?.rank ?? null,
      mentions: r?.mention_count ?? 0,
      hasReason: reasonDates.has(date),
    };
  });

  // ── 말 많은 종목 ── 최근 사흘 언급 합 순. 머리가 "많이 언급된 순서"라고 말하니 잣대도 언급 수다
  // (테마 로테이션 팝오버는 주목도순인데, 그쪽은 "점유율을 만든 종목"이라 잣대가 다르다). 동률은 주목도.
  const recentSet = new Set(recentDays);
  const agg = new Map<string, { m: number; c: number; w: number; p: number }>();
  for (const r of (stockDaily.data ?? []) as StockDailyRow[]) {
    const a = agg.get(r.stock_code) ?? { m: 0, c: 0, w: 0, p: 0 };
    if (recentSet.has(r.date)) {
      a.m += r.mention_count || 0;
      a.c = Math.max(a.c, r.channel_count || 0);
      a.w += Number(r.weighted_score) || 0;
    } else {
      a.p += r.mention_count || 0; // 앞 사흘
    }
    agg.set(r.stock_code, a);
  }
  const latestReasonOf = new Map<string, ThemeReasonRow>();
  for (const r of reasons) {
    // 최근 사흘 안의 것만, 종목마다 가장 최근 하나(목록이 최신순이라 처음 만난 것이 그것이다).
    if (recentSet.has(r.date) && !latestReasonOf.has(r.code)) latestReasonOf.set(r.code, r);
  }
  const hotStocks: ThemeHotStock[] = [...agg.entries()]
    // 앞 사흘에만 언급되고 최근 사흘엔 없는 종목은 '말 많은 종목'이 아니다.
    .filter(([code, a]) => byCode.has(code) && a.m > 0)
    .sort((x, y) => y[1].m - x[1].m || y[1].w - x[1].w || x[0].localeCompare(y[0]))
    .map(([code, a]) => {
      const why = latestReasonOf.get(code);
      return {
        ...byCode.get(code)!,
        mentions: a.m,
        priorMentions: a.p,
        channels: a.c,
        reason: why ? { date: why.date, reason: why.reason, changeRate: why.changeRate } : null,
      };
    });

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
  const b = (briefRow.data ?? null) as BriefRow | null;
  const excerpts: ThemeExcerpt[] = (Array.isArray(b?.excerpts) ? b.excerpts : [])
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
  const brief: ThemeBrief | null = b
    ? {
        date: b.date,
        brief: b.brief?.trim() ? b.brief : null,
        messageCount: b.message_count ?? 0,
        related: Array.isArray(b.related) ? b.related.filter((x) => x && typeof x.theme === "string" && x.theme in THEMES) : [],
        excerpts,
      }
    : null;

  return {
    theme,
    members,
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
  /** flow 의 날짜(오래된→최신). */
  flowDates: string[];
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

  // 집계가 있는 날 열흘. 기준일은 뺀다(아직 하루가 덜 찼다).
  const { data, error } = await db
    .from("telegram_theme_daily")
    .select("date,theme,share_pct")
    .lt("date", baseDate)
    .gte("date", addDaysISO(baseDate, -THEME_FLOW_DAYS * 2))
    .order("date", { ascending: false });
  if (error) {
    console.error("[listThemeOverview] 테마 집계를 못 읽었습니다", error);
    return null;
  }
  const rows = (data ?? []) as { date: string; theme: string; share_pct: number | string }[];
  const dates = [...new Set(rows.map((r) => r.date))].sort().slice(-THEME_FLOW_DAYS);
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

  return rotation
    .filter((r) => r.theme in THEMES)
    .map((r) => {
      const flow = dates.map((d) => rankOn.get(d)?.get(r.theme) ?? null);
      const shareFlow = dates.map((d) => shareOn.get(d)?.get(r.theme) ?? 0);
      const isTop = (v: number | null) => v != null && v <= THEME_FLOW_TOP;
      let streak = 0;
      for (let i = flow.length - 1; i >= 0 && isTop(flow[i]); i--) streak += 1;
      const topDays = flow.filter(isTop).length;
      // 지금 상위이고 그 전 열흘엔 없었으면 첫 등장(이틀까지), 지금 상위면 며칠째인지, 지금은 아니지만
      // 열흘 안에 상위였던 날이 있으면 간헐, 열흘 내내 상위 밖이면 조용.
      const label: ThemeFlowLabel =
        streak > 0 && topDays === streak && streak <= 2 ? "new" : streak > 0 ? "streak" : topDays > 0 ? "intermittent" : "quiet";
      return {
        theme: r.theme,
        rank: r.rank,
        sharePct: r.sharePct,
        shareDelta: r.shareDelta,
        rankChange: r.rankChange,
        flow,
        shareFlow,
        flowDates: dates,
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

/** 후보가 되려면 최근 사흘에 이만큼은 언급돼야 한다. 두세 번 스친 작은 종목이 "10배"로 오르는 걸 막는다. */
export const RISER_MIN_MENTIONS = 5;
/** '말이 늘었다'고 칠 최소 배수. 종목 지도의 첫 색 단(1.5배)과 같다. 그 아래는 늘었다기보다 요동이다. */
export const RISER_MIN_RATIO = 1.5;
/** 카드에 세우는 최대 줄 수. 후보가 적으면 적은 대로 보인다 — '더 보기'는 두지 않는다(2026-09-21). */
export const RISER_MAX = 10;

export type ThemeRiser = {
  theme: string;
  code: string;
  name: string;
  market: string | null;
  /** 최근 사흘 언급. */
  recent: number;
  /** 그 앞 사흘 언급. 0 이면 새로 등장. */
  prior: number;
  /** recent / prior. prior 가 0 이면 null(새로 등장). */
  ratio: number | null;
  /** 채널이 말한 까닭(LLM, 50~90자). 파이프라인이 못 썼으면 null. */
  reason: string | null;
};

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
export async function listThemeRisers(): Promise<ThemeRiser[] | null> {
  const db = getSupabaseAdmin();
  const baseDate = await kaderaBaseDate();
  const { data, error } = await db
    .from("telegram_theme_brief")
    .select("theme,date,riser")
    .gte("date", addDaysISO(baseDate, -LLM_TEXT_CARRY_DAYS))
    .lte("date", baseDate)
    .not("riser", "is", null)
    .order("date", { ascending: false })
    .limit(200);
  if (error) {
    // 표에 riser 열이 아직 없으면(마이그레이션 081 전) 42703. 카드는 비고 나머지는 그린다.
    console.error("[listThemeRisers] 테마 요약의 종목 칸을 못 읽었습니다", error);
    return null;
  }
  type Stored = { code: string; name: string; market: string | null; recent: number; prior: number; ratio: number | null; reason: string | null };
  const seen = new Set<string>();
  const out: ThemeRiser[] = [];
  for (const r of (data ?? []) as { theme: string; date: string; riser: Stored | null }[]) {
    if (!(r.theme in THEMES) || seen.has(r.theme) || !r.riser?.code) continue;
    seen.add(r.theme);
    const s = r.riser;
    out.push({
      theme: r.theme,
      code: s.code,
      name: s.name,
      market: s.market ?? null,
      recent: Number(s.recent) || 0,
      prior: Number(s.prior) || 0,
      ratio: s.ratio == null ? null : Number(s.ratio),
      reason: s.reason?.trim() || null,
    });
  }
  const better = (a: ThemeRiser, b: ThemeRiser) => {
    // 새로 등장 > 배수 > 언급 수.
    if ((a.ratio === null) !== (b.ratio === null)) return a.ratio === null;
    if (a.ratio !== null && b.ratio !== null && a.ratio !== b.ratio) return a.ratio > b.ratio;
    return a.recent > b.recent;
  };
  return out.sort((a, b) => (better(a, b) ? -1 : better(b, a) ? 1 : 0)).slice(0, RISER_MAX);
}
