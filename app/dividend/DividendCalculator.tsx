"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { gaSearchTerm, gaStockCode, track } from "@/lib/ga";
import { C, Icon } from "../ui";
import { SectionHead } from "../kadera/SectionHead";
import { SectionIntro } from "../SectionIntro";
import { StockLogo } from "../StockLogo";
import type { BasketLite, MoreLists, StockLite } from "./types";

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

/* ── 세금 ─────────────────────────────────────────────────────────────
   어느 계좌에 담느냐로 세금이 갈린다. 네 가지 — 세전 · 일반 계좌 · ISA · 연금 계좌(연금저축·IRP).
   계좌마다 담을 수 있는 것이 다르다: ISA 는 국내 상장 주식·ETF 만(해외 주식 직접 보유 불가),
   연금 계좌는 국내 상장 ETF 만(개별 주식 불가). 못 담는 줄은 일반 계좌 세율로 세고 줄에 그렇게 적는다.
   2026-09 기준 수치 — 바뀌면 여기와 아래 안내문을 같이 고칠 것. */
type TaxMode = "gross" | "general" | "isa" | "pension";
/** 국내 배당소득세 14% + 지방소득세 1.4%. 증권사가 지급 때 떼고 넣어 준다. */
const TAX_RATE_KR = 0.154;
/** 미국 배당은 미국이 15%를 떼고(한미 조세조약) 국내에서 더 떼지 않는다(금융소득 2천만원 아래). */
const TAX_RATE_US = 0.15;
/** ISA 안의 국내 배당은 만기 때 순이익에 9.9%(비과세 한도를 넘는 몫). 2026년부터 한도는 일반형 500만원·서민형 1,000만원. */
const TAX_RATE_ISA = 0.099;
const ISA_FREE = 5_000_000;
const ISA_FREE_LOW = 10_000_000;
/** 연금 계좌는 받을 때까지 안 떼고, 연금으로 받을 때 연금소득세 — 55~69세 5.5%, 70대 4.4%, 80세부터 3.3%. 가장 높은 값으로 센다. */
const TAX_RATE_PENSION = 0.055;
/** 금융소득 종합과세 문턱(원). 이자·배당 합이 이걸 넘으면 넘는 몫이 다른 소득과 합쳐 누진세율(6~45%)이다. */
const COMPOSITE_FROM = 20_000_000;
/** 문턱 안내를 히어로에 띄우기 시작하는 세전 배당. 그 아래선 어차피 원천징수로 끝나 문턱 얘기가 뜻이 없다. */
const COMPOSITE_NOTE_FROM = 10_000_000;

/** 이 계좌에 담을 수 있는 종목인가. */
function fitsAccount(s: StockLite, mode: TaxMode): boolean {
  if (mode === "isa") return s.currency === "KRW";
  if (mode === "pension") return s.kind === "etf" && s.currency === "KRW";
  return true;
}
/** 줄의 세율. 못 담는 줄은 일반 계좌로. */
function taxRate(s: StockLite, mode: TaxMode): number {
  if (mode === "gross") return 0;
  if (mode === "isa" && fitsAccount(s, mode)) return TAX_RATE_ISA;
  if (mode === "pension" && fitsAccount(s, mode)) return TAX_RATE_PENSION;
  return s.currency === "USD" ? TAX_RATE_US : TAX_RATE_KR;
}
const TAX_MODES: { key: TaxMode; label: string; short: string }[] = [
  { key: "general", label: "일반 계좌", short: "세후" },
  { key: "isa", label: "ISA", short: "세후 · ISA" },
  { key: "pension", label: "연금 계좌", short: "세후 · 연금" },
  { key: "gross", label: "세전", short: "세전" },
];
const taxShort = (mode: TaxMode) => TAX_MODES.find((m) => m.key === mode)?.short ?? "";
/** 종목을 처음 담을 때의 주수. 0 이면 결과가 안 서고, 1 은 값이 너무 작아 감이 안 온다. */
const DEFAULT_SHARES = 10;
/** 목표 월 배당의 기본값(만원)과 매달 더 넣는 돈의 기본값(만원). 파이어족 글에서 가장 자주 나오는 숫자. */
const GOAL_DEFAULT_MAN = 100;
const ADD_DEFAULT_MAN = 50;
/** 빈 달 채우기의 줄마다 칩 수. '더 보기' 묶음과 같다. */
const ROW_CHIPS = 8;
/** 다가오는 일정의 줄 수 상한과, 지난해 지급일로 어림한 것을 얼마나 앞까지 보여 주나(날). */
const UPCOMING_MAX = 6;
const UPCOMING_DAYS = 92;
/** 목표까지 몇 달인지 셀 때의 상한(달). 넘으면 "이 속도로는 안 닿는다"로 적는다. */
const GOAL_MAX_MONTHS = 50 * 12;
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
/** 달력 칸의 금액 — 열두 칸이라 자리가 좁다. 백만 원부터는 만 단위로 줄인다(7,439,641원 → 744만원). */
const wonCal = (v: number) => (v >= 1e8 ? `${(v / 1e8).toFixed(1)}억원` : v >= 1e6 ? `${Math.round(v / 1e4).toLocaleString("ko-KR")}만원` : won(v));
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
  // 고배당기업(배당소득 분리과세 대상)으로 공시한 국내 회사. 뜻은 담은 줄의 안내문에.
  if (s.highDiv) items.push("분리과세");
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
  /** 고른 계좌에 못 담는 종목이라 일반 계좌 세율로 셌다(ISA 의 해외 주식, 연금 계좌의 개별 주식). */
  outside: boolean;
};

