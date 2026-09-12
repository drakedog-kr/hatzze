"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { gaSearchTerm, gaStockCode, track } from "@/lib/ga";
import { C, Icon } from "../ui";
import { SectionHead } from "../kadera/SectionHead";
import { SectionIntro } from "../SectionIntro";
import { StockLogo } from "../StockLogo";
import type { BasketLite, StockLite } from "./types";

/**
 * 배당으로 살기(/dividend) 본체. 서버가 내려준 종목 목록(StockLite)만 갖고 브라우저에서 전부 계산한다.
 *
 * ## 화면의 결
 *
 * 기존 배당 계산기들은 빈 폼으로 시작해 배당수익률을 사용자가 알아서 넣게 한다. 여기서는
 * ① 종목을 담는 순간 결과가 문장으로 먼저 서고(값이 먼저, 입력은 뒤에),
 * ② 수익률을 물어보지 않는다(최근 12개월 배당금이 표에 있다),
 * ③ 세후가 기본이다(계좌에 실제로 찍히는 값). 세전은 토글 하나.
 *
 * ## 담는 길이 셋
 *
 *   검색      이름·코드를 치면 목록이 뜨고 누르면 담긴다
 *   칩·바스켓 줄을 끌어다 놓아도, 눌러도 담긴다(끌기는 마우스에서만 된다 — 폰은 누르기)
 *   바스켓    '내 종목에 담기'로 열 종목이 한꺼번에 들어온다(주수는 투자금 슬라이더로 정해진다)
 *
 * 담긴 종목은 이 브라우저에만 남는다(localStorage). 서버는 아무것도 기억하지 않는다.
 */

type Holding = { code: string; shares: number };

/* ── 담은 종목 저장소 ─────────────────────────────────────────────────
   localStorage 는 React 바깥의 저장소라 useSyncExternalStore 로 읽는다(AppShell 의 PcHint ·
   insider/TapHint 와 같은 이유 — useEffect 안에서 setState 를 부르면 eslint
   react-hooks/set-state-in-effect 에 걸린다). 서버 스냅숏은 빈 목록이라 첫 HTML 은 빈
   채로 그려지고, 구독 직후 한 번 저장값을 읽어 다시 그린다(하이드레이션이 어긋나지 않는다).

   ⚠️ getSnapshot 은 같은 배열 참조를 돌려줘야 한다. 부를 때마다 새 배열을 만들면 React 가
      매 렌더 "바뀌었다"고 보고 무한 렌더에 빠진다. */
const STORAGE_KEY = "hz-dividend-holdings";
const NO_HOLDINGS: Holding[] = [];
let current: Holding[] = NO_HOLDINGS;
let loaded = false;
const listeners = new Set<() => void>();

function readSaved(): Holding[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(parsed)) return NO_HOLDINGS;
    const out = parsed
      .filter((h): h is Holding => !!h && typeof h.code === "string" && typeof h.shares === "number")
      .map((h) => ({ code: h.code, shares: Math.max(0, Math.floor(h.shares)) }));
    return out.length ? out : NO_HOLDINGS;
  } catch {
    // 사파리 사생활 보호 모드 등에서 localStorage 접근이 던진다. 그때는 빈 채로 시작한다.
    return NO_HOLDINGS;
  }
}

const holdingsStore = {
  subscribe(cb: () => void) {
    listeners.add(cb);
    // 구독 직후 한 번 저장값을 읽어 알린다. 마운트 때 반드시 불리므로 매 로드에서 한 번은 읽는다.
    const t = setTimeout(() => {
      if (!loaded) {
        loaded = true;
        current = readSaved();
      }
      cb();
    }, 0);
    return () => {
      clearTimeout(t);
      listeners.delete(cb);
    };
  },
  getSnapshot: () => current,
  getServerSnapshot: () => NO_HOLDINGS,
};

function writeHoldings(next: Holding[] | ((prev: Holding[]) => Holding[])) {
  current = typeof next === "function" ? next(current) : next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    /* 저장이 막힌 브라우저에서는 이번 방문 안에서만 산다 */
  }
  listeners.forEach((l) => l());
}

