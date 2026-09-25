"use client";

/**
 * ⌘K 검색 창의 본체(shadcn Command + Dialog). 테마·종목을 찾는다 — 화면 목록은 사이드바에 다 있어 뺐다(2026-09-25 Hun). **처음 열 때만 받는다** — components/command-menu.tsx 가
 * next/dynamic 으로 부른다. Base UI 대화상자·cmdk 를 셸에 바로 실으면 모든 화면의 JS 가 gzip 51KB(+23%) 늘었다
 * (2026-09-25 프로덕션 빌드 실측, 홈 222 → 273KB).
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

type Stock = { code: string; name: string; market: string | null };

export default function CommandPalette({
  open,
  setOpen,
  themes,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  themes: boolean;
}) {
  const [stocks, setStocks] = useState<Stock[] | null>(null);
  const router = useRouter();

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
    [router, setOpen],
  );

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <Command>
        <CommandInput placeholder="테마·종목 검색" />
        <CommandList>
          <CommandEmpty>찾는 결과가 없습니다.</CommandEmpty>
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
