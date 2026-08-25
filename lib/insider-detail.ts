/**
 * 내부자 리포트의 **상세 두 장** — 종목 하나 · 사람 하나.
 *
 * 메인 화면(`lib/insider-data.ts`)이 "오늘 무엇이 있었나"를 종목 여럿으로 훑는다면,
 * 여기는 하나를 파고든다. 그래서 조회도 따로다 — 메인의 `getInsiderOverview()` 는
 * 창(7일·90일) 안만 보는데, 상세는 그 종목/사람에 대해 **가진 것을 전부** 본다.
 *
 * ## ⭐ 우리가 FolioObs 와 다른 자리
 *
 * 저쪽 종목 페이지에는 애널리스트 컨센서스·어닝콜·뉴스·섹터·시가총액이 있고 우리는
 * 없다. 대신 **카더라 언급 시계열**이 우리한테만 있다(실측 40일치). 한국 채팅방에서
 * 이 종목이 얼마나 회자되는지는 어느 미국 서비스도 안 낸다. 그래서 종목 상세의
 * 첫 화면을 그것으로 연다.
 *
 * ## ⚠️ 없는 것을 지어내지 않는다
 *
 * 섹터·시가총액·직원수·투자 스타일 소개문은 원천이 없다. 빈 칸을 "-" 로 채우거나
 * 그럴듯한 문장을 만들지 말 것. 없는 자리는 아예 안 그린다.
 *
 * ## ⚠️ 사람은 CIK 로 집는다
 *
 * FolioObs 는 `/investor/buffett` 처럼 이름 슬러그를 쓴다. 우리는 62명이 한국어
 * 이름이라 슬러그를 손으로 62개 지어야 하고, 그러면 이름을 고칠 때마다 주소가 깨진다.
 * CIK 는 SEC 가 정한 값이라 안 바뀐다.
 */
import { cache } from "react";

import { getSupabaseAdmin } from "@/lib/supabase-server";
import { getUsdKrw } from "@/lib/seohak-external";
import { fetchAllRows } from "@/lib/telegram-data";
import { usQuotes } from "@/lib/us-telegram-data";
import { fetchDailyHistory } from "@/lib/yahoo-history";
import { displayName } from "@/lib/us-ticker-names";

/** 언급 추이로 그리는 날수. 표에 41일치가 있어 그보다 길게 잡을 이유가 없다. */
export const MENTION_TREND_DAYS = 40;

/**
 * 차트 기간 선택지.
 *
 * ## ⚠️ 주가가 아니라 **공시가 어디까지 있느냐**로 정했다
 *
 * 벤치마킹한 쪽은 1W·1M·3M·1Y·5Y·ALL 이다. 그쪽 차트의 주인공은 주가지만 **우리 차트의
 * 주인공은 매매 시점**이라, 공시가 없는 구간은 빈 선일 뿐이다. 실측(2026-08-21):
 *
 *   창      임원 장내매매      의원 매매        13F 분기
 *   1개월   2,280건           104건           0개   ← 거물 배지를 눌러도 빈 화면
 *   3개월   8,062건           444건           1개
 *   6개월   11,018건(99.96%)  1,312건         2개   ← 분기 비교가 성립하는 최소
 *   1년     11,021건          2,211건(92%)    3개
 *   2년     11,022건(전부)     2,401건(99.9%)  3개   ← 우리가 가진 전부
 *
 * ⛔ 1주·1개월을 넣지 말 것 — 13F 분기가 0개라 "거물"을 골라도 아무것도 안 뜬다.
 *    눌러서 빈 화면이 나오는 선택지는 두면 안 된다.
 * ⛔ 5년·전체도 넣지 말 것 — 우리 공시가 최대 2년이라 3년이 빈 선이고 마커가 오른쪽
 *    끝에 뭉친다.
 */
export const PRICE_RANGES = [
  { key: "3m", label: "3개월", years: 0.25 },
  { key: "6m", label: "6개월", years: 0.5 },
  { key: "1y", label: "1년", years: 1 },
  { key: "2y", label: "2년", years: 2 },
] as const;

export type PriceRangeKey = (typeof PRICE_RANGES)[number]["key"];

/** 기본 창. 임원이 사실상 전부 들어오고 13F 두 분기가 잡히는 최소다. */
export const PRICE_RANGE_DEFAULT: PriceRangeKey = "6m";

export const yearsOf = (key: string | undefined): number =>
  PRICE_RANGES.find((r) => r.key === key)?.years ??
  PRICE_RANGES.find((r) => r.key === PRICE_RANGE_DEFAULT)!.years;

/**
 * 차트에 찍는 매매 표시 한 점.
 *
 * ⚠️⚠️ **신고 한 건마다 찍으면 안 된다.** GOOGL 이 임원 신고 222건, 코어위브가
 * 2,021건이다. 그대로 찍으면 마커가 선을 통째로 덮는다. **(날짜 × 방향)으로 묶어야**
 * 24개·114개가 된다(실측). 몇 건이었는지는 `count` 로 남기고 호버에 적는다.
 */
