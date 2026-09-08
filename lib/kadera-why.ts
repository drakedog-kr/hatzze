import "server-only";
import { cache } from "react";
import { getSupabaseAdmin } from "./supabase-server";
import { addDaysISO, kaderaBaseDate } from "./telegram-data";
import { LOAD_FAILED, type MaybeFailed } from "./load-state";
import { fetchDailyHistory, yahooSymbol } from "./yahoo-history";

/**
 * 카더라의 '급등 종목' 과 '다가오는 일정' 자료.
 *
 * 둘 다 **채널이 한 말**을 종목·날짜에 붙여 둔 것이다(마이그레이션 066 머리말). 우리가
 * 확인한 사실이 아니라서 화면도 "채널이 말한 까닭" · "채널이 짚은 날" 이라고 부른다.
 *
 * ## 급등 종목의 등락률은 두 갈래다
 *
 * 파이프라인이 그날 저녁에 까닭을 만들 때 KRX 는 아직 그날 시세를 안 준다(다음 날 낮에
 * 온다 — generate_move_reasons.py 머리말). 그래서
 *   ① `stocks.price_date` 가 그 날짜와 같으면 KRX 값을 쓰고(다음 날부터),
 *   ② 아니면 그 종목의 **그날 종가**를 야후 일봉에서 찾아 전날과 견준다.
 * ②는 급부상·주요 종목 카드가 이미 쓰는 경로다(lib/yahoo-history). 렌더마다 부르되
 * 15분 재검증이 걸려 있고, 대상이 하루 최대 40종목이라 감당된다.
 * ⚠️ 채널 글에서 읽은 `quoted_change_rate` 는 장중 값일 수 있어 **화면에 등락률로 내지
 *    않는다.** 등락률을 못 구한 줄은 "등락 준비 중"으로 두고 줄 세우기에만 그 값을 쓴다.
 *
 * ## 종목 화면에서는 야후를 안 부른다
 *
 * 그 화면은 464장이라 바깥 요청을 붙이지 않는다(lib/stock-page.ts 머리말). 거기서는
 * KRX 값이 날짜에 맞을 때만 등락률을 적고, 아니면 까닭만 보여준다.
 */

export type MoveReasonRow = {
  code: string;
  name: string;
  market: string | null;
  date: string;
  /** 그날 등락률. KRX(확정) 또는 야후 그날 종가 기준. 못 구하면 null */
  changeRate: number | null;
  changeSource: "krx" | "yahoo" | null;
  closePrice: number | null;
  /** 채널이 말한 까닭. null = 그날 언급은 있었지만 까닭을 말한 글이 없다 */
  reason: string | null;
  channelCount: number;
  mentionCount: number;
  /** 채널 글에서 읽은 등락 표기(정렬 보조). 화면에 내지 않는다 */
  quotedChange: number | null;
};

// 📌 타일에 '최근 한 달 종가' 선그래프를 달았다가 2026-09-06 에 걷었다. 되살리려면 아래
//    yahooBars 응답에서 `date` 이하 22거래일(한 달)의 종가를 잘라 넘기면 된다 — 일주일(5칸)은
//    선이 되기엔 너무 짧아 한 달로 잡았었다. 야후 호출은 등락률 때문에 어차피 도므로 공짜다.

export type MoveReasonBoard = { date: string; rows: MoveReasonRow[] };

