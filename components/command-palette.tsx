"use client";

/**
 * ⌘K 검색 창의 본체(shadcn Command + Dialog). 종목·테마를 찾는다 — 화면 목록은 사이드바에 다 있어 뺐다(2026-09-25).
 * **처음 열 때만 받는다** — components/command-menu.tsx 가 next/dynamic 으로 부른다. Base UI 대화상자·cmdk 를 셸에
 * 바로 실으면 모든 화면의 JS 가 gzip 51KB(+23%) 늘었다(2026-09-25 프로덕션 빌드 실측, 홈 222 → 273KB).
 *
 * ## 무엇을 보여 주나 (2026-09-26 개편)
 *
 * 검색어가 비면 목록을 통째로 늘어놓지 않는다(예전엔 테마 42개 + 종목 750개가 그대로 떴다 — 사이드바와 같은 것).
 * 대신 세 묶음이다: **최근 본 종목**(이 기기) · **지금 뜨는 테마**(점유율 증감) · **지금 뜨는 종목**(카더라 급부상).
 * 테마가 종목보다 위다 — 테마 상세 화면이 종목 화면보다 볼 거리가 많다(2026-09-26).
 * 토스증권 웹 검색이 빈 칸에 '인기 주식'·'지금 뜨는 산업'을 두는 것과 같은 자리다.
 *
 * 검색어가 있으면 종목 8줄 · 테마 4줄까지. 순위는 lib/search-rank.ts(MDD 검색창 등급표 + 초성·별명). 두 묶음 중
 * 더 잘 맞는 쪽이 위고 똑같이 맞으면 테마가 위다("반도체" → 테마, "삼성" → 종목). cmdk 의 자체 거르기는 끈다(shouldFilter).
 *
 * 줄 오른쪽 숫자는 우리 자료 하나다 — 종목은 **최근 3일 언급**(종목 화면 히어로의 "최근 3일"과 같은 값), 뜨는
 * 종목은 **평소 대비 배수**, 뜨는 테마는 **점유율 증감**. 무엇을 세는지는 묶음 머리글 오른쪽에 한 번만 적는다.
 * 시세는 싣지 않는다(어디에나 있고 우리 원천도 아니다).
 *
 * ⭐ 미장 종목은 /insider/stock/티커 로 간다 — 그 화면이 카더라 언급 추이로 시작하는 미장 종목 화면이다.
 * ⭐ 줄마다 아이콘을 달지 않는다 — 같은 아이콘이 수십 번 되풀이된다(한 화면 같은 아이콘 두 번 금지).
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { C, MONO } from "@/app/ui";
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
import { RECENT_SHOW, readRecent } from "@/lib/recent-stocks";
import {
  prepareStocks,
  rankStocks,
  rankThemes,
  type PreparedStock,
  type SearchIndex,
  type SearchMarket,
  type SearchStock,
  type SearchTheme,
} from "@/lib/search-rank";
import { THEME_NAMES, US_THEME_NAMES, themeHref, usThemeHref } from "@/lib/theme-href";

type Loaded = SearchIndex | "error" | null;

const ALL_THEMES: SearchTheme[] = [
  ...THEME_NAMES.map((name) => ({ market: "kr" as const, name })),
  ...US_THEME_NAMES.map((name) => ({ market: "us" as const, name })),
];

// lib/stock-page.ts 의 stockHref 는 서버 전용 모듈 안에 있어 여기서 같은 꼴을 따로 만든다.
const stockLink = (market: SearchMarket, code: string) =>
  market === "kr" ? `/stock/${code}` : `/insider/stock/${encodeURIComponent(code)}`;
const themeLink = (t: SearchTheme) => (t.market === "kr" ? themeHref(t.name) : usThemeHref(t.name));
const marketLabel = (m: SearchMarket) => (m === "kr" ? "국장" : "미장");

function toStocks(index: SearchIndex): SearchStock[] {
  return [
    ...index.kr.map(([code, name, mentions]) => ({ market: "kr" as const, code, name, alias: null, mentions })),
    ...index.us.map(([code, name, alias, mentions]) => ({ market: "us" as const, code, name, alias, mentions })),
  ];
}

export default function CommandPalette({
  open,
  setOpen,
  themes,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  themes: boolean;
}) {
  const [index, setIndex] = useState<Loaded>(null);
  const router = useRouter();

  // 처음 열 때 한 번 받는다. 실패하면 창을 닫을 때 비워 두어 다음에 열 때 다시 받는다(onOpenChange).
  useEffect(() => {
    if (!open || index !== null) return;
    let alive = true;
    fetch("/api/search-index")
      .then((r) => (r.ok ? (r.json() as Promise<SearchIndex>) : Promise.reject(new Error(String(r.status)))))
      .then((j) => {
        if (alive) setIndex(j);
      })
      .catch(() => {
        if (alive) setIndex("error");
      });
    return () => {
      alive = false;
    };
  }, [open, index]);

  // 3,000개를 순위용 꼴로 바꾸는 것은 목록을 받을 때 한 번만.
  const prepared = useMemo(() => (index && index !== "error" ? prepareStocks(toStocks(index)) : []), [index]);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router, setOpen],
  );

  return (
    <CommandDialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v && index === "error") setIndex(null);
      }}
      description="찾을 종목·테마를 입력하세요"
      // 폰에서는 위에 붙인다. 화면 1/3 지점(375×812 에서 271px)에서 시작하면 자판이 올라올 때 목록 절반이 가린다.
      className="max-sm:top-4"
    >
      {/* 본체는 열릴 때마다 새로 붙는다(대화상자가 닫히면 내용을 내린다) — 검색어·최근 본 목록이 여기서 새로 시작한다. */}
      <PaletteBody index={index} prepared={prepared} themes={themes} go={go} />
    </CommandDialog>
  );
}

