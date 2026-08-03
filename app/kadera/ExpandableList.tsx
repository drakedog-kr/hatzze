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
  listClassName,
  footerStyle,
  name,
}: {
  items: React.ReactNode[];
  initial?: number;
  step?: number;
  gap?: number;
  /** 기본 세로 목록 대신 다른 배치를 쓸 때(트렌딩 메시지는 3열 그리드). gap 은 여기서 덮어쓴다. */
  listStyle?: React.CSSProperties;
  /**
   * 배치를 클래스로 줄 때(시트의 셀 격자). listStyle 로는 안 되는 경우가 있다 —
   * 셀 격자선(.hz-cellgrid > * 의 inset)과 열 수 미디어쿼리는 인라인으로 표현이 안 된다.
   */
  listClassName?: string;
  /** '더 보기' 줄의 바깥 여백. 시트 안에서는 셀 격자에 딱 붙어야 해서 덮어쓴다. */
  footerStyle?: React.CSSProperties;
  /** GA 이벤트에서 어느 목록인지 구분할 이름. 없으면 펼침을 재지 않는다. */
  name?: string;
}) {
  const [shown, setShown] = useState(initial);
  const canExpand = shown < items.length;
  const isExpanded = shown > initial;

  // 알약형 버튼이 아니라 **목록의 마지막 줄**이다. 시트 안에서는 위 헤어라인이 이미
  // 경계를 그어 주므로 테두리를 또 두르면 선이 두 겹이 되고, 그 상자가 표에서 저 혼자
  // 떠 보인다. 줄 자체가 눌리는 자리가 되게 두고 높이도 데이터 행보다 낮게 잡는다.
  const buttonStyle: React.CSSProperties = {
    flex: 1,
    padding: "7px 12px",
    borderRadius: 0,
    border: 0,
    background: "transparent",
    color: C.sub,
    fontSize: 11.5,
    fontWeight: 700,
    cursor: "pointer",
  };

  return (
    <>
      {/* 배치를 클래스로 받으면 기본 세로 flex 를 아예 안 깐다. 인라인 display:flex 는
          클래스의 display:grid 를 이기므로, 같이 두면 격자가 통째로 무시된다. */}
      <ol
        className={listClassName}
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          ...(listClassName ? null : { display: "flex", flexDirection: "column", gap }),
          ...listStyle,
        }}
      >
        {items.slice(0, shown)}
      </ol>
      {(canExpand || isExpanded) && (
        <div style={{ display: "flex", gap: 8, marginTop: 14, ...footerStyle }}>
          {canExpand && (
            <button
              type="button"
              className="hz-more-btn"
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
              className="hz-more-btn"
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