/** 표에서 읽어 오는 최대 줄 수. 파이프라인 상한(CAP=40)과 같다 */
const BOARD_MAX = 40;
/**
 * 그중 **야후 일봉을 실제로 부르는** 줄 수.
 *
 * 화면은 아홉 장뿐인데(page.tsx WHY_TILES) 마흔 줄에 다 부르면 렌더마다 바깥 왕복이 마흔 번이다.
 * 그래서 KRX 확정값이나 채널 글의 등락 표기(quoted)로 **먼저 줄을 세우고** 위에서 이만큼만 부른다.
 * ⭐ 정렬은 절댓값이 아니라 **부호 있는 값의 내림차순**이다 — 카드가 오른 종목만 담으므로
 *    많이 내린 줄에 시세를 물어 봐야 어차피 안 쓴다(내린 줄의 까닭은 표에 남아 종목 화면이 쓴다).
 * 아홉이 아니라 스물넷인 이유: quoted 는 장중 값이라 실제 종가 등락과 순위가 조금 뒤집히고,
 * 장중에 오른 줄이 종가로는 내리기도 해서 걸러지고 나면 아홉이 안 남는다.
 *
 * ⚠️ **이 값만으로는 빈 칸을 못 막는다.** 여유를 얼마로 잡든, 고르는 잣대와 화면이 줄 세우는
 *    잣대가 같은 값(quoted)이라 시세를 안 물어본 줄이 화면에 올라설 수 있다. 그래서 아래
 *    getMoveReasons 가 **화면에 실제로 설 줄**을 보고 한 번 더 부른다(2차 조회 주석 참고).
 */
const QUOTE_ROWS = 24;
/**
 * 화면이 그리는 장수. **app/kadera/page.tsx 가 이 값을 가져다 쓴다.**
 *
 * 라이브러리가 들고 있는 이유는 위 2차 조회가 "화면에 실제로 설 줄"을 알아야 하기 때문이다.
 * 화면 쪽에 숫자를 따로 두면 둘이 갈리는 순간 2차 조회가 엉뚱한 줄을 채운다.
 */
export const BOARD_TILES = 9;
/** 기준일에서 이보다 오래된 까닭은 '오늘' 카드에 안 올린다(주말·연휴는 사흘까지 거슬러 본다) */
const BOARD_STALE_DAYS = 3;

type ReasonRow = {
  date: string;
  stock_code: string;
  reason: string | null;
  quoted_change_rate: number | string | null;
  mention_count: number | null;
  channel_count: number | null;
  change_rate: number | string | null;
  close_price: number | null;
};

type StockRow = {
  code: string;
  name: string;
  market: string | null;
  close_price: number | null;
  change_rate: number | string | null;
  price_date: string | null;
};

const num = (v: number | string | null | undefined): number | null =>
  v === null || v === undefined ? null : Number(v);

async function stockRows(codes: string[]): Promise<Map<string, StockRow>> {
  const db = getSupabaseAdmin();
  const out = new Map<string, StockRow>();
  // `.in()` 목록이 길면 URL 이 커져 요청이 안 나간다 — 조각내어 묻는다(이 저장소가 여러 번 밟았다).
  for (let i = 0; i < codes.length; i += 200) {
    const { data, error } = await db
      .from("stocks")
      .select("code,name,market,close_price,change_rate,price_date")
      .in("code", codes.slice(i, i + 200));
    if (error) {
      console.error("[kadera-why] 종목 정보를 못 읽었습니다", error);
      continue;
    }
    for (const r of (data ?? []) as StockRow[]) out.set(r.code, r);
  }
  return out;
}

/** 야후 일봉(최근 두 달쯤). 등락률과 한 달 선그래프가 같은 응답을 나눠 쓴다. 못 받으면 null. */
async function yahooBars(code: string, market: string | null) {
  return fetchDailyHistory(yahooSymbol(code, market), 0.2).catch(() => null);
}

/** 일봉에서 `date` 의 종가 등락률(전 거래일 대비). 그날 봉이 없으면 null. */
function changeOn(bars: { date: string; close: number }[], date: string): { rate: number; close: number } | null {
  const i = bars.findIndex((b) => b.date === date);
  if (i <= 0) return null;
  const prev = bars[i - 1].close;
  if (!prev) return null;
  return { rate: (bars[i].close / prev - 1) * 100, close: bars[i].close };
}

