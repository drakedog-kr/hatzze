"use client";

import { useState } from "react";

import { C } from "../ui";

/**
 * 리스트를 initial개만 보여주고 "더 보기"로 step개씩 늘리는 클라이언트 컴포넌트.
 * 서버 컴포넌트에서 렌더한 항목들을 items로 넘겨받아 잘라서 보여주기만 한다
 * (데이터 조회는 서버에 남기고, 여기서는 펼침 상태만 관리).
 */
export function ExpandableList({
  items,
  initial = 8,
  step = 10,
  gap = 11,
}: {
  items: React.ReactNode[];
  initial?: number;
  step?: number;
  gap?: number;
}) {
  const [shown, setShown] = useState(initial);
  const canExpand = shown < items.length;
  const isExpanded = shown > initial;

  const buttonStyle: React.CSSProperties = {
    flex: 1,
    padding: "9px 12px",
    borderRadius: 10,
    border: `1px solid ${C.line}`,
    background: "transparent",
    color: C.sub,
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
  };

  return (
    <>
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap }}>
        {items.slice(0, shown)}
      </ol>
      {(canExpand || isExpanded) && (
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          {canExpand && (
            <button type="button" style={buttonStyle} onClick={() => setShown(Math.min(shown + step, items.length))}>
              더 보기 +{Math.min(step, items.length - shown)}
            </button>
          )}
          {isExpanded && (
            <button type="button" style={buttonStyle} onClick={() => setShown(initial)}>
              접기
            </button>
          )}
        </div>
      )}
    </>
  );
}