export type TradeMark = {
  date: string;
  /** 위(매수)냐 아래(매도)냐. 그 밖(옵션 행사·세금)은 표시하지 않는다 — 매매가 아니다. */
  side: "buy" | "sell";
  /**
   * ⚠️ `manager`(거물)는 **날짜가 없는 표시**다. 13F 는 분기말 한 시점의 보유만 신고해서
   * "언제 샀나"가 원천에 없다 — 분기말에 찍고 "그 분기에 이만큼이 늘었다"로 읽어야 한다.
   * 화면이 그 사실을 적어야 하고, 임원·의원 마커와 같은 뜻으로 읽히면 안 된다.
   */
  who: "insider" | "congress" | "manager";
  count: number;
  /** 호버에 적을 이름. 많으면 앞 둘만. */
  names: string[];
  /**
   * 이 점이 묶은 **물량**. 호버가 "얼마나"를 말하려면 건수만으로는 모자라다.
   *
   * ⚠️ 축마다 원천이 주는 것이 다르다 — 임원은 주식 수, 의원은 **신고 구간**(달러)이다.
   *    거물은 13F 라 아예 없다(분기말 보유의 차이일 뿐 매매 물량이 아니다).
   * ⛔ 의원 구간의 가운데값을 만들어 더하지 말 것. 원천이 안 준 숫자를 지어내는 것이다.
   */
  shares: number | null;
  low: number | null;
  high: number | null;
};

export type MentionPoint = { date: string; mentions: number; channels: number };

/** 이 종목을 든 거물 한 명. 비중은 그 사람 포트폴리오 안에서의 몫이다. */
export type StockHolder = {
  cik: number;
  person: string;
  firm: string;
  shares: number;
  value: number;
  /** 그 운용사 전체 대비 비중(%). 분모는 우리가 받은 보유 합계다. */
  weight: number;
  /** 직전 분기 대비. 비교할 분기가 없으면 null. */
  move: "new" | "add" | "trim" | "hold" | null;
  /**
   * 직전 분기 대비 **주식 수** 증감률(%). 100주에서 80주가 됐으면 −20 이다.
   * 비교할 분기가 없거나 신규(직전 0주)면 null — 0 으로 흘리면 "안 움직였다"가 된다.
   *
   * ⚠️ 금액이 아니라 주식 수로 잰다. 금액은 주가가 오르면 한 주도 안 사고 늘어난다.
   * ⚠️ 분기말 두 시점의 차이일 뿐이라 "이만큼 팔았다"가 아니다 — 분기 중간에 사고판
   *    것은 서로 상쇄돼 안 보인다. 화면이 그 사실을 적어야 한다.
   */
  sharesChange: number | null;
  reportDate: string;
};

export type StockCongress = {
  member: string;
  stateDst: string | null;
  kind: string | null;
  transactionDate: string | null;
  filedDate: string;
  amountLow: number | null;
  amountHigh: number | null;
};

export type StockInsider = {
  ownerName: string | null;
  ownerTitle: string | null;
  code: string | null;
  /**
   * `A`(취득) 또는 `D`(처분). **코드만으로 방향을 가르면 안 된다** — 전환(C)이 취득
   * 306건·처분 43건으로 양쪽에 다 있다. 원천이 방향을 따로 주므로 그걸 쓴다.
   */
  acquiredDisposed: string | null;
  shares: number | null;
  price: number | null;
  value: number | null;
  filedDate: string;
  sourceUrl: string | null;
};

/**
 * 애널리스트 컨센서스 — 등급 분포와 목표가.
 *
 * ## ⚠️ 애널리스트 수가 **둘**이다
 *
 * 등급을 낸 사람과 목표가를 낸 사람이 다르다(NVDA 실측 62명 대 59명). 하나로 뭉쳐
 * 적으면 어느 쪽도 맞지 않는다.
 *
 * ## ⚠️ 숫자를 손대지 않는다
 *
 * 원천(stockanalysis.com) 약관이 "수정하지 않고 출처를 밝히면 발췌 허용"이다. 반올림·
 * 재계산·단위 변환을 하지 말고, 화면에 출처를 반드시 적을 것.
 */
export type AnalystConsensus = {
  /** 원문 등급. `"Strong Buy" | "Buy" | "Hold" | "Sell" | "Strong Sell"`. */
  consensus: string | null;
  analystCount: number | null;
  strongBuy: number | null;
  buy: number | null;
  hold: number | null;
  sell: number | null;
  strongSell: number | null;
  targetAvg: number | null;
  targetLow: number | null;
  targetHigh: number | null;
  /** ⚠️ `analystCount` 와 다른 수다. 목표가를 낸 사람만 센다. */
  targetCount: number | null;
  /** 우리가 받은 날. 원천이 기준 시점을 안 준다. */
  asOf: string;
};

