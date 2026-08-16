import { getSupabaseServer } from "@/lib/supabase-server";

/**
 * 달력 히어로가 쓰는 층 — **그날 실제로 사고판 값**.
 *
 * ## ⚠️⚠️ 칸은 사실, 띠는 경향. 섞으면 거짓말이 된다
 *
 * "구글 캘린더처럼 날짜마다 역대 성향을 칠하자"가 첫 안이었는데 못 쓴다. 2015~2026 을
 * 날짜(월-일)별로 접으면 **한 날짜의 표본이 중앙값 8개**뿐이고, 가장 세게 나온 날짜
 * 셋이 전부 휴장 자국이었다(11-12 매수 0.00 · 01-02 매수 0.02 · 12-26 매수 0.02).
 * 자세한 실측은 `CALENDAR_WINDOWS` 머리말에 있다.
 *
 * 그래서 날짜 칸에는 **그날의 실제 결제 금액**만 넣는다. 32년치 실측이라 추정이 아니고,
 * 표본 문제도 없다. 다년 집계로 잰 구간(`CALENDAR_WINDOWS`)은 종일 일정처럼 위에
 * 띠로만 얹는다.
 *
 * ## 왜 여러 달을 한 번에 받나
 *
 * 달을 넘길 때마다 서버를 왕복하면 클릭이 굼떠 보인다. 하루 1행이라 24개월이 500행
 * 남짓이므로 한 번에 받아 클라이언트가 그 안에서 넘긴다. 그보다 뒤로 가려면 왕복이
 * 필요한데, 지금은 화살표를 막는다(1994년까지 있는 표라 나중에 열 수 있다).
 */

/** 한 번에 받아 두는 개월 수. 클라이언트가 이 안에서 달을 넘긴다. */
const MONTHS = 24;

export type CalendarDay = {
  /** 결제일. 거래일보다 1영업일 늦다. */
  date: string;
  buy: number;
  sell: number;
  buyCount: number;
  sellCount: number;
  /** 순매수. 칸의 색을 정한다. */
  net: number;
};

/** 32년 기록 하나. 날짜와 값, 그리고 그 값이 무엇인지. */
export type CalendarRecord = { date: string; value: number };

/**
 * 32년치에서 뽑은 기록들. 달력이 든 24개월 **밖**에도 있을 수 있다.
 *
 * ## ⚠️⚠️ 비율로 뽑으면 전부 1999~2005년이 나온다
 *
 * "그 시절 평소 대비 몇 배"로 특별한 날을 고르려 했다. 두 가지로 재 봤는데 둘 다 못 쓴다.
 *
 *   - 앞 250거래일 중앙값 대비 → 1위 1999-05-31 이 **×11,785**. 그 무렵 하루 매매가
 *     수천 달러라 분모가 0에 가깝다. 상위 12개가 전부 1999~2005년이었다.
 *   - 앞뒤 60거래일 중앙값 대비(추세를 뺀 창) → 1위 2018-01-19 ×4.11, 순매수 상위
 *     10개 중 **9개가 2017년 10월**. 여전히 분모가 작던 시절만 골라낸다.
 *
 * 게다가 앞 창은 **추세와 사건을 섞는다**. 2020년 3월 코로나 주간이 ×3.8~5.4 로 뜨는데,
 * 그건 그 주가 특별해서가 아니라 분모가 2019년(하루 $117M)이고 2020년 평균은 $680M
 * 이어서다. 정작 그 주는 2020년 평균에도 못 미쳤다.
 *
 * 그래서 **원값 기록만 쓴다.** 시장이 32년간 계속 커졌으니 기록은 대체로 최근에 몰리는데,
 * 그게 사실이다. 1994년의 하루와 2026년의 하루를 억지로 같은 자로 재지 않는다.
 *
 * ## 순매수 기록을 정렬 없이 정확히 뽑는 법
 *
 * PostgREST 는 식으로 정렬하지 못한다 — 순매수는 컬럼이 아니라 `buy − sell` 이다.
 * 전량(7,059행)을 훑는 대신 **상한을 아는 성질**을 쓴다.
 *
 *   순매수 > X 인 날은 반드시 매수액 > X 다(매도액은 음수가 될 수 없으므로).
 *
 * 받아 둔 24개월의 최대 순매수를 X 로 잡으면, 역대 최대 순매수일은 반드시
 * `buy_amount ≥ X` 인 날 안에 있다. 오늘 기준 그런 날이 332일뿐이라 한 번에 받는다.
 * 매도 쪽도 대칭이다(411일). 근사가 아니라 **정확한 답**이고, 전량 조회의 1/10 이다.
 */
export type SeohakRecords = {
  /** 역대 최대 순매수일. */
  topBuy: CalendarRecord;
  /** 역대 최대 순매도일. 값은 음수다. */
  topSell: CalendarRecord;
  /** 역대 최다 매수 건수일. 값은 금액이 아니라 **횟수**다. */
  busiest: CalendarRecord;
  /** 표의 첫 날. 값은 그날 순매수(1994-10-21 은 매수 1건뿐이다). */
  first: CalendarRecord;
};

export type SeohakCalendar = {
  /** 처음 펼칠 달(최신 결제일이 든 달). "YYYY-MM". */
  asOfMonth: string;
  asOf: string;
  days: CalendarDay[];
  /** 받아 둔 구간의 양 끝. 화살표를 언제 막을지 정한다. */
  firstMonth: string;
  lastMonth: string;
  /** 칸 색의 기준. 이 구간 순매수 절댓값의 상위 10% 값이다. */
  scale: number;
  /** 32년 기록. 뽑지 못하면 없다(카드가 통째로 빠진다). */
  records: SeohakRecords | null;
};

