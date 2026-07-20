"use client";

import { useState } from "react";

import { C } from "../ui";

/**
 * 트렌딩 메시지의 기간 탭(오늘 / 최근 7일 / 최근 30일).
 *
 * ExpandableList 와 같은 원칙 — 조회와 마크업은 서버 컴포넌트에 남기고, 여기서는
 * 어느 패널을 보여줄지만 관리한다. 세 창의 목록을 서버가 미리 렌더해 넘기므로
 * 탭을 눌러도 왕복이 없다(대신 DOM 은 세 벌이지만 창당 6건이라 부담이 작다).
 */
export type TrendingPanel = {
  key: string;
  label: string;
  count: number;
  node: React.ReactNode;
};

export function TrendingTabs({ panels }: { panels: TrendingPanel[] }) {
  const [active, setActive] = useState(panels[0]?.key);
  const current = panels.find((p) => p.key === active) ?? panels[0];

  return (
    <>
      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        {panels.map((p) => {
          const on = p.key === current?.key;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => setActive(p.key)}
              aria-pressed={on}
              style={{
                padding: "7px 14px",
                borderRadius: 999,
                border: `1px solid ${on ? C.blue : C.line}`,
                background: on ? `${C.blue}14` : "transparent",
                color: on ? C.blue : C.sub,
                fontSize: 12,
                fontWeight: 800,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {p.label}
              {/* 빈 기간을 눌러보기 전에 알 수 있게 건수를 같이 둔다 — 특히 '오늘'은
                  이른 시간대에 0건일 수 있다. */}
              <span style={{ marginLeft: 6, fontWeight: 700, color: on ? C.blue : "var(--c-faint)" }}>
                {p.count}
              </span>
            </button>
          );
        })}
      </div>
      {current?.count === 0 ? (
        <p style={{ margin: 0, color: C.sub, fontSize: 13 }}>
          {current.label} 기준으로는 아직 화제 메시지가 없어요.
        </p>
      ) : (
        current?.node
      )}
    </>
  );
}