/**
 * 담은 종목 하나하나의 셈. 미국은 달러를 원으로 옮겨 국내와 한 줄에 더한다 — 환율은 FRED 의
 * 최근 값(1~2영업일 늦다). 세금은 종목마다 다르므로(국내 15.4%·미국 15%) 줄에서 뗀다.
 */
function computeLines(holdings: Holding[], byCode: Map<string, StockLite>, fx: number, mode: TaxMode): Line[] {
  const out: Line[] = [];
  for (const h of holdings) {
    const stock = byCode.get(h.code);
    if (!stock) continue;
    const rate = stock.currency === "USD" ? fx : 1;
    const gross = stock.dps * h.shares;
    const grossKrw = gross * rate;
    const keep = 1 - taxRate(stock, mode);
    out.push({
      stock,
      shares: h.shares,
      gross,
      net: gross * keep,
      grossKrw,
      netKrw: grossKrw * keep,
      investKrw: stock.close ? stock.close * h.shares * rate : null,
      outside: mode !== "gross" && !fitsAccount(stock, mode),
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
  more,
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
  more: MoreLists;
  computedFor: string | null;
  priceDate: string | null;
  usPriceDate: string | null;
  usdkrw: { rate: number; date: string | null } | null;
}) {
  const byCode = useMemo(() => new Map(stocks.map((s) => [s.code, s])), [stocks]);
  const holdings = useSyncExternalStore(holdingsStore.subscribe, holdingsStore.getSnapshot, holdingsStore.getServerSnapshot);
  const setHoldings = writeHoldings;
  const [taxMode, setTaxMode] = useState<TaxMode>("general");
  // 목표 월 배당(만원)과 매달 더 넣는 돈(만원). 저장하지 않는다 — 담은 종목과 달리 한 번 보는 값이다.
  const [goalMan, setGoalMan] = useState(GOAL_DEFAULT_MAN);
  const [addMan, setAddMan] = useState(ADD_DEFAULT_MAN);
  // 달력에서 누른 달 — 그 달에 주는 종목을 아래에 세운다(빈 달 채우기).
  const [fillMonth, setFillMonth] = useState<number | null>(null);
  const [amount, setAmount] = useState(AMOUNT_DEFAULT);
  const chipsBy: Record<Scope, string[]> = { kr: popular, us: popularUs, etf: popularEtf };
  // 빈 달 채우기의 후보 순서 — 칩과 '더 보기' 묶음에 선 것(서버가 고른 순)이 먼저, 그다음은 나머지 전부를
  // 국장은 시총 순, 미장·ETF 는 수익률 순(미장 10%·ETF 30% 초과는 뺀다 — 원금 반환·mREIT 두 자릿수).
  const fillOrder = useMemo(() => {
    const out: Record<Scope, StockLite[]> = { kr: [], us: [], etf: [] };
    const chips: Record<Scope, string[]> = { kr: popular, us: popularUs, etf: popularEtf };
    for (const k of ["kr", "us", "etf"] as Scope[]) {
      const seen = new Set<string>();
      const push = (s: StockLite | undefined) => {
        if (s && !seen.has(s.code)) {
          seen.add(s.code);
          out[k].push(s);
        }
      };
      for (const c of chips[k]) push(byCode.get(c));
      for (const r of more[k].rows) for (const c of r.codes) push(byCode.get(c));
      const rest = stocks.filter((s) => scopeOf(s) === k && s.dps > 0 && !seen.has(s.code));
      if (k === "kr") rest.filter((s) => s.cap >= 3_000 && (s.yieldPct ?? 0) >= 2 && !s.unusual).sort((a, b) => b.cap - a.cap).forEach(push);
      else rest.filter((s) => (s.yieldPct ?? 0) >= (k === "us" ? 1.5 : 2) && (s.yieldPct ?? 0) <= (k === "us" ? 10 : 30)).sort((a, b) => (b.yieldPct ?? 0) - (a.yieldPct ?? 0)).forEach(push);
    }
    return out;
  }, [stocks, byCode, more, popular, popularUs, popularEtf]);
  // '더 보기'는 한 판만 열린다 — 세 판이 다 펼쳐지면 칩이 백 개다.
  const [moreOpen, setMoreOpen] = useState<Scope | null>(null);
  const toggleMore = (k: Scope) => {
    setMoreOpen((cur) => (cur === k ? null : k));
    if (moreOpen !== k) track("dividend_more", { scope: k });
  };
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
  const lines = useMemo(() => computeLines(holdings, byCode, fx, taxMode), [holdings, byCode, fx, taxMode]);
  const total = lines.reduce((s, l) => s + l.netKrw, 0);
  const invest = lines.reduce((s, l) => s + (l.investKrw ?? 0), 0);
  const priced = lines.filter((l) => l.investKrw != null);
  const yieldPct = invest > 0 ? (priced.reduce((s, l) => s + l.grossKrw, 0) / invest) * 100 : null;
  // 금융소득 종합과세 문턱과 고배당기업(분리과세 대상) 배당의 몫. 세전 합이 문턱 근처인 사람에게만 뜻이 있어 그때만 적는다.
  const sepGross = lines.filter((l) => l.stock.highDiv).reduce((s, l) => s + l.grossKrw, 0);
  const grossAll = lines.reduce((s, l) => s + l.grossKrw, 0);
  const outsideCount = lines.filter((l) => l.outside).length;
  const heroNote = taxNote(taxMode, grossAll, sepGross, outsideCount);
  // 달력에 못 드는 줄 — 지급 달을 모르는 것(미국 주식, 국내 ETF). 배당이 있는 줄만 센다.
  const noCalCount = lines.filter((l) => l.stock.dps > 0 && !l.stock.pays.length).length;
  // 달력은 지급 달을 아는 종목(국내)만. 미국은 공시에 지급일이 없다.
  const monthly = useMemo(() => {
    const m = new Array<number>(13).fill(0);
    for (const l of lines) {
      // 달러 지급 건(미국 ETF)은 환율을 곱해야 원화 달력에 든다 — 빠뜨렸더니 SCHD 3월이 22원으로 찍혔다.
      const f = (1 - taxRate(l.stock, taxMode)) * (l.stock.currency === "USD" ? fx : 1);
      for (const [month, amt] of l.stock.pays) m[month] += amt * l.shares * f;
    }
    return m;
  }, [lines, taxMode, fx]);

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
    "국내 ETF 분배금은 미래에셋 TIGER 분배 내역(줄에 날짜가 있습니다)",
    "고배당기업(분리과세 대상) 여부와 국내 배당성향은 KRX KIND(기업가치 제고 계획 공시·배당정보), 미국 배당성향은 stockanalysis.com",
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
          right={<TaxToggle mode={taxMode} onChange={(v) => { track("dividend_tax_toggle", { mode: v }); setTaxMode(v); }} />}
        />

        {/* 결과가 먼저 선다. 종목이 없을 때도 이 자리는 비워 두지 않는다 — 무엇을 하면 되는지 적는다. */}
        <div className="dv-hero">
          {lines.length ? (
            <>
              <p className="dv-hero-label">1년에 받는 배당 ({taxShort(taxMode)})</p>
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
              {heroNote && <p className="dv-hero-note">{heroNote}</p>}
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
          {/* 세 갈래가 늘 나란히 선다. 판마다 제목·설명·칩 여덟·'더 보기'. 좁으면 한 판씩 쌓인다.
              '더 보기'를 열면 그 판의 묶음들이 세 판 **아래에 가로로** 펼쳐진다(좁은 판 안에 여덟씩 네 줄을
              넣으면 열 줄 넘게 늘어난다). 폰에서는 CSS order 로 그 판 바로 아래에 붙는다. */}
          <div className="dv-groups">
            {SCOPES.map((o) => (
              <section key={o.key} className="dv-group" data-scope={o.key} aria-label={o.label}>
                <div className="dv-group-head">
                  <span className="dv-group-title">{o.label}</span>
                  <span className="dv-group-desc">{o.desc}</span>
                </div>
                <QuickChips codes={chipsBy[o.key]} byCode={byCode} holdings={holdings} onPick={(code) => add(code, `chip_${o.key}`)} />
                {more[o.key].rows.length > 0 && (
                  <button type="button" className="dv-more-toggle" aria-expanded={moreOpen === o.key} onClick={() => toggleMore(o.key)}>
                    {moreOpen === o.key ? "접기" : "더 보기"}
                  </button>
                )}
              </section>
            ))}
            {moreOpen && (
              <MoreRows
                scope={moreOpen}
                label={SCOPES.find((o) => o.key === moreOpen)?.label ?? ""}
                lists={more[moreOpen]}
                byCode={byCode}
                holdings={holdings}
                onPick={(code) => add(code, `more_${moreOpen}`)}
                onClose={() => setMoreOpen(null)}
              />
            )}
          </div>
          {lines.length > 0 && (
            <HoldingsTable lines={lines} inputs={inputs} onShares={setShares} onRemove={remove} />
          )}
          {lines.length > 0 && <Upcoming lines={lines} fx={fx} mode={taxMode} />}
          {lines.length > 0 && (
            <MonthCalendar
              monthly={monthly}
              taxLabel={taxShort(taxMode)}
              noCalCount={noCalCount}
              selected={fillMonth}
              onPick={(m) => {
                setFillMonth((cur) => (cur === m ? null : m));
                if (fillMonth !== m) track("dividend_fill_month", { month: m });
              }}
            />
          )}
          {lines.length > 0 && fillMonth != null && (
            <MonthFill month={fillMonth} order={fillOrder} holdings={holdings} onPick={(code) => add(code, "fill_month")} onClose={() => setFillMonth(null)} />
          )}
          {lines.length > 0 && invest > 0 && total > 0 && (
            <GoalBox invest={invest} net={total} taxLabel={taxShort(taxMode)} goalMan={goalMan} addMan={addMan} onGoal={setGoalMan} onAdd={setAddMan} />
          )}
        </div>

        <div className="hz-sheet-foot">
          <p className="dv-foot">
            {TAX_FOOT[taxMode]}
            {basis && `${basis}. `}
            배당은 회사가 바꿀 수 있고, 지난 1년과 같으리라는 보장은 없습니다. 매수·매도 신호가 아닙니다.
          </p>
        </div>
      </section>

      <SectionIntro n={2} title="성향별 바스켓" />
      <AmountControl amount={amount} onChange={setAmount} />
      <div className="dv-baskets">
        {baskets.map((b) => (
          <BasketSheet key={b.key} basket={b} amount={amount} byCode={byCode} mode={taxMode} onApply={() => applyBasket(b)} onPick={(code) => add(code, "basket")} />
        ))}
      </div>
      <p className="dv-note">
        바스켓은 위에 적힌 규칙으로 걸러 같은 금액씩 나눠 담은 것입니다. 추천이 아니라 분류이고, 담은 뒤 종목을 빼고 넣을 수 있습니다. 매수·매도 신호가 아닙니다.
      </p>
    </div>
  );
}

/* ── 세후·세전 ────────────────────────────────────────────────────── */
function TaxToggle({ mode, onChange }: { mode: TaxMode; onChange: (v: TaxMode) => void }) {
  return (
    <div className="dv-seg" role="group" aria-label="세금 · 계좌">
      {TAX_MODES.map((o) => (
        <button key={o.key} type="button" aria-pressed={mode === o.key} className="dv-seg-btn" onClick={() => onChange(o.key)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** 바닥글의 세금 설명 — 어떻게 셌는지를 계좌마다 글자로. */
const TAX_FOOT: Record<TaxMode, string> = {
  general: "일반 계좌로 셌습니다. 국내는 15.4%(배당소득세 14%와 지방소득세 1.4%), 미국은 미국에서 떼는 15%입니다. ",
  isa: `ISA로 셌습니다. 국내 주식·ETF 배당은 9.9%인데 만기까지 ${wonShort(ISA_FREE)}(서민형 ${wonShort(ISA_FREE_LOW)})은 아예 비과세라 실제 세금은 이보다 적습니다. 해외 주식은 ISA에 못 담아 일반 계좌(15%)로 셌습니다. `,
  pension: "연금 계좌(연금저축·IRP)로 셌습니다. 국내 ETF 분배금은 받을 때까지 세금 없이 굴러가고 연금으로 받을 때 5.5%(55~69세 · 70대 4.4% · 80세부터 3.3%)를 뗍니다. 주식은 연금 계좌에 못 담아 일반 계좌(15.4%·15%)로 셌습니다. ",
  gross: "세금을 빼기 전 값입니다. 실제로는 국내 15.4%, 미국 15%를 떼고 들어옵니다. ",
};

/**
 * 히어로 아래 한 줄 — 금융소득 종합과세 문턱(2,000만원)까지 얼마 남았나, 넘으면 어떻게 되나, 고배당기업 배당을
 * 분리과세로 빼면 어떻게 되나. 세전 합이 1,000만원을 넘을 때만 적는다. 다른 이자·배당은 모르니 그 말도 적는다.
 * ISA·연금 계좌는 문턱과 무관하다(계좌 안 소득은 금융소득에 안 합친다) — 그 계좌에 못 담은 줄이 있을 때만 적는다.
 */
function taxNote(mode: TaxMode, grossAll: number, sepGross: number, outsideCount: number): string | null {
  if (mode === "isa" || mode === "pension") {
    if (!outsideCount) return null;
    return mode === "isa"
      ? `${outsideCount}종목은 해외 주식이라 ISA에 못 담아 일반 계좌로 셌습니다.`
      : `${outsideCount}종목은 주식이라 연금 계좌에 못 담아 일반 계좌로 셌습니다(연금 계좌엔 국내 ETF만 담깁니다).`;
  }
  if (grossAll < COMPOSITE_NOTE_FROM) return null;
  if (grossAll < COMPOSITE_FROM) {
    return `세전 ${won(grossAll)}입니다. 금융소득 종합과세 문턱 ${wonShort(COMPOSITE_FROM)}까지 ${won(COMPOSITE_FROM - grossAll)} 남았습니다(다른 이자·배당은 안 넣은 값).`;
  }
  const over = grossAll - COMPOSITE_FROM;
  if (sepGross <= 0) {
    return `세전 ${won(grossAll)}으로 금융소득 종합과세 문턱 ${wonShort(COMPOSITE_FROM)}을 넘습니다. 넘는 ${won(over)}은 다른 소득과 합쳐 누진세율(6~45%)로 과세됩니다.`;
  }
  const rest = grossAll - sepGross;
  const restOver = rest - COMPOSITE_FROM;
  return (
    `세전 ${won(grossAll)}으로 금융소득 종합과세 문턱 ${wonShort(COMPOSITE_FROM)}을 넘습니다. ` +
    `이 중 고배당기업 배당 ${won(sepGross)}을 분리과세(2,000만원까지 15.4% · 3억까지 22%)로 신청하면 ` +
    (restOver > 0
      ? `나머지 ${won(rest)} 가운데 문턱을 넘는 ${won(restOver)}만 다른 소득과 합쳐 과세됩니다.`
      : `나머지 ${won(rest)}은 문턱 아래라 종합과세를 피합니다.`)
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
            <p className="dv-search-none">찾는 것이 없습니다. 코스피·코스닥 주식 전부, 미국 주식 560종목, ETF 240여 개(미국 33 · TIGER 212)가 담깁니다.</p>
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

/* ── 더 보기 — 판마다 성격으로 묶은 줄 ─────────────────────────────────
   묶는 규칙은 서버(page.tsx)에 있고 여기는 그리기만. 한 줄은 라벨 + 칩(여덟까지). 담긴 종목은
   QuickChips 가 알아서 뺀다. 묶음 밑 한 줄은 "여기 없는 건 검색으로" — 다 세우지 않았다는 걸 적는다. */
function MoreRows({
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
  if (line.outside) notes.push(s.currency === "USD" ? "해외 주식은 ISA·연금 계좌에 못 담아 일반 계좌(15%)로 셌습니다" : "개별 주식은 연금 계좌에 못 담아 일반 계좌(15.4%)로 셌습니다");
  // 미국은 "없다"고 못 말한다 — 허쉬·디지털리얼티처럼 1주당 배당 태그를 안 다는 회사가 있다.
  if (s.dps === 0) notes.push(s.currency === "USD" ? "미국 공시에서 배당을 못 읽었습니다(안 주는 회사일 수도, 공시에 칸이 없을 수도 있습니다)" : "최근 1년 현금배당이 없습니다");
  if (s.unusual) notes.push("평소보다 큰 배당(특별·청산)이 섞여 있어 1년 뒤에도 같으리라 보기 어렵습니다");
  // 고배당기업 공시(KIND 목록). 회사가 스스로 적은 것을 옮긴 것이라 '해당'이라고만 적고 판정하지 않는다.
  if (s.highDiv) notes.push("고배당기업으로 공시한 회사입니다. 2026~2028년에 받는 배당은 2,000만원을 넘어도 종합과세에 합치지 않고 분리과세(14~30%)를 신청할 수 있습니다");
  // 배당성향 — 이익의 몇 %를 배당으로 줬나. 100% 를 넘으면 번 것보다 많이 준 것이라 따로 적는다.
  if (s.payout) {
    const [year, p] = s.payout;
    const when = year != null ? `${year}년` : "지난 12개월";
    const pctText = `${Math.round(p).toLocaleString("ko-KR")}%`;
    if (p < 0) notes.push(`${when}엔 적자였는데 배당을 줬습니다. 이대로 계속 주기는 어려울 수 있습니다`);
    else if (p > 100) notes.push(`${when} 배당성향 ${pctText} · 번 것보다 많이 줬습니다. 이대로 계속 주기는 어려울 수 있습니다`);
    else notes.push(`${when} 배당성향 ${pctText} · 이익의 ${pctText}를 배당으로 줬습니다`);
  }
  if ((s.growthYears ?? 0) >= 10) notes.push(`${s.growthYears}년째 해마다 배당을 늘려 왔습니다`);
  if (s.kind === "etf") {
    // 미국 ETF 는 stockanalysis, 국내 ETF 는 운용사(TIGER) 분배 내역 — 둘 다 지급 건이라 달력에 든다.
    // 국내는 어느 날 받은 내역인지 적는다(원천이 공시 페이지라).
    if (s.currency === "KRW") notes.push(`분배금은 운용사 분배 내역(${s.asOf ?? "최근"} 기준)을 옮긴 값입니다`);
    if (s.dps > 0 && !s.pays.length) notes.push("지급일 기록이 없어 아래 달력에는 빠집니다");
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
function MonthCalendar({
  monthly,
  taxLabel,
  noCalCount,
  selected,
  onPick,
}: {
  monthly: number[];
  taxLabel: string;
  noCalCount: number;
  selected: number | null;
  onPick: (m: number) => void;
}) {
  const max = Math.max(...MONTHS.map((m) => monthly[m]));
  const paidMonths = MONTHS.filter((m) => monthly[m] > 0).length;
  return (
    <div className="dv-cal">
      <div className="dv-cal-head">
        <span className="dv-cal-title">달마다 얼마 들어오나</span>
        <span className="dv-cal-sub">
          {paidMonths ? `1년에 ${paidMonths}달 들어옵니다` : "지급 달을 아는 종목이 없습니다"} · 최근 12개월 지급일 기준 · {taxLabel}
          {noCalCount > 0 && ` · ${noCalCount}종목은 지급 달을 몰라 뺐습니다`}
          {" · 달을 누르면 그 달에 주는 종목이 뜹니다"}
        </span>
      </div>
      <div className="dv-cal-grid">
        {MONTHS.map((m) => {
          const v = monthly[m];
          return (
            <button
              key={m}
              type="button"
              className={`dv-cal-cell${v > 0 ? " dv-cal-on" : ""}`}
              aria-pressed={selected === m}
              onClick={() => onPick(m)}
              title={`${m}월에 주는 종목 보기`}
            >
              <span className="dv-cal-bar" style={{ height: max > 0 ? `${Math.max(v > 0 ? 6 : 0, (v / max) * 100)}%` : 0 }} aria-hidden="true" />
              <span className="dv-cal-month">{m}월</span>
              <span className="dv-cal-amt">{v > 0 ? wonCal(v) : "·"}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── 다가오는 일정 — 담은 종목의 다음 기준일·지급일 ─────────────────────────────────
   아는 날짜가 먼저다: 국내 주식은 예탁결제원에 올라온 다음 배당기준일, 미국 주식·ETF 는 선언됐지만 아직
   안 지급된 다음 건(지급일·1주당 금액). 날짜를 모르는 종목은 지난 1년 지급일을 올해로 옮겨 "이날쯤 지급 예상"을
   적는다 — 이미 지난 날은 건너뛰고(이달 2일에 준 월배당 ETF 를 '이달 예상'이라 하지 않게), 석 달 안의 것만.
   여섯 줄까지.
   ⚠️ 서버 렌더에는 없다 — 담은 종목이 브라우저 저장소에서 오므로 hydration 뒤에만 그려져 오늘 날짜를 써도 안전하다. */
type UpcomingItem = { key: string; when: string; sortKey: string; name: string; what: string; amount: string | null };

function upcomingOf(lines: Line[], fx: number, mode: TaxMode): UpcomingItem[] {
  const today = new Date();
  const iso = today.toISOString().slice(0, 10);
  const horizon = new Date(today.getTime() + UPCOMING_DAYS * 86400e3).toISOString().slice(0, 10);
  const year = today.getFullYear();
  const out: UpcomingItem[] = [];
  const dateLabel = (d: string) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일`;
  const net = (s: StockLite, v: number) => {
    const keep = 1 - taxRate(s, mode);
    const krw = v * keep * (s.currency === "USD" ? fx : 1);
    return s.currency === "USD" ? `${usd(v * keep)} · ${won(krw)}` : won(krw);
  };
  for (const l of lines) {
    const s = l.stock;
    if (s.nextRecord && s.nextRecord >= iso) {
      out.push({ key: `${s.code}-r`, when: dateLabel(s.nextRecord), sortKey: s.nextRecord, name: s.name, what: "배당기준일", amount: null });
    }
    if (s.nextPay && s.nextPay[0] >= iso) {
      out.push({ key: `${s.code}-p`, when: dateLabel(s.nextPay[0]), sortKey: s.nextPay[0], name: s.name, what: `지급 · 1주에 ${money(s.nextPay[1], s)}`, amount: net(s, s.nextPay[1] * l.shares) });
      continue;
    }
    // 날짜를 모르면 지난 1년 지급일을 올해(지났으면 내년)로 옮겨 가장 가까운 것 하나.
    const expected = s.pays
      .map(([m, v, d]) => {
        const md = `${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        return { date: `${year}-${md}` >= iso ? `${year}-${md}` : `${year + 1}-${md}`, v };
      })
      .filter((e) => e.date <= horizon)
      .sort((a, b) => a.date.localeCompare(b.date))[0];
    if (expected) {
      out.push({
        key: `${s.code}-e`,
        when: `${dateLabel(expected.date)}쯤`,
        sortKey: expected.date,
        name: s.name,
        what: `지급 예상 · 지난해 이날 1주에 ${money(expected.v, s)}`,
        amount: net(s, expected.v * l.shares),
      });
    }
  }
  return out.sort((a, b) => a.sortKey.localeCompare(b.sortKey)).slice(0, UPCOMING_MAX);
}

function Upcoming({ lines, fx, mode }: { lines: Line[]; fx: number; mode: TaxMode }) {
  const items = upcomingOf(lines, fx, mode);
  if (!items.length) return null;
  return (
    <div className="dv-upcoming">
      <div className="dv-cal-head">
        <span className="dv-cal-title">다가오는 일정</span>
        <span className="dv-cal-sub">공시된 기준일·지급일이 먼저, 모르면 지난해 지급일로 어림(석 달 안) · {taxShort(mode)}</span>
      </div>
      <ul className="dv-upcoming-list">
        {items.map((it) => (
          <li key={it.key} className="dv-upcoming-row">
            <span className="dv-upcoming-when">{it.when}</span>
            <span className="dv-upcoming-name">{it.name}</span>
            <span className="dv-upcoming-what">{it.what}</span>
            {it.amount && <span className="dv-upcoming-amt">{it.amount}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── 빈 달 채우기 — 누른 달에 지급하는 종목을 국장·미장·ETF 줄로 ──────────────────
   후보 순서는 fillOrder(칩·더 보기 묶음 먼저, 그다음 큰 회사·수익률 순). 줄마다 여덟. 담긴 건 QuickChips 가 뺀다.
   국내 주식은 대개 4월(결산)·한두 달이라 국장 줄은 빈 달이 많다 — 그때는 그 줄을 안 세운다. */
function MonthFill({
  month,
  order,
  holdings,
  onPick,
  onClose,
}: {
  month: number;
  order: Record<Scope, StockLite[]>;
  holdings: Holding[];
  onPick: (code: string) => void;
  onClose: () => void;
}) {
  const held = new Set(holdings.map((h) => h.code));
  const rows = SCOPES.map((o) => ({
    label: o.label,
    codes: order[o.key].filter((s) => !held.has(s.code) && s.pays.some(([m]) => m === month)).slice(0, ROW_CHIPS).map((s) => s.code),
  })).filter((r) => r.codes.length);
  const byCode = useMemo(() => new Map(Object.values(order).flat().map((s) => [s.code, s])), [order]);
  return (
    <div className="dv-more" role="region" aria-label={`${month}월에 주는 종목`}>
      <div className="dv-more-head">
        <span className="dv-more-title">{month}월에 주는 종목</span>
        <button type="button" className="dv-more-toggle" onClick={onClose}>
          접기
        </button>
      </div>
      {rows.length ? (
        rows.map((r) => (
          <div key={r.label} className="dv-more-row">
            <span className="dv-more-label">{r.label}</span>
            <QuickChips codes={r.codes} byCode={byCode} holdings={holdings} onPick={onPick} />
          </div>
        ))
      ) : (
        <p className="dv-more-foot">{month}월에 주는 종목이 후보에 없습니다. 위 검색창에서 찾아 보세요.</p>
      )}
      <p className="dv-more-foot">지난 1년 지급일 기준입니다. 담으면 위 달력이 바로 바뀝니다.</p>
    </div>
  );
}

/* ── 바스켓 투자금 ────────────────────────────────────────────────── */
/* ── 목표까지 — 월 얼마를 받으려면 얼마가 있어야 하고, 매달 얼마씩 넣으면 언제 닿나 ─────────
   지금 담은 종목의 비율(세후 수익률 = 1년 세후 배당 ÷ 투자금)이 그대로 간다고 치고 센다. 배당은
   받는 족족 같은 비율로 다시 담고(재투자), 주가와 배당은 지금과 같다고 본다 — 그 셋을 글자로 적는다.
   달 수는 한 달씩 굴려서 센다(닫힌 식보다 읽기 쉽고 600달이면 즉시다). */
function monthsToGoal(invest: number, yearlyRate: number, addMonthly: number, goalMonthly: number): number | null {
  if (yearlyRate <= 0) return null;
  let p = invest;
  for (let m = 0; m <= GOAL_MAX_MONTHS; m++) {
    if ((p * yearlyRate) / 12 >= goalMonthly) return m;
    p += (p * yearlyRate) / 12 + addMonthly;
  }
  return null;
}

function GoalBox({
  invest,
  net,
  taxLabel,
  goalMan,
  addMan,
  onGoal,
  onAdd,
}: {
  invest: number;
  net: number;
  taxLabel: string;
  goalMan: number;
  addMan: number;
  onGoal: (v: number) => void;
  onAdd: (v: number) => void;
}) {
  const rate = net / invest;
  const goal = goalMan * 1e4;
  const add = addMan * 1e4;
  const need = rate > 0 ? (goal * 12) / rate : null;
  const months = goal > 0 ? monthsToGoal(invest, rate, add, goal) : null;
  const years = months != null ? `${Math.floor(months / 12) ? `${Math.floor(months / 12)}년 ` : ""}${months % 12 ? `${months % 12}개월` : ""}`.trim() : null;
  const numInput = (value: number, onChange: (v: number) => void, label: string) => (
    <input
      type="number"
      inputMode="numeric"
      min={0}
      step={10}
      value={value}
      onChange={(e) => onChange(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
      aria-label={label}
      className="dv-goal-input"
    />
  );
  return (
    <div className="dv-goal">
      <div className="dv-goal-head">
        <span className="dv-goal-title">목표까지</span>
        <span className="dv-goal-sub">지금 담은 비율({taxLabel} 수익률 {pct(rate * 100)})이 그대로 간다고 칠 때</span>
      </div>
      <div className="dv-goal-form">
        <label className="dv-goal-field">
          한 달에 {numInput(goalMan, onGoal, "목표 월 배당(만원)")}만원 받으려면
        </label>
        <label className="dv-goal-field">
          매달 {numInput(addMan, onAdd, "매달 더 넣는 돈(만원)")}만원씩 더 넣을 때
        </label>
      </div>
      <p className="dv-goal-out">
        {goal <= 0 ? (
          "목표를 적으면 얼마가 필요한지 셉니다."
        ) : need == null ? (
          "배당이 0이라 셀 수 없습니다."
        ) : (
          <>
            투자금 <b>{wonShort(Math.round(need / 1e4) * 1e4)}</b>이 있어야 합니다. 지금은 {wonShort(Math.round(invest / 1e4) * 1e4)}
            {invest >= need
              ? "이라 이미 넘습니다."
              : months == null
                ? `이고, 이 속도로는 ${GOAL_MAX_MONTHS / 12}년 안에 닿지 않습니다.`
                : add > 0
                  ? `이고, 배당을 다시 담으면서 매달 ${wonShort(add)}씩 넣으면 ${years} 뒤에 닿습니다.`
                  : `이고, 더 넣지 않고 배당만 다시 담으면 ${years} 뒤에 닿습니다.`}
          </>
        )}
      </p>
      <p className="dv-goal-note">주가와 배당이 지금과 같고 받은 배당을 같은 비율로 다시 담는다고 본 값입니다. 물가·주가 변동은 안 넣었습니다.</p>
    </div>
  );
}

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
  mode,
  onApply,
  onPick,
}: {
  basket: BasketLite;
  amount: number;
  byCode: Map<string, StockLite>;
  mode: TaxMode;
  onApply: () => void;
  onPick: (code: string) => void;
}) {
  const holdings = basketShares(basket.codes, amount, byCode);
  // 바스켓은 국내 종목뿐이라 환율은 1 이다.
  const lines = computeLines(holdings, byCode, 1, mode);
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
              1년에 · {taxShort(mode)} · 한 달 평균 {won(net / 12)}
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