export async function getSeohakCalendar(): Promise<SeohakCalendar | null> {
  const db = getSupabaseServer();
  const { data: last, error: lastErr } = await db
    .from("seohak_settlement_daily")
    .select("settle_date")
    .eq("market_code", "US")
    .eq("security_type", "주식")
    .order("settle_date", { ascending: false })
    .limit(1);
  if (lastErr || !last?.length) return null;

  const asOf = last[0].settle_date as string;
  const from = new Date(`${asOf}T00:00:00Z`);
  from.setUTCMonth(from.getUTCMonth() - (MONTHS - 1));
  from.setUTCDate(1);
  const fromDate = from.toISOString().slice(0, 10);

  const days: CalendarDay[] = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await db
      .from("seohak_settlement_daily")
      .select("settle_date, buy_amount, sell_amount, buy_count, sell_count")
      .eq("market_code", "US")
      .eq("security_type", "주식")
      .gte("settle_date", fromDate)
      .order("settle_date", { ascending: true })
      .range(start, start + 999);
    if (error) break;
    const page = data ?? [];
    for (const r of page) {
      const buy = Number(r.buy_amount ?? 0);
      const sell = Number(r.sell_amount ?? 0);
      days.push({
        date: r.settle_date as string,
        buy,
        sell,
        buyCount: Number(r.buy_count ?? 0),
        sellCount: Number(r.sell_count ?? 0),
        net: buy - sell,
      });
    }
    if (page.length < 1000) break;
  }
  if (!days.length) return null;

  // 색 눈금은 최댓값이 아니라 **상위 10%** 로 잡는다. 하루 이상치에 눈금을 맞추면
  // 나머지 날이 전부 흐릿해진다(2021-12-27 에 매도/매수 1,780배인 날이 있었다).
  const sorted = days.map((d) => Math.abs(d.net)).sort((a, b) => a - b);
  const scale = sorted[Math.floor(sorted.length * 0.9)] || 1;

  return {
    asOf,
    asOfMonth: asOf.slice(0, 7),
    days,
    firstMonth: days[0].date.slice(0, 7),
    lastMonth: asOf.slice(0, 7),
    scale,
    records: await getRecords(days),
  };
}

/** 미국 주식만. 세 군데서 같은 걸 쓴다. */
const US_STOCK = { market_code: "US", security_type: "주식" } as const;

/**
 * 32년 기록 넷. 근거와 뽑는 법은 `SeohakRecords` 머리말에 있다.
 *
 * 쿼리 셋 중 둘은 **한 행짜리**(가장 바빴던 날 · 표의 첫 날)이고, 순매수·순매도만
 * 상한으로 좁힌 한 번의 조회로 함께 받는다.
 */
async function getRecords(loaded: CalendarDay[]): Promise<SeohakRecords | null> {
  const db = getSupabaseServer();

  // 좁히는 상한. 받아 둔 24개월의 최댓값이라 늘 실재하는 날의 값이고, 따라서
  // 역대 기록은 반드시 이 문턱 위에 있다.
  const capBuy = Math.max(...loaded.map((d) => d.net));
  const capSell = Math.max(...loaded.map((d) => -d.net));
  // ⚠️ 문턱이 0 이하면(24개월 내내 한 방향뿐이면) 조건이 표 전체를 뜻하게 된다.
  // 그런 달은 아직 없었지만, 그때는 기록 대신 아무것도 내지 않는다.
  if (!(capBuy > 0) || !(capSell > 0)) return null;

  // ⚠️ PostgREST 는 한 번에 1000행까지만 준다. 좁힌 집합이 오늘은 743일이지만 해마다
  // 자라니, 캡에 걸려 조용히 잘린 채 "역대 최대"를 말하는 일이 없도록 넘겨 받는다.
  const extPages = async () => {
    const out: { settle_date: string; buy_amount: number; sell_amount: number }[] = [];
    for (let start = 0; ; start += 1000) {
      const { data, error } = await db
        .from("seohak_settlement_daily")
        .select("settle_date, buy_amount, sell_amount")
        .match(US_STOCK)
        .or(`buy_amount.gte.${capBuy},sell_amount.gte.${capSell}`)
        .order("settle_date", { ascending: true })
        .range(start, start + 999);
      if (error) return out;
      const page = (data ?? []) as typeof out;
      out.push(...page);
      if (page.length < 1000) return out;
    }
  };

  const [ext, { data: busy }, { data: first }] = await Promise.all([
    extPages(),
    db
      .from("seohak_settlement_daily")
      .select("settle_date, buy_count")
      .match(US_STOCK)
      .order("buy_count", { ascending: false })
      .limit(1),
    db
      .from("seohak_settlement_daily")
      .select("settle_date, buy_amount, sell_amount")
      .match(US_STOCK)
      .order("settle_date", { ascending: true })
      .limit(1),
  ]);
  if (!ext.length || !busy?.length || !first?.length) return null;

  const nets = ext.map((r) => ({
    date: r.settle_date,
    value: Number(r.buy_amount ?? 0) - Number(r.sell_amount ?? 0),
  }));
  const topBuy = nets.reduce((a, b) => (b.value > a.value ? b : a));
  const topSell = nets.reduce((a, b) => (b.value < a.value ? b : a));

  return {
    topBuy,
    topSell,
    busiest: { date: busy[0].settle_date as string, value: Number(busy[0].buy_count ?? 0) },
    first: {
      date: first[0].settle_date as string,
      value: Number(first[0].buy_amount ?? 0) - Number(first[0].sell_amount ?? 0),
    },
  };
}
