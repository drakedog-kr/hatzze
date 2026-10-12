"use client";

import { Icon } from "../ui";

/**
 * 표 머리의 줄 세우기 단추 — 개별 ETF 표 · 비교표 · 파킹형이 같이 쓴다. 고른 칸은 잉크 + 600 + 화살표(한 번 더 누르면 뒤집힌다).
 * label 은 머리 글자, desc 는 지금 큰 차례인가. aria-label 로 무엇을 누르는지 말한다.
 */
export function SortHead({ label, on, desc, onClick, ga }: { label: React.ReactNode; on: boolean; desc: boolean; onClick: () => void; ga: string }) {
  return (
    <button type="button" className={`v2-etf-sort${on ? " is-on" : ""}`} onClick={onClick} aria-pressed={on} data-ga={ga}>
      {label}
      {on && <Icon name="arrow_upward" className={desc ? "is-desc" : undefined} />}
    </button>
  );
}
