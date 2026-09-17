"use client";

// 계좌 유형과 세율·과세 몫. DividendCalculator.tsx 에서 그대로 옮겨 왔다(store.ts 머리말 참고).

import { type StockLite } from "./types";
import { won, wonShort } from "./format";

export type Account = "general" | "isa" | "pension" | "irp" | "exempt";

export type TaxMode = "gross" | Account;

export const isAccount = (v: unknown): v is Account => v === "general" || v === "isa" || v === "pension" || v === "irp" || v === "exempt";

/** 국내 배당소득세 14% + 지방소득세 1.4%. 증권사가 지급 때 떼고 넣어 준다. */
export const TAX_RATE_KR = 0.154;

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

export const EXEMPT_LIMIT = 50_000_000;

/** IRP 위험자산 한도. 이 위면 안전자산(채권형·채권혼합형 ETF·예금)을 더 넣어야 한다. */
export const IRP_RISK_MAX = 0.7;

/** IRP 안전자산을 이름으로 가르는 규칙 — lib/dividend.ts 의 SAFE_ETF 와 같은 식(서버 코드를 클라이언트로 끌어오지 않으려고 베낀다). */
const SAFE_ETF = /채권|국채|회사채|단기|머니마켓|CD|KOFR|금리|혼합/;

/** '혼합50' 처럼 주식이 절반이면 안전자산이 아니다(IRP 안전자산은 주식 40% 이하 채권혼합까지). 커버드콜·밸런스도 옵션 상품이라 뺀다. */
const NOT_SAFE_ETF = /혼합[5-9]\d|커버드콜|밸런스/;

/** IRP 의 안전자산 30% 에 드는 종목인가 — 국내 상장 채권형·채권혼합형 ETF. */
export const isSafeAsset = (s: StockLite) => s.kind === "etf" && s.currency === "KRW" && SAFE_ETF.test(s.name) && !NOT_SAFE_ETF.test(s.name);

/** 연금 계좌 둘 — 담을 수 있는 것과 세율이 같다. */
export const isPensionLike = (mode: TaxMode) => mode === "pension" || mode === "irp";

/** 금융소득 종합과세 문턱(원). 이자·배당 합이 이걸 넘으면 넘는 몫이 다른 소득과 합쳐 누진세율(6~45%)이다. */
const COMPOSITE_FROM = 20_000_000;

/** 문턱 안내를 히어로에 띄우기 시작하는 세전 배당. 그 아래선 어차피 원천징수로 끝나 문턱 얘기가 뜻이 없다. */
const COMPOSITE_NOTE_FROM = 10_000_000;

/** 이 계좌에 담을 수 있는 종목인가. */
export function fitsAccount(s: StockLite, mode: TaxMode): boolean {
  if (mode === "isa" || mode === "exempt") return s.currency === "KRW";
  // 연금저축·IRP 는 국내 상장 ETF 에 더해 상장 리츠·인프라 펀드도 담긴다(미래에셋·한투 연금 매매 안내, 2026-09-15 확인).
  // 개별 주식과 해외 상장은 못 담는다. IRP 에선 리츠가 위험자산 몫이다.
  if (isPensionLike(mode)) return s.currency === "KRW" && (s.kind === "etf" || s.reit);
  return true;
}

/** 줄의 세율. 못 담는 줄은 일반 계좌로. */
export function taxRate(s: StockLite, mode: TaxMode): number {
  if (mode === "gross") return 0;
  if (mode === "isa" && fitsAccount(s, mode)) return TAX_RATE_ISA;
  if (mode === "exempt" && fitsAccount(s, mode)) return 0;
  if (isPensionLike(mode) && fitsAccount(s, mode)) return TAX_RATE_PENSION;
  return s.currency === "USD" ? TAX_RATE_US : TAX_RATE_KR;
}
/** dps 가운데 세금이 붙는 몫(0~1). 모르면 1(전액). 국내 ETF 는 운용사 공시 과표, 국내 주식은 감액배당을 뺀 값(2026-09-17 피드백).
    연금 계좌는 받을 때 안 떼고 연금 수령 때 전액에 연금소득세라 이 비율을 안 쓴다. */

export function taxableShare(s: StockLite): number {
  if (s.taxable == null || s.dps <= 0) return 1;
  return Math.min(1, Math.max(0, s.taxable / s.dps));
}

export const ACCOUNTS: { key: Account; label: string }[] = [
  { key: "general", label: "일반 계좌" },
  { key: "isa", label: "ISA" },
  { key: "pension", label: "연금저축" },
  { key: "irp", label: "IRP" },
  { key: "exempt", label: "비과세 종합저축" },
];

/** 줄의 계좌 알약(select)은 폭이 좁아 짧은 이름. */
export const ACCOUNT_SHORT: Record<Account, string> = { general: "일반 계좌", isa: "ISA", pension: "연금저축", irp: "IRP", exempt: "비과세저축" };

/** 물음표 툴팁의 첫 줄 — 세금을 어떻게 뗐나, 계좌마다. */
export const TAX_HELP: Record<TaxMode, string> = {
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
export function taxNote(mode: TaxMode, grossAll: number, taxableAll: number, sepGross: number, outsideCount: number, irp?: { riskPct: number; needKrw: number }, mixed = false, exemptOver?: { invested: number }): string | null {
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
