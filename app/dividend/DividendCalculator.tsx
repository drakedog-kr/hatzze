"use client";

import { Fragment, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

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

/** cost 는 내 평단(1주 매수가, 그 종목의 돈 단위). 넣으면 투자금과 수익률이 종가 대신 이걸로 선다(YOC). */
type Holding = { code: string; shares: number; cost?: number };

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
      .map((h) => ({
        code: h.code,
        shares: Math.max(0, Math.floor(h.shares)),
        ...(typeof h.cost === "number" && h.cost > 0 ? { cost: h.cost } : {}),
      }));
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
  // ⚠️ 저장값을 아직 안 읽었으면 먼저 읽는다 — 마운트 직후(`?add=` 처리)에 쓰면 빈 목록 위에 덮어써서
  //    담아 둔 종목이 통째로 사라졌다(2026-09-14 실측). 구독의 setTimeout 보다 effect 가 먼저 돈다.
  if (!loaded) {
    loaded = true;
    current = readSaved();
  }
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
type Account = "general" | "isa" | "pension";
type TaxMode = "gross" | Account;
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
const ACCOUNTS: { key: Account; label: string }[] = [
  { key: "general", label: "일반 계좌" },
  { key: "isa", label: "ISA" },
  { key: "pension", label: "연금 계좌" },
];
/** 히어로 라벨에 붙는 꼬리. 세후·세전은 머리의 칸이 이미 말하므로 안 적고(2026-09-13 지적), 계좌가 일반이 아닐 때만 그 이름. */
/** 이 위면 배당이 아니라 원금 반환이 섞인 ETF(일드맥스류). 바스켓의 MAX_YIELD_ETF(lib/dividend.ts)와 같은 30. 칩·줄 주의 둘 다 이 값. */
const HOT_YIELD_PCT = 30;

const accountTag = (mode: TaxMode) => (mode === "isa" || mode === "pension" ? ` (${ACCOUNTS.find((m) => m.key === mode)?.label})` : "");
/** 종목을 처음 담을 때의 주수. 0 이면 결과가 안 서고, 1 은 값이 너무 작아 감이 안 온다. */
const DEFAULT_SHARES = 10;
/** 목표 월 배당의 기본값(만원)과 매달 더 넣는 돈의 기본값(만원). 파이어족 글에서 가장 자주 나오는 숫자. */
const GOAL_DEFAULT_MAN = 100;
/** 목표 월 배당의 빠른 선택(만원). 파이어족 글이 말하는 눈금 — 용돈 50 · 월세 100 · 생활비 200·300 · 은퇴 500. */
const GOAL_PRESETS_MAN = [50, 100, 200, 300, 500];
const ADD_DEFAULT_MAN = 50;
/** 바스켓 네 줄의 이름. lib/dividend.ts 의 pickBaskets 가 이 순서(셋씩)로 돌려준다. */
const BASKET_ROWS = ["기본", "현금흐름", "미국", "국내"];
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
  { key: "etf", label: "ETF", desc: "많이 드는 미국 배당·월분배 ETF" },
];
const scopeOf = (s: StockLite): Scope => (s.kind === "etf" ? "etf" : s.currency === "USD" ? "us" : "kr");

