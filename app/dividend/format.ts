// 원·달러·퍼센트 서식. DividendCalculator.tsx 에서 그대로 옮겨 왔다(store.ts 머리말 참고).

import { type StockLite } from "./types";

/* ── 표기 ─────────────────────────────────────────────────────────── */
export const won = (v: number) => `${Math.round(v).toLocaleString("ko-KR")}원`;

/** 큰 금액은 억·만으로 줄인다. 슬라이더 값처럼 딱 떨어지는 수에만 쓴다. */
export function wonShort(v: number): string {
  if (v >= 1e8) {
    const eok = Math.floor(v / 1e8);
    const man = Math.round((v - eok * 1e8) / 1e4);
    return man ? `${eok}억 ${man.toLocaleString("ko-KR")}만원` : `${eok}억원`;
  }
  if (v >= 1e4 && v % 1e4 === 0) return `${(v / 1e4).toLocaleString("ko-KR")}만원`;
  return won(v);
}

/** 달력 칸의 금액 — 열두 칸이라 자리가 좁다. 백만 원부터는 만 단위로 줄인다(7,439,641원 → 744만원). */
export const wonCal = (v: number) => (v >= 1e8 ? `${(v / 1e8).toFixed(1)}억원` : v >= 1e6 ? `${Math.round(v / 1e4).toLocaleString("ko-KR")}만원` : won(v));

export const usd = (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** 그 종목의 돈 단위로. 미국은 달러, 국내는 원. */
export const money = (v: number, s: StockLite) => (s.currency === "USD" ? usd(v) : won(v));

export const pct = (v: number) => `${v.toFixed(2)}%`;
