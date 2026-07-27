"use client";

import { useState } from "react";

import { track } from "@/lib/ga";
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
  listStyle,
  name,
}: {
  items: React.ReactNode[];
  initial?: number;
  step?: number;
  gap?: number;
  /** 기본 세로 목록 대신 다른 배치를 쓸 때(트렌딩 메시지는 3열 그리드). gap 은 여기서 덮어쓴다. */
  listStyle?: React.CSSProperties;
  /** GA 이벤트에서 어느 목록인지 구분할 이름. 없으면 펼침을 재지 않는다. */
  name?: string;
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
    fontWeight: 600,
    cursor: "pointer",
  };

  return (
    <>
      <ol
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap,
          ...listStyle,
        }}
      >
        {items.slice(0, shown)}
      </ol>
      {(canExpand || isExpanded) && (
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          {canExpand && (
            <button
              type="button"
              style={buttonStyle}
              onClick={() => {
                const next = Math.min(shown + step, items.length);
                // shown 을 같이 보내면 "한 번 더 보고 말았는가, 끝까지 내려갔는가"가
                // 나뉜다 — 기본 노출 개수를 조정할 때 그게 판단 근거다.
                if (name) track("list_expand", { list: name, action: "more", shown: next });
                setShown(next);
              }}
            >
              더 보기 +{Math.min(step, items.length - shown)}
            </button>
          )}
          {isExpanded && (
            <button
              type="button"
              style={buttonStyle}
              onClick={() => {
                if (name) track("list_expand", { list: name, action: "fold", shown: initial });
                setShown(initial);
              }}
            >
              접기
            </button>
          )}
        </div>
      )}
    </>
  );
}
