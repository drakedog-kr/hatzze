import "server-only";

import { cache } from "react";

import { getDevOverrides } from "./dev-overrides";
import { getSupabaseServer } from "./supabase-server";
import { fetchDailyBarsBeforeKstDate, yahooSymbol } from "./yahoo-history";
import { quoteChangeRate } from "./krx-gap";
import { liveUsIsNoteSession, shiftDate, takeLiveKr, usCloseBefore } from "./note-quote-day";
import { changeRateOf, dateInZone, fetchYahooQuote } from "./yahoo-quote";

/**
 * 데일리 노트(/daily)가 읽는 것 — 표 `daily_note`(마이그레이션 067·068).
 *
 * ## 글은 사람이 올린다
 *
 * 파이프라인이 만드는 값이 아니다. 매일 저녁 세션에서 쓴 원고를
 * `data-pipeline/scripts/publish_daily_note.py` 로 올리면 여기서 읽어 그린다. 그래서 이
 * 파일에는 계산이 없다 — 최신 한 편, 날짜로 한 편, 지난 글 목록, 앞뒤 글, 언급된 종목의
 * 시세, 다섯을 읽을 뿐이다.
 *
 * ## ⚠️ 조회 실패와 '글이 없다' 를 가른다
 *
 * 표가 아직 없거나(마이그레이션 전) 연결이 끊긴 것을 "아직 올라온 글이 없습니다" 로
 * 보이면 고장이 정상처럼 위장된다(같은 함정을 다른 화면에서 겪었다 — 조회 실패가 조용히
 * '데이터 없음' 이 되는 자리). 그래서 결과에 `failed` 를 따로 실어 화면이 다른 문장을 낸다.
 *
 * ## 로컬 미리보기 — dev-overrides.json 의 `dailyNotes`
 *
 * 화면을 연 뒤에는 원고를 표에 올리는 순간 공개된다. 올리기 **전에** 조판을 보려면 DB 가
 * 아닌 곳에서 읽어야 해서, 지표 설명·히어로 요약이 쓰는 그 오버레이에 글도 얹는다.
 * 목록이 비어 있지 않으면 글 조회는 전부 그 목록을 읽는다(운영 빌드에서는 no-op).
 * 종목 시세는 오버레이에서도 `stocks` 표를 읽는다 — 시세를 손으로 적어 넣을 이유가 없다.
 */

/** 글에 이름이 나온 종목(068). 올리는 스크립트가 본문에 처음 나온 차례로 넣는다. */
export type NoteStockRefs = { kr: string[]; us: string[] };

export type DailyNote = {
  /** YYYY-MM-DD (KST). 원고 둘째 줄의 날짜다. */
  date: string;
  title: string;
  /** 제목·날짜 줄을 뗀 본문 마크다운. lib/daily-note-md.ts 가 푼다. */
  bodyMd: string;
  shortMd: string | null;
  /**
   * 처음 올린 시각(ISO). 같은 날 다시 올려도 안 바뀐다(표의 기본값 now() 가 insert 때만 든다).
   * 글의 발행 시각이라 공유 메타(article:published_time)와 Article 구조화 데이터가 쓴다.
   */
  createdAt: string;
  /** 마지막으로 올린 시각(ISO). 고친 원고를 다시 올리면 바뀐다. */
  updatedAt: string;
  stocks: NoteStockRefs;
};

export type NoteStub = { date: string; title: string };

type Row = {
  date: string;
  title: string;
  body_md: string;
  short_md: string | null;
  /** 067 부터 있는 열이다. 없으면 updated_at 으로 물러선다. */
  created_at?: string;
  updated_at: string;
  /** 068 전 줄은 없거나 `{}` 다. 열 자체가 없으면 select("*") 가 그냥 안 준다. */
  stocks?: unknown;
};

const TABLE = "daily_note";

/**
 * 지난 노트 목록이 넘겨 볼 수 있는 편수. 화면엔 한 주(7편)씩 보이고(NoteArchiveList) 이
 * 수까지 넘길 수 있다. 제목·날짜만이라 365편이어도 20KB 남짓이다. 그 뒤로는 목록에서
 * 빠진다 — 사이트맵(listAllNoteDates)은 따로 전부 읽으니 검색엔 잡힌다.
 */