/**
 * '급등 종목' 카드 — 가장 최근 날짜의 까닭 목록, **오른 종목만** 오름폭 순.
 *
 * ⭐ 2026-09-06 에 오르내림 섞기를 접었다. 이 카드는 '01 최근 뜨는 것' 구간에 서는데
 *    거기 내린 종목이 섞이면 구간 이름과 어긋나고, 제목도 반만 맞는 말이 된다.
 * ⛔ **파이프라인은 그대로 양방향을 만든다**(generate_move_reasons.CAP). 내린 종목의 까닭은
 *    표에 남아 종목 화면(getStockMoveReason)이 쓴다 — "왜 떨어졌어"도 검색으로 오는 질문이다.
 * 등락률을 못 구한 줄은 채널 글의 표기(quoted)가 플러스일 때만 남긴다 — 시세만 늦은 것일 수
 *    있어서다. 그마저 없으면 오른 줄인지 알 길이 없으므로 뺀다.
 */
export const getMoveReasons = cache(async (): Promise<MaybeFailed<MoveReasonBoard | null>> => {
  const db = getSupabaseAdmin();
  const base = await kaderaBaseDate();
  const { data: latest, error: e1 } = await db
    .from("telegram_stock_move_reason")
    .select("date")
    .lte("date", base)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (e1) {
    console.error("[getMoveReasons] 최신 날짜를 못 읽었습니다", e1);
    return LOAD_FAILED;
  }
  const date = latest?.date as string | undefined;
  if (!date || date < addDaysISO(base, -BOARD_STALE_DAYS)) return null;

  const { data, error } = await db
    .from("telegram_stock_move_reason")
    .select("date,stock_code,reason,quoted_change_rate,mention_count,channel_count,change_rate,close_price")
    .eq("date", date)
    .limit(BOARD_MAX);
  if (error) {
    console.error("[getMoveReasons] 까닭 목록을 못 읽었습니다", error);
    return LOAD_FAILED;
  }
  const rows = (data ?? []) as ReasonRow[];
  if (!rows.length) return { date, rows: [] };

  const info = await stockRows(rows.map((r) => r.stock_code));
  // 야후를 부를 줄 고르기 — KRX 확정값이 있으면 그것, 없으면 채널 글의 표기로 어림한다.
  // 부호를 살려 정렬한다(위 QUOTE_ROWS 주석): 많이 오른 줄부터.
  const hint = (r: ReasonRow) => num(r.change_rate) ?? num(r.quoted_change_rate) ?? 0;
  const willQuote = new Set(
    [...rows]
      .sort((a, b) => hint(b) - hint(a))
      .slice(0, QUOTE_ROWS)
      .map((r) => r.stock_code),
  );
  const out: MoveReasonRow[] = rows.map((r) => {
    const s = info.get(r.stock_code);
    let changeRate: number | null = num(r.change_rate);
    let changeSource: MoveReasonRow["changeSource"] = changeRate === null ? null : "krx";
    let closePrice: number | null = r.close_price ?? null;
    if (changeRate === null && s && s.price_date === date && s.change_rate != null) {
      changeRate = num(s.change_rate);
      changeSource = "krx";
      closePrice = s.close_price ?? null;
    }
    return {
      code: r.stock_code,
      name: s?.name ?? r.stock_code,
      market: s?.market ?? null,
      date,
      changeRate,
      changeSource,
      closePrice,
      reason: r.reason ?? null,
      channelCount: r.channel_count ?? 0,
      mentionCount: r.mention_count ?? 0,
      quotedChange: num(r.quoted_change_rate),
    };
  });

  /**
   * KRX 가 아직 그날 시세를 안 준 줄을 야후 일봉으로 채운다.
   *
   * 한 종목은 **한 번만** 부른다(asked). 아래 2차 조회가 여러 바퀴 돌 수 있는데, 그때마다
   * 같은 종목을 다시 물으면 바깥 왕복이 바퀴 수만큼 곱해진다. 못 구한 종목도 asked 에
   * 남으므로 다음 바퀴에서 다시 시도하지 않는다.
   */
  const asked = new Set<string>();
  const fillFromYahoo = async (targets: MoveReasonRow[]): Promise<number> => {
    const todo = targets.filter((r) => r.changeRate === null && !asked.has(r.code));
    if (!todo.length) return 0;
    todo.forEach((r) => asked.add(r.code));
    await Promise.all(
      todo.map(async (r) => {
        const bars = await yahooBars(r.code, r.market);
        const y = bars ? changeOn(bars, date) : null;
        if (!y) return;
        r.changeRate = y.rate;
        r.changeSource = "yahoo";
        r.closePrice = Math.round(y.close);
      }),
    );
    return todo.length;
  };

  /** 오른 줄만, 큰 순으로. 등락률이 있으면 그것이 판정이고 없으면 채널 글의 표기로 가른다. */
  const boardOf = (): MoveReasonRow[] =>
    out
      .filter((r) => (r.changeRate !== null ? r.changeRate > 0 : (r.quotedChange ?? 0) > 0))
      .sort((a, b) => {
        const ka = a.changeRate ?? a.quotedChange ?? 0;
        const kb = b.changeRate ?? b.quotedChange ?? 0;
        if (kb !== ka) return kb - ka;
        return b.channelCount - a.channelCount;
      });

  // 1차 — 채널 글 표기로 줄 세워 위에서 QUOTE_ROWS 만 부른다. 왕복을 아끼는 자리다.
  await fillFromYahoo(out.filter((r) => willQuote.has(r.code)));

  /**
   * 2차 — **화면에 실제로 설 줄** 가운데 아직 빈 것만 더 부른다.
   *
   * ## 1차만으로는 왜 모자라나
   *
   * 1차가 부를 줄을 고르는 잣대와 화면이 줄을 세우는 잣대가 **같은 값**(채널 글의 표기)이라,
   * 시세를 안 물어본 줄이 자기 표기값으로 화면에 올라선다. 2026-09-09 01:30 KST 실측:
   * 상한가(30%)를 적은 글이 많아 24칸을 전부 차지했고, 아세아시멘트(17.4%)·액트로(16.77%)는
   * 밖으로 밀려 시세를 안 물어봤는데 7·8위로 섰다. 바로 아래 지니너스는 16.76% 로 0.01
   * 낮은데 시세가 붙어 있었다. 그래서 카드 두 장이 '등락 준비 중' 으로 떴다.
   *
   * ## 한 바퀴로 안 끝나는 까닭
   *
   * 새로 채운 값이 0 이하면 그 줄은 목록에서 빠지고 그 자리에 다음 줄이 올라온다. 그 줄도
   * 비어 있을 수 있다. 그래서 위 아홉 장이 다 채워지거나 더 부를 줄이 없을 때까지 돈다.
   * 한 종목은 한 번만 부르므로(asked) 바퀴는 BOARD_MAX 를 못 넘는다.
   *
   * ## 왕복이 얼마나 느나
   *
   * 평소엔 **0** 이다 — 1차에서 이미 채워져 있어 첫 바퀴가 곧바로 끝난다. 오늘처럼 상한가
   * 표기가 24칸을 채운 날에만 몇 건 더 부른다. KRX 가 그날 시세를 준 뒤로는 1차조차 안 탄다.
   */
  for (let round = 0; round < BOARD_MAX; round++) {
    if (!(await fillFromYahoo(boardOf().slice(0, BOARD_TILES)))) break;
  }

  return { date, rows: boardOf() };
});