/**
 * 개별 애널리스트 한 명의 의견.
 *
 * ⚠️ 종목당 **다섯 건만** 담고 낸다. 원천 약관이 "전문 재게시 금지 · 발췌 허용"이라,
 *    저쪽이 싣는 최근 목록을 통째로 옮기면 발췌가 아니다. 화면은 원문 링크를 함께 낸다.
 * ⚠️ 이전 등급은 원천에 없다 — 방향은 `action` 에만 있다("Upgrades"·"Downgrades").
 */
export type AnalystAction = {
  date: string;
  analyst: string;
  firm: string;
  /** 원문 등급. `"Buy" | "Hold" | "Sell" | "Strong Buy" | "Strong Sell"`. */
  rating: string | null;
  /** 원문 행동. `"Maintains" | "Reiterates" | "Upgrades" | "Downgrades" | "Initiates"`. */
  action: string | null;
  targetNow: number | null;
  /** 목표가를 바꾼 경우에만 있다. 그 차이가 이 줄에서 가장 읽을 만한 값이다. */
  targetOld: number | null;
};

export type StockDetail = {
  ticker: string;
  name: string;
  price: number | null;
  changeRate: number | null;
  usdKrw: number | null;
  /** 카더라 언급 추이. 빈 날은 0 으로 메운다 — 안 메우면 막대가 날짜를 건너뛴다. */
  trend: MentionPoint[];
  /** 오늘(가장 최근 날) 언급. 없으면 0 이다. */
  mentionsToday: number;
  channelsToday: number;
  mentionDate: string | null;
  holders: StockHolder[];
  /** 거물 명단 전체 수. "N/62" 의 분모다. */
  managerCount: number;
  /** 주가 일봉. 못 받으면 빈 배열이고 차트를 안 그린다. */
  bars: { date: string; close: number }[];
  /**
   * 52주 최저·최고와 그 사이 현재 위치(%).
   *
   * ⭐ 차트 기간을 3개월로 줄여도 이 값은 **늘 1년**이다. "52주 위치"가 3개월 위치로
   * 바뀌면 같은 이름이 다른 뜻이 된다. 그래서 일봉을 늘 1년치 이상 받아 두고,
   * 차트는 거기서 잘라 쓴다(요청도 한 번으로 끝난다).
   */
  week52: { low: number; high: number; position: number } | null;
  /** 기간 수익률. 자료가 모자란 구간은 아예 안 낸다 — 0%로 채우면 사실처럼 읽힌다. */
  returns: { label: string; pct: number }[];
  /** 차트 위에 찍을 매매 시점. (날짜 × 방향)으로 묶여 있다. */
  marks: TradeMark[];
  congress: StockCongress[];
  insiders: StockInsider[];
  /** 애널리스트 컨센서스. 커버리지가 없는 종목은 null 이고 카드를 아예 안 그린다. */
  consensus: AnalystConsensus | null;
  /** 개별 애널리스트 의견, 최신 순. 없으면 빈 배열이고 목록을 안 그린다. */
  analystActions: AnalystAction[];
};

export type ManagerHolding = {
  ticker: string;
  name: string;
  shares: number;
  value: number;
  weight: number;
  move: "new" | "add" | "trim" | "hold" | null;
  /** 직전 분기 대비 주식 수 증감률(%). 신규·청산은 null. */
  sharesChange: number | null;
  /** 카더라에 오른 종목인지. **우리만 붙일 수 있는 표시다.** */
  inKadera: boolean;
};

export type ManagerDetail = {
  cik: number;
  person: string;
  firm: string;
  reportDate: string | null;
  priorDate: string | null;
  /** 받은 보유의 합계. 13F 가 신고한 미국 상장주 기준이라 진짜 운용자산과는 다르다. */
  aum: number;
  /**
   * 직전 분기의 같은 합계. 히어로가 분기 대비 증감을 여기서 낸다.
   *
   * ⚠️ 이 증감은 **수익률이 아니다.** 주가가 움직인 것과 새로 사고판 것과 자금이
   *    드나든 것이 한 숫자에 섞여 있고, 13F 로는 셋을 못 가른다. 화면 문구가
   *    "신고 합계"라고만 말하는 이유다.
   *
   * ⚠️ 단위 보정은 **수집기 쪽에 있다**(fetch_us_13f.py). 클라먼·드러켄밀러처럼 천 달러로
   *    신고하는 곳이 있어, 두 분기 중 한쪽만 보정되면 이 증감이 +161,142% 가 된다.
   */
  priorAum: number;
  usdKrw: number | null;
  holdings: ManagerHolding[];
  /**
   * 이번 분기에 아예 없어진 종목. holdings 에는 안 들어 있어 따로 낸다.
   * `weight` 는 **직전 분기** 합계에서 차지하던 몫이다 — 지금 합계로 나누면 뜻이 없다.
   */
  exited: { ticker: string; name: string; value: number; weight: number; inKadera: boolean }[];
};

