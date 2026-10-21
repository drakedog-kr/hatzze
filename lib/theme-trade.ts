/* 테마 거래대금의 순수 셈 — 서버 전용 조회(lib/theme-page.ts · lib/us-theme-page.ts)에서 떼어 테스트한다(tests/theme-trade.test.ts). */
import { weekAgoDates } from "./theme-flow.ts";

/**
 * 테마 거래대금 — 테마 판세(`/theme` · `/theme/us`) 흐름 표의 '3일 평균 거래대금' 칸과 테마 상세 첫 줄 띠의 같은 칸.
 *
 * 종목 값은 표에 있고(국장 stock_price_daily.trade_value · 미장 us_stock_price_daily.trade_value — 마이그레이션 106),
 * 테마 합은 여기서 사전 종목으로 더한다. 국장은 KRX 거래대금(원), 미장은 야후 종가 × 거래량(달러)이다.
 *
 * ## 셈
 * - 최근 거래일 셋의 **하루 평균**. 합을 적으면 '35.7조'처럼 뉴스의 하루 거래대금과 다른 크기로 읽힌다.
 *   언급 점유율이 '최근 3일'이라 날 수를 맞췄다 — 언급은 달력 사흘, 거래대금은 거래일 사흘이다(주말엔 장이 없다).
 * - 변화는 그 사흘의 날마다 **정확히 1주 앞(같은 요일)** 인 거래일들의 하루 평균과 견준다. 언급 점유율의 '1주 전 대비'와
 *   같은 함수다(lib/theme-flow.ts weekAgoDates). 그 날이 휴장이면 빼고, 하나도 없으면 변화를 안 적는다.
 * - 시장 몫(테마 ÷ 시장 전체)이 아니라 금액의 변화다 — 미장은 시장 전체 거래대금이 없다. 그래서 시장 전체가 식은 주엔
 *   거의 모든 테마가 줄어든 쪽으로 선다(2026-10-21 운영자 판단 — 두 시장의 둘째 줄을 1주 전 대비로 맞춘다).
 * - 거래일은 표에 그날 행이 있는 날이다. 미장은 티커마다 따로 받아 하루가 덜 찰 수 있다 — 그날 행 수가 기간 최대의
 *   FULL_DAY_FRAC 에 못 미치면 거래일로 치지 않는다(덜 찬 날이 끼면 테마 합이 작게 나와 '줄었다'로 읽힌다).
 * - 최근 거래일이 셋이 안 되면(마이그레이션 106 직후) 칸을 비운다 — 머리가 '3일 평균'이다.
 */

/** 평균을 내는 최근 거래일 수 — 언급 점유율의 '최근 3일'(KADERA_WINDOW_DAYS)과 같은 날 수. */
export const TRADE_WINDOW = 3;
/** 읽어 오는 달력 일수 — 최근 거래일 셋과 그 1주 앞을 덮는다. 사흘 연휴(추석 · 설)가 끼어도 남게 넉넉히. */
export const TRADE_LOOKBACK_DAYS = 21;
/** 그날 행 수가 기간 중 가장 많은 날의 이 몫 미만이면 덜 찬 날로 본다. */
const FULL_DAY_FRAC = 0.8;

export type ThemeTrade = {
  /** 최근 거래일 셋의 하루 평균 거래대금(국장 원 · 미장 달러). */
  avg: number;
  /** 1주 전 같은 요일 거래일들의 하루 평균 대비 변화(0.12 = +12%). 견줄 날이 없으면 null. */
  change: number | null;
  /** 최근 창의 마지막 거래일(YYYY-MM-DD). */
  end: string;
  /** 최근 창 거래대금이 가장 큰 테마 종목 셋(이름 — 이름을 못 찾으면 열쇠). 거래대금 지도의 큰 칸 곁줄이 쓴다. */
  top: string[];
};

/** 표의 한 행 — key 는 국장 종목코드 · 미장 티커. */
export type TradeRow = { key: string; date: string; value: number | string | null };

/** 거래일(오래된→최신) — 값이 있는 행이 기간 최대의 FULL_DAY_FRAC 이상인 날. */
export function tradingDays(rows: TradeRow[]): string[] {
  const n = new Map<string, number>();
  for (const r of rows) if (r.value != null) n.set(r.date, (n.get(r.date) ?? 0) + 1);
  const max = Math.max(0, ...n.values());
  return [...n.entries()]
    .filter(([, c]) => c >= max * FULL_DAY_FRAC)
    .map(([d]) => d)
    .sort();
}