/** 국내 배당소득세 14% + 지방소득세 1.4%. 증권사가 지급 때 떼고 넣어 준다. */
const TAX_RATE_KR = 0.154;
/** 미국 배당은 미국이 15%를 떼고(한미 조세조약) 국내에서 더 떼지 않는다(금융소득 2천만원 아래). */
const TAX_RATE_US = 0.15;
const taxRate = (s: StockLite) => (s.currency === "USD" ? TAX_RATE_US : TAX_RATE_KR);
/** 종목을 처음 담을 때의 주수. 0 이면 결과가 안 서고, 1 은 값이 너무 작아 감이 안 온다. */
const DEFAULT_SHARES = 10;
/** 바스켓 투자금 슬라이더 눈금(원). */
const AMOUNT_MIN = 1_000_000;
const AMOUNT_MAX = 100_000_000;
const AMOUNT_STEP = 1_000_000;
const AMOUNT_DEFAULT = 10_000_000;
const AMOUNT_QUICK = [10_000_000, 30_000_000, 50_000_000, 100_000_000];
const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/* ── 표기 ─────────────────────────────────────────────────────────── */
const won = (v: number) => `${Math.round(v).toLocaleString("ko-KR")}원`;
/** 큰 금액은 억·만으로 줄인다. 슬라이더 값처럼 딱 떨어지는 수에만 쓴다. */
function wonShort(v: number): string {
  if (v >= 1e8) {
    const eok = Math.floor(v / 1e8);
    const man = Math.round((v - eok * 1e8) / 1e4);
    return man ? `${eok}억 ${man.toLocaleString("ko-KR")}만원` : `${eok}억원`;
  }
  if (v >= 1e4 && v % 1e4 === 0) return `${(v / 1e4).toLocaleString("ko-KR")}만원`;
  return won(v);
}
const usd = (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** 그 종목의 돈 단위로. 미국은 달러, 국내는 원. */
const money = (v: number, s: StockLite) => (s.currency === "USD" ? usd(v) : won(v));
const pct = (v: number) => `${v.toFixed(2)}%`;
/** 파이프라인이 15년치만 읽으므로 연속 배당은 15에서 멈춘다. 그 값은 "적어도 15년"이다. */
const STREAK_CAP = 15;
const streakLabel = (y: number) => (y >= STREAK_CAP ? `${STREAK_CAP}년 넘게` : `${y}년째`);
/* ── 세 갈래 — 국장 · 미장 · ETF ───────────────────────────────────────
   한 검색창에 섞어 두니 SCHD 가 미장인지 ETF 인지, 코카콜라가 어디 있는지 안 보였다(2026-09-12 지적).
   처음엔 탭으로 갈랐는데 "눌러야 보이는 건 별로"라 해서(같은 날) **세 갈래를 늘 나란히** 둔다 —
   칩은 세 판으로, 검색 결과는 갈래 제목 아래 묶어서. */
type Scope = "kr" | "us" | "etf";
const SCOPES: { key: Scope; label: string; desc: string }[] = [
  { key: "kr", label: "국장", desc: "요즘 채널에서 자주 오르내린 배당주" },
  { key: "us", label: "미장", desc: "요즘 채널에서 자주 오르내린 배당주" },
  { key: "etf", label: "ETF", desc: "미국은 많이 드는 순 · 국내는 돈이 들어온 순" },
];
const scopeOf = (s: StockLite): Scope => (s.kind === "etf" ? "etf" : s.currency === "USD" ? "us" : "kr");

/** 줄에 붙는 배지들. 국장·미장·ETF 가 한 표에 섞이므로 **모든 줄에** 어느 갈래인지 붙인다. */
function Badges({ s }: { s: StockLite }) {
  const items =
    s.kind === "etf"
      ? ["ETF", s.currency === "USD" ? "미국" : "국내"]
      : [s.market === "KOSDAQ" ? "코스닥" : s.market === "US" ? "미국" : "코스피"];
  return (
    <>
      {items.map((b) => (
        <span key={b} className="dv-badge">{b}</span>
      ))}
    </>
  );
}

/* ── 검색 ─────────────────────────────────────────────────────────── */
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");
/**
 * 이름 앞부분 일치 → 이름 포함 → 코드 앞부분 순. 같은 등급 안에서는 **큰 회사**부터, 그다음 이름이
 * 짧은 것 — "삼성전" 은 삼성전자(1,600조)가 삼성전기우보다, "KB" 는 KB금융이 KBG 보다 앞에 선다.
 * (배당금 순으로 세웠더니 삼성전기우가, 이름 길이 순으로 세웠더니 KBG 가 맨 위였다.)
 */
function rankMatches(stocks: StockLite[], query: string, limit = 8): StockLite[] {
  const q = norm(query);
  if (!q) return [];
  const starts: StockLite[] = [];
  const includes: StockLite[] = [];
  const codes: StockLite[] = [];
  for (const s of stocks) {
    const name = norm(s.name);
    const alias = s.alias ? norm(s.alias) : "";
    if (name.startsWith(q)) starts.push(s);
    else if (name.includes(q) || (alias && alias.includes(q))) includes.push(s);
    else if (s.code.startsWith(q.toUpperCase())) codes.push(s);
  }
  const closer = (a: StockLite, b: StockLite) => b.cap - a.cap || a.name.length - b.name.length || a.name.localeCompare(b.name, "ko");
  const bigger = (a: StockLite, b: StockLite) => b.cap - a.cap || a.name.localeCompare(b.name, "ko");
  return [...starts.sort(closer), ...includes.sort(bigger), ...codes.sort(bigger)].slice(0, limit);
}

/* ── 셈 ───────────────────────────────────────────────────────────── */
type Line = {
  stock: StockLite;
  shares: number;
  /** 1년 세전 배당, 그 종목의 돈 단위(원 또는 달러). */
  gross: number;
  /** 세금을 뗀 뒤, 그 종목의 돈 단위. 미국 줄이 달러로도 보여 줄 때 쓴다. */
  net: number;
  /** 1년 세전 배당(원). 미국은 환율을 곱한 값. */
  grossKrw: number;
  /** 세금을 뗀 뒤(원). 국내 15.4%, 미국 15%. 세전 모드면 grossKrw 와 같다. */
  netKrw: number;
  /** 투자금(원, 전일 종가 × 주수). 종가가 없으면 null. */
  investKrw: number | null;
};

/**
 * 담은 종목 하나하나의 셈. 미국은 달러를 원으로 옮겨 국내와 한 줄에 더한다 — 환율은 FRED 의
 * 최근 값(1~2영업일 늦다). 세금은 종목마다 다르므로(국내 15.4%·미국 15%) 줄에서 뗀다.
 */
function computeLines(holdings: Holding[], byCode: Map<string, StockLite>, fx: number, afterTax: boolean): Line[] {
  const out: Line[] = [];
  for (const h of holdings) {
    const stock = byCode.get(h.code);
    if (!stock) continue;
    const rate = stock.currency === "USD" ? fx : 1;
    const gross = stock.dps * h.shares;
    const grossKrw = gross * rate;
    const keep = afterTax ? 1 - taxRate(stock) : 1;
    out.push({
      stock,
      shares: h.shares,
      gross,
      net: gross * keep,
      grossKrw,
      netKrw: grossKrw * keep,
      investKrw: stock.close ? stock.close * h.shares * rate : null,
    });
  }
  return out;
}

/** 바스켓을 이 투자금으로 같은 금액씩 나눠 담으면 종목마다 몇 주인가. */
function basketShares(codes: string[], amount: number, byCode: Map<string, StockLite>): Holding[] {
  if (!codes.length) return [];
  const per = amount / codes.length;
  return codes.map((code) => {
    const s = byCode.get(code);
    return { code, shares: s?.close ? Math.floor(per / s.close) : 0 };
  });
}

/* ── 본체 ─────────────────────────────────────────────────────────── */
export function DividendCalculator({
  stocks,
  baskets,
  popular,
  popularUs,
  popularEtf,
  computedFor,
  priceDate,
  usPriceDate,
  usdkrw,
}: {
  stocks: StockLite[];
  baskets: BasketLite[];
  popular: string[];
  popularUs: string[];
  popularEtf: string[];
  computedFor: string | null;
  priceDate: string | null;
  usPriceDate: string | null;
  usdkrw: { rate: number; date: string | null } | null;
}) {
  const byCode = useMemo(() => new Map(stocks.map((s) => [s.code, s])), [stocks]);
  const holdings = useSyncExternalStore(holdingsStore.subscribe, holdingsStore.getSnapshot, holdingsStore.getServerSnapshot);
  const setHoldings = writeHoldings;
  const [afterTax, setAfterTax] = useState(true);
  const [amount, setAmount] = useState(AMOUNT_DEFAULT);
  const chipsBy: Record<Scope, string[]> = { kr: popular, us: popularUs, etf: popularEtf };
  // 주수 칸들. 방금 담은 종목의 칸에 포커스를 주고 값을 통째로 선택해 둔다 — 치면 덮인다.
  // ref 가 아니라 state 에 든 Map 이다 — 렌더 중에 ref.current 를 읽으면 eslint(react-hooks/refs)에
  // 걸리고, Map 자체는 한 번 만들어 그대로 쓰므로 state 로 들고 있어도 다시 그릴 일이 없다.
  const [inputs] = useState(() => new Map<string, HTMLInputElement>());
  const calcRef = useRef<HTMLElement>(null);
  const focusShares = (code: string) =>
    setTimeout(() => {
      const el = inputs.get(code);
      if (el) {
        el.focus();
        el.select();
      }
    }, 0);

  // 환율이 없으면(미국 표가 비었을 때) 미국 종목 자체가 목록에 없다(lib/dividend.ts). 1 은 자리값.
  const fx = usdkrw?.rate ?? 1;
  const lines = useMemo(() => computeLines(holdings, byCode, fx, afterTax), [holdings, byCode, fx, afterTax]);
  const total = lines.reduce((s, l) => s + l.netKrw, 0);
  const invest = lines.reduce((s, l) => s + (l.investKrw ?? 0), 0);
  const priced = lines.filter((l) => l.investKrw != null);
  const yieldPct = invest > 0 ? (priced.reduce((s, l) => s + l.grossKrw, 0) / invest) * 100 : null;
  // 달력에 못 드는 줄 — 지급 달을 모르는 것(미국 주식, 국내 ETF). 배당이 있는 줄만 센다.
  const noCalCount = lines.filter((l) => l.stock.dps > 0 && !l.stock.pays.length).length;
  // 달력은 지급 달을 아는 종목(국내)만. 미국은 공시에 지급일이 없다.
  const monthly = useMemo(() => {
    const m = new Array<number>(13).fill(0);
    for (const l of lines) {
      // 달러 지급 건(미국 ETF)은 환율을 곱해야 원화 달력에 든다 — 빠뜨렸더니 SCHD 3월이 22원으로 찍혔다.
      const f = (afterTax ? 1 - taxRate(l.stock) : 1) * (l.stock.currency === "USD" ? fx : 1);
      for (const [month, amt] of l.stock.pays) m[month] += amt * l.shares * f;
    }
    return m;
  }, [lines, afterTax, fx]);

  const add = (code: string, source: string) => {
    if (!byCode.has(code)) return;
    track("dividend_add", { stock_code: gaStockCode(code), select_source: source });
    setHoldings((prev) => (prev.some((h) => h.code === code) ? prev : [...prev, { code, shares: DEFAULT_SHARES }]));
    focusShares(code);
  };
  const setShares = (code: string, shares: number) =>
    setHoldings((prev) => prev.map((h) => (h.code === code ? { ...h, shares } : h)));
  const remove = (code: string) => {
    track("dividend_remove", { stock_code: gaStockCode(code) });
    setHoldings((prev) => prev.filter((h) => h.code !== code));
  };
  const applyBasket = (b: BasketLite) => {
    const next = basketShares(b.codes, amount, byCode);
    track("dividend_basket_apply", { basket: b.key, amount });
    // 이미 담긴 종목은 주수를 바스켓 값으로 바꾸고, 나머지는 뒤에 붙인다. 통째로 갈아
    // 끼우지 않는다 — 사용자가 손으로 담아 둔 다른 종목이 사라지면 안 된다.
    setHoldings((prev) => {
      const map = new Map(next.map((h) => [h.code, h.shares]));
      const kept = prev.map((h) => (map.has(h.code) ? { ...h, shares: map.get(h.code) as number } : h));
      const seen = new Set(kept.map((h) => h.code));
      return [...kept, ...next.filter((h) => !seen.has(h.code))];
    });
    // 담긴 뒤 결과가 선 자리로 올라간다. 목록이 길어지며 판이 다시 그려지는 것보다 한 박자
    // 뒤여야 한다 — 같은 틱에 부르면 새 레이아웃 전의 자리로 가다 만다(실측).
    setTimeout(() => calcRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  // ── 끌어다 놓기. 칩·바스켓 줄이 dataTransfer 에 코드를 싣고, 계산기 시트가 받는다.
  const [dragOver, setDragOver] = useState(false);
  const onDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes("text/plain")) return;
    e.preventDefault();
    if (!dragOver) setDragOver(true);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const code = e.dataTransfer.getData("text/plain").trim();
    if (byCode.has(code)) add(code, "drop");
  };

  if (!stocks.length) {
    return (
      <div className="hz-tx">
        <section className="hz-sheet">
          <SectionHead icon="calculate" title="아직 자료가 없습니다" desc="파이프라인이 종목별 배당 요약을 만들면 이 자리에 계산기가 뜹니다." level={2} />
        </section>
      </div>
    );
  }

  const basis = [
    priceDate ? `국내는 전일 종가(${priceDate})` : null,
    usdkrw && usPriceDate ? `미국은 ${usPriceDate} 시세와 환율 ${Math.round(usdkrw.rate).toLocaleString("ko-KR")}원(FRED${usdkrw.date ? ` ${usdkrw.date}` : ""})` : null,
    computedFor ? `국내 배당은 ${computedFor}에 정리한 최근 12개월 기록(예탁결제원)` : null,
    "미국 주식·ETF 의 지급일과 금액은 stockanalysis.com",
    "국내 ETF 분배금은 운용사 공시를 옮긴 값(줄에 날짜가 있습니다)",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="hz-tx">
      <SectionIntro n={1} title="내 종목으로 계산" />
      <section
        ref={calcRef}
        className={`hz-sheet dv-calc${dragOver ? " dv-drop-on" : ""}`}
        onDragOver={onDragOver}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        aria-label="내 종목 계산기"
      >
        <SectionHead
          icon="calculate"
          title="내 종목"
          desc="종목을 담고 주수를 적으면 바로 계산됩니다. 담은 종목은 이 브라우저에만 남습니다."
          right={<TaxToggle afterTax={afterTax} onChange={(v) => { track("dividend_tax_toggle", { after_tax: v }); setAfterTax(v); }} />}
        />

        {/* 결과가 먼저 선다. 종목이 없을 때도 이 자리는 비워 두지 않는다 — 무엇을 하면 되는지 적는다. */}
        <div className="dv-hero">
          {lines.length ? (
            <>
              <p className="dv-hero-label">1년에 받는 배당{afterTax ? " (세후)" : " (세전)"}</p>
              <p className="dv-hero-main">{won(total)}</p>
              <p className="dv-hero-sub">
                한 달 평균 {won(total / 12)}
                {invest > 0 && (
                  <>
                    {" · "}투자금 {won(invest)}
                    {yieldPct != null && <>{" · "}수익률 {pct(yieldPct)}</>}
                  </>
                )}
              </p>
            </>
          ) : (
            <>
              <p className="dv-hero-label">1년에 받는 배당</p>
              <p className="dv-hero-main dv-hero-empty">아직 담은 종목이 없습니다</p>
              <p className="dv-hero-sub">아래에서 종목을 찾아 담거나, 바스켓을 통째로 담아 보세요.</p>
            </>
          )}
        </div>

        <div className="dv-body">
          <SearchBox stocks={stocks} onPick={(code) => add(code, "search")} />
          {/* 세 갈래가 늘 나란히 선다. 판마다 제목·설명·칩. 좁으면 한 판씩 쌓인다. */}
          <div className="dv-groups">
            {SCOPES.map((o) => (
              <section key={o.key} className="dv-group" aria-label={o.label}>
                <div className="dv-group-head">
                  <span className="dv-group-title">{o.label}</span>
                  <span className="dv-group-desc">{o.desc}</span>
                </div>
                <QuickChips codes={chipsBy[o.key]} byCode={byCode} holdings={holdings} onPick={(code) => add(code, `chip_${o.key}`)} />
              </section>
            ))}
          </div>
          {lines.length > 0 && (
            <HoldingsTable lines={lines} inputs={inputs} onShares={setShares} onRemove={remove} />
          )}
          {lines.length > 0 && <MonthCalendar monthly={monthly} afterTax={afterTax} noCalCount={noCalCount} />}
        </div>

        <div className="hz-sheet-foot">
          <p className="dv-foot">
            {afterTax
              ? "세금을 뺀 값입니다. 국내는 15.4%(배당소득세 14%와 지방소득세 1.4%), 미국은 미국에서 떼는 15%입니다. "
              : "세금을 빼기 전 값입니다. 실제로는 국내 15.4%, 미국 15%를 떼고 들어옵니다. "}
            {basis && `${basis}. `}
            배당은 회사가 바꿀 수 있고, 지난 1년과 같으리라는 보장은 없습니다. 매수·매도 신호가 아닙니다.
          </p>
        </div>
      </section>

      <SectionIntro n={2} title="성향별 바스켓" />
      <AmountControl amount={amount} onChange={setAmount} />
      <div className="dv-baskets">
        {baskets.map((b) => (
          <BasketSheet key={b.key} basket={b} amount={amount} byCode={byCode} afterTax={afterTax} onApply={() => applyBasket(b)} onPick={(code) => add(code, "basket")} />
        ))}
      </div>
      <p className="dv-note">
        바스켓은 위에 적힌 규칙으로 걸러 같은 금액씩 나눠 담은 것입니다. 추천이 아니라 분류이고, 담은 뒤 종목을 빼고 넣을 수 있습니다. 매수·매도 신호가 아닙니다.
      </p>
    </div>
  );
}

/* ── 세후·세전 ────────────────────────────────────────────────────── */
function TaxToggle({ afterTax, onChange }: { afterTax: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="dv-seg" role="group" aria-label="세금 반영">
      {[
        { on: true, label: "세후" },
        { on: false, label: "세전" },
      ].map((o) => (
        <button key={o.label} type="button" aria-pressed={afterTax === o.on} className="dv-seg-btn" onClick={() => onChange(o.on)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ── 검색 ─────────────────────────────────────────────────────────── */
function SearchBox({ stocks, onPick }: { stocks: StockLite[]; onPick: (code: string) => void }) {
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
            <p className="dv-search-none">찾는 것이 없습니다. 코스피·코스닥 주식 전부, 미국 주식 560종목, ETF 240여 개(미국 33 · TIGER 213)가 담깁니다.</p>
          )}
        </div>
      )}
    </div>
  );
}

/* ── 앞에 세워 둔 칩 ─────────────────────────────────────────────── */
function QuickChips({
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
          <StockLogo code={s.code} name={s.name} market={s.market} size={18} />
          <span className="dv-chip-name">{s.name}</span>
          {s.yieldPct != null && <span className="dv-chip-yield">{pct(s.yieldPct)}</span>}
        </button>
      ))}
    </div>
  );
}