export const NOTE_ARCHIVE_LIMIT = 365;

export const noteHref = (date: string) => `/daily/${date}`;

/** 주소의 날짜 조각이 실제 날짜인가. `2026-02-30` 처럼 모양만 날짜인 것도 거른다. */
export function isNoteDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

const WEEKDAYS = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
const WEEKDAYS_SHORT = ["일", "월", "화", "수", "목", "금", "토"];

function weekdayOf(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** 원고 둘째 줄과 같은 꼴. "2026년 9월 5일 토요일" */
export function fmtNoteDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${y}년 ${m}월 ${d}일 ${WEEKDAYS[weekdayOf(iso)]}`;
}

/** 목록용. "9월 5일(토)" — 해는 목록 머리가 한 번만 말한다. 요일은 붙인다(업데이트 시각 · MDD 와 같은 꼴). */
export function fmtNoteDateShort(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${m}월 ${d}일(${WEEKDAYS_SHORT[weekdayOf(iso)]})`;
}

/** "9월 3일" — 시세 기준일 같은 짧은 자리. */
export function fmtNoteDay(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${m}월 ${d}일`;
}

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0) : [];

function toRefs(v: unknown): NoteStockRefs {
  const o = v && typeof v === "object" ? (v as { kr?: unknown; us?: unknown }) : {};
  return { kr: strings(o.kr), us: strings(o.us) };
}

function toNote(r: Row): DailyNote {
  return {
    date: r.date,
    title: r.title,
    bodyMd: r.body_md,
    shortMd: r.short_md,
    createdAt: r.created_at ?? r.updated_at,
    updatedAt: r.updated_at,
    stocks: toRefs(r.stocks),
  };
}

/** 로컬 오버레이의 글. 최신이 앞. 없으면 null — 그때는 DB 를 읽는다. */
function devNotes(): DailyNote[] | null {
  const list = getDevOverrides().dailyNotes;
  if (!list?.length) return null;
  return list
    .filter((n) => isNoteDate(n.date) && n.title && n.body_md)
    .map((n) => ({
      date: n.date,
      title: n.title,
      bodyMd: n.body_md,
      shortMd: n.short_md ?? null,
      createdAt: n.updated_at ?? `${n.date}T11:00:00.000Z`,
      updatedAt: n.updated_at ?? `${n.date}T11:00:00.000Z`,
      stocks: toRefs(n.stocks),
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export type NoteResult = { note: DailyNote | null; failed: boolean };

/** 가장 최근 글 한 편. `/daily` 가 이걸 보인다. */
export const getLatestNote = cache(async (): Promise<NoteResult> => {
  const dev = devNotes();
  if (dev) return { note: dev[0], failed: false };
  try {
    const { data, error } = await getSupabaseServer()
      .from(TABLE)
      .select("*")
      .order("date", { ascending: false })
      .limit(1);
    if (error) throw error;
    const row = (data as Row[] | null)?.[0];
    return { note: row ? toNote(row) : null, failed: false };
  } catch (e) {
    console.error("[daily-note] 최신 글을 읽지 못했습니다:", e);
    return { note: null, failed: true };
  }
});

/** 날짜로 한 편. 날짜 모양이 아니면 조회 없이 없는 것으로 친다. */
export const getNote = cache(async (date: string): Promise<NoteResult> => {
  if (!isNoteDate(date)) return { note: null, failed: false };
  const dev = devNotes();
  if (dev) return { note: dev.find((n) => n.date === date) ?? null, failed: false };
  try {
    const { data, error } = await getSupabaseServer().from(TABLE).select("*").eq("date", date).maybeSingle();
    if (error) throw error;
    return { note: data ? toNote(data as Row) : null, failed: false };
  } catch (e) {
    console.error(`[daily-note] ${date} 글을 읽지 못했습니다:`, e);
    return { note: null, failed: true };
  }
});

export type NoteListResult = { notes: NoteStub[]; failed: boolean };

/** 지난 글 목록, 최신이 앞. 본문은 안 읽는다 — 목록은 제목·날짜만 그린다. */
export const listNotes = cache(async (limit: number = NOTE_ARCHIVE_LIMIT): Promise<NoteListResult> => {
  const dev = devNotes();
  if (dev) return { notes: dev.slice(0, limit).map(({ date, title }) => ({ date, title })), failed: false };
  try {
    const { data, error } = await getSupabaseServer()
      .from(TABLE)
      .select("date,title")
      .order("date", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return { notes: (data as NoteStub[] | null) ?? [], failed: false };
  } catch (e) {
    console.error("[daily-note] 목록을 읽지 못했습니다:", e);
    return { notes: [], failed: true };
  }
});

/** 피드(RSS) 한 줄. 본문은 요약을 뽑으려고 받는다. */
export type FeedNote = { date: string; title: string; bodyMd: string; createdAt: string; updatedAt: string };

/** 피드에 싣는 편수. 구독기는 새 글만 가져가고, 검색엔진은 사이트맵으로 전부를 본다 — 한 달이면 넉넉하다. */
export const FEED_LIMIT = 30;

/**
 * RSS 피드용 최근 글(app/daily/rss.xml). 최신이 앞. 못 읽으면 null — 빈 목록과 가른다(빈 피드는 "글이 없다"는
 * 뜻이 분명한 답이라, 조회 실패를 그걸로 위장하면 구독기가 글이 사라졌다고 읽는다).
 *
 * 발행 시각은 처음 올린 시각(created_at · 같은 날 다시 올려도 안 바뀐다)이다.
 */
export async function listFeedNotes(limit: number = FEED_LIMIT): Promise<FeedNote[] | null> {
  const dev = devNotes();
  if (dev) {
    return dev.slice(0, limit).map((n) => ({ date: n.date, title: n.title, bodyMd: n.bodyMd, createdAt: n.updatedAt, updatedAt: n.updatedAt }));
  }
  try {
    const { data, error } = await getSupabaseServer()
      .from(TABLE)
      .select("date,title,body_md,created_at,updated_at")
      .order("date", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return ((data as { date: string; title: string; body_md: string; created_at: string | null; updated_at: string }[] | null) ?? []).map(
      (r) => ({ date: r.date, title: r.title, bodyMd: r.body_md, createdAt: r.created_at ?? r.updated_at, updatedAt: r.updated_at }),
    );
  } catch (e) {
    console.error("[daily-note] 피드 목록을 읽지 못했습니다:", e);
    return null;
  }
}

export type NoteNeighbors = { prev: NoteStub | null; next: NoteStub | null };

/**
 * 앞뒤 글. prev 는 이 날짜보다 **앞선 날 가운데 가장 최근**, next 는 **뒤의 날 가운데 가장
 * 이른** 글이다. 날마다 글이 있다는 가정을 안 한다 — 일요일은 주간 정리 하나이고, 빠진
 * 날도 생긴다.
 */
export async function noteNeighbors(date: string): Promise<NoteNeighbors> {
  const dev = devNotes();
  if (dev) {
    const older = dev.filter((n) => n.date < date);
    const newer = dev.filter((n) => n.date > date);
    const stub = (n: DailyNote | undefined) => (n ? { date: n.date, title: n.title } : null);
    return { prev: stub(older[0]), next: stub(newer[newer.length - 1]) };
  }
  try {
    const db = getSupabaseServer();
    const [prev, next] = await Promise.all([
      db.from(TABLE).select("date,title").lt("date", date).order("date", { ascending: false }).limit(1),
      db.from(TABLE).select("date,title").gt("date", date).order("date", { ascending: true }).limit(1),
    ]);
    if (prev.error) throw prev.error;
    if (next.error) throw next.error;
    return {
      prev: (prev.data as NoteStub[] | null)?.[0] ?? null,
      next: (next.data as NoteStub[] | null)?.[0] ?? null,
    };
  } catch (e) {
    console.error(`[daily-note] ${date} 앞뒤 글을 읽지 못했습니다:`, e);
    return { prev: null, next: null };
  }
}

export type KrStockQuote = {
  code: string;
  name: string;
  market: string | null;
  /**
   * 종가(원) — 글 날짜 이하 마지막 거래일의 KRX 종가(`stock_price_daily`). 오늘 · 어제 글이고 KRX 가 아직 그 거래일 값을
   * 안 줬으면 야후 실시간(카더라 카드와 같은 소스). 지난 글은 그날 값에 고정된다(lib/note-quote-day.ts).
   */
  price: number | null;
  changeRate: number | null;
  priceDate: string | null;
};
export type UsStockQuote = {
  ticker: string;
  name: string;
  /** 글 날짜(KST) 전날 이하 마지막 뉴욕장의 종가(달러)와 등락률 · 그 세션 날짜(뉴욕). 못 받으면 null — 줄은 이름만 선다. */
  price: number | null;
  changeRate: number | null;
  priceDate: string | null;
};
export type NoteStocks = { kr: KrStockQuote[]; us: UsStockQuote[] };

export const EMPTY_STOCKS: NoteStocks = { kr: [], us: [] };

/** 벽시계 기준 오늘(KST). 글 날짜(YYYY-MM-DD)와 견주는 데만 쓴다. */
function todayKst(now: Date): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * 야후 실시간 — 카더라 카드(lib/telegram-data stockQuote)와 같은 심볼 규칙. 캐시는 10분으로
 * 따로 둔다(카더라는 30분): 이 값이 /daily 와 오늘 · 어제 노트 사본의 주기가 되는데(가장 짧은 fetch 가
 * 라우트 주기 — lib/supabase-server.ts) 노트 페이지는 100KB 안팎이라 10분마다 다시 그려도 값이
 * 미미하고, 오늘 글의 종목 카드는 당일가라 짧을수록 낫다.
 * 등락률을 못 내면 null 을 줘 호출부가 KRX 저장값을 그대로 쓰게 한다.
 */
async function liveQuote(code: string, market: string | null): Promise<{ price: number; changeRate: number; date: string | null } | null> {
  const symbol = `${code}.${market === "KOSDAQ" ? "KQ" : "KS"}`;
  const q = await fetchYahooQuote(symbol, { next: { revalidate: 600 } });
  if (!q) return null;
  const changeRate = await quoteChangeRate(q, symbol); // 빈 전 거래일 봉은 KRX 종가로(lib/krx-gap.ts)
  // 시세의 거래일 — 평일 휴장일(대체공휴일 · 한글날)엔 야후가 직전 거래일 값을 준다. 글 날짜로 적으면 화면의 'n월 n일 종가'
  // 머리가 안 붙어 10/2 등락이 그날 등락처럼 섰다(2026-10-05 머지 전 점검).
  return changeRate === null ? null : { price: q.price, changeRate, date: q.marketTime != null ? dateInZone(q.marketTime, "Asia/Seoul") : null };
}

/**
 * 미국 종목 시세 — 글 날짜(KST) 전날 이하 마지막 뉴욕장의 종가와 등락률(lib/note-quote-day.ts). 미국 종가는 매일 받아 두는 표가
 * 없어 야후를 본다(카더라 · 테마 화면의 usQuotes 와 같은 원천).
 *   - 오늘 글: 현재가의 세션이 글 날짜보다 앞이면(한국 낮 · 저녁, 뉴욕장이 열리기 전) 그게 그 장이다. 일봉 맨 끝 봉은 비어 올 때가
 *     있어(lib/yahoo-history appendLastSession) 현재가를 먼저 본다.
 *   - 그 밖: 글 날짜로 끊은 일봉(fetchDailyBarsBeforeKstDate)에서 고른다. 주소가 글마다 고정이라 지난 글은 하루 캐시를 탄다 —
 *     크롤러가 지난 글을 훑어도 (글, 티커)마다 하루 한 번이다. 오늘 · 어제 글은 봉이 아직 정리 중일 수 있어 10분.
 */
async function usQuoteOn(ticker: string, noteDate: string, today: string): Promise<{ price: number; changeRate: number | null; date: string } | null> {
  const symbol = yahooSymbol(ticker, "US");
  if (noteDate === today) {
    const q = await fetchYahooQuote(symbol, { next: { revalidate: 600 } });
    const session = q?.marketTime != null ? dateInZone(q.marketTime, "America/New_York") : null;
    const changeRate = q ? changeRateOf(q) : null;
    if (q && liveUsIsNoteSession(session, noteDate) && changeRate != null) return { price: q.price, changeRate, date: session ?? noteDate };
  }
  const bars = await fetchDailyBarsBeforeKstDate(symbol, noteDate, 15, noteDate >= shiftDate(today, -1) ? 600 : 86400);
  return bars ? usCloseBefore(bars, noteDate) : null;
}

/**
 * 언급된 종목의 이름과 **글 날짜의** 시세. 글마다 그 글을 올린 날의 최신 시세가 남는다 — 지난 글을 나중에 열어도 그날 값이다
 * (2026-10-17 운영자 "데일리노트는 항상 발행하는 날의 최신 시세를 넣어야 해", 규칙은 lib/note-quote-day.ts).
 *   - 국내: `stock_price_daily`(KRX 일별 종가) 에서 글 날짜 이하 마지막 거래일. 이름 · 시장은 `stocks`.
 *   - 미국: `us_stocks` 의 한글 이름과 글 날짜 전날 이하 마지막 뉴욕장(usQuoteOn).
 * 예전엔 국내가 `stocks` 표의 가장 최근 값이라 지난 글이 날마다 바뀌었고, 토요일 글은 야후를 안 불러(평일 조건) 발행 시각에
 * 표에 있던 목요일 값이 날짜 없이 섰다(10월 17일 글 SK하이닉스 −11.06%, 실제 금요일 +0.79%).
 *
 * ## 오늘 · 어제 글만 국내 야후를 본다
 *
 * KRX Open API 는 그날 종가를 다음 날 아침에야 준다(이력 표는 08시 뒤 배당 잡이 채운다). 그래서 저녁에 올린 글이나 그 이튿날
 * 새벽에 연 어제 글은 이력 표에 그 거래일이 아직 없다. 그때만 야후 실시간을 보고, 야후 세션이 글 날짜 이하이면서 저장값보다
 * 새 거래일일 때만 바꾼다(takeLiveKr) — 다음 날 장이 열린 뒤의 어제 글엔 오늘 시세가 앉지 않는다.
 *
 * ⛔ 그보다 지난 글은 국내 야후를 부르지 않는다(종목 실주소 화면 머리말의 같은 규칙). 크롤러가 지난 글을 훑으면 편마다 바깥
 *    요청이 붙는다. 오늘 · 어제 글 × 언급 종목 수가 상한이고, 야후 응답은 카더라와 같은 600초 캐시를 탄다.
 *
 * 순서는 글에 나온 차례(refs)를 그대로 지킨다. 못 읽으면 빈 목록 — 카드 하나가 빠질 뿐
 * 글은 그대로 보여야 한다.
 */
export async function getNoteStocks(refs: NoteStockRefs, noteDate: string): Promise<NoteStocks> {
  if (!refs.kr.length && !refs.us.length) return EMPTY_STOCKS;
  try {
    const db = getSupabaseServer();
    const [kr, us, days] = await Promise.all([
      refs.kr.length
        ? db.from("stocks").select("code,name,market,close_price,change_rate,price_date").in("code", refs.kr)
        : Promise.resolve({ data: [], error: null }),
      refs.us.length ? db.from("us_stocks").select("ticker,name_ko").in("ticker", refs.us) : Promise.resolve({ data: [], error: null }),
      // 글 날짜 이하 두 주 — 긴 연휴(추석)에도 마지막 거래일이 들어온다. 종목 수 × 거래일 10개 안팎이라 1,000행 상한에 안 닿는다.
      refs.kr.length
        ? db
            .from("stock_price_daily")
            .select("code,date,close,change_rate")
            .in("code", refs.kr)
            .gte("date", shiftDate(noteDate, -14))
            .lte("date", noteDate)
            .order("date", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (kr.error) throw kr.error;
    if (us.error) throw us.error;
    if (days.error) throw days.error;
    type KrRow = { code: string; name: string; market: string | null; close_price: number | null; change_rate: number | null; price_date: string | null };
    type UsRow = { ticker: string; name_ko: string | null };
    type DayRow = { code: string; date: string; close: number; change_rate: number | null };
    const krBy = new Map(((kr.data as KrRow[] | null) ?? []).map((r) => [r.code, r]));
    const usBy = new Map(((us.data as UsRow[] | null) ?? []).map((r) => [r.ticker, r]));
    // 날짜 내림차순이라 종목마다 처음 만나는 줄이 글 날짜 이하 마지막 거래일이다.
    const dayBy = new Map<string, DayRow>();
    for (const d of (days.data as DayRow[] | null) ?? []) if (!dayBy.has(d.code)) dayBy.set(d.code, d);
    const today = todayKst(new Date());
    const recent = noteDate >= shiftDate(today, -1);
    const krQuotes = await Promise.all(
      refs.kr.flatMap((code) => {
        const r = krBy.get(code);
        if (!r) return [];
        const d = dayBy.get(code);
        const base = { code, name: r.name, market: r.market };
        // 이력에 없으면(새 상장 · 이력 표 시작 전) `stocks` 의 최근 종가가 글 날짜 이하일 때만 쓴다 — 글 날짜 뒤의 시세를 앉히지 않는다.
        const stored: KrStockQuote = d
          ? { ...base, price: d.close, changeRate: d.change_rate, priceDate: d.date }
          : r.price_date != null && r.price_date <= noteDate
            ? { ...base, price: r.close_price, changeRate: r.change_rate, priceDate: r.price_date }
            : { ...base, price: null, changeRate: null, priceDate: null };
        if (!recent || (stored.priceDate != null && stored.priceDate >= noteDate)) return [Promise.resolve(stored)];
        return [
          liveQuote(code, r.market).then((q) =>
            q && takeLiveKr(q.date, stored.priceDate, noteDate) ? { ...stored, price: q.price, changeRate: q.changeRate, priceDate: q.date ?? noteDate } : stored,
          ),
        ];
      }),
    );
    const usQuotes = await Promise.all(
      refs.us.flatMap((ticker) => {
        const r = usBy.get(ticker);
        if (!r) return [];
        return [
          usQuoteOn(ticker, noteDate, today).then(
            (q): UsStockQuote => ({ ticker, name: r.name_ko || ticker, price: q?.price ?? null, changeRate: q?.changeRate ?? null, priceDate: q?.date ?? null }),
          ),
        ];
      }),
    );
    return { kr: krQuotes, us: usQuotes };
  } catch (e) {
    console.error("[daily-note] 언급된 종목의 시세를 읽지 못했습니다:", e);
    return EMPTY_STOCKS;
  }
}

/**
 * 사이트맵용 — 날짜 전부. 못 읽으면 null(빈 목록과 구별해야 사이트맵이 500 을 낼 수 있다).
 *
 * ⚠️ PostgREST 는 한 번에 1,000행까지만 준다(조용히 자른다). 하루 한 줄이라 3년이 지나야
 *    닿는 상한이지만, 그때 가서 뒷부분이 소리 없이 빠지는 것보다 지금 페이지를 이어 받는
 *    편이 싸다. 이 저장소가 그 상한에 네 번 당했다.
 */
export async function listAllNoteDates(): Promise<string[] | null> {
  const dev = devNotes();
  if (dev) return dev.map((n) => n.date);
  const PAGE = 1000;
  const out: string[] = [];
  try {
    const db = getSupabaseServer();
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await db
        .from(TABLE)
        .select("date")
        .order("date", { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      const rows = (data as { date: string }[] | null) ?? [];
      out.push(...rows.map((r) => r.date));
      if (rows.length < PAGE) break;
    }
    return out;
  } catch (e) {
    console.error("[daily-note] 날짜 전부를 읽지 못했습니다:", e);
    return null;
  }
}