export type StockMoveReason = {
  date: string;
  reason: string | null;
  channelCount: number;
  mentionCount: number;
  /** KRX 확정 등락률(파이프라인이 다음 날 채운 것). 없으면 null — 화면은 stocks 의 값과 날짜를 맞춰 본다 */
  changeRate: number | null;
};

/** 종목 화면용 — 기준일에서 사흘 안의 가장 최근 까닭 한 줄. 없으면 null(정상). */
export async function getStockMoveReason(code: string, base?: string): Promise<StockMoveReason | null> {
  const db = getSupabaseAdmin();
  const b = base ?? (await kaderaBaseDate());
  const { data, error } = await db
    .from("telegram_stock_move_reason")
    .select("date,reason,mention_count,channel_count,change_rate")
    .eq("stock_code", code)
    .gte("date", addDaysISO(b, -BOARD_STALE_DAYS))
    .lte("date", b)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error(`[getStockMoveReason] ${code} 까닭을 못 읽었습니다`, error);
    return null;
  }
  if (!data) return null;
  return {
    date: data.date as string,
    reason: (data.reason as string | null) ?? null,
    channelCount: (data.channel_count as number | null) ?? 0,
    mentionCount: (data.mention_count as number | null) ?? 0,
    changeRate: num(data.change_rate as number | string | null),
  };
}