/** 표에 없는 날을 0 으로 메운다. 안 메우면 막대가 주말을 건너뛰어 추이가 거짓말한다. */
function fillDays(rows: MentionPoint[], end: string, days: number): MentionPoint[] {
  const have = new Map(rows.map((r) => [r.date, r]));
  const out: MentionPoint[] = [];
  const d = new Date(`${end}T00:00:00Z`);
  for (let i = days - 1; i >= 0; i--) {
    const t = new Date(d);
    t.setUTCDate(t.getUTCDate() - i);
    const key = t.toISOString().slice(0, 10);
    out.push(have.get(key) ?? { date: key, mentions: 0, channels: 0 });
  }
  return out;
}

/**
 * 운용사별 최신·직전 분기를 가른다.
 *
 * ⚠️ 전체 최신 분기로 자르면 **제출이 늦는 곳이 통째로 빠진다**(퍼싱 스퀘어가 한 분기
 * 늦다). 반드시 그 운용사가 낸 분기 안에서 고른다.
 */
function quartersOf(dates: string[]): { latest: string | null; prior: string | null } {
  const q = [...new Set(dates)].sort((a, b) => b.localeCompare(a));
  return { latest: q[0] ?? null, prior: q[1] ?? null };
}

export const getStockDetail = cache(async (rawTicker: string, rangeKey?: string): Promise<StockDetail | null> => {
  const ticker = rawTicker.toUpperCase();
  const years = yearsOf(rangeKey);
  const db = getSupabaseAdmin();
  if (!db) return null;

  const [stockRows, mentionRows, holdingRows, managerRows, congressRows, insiderRows, consensusRows, actionRows] =
    await Promise.all([
    db.from("us_stocks").select("ticker,name_ko,name_en").eq("ticker", ticker).limit(1),
    fetchAllRows<{ date: string; mention_count: number | null; channel_count: number | null }>(
      "date",
      () => db.from("telegram_us_stock_daily").select("date,mention_count,channel_count").eq("ticker", ticker),
      { onError: (e) => console.error("[insider/stock] 언급 추이 조회 실패", e) },
    ),
    fetchAllRows<{ cik: number; shares: number | null; value: number | null; report_date: string }>(
      "cik",
      () => db.from("us_manager_holding").select("cik,shares,value,report_date").eq("ticker", ticker),
      { onError: (e) => console.error("[insider/stock] 거물 보유 조회 실패", e) },
    ),
    fetchAllRows<{ cik: number; person: string; firm: string }>(
      "cik",
      () => db.from("us_manager").select("cik,person,firm"),
      { onError: (e) => console.error("[insider/stock] 거물 명단 조회 실패", e) },
    ),
    fetchAllRows<{
      member: string;
      state_dst: string | null;
      transaction_type: string | null;
      transaction_date: string | null;
      filed_date: string;
      amount_low: number | null;
      amount_high: number | null;
    }>(
      "doc_id",
      () =>
        db
          .from("us_congress_trade")
          .select("doc_id,member,state_dst,transaction_type,transaction_date,filed_date,amount_low,amount_high")
          .eq("ticker", ticker),
      { onError: (e) => console.error("[insider/stock] 의원 신고 조회 실패", e) },
    ),
    fetchAllRows<{
      owner_name: string | null;
      owner_title: string | null;
      transaction_code: string | null;
      acquired_disposed: string | null;
      shares: number | null;
      price: number | null;
      transaction_date: string | null;
      filed_date: string;
      source_url: string | null;
    }>(
      "seq",
      () =>
        db
          .from("us_insider_txn")
          .select("accession_no,seq,owner_name,owner_title,transaction_code,acquired_disposed,shares,price,transaction_date,filed_date,source_url")
          .eq("ticker", ticker)
          .order("accession_no"),
      { onError: (e) => console.error("[insider/stock] 임원 신고 조회 실패", e) },
    ),
    // ⚠️ 가장 최근에 받은 한 줄만 쓴다. 추이는 쌓이고 있지만 지금 카드는 현재만 낸다 —
    //    받은 날짜별로 여러 줄이 있으므로 정렬 없이 집으면 옛날 값이 걸린다.
    db
      .from("us_analyst_consensus")
      .select("consensus,analyst_count,strong_buy,buy,hold,sell,strong_sell,target_avg,target_low,target_high,target_count,as_of_date")
      .eq("ticker", ticker)
      .order("as_of_date", { ascending: false })
      .limit(1),
    /**
     * ⚠️ 상한이 두 군데 있고 뜻이 다르다.
     *
     *   수집(`KEEP_ACTIONS = 5`)  한 번 방문할 때 원천에서 **가져오는** 양. 약관의
     *                              "발췌"를 지키는 자리라 여기를 늘리면 안 된다.
     *   여기(30)                   우리가 날마다 쌓아 온 것 중 **보여주는** 양. 매일
     *                              새 의견이 더해지므로 표는 계속 자란다.
     *
     * ⚠️ 처음엔 여기도 5 였다. 그러면 '더 보기'가 영영 안 뜬다 — 하루치만 보이니까.
     */
    db
      .from("us_analyst_action")
      .select("action_date,analyst,firm,rating_new,action,target_now,target_old")
      .eq("ticker", ticker)
      .order("action_date", { ascending: false })
      .limit(30),
  ]);

  // 어느 축에도 흔적이 없으면 우리가 아는 종목이 아니다. 빈 화면 대신 404 를 준다.
  const known =
    (stockRows.data?.length ?? 0) > 0 ||
    mentionRows.length > 0 ||
    holdingRows.length > 0 ||
    congressRows.length > 0 ||
    insiderRows.length > 0;
  if (!known) return null;

  const s = stockRows.data?.[0];
  const name = displayName(ticker, s?.name_ko || s?.name_en || null);

  const trendRaw: MentionPoint[] = mentionRows.map((m) => ({
    date: m.date,
    mentions: m.mention_count ?? 0,
    channels: m.channel_count ?? 0,
  }));
  const lastDate = trendRaw.length ? trendRaw[trendRaw.length - 1].date : null;
  const trend = lastDate ? fillDays(trendRaw, lastDate, MENTION_TREND_DAYS) : [];
  const today = trend.length ? trend[trend.length - 1] : null;

  // 거물별 최신 분기의 보유만 남기고, 직전 분기와 견줘 움직임을 붙인다.
  const managerOf = new Map(managerRows.map((m) => [m.cik, m]));
  const byCik = new Map<number, typeof holdingRows>();
  for (const h of holdingRows) byCik.set(h.cik, [...(byCik.get(h.cik) ?? []), h]);

  // 비중의 분모 — 그 운용사의 **전체** 보유 합계. 종목 하나만 받아서는 못 구한다.
  const totals = await fetchAllRows<{ cik: number; value: number | null; report_date: string }>(
    "cik",
    () => db.from("us_manager_holding").select("cik,value,report_date"),
    { onError: (e) => console.error("[insider/stock] 비중 분모 조회 실패", e) },
  );
  const aumOf = new Map<string, number>();
  for (const t of totals) aumOf.set(`${t.cik}|${t.report_date}`, (aumOf.get(`${t.cik}|${t.report_date}`) ?? 0) + (t.value ?? 0));

  const holders: StockHolder[] = [];
  for (const [cik, rows] of byCik) {
    const m = managerOf.get(cik);
    if (!m) continue;
    const { latest, prior } = quartersOf(rows.map((r) => r.report_date));
    if (!latest) continue;
    const now = rows.find((r) => r.report_date === latest);
    if (!now) continue;
    const before = prior ? rows.find((r) => r.report_date === prior) : undefined;
    // ⚠️ 판정은 **주식 수**로 한다. 금액은 주가가 움직여도 변해서, 한 주도 안 사고
    //    늘어난 것처럼 보인다.
    const move: StockHolder["move"] = !prior
      ? null
      : !before
        ? "new"
        : (now.shares ?? 0) > (before.shares ?? 0)
          ? "add"
          : (now.shares ?? 0) < (before.shares ?? 0)
            ? "trim"
            : "hold";
    const aum = aumOf.get(`${cik}|${latest}`) ?? 0;
    const was = before?.shares ?? 0;
    holders.push({
      cik,
      person: m.person,
      firm: m.firm,
      shares: now.shares ?? 0,
      value: now.value ?? 0,
      weight: aum ? ((now.value ?? 0) / aum) * 100 : 0,
      move,
      // 인물 상세(`getManagerDetail`)와 **같은 식**이다. 한쪽만 고치면 같은 보유가
      // 두 화면에서 다른 증감률로 뜬다.
      sharesChange: before && was ? (((now.shares ?? 0) - was) / was) * 100 : null,
      reportDate: latest,
    });
  }
  holders.sort((a, b) => b.value - a.value);

  const [quotes, fx, history] = await Promise.all([
    usQuotes([ticker]),
    getUsdKrw(),
    /**
     * ⚠️ 차트가 3개월이어도 **1년보다 넉넉히 받는다** — 52주 위치와 기간 수익률이 그
     *    위에 선다. 요청은 한 번이고, 차트는 필요한 만큼 잘라 쓴다.
     *
     * ⚠️⚠️ 1.15 인 이유. 딱 1 로 두면 **'1년' 수익률이 조용히 사라진다.** 1년 전
     *    가격을 찾으려면 그보다 앞선 봉이 있어야 하는데 자료가 정확히 1년치라 첫 봉이
     *    곧 그 시점이고, 게다가 그날이 주말·휴일이면 기준 봉 자체가 없다. 실제로 기본
     *    창(6개월)에서 1년 칸이 안 나왔다(2026-08-25). 두 달쯤 여유를 두면 경계가
     *    사라진다 — 야후 왕복은 한 번 그대로다.
     */
    fetchDailyHistory(ticker, Math.max(years, 1.15)).catch(() => null),
  ]);
  const q = quotes.get(ticker);
  const full = history ?? [];

  // 차트가 쓸 구간만 자른다.
  const from = new Date();
  from.setUTCDate(from.getUTCDate() - Math.round(years * 365));
  const fromIso = from.toISOString().slice(0, 10);
  // ⚠️ `years >= 1 ? full : …` 이었다. 받는 양이 1년을 넘게 되면서 그러면 1년 창에
  //    1년 넘는 봉이 실린다 — 창 길이로 늘 자른다.
  const bars = full.filter((b) => b.date >= fromIso);
  const first = bars.length ? bars[0].date : null;

  // ── 52주 위치와 기간 수익률 ─────────────────────────────────────
  const yearAgo = new Date();
  yearAgo.setUTCFullYear(yearAgo.getUTCFullYear() - 1);
  const y1 = full.filter((b) => b.date >= yearAgo.toISOString().slice(0, 10));
  const last = q?.price ?? (full.length ? full[full.length - 1].close : null);
  const week52 =
    y1.length > 1 && last != null
      ? (() => {
          const low = Math.min(...y1.map((b) => b.close));
          const high = Math.max(...y1.map((b) => b.close));
          // ⚠️ 오늘 값이 1년 범위를 벗어날 수 있다(신고가·신저가). 0~100 으로 가둔다.
          const pos = high > low ? Math.min(100, Math.max(0, ((last - low) / (high - low)) * 100)) : 50;
          return { low, high, position: pos };
        })()
      : null;

  // ⚠️ 자료가 모자란 구간은 **아예 안 낸다.** 0%로 채우면 "안 움직였다"는 사실처럼 읽힌다.
  const backAt = (days: number) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - days);
    const iso = d.toISOString().slice(0, 10);
    // ⚠️ 판정은 **자료가 그 시점까지 닿느냐**다. 예전엔 "찾은 봉이 첫 봉보다 뒤냐"로
    //    대신 봤는데, 그건 경계에서 늘 거짓이라 가장 긴 구간을 통째로 삼켰다.
    if (!full.length || full[0].date > iso) return null;
    const hit = [...full].reverse().find((b) => b.date <= iso);
    return hit ? hit.close : null;
  };
  const returns = last
    ? ([
        // ⭐ 차트 창과 무관하게 늘 같은 셋이다. 창을 3개월로 줄였다고 '1년'이 사라지면
        //   같은 자리가 화면마다 다른 것을 뜻하게 된다(52주 위치와 같은 규칙).
        // ⭐ 상장한 지 얼마 안 된 종목은 닿지 않는 칸이 저절로 빠진다 — 0% 로 채우지
        //   않는다. 그게 "안 움직였다"는 사실처럼 읽히기 때문이다.
        // ⛔ 6개월을 다시 넣지 말 것. 넣어 봤는데 넷은 히어로 왼쪽 칸(203px)에 한 줄로
        //   못 들어가 2×2 가 되고, 그 두 줄이 어색했다(2026-08-25). 셋이 한 줄이다.
        { label: "1개월", days: 30 },
        { label: "3개월", days: 91 },
        { label: "1년", days: 365 },
      ]
        .map((r) => {
          const base = backAt(r.days);
          return base ? { label: r.label, pct: ((last - base) / base) * 100 } : null;
        })
        .filter(Boolean) as { label: string; pct: number }[])
    : [];

  // ── 차트 마커 ────────────────────────────────────────────────────
  // ⚠️ 창 밖(차트 시작 전) 매매는 버린다. 남겨 두면 차트 왼쪽 끝에 몰려 붙는다.
  // ⚠️ 매매일이 없으면 접수일로 떨어진다 — 임원 신고는 매매일이 늘 있지만 의원 쪽은
  //    비는 건이 있다.
  const markOf = new Map<string, TradeMark>();
  const addMark = (
    date: string | null,
    side: "buy" | "sell",
    who: TradeMark["who"],
    name: string | null,
    qty?: { shares?: number | null; low?: number | null; high?: number | null },
  ) => {
    if (!date || (first && date < first)) return;
    const key = `${date}|${side}|${who}`;
    const m = markOf.get(key) ?? { date, side, who, count: 0, names: [], shares: null, low: null, high: null };
    m.count += 1;
    if (name && !m.names.includes(name)) m.names.push(name);
    // ⚠️ null 과 0 을 가른다. 원천이 안 준 것(null)은 끝까지 null 로 남아야 화면이
    //    "0주"라는 없는 말을 안 한다.
    if (qty?.shares != null) m.shares = (m.shares ?? 0) + qty.shares;
    if (qty?.low != null) m.low = (m.low ?? 0) + qty.low;
    if (qty?.high != null) m.high = (m.high ?? 0) + qty.high;
    markOf.set(key, m);
  };
  for (const t of insiderRows) {
    // ⭐ 장내 매수(P)·장내 매도(S)만 찍는다. 옵션 행사·세금 원천징수는 매매가 아니라
    //    보상 제도에 딸린 기계적 흐름이라, 찍으면 차트가 "임원이 계속 팔았다"고 거짓말한다.
    const qty = { shares: t.shares };
    if (t.transaction_code === "P") addMark(t.transaction_date ?? t.filed_date, "buy", "insider", t.owner_name, qty);
    else if (t.transaction_code === "S") addMark(t.transaction_date ?? t.filed_date, "sell", "insider", t.owner_name, qty);
  }
  for (const c of congressRows) {
    // ⚠️⚠️ `transaction_type` 은 **한 글자**다 — `P`(매수) · `S`(매도) · `E`(교환).
    //    처음에 `/purchase|sale/i` 로 걸었더니 **하나도 안 맞아 마커 16개가 조용히
    //    사라졌다.** 에러도 안 난다. 메인 데이터층(insider-data.ts)이 이미 한 글자로
    //    비교하고 있었으니 같은 규칙을 쓴다.
    const qty = { low: c.amount_low, high: c.amount_high };
    if (c.transaction_type === "P") addMark(c.transaction_date ?? c.filed_date, "buy", "congress", c.member, qty);
    else if (c.transaction_type === "S") addMark(c.transaction_date ?? c.filed_date, "sell", "congress", c.member, qty);
  }
  // ── 거물 마커: 분기 경계마다 늘린 곳 / 줄인 곳 ─────────────────────
  // ⚠️ 13F 에는 매매일이 없다. 분기말에 찍고 "그 분기 사이에 이만큼 바뀌었다"로 읽는다.
  const qs = [...new Set(holdingRows.map((h) => h.report_date))].sort();
  for (let i = 1; i < qs.length; i++) {
    const cur = new Map(holdingRows.filter((h) => h.report_date === qs[i]).map((h) => [h.cik, h]));
    const prev = new Map(holdingRows.filter((h) => h.report_date === qs[i - 1]).map((h) => [h.cik, h]));
    for (const cik of new Set([...cur.keys(), ...prev.keys()])) {
      const m = managerOf.get(cik);
      if (!m) continue;
      const a = cur.get(cik);
      const b = prev.get(cik);
      // 판정은 주식 수로. 금액은 주가가 움직여도 변한다.
      if (a && !b) addMark(qs[i], "buy", "manager", m.person);
      else if (!a && b) addMark(qs[i], "sell", "manager", m.person);
      else if (a && b && (a.shares ?? 0) > (b.shares ?? 0)) addMark(qs[i], "buy", "manager", m.person);
      else if (a && b && (a.shares ?? 0) < (b.shares ?? 0)) addMark(qs[i], "sell", "manager", m.person);
    }
  }
  const marks = [...markOf.values()].sort((a, b) => a.date.localeCompare(b.date));

  // 애널리스트 컨센서스. 등급도 목표가도 없으면 커버리지가 없는 것이라 카드를 안 그린다.
  const c = consensusRows.data?.[0];
  const consensus: AnalystConsensus | null =
    c && (c.analyst_count != null || c.target_avg != null)
      ? {
          consensus: c.consensus ?? null,
          analystCount: c.analyst_count ?? null,
          strongBuy: c.strong_buy ?? null,
          buy: c.buy ?? null,
          hold: c.hold ?? null,
          sell: c.sell ?? null,
          strongSell: c.strong_sell ?? null,
          targetAvg: c.target_avg ?? null,
          targetLow: c.target_low ?? null,
          targetHigh: c.target_high ?? null,
          targetCount: c.target_count ?? null,
          asOf: c.as_of_date,
        }
      : null;

  const analystActions: AnalystAction[] = (actionRows.data ?? []).map((a) => ({
    date: a.action_date,
    analyst: a.analyst,
    firm: a.firm,
    rating: a.rating_new ?? null,
    action: a.action ?? null,
    targetNow: a.target_now ?? null,
    targetOld: a.target_old ?? null,
  }));

  return {
    ticker,
    name,
    price: q?.price ?? null,
    changeRate: q?.changeRate ?? null,
    usdKrw: fx?.now ?? null,
    trend,
    mentionsToday: today?.mentions ?? 0,
    channelsToday: today?.channels ?? 0,
    mentionDate: lastDate,
    holders,
    managerCount: managerRows.length,
    bars,
    week52,
    returns,
    marks,
    consensus,
    analystActions,
    congress: congressRows
      .map((c) => ({
        member: c.member,
        stateDst: c.state_dst,
        kind: c.transaction_type,
        transactionDate: c.transaction_date,
        filedDate: c.filed_date,
        amountLow: c.amount_low,
        amountHigh: c.amount_high,
      }))
      // 실제 매매일 기준 최신 순. 접수일로 세우면 같은 날 무더기가 뭉친다.
      .sort((a, b) => (b.transactionDate ?? b.filedDate).localeCompare(a.transactionDate ?? a.filedDate)),
    insiders: insiderRows
      .map((i) => ({
        ownerName: i.owner_name,
        ownerTitle: i.owner_title,
        code: i.transaction_code,
        acquiredDisposed: i.acquired_disposed,
        shares: i.shares,
        price: i.price,
        value: i.shares && i.price ? i.shares * i.price : null,
        filedDate: i.filed_date,
        sourceUrl: i.source_url,
      }))
      .sort((a, b) => b.filedDate.localeCompare(a.filedDate) || (b.value ?? 0) - (a.value ?? 0)),
  };
});

