"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import { track } from "@/lib/ga";

/**
 * 화면 전체의 GA4 이벤트를 한 곳에서 받는 위임 리스너. AppShell 에 한 번만 얹는다.
 *
 * 이렇게 두는 이유: /, /kadera 는 서버 컴포넌트다(page.tsx 2,000줄대). 클릭 하나
 * 재려고 "use client" 를 붙이면 페이지 전체가 클라이언트 번들로 넘어간다. 대신
 * 마크업에는 속성만 달고, 실제 리스너는 여기 클라이언트 컴포넌트 하나가 가진다:
 *
 *   <a data-ga="cta_click" data-ga-cta="report_indicator" data-ga-surface="sentiment_grid">
 *
 * 이미 클라이언트인 컴포넌트(ThemeToggle·TrendingTabs·MddExplorer 등)는 이 위임을
 * 거치지 말고 track() 을 직접 부른다 — state 를 함께 실어야 해서 속성으로는 부족하다.
 */
export default function GaEvents() {
  const pathname = usePathname();

  // ── 클릭 위임 ────────────────────────────────────────────────
  // capture 단계에서 받는다. 링크가 새 탭을 열거나 페이지를 떠나는 경우에도
  // 버블링을 기다리지 않고 먼저 잡는다.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.("[data-ga]");
      if (el instanceof HTMLElement && el.dataset.ga) track(el.dataset.ga, gaParams(el));
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // ── 툴팁 열람 ────────────────────────────────────────────────
  // .hz-tip 은 CSS :hover 로만 뜬다(globals.css) — 클릭 이벤트가 아예 없다.
  // 스쳐 지나간 것까지 세면 숫자가 의미를 잃으므로 600ms 이상 머문 것만 '읽었다'로
  // 친다. pointerType 을 같이 보내는 게 핵심이다: 터치 기기에서 :hover 툴팁은
  // 사실상 열리지 않으므로, 모바일 help_open 이 바닥이면 그건 지표 설명이 모바일
  // 사용자에게 닿지 않는다는 뜻이다(설명을 다른 방식으로 노출해야 한다는 근거).
  useEffect(() => {
    const fired = new WeakSet<Element>();
    // 대기 중인 타이머를 따로 들고 있어야 한다. fired 만으로는 막지 못한다 —
    // pointerover 는 버블링이라 물음표 <span> 에서 그 안의 아이콘으로 커서가
    // 1px 만 움직여도 한 번 더 들어오는데, 그때는 아직 600ms 가 안 지나
    // fired 에 없는 상태다. 타이머가 둘 다 살아남아 한 번의 hover 가 두 건으로
    // 잡힌다(실측으로 확인).
    const pending = new WeakMap<Element, number>();
    const onOver = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest?.("[data-ga-tip]");
      if (!(el instanceof HTMLElement) || fired.has(el) || pending.has(el)) return;
      const topic = el.dataset.gaTip;
      if (!topic) return;
      const timer = window.setTimeout(() => {
        pending.delete(el);
        fired.add(el);
        track("help_open", { topic, path: pathname, pointer: e.pointerType || "unknown" });
      }, 600);
      pending.set(el, timer);
      el.addEventListener(
        "pointerleave",
        () => {
          window.clearTimeout(timer);
          pending.delete(el);
        },
        { once: true },
      );
    };
    document.addEventListener("pointerover", onOver, true);
    return () => document.removeEventListener("pointerover", onOver, true);
  }, [pathname]);

  // ── 스크롤 깊이 ──────────────────────────────────────────────
  // GA4 향상된 측정의 scroll 은 90% 한 지점만 쏜다. 지표 카드가 25개라 "어디서
  // 멈추는가"가 중요한데 그건 안 보인다.
  //
  // 스크롤 주체가 window 가 아니라는 점에 주의. 셸이 화면을 꽉 채우고(overflow:hidden)
  // 실제로 스크롤하는 건 main.hz-scroll 이다(AppShell.tsx) — window 에 리스너를 달면
  // 영원히 0건이다.
  useEffect(() => {
    const box = document.querySelector<HTMLElement>("main.hz-scroll");
    if (!box) return;
    const done = new Set<number>();
    const onScroll = () => {
      const max = box.scrollHeight - box.clientHeight;
      if (max <= 0) return;
      const pct = (box.scrollTop / max) * 100;
      for (const mark of [25, 50, 75]) {
        if (pct >= mark && !done.has(mark)) {
          done.add(mark);
          track("scroll_depth", { percent: mark, path: pathname });
        }
      }
    };
    box.addEventListener("scroll", onScroll, { passive: true });
    return () => box.removeEventListener("scroll", onScroll);
  }, [pathname]);

  return null;
}

/** data-ga-foo-bar → { foo_bar: "..." }. dataset 은 카멜케이스로 들어오므로 되돌린다. */
function gaParams(el: HTMLElement) {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(el.dataset)) {
    if (key === "ga" || !key.startsWith("ga") || value == null) continue;
    const name = key
      .slice(2)
      .replace(/^[A-Z]/, (c) => c.toLowerCase())
      .replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
    out[name] = value;
  }
  return out;
}