/* ── 담은 종목 표 ─────────────────────────────────────────────────── */
function HoldingsTable({
  lines,
  inputs,
  onShares,
  onRemove,
}: {
  lines: Line[];
  inputs: Map<string, HTMLInputElement>;
  onShares: (code: string, shares: number) => void;
  onRemove: (code: string) => void;
}) {
  return (
    <div className="dv-table" role="table" aria-label="담은 종목">
      <div className="dv-trow dv-thead" role="row">
        <span role="columnheader">종목</span>
        <span role="columnheader">주수</span>
        <span role="columnheader">1주에 1년</span>
        <span role="columnheader">1년에 받는 배당</span>
        <span role="columnheader">수익률</span>
        <span role="columnheader" aria-label="빼기" />
      </div>
      {lines.map((l) => (
        <HoldingRow key={l.stock.code} line={l} inputs={inputs} onShares={onShares} onRemove={onRemove} />
      ))}
    </div>
  );
}

function HoldingRow({
  line,
  inputs,
  onShares,
  onRemove,
}: {
  line: Line;
  inputs: Map<string, HTMLInputElement>;
  onShares: (code: string, shares: number) => void;
  onRemove: (code: string) => void;
}) {
  const { stock: s, shares } = line;

  const notes: string[] = [];
  // 미국은 "없다"고 못 말한다 — 허쉬·디지털리얼티처럼 1주당 배당 태그를 안 다는 회사가 있다.
  if (s.dps === 0) notes.push(s.currency === "USD" ? "미국 공시에서 배당을 못 읽었습니다(안 주는 회사일 수도, 공시에 칸이 없을 수도 있습니다)" : "최근 1년 현금배당이 없습니다");
  if (s.unusual) notes.push("평소보다 큰 배당(특별·청산)이 섞여 있어 1년 뒤에도 같으리라 보기 어렵습니다");
  if (s.kind === "etf") {
    // 미국 ETF 는 stockanalysis 가 매일 준다. 국내 ETF 는 운용사 공시를 손으로 옮긴 값이라 날짜가 붙고,
    // 연도 합계뿐이라 달력에 못 든다.
    if (s.currency === "KRW") {
      notes.push(`분배금은 운용사 공시를 ${s.asOf ?? "최근"}에 옮긴 값입니다${s.estimated ? " · 올해 지급분을 열두 달로 늘린 추정값" : ""}`);
      if (!s.pays.length) notes.push("달마다 얼마인지는 공시에 없어 아래 달력에는 빠집니다");
    }
  } else if (s.estimated) {
    notes.push("공시에 연간 값이 없어 마지막 배당으로 어림한 추정값입니다");
  }
  // 일드맥스(TSLY·MSTY)류. 지난 1년 분배가 가격의 절반을 넘으면 원금을 돌려주는 상품이라 봐야 한다.
  if ((s.yieldPct ?? 0) > 30) notes.push("분배금이 달마다 크게 흔들리고 원금을 돌려주는 몫이 섞인 상품입니다. 지난 1년과 같으리라 보기 어렵습니다");
  if (s.close == null) notes.push("종가가 없어 투자금과 수익률을 못 냅니다");
  if (s.nextRecord) notes.push(`다음 배당기준일 ${s.nextRecord}`);
  if (s.nextPay) notes.push(`다음 지급 ${s.nextPay[0]} · 1주에 ${money(s.nextPay[1], s)}`);
  if (s.kind === "stock" && s.currency === "USD" && s.dps > 0 && !s.pays.length) notes.push("지급일 기록이 없어 아래 달력에는 빠집니다");

  const step = (d: number) => onShares(s.code, Math.max(0, shares + d));
  return (
    <div className="dv-trow" role="row">
      <span className="dv-tcell dv-tname" role="cell">
        <StockLogo code={s.code} name={s.name} market={s.market} />
        <span className="dv-tname-txt">
          <span className="dv-tname-main">
            {s.name}
            <Badges s={s} />
          </span>
          {notes.length > 0 && <span className="dv-tnote">{notes.join(" · ")}</span>}
        </span>
      </span>
      <span className="dv-tcell dv-tshares" role="cell">
        <button type="button" className="dv-step" aria-label={`${s.name} 1주 빼기`} onClick={() => step(-1)} disabled={shares <= 0}>
          −
        </button>
        <input
          ref={(el) => {
            if (el) inputs.set(s.code, el);
            else inputs.delete(s.code);
          }}
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={shares}
          aria-label={`${s.name} 주수`}
          onChange={(e) => {
            const v = Math.floor(Number(e.target.value));
            onShares(s.code, Number.isFinite(v) && v > 0 ? v : 0);
          }}
          onFocus={(e) => e.target.select()}
        />
        <button type="button" className="dv-step" aria-label={`${s.name} 1주 더하기`} onClick={() => step(1)}>
          +
        </button>
      </span>
      <span className="dv-tcell dv-tnum" role="cell">{s.dps > 0 ? money(s.dps, s) : "없음"}</span>
      <span className="dv-tcell dv-tnum dv-tstrong" role="cell">
        {won(line.netKrw)}
        {s.currency === "USD" && s.dps > 0 && <span className="dv-tsub">{usd(line.net)}</span>}
      </span>
      <span className="dv-tcell dv-tnum" role="cell">{s.yieldPct != null ? pct(s.yieldPct) : "·"}</span>
      <span className="dv-tcell" role="cell">
        <button type="button" className="dv-remove" aria-label={`${s.name} 빼기`} onClick={() => onRemove(s.code)}>
          ×
        </button>
      </span>
    </div>
  );
}

