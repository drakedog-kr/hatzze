import { getSupabaseServer } from "@/lib/supabase-server";

/**
 * 서학개미 해부도의 **일별 층** 데이터.
 *
 * 전부 `seohak_settlement_daily` 한 표에서 나온다(예탁결제원 결제 통계, 미국·주식만).
 * 결제일은 거래일보다 1영업일 늦다 — 휴장일 실측으로 확정한 값이다.
 *
 * ## 조회는 한 번, 카드는 일곱
 *
 * 카드마다 표를 읽지 않는다. 최근 구간을 한 번 받아 그 위에서 전부 계산한다. 이 표는
 * 32년 × 하루 25행이라 전량조회를 하면 예전에 Egress 를 태운 그 형태가 된다.
 *
 * 필요한 길이는 회전율(최근 1년)이 정하고, 정규화에 쓸 앞뒤 여유를 더해 **500영업일**을
 * 받는다. 미국·주식만 거르므로 하루 1행이라 500행이다.
 */

/**
 * ── 손으로 잰 상수들 ──────────────────────────────────────────────────────
 *
 * 아래 값은 32년 전 구간을 훑어야 나오는 것들이라 매 렌더에 계산하지 않는다. 그러려면
 * 전량조회가 필요한데 이 표는 25만 행이다. 값 자체는 해가 바뀌어도 거의 안 움직인다
 * (전부 수천 일 표본이다).
 *
 * ⚠️ **재보정할 때는 아래 근거 그대로 다시 재고 이 상수를 고칠 것.** 화면이 이 숫자를
 * 그대로 인용하므로, 코드와 실측이 갈리면 화면이 조용히 거짓말을 한다.
 */

/**
 * '매도 1건 ÷ 매수 1건' 의 역대 중앙값. 2018~2026 · 2,201일 · 20영업일 창.
 * 10~90분위는 1.054~1.431 이다. 오늘 값이 이 근처인지 벗어났는지가 카드의 뜻이라,
 * 기준선 없이 오늘 값만 보이면 "원래 그런 것"과 "지금 특이한 것"이 구분되지 않는다.
 */
export const SIZE_RATIO_TYPICAL = 1.21;

/** 사분면별 빈도. 2015~2026 · 2,929일 · 20영업일 창 · ±60일 중앙값으로 정규화. */
export const REGIME_SHARE: Record<string, number> = {
  "둘 다 늘었다": 39.8,
  "둘 다 줄었다": 37.9,
  "사자만 늘었다": 12.0,
  "팔자만 늘었다": 10.3,
};

/**
 * 달력 구간. 2015~2026 · 2,948일 · 추세 대비 배수의 중앙값.
 *
 * 여름(7~8월)과 네 마녀의 날은 1.0 근처(0.99~1.01)라 뺐다 — 있을 것 같았는데 없었다.
 * 신호가 있는 것만 남긴다.
 */
export { CALENDAR_WINDOWS, REACTIONS, windowsInMonth } from "./seohak-windows";


/** 추세 정규화 창의 한쪽 길이(영업일). ±60 = 약 반년. */
const NORM_HALF = 60;
/** 국면·심리를 재는 창. 5일은 13.3%의 날에 부호가 뒤집혀 잡음이고 60일은 최근 흐름을 놓친다. */
const WINDOW = 20;
/** 한 번에 받아 오는 영업일 수. 회전율 250 + 정규화 여유. */
const LOOKBACK = 500;

export type Settle = {
  date: string;
  buy: number;
  sell: number;
  buyCount: number;
  sellCount: number;
};

async function loadRecent(): Promise<Settle[]> {
  const rows: Settle[] = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await getSupabaseServer()
      .from("seohak_settlement_daily")
      .select("settle_date, buy_amount, sell_amount, buy_count, sell_count")
      .eq("market_code", "US")
      .eq("security_type", "주식")
      .order("settle_date", { ascending: false })
      .range(start, start + 999);
    if (error) throw new Error(`결제 통계 조회 실패: ${error.message}`);
    const page = data ?? [];
    for (const r of page) {
      rows.push({
        date: r.settle_date as string,
        buy: Number(r.buy_amount ?? 0),
        sell: Number(r.sell_amount ?? 0),
        buyCount: Number(r.buy_count ?? 0),
        sellCount: Number(r.sell_count ?? 0),
      });
    }
    if (page.length < 1000 || rows.length >= LOOKBACK) break;
  }
  // 내림차순으로 받아 왔으므로 되돌린다. 자료가 없는 날(휴일)은 애초에 행이 없다.
  return rows.slice(0, LOOKBACK).reverse().filter((r) => r.buy > 0);
}

