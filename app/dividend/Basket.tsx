"use client";

// 성향별 바스켓 줄 오른쪽 숫자. 바스켓 카드(BasketSheet)는 v2 에서 표 + 읽기 칸(V2Baskets.tsx)으로 바꿔 걷었다(2026-10-03).

import { type BasketLite, type StockLite } from "./types";
import { pct } from "./format";
import { STREAK_CAP } from "./shared";

/** 바스켓 줄 오른쪽 숫자 — 성향마다 "왜 여기 들었나"를 말하는 값. */
export function basketMeta(meta: BasketLite["meta"], s: StockLite): string {
  switch (meta) {
    case "growth":
      // 담은 종목 알약과 같은 말('5년 연평균 +N%') — '연 86% 성장'과 두 이름이었다(2026-10-04 점검).
      return s.growth5 != null ? `5년 연평균 ${s.growth5 >= 0 ? "+" : "-"}${Math.abs(s.growth5).toFixed(0)}%` : "";
    case "streak":
      // 미국은 SEC 로 센 연속 연수가 19~20에서 막힌다 — 해마다 늘린 햇수(stockanalysis)가 있으면 그것.
      // 무엇이 몇 년인지까지 적는다 — 이름 아래 줄로 내리자(2026-10-04) '15년 넘게'만으로는 무엇이 15년인지 안 읽혔다.
      return s.growthYears != null ? `${s.growthYears}년 연속 늘림` : s.streak >= STREAK_CAP ? `${STREAK_CAP}년 넘게 연속 배당` : `${s.streak}년 연속 배당`;
    case "months":
      return s.pays.length ? `${[...new Set(s.pays.map(([m]) => m))].sort((a, b) => a - b).join("·")}월` : "";
    case "growthYears":
      return s.growthYears != null ? `${s.growthYears}년 연속 늘림` : "";
    case "payout":
      return s.payout ? `배당성향 ${Math.round(s.payout[1])}%` : "";
    case "septax":
      return `${s.yieldPct != null ? `${pct(s.yieldPct)} · ` : ""}배당성향 ${s.highDiv?.[1] != null ? Math.round(s.highDiv[1]) : "?"}%`;
    case "discount":
      // '보통주보다 25% 아래'는 무엇이 아래인지 안 읽혔다 — 가격이 싸다는 말(2026-10-05 점검). 맨 퍼센트엔 '수익률'을 붙인다.
      return s.discount != null ? `${s.yieldPct != null ? `수익률 ${pct(s.yieldPct)} · ` : ""}보통주보다 ${Math.round(s.discount)}% 쌈` : s.yieldPct != null ? `수익률 ${pct(s.yieldPct)}` : "";
    default:
      return s.yieldPct != null ? `수익률 ${pct(s.yieldPct)}` : "";
  }
}
