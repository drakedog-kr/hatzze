"use client";

// 상수·종목 검색·줄 계산·배지. DividendCalculator.tsx 에서 그대로 옮겨 왔다(store.ts 머리말 참고).

import { type BasketLite, type StockLite } from "./types";
import type { Holding } from "./store";
import { TAX_RATE_KR, EXEMPT_LIMIT, isPensionLike, fitsAccount, taxRate, taxableShare, ACCOUNTS } from "./tax";
import type { Account, TaxMode } from "./tax";

/** 히어로 라벨에 붙는 꼬리. 세후·세전은 머리의 칸이 이미 말하므로 안 적고(2026-09-13 지적), 계좌가 일반이 아닐 때만 그 이름. */
/** 이 위면 배당이 아니라 원금 반환이 섞인 ETF(일드맥스류). 바스켓의 MAX_YIELD_ETF(lib/dividend.ts)와 같은 30. 칩·줄 주의 둘 다 이 값. */
export const HOT_YIELD_PCT = 30;

/** 오늘(KST, YYYY-MM-DD). 모듈이 읽힐 때 한 번 — 렌더 안에서 Date.now() 를 부르면 React 컴파일러 린트가 막는다(AppShell 의 NEWS_LIVE 와 같은 사정). */
export const TODAY_KST = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

export const accountTag = (mode: TaxMode) => (mode === "isa" || mode === "exempt" || isPensionLike(mode) ? ` (${ACCOUNTS.find((m) => m.key === mode)?.label})` : "");

/** 종목을 처음 담을 때의 주수. 0 이면 결과가 안 서고, 1 은 값이 너무 작아 감이 안 온다. */
export const DEFAULT_SHARES = 10;

/** 목표 월 배당의 기본값(만원)과 매달 더 넣는 돈의 기본값(만원). 파이어족 글에서 가장 자주 나오는 숫자. */
export const GOAL_DEFAULT_MAN = 100;

/** 목표 월 배당의 빠른 선택(만원). 파이어족 글이 말하는 눈금 — 용돈 50 · 월세 100 · 생활비 200·300 · 은퇴 500. */
export const GOAL_PRESETS_MAN = [50, 100, 200, 300, 500];

export const ADD_DEFAULT_MAN = 50;

/** 바스켓 네 줄의 이름. lib/dividend.ts 의 pickBaskets 가 이 순서(셋씩)로 돌려준다. */
export const BASKET_ROWS = ["기본", "현금흐름", "미국", "국내"];

/** 빈 달 채우기의 줄마다 칩 수. '더 보기' 묶음과 같다. */
export const ROW_CHIPS = 8;

/** 다가오는 일정의 줄 수 상한과, 지난해 지급일로 어림한 것을 얼마나 앞까지 보여 주나(날). */
export const UPCOMING_MAX = 6;

export const UPCOMING_DAYS = 92;

/** 목표까지 몇 달인지 셀 때의 상한(달). 넘으면 "이 속도로는 안 닿는다"로 적는다. */
export const GOAL_MAX_MONTHS = 50 * 12;
/** 바스켓 투자금 슬라이더 눈금(원). 1억까지는 100만원, 그 위로 10억까지는 1,000만원 간격 — 한 간격으로 10억까지 늘리면
    1,000만원이 트랙 1% 자리에 눌려 잡을 수가 없다. 슬라이더 값은 이 배열의 자리(index)다. */

export const AMOUNT_TICKS: number[] = [];
for (let v = 1_000_000; v < 100_000_000; v += 1_000_000) AMOUNT_TICKS.push(v);
for (let v = 100_000_000; v <= 1_000_000_000; v += 10_000_000) AMOUNT_TICKS.push(v);

export const AMOUNT_DEFAULT = 10_000_000;

export const AMOUNT_QUICK = [10_000_000, 30_000_000, 50_000_000, 100_000_000, 300_000_000, 500_000_000, 1_000_000_000];

/** 직접 적는 칸의 상한(원). 슬라이더는 10억까지지만 적는 건 100억까지 받는다 — 그 위는 자릿수만 늘고 셈은 같다. */
export const AMOUNT_TYPED_MAX = 10_000_000_000;

/** 금액에 가장 가까운 눈금의 자리. 직접 적은 금액(눈금 사이·눈금 밖)도 손잡이를 그 근처에 둔다. */
export function amountTick(amount: number): number {
  let best = 0;
  for (let i = 1; i < AMOUNT_TICKS.length; i++) if (Math.abs(AMOUNT_TICKS[i] - amount) < Math.abs(AMOUNT_TICKS[best] - amount)) best = i;
  return best;
}

export const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/** 파이프라인이 15년치만 읽으므로 연속 배당은 15에서 멈춘다. 그 값은 "적어도 15년"이다. */
const STREAK_CAP = 15;

