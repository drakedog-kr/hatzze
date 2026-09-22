"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

import { createHintStore } from "../hint-store";
import { Icon, R } from "../ui";

/**
 * 테마 지도에 처음 온 사람에게 "칸을 누르면 들어간다"고 한 번만 알려 주는 쪽지. 내부자 리포트의
 * TapHint 와 같은 기계(app/hint-store.ts)이고, 자리만 다르다 — 목록의 줄 밑이 아니라 **가장 큰 칸
 * 안**에 띄운다. 칸이 링크라는 건 눌러 보기 전엔 알 수 없고(폰엔 hover 도 없다), 가장 큰 칸이
 * 눈이 먼저 가는 자리라 거기 둔다.
 *
 * ⚠️ `hidden` 이지 `return null` 이 아니다. 서버가 null 을 그리면 클라이언트가 이 컴포넌트를 아예
 *    실행하지 않는다(TapHint 머리 주석 '하나'의 실측).
 * ⚠️ 쪽지는 손가락을 **통과**시킨다(pointer-events:none). 가려진 칸을 누르면 그대로 그 테마로 가고,
 *    그 순간 '봤음'으로 적혀 다음부턴 안 뜬다. 닫기 ✕ 만 되돌려 받는다.
 *
 * 좌표는 컨테이너(.hz-treemap) 기준 퍼센트다 — 칸과 같은 좌표계라 폰에서 상자가 세로로 늘어나도
 * 칸과 같이 움직인다.
 */
const { storeFor, markSeen } = createHintStore("hz-theme-maphint-", "hz-theme-map-hint-change");

export function MapHint({ id, text, left, top }: { id: string; text: string; left: string; top: string }) {
  const store = storeFor(id);
  const show = useSyncExternalStore(store.subscribe, store.getSnapshot, () => false);
  const ref = useRef<HTMLDivElement>(null);

  // 쪽지가 아니라 **칸을 직접 누른** 사람도 알아들은 것이다. 컨테이너에 걸어 어느 칸을 눌러도 잡는다.
  // click 이 아니라 pointerdown 인 이유: 링크를 누르면 그대로 페이지가 떠나서 click 이 안 올 수 있다.
  useEffect(() => {
    const map = ref.current?.closest(".hz-treemap");
    if (!map) return;
    const onDown = (e: Event) => {
      if (ref.current?.contains(e.target as Node)) return; // 쪽지 자신은 아래 onClick 이 처리
      markSeen(id);
    };
    map.addEventListener("pointerdown", onDown);
    return () => map.removeEventListener("pointerdown", onDown);
  }, [id]);

  return (
    <div ref={ref} className="hz-map-hint-slot" hidden={!show} style={{ left, top }}>
      <div className="hz-map-hint">
        <Icon name="touch_app" style={{ fontSize: "var(--fs-16)", flexShrink: 0 }} />
        <span style={{ flex: 1, wordBreak: "keep-all" }}>{text}</span>
        <button
          type="button"
          className="hz-map-hint-x"
          onClick={() => markSeen(id)}
          aria-label="닫기"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            width: 24,
            height: 24,
            borderRadius: R.control,
            border: "none",
            background: "transparent",
            color: "inherit",
            opacity: 0.7,
            cursor: "pointer",
          }}
        >
          <Icon name="close" style={{ fontSize: "var(--fs-16)" }} />
        </button>
      </div>
    </div>
  );
}