// ─── 다가오는 일정 ─────────────────────────────────────────────────────────

export type DatePrecision = "day" | "month" | "quarter" | "year";

export type UpcomingEvent = {
  /** 국내는 6자리 종목코드, 미장은 티커 */
  code: string;
  name: string;
  /**
   * KOSPI | KOSDAQ | US. 로고(StockLogo)가 접미사를 고르는 데 쓰고, 달력이 링크 주소를 가른다
   * (미국 종목엔 아직 실주소가 없어 MDD 로 보낸다). 모르면(null) 로고를 안 부르고 머리글자로 간다.
   */
  market: string | null;
  date: string;
  precision: DatePrecision;
  event: string;
  /** 같은 (종목, 날짜)를 말한 채널 수 */
  channels: number;
  /** 이 이야기가 처음 돈 시각(UTC ISO) */
  firstSeen: string;
};

type EventRow = {
  channel_handle: string;
  stock_code: string;
  event_date: string;
  date_precision: DatePrecision;
  event: string;
  posted_at: string;
};

/** 벽시계 기준 오늘(KST). 달력의 '오늘'은 집계 기준일이 아니라 사람이 사는 날짜여야 "내일"이 맞다. */
export function todayKst(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * (종목, 날짜, 정밀도)로 묶는다. 행사 문구는 채널마다 조금씩 달라 **가장 많이 쓰인 표기**를
 * 대표로 삼고, 채널 수는 묶음 안의 서로 다른 채널을 센다.
 */
function groupEvents(rows: EventRow[]): Omit<UpcomingEvent, "name" | "market">[] {
  const groups = new Map<string, { rows: EventRow[] }>();
  for (const r of rows) {
    const k = `${r.stock_code}|${r.event_date}|${r.date_precision}`;
    const g = groups.get(k);
    if (g) g.rows.push(r);
    else groups.set(k, { rows: [r] });
  }
  const out: Omit<UpcomingEvent, "name" | "market">[] = [];
  for (const { rows: g } of groups.values()) {
    const texts = new Map<string, { text: string; n: number }>();
    for (const r of g) {
      const key = r.event.replace(/[\s·,.()]/g, "");
      const cur = texts.get(key);
      if (cur) cur.n += 1;
      else texts.set(key, { text: r.event, n: 1 });
    }
    const top = [...texts.values()].sort((a, b) => b.n - a.n)[0];
    out.push({
      code: g[0].stock_code,
      date: g[0].event_date,
      precision: g[0].date_precision,
      event: top.text,
      channels: new Set(g.map((r) => r.channel_handle)).size,
      firstSeen: g.map((r) => r.posted_at).sort()[0],
    });
  }
  return out;
}

async function attachNames<T extends { code: string }>(items: T[]): Promise<(T & { name: string; market: string | null })[]> {
  const info = await stockRows([...new Set(items.map((i) => i.code))]);
  // ⚠️ market 을 빠뜨리면 로고가 **전부** 머리글자가 된다(StockLogo 는 시장을 모르면 요청을 안 한다).
  //    2026-09-06 에 그렇게 나가서 "로고가 왜 없냐"는 지적을 받았다.
  return items.map((i) => ({ ...i, name: info.get(i.code)?.name ?? i.code, market: info.get(i.code)?.market ?? null }));
}

/**
 * 카더라 카드용 — 오늘부터 `days` 일 안, **날짜가 적혀 있던 것(day)만.** 달·분기·연 단위는
 * 달력에 놓을 자리가 없고(어느 칸에 두나), 모델이 "연말"을 12-31 로 굳혀 쓴 값이라
 * 그 자리에 두면 거짓이 된다(마이그레이션 066 머리말).
 */
/** 한 날짜의 최대 줄 수. 달력은 하루씩 보여주고 건수를 그대로 적으므로 사실상 안 자른다(폭주만 막는다). */
const EVENTS_PER_DATE = 30;

export const getUpcomingEvents = cache(async (days = 35, limit = 400): Promise<MaybeFailed<UpcomingEvent[]>> => {
  const db = getSupabaseAdmin();
  const from = todayKst();
  const to = addDaysISO(from, days);
  const { data, error } = await db
    .from("telegram_stock_event")
    .select("channel_handle,stock_code,event_date,date_precision,event,posted_at")
    .eq("date_precision", "day")
    .gte("event_date", from)
    .lte("event_date", to)
    .limit(1000);
  if (error) {
    console.error("[getUpcomingEvents] 일정을 못 읽었습니다", error);
    return LOAD_FAILED;
  }
  const grouped = groupEvents((data ?? []) as EventRow[]);
  grouped.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : b.channels - a.channels));
  // ⚠️ 한 날짜가 카드를 독차지하지 않게 날짜당 몇 줄로 자른다. 공시 알림 채널이 "추가상장·
  //    변경상장" 을 같은 날에 열 건씩 올리는데(2026-09-07 실측 12건), 그대로 두면 열두 줄이
  //    전부 한 날이고 그다음 날의 애플 폴더블폰 공개(5채널)가 밀려 안 보인다.
  //    같은 날 안에서는 여러 채널이 말한 것이 먼저다(위 정렬).
  const perDate = new Map<string, number>();
  const capped = grouped.filter((e) => {
    const n = perDate.get(e.date) ?? 0;
    if (n >= EVENTS_PER_DATE) return false;
    perDate.set(e.date, n + 1);
    return true;
  });
  return attachNames(capped.slice(0, limit));
});

