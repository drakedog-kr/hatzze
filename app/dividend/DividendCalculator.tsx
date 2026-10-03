"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { gaStockCode, track } from "@/lib/ga";
import { SectionHead } from "../kadera/SectionHead";
import { LoadFailedNote } from "../LoadFailedNote";
import { inflate, type BasketLite, type MoreLists, type StockLite, type StockWire } from "./types";
import { newId, holdingsStore, writeHoldings } from "./store";
import type { Holding } from "./store";
import { IRP_RISK_MAX, isSafeAsset, ACCOUNTS, TAX_HELP, taxNote } from "./tax";
import type { Account, TaxMode } from "./tax";
import { accountTag, DEFAULT_SHARES, GOAL_DEFAULT_MAN, ADD_DEFAULT_MAN, AMOUNT_DEFAULT, SCOPES, scopeOf, computeLines, basketCodes, nextAccountFor, basketShares } from "./shared";
import type { Scope } from "./shared";
import { goalBasis, monthlyOf } from "./calc";
import { SearchBox, QuickChips, MoreRows } from "./Search";
import { HoldingsTable } from "./Holdings";
import type { SortKey } from "./Holdings";
import { MonthFill, upcomingOf } from "./Calendar";
import { GoalBox } from "./Goal";
import { BasketBoard } from "./V2Baskets";
import { CalendarModule, DvCover, UpcomingModule, YearlyModule } from "./V2Parts";

// '모두 빼기' 확인 판(Base UI 대화상자, gzip 약 20KB)은 처음 누를 때 받아 온다(ClearDialog.tsx).
const ClearDialog = dynamic(() => import("./ClearDialog").then((m) => m.ClearDialog), { ssr: false });

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