/** 줄에 붙는 배지들. 국장·미장·ETF 가 한 표에 섞이므로 **모든 줄에** 어느 갈래인지 붙인다. */
function Badges({ s }: { s: StockLite }) {
  const items =
    s.kind === "etf"
      ? ["ETF", s.currency === "USD" ? "미국" : "국내"]
      : [s.market === "KOSDAQ" ? "코스닥" : s.market === "US" ? "미국" : "코스피"];
  // 고배당기업(배당소득 분리과세 대상)으로 공시한 국내 회사. 뜻은 배지의 title 로.
  if (s.highDiv) items.push("분리과세");
  return (
    <>
      {items.map((b) => (
        <span
          key={b}
          className={b === "분리과세" ? "dv-badge hz-tip hz-tip-wide" : "dv-badge"}
          data-tip={b === "분리과세" ? "고배당기업으로 공시한 회사 · 2026~2028년 배당은 2,000만원을 넘어도 종합과세 대신 분리과세(14~30%)를 신청할 수 있습니다" : undefined}
        >
          {b}
        </span>
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
  /** 투자금(원). 평단을 넣었으면 평단 × 주수, 아니면 전일 종가 × 주수. 둘 다 없으면 null. */
  investKrw: number | null;
  /** 이 줄의 수익률(%). 평단을 넣었으면 그 기준(YOC), 아니면 전일 종가 기준. */
  yieldPct: number | null;
  /** 평단을 넣은 줄인가. cost 는 그 값(그 종목의 돈 단위). */
  onCost: boolean;
  cost: number | null;
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
    const basis = h.cost && h.cost > 0 ? h.cost : stock.close;
    out.push({
      stock,
      shares: h.shares,
      gross,
      net: gross * keep,
      grossKrw,
      netKrw: grossKrw * keep,
      investKrw: basis ? basis * h.shares * rate : null,
      yieldPct: basis && stock.dps > 0 ? (stock.dps / basis) * 100 : basis ? 0 : null,
      onCost: !!(h.cost && h.cost > 0),
      cost: h.cost && h.cost > 0 ? h.cost : null,
      outside: mode !== "gross" && !fitsAccount(stock, mode),
    });
  }
  return out;
}

/** 바스켓을 이 투자금으로 같은 금액씩 나눠 담으면 종목마다 몇 주인가. 미국 종목은 종가가 달러라 환율을 곱해 원으로 잰다.
    한 주가 몫보다 비싸면 1주 — 0주로 두면 열 종목 바스켓이 실제로는 아홉 종목이 된다(2026-09-15 지적).
    그래서 카드의 투자금은 슬라이더 금액이 아니라 실제 합으로 적는다. */
function basketShares(codes: string[], amount: number, byCode: Map<string, StockLite>, fx: number): Holding[] {
  if (!codes.length) return [];
  const per = amount / codes.length;
  return codes.map((code) => {
    const s = byCode.get(code);
    const priceKrw = s?.close ? s.close * (s.currency === "USD" ? fx : 1) : 0;
    return { code, shares: priceKrw > 0 ? Math.max(1, Math.floor(per / priceKrw)) : 0 };
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
  // 머리의 칸은 세후·세전 둘뿐이다(2026-09-13 지적: "일반 유저에겐 세후·세전이 쉽다"). 어느 계좌로 세는지는
  // 세후일 때만 히어로 아래 작은 칸에서 고른다 — 세전이면 계좌가 뜻이 없다.
  const [afterTax, setAfterTax] = useState(true);
  const [account, setAccount] = useState<Account>("general");
  const taxMode: TaxMode = afterTax ? account : "gross";
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

  // 종목 페이지의 "배당으로 살기에서 계산하기"는 `?add=코드` 로 온다 — 그 종목을 담고 주소에서 지운다.
  // 저장소(localStorage)가 아니라 외부 스토어를 고치는 일이라 effect 안에서 해도 된다(setState 가 아니다).
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("add");
    if (!code || !byCode.has(code)) return;
    writeHoldings((prev) => (prev.some((h) => h.code === code) ? prev : [...prev, { code, shares: DEFAULT_SHARES }]));
    track("dividend_add", { stock_code: gaStockCode(code), select_source: "link" });
    window.history.replaceState(null, "", window.location.pathname);
    setTimeout(() => {
      const el = inputs.get(code);
      el?.scrollIntoView({ block: "center" });
      el?.focus();
      el?.select();
    }, 50);
  }, [byCode, inputs]);

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
  // 평단. 0이나 빈 값이면 지운다(종가 기준으로 돌아간다).
  const setCost = (code: string, cost: number | null) =>
    setHoldings((prev) => prev.map((h) => (h.code === code ? (cost && cost > 0 ? { ...h, cost } : { code: h.code, shares: h.shares }) : h)));
  const remove = (code: string) => {
    track("dividend_remove", { stock_code: gaStockCode(code) });
    setHoldings((prev) => prev.filter((h) => h.code !== code));
  };
  const applyBasket = (b: BasketLite) => {
    const next = basketShares(b.codes, amount, byCode, fx);
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

  // 세금·시세는 히어로 라벨 옆 물음표 하나에 몰아 넣는다 — 바닥에 문단으로 두니 아무도 안 읽을 길이였다
  // (2026-09-13 지적). 꼭 필요한 셋만: 세금을 어떻게 뗐나 · 시세와 기록이 언제 것인가 · 보장 없음.
  // 출처 이름은 여기 안 적는다(같은 날 지적) — 사이트 바닥글의 '데이터 출처'가 그 자리다(app/Footer.tsx,
  // stockanalysis 는 약관이 출처 표기를 조건으로 발췌를 허용하므로 거기서 지우지 말 것).
  const helpText = [
    TAX_HELP[taxMode],
    [
      priceDate ? `시세: 국내 ${priceDate} 종가` : null,
      usdkrw && usPriceDate ? `미국 ${usPriceDate} · 환율 ${Math.round(usdkrw.rate).toLocaleString("ko-KR")}원` : null,
      computedFor ? `배당 기록은 ${computedFor} 기준 12개월` : null,
    ]
      .filter(Boolean)
      .join(" · "),
    "배당은 회사가 바꿀 수 있습니다.",
  ]
    .filter(Boolean)
    .join("\n");

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
          desc="종목을 담고 주수를 적으면 바로 계산됩니다."
          right={<TaxToggle afterTax={afterTax} onChange={(v) => { track("dividend_tax_toggle", { after_tax: v }); setAfterTax(v); }} />}
        />

        {/* 결과가 먼저 선다. 종목이 없을 때도 이 자리는 비워 두지 않는다 — 무엇을 하면 되는지 적는다. */}
        <div className="dv-hero">
          {lines.length ? (
            <>
              <p className="dv-hero-label">
                1년에 받는 배당{accountTag(taxMode)}
                <span className="hz-tip hz-tip-wide hz-tip-lines dv-help" data-tip={helpText} style={{ cursor: "help" }} aria-label="세금·시세·출처 설명">
                  <Icon name="help" style={{ fontSize: 14 }} />
                </span>
              </p>
              <p className="dv-hero-main">{won(total)}</p>
              {/* 셋은 큰 숫자 다음으로 중요한 값이라 한 줄 문장이 아니라 라벨 달린 칸 셋으로(2026-09-13 지적). */}
              {/* 카더라 히어로의 현황 타일(.hz-tx-stat)과 같은 부품 — 화면마다 딴 모양을 만들지 않는다. */}
              <div className="hz-tx-stats dv-hero-stats">
                <div className="hz-tx-stat">
                  <span className="hz-tx-stat-l">한 달 평균</span>
                  <span className="hz-tx-stat-v">{won(total / 12)}</span>
                </div>
                {invest > 0 && (
                  <div className="hz-tx-stat">
                    <span className="hz-tx-stat-l">투자금{lines.some((l) => l.onCost) ? " · 평단 넣은 종목은 평단 기준" : ""}</span>
                    <span className="hz-tx-stat-v">{wonShort(Math.round(invest / 1e4) * 1e4)}</span>
                  </div>
                )}
                {yieldPct != null && (
                  <div className="hz-tx-stat">
                    <span className="hz-tx-stat-l">배당수익률</span>
                    <span className="hz-tx-stat-v">{pct(yieldPct)}</span>
                  </div>
                )}
              </div>
              {afterTax && (
                <div className="dv-account" role="group" aria-label="어느 계좌로 세나">
                  <span className="dv-account-label">계좌</span>
                  {ACCOUNTS.map((o) => (
                    <button
                      key={o.key}
                      type="button"
                      className="dv-account-btn"
                      aria-pressed={account === o.key}
                      onClick={() => {
                        track("dividend_account", { account: o.key });
                        setAccount(o.key);
                      }}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              )}
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
                {/* 판 맨 아래에 붙는 버튼 — 세 판의 높이가 달라도 같은 줄에 선다(margin-top: auto). */}
                {more[o.key].rows.length > 0 && (
                  <button type="button" className="dv-more-btn" aria-expanded={moreOpen === o.key} onClick={() => toggleMore(o.key)}>
                    {moreOpen === o.key ? "접기" : `${o.label} 더 보기`}
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
            <HoldingsTable lines={lines} inputs={inputs} totalInvest={invest} onShares={setShares} onCost={setCost} onRemove={remove} />
          )}
          {lines.length > 0 && (
            <MonthCalendar
              monthly={monthly}
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
          {lines.length > 0 && <Upcoming lines={lines} fx={fx} mode={taxMode} />}
          {lines.length > 0 && invest > 0 && total > 0 && (
            <GoalBox invest={invest} net={total} goalMan={goalMan} addMan={addMan} onGoal={setGoalMan} onAdd={setAddMan} />
          )}
        </div>

      </section>

      <SectionIntro n={2} title="성향별 바스켓" />
      <AmountControl amount={amount} onChange={setAmount} />
      {/* 열두 장이 세로로 길어 국내 줄까지 스크롤이 길다(2026-09-15 지적) — 줄 이름 넷을 누르면 그 줄로 내려간다. */}
      <nav className="dv-jump" aria-label="바스켓 묶음으로 이동">
        <span className="dv-jump-label">바로 가기</span>
        {BASKET_ROWS.map((cap, i) => (
          <button key={cap} type="button" className="dv-jump-btn" onClick={() => document.getElementById(`dv-basket-row-${i}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}>
            {cap}
          </button>
        ))}
      </nav>
      {/* 열둘을 3개씩 네 줄로. 줄마다 무엇을 묶은 줄인지 한 마디(기본 · 현금흐름 · 질 · 세금과 업종) — 셋씩 번갈아
          읽을 때 길잡이가 된다. 서버가 주는 순서가 곧 줄 순서다. */}
      <div className="dv-baskets">
        {BASKET_ROWS.map((cap, i) => (
          <Fragment key={cap}>
            <p className="dv-basket-cap" id={`dv-basket-row-${i}`}>{cap}</p>
            {baskets.slice(i * 3, i * 3 + 3).map((b) => (
              <BasketSheet key={b.key} basket={b} amount={amount} byCode={byCode} mode={taxMode} fx={fx} onApply={() => applyBasket(b)} onPick={(code) => add(code, "basket")} />
            ))}
          </Fragment>
        ))}
      </div>
      <p className="dv-note">
        바스켓은 위에 적힌 규칙으로 걸러 같은 금액씩 나눠 담은 것입니다. 추천이 아니라 분류이고, 담은 뒤 종목을 빼고 넣을 수 있습니다.
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

/** 물음표 툴팁의 첫 줄 — 세금을 어떻게 뗐나, 계좌마다. */
const TAX_HELP: Record<TaxMode, string> = {
  general: "세금: 국내 15.4%, 미국 15%를 뗀 값",
  isa: `세금(ISA): 국내 주식·ETF 9.9%, 해외 주식은 ISA에 못 담아 15% · 만기까지 ${wonShort(ISA_FREE)}(서민형 ${wonShort(ISA_FREE_LOW)})은 비과세라 실제론 이보다 적습니다`,
  pension: "세금(연금 계좌): 국내 ETF 는 연금으로 받을 때 5.5%(55~69세) · 주식은 못 담아 15.4%·15%",
  gross: "세전: 세금을 빼기 전 값(국내 15.4%, 미국 15%를 뗍니다)",
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
          {s.yieldPct != null &&
            (s.yieldPct > HOT_YIELD_PCT ? (
              // 일드맥스류 — 칩에서 제일 큰 숫자라 제일 좋은 걸로 읽힌다(2026-09-15 지적). 흐리게 두고 뜻은 툴팁에.
              <span className="dv-chip-yield dv-chip-yield-hot hz-tip hz-tip-wide" data-tip="분배금에 원금을 돌려주는 몫이 섞인 초고배당 ETF 입니다. 달마다 크게 흔들립니다.">
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
  totalInvest,
  onShares,
  onCost,
  onRemove,
}: {
  lines: Line[];
  inputs: Map<string, HTMLInputElement>;
  /** 투자금 합(원). 줄마다 비중을 내는 분모. */
  totalInvest: number;
  onShares: (code: string, shares: number) => void;
  onCost: (code: string, cost: number | null) => void;
  onRemove: (code: string) => void;
}) {
  return (
    <div className="dv-table" role="table" aria-label="담은 종목">
      <div className="dv-trow dv-thead" role="row">
        <span role="columnheader">종목</span>
        <span role="columnheader">주수 · 평단</span>
        <span role="columnheader">1주당 1년 배당</span>
        <span role="columnheader">1년에 받는 배당</span>
        <span role="columnheader">배당수익률</span>
        <span role="columnheader">비중</span>
        <span role="columnheader" aria-label="빼기" />
      </div>
      {lines.map((l) => (
        <HoldingRow key={l.stock.code} line={l} inputs={inputs} weightPct={totalInvest > 0 && l.investKrw != null ? (l.investKrw / totalInvest) * 100 : null} onShares={onShares} onCost={onCost} onRemove={onRemove} />
      ))}
    </div>
  );
}

function HoldingRow({
  line,
  inputs,
  weightPct,
  onShares,
  onCost,
  onRemove,
}: {
  line: Line;
  inputs: Map<string, HTMLInputElement>;
  /** 투자금 가운데 이 줄의 몫(%). 종가가 없으면 null. */
  weightPct: number | null;
  onShares: (code: string, shares: number) => void;
  onCost: (code: string, cost: number | null) => void;
  onRemove: (code: string) => void;
}) {
  const { stock: s, shares } = line;
  // 평단 칸은 값이 있거나 열어 둔 동안만 보인다 — 줄마다 빈 칸이 서 있으면 표가 무거워진다.
  const [costOpen, setCostOpen] = useState(false);
  const showCost = line.onCost || costOpen;

  /* 이름 아래 두 줄 — 사실 조각(짧은 알약, 뜻은 title 로)과 주의(짧은 문장). 문장을 '·' 로 이어 붙였더니 세 줄이
     됐다(2026-09-13 지적). 알약 하나에 사실 하나, 문장은 주의만. */
  const facts: { text: string; title: string }[] = [];
  const warns: string[] = [];
  const md = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;
  if (s.payout) {
    const [year, p] = s.payout;
    const when = year != null ? `${year}년` : "지난 12개월";
    const pctText = `${Math.round(p).toLocaleString("ko-KR")}%`;
    if (p < 0) warns.push(`${when}엔 적자였는데 배당을 줬습니다`);
    else if (p > 100) warns.push(`배당성향 ${pctText} · 번 것보다 많이 줬습니다`);
    else facts.push({ text: `배당성향 ${pctText}`, title: `${when} 이익의 ${pctText}를 배당으로 줬습니다` });
  }
  if ((s.growthYears ?? 0) >= 10) facts.push({ text: `${s.growthYears}년 연속 늘림`, title: `${s.growthYears}년째 해마다 배당을 늘려 왔습니다` });
  // 5년 연평균 증가율(국내는 예탁결제원 기록, 미국은 SEC 연도별 합으로 센 값). 늘린 회사만이 아니라 줄인 회사도 적는다.
  if (s.growth5 != null && s.streak >= 5) {
    const g = Math.round(s.growth5);
    if (g >= 1) facts.push({ text: `5년 연 +${g}%`, title: `최근 5년 해마다 ${g}%씩 늘렸습니다(연평균)` });
    else if (g <= -1) facts.push({ text: `5년 연 −${-g}%`, title: `최근 5년 해마다 ${-g}%씩 줄었습니다(연평균)` });
  }
  if (s.nextRecord) facts.push({ text: `기준일 ${md(s.nextRecord)}`, title: `다음 배당기준일 ${s.nextRecord}` });
  if (s.nextPay) facts.push({ text: `${md(s.nextPay[0])} 지급 ${money(s.nextPay[1], s)}`, title: `다음 지급 ${s.nextPay[0]} · 1주에 ${money(s.nextPay[1], s)}` });

  if (line.outside) warns.push(s.currency === "USD" ? "해외 주식은 이 계좌에 못 담아 일반 계좌(15%)로 셌습니다" : "개별 주식은 연금 계좌에 못 담아 일반 계좌(15.4%)로 셌습니다");
  // 미국은 "없다"고 못 말한다 — 허쉬·디지털리얼티처럼 1주당 배당 태그를 안 다는 회사가 있다.
  if (s.dps === 0) warns.push(s.currency === "USD" ? "공시에서 배당을 못 읽었습니다(안 주는 회사일 수도 있습니다)" : "최근 1년 현금배당이 없습니다");
  if (s.unusual) warns.push("특별·청산배당이 섞여 있어 1년 뒤에도 같으리라 보기 어렵습니다");
  if (s.kind !== "etf" && s.estimated) warns.push("연간 값이 없어 마지막 배당으로 어림한 추정값입니다");
  // 일드맥스(TSLY·MSTY)류. 지난 1년 분배가 가격의 3할을 넘으면 원금을 돌려주는 상품이라 봐야 한다.
  if ((s.yieldPct ?? 0) > HOT_YIELD_PCT) warns.push("분배금이 달마다 크게 흔들리고 원금을 돌려주는 몫이 섞여 있습니다");
  if (s.close == null) warns.push("종가가 없어 투자금과 배당수익률을 못 냅니다");
  if (s.dps > 0 && !s.pays.length) warns.push("지급일 기록이 없어 아래 달력에는 빠집니다");

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
          {facts.length > 0 && (
            <span className="dv-tfacts">
              {/* 브라우저 기본 title 은 1초 뒤에야 뜨고 폰에선 안 뜬다 — 이 화면의 말풍선(.hz-tip)으로. */}
              {facts.map((f) => (
                <span key={f.text} className="dv-tfact hz-tip hz-tip-wide" data-tip={f.title}>
                  {f.text}
                </span>
              ))}
            </span>
          )}
          {warns.length > 0 && <span className="dv-tnote dv-twarn">{warns.join(" · ")}</span>}
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
        {/* 내 평단 — 넣으면 이 줄의 투자금·수익률이 종가 대신 평단으로 선다(YOC). 비우면 종가로 돌아간다. */}
        {showCost ? (
          <label className="dv-tcost">
            <span>평단</span>
            {/* 비제어 입력 — 저장값을 value 로 되돌려 주면 "45." 처럼 치는 중인 소수점이 지워진다. */}
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step={s.currency === "USD" ? 0.01 : 1}
              placeholder={s.close != null ? String(s.currency === "USD" ? s.close : Math.round(s.close)) : ""}
              defaultValue={line.cost ?? ""}
              onChange={(e) => {
                const v = Number(e.target.value);
                onCost(s.code, Number.isFinite(v) && v > 0 ? v : null);
              }}
              onBlur={(e) => {
                if (!(Number(e.target.value) > 0)) setCostOpen(false);
              }}
              aria-label={`${s.name} 평단(1주 매수가)`}
              autoFocus={costOpen && !line.onCost}
            />
            <span>{s.currency === "USD" ? "$" : "원"}</span>
          </label>
        ) : (
          <button type="button" className="dv-tcost-open" onClick={() => setCostOpen(true)}>
            평단 넣기
          </button>
        )}
      </span>
      <span className="dv-tcell dv-tnum" role="cell">{s.dps > 0 ? money(s.dps, s) : "없음"}</span>
      <span className="dv-tcell dv-tnum dv-tstrong" role="cell">
        {won(line.netKrw)}
        {s.currency === "USD" && s.dps > 0 && <span className="dv-tsub">{usd(line.net)}</span>}
      </span>
      <span className="dv-tcell dv-tnum" role="cell">
        {line.yieldPct != null ? pct(line.yieldPct) : "·"}
        {line.onCost && <span className="dv-tsub">내 평단 기준</span>}
      </span>
      {/* 비중 — 투자금 가운데 이 줄이 몇 %인지. 숫자 옆에 얇은 막대로 한 번 더. */}
      <span className="dv-tcell dv-tnum dv-tweight" role="cell">
        {weightPct != null ? (
          <>
            {weightPct.toFixed(0)}%
            <span className="dv-tweight-bar" aria-hidden="true">
              <span style={{ width: `${Math.min(100, weightPct)}%` }} />
            </span>
          </>
        ) : (
          "·"
        )}
      </span>
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
  noCalCount,
  selected,
  onPick,
}: {
  monthly: number[];
  noCalCount: number;
  selected: number | null;
  onPick: (m: number) => void;
}) {
  const max = Math.max(...MONTHS.map((m) => monthly[m]));
  const paidMonths = MONTHS.filter((m) => monthly[m] > 0).length;
  return (
    <div className="dv-cal">
      <div className="dv-cal-head dv-cal-head-col">
        <span className="dv-cal-title">
          달마다 얼마 들어오나
          {/* 누르는 법은 부제에서 빼 툴팁으로 — 모바일에서 두 줄이 됐다(2026-09-15). */}
          <span
            className="hz-tip hz-tip-wide dv-help"
            data-tip="최근 12개월에 실제로 지급된 달로 셉니다. 달을 누르면 그 달에 주는 종목이 뜹니다(빈 달은 +)."
            style={{ cursor: "help" }}
            aria-label="달력 설명"
          >
            <Icon name="help" style={{ fontSize: 14 }} />
          </span>
        </span>
        <span className="dv-cal-sub">
          {paidMonths ? `1년에 ${paidMonths}달 들어옵니다` : "지급 달을 아는 종목이 없습니다"} · 최근 12개월 기준
          {noCalCount > 0 && ` · ${noCalCount}종목은 지급 달을 몰라 뺐습니다`}
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
              title={v > 0 ? `${m}월에 주는 종목 보기` : `${m}월은 비어 있습니다 · 이 달에 주는 종목 보기`}
            >
              <span className="dv-cal-bar" style={{ height: max > 0 ? `${Math.max(v > 0 ? 6 : 0, (v / max) * 100)}%` : 0 }} aria-hidden="true" />
              <span className="dv-cal-month">{m}월</span>
              {/* 빈 달은 금액 자리에 + 동그라미 — "여기 눌러 채우라"는 표시(시장 브리핑의 '새로운 지표 제보하기'와 같은 아이콘).
                  같은 아이콘이 여러 칸에 서지만 뜻이 하나(이 달을 채운다)라 한 화면 한 아이콘 규칙의 예외로 둔다. */}
              {v > 0 ? (
                <span className="dv-cal-amt">{wonCal(v)}</span>
              ) : (
                <span className="dv-cal-amt dv-cal-add" aria-hidden="true">
                  <Icon name="add_circle" style={{ fontSize: 18 }} />
                </span>
              )}
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
      out.push({ key: `${s.code}-p`, when: dateLabel(s.nextPay[0]), sortKey: s.nextPay[0], name: s.name, what: `1주에 ${money(s.nextPay[1], s)} · 공시된 지급일`, amount: net(s, s.nextPay[1] * l.shares) });
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
        what: `1주에 ${money(expected.v, s)} · 지난해 이날 기준`,
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
        <span className="dv-cal-title">
          다가오는 일정
          <span
            className="hz-tip hz-tip-wide dv-help"
            data-tip="공시된 기준일·지급일이 먼저 서고, 없으면 지난해 같은 날에 준 것으로 어림합니다(석 달 안)."
            style={{ cursor: "help" }}
            aria-label="다가오는 일정 설명"
          >
            <Icon name="help" style={{ fontSize: 14 }} />
          </span>
        </span>
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
/**
 * 달마다 굴린다: 이달 배당 = 자산 × 수익률 ÷ 12, 배당과 매달 넣는 돈을 자산에 더한다. 배당이 해마다 g% 늘면
 * 수익률(자산 대비)이 그만큼 자란다고 본다 — 주가는 그대로라는 가정이라, 배당 성장은 곧 수익률 성장이다.
 * 돌려주는 건 m달째 월 배당의 목록(0 = 지금). 60·120·240달째를 읽으면 5·10·20년 뒤다.
 */
function projectMonthly(invest: number, yearlyRate: number, addMonthly: number, growthPct: number, months: number): number[] {
  const out: number[] = [];
  let p = invest;
  const g = Math.pow(1 + growthPct / 100, 1 / 12);
  let r = yearlyRate;
  for (let m = 0; m <= months; m++) {
    const div = (p * r) / 12;
    out.push(div);
    p += div + addMonthly;
    r *= g;
  }
  return out;
}

function monthsToGoal(invest: number, yearlyRate: number, addMonthly: number, growthPct: number, goalMonthly: number): number | null {
  if (yearlyRate <= 0) return null;
  const path = projectMonthly(invest, yearlyRate, addMonthly, growthPct, GOAL_MAX_MONTHS);
  const m = path.findIndex((div) => div >= goalMonthly);
  return m >= 0 ? m : null;
}

function GoalBox({
  invest,
  net,
  goalMan,
  addMan,
  onGoal,
  onAdd,
}: {
  invest: number;
  net: number;
  goalMan: number;
  addMan: number;
  onGoal: (v: number) => void;
  onAdd: (v: number) => void;
}) {
  const rate = net / invest;
  const goal = goalMan * 1e4;
  const add = addMan * 1e4;
  const need = rate > 0 ? (goal * 12) / rate : null;
  const months = goal > 0 ? monthsToGoal(invest, rate, add, 0, goal) : null;
  // 5·10·20년 뒤 한 달 배당 — 같은 셈을 240달까지 돌려 읽는다(배당 성장 0%).
  const path = rate > 0 ? projectMonthly(invest, rate, add, 0, 240) : null;
  const monthlyNow = net / 12;
  const years = months != null ? `${Math.floor(months / 12) ? `${Math.floor(months / 12)}년 ` : ""}${months % 12 ? `${months % 12}개월` : ""}`.trim() : null;
  const manInput = (value: number, onChange: (v: number) => void, label: string, opts: { step?: number; max?: number; width?: number } = {}) => (
    <input
      type="number"
      inputMode="numeric"
      min={0}
      max={opts.max}
      step={opts.step ?? 10}
      value={value}
      onChange={(e) => onChange(Math.max(0, Math.min(opts.max ?? Infinity, Math.floor(Number(e.target.value) || 0))))}
      aria-label={label}
      className="dv-goal-inline"
      style={opts.width ? { width: opts.width } : undefined}
    />
  );
  const roundMan = (v: number) => wonShort(Math.round(v / 1e4) * 1e4);
  // 막대는 목표와 같은 단위(한 달 배당)로 — "투자금 12%"보다 "한 달 13만원, 목표의 12%"가 바로 읽힌다.
  const progress = goal > 0 ? Math.min(100, (monthlyNow / goal) * 100) : 0;
  const reached = need != null && invest >= need;
  const tile = (label: string, value: string, strong = false) => (
    <div className={`hz-tx-stat${strong ? " dv-goal-tile-strong" : ""}`}>
      <span className="hz-tx-stat-l">{label}</span>
      <span className="hz-tx-stat-v">{value}</span>
    </div>
  );
  const remaining = need != null ? Math.max(0, need - invest) : 0;
  return (
    <div className="dv-goal">
      {/* 다섯 토막, 토막마다 이름표 한 줄 — 목표 · 지금 · 필요한 돈 · 목표 달성까지 · 이대로 가면. 무엇이 무엇인지
          이름표가 말하고(2026-09-15: "한 달에 XXX만원이 뭔지, 도달까지가 뭔지, 왜 늘어나는지 모르겠다"), 숫자는
          타일 모양 하나로. */}
      <div className="dv-goal-head">
        <span className="dv-cal-title">
          목표까지
          <span
            className="hz-tip hz-tip-wide dv-help"
            data-tip="지금 담은 종목의 비율(배당수익률)이 그대로 가고, 받은 배당은 다시 담고, 주가와 배당은 지금과 같다고 보고 셉니다."
            style={{ cursor: "help" }}
            aria-label="목표까지 셈법"
          >
            <Icon name="help" style={{ fontSize: 14 }} />
          </span>
        </span>
      </div>

      <div className="dv-goal-block">
        <span className="dv-goal-blabel">한 달 배당금 목표</span>
        <div className="dv-goal-presets" role="group" aria-label="한 달 배당금 목표">
          {GOAL_PRESETS_MAN.map((v) => (
            <button key={v} type="button" className={`dv-quick${goalMan === v ? " dv-quick-on" : ""}`} aria-pressed={goalMan === v} onClick={() => onGoal(v)}>
              {v.toLocaleString("ko-KR")}만원
            </button>
          ))}
          <span className="dv-goal-custom">
            {manInput(goalMan, onGoal, "한 달 배당금 목표(만원)", { width: 72 })}
            <span>만원</span>
          </span>
        </div>
      </div>

      {goal > 0 && need != null ? (
        <>
          <div className="dv-goal-block">
            <div className="dv-goal-ends">
              <span>
                지금 한 달 배당금 <b>{won(monthlyNow)}</b>
              </span>
              <span>
                목표 <b>{wonShort(goal)}</b>
              </span>
            </div>
            <div className="dv-goal-bar" role="img" aria-label={`목표 한 달 ${wonShort(goal)} 가운데 지금 ${won(monthlyNow)}, ${Math.round(progress)}%`}>
              <span className="dv-goal-fill" style={{ width: `${Math.max(2, progress)}%` }} />
            </div>
            <span className="dv-goal-bnote">{reached ? "목표를 이미 넘었습니다" : `목표의 ${Math.round(progress)}%입니다`}</span>
          </div>

          <div className="dv-goal-block">
            <span className="dv-goal-blabel">필요한 돈</span>
            <div className="hz-tx-stats dv-goal-stats">
              {tile("목표에 필요한 투자금", roundMan(need))}
              {tile("지금 투자금", roundMan(invest))}
              {tile("더 필요한 돈", reached ? "없음" : roundMan(remaining))}
            </div>
          </div>

          {!reached && (
            <div className="dv-goal-block">
              <span className="dv-goal-blabel">목표 달성까지</span>
              <div className="dv-goal-answer">
                <span className="dv-goal-aval">{months == null ? `${GOAL_MAX_MONTHS / 12}년 넘게 걸립니다` : years}</span>
                <span className="dv-goal-acond">
                  매달 {manInput(addMan, onAdd, "매달 더 넣는 돈(만원)", { width: 60 })}만원씩 더 넣고 받은 배당을 다시 담을 때
                </span>
              </div>
            </div>
          )}

          {path && (
            <div className="dv-goal-block">
              <span className="dv-goal-blabel">이대로 가면 한 달 배당금</span>
              <div className="hz-tx-stats dv-goal-stats">
                {tile("5년 뒤", roundMan(path[60]))}
                {tile("10년 뒤", roundMan(path[120]))}
                {tile("20년 뒤", roundMan(path[240]))}
              </div>
            </div>
          )}
        </>
      ) : (
        <p className="dv-goal-out">{goal <= 0 ? "목표를 고르면 얼마가 필요한지 셉니다." : "배당이 0이라 셀 수 없습니다."}</p>
      )}
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
        // 채운 만큼을 트랙 색으로 — 브라우저 기본 슬라이더는 옛 모양이라(2026-09-15 지적) 트랙·손잡이를 직접 그린다.
        style={{ "--p": `${((amount - AMOUNT_MIN) / (AMOUNT_MAX - AMOUNT_MIN)) * 100}%` } as React.CSSProperties}
      />
      <p className="dv-amount-note">이 돈을 열 종목에 같은 금액씩 나눠 담으면 종목마다 몇 주가 되는지로 계산합니다. 한 주가 몫보다 비싸면 1주로 잡아 투자금이 조금 넘을 수 있습니다.</p>
    </div>
  );
}

/* ── 바스켓 시트 ─────────────────────────────────────────────────── */
/** 바스켓 줄 오른쪽 숫자 — 성향마다 "왜 여기 들었나"를 말하는 값. */
function basketMeta(meta: BasketLite["meta"], s: StockLite): string {
  switch (meta) {
    case "growth":
      return s.growth5 != null ? `연 ${s.growth5.toFixed(0)}% 성장` : "";
    case "streak":
      // 미국은 SEC 로 센 연속 연수가 19~20에서 막힌다 — 해마다 늘린 햇수(stockanalysis)가 있으면 그것.
      return s.growthYears != null ? `${s.growthYears}년 연속 늘림` : streakLabel(s.streak);
    case "months":
      return s.pays.length ? `${[...new Set(s.pays.map(([m]) => m))].sort((a, b) => a - b).join("·")}월` : "";
    case "growthYears":
      return s.growthYears != null ? `${s.growthYears}년 연속 늘림` : "";
    case "payout":
      return s.payout ? `배당성향 ${Math.round(s.payout[1])}%` : "";
    case "septax":
      return `${s.yieldPct != null ? `${pct(s.yieldPct)} · ` : ""}배당성향 ${s.highDiv?.[1] != null ? Math.round(s.highDiv[1]) : "?"}%`;
    case "discount":
      return s.discount != null ? `${s.yieldPct != null ? `${pct(s.yieldPct)} · ` : ""}보통주보다 ${Math.round(s.discount)}% 아래` : s.yieldPct != null ? pct(s.yieldPct) : "";
    default:
      return s.yieldPct != null ? pct(s.yieldPct) : "";
  }
}

function BasketSheet({
  basket,
  amount,
  byCode,
  mode,
  fx,
  onApply,
  onPick,
}: {
  basket: BasketLite;
  amount: number;
  byCode: Map<string, StockLite>;
  mode: TaxMode;
  fx: number;
  onApply: () => void;
  onPick: (code: string) => void;
}) {
  // '내 계좌 맞춤'은 연금 계좌를 골랐을 때 국내 ETF 목록으로 바뀐다. 다른 바스켓은 계좌와 무관.
  const codes = basket.altPension && mode === "pension" ? basket.altPension : basket.codes;
  const holdings = basketShares(codes, amount, byCode, fx);
  const lines = computeLines(holdings, byCode, fx, mode);
  const net = lines.reduce((s, l) => s + l.netKrw, 0);
  const gross = lines.reduce((s, l) => s + l.grossKrw, 0);
  const invest = lines.reduce((s, l) => s + (l.investKrw ?? 0), 0);
  const y = invest > 0 ? (gross / invest) * 100 : null;
  return (
    <section className="hz-sheet dv-basket" aria-label={basket.title}>
      <SectionHead
        icon={basket.icon}
        title={
          <>
            {basket.altPension && mode === "pension" ? `${basket.title} (연금 계좌)` : basket.altPension ? `${basket.title} (ISA)` : basket.title}
            {/* 주의는 제목 옆 물음표에(2026-09-13 지적) — 바닥에 문장으로 두면 시트가 무거워진다. */}
            {basket.caution && (
              <span className="hz-tip hz-tip-wide dv-help" data-tip={basket.caution} style={{ cursor: "help", marginLeft: 4, verticalAlign: "middle" }} aria-label={`${basket.title} 주의`}>
                <Icon name="help" style={{ fontSize: 14 }} />
              </span>
            )}
          </>
        }
        desc={basket.desc}
      />
      {lines.length ? (
        <>
          {/* 내 종목 히어로와 같은 꼴 — 라벨·큰 숫자·타일 셋(한 달 평균 · 투자금 · 배당수익률). 한 줄 문장이던 것을 맞췄다(2026-09-15). */}
          <div className="dv-basket-sum">
            <p className="dv-hero-label">1년에 받는 배당{accountTag(mode)}</p>
            <p className="dv-basket-main">{won(net)}</p>
            <div className="hz-tx-stats dv-hero-stats dv-basket-stats">
              <div className="hz-tx-stat">
                <span className="hz-tx-stat-l">한 달 평균</span>
                <span className="hz-tx-stat-v">{won(net / 12)}</span>
              </div>
              {invest > 0 && (
                <div className="hz-tx-stat">
                  <span className="hz-tx-stat-l">투자금</span>
                  <span className="hz-tx-stat-v">{wonShort(Math.round(invest / 1e4) * 1e4)}</span>
                </div>
              )}
              {y != null && (
                <div className="hz-tx-stat">
                  <span className="hz-tx-stat-l">배당수익률</span>
                  <span className="hz-tx-stat-v">{pct(y)}</span>
                </div>
              )}
            </div>
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
                  <span className="dv-basket-meta">{basketMeta(basket.meta, l.stock)}</span>
                  <span className="dv-basket-shares">{l.shares.toLocaleString("ko-KR")}주</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="dv-basket-foot">
            {/* 규칙은 알약 서너 개 — 문장으로 적으니 세 줄이 됐다(2026-09-13 지적). 열 개씩이라는 건 목록이 말한다. */}
            <div className="dv-basket-rules">
              {basket.rules.map((r) => (
                <span key={r} className="dv-tfact">
                  {r}
                </span>
              ))}
            </div>

            <button type="button" className="hz-tx-btn dv-apply" onClick={onApply}>
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