export const streakLabel = (y: number) => (y >= STREAK_CAP ? `${STREAK_CAP}년 넘게` : `${y}년째`);
/* ── 세 갈래 — 국장 · 미장 · ETF ───────────────────────────────────────
   한 검색창에 섞어 두니 SCHD 가 미장인지 ETF 인지, 코카콜라가 어디 있는지 안 보였다(2026-09-12 지적).
   처음엔 탭으로 갈랐는데 "눌러야 보이는 건 별로"라 해서(같은 날) **세 갈래를 늘 나란히** 둔다 —
   칩은 세 판으로, 검색 결과는 갈래 제목 아래 묶어서. */

export type Scope = "kr" | "us" | "etf";

export const SCOPES: { key: Scope; label: string; desc: string }[] = [
  { key: "kr", label: "국장", desc: "요즘 채널에서 자주 오르내린 배당주" },
  { key: "us", label: "미장", desc: "요즘 채널에서 자주 오르내린 배당주" },
  { key: "etf", label: "ETF", desc: "많이 드는 미국 배당·월분배 ETF" },
];

export const scopeOf = (s: StockLite): Scope => (s.kind === "etf" ? "etf" : s.currency === "USD" ? "us" : "kr");

/** 이름 줄의 배지 — 이게 무엇인가만(코스피·코스닥·미국, ETF·국내). 국장·미장·ETF 가 한 표에 섞이므로 **모든 줄에** 붙인다.
    분리과세 같은 세금 성질은 여기 안 두고 아래 알약 줄에(2026-09-17 지적: 이름 줄은 정체만, 성질은 알약 줄에). */

