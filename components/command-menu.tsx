"use client";

/**
 * ⌘K(윈도우는 Ctrl+K) 테마·종목 검색의 가벼운 앞단. 셸에 늘 붙어 단축키와 '열어라' 신호만 듣고, 창 본체
 * (components/command-palette.tsx — Base UI 대화상자·cmdk)는 **처음 열 때** 받는다.
 *
 * 사이드바의 '검색' 단추와 폰 탑바의 돋보기는 `openCommandMenu()` 로 창에 이벤트를 던진다.
 * 단추에 마우스를 올리거나 포커스하면 `preloadCommandMenu()` 로 본체를 미리 받아 첫 열림이 늦지 않게 한다.
 */
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const OPEN_EVENT = "hz-command-open";
const loadPalette = () => import("@/components/command-palette");
const CommandPalette = dynamic(loadPalette, { ssr: false });

/** 어디서든 검색 창을 연다(사이드바 단추·탑바 돋보기). */
export function openCommandMenu() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

/** 창 본체를 미리 받는다(열기 직전의 호버·포커스에서). 여러 번 불러도 한 번만 받는다. */
export function preloadCommandMenu() {
  void loadPalette();
}

export function CommandMenu({ themes }: { themes: boolean }) {
  const [open, setOpen] = useState(false);
  // 한 번이라도 열었으면 본체를 계속 둔다(닫는 움직임이 끝까지 보이고, 다시 열 때 받지 않는다).
  const [used, setUsed] = useState(false);

  useEffect(() => {
    const show = (v: boolean) => {
      setOpen(v);
      if (v) setUsed(true);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        setUsed(true);
        setOpen((o) => !o);
      }
    };
    const onOpen = () => show(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  if (!used) return null;
  return <CommandPalette open={open} setOpen={setOpen} themes={themes} />;
}
