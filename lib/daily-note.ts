import "server-only";

import { cache } from "react";

import { isKstWeekday } from "./cron-schedule";
import { getDevOverrides } from "./dev-overrides";
import { getSupabaseServer } from "./supabase-server";
import { changeRateOf, fetchYahooQuote } from "./yahoo-quote";

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
  updated_at: string;
  /** 068 전 줄은 없거나 `{}` 다. 열 자체가 없으면 select("*") 가 그냥 안 준다. */
  stocks?: unknown;
};

const TABLE = "daily_note";

/** 지난 노트 목록에 보이는 수. 한 달치면 넘겨 보는 데 충분하고 한 화면에 들어간다. */
export const NOTE_ARCHIVE_LIMIT = 30;

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

/** 목록용. "9월 5일 (토)" — 해는 목록 머리가 한 번만 말한다. */
export function fmtNoteDateShort(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${m}월 ${d}일 (${WEEKDAYS_SHORT[weekdayOf(iso)]})`;
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
   * 종가(원). 글 날짜가 오늘이고 KRX 가 아직 그날 값을 안 줬으면 야후 실시간(카더라 카드와
   * 같은 소스), 그 밖에는 `stocks` 표의 **최근** KRX 값 — 글 날짜의 값이 아니다.
   */
  price: number | null;
  changeRate: number | null;
  priceDate: string | null;
};
export type UsStockRef = { ticker: string; name: string };
export type NoteStocks = { kr: KrStockQuote[]; us: UsStockRef[] };

export const EMPTY_STOCKS: NoteStocks = { kr: [], us: [] };

/** 벽시계 기준 오늘(KST). 글 날짜(YYYY-MM-DD)와 견주는 데만 쓴다. */
function todayKst(now: Date): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * 야후 실시간 — 카더라 카드(lib/telegram-data stockQuote)와 같은 심볼 규칙·같은 캐시.
 * 등락률을 못 내면 null 을 줘 호출부가 KRX 저장값을 그대로 쓰게 한다.
 */
async function liveQuote(code: string, market: string | null): Promise<{ price: number; changeRate: number } | null> {
  const q = await fetchYahooQuote(`${code}.${market === "KOSDAQ" ? "KQ" : "KS"}`, { next: { revalidate: 600 } });
  if (!q) return null;
  const changeRate = changeRateOf(q);
  return changeRate === null ? null : { price: q.price, changeRate };
}

/**
 * 언급된 종목의 이름과 시세. 국내는 `stocks` 표의 종가·등락률(KRX, 종목 실주소 화면과 같은
 * 열), 미국은 `us_stocks` 의 한글 이름만 — 미국 종가는 매일 받는 원천이 없다.
 *
 * ## 오늘 글만 야후를 본다
 *
 * KRX Open API 는 그날 종가를 다음 날 아침에야 준다. 그래서 저녁에 올린 글을 열면
 * `stocks` 표는 전날 값이다(2026-09-08 저녁 실측: 23시에도 KRX 최신 기준일이 09-07).
 * 카더라 카드는 같은 자리를 야후 실시간으로 먼저 채우고 KRX 로 폴백하니, 여기도 **글 날짜가
 * 오늘(KST 평일)이고 KRX 가 그날 값에 못 미친 종목만** 야후를 본다.
 *
 * ⛔ 지난 글은 야후를 부르지 않는다(종목 실주소 화면 머리말의 같은 규칙). 크롤러가 지난 글을
 *    훑으면 편마다 바깥 요청이 붙는다 — 이 조건이 그걸 막는다. 오늘 글 한 편 × 언급 종목 수가
 *    상한이고, 야후 응답은 카더라와 같은 600초 캐시를 탄다.
 * ⚠️ 야후 값에는 기준일이 없다. 평일에만 부르므로 글 날짜를 기준일로 적는다 — 평일 휴장일
 *    (공휴일)엔 전 영업일 종가가 그날 날짜로 보일 수 있다. 다음 날 아침 KRX 가 따라오면
 *    조건이 풀려 KRX 값으로 돌아간다.
 *
 * 순서는 글에 나온 차례(refs)를 그대로 지킨다. 못 읽으면 빈 목록 — 카드 하나가 빠질 뿐
 * 글은 그대로 보여야 한다.
 */
export async function getNoteStocks(refs: NoteStockRefs, noteDate: string): Promise<NoteStocks> {
  if (!refs.kr.length && !refs.us.length) return EMPTY_STOCKS;
  try {
    const db = getSupabaseServer();
    const [kr, us] = await Promise.all([
      refs.kr.length
        ? db.from("stocks").select("code,name,market,close_price,change_rate,price_date").in("code", refs.kr)
        : Promise.resolve({ data: [], error: null }),
      refs.us.length ? db.from("us_stocks").select("ticker,name_ko").in("ticker", refs.us) : Promise.resolve({ data: [], error: null }),
    ]);
    if (kr.error) throw kr.error;
    if (us.error) throw us.error;
    type KrRow = { code: string; name: string; market: string | null; close_price: number | null; change_rate: number | null; price_date: string | null };
    type UsRow = { ticker: string; name_ko: string | null };
    const krBy = new Map(((kr.data as KrRow[] | null) ?? []).map((r) => [r.code, r]));
    const usBy = new Map(((us.data as UsRow[] | null) ?? []).map((r) => [r.ticker, r]));
    const now = new Date();
    const liveDay = noteDate === todayKst(now) && isKstWeekday(now);
    const krQuotes = await Promise.all(
      refs.kr.flatMap((code) => {
        const r = krBy.get(code);
        if (!r) return [];
        const stored: KrStockQuote = { code, name: r.name, market: r.market, price: r.close_price, changeRate: r.change_rate, priceDate: r.price_date };
        if (!liveDay || (r.price_date != null && r.price_date >= noteDate)) return [Promise.resolve(stored)];
        return [
          liveQuote(code, r.market).then((q) => (q ? { ...stored, price: q.price, changeRate: q.changeRate, priceDate: noteDate } : stored)),
        ];
      }),
    );
    return {
      kr: krQuotes,
      us: refs.us.flatMap((ticker) => {
        const r = usBy.get(ticker);
        return r ? [{ ticker, name: r.name_ko || ticker }] : [];
      }),
    };
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