function PaletteBody({
  index,
  prepared,
  themes,
  go,
}: {
  index: Loaded;
  prepared: PreparedStock[];
  themes: boolean;
  go: (href: string) => void;
}) {
  const [q, setQ] = useState("");
  // 열 때 한 번 읽는다. 창이 열린 동안 다른 종목 화면으로 갈 일은 없다(고르면 창이 닫힌다).
  const [recent] = useState(readRecent);

  const byKey = useMemo(() => new Map(prepared.map((p) => [`${p.s.market}:${p.s.code}`, p.s])), [prepared]);
  const ready = index !== null && index !== "error";
  const query = q.trim();

  let body: ReactNode;
  if (!ready) {
    body = (
      <CommandGroup>
        <CommandItem value="status" disabled>
          {index === "error" ? "목록을 불러오지 못했습니다. 창을 닫고 다시 열어 주십시오." : "목록을 불러오는 중입니다"}
        </CommandItem>
      </CommandGroup>
    );
  } else if (!query) {
    const recentStocks = recent
      .map((r) => byKey.get(`${r.market}:${r.code}`) ?? (r.market === "us" ? { market: "us" as const, code: r.code, name: r.code, alias: null, mentions: null } : null))
      .filter((s): s is SearchStock => s !== null)
      .slice(0, RECENT_SHOW);
    body = (
      <>
        {recentStocks.length > 0 && (
          <CommandGroup heading={<Heading title="최근 본 종목" unit="최근 3일 언급" />}>
            {recentStocks.map((s) => (
              <StockRow key={`r:${s.market}:${s.code}`} value={`r:${s.market}:${s.code}`} s={s} note={mentionNote(s.mentions)} go={go} />
            ))}
          </CommandGroup>
        )}
        {/* 테마가 종목보다 먼저다 — 테마 상세 화면이 종목 화면보다 볼 거리가 많다(2026-09-26). */}
        {themes && index.themes.length > 0 && (
          <CommandGroup heading={<Heading title="지금 뜨는 테마" unit="점유율 변화" />}>
            {index.themes.map((t) => (
              <ThemeRow key={`tt:${t.market}:${t.name}`} value={`tt:${t.market}:${t.name}`} t={t} note={`+${t.delta.toFixed(1)}%p`} go={go} />
            ))}
          </CommandGroup>
        )}
        {index.trend.length > 0 && (
          <CommandGroup heading={<Heading title="지금 뜨는 종목" unit="평소 대비" />}>
            {index.trend.map((t) => (
              <StockRow
                key={`t:${t.market}:${t.code}`}
                value={`t:${t.market}:${t.code}`}
                s={{ market: t.market, code: t.code, name: t.name, alias: null, mentions: null }}
                note={t.ratio === null ? "신규 등장" : `${t.ratio.toFixed(1)}배`}
                go={go}
              />
            ))}
          </CommandGroup>
        )}
      </>
    );
  } else {
    const stockHits = rankStocks(prepared, query, 8);
    const themeHits = themes ? rankThemes(ALL_THEMES, query, 4) : [];
    // 더 잘 맞는 쪽이 위고, 똑같이 맞으면 테마가 위다(빈 검색창 순서와 같은 까닭).
    const themesFirst = themeHits.length > 0 && (stockHits.length === 0 || themeHits[0].tier <= stockHits[0].tier);
    const stockGroup = stockHits.length > 0 && (
      <CommandGroup key="stocks" heading={<Heading title="종목" unit="최근 3일 언급" />}>
        {stockHits.map(({ item: s }) => (
          <StockRow key={`s:${s.market}:${s.code}`} value={`s:${s.market}:${s.code}`} s={s} note={mentionNote(s.mentions)} go={go} />
        ))}
      </CommandGroup>
    );
    const themeGroup = themeHits.length > 0 && (
      <CommandGroup key="themes" heading={<Heading title="테마" />}>
        {themeHits.map(({ item: t }) => (
          <ThemeRow key={`h:${t.market}:${t.name}`} value={`h:${t.market}:${t.name}`} t={t} note={null} go={go} />
        ))}
      </CommandGroup>
    );
    body = themesFirst ? [themeGroup, stockGroup] : [stockGroup, themeGroup];
  }

  return (
    <Command shouldFilter={false} loop>
      <CommandInput value={q} onValueChange={setQ} placeholder="종목·테마 검색" />
      {/* rhea 기본 높이(288px)면 빈 검색창의 세 묶음(최대 13줄)이 반쯤 잘린다. 화면이 낮으면 60% 까지만. */}
      <CommandList className="max-h-[min(460px,60vh)]">
        <CommandEmpty>찾는 결과가 없습니다.</CommandEmpty>
        {body}
      </CommandList>
    </Command>
  );
}