/* ── 달마다 얼마 ─────────────────────────────────────────────────── */
function MonthCalendar({ monthly, afterTax, noCalCount }: { monthly: number[]; afterTax: boolean; noCalCount: number }) {
  const max = Math.max(...MONTHS.map((m) => monthly[m]));
  const paidMonths = MONTHS.filter((m) => monthly[m] > 0).length;
  return (
    <div className="dv-cal">
      <div className="dv-cal-head">
        <span className="dv-cal-title">달마다 얼마 들어오나</span>
        <span className="dv-cal-sub">
          {paidMonths ? `1년에 ${paidMonths}달 들어옵니다` : "지급 달을 아는 종목이 없습니다"} · 최근 12개월 지급일 기준{afterTax ? " · 세후" : " · 세전"}
          {noCalCount > 0 && ` · ${noCalCount}종목은 지급 달을 몰라 뺐습니다`}
        </span>
      </div>
      <div className="dv-cal-grid">
        {MONTHS.map((m) => {
          const v = monthly[m];
          return (
            <div key={m} className={`dv-cal-cell${v > 0 ? " dv-cal-on" : ""}`}>
              <span className="dv-cal-bar" style={{ height: max > 0 ? `${Math.max(v > 0 ? 6 : 0, (v / max) * 100)}%` : 0 }} aria-hidden="true" />
              <span className="dv-cal-month">{m}월</span>
              <span className="dv-cal-amt">{v > 0 ? won(v) : "·"}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── 바스켓 투자금 ────────────────────────────────────────────────── */
function AmountControl({ amount, onChange }: { amount: number; onChange: (v: number) => void }) {
  return (
    <div className="hz-sheet dv-amount">
      <div className="dv-amount-head">
        <span className="dv-amount-label">투자금</span>
        <span className="dv-amount-val">{wonShort(amount)}</span>
        <span className="dv-amount-quick">
          {AMOUNT_QUICK.map((v) => (
            <button key={v} type="button" className={`dv-quick${amount === v ? " dv-quick-on" : ""}`} onClick={() => onChange(v)} aria-pressed={amount === v}>
              {wonShort(v)}
            </button>
          ))}
        </span>
      </div>
      <input
        type="range"
        min={AMOUNT_MIN}
        max={AMOUNT_MAX}
        step={AMOUNT_STEP}
        value={amount}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="바스켓 투자금"
        aria-valuetext={wonShort(amount)}
        className="dv-range"
      />
      <p className="dv-amount-note">이 돈을 열 종목에 같은 금액씩 나눠 담으면 종목마다 몇 주가 되는지로 계산합니다.</p>
    </div>
  );
}

/* ── 바스켓 시트 ─────────────────────────────────────────────────── */
function BasketSheet({
  basket,
  amount,
  byCode,
  afterTax,
  onApply,
  onPick,
}: {
  basket: BasketLite;
  amount: number;
  byCode: Map<string, StockLite>;
  afterTax: boolean;
  onApply: () => void;
  onPick: (code: string) => void;
}) {
  const holdings = basketShares(basket.codes, amount, byCode);
  // 바스켓은 국내 종목뿐이라 환율은 1 이다.
  const lines = computeLines(holdings, byCode, 1, afterTax);
  const net = lines.reduce((s, l) => s + l.netKrw, 0);
  const gross = lines.reduce((s, l) => s + l.grossKrw, 0);
  const invest = lines.reduce((s, l) => s + (l.investKrw ?? 0), 0);
  const y = invest > 0 ? (gross / invest) * 100 : null;
  return (
    <section className="hz-sheet dv-basket" aria-label={basket.title}>
      <SectionHead icon={basket.icon} title={basket.title} desc={basket.desc} />
      {lines.length ? (
        <>
          <div className="dv-basket-sum">
            <p className="dv-basket-main">{won(net)}</p>
            <p className="dv-basket-sub">
              1년에{afterTax ? " 세후" : " 세전"} · 한 달 평균 {won(net / 12)}
              {y != null && ` · 수익률 ${pct(y)}`}
            </p>
          </div>
          <ul className="dv-basket-list">
            {lines.map((l, i) => (
              <li key={l.stock.code}>
                <button
                  type="button"
                  className="hz-row-link hz-pick dv-basket-row"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", l.stock.code);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  onClick={() => onPick(l.stock.code)}
                  title={`${l.stock.name} 내 종목에 담기`}
                >
                  <span className="dv-rank">{i + 1}</span>
                  <StockLogo code={l.stock.code} name={l.stock.name} market={l.stock.market} />
                  <span className="dv-basket-name">{l.stock.name}</span>
                  <span className="dv-basket-meta">
                    {basket.key === "growth" && l.stock.growth5 != null
                      ? `연 ${l.stock.growth5.toFixed(0)}% 성장`
                      : basket.key === "steady"
                        ? streakLabel(l.stock.streak)
                        : l.stock.yieldPct != null
                          ? pct(l.stock.yieldPct)
                          : ""}
                  </span>
                  <span className="dv-basket-shares">{l.shares.toLocaleString("ko-KR")}주</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="dv-basket-foot">
            <p className="dv-basket-rule">규칙 · {basket.rule}</p>
            <button type="button" className="dv-apply" onClick={onApply}>
              내 종목에 담기
            </button>
          </div>
        </>
      ) : (
        <p className="dv-basket-none">오늘은 이 규칙에 드는 종목이 없습니다.</p>
      )}
    </section>
  );
}
