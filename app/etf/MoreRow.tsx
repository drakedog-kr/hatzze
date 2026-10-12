"use client";

import { useState } from "react";

/** 처음 펴는 줄 수 · 한 번에 더 펴는 줄 수 — 지수별 비교 · 커버드콜 · 레버리지 표(2026-10-12 "41개를 한번에 펼치는 건 별로 · 5위까지 보이고 10개씩"). */
export const FIRST_ROWS = 5;
export const STEP_ROWS = 10;

/**
 * 표를 몇 줄 펼까 — 처음 first 줄(기본 FIRST_ROWS), 단추를 누를 때마다 STEP_ROWS 줄씩 더, 다 펴면 단추가 '접기'가 된다.
 * 한때 일곱 줄 + '나머지 41개 보기' 한 번에 다 폈다 — 카드 하나가 2,289px 로 늘었다(커버드콜 48개).
 * 상세 '같은 지수 ETF'는 열 줄에서 시작한다(옆에 맞출 목록이 없고 같은 지수가 많아야 열다섯 · 2026-10-12 "최대 10개까지 그 다음은 더보기").
 */
export function useStepRows(total: number, first = FIRST_ROWS) {
  const [count, setCount] = useState(first);
  const shown = Math.min(count, total);
  const done = shown >= total;
  return {
    shown,
    // 다 펴지 않았으면 더, 다 폈으면 처음으로.
    step: () => setCount((c) => (c >= total ? first : c + STEP_ROWS)),
    /** 처음 줄 수로 — 고른 판이 바뀌었을 때(지수별 비교표의 지수). */
    reset: () => setCount(first),
    /** 처음보다 더 폈나 — 짝 카드 키 맞춤을 푸는 표시(aria-expanded · v2.css .v2-etf-pair2:has). */
    expanded: shown > first,
    label: done ? "접기" : `${Math.min(STEP_ROWS, total - shown)}개 더 보기`,
    hidden: total <= first,
  };
}

/**
 * 표 마지막 줄 단추 — 줄 높이 44(표 줄과 같다). 줄이 FIRST_ROWS 이하면 단추가 없다.
 * fill — 그때도 자리를 채울까. 지수별 비교표는 왼쪽 지수 목록과 가로선을 맞추느라 표가 늘 '다섯 줄 + 한 줄'이어야 해서, ETF 가 꼭 다섯인
 * 지수(미국배당다우존스)는 단추 자리에 'N개 전부'를 흐리게 세운다 — 비우면 다섯 줄이 여섯 줄 키로 늘어 줄이 53px 이 됐다(2026-10-12).
 */
export function MoreRow({ rows, ga, fill, total }: { rows: ReturnType<typeof useStepRows>; ga: string; fill?: boolean; total?: number }) {
  if (rows.hidden)
    return fill && total ? (
      <li className="v2-etf-more">
        <span>{total}개 전부</span>
      </li>
    ) : null;
  return (
    <li className="v2-etf-more">
      <button type="button" onClick={rows.step} aria-expanded={rows.expanded} data-ga={ga}>
        {rows.label}
      </button>
    </li>
  );
}
