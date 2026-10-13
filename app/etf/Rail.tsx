"use client";

import { flowTone, fmtFlow } from "./format";

/** m 이 없으면 숫자 칸을 비운다 — '전체' 줄(합은 위 히어로 큰 숫자가 말한다). */
export type RailItem = { key: string; label: string; m?: number };

/**
 * 카드 왼쪽 목록 — 고르면 같은 카드 오른쪽 표가 그 판으로 바뀐다(배당 '성향별 바스켓'과 같은 꼴: 고른 줄은 옅은 파랑).
 * 'ETF 자금 흐름'(유형)과 '지수별 ETF 비교'(지수)가 같이 쓴다. 줄 = 이름 · 순유입 한 줄. 막대는 두지 않는다 — 고르는 목록이고,
 * 옆 표가 숫자를 다 보인다. 폭은 히어로 띠 첫 칸과 같아 세로선이 이어진다(v2.css .v2-etf-md).
 * 이름 아래 곁줄(ETF 수 · 1주 유입)은 걷었다 — 다른 화면 목록은 이름 한 줄이다(2026-10-12 "짜잘한 설명이 많다").
 * numHead 는 숫자 칸 머리 — 기간을 고르는 카드는 '순유입'(기간은 머리 세그먼트가 말한다), 1달 고정인 카드는 '1달 순유입'(2026-10-12 화면마다 섞이던 '유입'을 맞춤).
 */
export function Rail({
  items,
  sel,
  onPick,
  head,
  numHead,
  ga,
}: {
  items: RailItem[];
  sel: string;
  onPick: (k: string) => void;
  head: string;
  numHead: string;
  ga: string;
}) {
  return (
    <div className="v2-etf-rail">
      <div className="v2-etf-rail-row v2-th">
        <span>{head}</span>
        <span>{numHead}</span>
      </div>
      <ol className="v2-etf-rail-body">
        {items.map((it) => (
          <li key={it.key}>
            <button type="button" className={`v2-etf-rail-row is-link${it.key === sel ? " is-on" : ""}`} aria-pressed={it.key === sel} onClick={() => onPick(it.key)} data-ga={ga}>
              <span className="v2-etf-name">
                <span className="v2-td-name">{it.label}</span>
              </span>
              {it.m === undefined ? <span /> : <span className={`v2-td-num${flowTone(it.m)}`}>{fmtFlow(it.m)}</span>}
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
