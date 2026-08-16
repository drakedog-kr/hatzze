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
  /**
   * 달마다 접은 산 것·판 것. 이미 받아 둔 일별을 접기만 하므로 질의가 안 는다.
   *
   * ⭐ 화면은 이 둘을 **막대 두 개로만** 그린다. '순매수'도 '평소의 %'도 안 쓴다 —
   * 파생 개념은 매번 각주로 떠받쳐야 했고, 각주가 필요하다는 것 자체가 안 직관적이라는
   * 증거였다(Hun 지적). 산 것과 판 것은 그 자체로 설명이 필요 없다.
   */
  months: { month: string; buy: number; sell: number }[];
  /**
   * 요즘(최근 20영업일)이 평소의 몇 %인가.
   *
   * ⭐ '평소'는 **받아 둔 구간 전체(약 2년)의 하루 중앙값**이다. 고정 창이라 시간이
   * 지나도 값이 다시 안 바뀐다. ±60일 창으로 정규화하던 앞 판은 최근 날짜의 뒤쪽
   * 절반이 없어서 **65%가 나중에 5%p 넘게 달라졌다**(262표본 실측).
   *
   * 이미 받아 둔 일별을 접기만 하므로 질의가 안 는다.
   */
  vsUsual: { buy: number; sell: number; buyCount: number };
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

  const byMonth = new Map<string, { month: string; buy: number; sell: number }>();
  for (const d of days) {
    const key = d.date.slice(0, 7);
    const slot = byMonth.get(key) ?? { month: key, buy: 0, sell: 0 };
    slot.buy += d.buy;
    slot.sell += d.sell;
    byMonth.set(key, slot);
  }

  const med = (xs: number[]) => {
    const v = xs.filter((x) => x > 0).sort((a, b) => a - b);
    return v.length ? v[Math.floor(v.length / 2)] : 0;
  };
  const last20 = days.slice(-20);
  const ratio = (pick: (d: CalendarDay) => number) => {
    const base = med(days.map(pick));
    return base ? (med(last20.map(pick)) / base) * 100 : 100;
  };

  return {
    asOf,
    asOfMonth: asOf.slice(0, 7),
    days,
    vsUsual: {
      buy: ratio((d) => d.buy),
      sell: ratio((d) => d.sell),
      buyCount: ratio((d) => d.buyCount),
    },
    months: [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)),
    firstMonth: days[0].date.slice(0, 7),
    lastMonth: asOf.slice(0, 7),
    scale,
  };
}