/** 종목 화면용 — 오늘 이후의 일정 전부(정밀도 무관), 가까운 날부터. 없으면 빈 배열(정상). */
export async function getStockEvents(code: string, limit = 8): Promise<UpcomingEvent[]> {
  const db = getSupabaseAdmin();
  const from = todayKst();
  const { data, error } = await db
    .from("telegram_stock_event")
    .select("channel_handle,stock_code,event_date,date_precision,event,posted_at")
    .eq("stock_code", code)
    .gte("event_date", from)
    .limit(500);
  if (error) {
    console.error(`[getStockEvents] ${code} 일정을 못 읽었습니다`, error);
    return [];
  }
  const grouped = groupEvents((data ?? []) as EventRow[]);
  grouped.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : b.channels - a.channels));
  return attachNames(grouped.slice(0, limit));
}

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

/**
 * 일정 날짜의 글자. 정밀도가 낮을수록 두루뭉술하게 적는다 — "10월 1일"이라고 적으면
 * 그날 무슨 일이 있는 줄 안다. 실제로는 "10월 중"이었다.
 */
export function eventDateLabel(e: { date: string; precision: DatePrecision }): string {
  const [y, m, d] = e.date.split("-").map(Number);
  const thisYear = Number(todayKst().slice(0, 4));
  const yearPrefix = y !== thisYear ? `${y}년 ` : "";
  if (e.precision === "day") {
    const wd = WEEKDAY[new Date(`${e.date}T00:00:00Z`).getUTCDay()];
    return `${yearPrefix}${m}월 ${d}일 (${wd})`;
  }
  if (e.precision === "month") return `${yearPrefix}${m}월 중`;
  if (e.precision === "quarter") return `${yearPrefix}${Math.ceil(m / 3)}분기`;
  return `${y}년`;
}

/** 오늘로부터 며칠 뒤인가("오늘" · "내일" · "3일 뒤"). 달력 줄의 보조 글자. */
export function daysFromToday(date: string): string {
  const today = todayKst();
  const diff = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (diff <= 0) return "오늘";
  if (diff === 1) return "내일";
  return `${diff}일 뒤`;
}
