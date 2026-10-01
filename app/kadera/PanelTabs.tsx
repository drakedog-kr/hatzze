"use client";

import { useState } from "react";

import { track } from "@/lib/ga";

/**
 * v2 대시보드의 패널 껍데기(2026-10-02). **탭이 곧 제목이다** — 토스증권 홈의 '실시간 차트 · 지금 뜨는 산업'처럼
 * 탭 이름을 제목 크기로 세우고, 고르지 않은 탭은 흐리게 둔다. 탭이 하나면 그 이름이 그냥 제목이다.
 *
 * 몸통은 높이가 고정된 판 안에서 스크롤한다(Blockworks 의 패널과 같다). 판의 높이는 격자(v2.css)가 쥐고,
 * 여기서는 넘치는 목록을 패널 안에 가둔다 — 그래야 화면이 목록 길이만큼 늘지 않는다.
 *
 * 탭마다의 내용은 서버가 미리 그려 넘긴다(node). 조회는 서버에 남고 여기서는 고르기만 한다.
 */
/** meta 는 머리 오른쪽의 조건 알약("최근 3일")이다. 탭마다 다를 수 있어 탭에 붙인다(서버가 함수를 못 넘긴다). */
export type PanelTab = { key: string; label: string; node: React.ReactNode; meta?: React.ReactNode };

export function PanelTabs({
  title,
  tabs,
  id,
  className,
  name,
}: {
  /** 주면 이것이 제목이 되고 탭은 오른쪽의 작은 단추 줄이 된다(기간 고르기처럼 같은 것을 다르게 보는 탭). */
  title?: string;
  tabs: PanelTab[];
  id?: string;
  className?: string;
  /** GA 에 남길 패널 이름. */
  name: string;
}) {
  const [key, setKey] = useState(tabs[0]?.key);
  const cur = tabs.find((t) => t.key === key) ?? tabs[0];
  const right = cur.meta;
  const pick = (k: string) => {
    setKey(k);
    track("kadera_panel_tab", { panel: name, tab: k });
  };
  return (
    <section className={`v2-panel${className ? ` ${className}` : ""}`} id={id}>
      <header className="v2-p-head">
        {title ? (
          <>
            <h2 className="v2-ptab is-on">
              {title}
            </h2>
            {right && <span className="v2-p-meta">{right}</span>}
            {tabs.length > 1 && (
              <div className="v2-seg" role="tablist">
                {tabs.map((t) => (
                  <button key={t.key} type="button" role="tab" aria-selected={t.key === cur.key} onClick={() => pick(t.key)}>
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            {tabs.length > 1 ? (
              <div className="v2-ptabs" role="tablist">
                {tabs.map((t) => (
                  <button key={t.key} type="button" role="tab" aria-selected={t.key === cur.key} className="v2-ptab" onClick={() => pick(t.key)}>
                    {t.label}
                  </button>
                ))}
              </div>
            ) : (
              <h2 className="v2-ptab is-on">
                {cur.label}
              </h2>
            )}
            {right && <span className="v2-p-meta">{right}</span>}
          </>
        )}
      </header>
      <div className="v2-p-body" role={tabs.length > 1 ? "tabpanel" : undefined}>
        {cur.node}
      </div>
    </section>
  );
}
