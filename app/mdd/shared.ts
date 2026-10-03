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

/**
 * 이번 응답에서 **일시적으로 못 받은 것**(api/mdd 의 partial). 없으면 null.
 * 화면은 이걸로 "기록이 없다"(자료 부재)와 "지금 못 불러왔다"(일시 실패)를 가른다 — 둘은 뜻이 다르다.
 */
export type MddPartial = {
  /** 시장 지수(코스피·코스닥·S&P500) 시세를 못 받았다. */
  market: boolean;
  /** 테마 대표 종목 중 조회를 건 수와 받은 수. */
  peersRequested: number;
  peersOk: number;
  /** 대표 종목 명단 조회 자체가 깨졌다(국내). */
  lookupFailed: boolean;
};

/**
 * 이 종목을 텔레그램 채널이 어떻게 말했나(카더라 자료) — v2 MDD 둘째 줄 '채널이 말한 까닭'(2026-10-03).
 * 계산기류(낙폭 · 회복)는 어디서나 하지만 이 자료는 여기만 있다. 최근 TALK_DAYS 일만 싣는다.
 *  - mentions: 날마다 언급 수(빈 날은 0) — 오래된 날부터.
 *  - reasons: 그 기간 채널이 짚은 '움직인 까닭'(까닭 글이 있는 날만) — 최근 날부터, 다섯까지.
 * 조회가 깨지면 null — 화면은 그 칸에 '못 불러왔습니다'를 적는다(자료 없음과 가른다).
 */
export type MddTalk = {
  days: number;
  mentions: { date: string; count: number }[];
  reasons: { date: string; reason: string; change: number | null }[];
};

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
  partial: MddPartial | null;
  /** 카더라 자료. 옛 응답(캐시)에는 없을 수 있다. */
  talk?: MddTalk | null;
};

export const PERIODS: { key: string; label: string }[] = [
  { key: "1", label: "1년" },
  { key: "3", label: "3년" },
  { key: "5", label: "5년" },
  { key: "10", label: "10년" },
  { key: "all", label: "전체" },
];

export const DEFAULT: StockOption = { code: "005930", name: "삼성전자", market: "KOSPI" };

/** 처음 여는 기간. 주소에 years 가 없으면 이것이다. */
export const DEFAULT_YEARS = "10";

/**
 * 기간 키를 아는 것으로 접는다. 모르는 값·빈 값은 기본 기간이다.
 * ⚠️ 객체 조회(`YEARS[k]`)로 거르면 "constructor" 같은 프로토타입 키가 통과한다 — 목록과 글자로 견준다.
 */
export function normalizeYears(raw: string | null | undefined): string {
  return PERIODS.some((p) => p.key === raw) ? (raw as string) : DEFAULT_YEARS;
}

/**
 * 고른 종목·기간의 주소 쿼리(`?code=…&market=…&years=…`). 공유·새로고침·뒤로 가기가 이 주소로 선다(MddExplorer).
 * 기본 기간이면 years 를 뺀다 — 카더라 카드의 링크(/mdd?code=…&market=…)와 같은 꼴을 유지한다.
 */
export function mddQuery(s: Pick<StockOption, "code" | "market">, years: string): string {
  const q = new URLSearchParams({ code: s.code });
  if (s.market) q.set("market", s.market);
  if (years !== DEFAULT_YEARS) q.set("years", years);
  return `?${q}`;
}

/**
 * 조회 기간을 사람 말로. 상장 이력이 요청 기간보다 짧으면(`truncated`) '상장 이후·약 N년'이다.
 * 허용치 0.5년 — 1년 조회에서 8개월 이력도 '최근 1년'이 되는 문제는 알려져 있다(mdd#16).
 */
export function periodInfo(years: string, firstDate: string, asOf: string): { label: string; truncated: boolean; approxYears: number } {
  const approxYears = (Date.parse(asOf) - Date.parse(firstDate)) / (365 * 86_400_000);
  const requested = years === "all" ? Infinity : Number(years);
  const truncated = years !== "all" && approxYears < requested - 0.5;
  const label = years === "all" || truncated ? `상장 이후·약 ${Math.max(1, Math.round(approxYears))}년` : `최근 ${years}년`;
  return { label, truncated, approxYears };
}

