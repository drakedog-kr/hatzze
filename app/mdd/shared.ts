// MDD 정밀분석 화면이 같이 쓰는 타입·상수·서식. 2026-09-17 에 MddExplorer.tsx(2,499줄)에서 그대로 옮겨 왔다.
// 카드 하나 고치려고 2,500줄을 열던 것을 나눈 것이라 동작은 안 바뀐다(나눈 뒤 렌더된 DOM 을 프로덕션과 대조했다).

import type { MddAnalysis, RiskProfile as RiskProfileData } from "@/lib/mdd";

export type StockOption = {
  code: string;
  name: string;
  market: string | null;
  /** 검색에만 쓰는 별칭. 미국 종목의 정식 영문명이다("Tesla, Inc.") — 화면에는 안 쓴다.
      원래 이름이 영어인 회사를 한글 표기로만 찾게 두면 "tesla" 가 아무것도 못 찾는다. */
  alias?: string | null;
};

/** 추천 종목 = 종목 + 오른쪽에 붙는 한 조각 근거(왜 지금 이게 떠 있나). */
export type Suggestion = StockOption & { note: string };

export type SuggestGroups = { surging: Suggestion[]; report: Suggestion[] };

type Peer = { name: string; code: string; dd: number; isSelf: boolean };

export type ThemeCmp = { name: string; peers: Peer[]; avgDd: number; sincePeakAvg: number | null };

// 이름이 아래 Attribution 컴포넌트와 겹쳐 Data 를 붙였다(파일을 나누면서 한 모듈 안 겹침이 import 충돌이 된다).
export type AttributionData = { sincePeakDays: number; stock: number; market: number | null; theme: number | null };

export type MddResult = {
  ok: true;
  code: string;
  name: string;
  market: string | null;
  years: string;
  analysis: MddAnalysis;
  attribution: AttributionData | null;
  theme: ThemeCmp | null;
  risk: RiskProfileData | null;
};

export const PERIODS: { key: string; label: string }[] = [
  { key: "1", label: "1년" },
  { key: "3", label: "3년" },
  { key: "5", label: "5년" },
  { key: "10", label: "10년" },
  { key: "all", label: "전체" },
];

export const DEFAULT: StockOption = { code: "005930", name: "삼성전자", market: "KOSPI" };

/**
 * 검색 결과 줄에 붙는 시장 배지. **코스피는 안 붙인다** — 목록의 대부분이라 붙이면
 * 배지가 배경이 된다. 나머지 둘은 붙여야 한다: 코스닥은 검색 목록에 없어 링크로만
 * 만나고, 미국은 이름만으로 국내 종목과 구별이 안 된다("애플"·"메타"·"GS").
 */
export function marketBadge(market: string | null): string | null {
  if (market === "KOSDAQ") return "코스닥";
  if (market === "US") return "미국";
  return null;
}

export const fmtPct = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(1)}%`;

/**
 * 가격 표기. 시장에 따라 통화가 갈린다.
 *
 * 미국은 소수 둘째 자리까지 쓴다 — 달러는 원과 달리 1달러 미만의 움직임이 뜻을 갖고,
 * 반올림해 정수로 두면 저가주가 전부 같은 값으로 보인다.
 */
export const fmtPrice = (n: number, market: string | null | undefined) =>
  market === "US"
    ? `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `${Math.round(n).toLocaleString("ko-KR")}원`;

/**
 * '시장'의 이름. 낙폭을 무엇과 견주고 있는지는 화면 곳곳에 글자로 나온다 —
 * 엔비디아 낙폭 옆에 "코스피"라고 적혀 있으면 그 문장은 통째로 거짓이 된다.
 * ⚠️ api/mdd 가 고르는 지수(^KS11 / ^GSPC)와 짝이다. 한쪽만 고치지 말 것.
 */
export const benchName = (market: string | null | undefined) => (market === "US" ? "S&P500" : "코스피");

/** 시장 이름에 붙는 주격 조사. "코스피는" · "S&P500은"(오백 → ㄱ받침). */
export const benchParticle = (market: string | null | undefined) => (market === "US" ? "은" : "는");

/**
 * "같은 기간 코스피는 −30.0%, 반도체 업종은 −35.3% ___" 의 마지막 동사.
 *
 * 예전엔 "빠졌습니다" 고정이었다. 국장은 이 문장이 뜨는 날 대부분 코스피도 같이
 * 빠져 있어 맞았지만, 미장을 들이자 바로 드러났다 — **"S&P500은 +3.4% 빠졌습니다"**.
 * 부호가 섞이는 경우까지 있어 세 갈래로 가른다(둘 다 하락 / 둘 다 상승 / 엇갈림).
 */
export function benchVerb(market: number | null, theme: number | null): string {
  const vals = [market, theme].filter((v): v is number => v !== null);
  if (!vals.length) return "움직였습니다";
  if (vals.every((v) => v <= 0)) return "빠졌습니다";
  if (vals.every((v) => v >= 0)) return "올랐습니다";
  return "엇갈렸습니다";
}

/** 기간을 사람 단위로 짧게. 카드 안 큰 숫자는 이 형식으로 통일한다(1,733일 → 4.7년). */
export const fmtDur = (d: number) => (d >= 365 ? `${(d / 365).toFixed(1)}년` : d >= 45 ? `${Math.round(d / 30)}개월` : `${Math.round(d)}일`);

export const fmtDayCount = (d: number) => `${Math.round(d).toLocaleString("ko-KR")}일`;

/** 차트 축 라벨용 연·월. "2017-11-24" → "2017-11".
 *  연도를 두 자리로 줄이면("17-11") 연-월인지 월-일인지 분간이 안 된다. */
export const fmtYm = (date: string) => date.slice(0, 7);

/* ── 색 축 ─────────────────────────────────────────────────────────
   이 페이지만 온도축을 **낙폭축**으로 다시 매핑한다.
     파랑 = 하락 · 낙폭 · 초과낙폭      빨강 = 회복 · 수익 · 상승
   시장 브리핑의 파랑(저온)·빨강(고온)과 방향은 같다 — 내려간 것이 파랑, 올라간 것이
   빨강이다. 그래서 전역 2색 체계와 어긋나지 않는다.

   ⚠️ 예전엔 '미회복'이 빨강이었다(경고 뜻). 여기서 빨강은 회복을 뜻하므로 그대로 두면
   못 돌아온 것이 돌아온 것과 같은 색이 된다. 미회복은 **채우지 않은 분홍 점선**으로
   "아직 오지 않았다"를 말한다. */

export const DOWN = "var(--c-cold-ink)";

export const UP = "var(--c-hot-ink)";

/** 하락 막대 서열(진한 → 옅은). 다크에선 1이 가장 밝다 — 순서가 뒤집힌다. */
export const DOWN_BAR = ["var(--c-blue-1)", "var(--c-blue-2)", "var(--c-blue-3)", "var(--c-blue-4)", "var(--c-blue-5)"];

export const UP_BAR = "var(--c-warm-1)";

export const UP_BAR_SOFT = "var(--c-warm-3)";

/** 미회복 — 채우지 않은 분홍 점선. 위 색 축 주석 참고. */
export const UNRECOVERED = `repeating-linear-gradient(90deg, ${UP_BAR_SOFT} 0 3px, transparent 3px 6px)`;

/** 시트 안쪽 본문 padding. 머리(.hz-sheet-head)의 22 와 좌우를 맞춘다. */
export const PAD = "18px 22px";