/** 거래대금 지도 곁줄에 세우는 종목 수 — 언급 지도 곁줄(언급 상위 셋)과 같은 수. */
const TOP_N = 3;

/**
 * 테마마다 거래대금. members 는 테마 → 종목 열쇠(코드 · 티커), nameOf 는 열쇠 → 이름(top 에 쓴다).
 * 최근 거래일이 셋이 안 되거나 테마 종목 값이 하나도 없으면 그 테마는 빠진다.
 */
export function themeTrades(rows: TradeRow[], members: Record<string, string[]>, nameOf?: (key: string) => string | undefined): Map<string, ThemeTrade> {
  const out = new Map<string, ThemeTrade>();
  const days = tradingDays(rows);
  if (days.length < TRADE_WINDOW) return out;
  const recent = days.slice(-TRADE_WINDOW);
  const prior = weekAgoDates(recent, days);
  const on = new Map<string, Map<string, number>>();
  for (const r of rows) {
    if (r.value == null) continue;
    const day = on.get(r.date) ?? new Map<string, number>();
    day.set(r.key, Number(r.value));
    on.set(r.date, day);
  }
  const avgOf = (dates: string[], keys: string[]) => {
    let sum = 0;
    let seen = false;
    for (const d of dates) {
      const day = on.get(d);
      for (const k of keys) {
        const v = day?.get(k);
        if (v == null) continue;
        sum += v;
        seen = true;
      }
    }
    return seen ? sum / dates.length : null;
  };
  const recentSum = (key: string) => recent.reduce((a, d) => a + (on.get(d)?.get(key) ?? 0), 0);
  for (const [theme, keys] of Object.entries(members)) {
    const avg = avgOf(recent, keys);
    if (avg == null) continue;
    const before = prior.length ? avgOf(prior, keys) : null;
    // 같은 값이면 열쇠 순 — 렌더마다 곁줄 차례가 흔들리지 않게.
    const top = [...new Set(keys)]
      .map((k) => [k, recentSum(k)] as const)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
      .slice(0, TOP_N)
      .map(([k]) => nameOf?.(k) ?? k);
    out.set(theme, { avg, change: before != null && before > 0 ? avg / before - 1 : null, end: recent[recent.length - 1], top });
  }
  return out;
}

/**
 * 거래대금 지도 칸 색 — 1주 전 대비 변화(%)의 단. 언급 지도(점유율 %p · 0.3 / 1 / 3)와 문턱이 다르다 — 금액의 변화라 폭이 크다.
 * 2026-10-21 국장 열 테마가 −40% ~ +60%, 미장이 −7% ~ +52% 였다. 5% 안은 '비슷', 15% · 40% 에서 한 단씩.
 * 클래스 이름은 언급 지도와 같은 색 단(kadera.css .hz-tm-tile.is-*)이라 범례 하나가 두 지도를 다 말한다.
 */
export function tradeTone(change: number | null): string {
  if (change == null) return "is-flat";
  const a = Math.abs(change);
  if (a < 0.05) return "is-flat";
  const step = a >= 0.4 ? 3 : a >= 0.15 ? 2 : 1;
  return change > 0 ? `is-up-${step}` : `is-down-${step}`;
}

/**
 * 금액 — 국장은 '11.9조' · '8,532억', 미장은 '1,023억 달러' · '1.2조 달러'(억 단위로 적어야 한눈에 읽힌다 — '$102.3B' 는 한 번 옮겨 읽어야 했다).
 * 1조부터 소수 한 자리, 그 아래는 억 정수(ETF 화면 fmtSize 와 같은 끊음).
 */
export function fmtTrade(v: number, market: "kr" | "us"): string {
  const unit = market === "us" ? " 달러" : "";
  const eok = v / 1e8;
  if (eok >= 10000) return `${(eok / 10000).toFixed(1)}조${unit}`;
  if (eok >= 1) return `${Math.round(eok).toLocaleString("ko-KR")}억${unit}`;
  return `1억${unit} 미만`;
}

/** 1주 전 대비 — '+12%' · '-23%'. 반올림해 0 이면 null(적지 않는다 — 점유율 칸이 0.05%p 아래를 안 적는 것과 같다). 색은 오름 빨강 · 내림 파랑. */
export function fmtTradeChange(change: number | null): { text: string; tone: "is-up" | "is-down" } | null {
  if (change == null) return null;
  const r = Math.round(change * 100);
  if (r === 0) return null;
  return { text: `${r > 0 ? "+" : "-"}${Math.abs(r).toLocaleString("ko-KR")}%`, tone: r > 0 ? "is-up" : "is-down" };
}
