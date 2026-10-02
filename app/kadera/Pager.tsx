"use client";

import { Children, createContext, useContext, useState } from "react";

import { track } from "@/lib/ga";

import { Icon } from "../ui";

/**
 * 신호 표의 쪽 넘김(2026-10-03 "다섯 줄은 너무 적다, 스무 줄까지").
 *
 * 줄은 서버가 **다 그려 두고**(KaderaBoard), 여기선 몇 쪽째인지만 쥔다. 다 그려 두는 까닭: 종목 화면 링크가 HTML 에 남는다 —
 * 검색 로봇은 단추를 누르지 않는다.
 *
 * ⭐ 쪽들은 **한 칸에 겹쳐 세우고** 지금 쪽만 보인다(v2.css .v2-pages). 표 높이는 가장 높은 쪽이 정하고 낮은 쪽은 줄이 조금씩
 *    늘어나 채운다. 쪽마다 제 높이로 두었더니 문장이 두 줄로 감기는 쪽에서 표가 274 → 289px 로 늘어 아래 표와 오른쪽 요약 칸이
 *    쪽을 넘길 때마다 들썩였다(2026-10-03, 판 1,280).
 *
 * 머리 띠의 단추(PagerControls)와 표의 줄(PagerRows)이 서로 다른 자리에 서서, 둘을 이 범위(PagerScope)가 묶는다.
 * 모듈 · 머리 띠 · 줄은 서버 컴포넌트 그대로다 — 이 셋은 children 으로 받아 넘기기만 한다.
 * 쪽당 줄 수(size)는 서버가 넘긴다. 이 파일에서 상수를 내보내면 서버 쪽에선 값이 아니라 클라이언트 참조로 읽힌다.
 */
type PagerState = { page: number; pages: number; size: number; go: (p: number) => void };

const Ctx = createContext<PagerState | null>(null);

export function PagerScope({ id, rows, size, children }: { id: string; rows: number; size: number; children: React.ReactNode }) {
  const [page, setPage] = useState(0);
  const go = (p: number) => {
    setPage(p);
    // 표마다 이름을 따로 둔다(줄 클릭 kadera_<id>_click 과 같은 규칙) — 둘째 쪽부터 넘겨 보는 사람이 있는지가 줄 수를 정하는 잣대다.
    track(`kadera_${id}_page`, { page: p + 1 });
  };
  return <Ctx.Provider value={{ page, pages: Math.ceil(rows / size), size, go }}>{children}</Ctx.Provider>;
}

export function PagerControls({ label }: { label: string }) {
  const c = useContext(Ctx);
  if (!c || c.pages < 2) return null;
  return (
    <span className="v2-pg">
      <button type="button" aria-label={`${label} 앞 쪽`} disabled={c.page === 0} onClick={() => c.go(c.page - 1)}>
        <Icon name="chevron_left" />
      </button>
      <span className="v2-pg-n" aria-live="polite">
        {c.page + 1}
        <span>/{c.pages}</span>
      </span>
      <button type="button" aria-label={`${label} 다음 쪽`} disabled={c.page === c.pages - 1} onClick={() => c.go(c.page + 1)}>
        <Icon name="chevron_right" />
      </button>
    </span>
  );
}

export function PagerRows({ children }: { children: React.ReactNode }) {
  const c = useContext(Ctx);
  const page = c?.page ?? 0;
  const size = c?.size ?? Infinity;
  const rows = Children.toArray(children);
  const pages: React.ReactNode[][] = [];
  for (let i = 0; i < rows.length; i += size) pages.push(rows.slice(i, i + size));
  return (
    <div className="v2-pages">
      {pages.map((p, k) => (
        // 안 보이는 쪽은 visibility 로만 숨긴다 — 자리는 남아 높이를 정하고, 링크는 HTML 에 남고, 탭 키와 화면 낭독기는 건너뛴다.
        <ol key={k} className={k === page ? undefined : "is-off"}>
          {p}
        </ol>
      ))}
    </div>
  );
}
