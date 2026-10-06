"use client";

import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";

import type { IconName } from "@/lib/icon-names";
import { createHintStore } from "./hint-store";
import { Icon } from "./ui";

/**
 * 처음 온 사람에게 "여기를 누르면 무엇이 나온다"고 한 번만 알려 주는 쪽지(v2). 2026-10-05 운영자 판단으로 v1 의 쪽지 셋
 * (내부자 리포트 줄 · 테마 지도 칸)을 되살리고 열 곳을 더했다 — 줄이 링크인데 화살표가 없거나, 말풍선이 눌러야만 열리는 자리다.
 *
 * - 한 번 보면 끝이다. 오른쪽 ✕ 를 누르거나, 쪽지가 **떠 있는 동안** 쪽지가 가르치는 것(target — 종목 줄 · 칩 · 막대)을 누르면
 *   '봤음'으로 적는다(localStorage `hz-v2hint-<id>`). 판의 다른 자리(빈 곳 · 머리 · 다른 단추)를 눌러서는 안 닫힌다 — 아무 데나 눌러도
 *   사라져 가르친 대로 해 보기 전에 없어졌다(2026-10-05 운영자 지시 "실제 가이드 해주는 걸 누르던지, X를 누르던지").
 *   target 을 안 주면 anchor 에서 자리 표시(:first-child · :nth-child(n) …)를 뗀 것 — '첫 줄 밑'을 가리켜도 가르침은 '줄을 누르면'이다.
 *   pointerdown 이 아니라 click 이다 — 폰은 손가락 스크롤을 시작해도 pointerdown 이 와서 아무것도 안 눌렀는데 닫혔고, 아직 차례가 안 와
 *   숨은 쪽지도 판을 건드리면 한 번도 안 보인 채 지워졌다(2026-10-05 머지 전 점검). 링크를 눌러도 click 은 먼저 온다(이동은 click 의 기본 동작이다).
 * - 쪽지 몸은 손가락을 **통과**시킨다(v1 과 같다) — 쪽지에 가려진 줄 · 칸을 누르면 그대로 그리로 가고, 그 순간 '봤음'이 된다.
 *   ✕ 만 손가락을 받는다 — 아무것도 안 누르고 끌 수 있어야 한다(2026-10-05 운영자 판단).
 * - 같은 id 는 같은 가르침이다 — 카더라에서 '종목을 누르면 …'을 본 사람에게 미리보기 · 데일리 노트에서 또 띄우지 않는다.
 * - **한 화면에 하나씩.** 화면에 붙은 쪽지 가운데 아직 안 본 것 중 order 가 가장 앞선 것만 뜨고, 그걸 보면 다음이 뜬다
 *   (한 화면에 같은 손가락 아이콘이 둘 서지 않는다). order 는 화면에서 위에 있는 차례로 준다.
 *   예외 `together` — 차례를 안 기다리고 바로 뜨고, 다른 쪽지의 차례에도 끼지 않는다. 카더라(국장 · 미장)의 테마 쪽지와 '많이 언급된
 *   종목' 쪽지가 그렇다 — 테마 쪽지를 닫아야 종목 쪽지가 떠서, 첫 화면 아래의 종목 쪽지를 아무도 못 봤다(2026-10-05 운영자 지시 "동시에").
 * - 닫기 ✕ 는 맨 위 소식 띠의 ✕ 와 한 화면에 같이 설 수 있다 — 처음엔 그래서 쪽지 전체를 닫는 단추로 두고 ✕ 를 뺐는데, 쪽지를 누르는
 *   것이 '그 줄을 누르는 것'으로 읽혀 끄는 길이 안 보였다(2026-10-05 운영자 지시로 ✕ 를 되살림).
 *
 * 자리: `anchor`(부모 안 CSS 선택자)를 주면 그 요소 바로 밑(at="below" · 위를 가리키는 꼭지) 또는 그 안 왼쪽 위(at="inside")에
 * 띄운다 — 좌표는 재서 넣는다(줄 키가 화면 폭마다 달라서). 밑에 두면 판 바닥을 넘는 자리(가리킨 줄이 마지막 줄)면 위로 뒤집는다
 * (.is-above · 꼭지도 아래로). anchor 가 없으면 `style` 의 left · top 을 그대로 쓴다(테마 지도).
 * 부모는 position 이 있어야 한다(Module 은 hint 를 받으면 .v2-has-hint 를 단다).
 * at="right" 는 가리킨 요소 오른쪽에 position:fixed 로 띄운다(꼭지는 왼쪽) — 사이드바처럼 폭이 좁고 스크롤 영역이라 밑에 두면 잘리는 자리다.
 * 부모의 크기 · 스크롤이 바뀌면 다시 잰다. 가리킨 요소가 안 보이면(폰에서 숨은 사이드바) 쪽지도 안 보인다.
 *
 * 가르치는 동작이 호버인 쪽지(hover) — 마우스 기기에선 대상 위에 잠깐(HOVER_SEEN_MS) 머물러도 '봤음'이다. 말풍선이 이미 떴으니 가르친 대로 해 본 것이다.
 * 문구가 기기마다 다르면 touchText 를 준다(호버가 없는 기기에서 text 대신 보인다 · CSS 미디어 쿼리라 하이드레이션이 안 어긋난다).
 * until(ISO 시각)이 지나면 안 뜬다 — 새 소식처럼 시효가 있는 쪽지. 개발 서버에선 시각과 무관하게 뜬다(소식 띠 NEWS 와 같은 규칙).
 */