export function Badges({ s }: { s: StockLite }) {
  const items =
    s.kind === "etf"
      ? ["ETF", s.currency === "USD" ? "미국" : "국내"]
      : [s.market === "KOSDAQ" ? "코스닥" : s.market === "US" ? "미국" : "코스피"];
  return (
    <>
      {items.map((b) => (
        <span
          key={b}
          className={b === "ETF" ? "dv-badge hz-tip hz-tip-wide" : "dv-badge"}
          data-tip={b === "ETF" ? "ETF가 주는 돈은 분배금이라 부릅니다. 세금은 배당금과 같습니다." : undefined}
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
export function rankMatches(stocks: StockLite[], query: string, limit = 8): StockLite[] {
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
export type Line = {
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
  /** 계산에서 뺀 줄(Holding.off). 표에는 흐리게 남고 합계·달력·일정·목표에는 안 든다. */
  off: boolean;
};

/**
 * 담은 종목 하나하나의 셈. 미국은 달러를 원으로 옮겨 국내와 한 줄에 더한다 — 환율은 FRED 의
 * 최근 값(1~2영업일 늦다). 세금은 종목마다 다르므로(국내 15.4%·미국 15%) 줄에서 뗀다.
 */
/** mode 는 세전이면 "gross", 아니면 기본 계좌. base 는 기본 계좌(세전이어도 줄의 계좌 표시에 쓴다). */
export function computeLines(holdings: Holding[], byCode: Map<string, StockLite>, fx: number, mode: TaxMode, base: Account): Line[] {
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
      off: h.off === true,
    });
  }
  // 비과세 종합저축은 원금 5,000만원까지다. 넘으면 넘는 비율만큼의 배당은 일반 계좌 세율(국내 15.4%)로 뗀다 — 줄마다 같은 비율.
  // 계산에서 뺀 줄은 원금에도 안 든다.
  if (mode !== "gross") {
    const ex = out.filter((l) => l.account === "exempt" && !l.outside && !l.off);
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
export function basketCodes(b: BasketLite, mode: TaxMode): string[] {
  if (b.altIrp && mode === "irp") return b.altIrp;
  if (b.altPension && mode === "pension") return b.altPension;
  return b.codes;
}

/** 계좌 목록 맨 아래의 '＋ 계좌' 항목 값 — 고르면 계좌가 아니라 줄이 하나 더 생긴다(HoldingRow). */
export const SPLIT_OPTION = "__split";

/** 이 종목을 담을 수 있는 계좌 가운데 `from` 다음 것(일반→ISA→연금저축→IRP 순환). 없으면 null — 미국 주식은 일반 계좌뿐이다. */
export function nextAccountFor(s: StockLite, from: Account): Account | null {
  const order = ACCOUNTS.map((a) => a.key);
  const i = order.indexOf(from);
  return [...order.slice(i + 1), ...order.slice(0, i)].find((a) => fitsAccount(s, a)) ?? null;
}

/** 바스켓을 이 투자금으로 같은 금액씩 나눠 담으면 종목마다 몇 주인가. 미국 종목은 종가가 달러라 환율을 곱해 원으로 잰다.
    한 주가 몫보다 비싸면 1주 — 0주로 두면 열 종목 바스켓이 실제로는 아홉 종목이 된다(2026-09-15 지적).
    그래서 카드의 투자금은 슬라이더 금액이 아니라 실제 합으로 적는다. */

export function basketShares(codes: string[], amount: number, byCode: Map<string, StockLite>, fx: number): { code: string; shares: number }[] {
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

export const RULE_TIPS: Record<string, string> = {
  "5년 연속 배당": "최근 5개 회계연도에 해마다 현금배당이 있었습니다",
  "3년 연속 배당": "최근 3개 회계연도에 해마다 현금배당이 있었습니다",
  "줄인 해 없음": "최근 5년 안에 전년보다 배당을 줄인 해가 없습니다",
  "배당성향 80% 이하": "이익의 80% 안에서 배당합니다. 그 위면 실적이 꺾일 때 줄이기 쉽습니다",
  "수익률 순": "배당수익률(1년 배당 ÷ 주가)이 높은 순으로 세웠습니다",
  "5년 연 +10%": "최근 5년 배당이 해마다 평균 10% 넘게 늘었습니다",
  "5년 연 +7%": "최근 5년 배당이 해마다 평균 7% 넘게 늘었습니다",
  "증가율 순": "5년 연평균 증가율이 높은 순으로 세웠습니다",
  "국내 분기·반기 먼저": "지급 달이 2~5개인 국내 종목으로 먼저 열두 달을 채웁니다",
  "빈 달은 미국 분기": "남은 달은 미국 분기 배당주로, 그래도 비면 월분배 ETF로 채웁니다",
  "시총 1조+": "시가총액 1조원 이상인 회사만 담았습니다",
  "미국·국내 하나씩": "미국 커버드콜 ETF와 국내 커버드콜 ETF를 하나씩 번갈아 담았습니다",
  "운용사당 하나": "국내 ETF는 운용사마다 하나만 담았습니다. 같은 지수 상품으로 줄이 차지 않게 했습니다.",
  "운용사당 둘": "국내 ETF는 운용사마다 둘까지만 담았습니다. 같은 지수 상품으로 줄이 차지 않게 했습니다.",
  "분배율 30% 이하": "지난 1년 분배금이 가격의 30%를 넘는 ETF(원금 반환이 섞인 것)는 뺐습니다",
  "국내 큰 순": "국내 리츠·인프라 펀드를 시가총액 큰 순으로 세웠습니다",
  "미국 수익률 순": "미국 리츠를 배당수익률 높은 순으로 세웠습니다(10% 넘는 모기지 리츠는 뺌)",
  "국내·미국 하나씩": "국내와 미국을 하나씩 번갈아 담았습니다",
  "25년 넘게 늘림": "해마다 배당을 25년 넘게 늘려 온 회사입니다(배당 귀족)",
  "수익률 1.5~10%": "배당수익률이 1.5% 아래거나 10%를 넘는 곳은 뺐습니다",
  "오래 늘린 순": "해마다 늘려 온 햇수가 긴 순으로 세웠습니다",
  "10년 넘게 늘림": "해마다 배당을 10년 넘게 늘려 온 회사입니다",
  "지급 달 11개+": "지난 1년에 열한 달 넘게 배당이 들어온 종목입니다",
  "주식·ETF 하나씩": "월배당 주식과 월분배 ETF를 하나씩 번갈아 담았습니다",
  "분배율 15% 이하": "지난 1년 배당·분배금이 가격의 15%를 넘는 것은 뺐습니다",
  "고배당기업 공시": "거래소 고배당기업 목록에 오른 회사입니다(2026~2028년 배당소득 분리과세 대상)",
  "수익률 3%+": "배당수익률 3% 이상인 회사만 담았습니다",
  "보통주보다 20%+ 아래": "우선주 가격이 같은 회사 보통주보다 20% 넘게 쌉니다",
  "시총 1,000억+": "시가총액 1,000억원 이상인 우선주만 담았습니다",
  "국내 회사 6 + 국내 ETF 4": "ISA에 맞는 국내 큰 회사 여섯과 국내 기초 ETF 넷입니다",
  "해외 기초 ETF 10": "연금저축에 맞는, 해외 자산에 투자하는 국내 상장 ETF 열입니다",
  "배당·리츠·커버드콜 섞어": "배당 지수·리츠 ETF와 커버드콜 ETF를 하나씩 번갈아 담았습니다",
  "해외 ETF 7 + 채권 3": "해외 기초 ETF 일곱에 채권·채권혼합 ETF 셋입니다",
  "안전자산 30%": "IRP의 위험자산 한도(70%)에 맞춰 열 종목 중 셋이 채권·채권혼합 ETF입니다",
};
