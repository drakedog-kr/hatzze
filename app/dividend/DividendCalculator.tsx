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
/** account 가 없으면 위의 '계좌 유형' 칩을 따른다. 있으면 그 줄만 그 계좌로 센다(2026-09-16: 종목마다 계좌가 다른 게 보통이라).
    id 는 줄의 열쇠다 — 같은 종목이 두 줄일 수 있어서(ISA 에도 일반 계좌에도 든 종목, 2026-09-16 피드백) 코드로는 못 가른다.
    첫 줄은 코드 그대로, 나눈 줄은 `코드#2`. 옛 저장값(id 없음)은 읽을 때 붙인다. */
type Holding = { id: string; code: string; shares: number; cost?: number; account?: Account };

/** 이 코드의 새 줄 열쇠 — 아직 없으면 코드 그대로, 있으면 #2·#3. */
function newId(code: string, prev: Holding[]): string {
  const used = new Set(prev.map((h) => h.id));
  if (!used.has(code)) return code;
  for (let n = 2; ; n++) if (!used.has(`${code}#${n}`)) return `${code}#${n}`;
}

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
    const out: Holding[] = [];
    for (const h of parsed as { id?: unknown; code?: unknown; shares?: unknown; cost?: unknown; account?: unknown }[]) {
      if (!h || typeof h.code !== "string" || typeof h.shares !== "number") continue;
      // 저장된 id 가 없거나(옛 값) 겹치면 새로 붙인다.
      const id = typeof h.id === "string" && h.id && !out.some((o) => o.id === h.id) ? h.id : newId(h.code, out);
      out.push({
        id,
        code: h.code,
        shares: Math.max(0, Math.round(h.shares * 1e6) / 1e6),  // 소수점 주식(미국)은 소수 여섯 자리까지
        ...(typeof h.cost === "number" && h.cost > 0 ? { cost: h.cost } : {}),
        ...(isAccount(h.account) ? { account: h.account } : {}),
      });
    }
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
   어느 계좌에 담느냐로 세금이 갈린다. 다섯 가지 — 세전 · 일반 계좌 · ISA · 연금저축 · IRP.
   계좌마다 담을 수 있는 것이 다르다: ISA 는 국내 상장 주식·ETF 만(해외 주식 직접 보유 불가),
   연금저축·IRP 는 국내 상장 ETF 만(개별 주식 불가). 못 담는 줄은 일반 계좌 세율로 세고 줄에 그렇게 적는다.
   IRP 는 세금은 연금저축과 같고 위험자산 70% 한도가 더 있다(2026-09 현재 유효 · 폐지 논의 중) — 안전자산
   30% 를 못 채우면 히어로 아래 한 줄로 적는다. 2026-09 기준 수치 — 바뀌면 여기와 아래 안내문을 같이 고칠 것. */
type Account = "general" | "isa" | "pension" | "irp" | "exempt";
type TaxMode = "gross" | Account;
const isAccount = (v: unknown): v is Account => v === "general" || v === "isa" || v === "pension" || v === "irp" || v === "exempt";
/** 국내 배당소득세 14% + 지방소득세 1.4%. 증권사가 지급 때 떼고 넣어 준다. */
const TAX_RATE_KR = 0.154;
/** 미국 배당은 미국이 15%를 떼고(한미 조세조약) 국내에서 더 떼지 않는다(금융소득 2천만원 아래). */
const TAX_RATE_US = 0.15;
/** ISA 안의 국내 배당은 만기 때 순이익에 9.9%(비과세 한도를 넘는 몫). 한도는 일반형 200만원·서민형(농어민형) 400만원 —
    2026-09 현재도 이 값이다. 500/1,000만원 상향안은 2024·2025 국회에서 빠졌고(2024-12·2025-12 본회의), 비과세 한도 없는
    '생산적금융 ISA'가 2027-01 시행 목표로 2026-09-03 국회에 제출돼 심사 중이다(삼성증권 2026-09-09). 통과하면 여기를 고칠 것. */
const TAX_RATE_ISA = 0.099;
const ISA_FREE = 2_000_000;
const ISA_FREE_LOW = 4_000_000;
/** 연금저축·IRP 는 받을 때까지 안 떼고, 연금으로 받을 때 연금소득세 — 55~69세 5.5%, 70대 4.4%, 80세부터 3.3%. 가장 높은 값으로 센다. */
const TAX_RATE_PENSION = 0.055;
/** 비과세 종합저축 — 이자·배당 전액 비과세, 원금 5,000만원까지(전 금융기관 합산). 만 65세 이상(2026년부터는 기초연금 수급자)·장애인·
    유공자 등이 가입하고 2025-12-31까지 가입한 계좌는 만기까지 유지된다(KB 절세 안내·정책브리핑, 2026-09-17 확인). 국내 상장 주식·ETF 만.
    원금이 한도를 넘으면 넘는 몫의 배당은 일반 계좌 세율로 센다. 2026-09-17 피드백 4. */
const EXEMPT_LIMIT = 50_000_000;
/** IRP 위험자산 한도. 이 위면 안전자산(채권형·채권혼합형 ETF·예금)을 더 넣어야 한다. */
const IRP_RISK_MAX = 0.7;
/** IRP 안전자산을 이름으로 가르는 규칙 — lib/dividend.ts 의 SAFE_ETF 와 같은 식(서버 코드를 클라이언트로 끌어오지 않으려고 베낀다). */
const SAFE_ETF = /채권|국채|회사채|단기|머니마켓|CD|KOFR|금리|혼합/;
/** '혼합50' 처럼 주식이 절반이면 안전자산이 아니다(IRP 안전자산은 주식 40% 이하 채권혼합까지). 커버드콜·밸런스도 옵션 상품이라 뺀다. */
const NOT_SAFE_ETF = /혼합[5-9]\d|커버드콜|밸런스/;
/** IRP 의 안전자산 30% 에 드는 종목인가 — 국내 상장 채권형·채권혼합형 ETF. */
const isSafeAsset = (s: StockLite) => s.kind === "etf" && s.currency === "KRW" && SAFE_ETF.test(s.name) && !NOT_SAFE_ETF.test(s.name);
/** 연금 계좌 둘 — 담을 수 있는 것과 세율이 같다. */
const isPensionLike = (mode: TaxMode) => mode === "pension" || mode === "irp";
/** 금융소득 종합과세 문턱(원). 이자·배당 합이 이걸 넘으면 넘는 몫이 다른 소득과 합쳐 누진세율(6~45%)이다. */
const COMPOSITE_FROM = 20_000_000;
/** 문턱 안내를 히어로에 띄우기 시작하는 세전 배당. 그 아래선 어차피 원천징수로 끝나 문턱 얘기가 뜻이 없다. */
const COMPOSITE_NOTE_FROM = 10_000_000;

/** 이 계좌에 담을 수 있는 종목인가. */
function fitsAccount(s: StockLite, mode: TaxMode): boolean {
  if (mode === "isa" || mode === "exempt") return s.currency === "KRW";
  // 연금저축·IRP 는 국내 상장 ETF 에 더해 상장 리츠·인프라 펀드도 담긴다(미래에셋·한투 연금 매매 안내, 2026-09-15 확인).
  // 개별 주식과 해외 상장은 못 담는다. IRP 에선 리츠가 위험자산 몫이다.
  if (isPensionLike(mode)) return s.currency === "KRW" && (s.kind === "etf" || s.reit);
  return true;
}
/** 줄의 세율. 못 담는 줄은 일반 계좌로. */
function taxRate(s: StockLite, mode: TaxMode): number {
  if (mode === "gross") return 0;
  if (mode === "isa" && fitsAccount(s, mode)) return TAX_RATE_ISA;
  if (mode === "exempt" && fitsAccount(s, mode)) return 0;
  if (isPensionLike(mode) && fitsAccount(s, mode)) return TAX_RATE_PENSION;
  return s.currency === "USD" ? TAX_RATE_US : TAX_RATE_KR;
}
/** dps 가운데 세금이 붙는 몫(0~1). 모르면 1(전액). 국내 ETF 는 운용사 공시 과표, 국내 주식은 감액배당을 뺀 값(2026-09-17 피드백).
    연금 계좌는 받을 때 안 떼고 연금 수령 때 전액에 연금소득세라 이 비율을 안 쓴다. */