const { storeFor, markSeen } = createHintStore("hz-v2hint-", "hz-v2hint-change");

/** 호버 쪽지가 '봤음'이 되는 머무름(ms). 지나가던 마우스가 스치기만 해선 안 닫힌다. */
const HOVER_SEEN_MS = 600;

// 모듈이 읽힐 때 한 번만 본다(렌더 안에서 Date.now() 를 부르면 React 컴파일러 린트가 막는다). 서버 스냅샷은 늘 false 라 서버는 안 쓴다.
const HINT_NOW = Date.now();
const hintLive = (until: string | undefined) => !until || process.env.NODE_ENV !== "production" || HINT_NOW < Date.parse(until);

/** 지금 화면에 붙은 쪽지 — id → 차례 · 붙은 수(같은 id 가 폭에 따라 두 자리에 설 수 있다 · 테마 지도와 흐름 표) · 차례 밖인가. */
const mounted = new Map<string, { order: number; n: number; together: boolean }>();

function myTurn(id: string, order: number): boolean {
  if (!mounted.has(id) || !storeFor(id).getSnapshot()) return false;
  if (mounted.get(id)!.together) return true; // 차례 밖 — 바로 뜬다
  for (const [other, m] of mounted) {
    if (other === id || m.together) continue; // 차례 밖 쪽지는 줄에 안 선다
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
  at?: "below" | "inside" | "right";
  className?: string;
  /** 호버가 없는 기기(폰)에서 text 대신 보일 문구 — '올리면' 과 '누르면' 처럼 기기마다 동작이 다를 때. */
  touchText?: string;
  /** 가르치는 동작이 호버다 — 마우스 기기에선 대상 위에 머물러도 '봤음'(머리 주석). */
  hover?: boolean;
  /** 앞 아이콘. 기본은 손가락(touch_app) — 새 소식처럼 누르라는 뜻이 아닌 쪽지만 바꾼다. */
  icon?: IconName;
  /** 이 시각(ISO)부터는 안 뜬다 — 새 소식처럼 시효가 있는 쪽지. */
  until?: string;
  /** 눌렀을 때 '봤음'이 되는 것(판 안 CSS 선택자) — 쪽지가 가르치는 동작의 대상. 없으면 anchor 에서 자리 표시를 뗀 것. */
  target?: string;
  /** 차례를 안 기다리고 바로 뜬다(다른 쪽지의 차례에도 안 낀다) — 머리 주석의 예외. */
  together?: boolean;
};

/** anchor 의 자리 표시(첫째 · 끝 · n째)를 뗀 선택자 — '첫 줄'을 가리키는 쪽지의 가르침은 '아무 줄이나 누르면'이다. */
export function targetOf(anchor: string | undefined): string | null {
  if (!anchor) return null;
  return anchor.replace(/:(?:first-child|last-child|first-of-type|last-of-type|nth-child\([^)]*\)|nth-of-type\([^)]*\))/g, "").trim() || null;
}