/** 그 자리 값 ÷ 앞뒤 NORM_HALF 영업일의 중앙값. 규모가 32년간 수백 배 커져서 원자료로는 못 견준다. */
function detrend(values: number[], i: number): number | null {
  const w = values.slice(Math.max(0, i - NORM_HALF), i + NORM_HALF + 1).filter((v) => v > 0);
  if (!w.length) return null;
  const sorted = [...w].sort((a, b) => a - b);
  const mid = sorted[Math.floor(sorted.length / 2)];
  return mid ? values[i] / mid : null;
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

export type Quadrant = "둘 다 늘었다" | "사자만 늘었다" | "팔자만 늘었다" | "둘 다 줄었다";

export type SeohakDaily = {
  /** 최신 결제일. 거래일 기준으로는 그 하루 전이다. */
  asOf: string;
  today: Settle;
  /** 1건당 매수 금액(달러). */
  perTrade: number;

  /** ── 사분면 ── */
  regime: { name: Quadrant; buy: number; sell: number };
  /**
   * 최근 120영업일의 **실제 금액**. 배수가 아니라 원자료다.
   *
   * ⚠️⚠️ 앞서 화면은 `trail`(20일 창 중앙값의 배수)을 선으로 그렸는데 두 가지가 틀렸다.
   *  ① **모양이 없다.** 매수·매도는 둘 다 전체 활동량에 끌려 상관이 높은데, 거기에
   *     20일 중앙값을 씌우면 두 번 평활된 선이 되어 나란히 흐를 뿐이다.
   *  ② **나중에 값이 바뀐다.** 기준이 ±60영업일 중앙값이라 최근 날짜는 '뒤쪽 60일'이
   *     아직 없다. 실측(262표본)으로 **65%가 5%p 넘게** 바뀌고 10~90% 구간이
   *     −9.3 ~ +19.7%p 였다. 헤드라인 숫자가 나중에 뒤집히면 안 된다.
   *
   * 원자료 막대는 하루하루가 튀어 모양이 있고, 아래 `usual`(고정 창 중앙값)은
   * 시간이 지나도 다시 안 바뀐다.
   */
  recent: { date: string; buy: number; sell: number }[];
  /** '평소' — 받아 온 구간(약 2년) 일별 금액의 중앙값. 고정 창이라 값이 안 흔들린다. */
  usual: { buy: number; sell: number };
  /**
   * 최근 20영업일이 '평소'의 몇 %인가.
   *
   * ⚠️⚠️ **`regime` 과 기준이 다르다.** regime 은 ±60일 중앙값으로 정규화한 값이라
   * 최근 날짜에서 나중에 바뀐다(실측 65%가 5%p 초과). 화면이 그림에는 `usual` 선을
   * 긋고 옆 숫자는 regime 을 쓰면 **같은 '평소'라는 말이 두 기준을 가리킨다.**
   * 그래서 화면용 비율은 여기서 `usual` 하나로 낸다.
   */
  vsUsual: { buy: number; sell: number };

  /** ── 사자와 팔자의 결 ──
   *  비율만 두면 화면이 "75% × 113%" 같은 식을 쓰게 된다. 곱셈은 읽는 사람에게
   *  일을 시키는 것이라, 양쪽의 **실제 값**도 같이 담아 나란히 견주게 한다. */
  countRatio: number; // 매도건수 ÷ 매수건수. 1보다 작으면 사는 횟수가 더 많다
  sizeRatio: number; // 매도 1건 ÷ 매수 1건. 1보다 크면 파는 쪽이 큰 덩어리
  flow20: { buyCount: number; sellCount: number; buyPer: number; sellPer: number };

  /**
   * ── 새 돈 ──
   * `gross`(매수+매도)를 분모로 쓰면 "오간 돈의 5%"가 되는데, 매수와 매도를 더한 값은
   * 머릿속에 안 그려진다. **산 돈을 분모로** 두면 "산 것 중 새 돈이 얼마"가 되어
   * 한 문장으로 읽힌다. 둘 다 담아 두고 화면은 buy 쪽을 쓴다.
   */
  turnover: {
    days: number;
    buy: number;
    sell: number;
    gross: number;
    net: number;
    /** 순매수 ÷ 산 돈. "산 것 중 새로 들어온 몫". */
    newMoneyPct: number;
  };

  /** ── 오늘 몇 명 ── */
  countPercentile: number; // 받아 온 구간 안에서의 백분위
  countSpark: number[]; // 최근 60영업일 매수 건수

  /** ── 심리(사분면의 대각선) ── */
  sellBuy: number; // 20일 창 매도÷매수

  /** 오늘 매수 건수가 최근 60영업일 중앙값보다 몇 % 많은가(음수면 적다). */
  countVsUsual: number;
};

export async function getSeohakDaily(): Promise<SeohakDaily> {
  const rows = await loadRecent();
  if (rows.length < WINDOW + 1) throw new Error("일별 결제 자료가 부족합니다");

  const buys = rows.map((r) => r.buy);
  const sells = rows.map((r) => r.sell);
  const last = rows.length - 1;

  // 20일 창의 '추세 대비 배수'. 창 안 각 날을 정규화한 뒤 중앙값을 쓴다 — 합계로 내면
  // 하루 이상치가 창 전체를 끌고 간다(2021-12-27 에 매도/매수 1,780배인 날이 있었다).
  const windowRel = (values: number[], end: number) => {
    const out: number[] = [];
    for (let i = Math.max(0, end - WINDOW + 1); i <= end; i++) {
      const v = detrend(values, i);
      if (v !== null) out.push(v);
    }
    return median(out);
  };

  const relBuy = windowRel(buys, last);
  const relSell = windowRel(sells, last);
  const name: Quadrant =
    relBuy >= 1 && relSell >= 1
      ? "둘 다 늘었다"
      : relBuy >= 1
        ? "사자만 늘었다"
        : relSell >= 1
          ? "팔자만 늘었다"
          : "둘 다 줄었다";

  // 화면에 그릴 원자료. 120영업일이면 약 반년이라 계절 한 바퀴가 안 들어가도
  // "요즘"의 모양은 다 담긴다.
  const recent = rows.slice(-120).map((r) => ({ date: r.date, buy: r.buy, sell: r.sell }));
  const usual = { buy: median(buys), sell: median(sells) };
  const last20 = rows.slice(-WINDOW);
  const vsUsual = {
    buy: usual.buy ? (median(last20.map((r) => r.buy)) / usual.buy) * 100 : 100,
    sell: usual.sell ? (median(last20.map((r) => r.sell)) / usual.sell) * 100 : 100,
  };

  // 회전 — 받아 온 구간의 마지막 250영업일(약 1년).
  const yearFrom = Math.max(0, rows.length - 250);
  const year = rows.slice(yearFrom);
  const yearBuy = year.reduce((s, r) => s + r.buy, 0);
  const yearSell = year.reduce((s, r) => s + r.sell, 0);
  const grossSum = yearBuy + yearSell;
  const netSum = yearBuy - yearSell;

  // 매수 건수의 백분위. 받아 온 구간(약 2년) 안에서만 잰다 — 32년 전체로 재려면
  // 전량조회가 필요한데, 카드가 말하는 건 "요즘 대비 오늘"이라 이 창이면 충분하다.
  const counts = rows.map((r) => r.buyCount);
  const sortedCounts = [...counts].sort((a, b) => a - b);
  const rank = sortedCounts.filter((v) => v < counts[last]).length;

  const t = rows[last];
  const win20 = rows.slice(-WINDOW);

  return {
    asOf: t.date,
    today: t,
    perTrade: t.buyCount ? t.buy / t.buyCount : 0,
    regime: { name, buy: relBuy, sell: relSell },
    recent,
    usual,
    vsUsual,
    countRatio:
      win20.reduce((s, r) => s + r.sellCount, 0) / win20.reduce((s, r) => s + r.buyCount, 0),
    sizeRatio:
      win20.reduce((s, r) => s + r.sell, 0) /
      win20.reduce((s, r) => s + r.sellCount, 0) /
      (win20.reduce((s, r) => s + r.buy, 0) / win20.reduce((s, r) => s + r.buyCount, 0)),
    turnover: {
      days: year.length,
      buy: yearBuy,
      sell: yearSell,
      gross: grossSum,
      net: netSum,
      newMoneyPct: yearBuy ? (netSum / yearBuy) * 100 : 0,
    },
    flow20: {
      buyCount: win20.reduce((s, r) => s + r.buyCount, 0),
      sellCount: win20.reduce((s, r) => s + r.sellCount, 0),
      buyPer:
        win20.reduce((s, r) => s + r.buy, 0) / (win20.reduce((s, r) => s + r.buyCount, 0) || 1),
      sellPer:
        win20.reduce((s, r) => s + r.sell, 0) / (win20.reduce((s, r) => s + r.sellCount, 0) || 1),
    },
    countPercentile: (rank / counts.length) * 100,
    countVsUsual: (() => {
      const w = counts.slice(-60);
      const m = median(w);
      return m ? (counts[last] / m - 1) * 100 : 0;
    })(),
    countSpark: counts.slice(-60),
    sellBuy:
      win20.reduce((s, r) => s + r.sell, 0) / win20.reduce((s, r) => s + r.buy, 0),
  };
}
