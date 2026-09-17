"use client";

// 종목 검색 상자·성향별 칩·더 보기. DividendCalculator.tsx 에서 그대로 옮겨 왔다(store.ts 머리말 참고).

import { useEffect, useMemo, useRef, useState } from "react";
import { gaSearchTerm, track } from "@/lib/ga";
import { C, Icon } from "../ui";
import { StockLogo } from "../StockLogo";
import { type MoreLists, type StockLite } from "./types";
import type { Holding } from "./store";
import { money, pct } from "./format";
import { HOT_YIELD_PCT, SCOPES, scopeOf, Badges, rankMatches } from "./shared";
import type { Scope } from "./shared";

/* ── 검색 ─────────────────────────────────────────────────────────── */
export function SearchBox({ stocks, onPick }: { stocks: StockLite[]; onPick: (code: string) => void }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  // 갈래마다 따로 매긴다 — 결과가 국장·미장·ETF 제목 아래 묶여 뜬다. 한 갈래에 넷씩.
  const groups = useMemo(
    () => SCOPES.map((o) => ({ scope: o, items: rankMatches(stocks.filter((s) => scopeOf(s) === o.key), query, 4) })).filter((g) => g.items.length),
    [stocks, query],
  );
  const matches = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // 검색어는 타이핑이 멎은 뒤 한 번만 보낸다(MDD 의 같은 자리와 같은 이유). matches=0 이
  // 알맹이다 — 목록에 없는 종목(비상장·ETF)을 찾고 있다는 뜻.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const timer = setTimeout(() => track("dividend_search", { query: gaSearchTerm(q), matches: matches.length }), 800);
    return () => clearTimeout(timer);
  }, [query, matches.length]);

  const pick = (code: string) => {
    onPick(code);
    setQuery("");
    setOpen(false);
  };

  return (
    <div ref={boxRef} className="dv-search">
      <div className={`dv-search-box${focused ? " dv-search-box-on" : ""}`}>
        <Icon name="search" style={{ fontSize: 20, color: focused ? C.blue : C.sub }} />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            setFocused(true);
          }}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            // 한글 입력기는 첫 Enter 를 글자 조합을 끝내는 데 쓴다(isComposing). 그때 담으면
            // "삼성전" 까지 친 사람이 삼성전자를 담으려다 삼성전기를 담는다.
            if (e.nativeEvent.isComposing) return;
            if (e.key === "Enter" && matches[0]) pick(matches[0].code);
            if (e.key === "Escape") setOpen(false);
          }}
          placeholder="종목·ETF 이름이나 코드로 찾아 담기"
          aria-label="종목 검색"
          autoComplete="off"
        />
      </div>
      {open && query.trim() !== "" && (
        <div className="dv-search-pop">
          {matches.length ? (
            groups.map((g) => (
              <div key={g.scope.key} className="dv-search-group">
                <div className="dv-search-group-head">{g.scope.label}</div>
                <ul>
                  {g.items.map((s) => (
                    <li key={s.code}>
                      <button type="button" className="hz-row-link hz-pick dv-search-row" onClick={() => pick(s.code)}>
                        <StockLogo code={s.code} name={s.name} market={s.market} />
                        <span className="dv-search-name">{s.name}</span>
                        <Badges s={s} />
                        <span className="dv-search-meta">
                          {s.dps > 0 ? `1주에 ${money(s.dps, s)}${s.yieldPct != null ? ` · ${pct(s.yieldPct)}` : ""}` : s.currency === "USD" ? "공시에서 배당을 못 읽음" : "최근 1년 배당 없음"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          ) : (
            <p className="dv-search-none">찾는 것이 없습니다. 코스피·코스닥 주식 전부, 미국 주식 560종목, ETF 980여 개(미국 33 · 국내는 운용사 가리지 않고 지난 1년 분배가 있는 전부)가 담깁니다.</p>
          )}
        </div>
      )}
    </div>
  );
}

/* ── 앞에 세워 둔 칩 ─────────────────────────────────────────────── */
export function QuickChips({
  label,
  codes,
  byCode,
  holdings,
  onPick,
}: {
  label?: string;
  codes: string[];
  byCode: Map<string, StockLite>;
  holdings: Holding[];
  onPick: (code: string) => void;
}) {
  const held = new Set(holdings.map((h) => h.code));
  const items = codes.map((c) => byCode.get(c)).filter((s): s is StockLite => !!s && !held.has(s.code));
  if (!items.length) return <p className="dv-chips-empty">다 담았습니다. 검색으로 더 찾을 수 있습니다.</p>;
  return (
    <div className="dv-chips">
      {label && <span className="dv-chips-label">{label}</span>}
      {items.map((s) => (
        <button
          key={s.code}
          type="button"
          className="dv-chip"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData("text/plain", s.code);
            e.dataTransfer.effectAllowed = "copy";
          }}
          onClick={() => onPick(s.code)}
          title={`${s.name} 담기`}
        >
          <StockLogo code={s.code} name={s.name} market={s.market} size={18} lazy />
          <span className="dv-chip-name">{s.name}</span>
          {s.yieldPct != null &&
            (s.yieldPct > HOT_YIELD_PCT ? (
              // 일드맥스류 — 칩에서 제일 큰 숫자라 제일 좋은 걸로 읽힌다(2026-09-15 지적). 흐리게 두고 뜻은 툴팁에.
              <span className="dv-chip-yield dv-chip-yield-hot hz-tip hz-tip-wide" data-tip="분배금에 원금을 돌려주는 몫이 섞인 초고배당 ETF입니다. 달마다 크게 흔들립니다.">
                {pct(s.yieldPct)}
              </span>
            ) : (
              <span className="dv-chip-yield">{pct(s.yieldPct)}</span>
            ))}
        </button>
      ))}
    </div>
  );
}

/* ── 더 보기 — 판마다 성격으로 묶은 줄 ─────────────────────────────────
   묶는 규칙은 서버(page.tsx)에 있고 여기는 그리기만. 한 줄은 라벨 + 칩(여덟까지). 담긴 종목은
   QuickChips 가 알아서 뺀다. 묶음 밑 한 줄은 "여기 없는 건 검색으로" — 다 세우지 않았다는 걸 적는다. */

export function MoreRows({
  scope,
  label,
  lists,
  byCode,
  holdings,
  onPick,
  onClose,
}: {
  scope: Scope;
  label: string;
  lists: MoreLists[Scope];
  byCode: Map<string, StockLite>;
  holdings: Holding[];
  onPick: (code: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="dv-more" data-scope={scope} role="region" aria-label={`${label} 더 보기`}>
      <div className="dv-more-head">
        <span className="dv-more-title">{label} 더 보기</span>
        <button type="button" className="dv-more-toggle" onClick={onClose}>
          접기
        </button>
      </div>
      {lists.rows.map((r) => (
        <div key={r.label} className="dv-more-row">
          <span className="dv-more-label">{r.label}</span>
          <QuickChips codes={r.codes} byCode={byCode} holdings={holdings} onPick={onPick} />
        </div>
      ))}
      <p className="dv-more-foot">여기 없는 종목은 위 검색창에서 찾습니다. {lists.note}</p>
    </div>
  );
}
