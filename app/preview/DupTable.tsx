"use client";

import { useState, type MouseEvent, type ReactNode } from "react";

import { seeHint } from "../V2Hint";

/** 'N곳 중복' 을 가르치는 쪽지(page.tsx). 표시를 누르면 '봤음' — 누름을 여기서 멈춰 쪽지의 click 듣기에 안 닿아서다. */
export const DUP_HINT_ID = "dup-badge";

/**
 * '함께 움직인 국장 종목' 표를 감싸 **겹친 국장 종목을 함께 짙게** 한다(2026-10-15 · 시안 다섯 중 '가').
 *
 * 같은 국장 종목이 여러 미장 묶음에 걸린 날(정유 밤의 S-Oil 4곳), 한 줄을 가리키면 다른 묶음의 같은 종목 줄이 같이 칠해진다.
 *   데스크톱  줄에 마우스를 올리면 — CSS(:has)로만 한다. page.tsx 가 그날 겹친 종목마다 규칙을 만든다(DupStyle).
 *   폰        'N곳' 표시를 누르면 — 줄 전체가 종목 화면 링크라 줄을 누르면 넘어가 버린다. 그래서 'N곳' 만 누를 자리로 두고
 *             그 누름은 링크로 안 보낸다. 한 번 더 누르면 꺼진다.
 * ⚠️ 칠하는 것은 같은 종목코드 줄(li[data-dup]) 전부다 — 오른 미장 · 내린 미장에 함께 걸린 드문 날도 같은 종목이니 같이 칠한다.
 */
export function DupTable({ children }: { children: ReactNode }) {
  const [on, setOn] = useState<string | null>(null);
  const onClickCapture = (e: MouseEvent<HTMLDivElement>) => {
    const badge = (e.target as HTMLElement).closest(".v2-pv-n");
    if (!badge) return;
    const code = badge.closest<HTMLElement>("li[data-dup]")?.dataset.dup;
    if (!code) return;
    e.preventDefault();
    // 멈추지 않으면 링크 바깥 문서의 GA 위임 리스너가 '종목 누름'(preview_stock_click)으로 센다 — 종목 화면으로 안 갔는데도.
    e.stopPropagation();
    setOn((cur) => (cur === code ? null : code));
    seeHint(DUP_HINT_ID);
  };
  return (
    <div className="v2-pv-tbl" data-dup-on={on ?? undefined} onClickCapture={onClickCapture}>
      {children}
    </div>
  );
}