export function V2Hint({
  id,
  text,
  order = 0,
  anchor,
  at = "below",
  className,
  target,
  together = false,
  touchText,
  hover = false,
  icon = "touch_app",
  until,
  style,
}: HintSpec & { style?: React.CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  const store = storeFor(id);
  const show = useSyncExternalStore(store.subscribe, () => hintLive(until) && myTurn(id, order), () => false);

  // 화면에 붙었다고 적는다 — 차례 셈은 붙은 쪽지끼리만 한다. 붙기 전엔 안 띄운다(myTurn 의 mounted.has).
  useEffect(() => {
    const m = mounted.get(id);
    mounted.set(id, { order: Math.min(order, m?.order ?? order), n: (m?.n ?? 0) + 1, together: together || (m?.together ?? false) });
    window.dispatchEvent(new Event("hz-v2hint-change"));
    return () => {
      const cur = mounted.get(id);
      if (!cur || cur.n <= 1) mounted.delete(id);
      else mounted.set(id, { ...cur, n: cur.n - 1 });
      window.dispatchEvent(new Event("hz-v2hint-change"));
    };
  }, [id, order, together]);

  // 가르친 대로 눌러 본 사람도 알아들은 것이다 — 그때도 '봤음'으로 적어야 돌아왔을 때 또 안 뜬다. 판의 다른 자리는 세지 않는다(머리 주석).
  const sel = target ?? targetOf(anchor);
  useEffect(() => {
    const host = ref.current?.parentElement;
    if (!host || !sel) return; // 가르칠 대상을 모르면 ✕ 로만 닫는다
    const onTap = (e: Event) => {
      if (!ref.current || ref.current.hidden) return; // 아직 차례가 안 와 숨은 쪽지는 기록하지 않는다
      const t = e.target as Element | null;
      if (!t || ref.current.contains(t)) return; // 쪽지 자신은 아래 onClick 이 처리
      const hit = t.closest?.(sel);
      if (hit && host.contains(hit)) markSeen(id);
    };
    host.addEventListener("click", onTap);
    return () => host.removeEventListener("click", onTap);
  }, [id, sel]);

  // 호버로 가르치는 쪽지 — 마우스 기기에서 대상 위에 HOVER_SEEN_MS 머물면 '봤음'. 대상을 벗어나면 다시 센다.
  useEffect(() => {
    const host = ref.current?.parentElement;
    if (!hover || !host || !sel || !window.matchMedia("(hover: hover)").matches) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onOver = (e: MouseEvent) => {
      clearTimeout(timer);
      if (!ref.current || ref.current.hidden) return;
      const hit = (e.target as Element | null)?.closest?.(sel);
      if (hit && host.contains(hit)) timer = setTimeout(() => markSeen(id), HOVER_SEEN_MS);
    };
    const onLeave = () => clearTimeout(timer);
    host.addEventListener("mouseover", onOver);
    host.addEventListener("mouseleave", onLeave);
    return () => {
      clearTimeout(timer);
      host.removeEventListener("mouseover", onOver);
      host.removeEventListener("mouseleave", onLeave);
    };
  }, [id, sel, hover]);

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
      if (at === "right") {
        // 화면 좌표(fixed). 가리킨 줄의 세로 가운데에 쪽지 가운데를 맞춘다. 줄이 안 보이면(폭 0) 감춘다.
        // 16 = 사이드바 안쪽 여백(12) + 쪽지 몸이 사이드바 테두리 밖에서 시작할 틈 — 꼭지(5)만 테두리를 넘어 줄을 가리킨다.
        slot.style.visibility = r.width > 0 ? "" : "hidden";
        slot.style.left = `${Math.round(r.right + 16)}px`;
        slot.style.top = `${Math.round(r.top + r.height / 2 - slot.offsetHeight / 2)}px`;
        return;
      }
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
    if (at !== "right") return () => ro.disconnect();
    // 화면 좌표라 부모 안 스크롤(사이드바)과 창 크기에도 다시 잰다. scroll 은 거품이 안 올라 capture 로 듣는다.
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [show, anchor, at]);

  return (
    // ⚠️ `hidden` 이지 `return null` 이 아니다(app/hint-store.ts 머리 주석 ①).
    <div
      ref={ref}
      data-hint={id}
      className={`v2-hint-slot${at === "inside" ? " is-inside" : at === "right" ? " is-right" : ""}${className ? ` ${className}` : ""}`}
      style={style}
      hidden={!show}
    >
      <div className="v2-hint" role="note">
        <Icon name={icon} />
        {touchText ? (
          <span>
            <span className="v2-hint-mouse">{text}</span>
            <span className="v2-hint-touch">{touchText}</span>
          </span>
        ) : (
          <span>{text}</span>
        )}
        <button type="button" className="v2-hint-x" onClick={() => markSeen(id)} aria-label="안내 닫기">
          <Icon name="close" />
        </button>
      </div>
    </div>
  );
}