/* ── 본체 ─────────────────────────────────────────────────────────── */
export function DividendCalculator({
  stocks: wire,
  baskets,
  popular,
  popularUs,
  popularEtf,
  more,
  usdkrw,
  failedSources,
  counts,
  priceDate,
  usPriceDate,
}: {
  stocks: StockWire[];
  baskets: BasketLite[];
  popular: string[];
  popularUs: string[];
  popularEtf: string[];
  more: MoreLists;
  usdkrw: { rate: number; date: string | null } | null;
  /** 조회에 실패한 자료의 이름(lib/dividend.ts 의 DividendData.failedSources). 비면 안 그린다. */
  failedSources: string[];
  /** 첫 줄 띠 — 담을 수 있는 종목 수(검색에 걸리는 전부)와 종가 기준일. */
  counts: { kr: number; us: number; etf: number };
  priceDate: string | null;
  usPriceDate: string | null;
}) {
  // 서버는 null 칸을 뺀 꼴(StockWire)로 보낸다 — 4,366개라 HTML 이 2.2MB 였다. 여기서 한 번 채워 두면 아래는 전부 StockLite.
  const stocks = useMemo(() => wire.map(inflate), [wire]);
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
  // '모두 빼기' 확인 판(shadcn AlertDialog)이 열렸나. clearUsed 는 판을 한 번이라도 받아 왔나 — 한 번 붙이면 떼지 않는다
  // (닫을 때 떼면 Base UI 가 초점을 '모두 빼기'로 돌려놓기 전에 사라진다).
  const [clearAsk, setClearAsk] = useState(false);
  const [clearUsed, setClearUsed] = useState(false);
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

  // 이 페이지가 어떻게 열렸나를 한 번 보낸다 — 새로고침·뒤로가기·브라우저가 죽였다 되살린 것(iOS 27 사파리에서 멈추고
  // 다시 열린다는 제보, 2026-09-17). GA 에서 기기별 새로고침 비율을 보면 고친 뒤 줄었는지 알 수 있다. 값은 짧은 낱말뿐.
  useEffect(() => {
    try {
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      const ua = navigator.userAgent;
      const os = /iPhone|iPad/.test(ua) ? `ios${(ua.match(/OS (\d+)_/) || [])[1] ?? ""}` : /Android/.test(ua) ? "android" : "desktop";
      track("dividend_open", { nav_type: nav?.type ?? "unknown", discarded: (document as { wasDiscarded?: boolean }).wasDiscarded ? "yes" : "no", os });
    } catch {
      /* 못 재면 안 보낸다 */
    }
  }, []);

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
  // 체크를 푼 줄은 표에만 남고 셈에서 빠진다 — 아래 합계·달력·일정·목표·세금 안내는 전부 이 목록으로. 표만 lines 를 본다.
  const active = useMemo(() => lines.filter((l) => !l.off), [lines]);
  // 줄마다 계좌가 다를 수 있다 — 라벨 꼬리·툴팁·주의 문구는 줄의 계좌로 센다.
  const mixed = afterTax && new Set(active.map((l) => l.account)).size > 1;
  const byAccount = (a: Account) => active.filter((l) => l.account === a);
  const invest = active.reduce((s, l) => s + (l.investKrw ?? 0), 0);
  // 목표까지 칸도 투자금을 아는 줄로만 센다 — 종가 없는 줄의 배당까지 넣으면 수익률이 부풀어 필요한 투자금이 몇 분의 1로 적혔다.
  const goalIn = goalBasis(active);
  // 금융소득 종합과세 문턱과 고배당기업(분리과세 대상) 배당의 몫 — **일반 계좌 줄만** 합친다(ISA·연금 계좌 안 소득은 금융소득에
  // 안 합친다). 못 담아 일반 세율로 센 줄(outside)도 실제론 일반 계좌라 넣는다. 세전 합이 문턱 근처인 사람에게만 뜻이 있어 그때만 적는다.
  const generalLines = active.filter((l) => l.account === "general" || l.outside);
  // 문턱은 과세되는 몫으로 — ETF 과표·감액배당을 뺀 값. 세전 합은 문장에서 그 차이를 밝히는 데 쓴다.
  const sepGross = generalLines.filter((l) => l.stock.highDiv).reduce((s, l) => s + l.taxableKrw, 0);
  const grossAll = generalLines.reduce((s, l) => s + l.grossKrw, 0);
  const taxableAll = generalLines.reduce((s, l) => s + l.taxableKrw, 0);
  const outsideCount = active.filter((l) => l.outside).length;
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
  // 달력에 못 드는 줄 — 지급일 기록(pays)이 없는 것(stockanalysis 에 없는 미국 종목 등). 배당이 있는 줄만 센다.
  const noCalCount = active.filter((l) => l.stock.dps > 0 && !l.stock.pays.length).length;
  // 달력은 지급 달을 아는 줄만. 세후는 줄의 세후 ÷ 세전으로 — 히어로·표와 같은 값(calc.ts 의 monthlyOf).
  const monthly = useMemo(() => monthlyOf(active, fx), [active, fx]);

  // 둘째 줄 결과 셋의 재료 — 담은 종목(active)만.
  // ⛔ 담은 종목이 없는 날 첫 바스켓을 1,000만원어치 담은 셈으로 미리 그리던 '예시'는 걷었다(2026-10-03 "선택한 거 없는데 왜 미리
  //    계산이 되지?") — '예시' 표시가 칸 머리에 작게만 있어 고른 것처럼 읽혔고, 그 금액은 아래 바스켓 표 첫 줄과 같은 숫자였다.
  //    이제 결과 셋은 종목을 담았을 때만 선다(아래 렌더).
  const bandTotal = active.reduce((s, l) => s + l.netKrw, 0);
  const bandInvest = active.reduce((s, l) => s + (l.investKrw ?? 0), 0);
  const bandYield = bandInvest > 0 ? (active.filter((l) => l.investKrw != null).reduce((s, l) => s + l.grossKrw, 0) / bandInvest) * 100 : null;
  const upcoming = upcomingOf(active, fx, taxMode);

  const add = (code: string, source: string) => {
    if (!byCode.has(code)) return;
    track("dividend_add", { stock_code: gaStockCode(code), select_source: source });
    // 이미 담긴 종목은 다시 안 담는다 — 두 줄로 나누는 건 줄의 계좌 목록 맨 아래 '＋ 계좌'(splitLine)로만. 칩을 두 번 누른 실수로 줄이 늘면 합이 두 배가 된다.
    // 담겨 있는데 체크를 풀어 둔 줄이면 다시 켠다 — "담기"를 눌렀는데 합계가 안 움직이면 고장으로 읽힌다.
    setHoldings((prev) =>
      prev.some((h) => h.code === code) ? prev.map((h) => (h.code === code && h.off ? { ...h, off: undefined } : h)) : [...prev, { id: newId(code, prev), code, shares: DEFAULT_SHARES }],
    );
    focusShares(code);
  };
  const setShares = (id: string, shares: number) =>
    setHoldings((prev) => prev.map((h) => (h.id === id ? { ...h, shares } : h)));
  // 평단. 0이나 빈 값이면 지운다(종가 기준으로 돌아간다).
  const setCost = (id: string, cost: number | null) =>
    setHoldings((prev) => prev.map((h) => (h.id === id ? (cost && cost > 0 ? { ...h, cost } : { id: h.id, code: h.code, shares: h.shares, ...(h.account ? { account: h.account } : {}), ...(h.off ? { off: true } : {}) }) : h)));
  // 줄을 계산에 넣고 빼기 — 종목 앞 체크. 끄면 줄은 그대로 두고 합계·달력·일정·목표에서만 빠진다("이거에 이거 더하면 얼마"를
  // ×로 빼고 다시 담지 않고 보게, 2026-09-18 피드백). 켠 줄은 off 를 안 남긴다(저장값을 짧게).
  const setLineOn = (id: string, on: boolean) => {
    track("dividend_row_toggle", { stock_code: gaStockCode(holdings.find((h) => h.id === id)?.code ?? id), on });
    setHoldings((prev) => prev.map((h) => (h.id === id ? (on ? { ...h, off: undefined } : { ...h, off: true }) : h)));
  };
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
  // 순서 — 저장 순서가 곧 표 순서다. 줄 왼쪽 손잡이를 끌거나(마우스·터치) 손잡이에서 ↑↓ 로 옮긴다(2026-09-20 피드백 "목록 순서를 수정할 수 있게").
  // 자리는 index 가 아니라 **그 자리에 있던 줄의 id** 로 받는다 — 표(lines)는 목록에 없는 종목의 줄을 건너뛰어 holdings 와 index 가 어긋날 수 있다.
  // 빼서 그 id 자리에 끼우면 위로는 그 앞, 아래로는 그 뒤가 된다(빼면서 한 칸 당겨지니까).
  const moveLine = (id: string, targetId: string, method: "drag" | "key") => {
    if (id === targetId || !holdings.some((h) => h.id === id) || !holdings.some((h) => h.id === targetId)) return;
    track("dividend_row_move", { method });
    setHoldings((prev) => {
      const from = prev.findIndex((h) => h.id === id);
      const to = prev.findIndex((h) => h.id === targetId);
      if (from < 0 || to < 0 || from === to) return prev;
      const out = prev.slice();
      const [h] = out.splice(from, 1);
      out.splice(to, 0, h);
      return out;
    });
  };
  // 정렬 — 보기 모드가 아니라 순서 자체를 한 번 바꿔 저장한다. 그 뒤 손으로 옮기면 그 위에 이어진다. 값이 없는 줄(종가 없음 등)은 뒤로.
  const sortLines = (key: SortKey) => {
    track("dividend_sort", { key });
    const by = new Map(lines.map((l) => [l.id, l]));
    const num = (h: Holding) => {
      const l = by.get(h.id);
      if (!l) return -Infinity;
      const v = key === "net" ? l.netKrw : key === "invest" ? l.investKrw : l.yieldPct;
      return v ?? -Infinity;
    };
    setHoldings((prev) =>
      prev.slice().sort((a, b) => (key === "name" ? (by.get(a.id)?.stock.name ?? a.code).localeCompare(by.get(b.id)?.stock.name ?? b.code, "ko") : num(b) - num(a))),
    );
  };
  // '담은 종목'은 종목 수다 — 한 종목을 두 계좌로 나눠 두 줄이어도 하나.
  const distinct = new Set(holdings.map((h) => h.code)).size;
  // 되돌릴 길이 없으니 한 번 묻는다 — 바스켓 열 종목을 손으로 담아 둔 사람이 실수로 누르면 다 잃는다.
  // 예전엔 브라우저 기본 확인창(window.confirm)이었다. 사이트 글꼴·색이 아니고, 폰에선 주소가 제목처럼 붙었다.
  const clearAll = () => {
    setClearUsed(true);
    setClearAsk(true);
  };
  const clearConfirmed = () => {
    track("dividend_clear", { count: distinct });
    setHoldings([]);
    setClearAsk(false);
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
        // 체크를 풀어 둔 줄이면 켠다 — 바스켓 카드가 약속한 합이 표에 서야 한다.
        return { ...h, shares: map.get(h.code) as number, off: undefined };
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
    // 표가 빈 것과 못 읽은 것을 갈라 말한다 — 못 읽은 날 "아직 자료가 없습니다"라 적으면 파이프라인 탓으로 읽힌다.
    return (
      <div className="hz-tx">
        <section className="hz-sheet">
          {failedSources.length ? (
            <SectionHead icon="calculate" title="자료를 불러오지 못했습니다" desc="잠시 뒤 다시 열어 주십시오. 저장된 배당 기록은 그대로 있습니다." level={2} />
          ) : (
            <SectionHead icon="calculate" title="아직 자료가 없습니다" desc="파이프라인이 종목별 배당 요약을 만들면 이 자리에 계산기가 뜹니다." level={2} />
          )}
        </section>
      </div>
    );
  }

  // 히어로 라벨 옆 물음표는 세금을 어떻게 뗐는지 한 줄만 말한다. 시세 기준일·배당 기록 기준·'배당은 바뀔 수 있다'까지
  // 세 줄이던 것을 2026-09-30 에 줄였다(툴팁은 한 문장 — 이용자 지적 "너무 복잡해").
  // 출처 이름은 여기 안 적는다(2026-09-13 지적) — 투자 유의사항의 '데이터 출처'가 그 자리다(app/disclaimer/page.tsx.
  // 전 화면 푸터가 거기로 건너간다. stockanalysis 는 약관이 출처 표기를 조건으로 발췌를 허용하므로 거기서 지우지 말 것).
  const helpText = mixed
    ? `세금: 줄마다 고른 계좌로 — ${ACCOUNTS.map((a) => [a, byAccount(a.key).length] as const).filter(([, n]) => n > 0).map(([a, n]) => `${a.label} ${n}`).join(" · ")}`
    : TAX_HELP[taxMode];

  return (
    // v2(2026-10-03) — 카더라 · MDD 와 같은 범위(v2-kd 토큰 · 폭 단계, v2-dv 는 이 화면 전용 덮기 · v2.css).
    // 큰 구간 제목('01 내 종목으로 계산' · '02 성향별 바스켓')은 걷었다 — 모듈 머리가 이름을 말한다.
    <div className="hz-tx v2-kd v2-dv">
      <LoadFailedNote sources={failedSources} />
      <DvCover counts={counts} usdkrw={usdkrw} priceDate={priceDate} usPriceDate={usPriceDate} />

      {/* 둘째 줄 — 결과 셋. 예전엔 한 시트 안에서 검색 · 칩 · 표 아래로 내려가야 달력 · 일정이 보였다. 담은 종목이 있을 때만 선다. */}
      {lines.length > 0 && (
        <div className="v2-dv-band">
          <YearlyModule
            total={bandTotal}
            invest={bandInvest}
            yieldPct={bandYield}
            onCostNote={lines.some((l) => l.onCost)}
            afterTax={afterTax}
            onTax={(v) => {
              track("dividend_tax_toggle", { after_tax: v });
              setAfterTax(v);
            }}
            account={account}
            onAccount={(a) => {
              track("dividend_account", { account: a });
              setAccount(a);
            }}
            tag={mixed ? " (계좌별)" : accountTag(taxMode)}
            help={helpText}
            note={heroNote}
          />
          <CalendarModule
            monthly={monthly}
            noCalCount={noCalCount}
            selected={fillMonth}
            onPick={(m) => {
              setFillMonth((cur) => (cur === m ? null : m));
              if (fillMonth !== m) track("dividend_fill_month", { month: m });
            }}
          />
          <UpcomingModule items={upcoming.items} sureKrw={upcoming.sureKrw} expectedKrw={upcoming.expectedKrw} afterTax={afterTax} />
        </div>
      )}
      {/* 달력에서 누른 달 — 그 달에 주는 종목(빈 달 채우기). 둘째 줄 바로 아래 판 폭으로. */}
      {fillMonth != null && <MonthFill month={fillMonth} order={fillOrder} holdings={holdings} onPick={(code) => add(code, "fill_month")} onClose={() => setFillMonth(null)} />}

      <section
        ref={calcRef}
        className={`v2-mod v2-dv-mine${dragOver ? " dv-drop-on" : ""}`}
        onDragOver={onDragOver}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        aria-label="내 종목 계산기"
      >
        <header className="v2-mod-head">
          <h2>내 종목</h2>
        </header>
        <div className="dv-body">
          <SearchBox stocks={stocks} onPick={(code) => add(code, "search")} />
          {/* 세 갈래가 늘 나란히 선다. 갈래마다 이름 · 근거 · 칩 여덟 · '더 보기'. 좁으면 한 갈래씩 쌓인다.
              '더 보기'를 열면 그 갈래의 묶음들이 세 갈래 **아래에 가로로** 펼쳐진다. 폰에서는 CSS order 로 그 갈래 바로 아래에 붙는다. */}
          <div className="dv-groups">
            {SCOPES.map((o) => (
              <section key={o.key} className="dv-group" data-scope={o.key} aria-label={o.label}>
                <div className="dv-group-head">
                  <span className="dv-group-title">{o.label}</span>
                  <span className="dv-group-desc">{o.desc}</span>
                </div>
                <QuickChips codes={chipsBy[o.key]} byCode={byCode} holdings={holdings} onPick={(code) => add(code, `chip_${o.key}`)} />
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
            <HoldingsTable lines={lines} inputs={inputs} totalInvest={invest} mode={taxMode} onClear={clearAll} onToggle={setLineOn} onMove={moveLine} onSort={sortLines} onAccount={setLineAccount} onSplit={splitLine} onShares={setShares} onCost={setCost} onRemove={remove} />
          )}
        </div>
      </section>
      {clearUsed && <ClearDialog open={clearAsk} onOpenChange={setClearAsk} count={distinct} onConfirm={clearConfirmed} />}
      {lines.length > 0 && goalIn.invest > 0 && goalIn.net > 0 && (
        <GoalBox invest={goalIn.invest} net={goalIn.net} skipped={goalIn.skipped} goalMan={goalMan} addMan={addMan} onGoal={setGoalMan} onAdd={setAddMan} />
      )}

      {/* 성향별 바스켓 — 표 한 판 + 읽기 칸(V2Baskets.tsx). 예전 카드 열두 장(2,766px)과 '바로 가기' 줄을 대신한다. */}
      <BasketBoard baskets={baskets} amount={amount} onAmount={setAmount} byCode={byCode} mode={taxMode} fx={fx} onApply={applyBasket} onPick={(code) => add(code, "basket")} />
    </div>
  );
}
