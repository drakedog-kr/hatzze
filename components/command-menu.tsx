"use client";

/**
 * ⌘K(윈도우는 Ctrl+K) 검색. 화면·테마·종목으로 바로 간다.
 *
 * shadcn/ui 의 Command + Dialog 로 짰다(components/ui/*). 사이드바의 '검색' 단추와 폰 탑바의 돋보기도
 * 같은 창을 연다 — `openCommandMenu()` 가 창에 이벤트를 던지고 여기서 받는다.
 *
 * ⭐ 종목 목록은 창을 처음 열 때 받는다(app/api/search-index). 화면 HTML 에 싣지 않는다.
 * ⭐ 줄마다 아이콘을 달지 않는다 — 같은 아이콘이 수십 번 되풀이된다(한 화면 같은 아이콘 두 번 금지).
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { THEME_NAMES, US_THEME_NAMES, themeHref, usThemeHref } from "@/lib/theme-href";

export type CommandPage = { label: string; href: string };
type Stock = { code: string; name: string; market: string | null };

const OPEN_EVENT = "hz-command-open";

/** 어디서든 검색 창을 연다(사이드바 단추·탑바 돋보기). */
export function openCommandMenu() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export function CommandMenu({ pages, themes }: { pages: CommandPage[]; themes: boolean }) {
  const [open, setOpen] = useState(false);
  const [stocks, setStocks] = useState<Stock[] | null>(null);
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    if (!open || stocks !== null) return;
    let alive = true;
    fetch("/api/search-index")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { stocks?: Stock[] } | null) => {
        if (alive) setStocks(j?.stocks ?? []);
      })
      .catch(() => {
        if (alive) setStocks([]);
      });
    return () => {
      alive = false;
    };
  }, [open, stocks]);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <Command>
        <CommandInput placeholder="화면·테마·종목 검색" />
        <CommandList>
          <CommandEmpty>찾는 결과가 없습니다.</CommandEmpty>
          <CommandGroup heading="화면">
            {pages.map((p) => (
              <CommandItem key={p.href} value={`화면 ${p.label}`} onSelect={() => go(p.href)}>
                {p.label}
              </CommandItem>
            ))}
          </CommandGroup>
          {themes && (
          <CommandGroup heading="국장 테마">
            {THEME_NAMES.map((t) => (
              <CommandItem key={t} value={`국장 테마 ${t}`} onSelect={() => go(themeHref(t))}>
                {t}
              </CommandItem>
            ))}
          </CommandGroup>
          )}
          {themes && (
          <CommandGroup heading="미장 테마">
            {US_THEME_NAMES.map((t) => (
              <CommandItem key={t} value={`미장 테마 ${t}`} onSelect={() => go(usThemeHref(t))}>
                {t}
              </CommandItem>
            ))}
          </CommandGroup>
          )}
          <CommandGroup heading="종목">
            {stocks === null ? (
              <CommandItem value="종목 목록을 불러오는 중" disabled>
                종목 목록을 불러오는 중입니다
              </CommandItem>
            ) : (
              stocks.map((s) => (
                <CommandItem key={s.code} value={`${s.name} ${s.code}`} onSelect={() => go(`/stock/${s.code}`)}>
                  {s.name}
                  <CommandShortcut>{s.code}</CommandShortcut>
                </CommandItem>
              ))
            )}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
