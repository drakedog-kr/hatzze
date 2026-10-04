"use client";

import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";

import { createHintStore } from "./hint-store";
import { Icon } from "./ui";

/**
 * 처음 온 사람에게 "여기를 누르면 무엇이 나온다"고 한 번만 알려 주는 쪽지(v2). 2026-10-05 운영자 판단으로 v1 의 쪽지 셋
 * (내부자 리포트 줄 · 테마 지도 칸)을 되살리고 열 곳을 더했다 — 줄이 링크인데 화살표가 없거나, 말풍선이 눌러야만 열리는 자리다.
 *
 * - 한 번 보면 끝이다. 오른쪽 ✕ 를 누르거나 쪽지가 선 판(부모 요소)을 아무 데나 누르면 '봤음'으로 적는다(localStorage `hz-v2hint-<id>`).
 *   click 이 아니라 pointerdown 인 이유: 링크를 누르면 그대로 페이지가 떠나서 click 이 안 올 수 있다.
 * - 쪽지 몸은 손가락을 **통과**시킨다(v1 과 같다) — 쪽지에 가려진 줄 · 칸을 누르면 그대로 그리로 가고, 그 순간 '봤음'이 된다.
 *   ✕ 만 손가락을 받는다 — 아무것도 안 누르고 끌 수 있어야 한다(2026-10-05 운영자 판단).
 * - 같은 id 는 같은 가르침이다 — 카더라에서 '종목을 누르면 …'을 본 사람에게 미리보기 · 데일리 노트에서 또 띄우지 않는다.
 * - **한 화면에 하나씩.** 화면에 붙은 쪽지 가운데 아직 안 본 것 중 order 가 가장 앞선 것만 뜨고, 그걸 보면 다음이 뜬다
 *   (한 화면에 같은 손가락 아이콘이 둘 서지 않는다). order 는 화면에서 위에 있는 차례로 준다.
 * - 닫기 ✕ 는 맨 위 소식 띠의 ✕ 와 한 화면에 같이 설 수 있다 — 처음엔 그래서 쪽지 전체를 닫는 단추로 두고 ✕ 를 뺐는데, 쪽지를 누르는
 *   것이 '그 줄을 누르는 것'으로 읽혀 끄는 길이 안 보였다(2026-10-05 운영자 지시로 ✕ 를 되살림).
 *
 * 자리: `anchor`(부모 안 CSS 선택자)를 주면 그 요소 바로 밑(at="below" · 위를 가리키는 꼭지) 또는 그 안 왼쪽 위(at="inside")에
 * 띄운다 — 좌표는 재서 넣는다(줄 키가 화면 폭마다 달라서). 밑에 두면 판 바닥을 넘는 자리(가리킨 줄이 마지막 줄)면 위로 뒤집는다
 * (.is-above · 꼭지도 아래로). anchor 가 없으면 `style` 의 left · top 을 그대로 쓴다(테마 지도).
 * 부모는 position 이 있어야 한다(Module 은 hint 를 받으면 .v2-has-hint 를 단다).
 */
const { storeFor, markSeen } = createHintStore("hz-v2hint-", "hz-v2hint-change");

/** 지금 화면에 붙은 쪽지 — id → 차례 · 붙은 수(같은 id 가 폭에 따라 두 자리에 설 수 있다 · 테마 지도와 흐름 표). */
const mounted = new Map<string, { order: number; n: number }>();

function myTurn(id: string, order: number): boolean {
  if (!mounted.has(id) || !storeFor(id).getSnapshot()) return false;
  for (const [other, m] of mounted) {
    if (other === id) continue;
    const before = m.order < order || (m.order === order && other < id);
    if (before && storeFor(other).getSnapshot()) return false;
  }
  return true;
}

export type HintSpec = {
  id: string;
  text: string;
  /** 한 화면에서의 차례 — 위에 있는 것이 앞. */
  order?: number;
  anchor?: string;
  at?: "below" | "inside";
  className?: string;
};

export function V2Hint({ id, text, order = 0, anchor, at = "below", className, style }: HintSpec & { style?: React.CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  const store = storeFor(id);
  const show = useSyncExternalStore(store.subscribe, () => myTurn(id, order), () => false);

  // 화면에 붙었다고 적는다 — 차례 셈은 붙은 쪽지끼리만 한다. 붙기 전엔 안 띄운다(myTurn 의 mounted.has).
  useEffect(() => {
    const m = mounted.get(id);
    mounted.set(id, { order: Math.min(order, m?.order ?? order), n: (m?.n ?? 0) + 1 });
    window.dispatchEvent(new Event("hz-v2hint-change"));
    return () => {
      const cur = mounted.get(id);
      if (!cur || cur.n <= 1) mounted.delete(id);
      else mounted.set(id, { ...cur, n: cur.n - 1 });
      window.dispatchEvent(new Event("hz-v2hint-change"));
    };
  }, [id, order]);

  // 쪽지가 아니라 판을 직접 누른 사람도 알아들은 것이다 — 그때도 '봤음'으로 적어야 돌아왔을 때 또 안 뜬다.
  useEffect(() => {
    const host = ref.current?.parentElement;
    if (!host) return;
    const onDown = (e: Event) => {
      if (ref.current?.contains(e.target as Node)) return; // 쪽지 자신은 아래 onClick 이 처리
      markSeen(id);
    };
    host.addEventListener("pointerdown", onDown);
    return () => host.removeEventListener("pointerdown", onDown);
  }, [id]);

  // 자리 — 상태로 두지 않고 요소에 바로 적는다(effect 안 setState 는 린트가 막는다). 판 크기가 바뀌면 다시 잰다.
  useLayoutEffect(() => {
    const slot = ref.current;
    const host = slot?.parentElement;
    if (!show || !anchor || !slot || !host) return;
    const place = () => {
      const a = host.querySelector<HTMLElement>(anchor);
      // 가리킬 줄이 없으면(빈 표) 엉뚱한 자리에 서지 않게 감춘다.
      slot.style.visibility = a ? "" : "hidden";
      if (!a) return;
      const h = host.getBoundingClientRect();
      const r = a.getBoundingClientRect();
      slot.style.left = `${Math.round(r.left - h.left + (at === "inside" ? 8 : 14))}px`;
      if (at === "inside") {
        slot.style.top = `${Math.round(r.top - h.top + 8)}px`;
        return;
      }
      // 판(overflow:hidden) 바닥을 넘으면 가리킨 줄 위로 뒤집는다 — 잘린 쪽지는 무엇을 말하는지 안 읽힌다.
      const above = r.bottom - h.top + 4 + slot.offsetHeight > h.height && r.top - h.top - 4 - slot.offsetHeight >= 0;
      slot.classList.toggle("is-above", above);
      slot.style.top = `${Math.round(above ? r.top - h.top - 4 - slot.offsetHeight : r.bottom - h.top + 4)}px`;
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(host);
    return () => ro.disconnect();
  }, [show, anchor, at]);

  return (
    // ⚠️ `hidden` 이지 `return null` 이 아니다(app/hint-store.ts 머리 주석 ①).
    <div ref={ref} data-hint={id} className={`v2-hint-slot${at === "inside" ? " is-inside" : ""}${className ? ` ${className}` : ""}`} style={style} hidden={!show}>
      <div className="v2-hint" role="note">
        <Icon name="touch_app" />
        <span>{text}</span>
        <button type="button" className="v2-hint-x" onClick={() => markSeen(id)} aria-label="안내 닫기">
          <Icon name="close" />
        </button>
      </div>
    </div>
  );
}