/**
 * 지금 낙폭 머리의 물음표 한 마디(15자 안 · 도움말 규칙). 고른 기간을 다 채운 종목엔 안 단다 —
 * 1년을 골랐을 뿐인 종목에 '표본이 짧다'고 하면 거짓이다. 전체 구간은 합병·감자로 끊긴 가격이 섞인다.
 */
export function cautionShort(years: string, truncated: boolean, approxYears: number): string | null {
  if (years === "all") return "합병·감자 구간 섞임";
  if (truncated) return `상장 ${Math.max(1, Math.round(approxYears))}년, 표본 짧음`;
  return null;
}

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
 * ⚠️ api/mdd 가 고르는 지수(^KS11 · ^KQ11 · ^GSPC)와 짝이다. 한쪽만 고치지 말 것.
 */
export const benchName = (market: string | null | undefined) => (market === "US" ? "S&P500" : market === "KOSDAQ" ? "코스닥" : "코스피");

/** 기간을 사람 단위로 짧게. 카드 안 큰 숫자는 이 형식으로 통일한다(1,733일 → 4.7년). */
export const fmtDur = (d: number) => (d >= 365 ? `${(d / 365).toFixed(1)}년` : d >= 45 ? `${Math.round(d / 30)}개월` : `${Math.round(d)}일`);

export const fmtDayCount = (d: number) => `${Math.round(d).toLocaleString("ko-KR")}일`;

/** 차트 축 라벨용 연·월. "2017-11-24" → "2017-11".
 *  연도를 두 자리로 줄이면("17-11") 연-월인지 월-일인지 분간이 안 된다. */
export const fmtYm = (date: string) => date.slice(0, 7);

/**
 * 하루 날짜를 화면 말투로. 기준일(보통 분석 기준일 asOf)과 **같은 해면 "6월 18일"**, 다른 해면
 * **"2021년 1월"**(2026-09-23). 예전엔 "2026-06-18" 이라 사이트의 다른 날짜("9월 22일 종가")와
 * 표기가 갈렸다. 여러 해 전의 전고점은 날까지 적어도 읽는 데 보탬이 없고 칸만 넓힌다.
 */
export const fmtDay = (iso: string, refIso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return y === Number(refIso.slice(0, 4)) ? `${m}월 ${d}일` : `${y}년 ${m}월`;
};

/* ── 색 축 ─────────────────────────────────────────────────────────
   이 페이지만 온도축을 **낙폭축**으로 다시 매핑한다.
     파랑 = 하락 · 낙폭 · 초과낙폭      빨강 = 회복 · 수익 · 상승
   시장 브리핑의 파랑(저온)·빨강(고온)과 방향은 같다 — 내려간 것이 파랑, 올라간 것이
   빨강이다. 그래서 전역 2색 체계와 어긋나지 않는다.

   ⚠️ 예전엔 '미회복'이 빨강이었다(경고 뜻). 여기서 빨강은 회복을 뜻하므로 그대로 두면
   못 돌아온 것이 돌아온 것과 같은 색이 된다. 지금 진행 중인 하락은 색이 아니라 글자('진행 중')와
   옅은 바탕으로 가른다(V2Sheets.tsx CasesTable). */

export const DOWN = "var(--c-cold-ink)";

export const UP = "var(--c-hot-ink)";

/** 하락 막대 서열(진한 → 옅은). 다크에선 1이 가장 밝다 — 순서가 뒤집힌다. */
export const DOWN_BAR = ["var(--c-blue-1)", "var(--c-blue-2)", "var(--c-blue-3)", "var(--c-blue-4)", "var(--c-blue-5)"];

export const UP_BAR = "var(--c-warm-1)";

export const UP_BAR_SOFT = "var(--c-warm-3)";

/** 시트 안쪽 본문 padding. 머리(.hz-sheet-head)의 22 와 좌우를 맞춘다. */
export const PAD = "18px 22px";
