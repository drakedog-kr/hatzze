"use client";

import { Icon } from "../ui";

/**
 * 표 머리의 줄 세우기 단추 — 개별 ETF 표 · 비교표 · 커버드콜이 같이 쓴다. 고른 칸은 잉크 + 600 + 화살표(한 번 더 누르면 뒤집힌다).
 * label 은 머리 글자, desc 는 지금 큰 차례인가. 화살표는 그림이라 읽히지 않아(Icon 의 aria-hidden) 고른 칸은 aria-label 에 차례를 붙인다.
 */
export function SortHead({ label, on, desc, onClick, ga }: { label: string; on: boolean; desc: boolean; onClick: () => void; ga: string }) {
  return (
    <button
      type="button"
      className={`v2-etf-sort${on ? " is-on" : ""}`}
      onClick={onClick}
      aria-pressed={on}
      aria-label={on ? `${label} · ${desc ? "큰 차례" : "작은 차례"}` : undefined}
      data-ga={ga}
    >
      {label}
      {on && <Icon name="arrow_upward" className={desc ? "is-desc" : undefined} />}
    </button>
  );
}