export const getManagerDetail = cache(async (cik: number): Promise<ManagerDetail | null> => {
  const db = getSupabaseAdmin();
  if (!db) return null;

  const [managerRows, holdingRows, mentionRows] = await Promise.all([
    db.from("us_manager").select("cik,person,firm").eq("cik", cik).limit(1),
    fetchAllRows<{ ticker: string; shares: number | null; value: number | null; report_date: string }>(
      "ticker",
      () => db.from("us_manager_holding").select("ticker,shares,value,report_date").eq("cik", cik),
      { onError: (e) => console.error("[insider/investor] 보유 조회 실패", e) },
    ),
    fetchAllRows<{ ticker: string; date: string }>(
      "ticker",
      () => db.from("telegram_us_stock_daily").select("ticker,date"),
      { onError: (e) => console.error("[insider/investor] 카더라 종목 조회 실패", e) },
    ),
  ]);

  const m = managerRows.data?.[0];
  if (!m) return null;

  const { latest, prior } = quartersOf(holdingRows.map((h) => h.report_date));
  const now = holdingRows.filter((h) => h.report_date === latest);
  const before = new Map(holdingRows.filter((h) => h.report_date === prior).map((h) => [h.ticker, h]));
  const aum = now.reduce((s, h) => s + (h.value ?? 0), 0);

  // 카더라에 **한 번이라도** 오른 종목. 하루치로 보면 대부분 빠져서 표시가 뜻을 잃는다.
  const kadera = new Set(mentionRows.map((r) => r.ticker));
  const nameOf = (t: string) => displayName(t, null);

  const holdings: ManagerHolding[] = now
    .map((h) => {
      const b = before.get(h.ticker);
      const shares = h.shares ?? 0;
      const was = b?.shares ?? 0;
      const move: ManagerHolding["move"] = !prior ? null : !b ? "new" : shares > was ? "add" : shares < was ? "trim" : "hold";
      return {
        ticker: h.ticker,
        name: nameOf(h.ticker),
        shares,
        value: h.value ?? 0,
        weight: aum ? ((h.value ?? 0) / aum) * 100 : 0,
        move,
        sharesChange: b && was ? ((shares - was) / was) * 100 : null,
        inKadera: kadera.has(h.ticker),
      };
    })
    .sort((a, b) => b.value - a.value);

  const nowSet = new Set(now.map((h) => h.ticker));
  // ⭐ 정리한 자리가 **얼마나 큰 자리였는지**를 함께 낸다. 금액만으로는 그 사람 규모를
  //    모르면 크기를 못 가늠한다 — "$2.6B 정리"보다 "직전 분기 비중 4.1% 를 통째로"가
  //    더 많은 말을 한다. 분모는 이번 분기가 아니라 **직전 분기** 합계여야 한다.
  const priorAum = [...before.values()].reduce((s, h) => s + (h.value ?? 0), 0);
  const exited = [...before.values()]
    .filter((h) => !nowSet.has(h.ticker))
    .map((h) => ({
      ticker: h.ticker,
      name: nameOf(h.ticker),
      value: h.value ?? 0,
      weight: priorAum ? ((h.value ?? 0) / priorAum) * 100 : 0,
      inKadera: kadera.has(h.ticker),
    }))
    .sort((a, b) => b.value - a.value);

  const fx = await getUsdKrw();

  return {
    cik,
    person: m.person,
    firm: m.firm,
    reportDate: latest,
    priorDate: prior,
    aum,
    priorAum,
    usdKrw: fx?.now ?? null,
    holdings,
    exited,
  };
});