function taxableShare(s: StockLite): number {
  if (s.taxable == null || s.dps <= 0) return 1;
  return Math.min(1, Math.max(0, s.taxable / s.dps));
}
const ACCOUNTS: { key: Account; label: string }[] = [
  { key: "general", label: "일반 계좌" },
  { key: "isa", label: "ISA" },
  { key: "pension", label: "연금저축" },
  { key: "irp", label: "IRP" },
  { key: "exempt", label: "비과세 종합저축" },
];
/** 줄의 계좌 알약(select)은 폭이 좁아 짧은 이름. */
const ACCOUNT_SHORT: Record<Account, string> = { general: "일반 계좌", isa: "ISA", pension: "연금저축", irp: "IRP", exempt: "비과세저축" };
/** 히어로 라벨에 붙는 꼬리. 세후·세전은 머리의 칸이 이미 말하므로 안 적고(2026-09-13 지적), 계좌가 일반이 아닐 때만 그 이름. */
/** 이 위면 배당이 아니라 원금 반환이 섞인 ETF(일드맥스류). 바스켓의 MAX_YIELD_ETF(lib/dividend.ts)와 같은 30. 칩·줄 주의 둘 다 이 값. */
const HOT_YIELD_PCT = 30;
/** 오늘(KST, YYYY-MM-DD). 모듈이 읽힐 때 한 번 — 렌더 안에서 Date.now() 를 부르면 React 컴파일러 린트가 막는다(AppShell 의 NEWS_LIVE 와 같은 사정). */
const TODAY_KST = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

const accountTag = (mode: TaxMode) => (mode === "isa" || mode === "exempt" || isPensionLike(mode) ? ` (${ACCOUNTS.find((m) => m.key === mode)?.label})` : "");
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
/** 바스켓 투자금 슬라이더 눈금(원). 1억까지는 100만원, 그 위로 10억까지는 1,000만원 간격 — 한 간격으로 10억까지 늘리면
    1,000만원이 트랙 1% 자리에 눌려 잡을 수가 없다. 슬라이더 값은 이 배열의 자리(index)다. */