/** 3일 언급 수. 못 셌으면(null) 아무것도 안 적는다 — 0 은 "아무도 말 안 했다"는 뜻이라 대신 쓸 수 없다. */
const mentionNote = (m: number | null) => (m === null ? null : `${m.toLocaleString("ko-KR")}회`);

/**
 * 묶음 머리글 — 왼쪽은 이름, 오른쪽은 줄 끝 숫자가 무엇인지.
 * 이름은 사이드바 묶음 머리(NavGroupLabel)와 같은 꼴이다(진한 글자 · 700 · 12px). rhea 기본(회색 · 500)이면
 * 줄 글자보다 흐려서 '최근 본 종목'·'지금 뜨는 종목'이 어디서 갈리는지 안 보였다(2026-09-26).
 * 단위 설명은 회색 그대로 둔다 — 둘 다 진하면 머리글 한 줄이 제목 두 개로 읽힌다.
 */
function Heading({ title, unit }: { title: string; unit?: string }) {
  return (
    <span className="flex items-baseline justify-between gap-3">
      <span style={{ color: C.ink, fontWeight: 700 }}>{title}</span>
      {unit && <span className="font-normal">{unit}</span>}
    </span>
  );
}

/** 이름 곁의 작은 회색 글자(코드·티커·시장). 고른 줄에서는 글자색을 따라간다. */
function Side({ children }: { children: ReactNode }) {
  return (
    <span className="text-muted-foreground group-data-selected/command-item:text-(--c-cold-ink) shrink-0 text-xs" style={{ fontFamily: MONO }}>
      {children}
    </span>
  );
}

function StockRow({ s, note, value, go }: { s: SearchStock; note: string | null; value: string; go: (href: string) => void }) {
  return (
    <CommandItem value={value} onSelect={() => go(stockLink(s.market, s.code))}>
      <span className="min-w-0 truncate">{s.name}</span>
      {/* 이름만으로는 국장·미장이 안 갈린다("메타"·"애플") — 코드·티커를 늘 곁에 둔다.
          이름을 모르는 미장 티커(최근 본 목록에만 있는 것)는 이름 자리가 곧 티커라 한 번만 적는다. */}
      {s.name !== s.code && <Side>{s.code}</Side>}
      {note !== null && <CommandShortcut className="tracking-normal tabular-nums">{note}</CommandShortcut>}
    </CommandItem>
  );
}

/** 테마 줄. 시장을 늘 곁에 적는다 — "금융"은 국장·미장 둘 다 있다. */
function ThemeRow({ t, note, value, go }: { t: SearchTheme; note: string | null; value: string; go: (href: string) => void }) {
  return (
    <CommandItem value={value} onSelect={() => go(themeLink(t))}>
      <span className="min-w-0 truncate">{t.name}</span>
      <Side>{marketLabel(t.market)}</Side>
      {note !== null && <CommandShortcut className="tracking-normal tabular-nums">{note}</CommandShortcut>}
    </CommandItem>
  );
}