const AMOUNT_TICKS: number[] = [];
for (let v = 1_000_000; v < 100_000_000; v += 1_000_000) AMOUNT_TICKS.push(v);
for (let v = 100_000_000; v <= 1_000_000_000; v += 10_000_000) AMOUNT_TICKS.push(v);
const AMOUNT_DEFAULT = 10_000_000;
const AMOUNT_QUICK = [10_000_000, 30_000_000, 50_000_000, 100_000_000, 300_000_000, 500_000_000, 1_000_000_000];
/** 직접 적는 칸의 상한(원). 슬라이더는 10억까지지만 적는 건 100억까지 받는다 — 그 위는 자릿수만 늘고 셈은 같다. */
const AMOUNT_TYPED_MAX = 10_000_000_000;
/** 금액에 가장 가까운 눈금의 자리. 직접 적은 금액(눈금 사이·눈금 밖)도 손잡이를 그 근처에 둔다. */
function amountTick(amount: number): number {
  let best = 0;
  for (let i = 1; i < AMOUNT_TICKS.length; i++) if (Math.abs(AMOUNT_TICKS[i] - amount) < Math.abs(AMOUNT_TICKS[best] - amount)) best = i;
  return best;
}
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
function Badges({ s, sep = true }: { s: StockLite; sep?: boolean }) {
  const items =
    s.kind === "etf"
      ? ["ETF", s.currency === "USD" ? "미국" : "국내"]
      : [s.market === "KOSDAQ" ? "코스닥" : s.market === "US" ? "미국" : "코스피"];
  // 고배당기업(배당소득 분리과세 대상)으로 공시한 국내 회사. 뜻은 배지의 title 로.
  // sep=false 면 안 붙인다 — ISA·연금 계좌 줄엔 분리과세가 뜻이 없다(그 계좌 소득은 금융소득에 안 합친다).
  if (s.highDiv && sep) items.push("분리과세");
  return (
    <>
      {items.map((b) => (
        <span
          key={b}
          className={b === "분리과세" || b === "ETF" ? "dv-badge hz-tip hz-tip-wide" : "dv-badge"}
          data-tip={
            b === "분리과세"
              ? "고배당기업입니다. 배당이 2,000만원을 넘어도 종합과세 대신 분리과세(14~30%)를 고를 수 있습니다."
              : b === "ETF"
                ? "ETF가 주는 돈은 분배금이라 부릅니다. 세금은 배당금과 같습니다."
                : undefined
          }
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
  /** 고른 계좌에 못 담는 종목이라 일반 계좌 세율로 셌다(ISA 의 해외 주식, 연금저축·IRP 의 개별 주식). */
  outside: boolean;
  /** 이 줄이 실제로 세는 계좌 — 줄에 따로 고른 것이 있으면 그것, 없으면 위 칩의 계좌 유형. 세전 모드에서도 표시용으로 든다. */
  account: Account;
  /** 줄에서 따로 고른 줄인가(태그를 진하게). */
  ownAccount: boolean;
  /** 줄의 열쇠(Holding.id). 같은 종목이 두 줄일 수 있어 코드 대신 이걸로 고친다. */
  id: string;
  /** 세전(원) 가운데 과세되는 몫(원). 금융소득 문턱은 이걸로 센다. 모르면 세전과 같다. */
  taxableKrw: number;
};

/**
 * 담은 종목 하나하나의 셈. 미국은 달러를 원으로 옮겨 국내와 한 줄에 더한다 — 환율은 FRED 의
 * 최근 값(1~2영업일 늦다). 세금은 종목마다 다르므로(국내 15.4%·미국 15%) 줄에서 뗀다.
 */
/** mode 는 세전이면 "gross", 아니면 기본 계좌. base 는 기본 계좌(세전이어도 줄의 계좌 표시에 쓴다). */
function computeLines(holdings: Holding[], byCode: Map<string, StockLite>, fx: number, mode: TaxMode, base: Account): Line[] {
  const out: Line[] = [];
  for (const h of holdings) {
    const stock = byCode.get(h.code);
    if (!stock) continue;
    const rate = stock.currency === "USD" ? fx : 1;
    const gross = stock.dps * h.shares;
    const grossKrw = gross * rate;
    const account: Account = h.account ?? base;
    const lineMode: TaxMode = mode === "gross" ? "gross" : account;
    // 세금은 과세되는 몫에만 — 국내 ETF 과표·감액배당. 연금 계좌는 전액(연금소득세는 받을 때 전액에 붙는다).
    const share = isPensionLike(lineMode) && fitsAccount(stock, lineMode) ? 1 : taxableShare(stock);
    const keep = 1 - taxRate(stock, lineMode) * share;
    const basis = h.cost && h.cost > 0 ? h.cost : stock.close;
    out.push({
      id: h.id,
      taxableKrw: grossKrw * taxableShare(stock),
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
      outside: lineMode !== "gross" && !fitsAccount(stock, lineMode),
      account,
      ownAccount: h.account != null,
    });
  }
  // 비과세 종합저축은 원금 5,000만원까지다. 넘으면 넘는 비율만큼의 배당은 일반 계좌 세율(국내 15.4%)로 뗀다 — 줄마다 같은 비율.
  if (mode !== "gross") {
    const ex = out.filter((l) => l.account === "exempt" && !l.outside);
    const invested = ex.reduce((t, l) => t + (l.investKrw ?? 0), 0);
    if (invested > EXEMPT_LIMIT) {
      const over = (invested - EXEMPT_LIMIT) / invested;
      for (const l of ex) {
        const tax = over * TAX_RATE_KR * taxableShare(l.stock);
        l.net = l.gross * (1 - tax);
        l.netKrw = l.grossKrw * (1 - tax);
      }
    }
  }
  return out;
}

/** '내 계좌 맞춤'은 고른 계좌에 따라 목록이 바뀐다(ISA · 연금저축 · IRP). 카드와 담기가 같은 함수를 써야 둘이 어긋나지 않는다. */
function basketCodes(b: BasketLite, mode: TaxMode): string[] {
  if (b.altIrp && mode === "irp") return b.altIrp;
  if (b.altPension && mode === "pension") return b.altPension;
  return b.codes;
}

/** 계좌 목록 맨 아래의 '＋ 계좌' 항목 값 — 고르면 계좌가 아니라 줄이 하나 더 생긴다(HoldingRow). */
const SPLIT_OPTION = "__split";
/** 이 종목을 담을 수 있는 계좌 가운데 `from` 다음 것(일반→ISA→연금저축→IRP 순환). 없으면 null — 미국 주식은 일반 계좌뿐이다. */
function nextAccountFor(s: StockLite, from: Account): Account | null {
  const order = ACCOUNTS.map((a) => a.key);
  const i = order.indexOf(from);
  return [...order.slice(i + 1), ...order.slice(0, i)].find((a) => fitsAccount(s, a)) ?? null;
}

/** 바스켓을 이 투자금으로 같은 금액씩 나눠 담으면 종목마다 몇 주인가. 미국 종목은 종가가 달러라 환율을 곱해 원으로 잰다.
    한 주가 몫보다 비싸면 1주 — 0주로 두면 열 종목 바스켓이 실제로는 아홉 종목이 된다(2026-09-15 지적).
    그래서 카드의 투자금은 슬라이더 금액이 아니라 실제 합으로 적는다. */
function basketShares(codes: string[], amount: number, byCode: Map<string, StockLite>, fx: number): { code: string; shares: number }[] {
  if (!codes.length) return [];
  const per = amount / codes.length;
  return codes.map((code) => {
    const s = byCode.get(code);
    const priceKrw = s?.close ? s.close * (s.currency === "USD" ? fx : 1) : 0;
    return { code, shares: priceKrw > 0 ? Math.max(1, Math.floor(per / priceKrw)) : 0 };
  });
}

/** 바스켓 규칙 알약의 뜻 — 담은 줄의 알약처럼 올리면 한 줄로 뜬다(2026-09-16 지적). 알약 글자가 열쇠다.
    lib/dividend.ts 의 rules 문구를 바꾸면 여기도 같이 바꿀 것 — 없는 열쇠는 툴팁 없이 그냥 알약이다. */
const RULE_TIPS: Record<string, string> = {
  "5년 연속 배당": "최근 5개 회계연도에 해마다 현금배당이 있었습니다",
  "3년 연속 배당": "최근 3개 회계연도에 해마다 현금배당이 있었습니다",
  "줄인 해 없음": "최근 5년 안에 전년보다 배당을 줄인 해가 없습니다",
  "배당성향 80% 이하": "이익의 80% 안에서 배당합니다. 그 위면 실적이 꺾일 때 줄이기 쉽습니다",
  "수익률 순": "배당수익률(1년 배당 ÷ 주가)이 높은 순으로 세웠습니다",
  "5년 연 +10%": "최근 5년 배당이 해마다 평균 10% 넘게 늘었습니다",
  "5년 연 +7%": "최근 5년 배당이 해마다 평균 7% 넘게 늘었습니다",
  "증가율 순": "5년 연평균 증가율이 높은 순으로 세웠습니다",
  "국내 분기·반기 먼저": "지급 달이 2~5개인 국내 종목으로 먼저 열두 달을 채웁니다",
  "빈 달은 미국 분기": "남은 달은 미국 분기 배당주로, 그래도 비면 월분배 ETF 로 채웁니다",
  "시총 1조+": "시가총액 1조원 이상인 회사만 담았습니다",
  "미국·국내 하나씩": "미국 커버드콜 ETF 와 국내 커버드콜 ETF 를 하나씩 번갈아 담았습니다",
  "운용사당 하나": "국내 ETF 는 운용사마다 하나만 담았습니다. 같은 지수 상품으로 줄이 차지 않게 했습니다.",
  "운용사당 둘": "국내 ETF 는 운용사마다 둘까지만 담았습니다. 같은 지수 상품으로 줄이 차지 않게 했습니다.",
  "분배율 30% 이하": "지난 1년 분배금이 가격의 30%를 넘는 ETF(원금 반환이 섞인 것)는 뺐습니다",
  "국내 큰 순": "국내 리츠·인프라 펀드를 시가총액 큰 순으로 세웠습니다",
  "미국 수익률 순": "미국 리츠를 배당수익률 높은 순으로 세웠습니다(10% 넘는 모기지 리츠는 뺌)",
  "국내·미국 하나씩": "국내와 미국을 하나씩 번갈아 담았습니다",
  "25년 넘게 늘림": "해마다 배당을 25년 넘게 늘려 온 회사입니다(배당 귀족)",
  "수익률 1.5~10%": "배당수익률이 1.5% 아래거나 10%를 넘는 곳은 뺐습니다",
  "오래 늘린 순": "해마다 늘려 온 햇수가 긴 순으로 세웠습니다",
  "10년 넘게 늘림": "해마다 배당을 10년 넘게 늘려 온 회사입니다",
  "지급 달 11개+": "지난 1년에 열한 달 넘게 배당이 들어온 종목입니다",
  "주식·ETF 하나씩": "월배당 주식과 월분배 ETF 를 하나씩 번갈아 담았습니다",
  "분배율 15% 이하": "지난 1년 배당·분배금이 가격의 15%를 넘는 것은 뺐습니다",
  "고배당기업 공시": "거래소 고배당기업 목록에 오른 회사입니다(2026~2028년 배당소득 분리과세 대상)",
  "수익률 3%+": "배당수익률 3% 이상인 회사만 담았습니다",
  "보통주보다 20%+ 아래": "우선주 가격이 같은 회사 보통주보다 20% 넘게 쌉니다",
  "시총 1,000억+": "시가총액 1,000억원 이상인 우선주만 담았습니다",
  "국내 회사 6 + 국내 ETF 4": "ISA 에 맞는 국내 큰 회사 여섯과 국내 기초 ETF 넷입니다",
  "해외 기초 ETF 10": "연금저축에 맞는, 해외 자산에 투자하는 국내 상장 ETF 열입니다",
  "배당·리츠·커버드콜 섞어": "배당 지수·리츠 ETF 와 커버드콜 ETF 를 하나씩 번갈아 담았습니다",
  "해외 ETF 7 + 채권 3": "해외 기초 ETF 일곱에 채권·채권혼합 ETF 셋입니다",
  "안전자산 30%": "IRP 의 위험자산 한도(70%)에 맞춰 열 종목 중 셋이 채권·채권혼합 ETF 입니다",
};

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
  const focusShares = (id: string) =>
    setTimeout(() => {
      const el = inputs.get(id);
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
    writeHoldings((prev) => (prev.some((h) => h.code === code) ? prev : [...prev, { id: newId(code, prev), code, shares: DEFAULT_SHARES }]));
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
  const lines = useMemo(() => computeLines(holdings, byCode, fx, taxMode, account), [holdings, byCode, fx, taxMode, account]);
  // 줄마다 계좌가 다를 수 있다 — 라벨 꼬리·툴팁·주의 문구는 줄의 계좌로 센다.
  const mixed = afterTax && new Set(lines.map((l) => l.account)).size > 1;
  const byAccount = (a: Account) => lines.filter((l) => l.account === a);
  const total = lines.reduce((s, l) => s + l.netKrw, 0);
  const invest = lines.reduce((s, l) => s + (l.investKrw ?? 0), 0);
  const priced = lines.filter((l) => l.investKrw != null);
  const yieldPct = invest > 0 ? (priced.reduce((s, l) => s + l.grossKrw, 0) / invest) * 100 : null;
  // 금융소득 종합과세 문턱과 고배당기업(분리과세 대상) 배당의 몫 — **일반 계좌 줄만** 합친다(ISA·연금 계좌 안 소득은 금융소득에
  // 안 합친다). 못 담아 일반 세율로 센 줄(outside)도 실제론 일반 계좌라 넣는다. 세전 합이 문턱 근처인 사람에게만 뜻이 있어 그때만 적는다.
  const generalLines = lines.filter((l) => l.account === "general" || l.outside);
  // 문턱은 과세되는 몫으로 — ETF 과표·감액배당을 뺀 값. 세전 합은 문장에서 그 차이를 밝히는 데 쓴다.
  const sepGross = generalLines.filter((l) => l.stock.highDiv).reduce((s, l) => s + l.taxableKrw, 0);
  const grossAll = generalLines.reduce((s, l) => s + l.grossKrw, 0);
  const taxableAll = generalLines.reduce((s, l) => s + l.taxableKrw, 0);
  const outsideCount = lines.filter((l) => l.outside).length;
  // IRP 위험자산 비율 — IRP 로 세는 줄(outside 아님)의 투자금 가운데 안전자산이 아닌 몫. 30% 를 채우려면 안전자산이
  // x 더 있어야 한다: (safe + x) / (total + x) = 0.3 → x = (0.3·total − safe) / 0.7.
  const irpInfo = (() => {
    if (!afterTax) return undefined;
    const inAcct = byAccount("irp").filter((l) => !l.outside && l.investKrw != null);
    const total = inAcct.reduce((s, l) => s + (l.investKrw ?? 0), 0);
    if (total <= 0) return undefined;
    const safe = inAcct.filter((l) => isSafeAsset(l.stock)).reduce((s, l) => s + (l.investKrw ?? 0), 0);
    const riskPct = ((total - safe) / total) * 100;
    return { riskPct, needKrw: Math.max(0, ((1 - IRP_RISK_MAX) * total - safe) / IRP_RISK_MAX) };
  })();
  const exemptInvested = afterTax ? byAccount("exempt").filter((l) => !l.outside).reduce((s, l) => s + (l.investKrw ?? 0), 0) : 0;
  const heroNote = taxNote(taxMode, grossAll, taxableAll, sepGross, outsideCount, irpInfo, mixed, { invested: exemptInvested });
  // 달력에 못 드는 줄 — 지급 달을 모르는 것(미국 주식, 국내 ETF). 배당이 있는 줄만 센다.
  const noCalCount = lines.filter((l) => l.stock.dps > 0 && !l.stock.pays.length).length;
  // 달력은 지급 달을 아는 종목(국내)만. 미국은 공시에 지급일이 없다.
  const monthly = useMemo(() => {
    const m = new Array<number>(13).fill(0);
    for (const l of lines) {
      // 달러 지급 건(미국 ETF)은 환율을 곱해야 원화 달력에 든다 — 빠뜨렸더니 SCHD 3월이 22원으로 찍혔다.
      const f = (1 - taxRate(l.stock, taxMode === "gross" ? "gross" : l.account)) * (l.stock.currency === "USD" ? fx : 1);
      for (const [month, amt] of l.stock.pays) m[month] += amt * l.shares * f;
    }
    return m;
  }, [lines, taxMode, fx]);

  const add = (code: string, source: string) => {
    if (!byCode.has(code)) return;
    track("dividend_add", { stock_code: gaStockCode(code), select_source: source });
    // 이미 담긴 종목은 다시 안 담는다 — 두 줄로 나누는 건 줄의 계좌 목록 맨 아래 '＋ 계좌'(splitLine)로만. 칩을 두 번 누른 실수로 줄이 늘면 합이 두 배가 된다.
    setHoldings((prev) => (prev.some((h) => h.code === code) ? prev : [...prev, { id: newId(code, prev), code, shares: DEFAULT_SHARES }]));
    focusShares(code);
  };
  const setShares = (id: string, shares: number) =>
    setHoldings((prev) => prev.map((h) => (h.id === id ? { ...h, shares } : h)));
  // 평단. 0이나 빈 값이면 지운다(종가 기준으로 돌아간다).
  const setCost = (id: string, cost: number | null) =>
    setHoldings((prev) => prev.map((h) => (h.id === id ? (cost && cost > 0 ? { ...h, cost } : { id: h.id, code: h.code, shares: h.shares, ...(h.account ? { account: h.account } : {}) }) : h)));
  // 줄의 계좌 유형. 줄에서 고르면 그 줄만 그 계좌로 세고, 위 칩을 바꿔도 안 따라간다(따로 고른 줄이니까).
  const setLineAccount = (id: string, acct: Account) => {
    track("dividend_row_account", { stock_code: gaStockCode(holdings.find((h) => h.id === id)?.code ?? id), account: acct });
    setHoldings((prev) => prev.map((h) => (h.id === id ? { ...h, account: acct } : h)));
  };
  // 같은 종목을 다른 계좌 유형에 한 줄 더 — ISA 에도 일반 계좌에도 든 종목(2026-09-16 피드백). 새 줄은 이 종목을 담을 수 있는
  // 계좌 가운데 지금 줄 다음 것(일반→ISA→연금저축→IRP 순환)이고, 원래 줄도 계좌를 못박아 둘이 위 칩에 같이 끌려가지 않게 한다.
  const splitLine = (id: string) => {
    const h = holdings.find((x) => x.id === id);
    const stock = h && byCode.get(h.code);
    if (!h || !stock) return;
    const from: Account = h.account ?? account;
    const next = nextAccountFor(stock, from);
    if (!next) return;
    track("dividend_row_split", { stock_code: gaStockCode(h.code), account: next });
    const addedId = newId(h.code, holdings);
    setHoldings((prev) => {
      const at = prev.findIndex((x) => x.id === id);
      if (at < 0) return prev;
      const added: Holding = { id: newId(h.code, prev), code: h.code, shares: DEFAULT_SHARES, account: next };
      const fixed: Holding = { ...prev[at], account: from };
      return [...prev.slice(0, at), fixed, added, ...prev.slice(at + 1)];
    });
    focusShares(addedId);
  };
  const remove = (id: string) => {
    track("dividend_remove", { stock_code: gaStockCode(holdings.find((h) => h.id === id)?.code ?? id) });
    setHoldings((prev) => prev.filter((h) => h.id !== id));
  };
  // '담은 종목'은 종목 수다 — 한 종목을 두 계좌로 나눠 두 줄이어도 하나.
  const distinct = new Set(holdings.map((h) => h.code)).size;
  const clearAll = () => {
    // 되돌릴 길이 없으니 한 번 묻는다 — 바스켓 열 종목을 손으로 담아 둔 사람이 실수로 누르면 다 잃는다.
    if (!window.confirm(`담은 종목 ${distinct}개를 모두 뺄까요?`)) return;
    track("dividend_clear", { count: distinct });
    setHoldings([]);
  };
  const applyBasket = (b: BasketLite) => {
    // 카드가 보여 주는 목록과 같은 것을 담는다 — 연금저축·IRP 를 골랐으면 그 계좌 목록(2026-09-15 전엔 늘 ISA 목록을 담았다).
    const next = basketShares(basketCodes(b, taxMode), amount, byCode, fx);
    track("dividend_basket_apply", { basket: b.key, amount });
    // 이미 담긴 종목은 주수를 바스켓 값으로 바꾸고, 나머지는 뒤에 붙인다. 통째로 갈아
    // 끼우지 않는다 — 사용자가 손으로 담아 둔 다른 종목이 사라지면 안 된다.
    setHoldings((prev) => {
      const map = new Map(next.map((h) => [h.code, h.shares]));
      // 같은 종목이 두 줄이면 첫 줄만 바스켓 주수로 — 둘 다 바꾸면 그 종목만 두 배가 된다.
      const done = new Set<string>();
      const kept = prev.map((h) => {
        if (!map.has(h.code) || done.has(h.code)) return h;
        done.add(h.code);
        return { ...h, shares: map.get(h.code) as number };
      });
      const seen = new Set(kept.map((h) => h.code));
      const out = [...kept];
      for (const h of next) if (!seen.has(h.code)) out.push({ id: newId(h.code, out), code: h.code, shares: h.shares });
      return out;
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
    mixed
      ? `세금: 줄마다 고른 계좌로 — ${ACCOUNTS.map((a) => [a, byAccount(a.key).length] as const).filter(([, n]) => n > 0).map(([a, n]) => `${a.label} ${n}`).join(" · ")}`
      : TAX_HELP[taxMode],
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
                1년에 받는 배당{mixed ? " (계좌별)" : accountTag(taxMode)}
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
                  <span className="dv-account-label">계좌 유형</span>
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
            <HoldingsTable lines={lines} inputs={inputs} totalInvest={invest} mode={taxMode} onClear={clearAll} onAccount={setLineAccount} onSplit={splitLine} onShares={setShares} onCost={setCost} onRemove={remove} />
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
  pension: "세금(연금저축): 국내 ETF·상장 리츠는 연금으로 받을 때 5.5% · 주식은 못 담아 15.4%·15%",
  // 안전자산 30% 얘기는 넘었을 때 히어로 아래 한 줄이 하니 여기엔 안 적는다(2026-09-15 지적: 툴팁이 너무 길다).
  irp: "세금(IRP): 국내 ETF·상장 리츠는 연금으로 받을 때 5.5% · 주식은 못 담아 15.4%·15%",
  exempt: `세금(비과세 종합저축): 국내 주식·ETF 배당 0% · 원금 ${wonShort(EXEMPT_LIMIT)}까지(전 금융기관 합산) · 만 65세 이상(2026년부터 기초연금 수급자)·장애인·유공자 등 · 해외 주식은 못 담아 15%`,
  gross: "세전: 세금을 빼기 전 값(국내 15.4%, 미국 15%를 뗍니다)",
};

/**
 * 히어로 아래 한 줄 — 금융소득 종합과세 문턱(2,000만원)까지 얼마 남았나, 넘으면 어떻게 되나, 고배당기업 배당을
 * 분리과세로 빼면 어떻게 되나. 세전 합이 1,000만원을 넘을 때만 적는다. 다른 이자·배당은 모르니 그 말도 적는다.
 * ISA·연금저축·IRP 는 문턱과 무관하다(계좌 안 소득은 금융소득에 안 합친다) — 그 계좌에 못 담은 줄이 있을 때만 적는다.
 * IRP 는 담긴 것 가운데 위험자산이 70% 를 넘으면 안전자산이 얼마 더 있어야 하는지 한 줄 더 적는다.
 */
function taxNote(mode: TaxMode, grossAll: number, taxableAll: number, sepGross: number, outsideCount: number, irp?: { riskPct: number; needKrw: number }, mixed = false, exemptOver?: { invested: number }): string | null {
  if (mode === "gross") return null;
  const parts: string[] = [];
  if (outsideCount) {
    parts.push(
      mixed
        ? `${outsideCount}종목은 고른 계좌에 못 담는 종목이라 일반 계좌로 셌습니다.`
        : mode === "isa" || mode === "exempt"
          ? `${outsideCount}종목은 해외 주식이라 ${mode === "isa" ? "ISA" : "비과세 종합저축"}에 못 담아 일반 계좌로 셌습니다.`
          : `${outsideCount}종목은 개별 주식이거나 해외 상장이라 ${mode === "irp" ? "IRP" : "연금저축"}에 못 담아 일반 계좌로 셌습니다(국내 ETF와 상장 리츠만 담깁니다).`,
    );
  }
  if (exemptOver && exemptOver.invested > EXEMPT_LIMIT) {
    parts.push(`비과세 종합저축은 원금 ${wonShort(EXEMPT_LIMIT)}까지입니다. 지금 ${wonShort(Math.round(exemptOver.invested / 1e4) * 1e4)}이라 넘는 몫의 배당은 일반 계좌 세율로 셌습니다(다른 금융기관 것과 합산이라 실제 한도는 더 적을 수 있습니다).`);
  }
  if (irp && irp.riskPct > IRP_RISK_MAX * 100) {
    parts.push(`IRP는 위험자산이 70%까지입니다. 지금 ${Math.round(irp.riskPct)}%라 채권·채권혼합 ETF 같은 안전자산이 ${wonShort(Math.ceil(irp.needKrw / 1e4) * 1e4)} 더 있어야 합니다.`);
  }
  if (mode !== "general" && !mixed) return parts.length ? parts.join(" ") : null;
  // 여기부터는 일반 계좌 줄의 금융소득 문턱 — 세전이 아니라 **과세되는 몫**으로 센다(국내 ETF 과표·감액배당을 뺀 값).
  // 섞였으면 '일반 계좌 줄' 이라고 밝힌다. 비과세 몫이 있으면 그 차이를 한 번 적는다.
  const who = mixed ? "일반 계좌 줄 " : "";
  const exempt = grossAll - taxableAll;
  const base = `${who}과세 대상 배당 ${won(taxableAll)}` + (exempt >= 1 ? `(세전 ${won(grossAll)}에서 ETF 과표·감액배당의 비과세 몫 ${won(exempt)}을 뺀 값)` : "");
  // 세전이 1,000만원을 넘으면 적는다 — 과세 대상이 그보다 훨씬 적은 사람(감액배당·국내 커버드콜)에게 그 사실이 곧 답이다.
  if (grossAll < COMPOSITE_NOTE_FROM) return parts.length ? parts.join(" ") : null;
  if (taxableAll < COMPOSITE_FROM) {
    parts.push(`${base}입니다. 금융소득 종합과세 문턱 ${wonShort(COMPOSITE_FROM)}까지 ${won(COMPOSITE_FROM - taxableAll)} 남았습니다(다른 이자·배당은 안 넣은 값).`);
    return parts.join(" ");
  }
  const over = taxableAll - COMPOSITE_FROM;
  if (sepGross <= 0) {
    parts.push(`${base}으로 금융소득 종합과세 문턱 ${wonShort(COMPOSITE_FROM)}을 넘습니다. 넘는 ${won(over)}은 다른 소득과 합쳐 누진세율(6~45%)로 과세됩니다.`);
    return parts.join(" ");
  }
  const rest = taxableAll - sepGross;
  const restOver = rest - COMPOSITE_FROM;
  parts.push(
    `${base}으로 금융소득 종합과세 문턱 ${wonShort(COMPOSITE_FROM)}을 넘습니다. ` +
    `이 중 고배당기업 배당 ${won(sepGross)}을 분리과세(2,000만원까지 15.4% · 3억까지 22%)로 신청하면 ` +
    (restOver > 0
      ? `나머지 ${won(rest)} 가운데 문턱을 넘는 ${won(restOver)}만 다른 소득과 합쳐 과세됩니다.`
      : `나머지 ${won(rest)}은 문턱 아래라 종합과세를 피합니다.`),
  );
  return parts.join(" ");
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
            <p className="dv-search-none">찾는 것이 없습니다. 코스피·코스닥 주식 전부, 미국 주식 560종목, ETF 980여 개(미국 33 · 국내는 운용사 가리지 않고 지난 1년 분배가 있는 전부)가 담깁니다.</p>
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
  mode,
  onClear,
  onAccount,
  onSplit,
  onShares,
  onCost,
  onRemove,
}: {
  lines: Line[];
  inputs: Map<string, HTMLInputElement>;
  /** 투자금 합(원). 줄마다 비중을 내는 분모. */
  totalInvest: number;
  /** 고른 계좌 — IRP 면 안전자산 줄에 알약을 붙인다. */
  mode: TaxMode;
  onClear: () => void;
  onAccount: (id: string, acct: Account) => void;
  onSplit: (id: string) => void;
  onShares: (id: string, shares: number) => void;
  onCost: (id: string, cost: number | null) => void;
  onRemove: (id: string) => void;
}) {
  // '담은 종목'은 종목 수다 — 한 종목을 두 계좌로 나눠 두 줄이어도 하나. 줄 수는 안 적는다(2026-09-16 지적).
  const distinct = new Set(lines.map((l) => l.stock.code)).size;
  return (
    <div className="dv-table" role="table" aria-label="담은 종목">
      {/* 표 위 한 줄 — 몇 종목인지와 '모두 빼기'. 바스켓을 통째로 담아 본 뒤 하나씩 ×로 지우던 것(2026-09-16). */}
      <div className="dv-table-bar">
        <span className="dv-table-count">담은 종목 {distinct}개</span>
        <button type="button" className="dv-table-clear" onClick={onClear}>
          모두 빼기
        </button>
      </div>
      <div className="dv-trow dv-thead" role="row">
        <span role="columnheader">종목</span>
        <span role="columnheader">주수 · 평단</span>
        <span role="columnheader">1주당 1년 배당</span>
        <span role="columnheader">1년에 받는 배당</span>
        <span role="columnheader">배당수익률</span>
        <span role="columnheader">비중 · 투자금</span>
        <span role="columnheader" aria-label="빼기" />
      </div>
      {lines.map((l) => (
        <HoldingRow key={l.id} line={l} inputs={inputs} weightPct={totalInvest > 0 && l.investKrw != null ? (l.investKrw / totalInvest) * 100 : null} mode={mode} onAccount={onAccount} onSplit={onSplit} onShares={onShares} onCost={onCost} onRemove={onRemove} />
      ))}
    </div>
  );
}

function HoldingRow({
  line,
  inputs,
  weightPct,
  mode,
  onAccount,
  onSplit,
  onShares,
  onCost,
  onRemove,
}: {
  line: Line;
  inputs: Map<string, HTMLInputElement>;
  /** 투자금 가운데 이 줄의 몫(%). 종가가 없으면 null. */
  weightPct: number | null;
  mode: TaxMode;
  onAccount: (id: string, acct: Account) => void;
  onSplit: (id: string) => void;
  onShares: (id: string, shares: number) => void;
  onCost: (id: string, cost: number | null) => void;
  onRemove: (id: string) => void;
}) {
  const { stock: s, shares } = line;
  const canSplit = nextAccountFor(s, line.outside ? "general" : line.account) != null;
  // 평단 칸은 값이 있거나 열어 둔 동안만 보인다 — 줄마다 빈 칸이 서 있으면 표가 무거워진다.
  const [costOpen, setCostOpen] = useState(false);
  const showCost = line.onCost || costOpen;

  /* 이름 아래 두 줄 — 사실 조각(짧은 알약, 뜻은 title 로)과 주의(짧은 문장). 문장을 '·' 로 이어 붙였더니 세 줄이
     됐다(2026-09-13 지적). 알약 하나에 사실 하나, 문장은 주의만. */
  /* 이름 아래 알약들. 사실(회색)과 주의(붉은 기)가 한 줄에 선다 — 주의를 문장 줄로 따로 두었더니 줄이 지저분했다(2026-09-17 지적).
     툴팁은 초보자도 읽는 한두 문장 — 숫자 하나, 뜻 하나. 원천·계산법·조항은 안 적는다(같은 날 지적). */
  const facts: { text: string; title: string; warn?: boolean }[] = [];
  const md = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;
  if (s.payout) {
    const [year, p] = s.payout;
    const when = year != null ? `${year}년` : "지난 1년";
    const pctText = `${Math.round(p).toLocaleString("ko-KR")}%`;
    if (p < 0) facts.push({ text: "적자 배당", title: `${when}엔 적자였는데도 배당을 줬습니다.`, warn: true });
    else if (p > 100) facts.push({ text: `배당성향 ${pctText}`, title: `${when} 번 돈보다 많이 줬습니다. 오래 가기 어렵습니다.`, warn: true });
    else facts.push({ text: `배당성향 ${pctText}`, title: `${when} 번 돈의 ${pctText}를 배당으로 줬습니다.` });
  }
  if ((s.growthYears ?? 0) >= 10) facts.push({ text: `${s.growthYears}년 연속 늘림`, title: `${s.growthYears}년째 해마다 배당을 늘렸습니다.` });
  // 5년 연평균 증가율. 늘린 회사만이 아니라 줄인 회사도 적는다.
  if (s.growth5 != null && s.streak >= 5) {
    const g = Math.round(s.growth5);
    if (g >= 1) facts.push({ text: `5년 연 +${g}%`, title: `최근 5년 동안 해마다 ${g}%씩 늘었습니다.` });
    else if (g <= -1) facts.push({ text: `5년 연 −${-g}%`, title: `최근 5년 동안 해마다 ${-g}%씩 줄었습니다.` });
  }
  if (mode !== "gross" && line.account === "irp" && !line.outside && isSafeAsset(s)) facts.push({ text: "안전자산", title: "IRP 에서 안전자산(30% 몫)으로 칩니다." });
  // 세금이 붙는 몫 — 돈이 달라지는 줄에만(전액 과세면 안 붙는다). 국내 주식은 감액배당, 국내 ETF 는 운용사가 공시한 과표.
  if (s.taxable != null && s.dps > 0 && s.taxable < s.dps * 0.99) {
    const pct = Math.round((s.taxable / s.dps) * 100);
    if (s.kind === "stock") {
      facts.push({
        text: pct <= 0 ? "비과세" : `비과세 ${100 - pct}%`,
        title: pct <= 0
          ? "감액배당이라 세금이 없습니다. 회사가 쌓아 둔 자본을 돌려주는 배당이라 그렇습니다."
          : `배당 ${won(s.dps)} 중 ${won(s.dps - s.taxable)}은 감액배당이라 세금이 없습니다.`,
      });
    } else {
      facts.push({
        text: `과세 ${pct}%`,
        title: pct <= 0 ? `분배금 ${won(s.dps)}에 세금이 안 붙습니다.` : `분배금 ${won(s.dps)} 중 ${won(s.taxable)}에만 세금이 붙습니다.`,
      });
    }
  }
  // 지난 날짜는 안 붙인다 — 표가 며칠 낡으면 '다음' 기준일·지급일이 어제일 수 있다.
  const todayKst = TODAY_KST;
  if (s.nextRecord && s.nextRecord >= todayKst) facts.push({ text: `기준일 ${md(s.nextRecord)}`, title: `${s.nextRecord}에 주주면 다음 배당을 받습니다.` });
  if (s.nextPay && s.nextPay[0] && s.nextPay[0] >= todayKst) facts.push({ text: `${md(s.nextPay[0])} 지급 ${money(s.nextPay[1], s)}`, title: `${s.nextPay[0]}에 1주당 ${money(s.nextPay[1], s)}을 줍니다. 회사가 정해 공시한 값입니다.` });
  else if (s.nextPay && !s.nextPay[0] && s.nextRecord && s.nextRecord >= todayKst) facts.push({ text: `확정 ${money(s.nextPay[1], s)}`, title: `다음 배당은 1주당 ${money(s.nextPay[1], s)}으로 정해졌습니다. 지급일은 아직입니다.` });

  // ── 주의(붉은 기 알약)
  if (line.outside) facts.push({ text: "일반 계좌로 셈", title: s.currency === "USD" ? "해외 종목은 이 계좌에 못 담아 일반 계좌 세율로 셌습니다." : "개별 주식은 연금 계좌에 못 담아 일반 계좌 세율로 셌습니다.", warn: true });
  // 미국은 "없다"고 못 말한다 — 허쉬·디지털리얼티처럼 1주당 배당 태그를 안 다는 회사가 있다.
  if (s.dps === 0) facts.push({ text: "배당 없음", title: s.currency === "USD" ? "공시에서 배당을 못 읽었습니다. 안 주는 회사일 수 있습니다." : "최근 1년 현금배당이 없습니다.", warn: true });
  if (s.unusual) facts.push({ text: "특별배당 섞임", title: "지난 1년에 특별·청산배당이 섞였습니다. 내년에도 이만큼 준다고 보긴 어렵습니다.", warn: true });
  // 첫 배당 — 끝난 회계연도에 배당이 없었는데 지난 1년에 있다. 국내만: 미국 연속 연수는 늘린 햇수를 물려받는다.
  else if (s.currency === "KRW" && s.kind === "stock" && s.dps > 0 && s.streak === 0) facts.push({ text: "작년 무배당", title: "지난 회계연도엔 배당이 없었습니다. 이어질지는 알 수 없습니다.", warn: true });
  if (s.kind !== "etf" && s.estimated) facts.push({ text: "추정", title: "1년치 기록이 없어 마지막 배당으로 어림한 값입니다.", warn: true });
  // 일드맥스(TSLY·MSTY)류. 지난 1년 분배가 가격의 3할을 넘으면 원금을 돌려주는 상품이라 봐야 한다.
  if ((s.yieldPct ?? 0) > HOT_YIELD_PCT) facts.push({ text: "초고배당", title: "분배금이 달마다 크게 흔들립니다. 원금을 돌려주는 몫이 섞여 있습니다.", warn: true });
  if (s.close == null) facts.push({ text: "종가 없음", title: "종가가 없어 투자금과 수익률을 못 냅니다.", warn: true });
  if (s.dps > 0 && !s.pays.length) facts.push({ text: "달력엔 없음", title: "지급일 기록이 없어 아래 달력에는 안 들어갑니다.", warn: true });

  const fractional = s.currency === "USD";
  const [sharesTyped, setSharesTyped] = useState<string | null>(null);
  const step = (d: number) => {
    setSharesTyped(null);
    onShares(line.id, Math.max(0, Math.round((shares + d) * 1e6) / 1e6));
  };
  // 이 줄의 투자금(원). 종가도 평단도 없거나 0주면 안 적는다.
  const invest = line.investKrw != null && line.investKrw > 0 ? won(line.investKrw) : null;
  return (
    <div className="dv-trow" role="row">
      <span className="dv-tcell dv-tname" role="cell">
        <StockLogo code={s.code} name={s.name} market={s.market} />
        <span className="dv-tname-txt">
          <span className="dv-tname-main">
            {s.name}
            <Badges s={s} sep={mode === "gross" || line.account === "general" || line.outside} />
            {/* 줄의 계좌 — 시장 배지 옆 알약. 기본 계좌를 따르면 흐리게, 따로 골랐으면 진하게. 못 담는 계좌는 목록에서 흐리고 까닭을 적는다.
                주수 칸에 두었더니 스테퍼·평단과 겹쳐 복잡해 보였다(2026-09-16 지적). */}
            {mode !== "gross" && (
              <select
                className={`dv-tacct${line.ownAccount ? " dv-tacct-own" : ""}`}
                // 못 담는 줄은 실제로 일반 계좌로 세니 태그도 그렇게 보인다(아래 주의 문구와 같은 말).
                value={line.outside ? "general" : line.account}
                // 맨 아래 '＋ 계좌'를 고르면 계좌를 바꾸는 게 아니라 같은 종목을 다른 계좌에 한 줄 더 만든다. 값은 줄의 계좌로
                // 되돌아온다(controlled). 따로 단추를 두면 줄이 복잡해진다는 지적(2026-09-16)으로 목록 안에 넣었다.
                onChange={(e) => (e.target.value === SPLIT_OPTION ? onSplit(line.id) : onAccount(line.id, e.target.value as Account))}
                aria-label={`${s.name} 계좌 유형`}
                title={
                  (line.ownAccount ? "이 줄만 따로 고른 계좌입니다." : "위에서 고른 계좌를 따릅니다. 이 줄만 바꿀 수 있습니다.") +
                  (canSplit ? " 맨 아래 '＋ 계좌'로 같은 종목을 다른 계좌에도 담습니다." : "")
                }
              >
                {ACCOUNTS.map((a) => (
                  <option key={a.key} value={a.key} disabled={!fitsAccount(s, a.key)}>
                    {ACCOUNT_SHORT[a.key]}
                    {!fitsAccount(s, a.key) ? " (못 담음)" : ""}
                  </option>
                ))}
                {/* 같은 종목을 다른 계좌에도 — 담을 수 있는 계좌가 둘 이상일 때만(미국 주식은 일반 계좌뿐이라 없다). */}
                {canSplit && <option value={SPLIT_OPTION}>＋ 계좌 (같은 종목 다른 계좌)</option>}
              </select>
            )}
          </span>
          {facts.length > 0 && (
            <span className="dv-tfacts">
              {/* 브라우저 기본 title 은 1초 뒤에야 뜨고 폰에선 안 뜬다 — 이 화면의 말풍선(.hz-tip)으로. */}
              {facts.map((f) => (
                <span key={f.text} className={`dv-tfact${f.warn ? " dv-tfact-warn" : ""} hz-tip hz-tip-wide`} data-tip={f.title}>
                  {f.text}
                </span>
              ))}
            </span>
          )}
        </span>
      </span>
      <span className="dv-tcell dv-tshares" role="cell">
        <button type="button" className="dv-step" aria-label={`${s.name} 1주 빼기`} onClick={() => step(-1)} disabled={shares <= 0}>
          −
        </button>
        <input
          ref={(el) => {
            if (el) inputs.set(line.id, el);
            else inputs.delete(line.id);
          }}
          type="number"
          inputMode={fractional ? "decimal" : "numeric"}
          min={0}
          step={fractional ? 0.000001 : 1}
          value={sharesTyped ?? String(shares)}
          aria-label={`${s.name} 주수`}
          onChange={(e) => {
            // 미국 주식은 소수점 매매(증권사 소수 여섯 자리)라 소수를 받는다(2026-09-17 피드백). 치는 동안의 "0." 이 지워지지 않게
            // 문자열을 따로 들고, 칸을 떠나면 값에서 다시 그린다. 국내는 정수.
            setSharesTyped(e.target.value);
            const raw = Number(e.target.value);
            const v = fractional ? Math.round(raw * 1e6) / 1e6 : Math.floor(raw);
            onShares(line.id, Number.isFinite(v) && v > 0 ? v : 0);
          }}
          onBlur={() => setSharesTyped(null)}
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
                onCost(line.id, Number.isFinite(v) && v > 0 ? v : null);
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
      <span className="dv-tcell dv-tnum" role="cell">
        {s.dps > 0 ? money(s.dps, s) : "없음"}
        {/* ETF 가 주는 돈은 분배금 — 배당인지 분배금인지 묻는 피드백(2026-09-17). 주식 줄은 배당이라 아무것도 안 적는다. */}
        {s.kind === "etf" && s.dps > 0 && <span className="dv-tsub">분배금</span>}
      </span>
      <span className="dv-tcell dv-tnum dv-tstrong" role="cell">
        {won(line.netKrw)}
        {s.currency === "USD" && s.dps > 0 && <span className="dv-tsub">{usd(line.net)}</span>}
        {/* 1,100px 아래에선 비중 칸이 접히므로 투자금을 여기 아래에. 넓은 화면에선 CSS 가 숨긴다. */}
        {invest && <span className="dv-tsub dv-tinvest-m">투자금 {invest}</span>}
      </span>
      <span className="dv-tcell dv-tnum" role="cell">
        {line.yieldPct != null ? pct(line.yieldPct) : "·"}
        {line.onCost && <span className="dv-tsub">내 평단 기준</span>}
      </span>
      {/* 비중 — 투자금 가운데 이 줄이 몇 %인지. 숫자 옆에 얇은 막대로 한 번 더. 그 아래 이 줄의 투자금(주수 × 평단, 없으면 종가) —
          "내가 이 종목에 얼마 넣었지"를 히어로까지 올라가 보지 않게(2026-09-17 피드백). 주수 칸에 두었더니 주수·평단·투자금 셋이
          한 칸에 몰려 복잡해 보였다(같은 날 지적). */}
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
        {invest && <span className="dv-tsub dv-tinvest">{invest}</span>}
      </span>
      <span className="dv-tcell" role="cell">
        <button type="button" className="dv-remove" aria-label={`${s.name} 빼기`} onClick={() => onRemove(line.id)}>
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
type UpcomingItem = { key: string; when: string; sortKey: string; name: string; what: string; amount: string | null; amountKrw: number; tag: "확정" | "예상" | null };

function upcomingOf(lines: Line[], fx: number, mode: TaxMode): { items: UpcomingItem[]; sureKrw: number; expectedKrw: number } {
  // 날짜는 KST 로 — toISOString 은 UTC 라 한국 새벽 0~9시엔 어제가 '오늘'이 돼 지난 일정이 다가오는 일정에 남는다.
  const today = new Date(Date.now() + 9 * 3600e3);
  const iso = today.toISOString().slice(0, 10);
  const horizon = new Date(today.getTime() + UPCOMING_DAYS * 86400e3).toISOString().slice(0, 10);
  const year = Number(iso.slice(0, 4));
  const out: UpcomingItem[] = [];
  const dateLabel = (d: string) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일`;
  // 같은 종목이 두 줄(ISA·일반 계좌)이면 일정은 하나로 — 세후 금액은 줄마다 세율이 달라 줄별로 떼어 더한다.
  const groups = new Map<string, Line[]>();
  for (const l of lines) groups.set(l.stock.code, [...(groups.get(l.stock.code) ?? []), l]);
  const net = (ls: Line[], perShare: number): [string, number] => {
    const s = ls[0].stock;
    // 줄마다 세율이 다르고, 세금은 과세되는 몫에만(과표·감액배당) — 표의 세후와 같은 식.
    const v = ls.reduce((sum, l) => {
      const m: TaxMode = mode === "gross" ? "gross" : l.account;
      const share = isPensionLike(m) && fitsAccount(s, m) ? 1 : taxableShare(s);
      return sum + perShare * l.shares * (1 - taxRate(s, m) * share);
    }, 0);
    const krw = v * (s.currency === "USD" ? fx : 1);
    return [s.currency === "USD" ? `${usd(v)} · ${won(krw)}` : won(krw), krw];
  };
  for (const ls of groups.values()) {
    const s = ls[0].stock;
    const unit = s.kind === "etf" ? "분배금" : "배당금";
    // 공시된 확정값 — 지급일까지 있으면 그날, 지급일이 없으면(국내 결산배당 공시) 기준일 줄에 금액을 적는다.
    const sure = s.nextPay && (s.nextPay[0] ? s.nextPay[0] >= iso : !!s.nextRecord && s.nextRecord >= iso) ? s.nextPay : null;
    if (s.nextRecord && s.nextRecord >= iso) {
      const a = sure && !sure[0] ? net(ls, sure[1]) : null;
      out.push({
        key: `${s.code}-r`, when: dateLabel(s.nextRecord), sortKey: s.nextRecord, name: s.name,
        what: a ? `배당기준일 · 1주에 ${money(sure![1], s)} · 지급일은 아직` : "배당기준일",
        amount: a ? a[0] : null, amountKrw: a ? a[1] : 0, tag: a ? "확정" : null,
      });
    }
    if (sure && sure[0]) {
      const a = net(ls, sure[1]);
      out.push({ key: `${s.code}-p`, when: dateLabel(sure[0]), sortKey: sure[0], name: s.name, what: `${unit} 1주에 ${money(sure[1], s)}`, amount: a[0], amountKrw: a[1], tag: "확정" });
      continue;
    }
    if (sure) continue;
    // 날짜를 모르면 지난 1년 지급일을 올해(지났으면 내년)로 옮겨 가장 가까운 것 하나.
    const expected = s.pays
      .map(([m, v, d]) => {
        const md = `${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        return { date: `${year}-${md}` >= iso ? `${year}-${md}` : `${year + 1}-${md}`, v };
      })
      .filter((e) => e.date <= horizon)
      .sort((a, b) => a.date.localeCompare(b.date))[0];
    if (expected) {
      const a = net(ls, expected.v);
      out.push({
        key: `${s.code}-e`,
        when: `${dateLabel(expected.date)}쯤`,
        sortKey: expected.date,
        name: s.name,
        what: `${unit} 1주에 ${money(expected.v, s)} · 지난해 이날`,
        amount: a[0],
        amountKrw: a[1],
        tag: "예상",
      });
    }
  }
  out.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  // 합은 자르기 전 전부(석 달 안). 표에 못 든 줄도 합엔 든다.
  const sureKrw = out.filter((i) => i.tag === "확정").reduce((t, i) => t + i.amountKrw, 0);
  const expectedKrw = out.filter((i) => i.tag === "예상").reduce((t, i) => t + i.amountKrw, 0);
  return { items: out.slice(0, UPCOMING_MAX), sureKrw, expectedKrw };
}

function Upcoming({ lines, fx, mode }: { lines: Line[]; fx: number; mode: TaxMode }) {
  const { items, sureKrw, expectedKrw } = upcomingOf(lines, fx, mode);
  if (!items.length) return null;
  const after = mode === "gross" ? "세전" : "세후";
  return (
    <div className="dv-upcoming">
      <div className="dv-cal-head dv-cal-head-col">
        <span className="dv-cal-title">
          다가오는 일정
          <span
            className="hz-tip hz-tip-wide dv-help"
            data-tip="확정은 회사가 정해 공시한 다음 배당이고, 예상은 지난해 같은 날에 준 만큼으로 어림한 값입니다. 석 달 안만 보입니다."
            style={{ cursor: "help" }}
            aria-label="다가오는 일정 설명"
          >
            <Icon name="help" style={{ fontSize: 14 }} />
          </span>
        </span>
        {/* 확정·예상 합 — 표에 못 든 줄까지 석 달 안 전부. 둘 다 0 이면(기준일만 있을 때) 안 적는다. */}
        {sureKrw + expectedKrw > 0 && (
          <span className="dv-cal-sub">
            석 달 안 {after} {sureKrw > 0 ? `확정 ${won(sureKrw)}` : ""}
            {sureKrw > 0 && expectedKrw > 0 ? " · " : ""}
            {expectedKrw > 0 ? `예상 ${won(expectedKrw)}` : ""}
          </span>
        )}
      </div>
      <ul className="dv-upcoming-list">
        {items.map((it) => (
          <li key={it.key} className="dv-upcoming-row">
            <span className="dv-upcoming-when">{it.when}</span>
            <span className="dv-upcoming-name">{it.name}</span>
            {it.tag && <span className={`dv-upcoming-tag${it.tag === "확정" ? " dv-upcoming-tag-sure" : ""}`}>{it.tag}</span>}
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

/** 만원 단위 숫자를 쉼표로. 적는 칸이 이 꼴로 보인다(1억 → 10,000). */
const manFmt = (v: number) => Math.round(v / 1e4).toLocaleString("ko-KR");

function AmountControl({ amount, onChange }: { amount: number; onChange: (v: number) => void }) {
  // 적는 칸은 만원 단위. 치는 동안의 문자열을 따로 들어야 "1,00" 같은 중간 상태에서 값이 튀지 않고,
  // 칸을 떠나면 다시 금액에서 그린다. 치는 대로 바로 반영해서 아래 바스켓 주수가 같이 움직인다.
  const [typed, setTyped] = useState<string | null>(null);
  const shown = typed ?? manFmt(amount);
  const tick = amountTick(amount);
  const onType = (raw: string) => {
    const digits = raw.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "").slice(0, 7);
    const n = Math.min(AMOUNT_TYPED_MAX, Number(digits) * 1e4);
    // 상한을 넘겨 치면 칸에도 바로 상한을 보인다 — 칸은 200,000,000 인데 옆 억 표기는 100억이면 어느 쪽이 맞는지 모른다.
    setTyped(digits ? manFmt(n) : "");
    if (n >= 1e4) onChange(n);
  };
  return (
    <div className="hz-sheet dv-amount">
      <div className="dv-amount-head">
        <label className="dv-amount-label" htmlFor="dv-amount-input">투자금</label>
        <span className="dv-amount-val">
          <input
            id="dv-amount-input"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            className="dv-amount-input"
            value={shown}
            onChange={(e) => onType(e.target.value)}
            onFocus={(e) => e.target.select()}
            onBlur={() => setTyped(null)}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            aria-label="바스켓 투자금(만원)"
            style={{ width: `${Math.max(3, shown.length + 1)}ch` }}
          />
          <span className="dv-amount-unit">만원</span>
          {/* 1억부터는 만원 숫자만으로 자릿수를 세야 해서 억 단위로 한 번 더 적는다(50,000만원 → 5억원). */}
          {amount >= 1e8 && <span className="dv-amount-echo">{wonShort(amount)}</span>}
        </span>
        <span className="dv-amount-quick">
          {AMOUNT_QUICK.map((v) => (
            <button key={v} type="button" className={`dv-quick${amount === v ? " dv-quick-on" : ""}`} onClick={() => { setTyped(null); onChange(v); }} aria-pressed={amount === v}>
              {wonShort(v)}
            </button>
          ))}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={AMOUNT_TICKS.length - 1}
        step={1}
        value={tick}
        onChange={(e) => { setTyped(null); onChange(AMOUNT_TICKS[Number(e.target.value)]); }}
        aria-label="바스켓 투자금"
        aria-valuetext={wonShort(amount)}
        className="dv-range"
        // 채운 만큼을 트랙 색으로 — 브라우저 기본 슬라이더는 옛 모양이라(2026-09-15 지적) 트랙·손잡이를 직접 그린다.
        style={{ "--p": `${(tick / (AMOUNT_TICKS.length - 1)) * 100}%` } as React.CSSProperties}
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
  // '내 계좌 맞춤'은 연금저축·IRP 를 골랐을 때 그 계좌 목록으로 바뀐다(IRP 는 안전자산 셋 포함). 다른 바스켓은 계좌와 무관.
  const codes = basketCodes(basket, mode);
  const holdings = basketShares(codes, amount, byCode, fx).map((h) => ({ id: h.code, ...h }));
  const lines = computeLines(holdings, byCode, fx, mode, mode === "gross" ? "general" : mode);
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
            {basket.altIrp && mode === "irp" ? `${basket.title} (IRP)` : basket.altPension && mode === "pension" ? `${basket.title} (연금저축)` : basket.altPension && mode === "exempt" ? `${basket.title} (비과세 종합저축)` : basket.altPension ? `${basket.title} (ISA)` : basket.title}
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
              {(mode === "irp" && basket.rulesIrp ? basket.rulesIrp : mode === "pension" && basket.rulesPension ? basket.rulesPension : basket.rules).map((r) =>
                RULE_TIPS[r] ? (
                  <span key={r} className="dv-tfact hz-tip hz-tip-wide" data-tip={RULE_TIPS[r]}>
                    {r}
                  </span>
                ) : (
                  <span key={r} className="dv-tfact">
                    {r}
                  </span>
                ),
              )}
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
