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

/* ── 낙폭 요약 ─────────────────────────────────────────────────────
   둘째 줄 셋째 칸 — 이 종목 낙폭을 쉬운 말로 한 줄씩(2026-10-03, 옛 '이 하락의 맥락' 세 문단을 다시 짠 것).
   **LLM 을 쓰지 않는다** — 화면이 이미 가진 수치를 문장으로 옮길 뿐이라 AI 표시도 안 붙인다.

   옛 문단과 다른 점:
    - 독자 물음 순서로 줄을 가른다 — 깊이(흔한가) → 회복(전에는 얼마나 걸렸나) → 시장 → 업종. 줄마다 이름표.
    - 숫자를 말로 바꾼다 — '682일'(옆 칸이 적는다) 대신 '열흘에 3일꼴', 회복 표본 대신 '이번이 4번째'.
    - '같은 기간'이 무엇과 같은지 밝힌다 — '6월 18일 고점 이후'. 옛 문단은 바로 앞 문장이 조회 기간이라 10년으로 읽혔다.
    - 신고가 부근이면 회복 · 시장 줄 대신 기간 최대 낙폭을 적는다(옆 칸 게이지가 그때 안 뜬다).
   ⚠️ 시장 · 업종이 **올랐을 때**를 빼먹지 말 것 — 미장을 들이자 "S&P500은 +3.4% 빠졌습니다"가 떴다(옛 benchVerb). */

/** 문장 한 조각 — 글자 그대로, 또는 굵게. */
export type SumPart = string | { b: string };
export type SumRow = { key: "depth" | "worst" | "recovery" | "market" | "theme"; label: string; parts: SumPart[] };

/** 이만큼 차이 나면 '비슷하게'가 아니다 — 3%p, 또는 이 종목 낙폭의 15% 중 큰 쪽. */
const SUM_SIMILAR_PP = 3;
const SUM_SIMILAR_RATIO = 0.15;
/** 시장 · 업종 등락이 이 안쪽이면 '거의 그대로'. */
const SUM_FLAT = 3;

const pp = (n: number) => `${Math.abs(n).toFixed(1)}%p`;

/**
 * 두 기간을 한 단위로 — fmtDur 를 따로 부르면 364일 · 381일이 "12개월~1.0년"이 된다.
 * 긴 쪽이 1년을 넘고 짧은 쪽도 11개월 가까이면 둘 다 년으로 적고, 같아지면 하나만 적는다.
 */
function durRange(min: number, max: number): string {
  const lo = max >= 365 && min >= 330 ? `${(min / 365).toFixed(1)}년` : fmtDur(min);
  const hi = fmtDur(max);
  if (lo === hi) return hi;
  // 단위가 같으면 앞 단위를 뗀다 — "1.6~3.0년", "4~9개월".
  const unit = ["년", "개월", "일"].find((u) => lo.endsWith(u) && hi.endsWith(u));
  return unit ? `${lo.slice(0, -unit.length)}~${hi}` : `${lo}~${hi}`;
}

/**
 * 시장(또는 업종) 등락과 이 종목 낙폭을 견주는 문장. subject 는 '…코스피는', subjectDo 는 '…코스피도',
 * avg 는 숫자 앞에 붙는 말('평균 ' 또는 ''). up · flat · 비슷 · 더 · 덜 다섯 갈래.
 */
function versus(subject: string, subjectDo: string, avg: string, v: number, stock: number): SumPart[] {
  if (v >= SUM_FLAT) return [`${subject} 오히려 ${avg}`, { b: fmtPct(v) }, " 올랐습니다."];
  if (v > -SUM_FLAT) return [`${subject} ${avg}`, { b: fmtPct(v) }, "로 거의 그대로였습니다."];
  const gap = stock - v;
  if (Math.abs(gap) <= Math.max(SUM_SIMILAR_PP, SUM_SIMILAR_RATIO * Math.abs(stock))) {
    return [`${subjectDo} ${avg}`, { b: fmtPct(v) }, "로 ", { b: "비슷하게" }, " 빠졌습니다."];
  }
  return [`${subject} ${avg}`, { b: fmtPct(v) }, "로 이 종목보다 ", { b: `${pp(gap)} ${gap < 0 ? "덜" : "더"}` }, " 빠졌습니다."];
}

/**
 * 낙폭 요약 줄들. 재료가 없는 줄은 빠진다(빈 줄을 세우지 않는다).
 * 시장 줄의 '더 · 덜'은 시장 쪽에서 본 말이다 — "코스피는 −23.2%로 이 종목보다 13.7%p 덜 빠졌습니다".
 */
export function mddSummary(d: Pick<MddResult, "analysis" | "attribution" | "theme" | "market" | "years" | "partial">): SumRow[] {
  const a = d.analysis;
  const atHigh = a.currentDd > -1;
  const span = periodInfo(d.years, a.firstDate, a.asOf).label.replace("·", " ");
  const rows: SumRow[] = [];

  // 깊이 — 지금보다 깊이 빠져 있던 날이 얼마나 흔했나(옆 칸 '이보다 깊었던 날'을 말로).
  const p = a.tradingDays > 0 ? a.deeperThanNowDays / a.tradingDays : 0;
  const k = Math.min(9, Math.max(1, Math.round(p * 10)));
  rows.push({
    key: "depth",
    label: "깊이",
    parts:
      a.deeperThanNowDays === 0
        ? [`${span} 동안 `, { b: "지금이 가장 깊이" }, " 빠져 있습니다."]
        : p < 0.05
          ? [`${span} 동안 지금보다 깊이 빠져 있던 날은 `, { b: `${a.deeperThanNowDays.toLocaleString("ko-KR")}일` }, "뿐입니다."]
          : p >= 0.95
            ? [`${span} 동안 `, { b: "거의 모든 날" }, "이 지금보다 깊이 빠져 있었습니다."]
            : [`${span} 동안 지금보다 깊이 빠져 있던 날은 `, { b: `열흘에 ${k}일꼴` }, "입니다."],
  });

  if (atHigh) {
    // 신고가 부근 — 옆 칸 게이지가 안 뜨니 기간 최대 낙폭을 여기서. 회복 · 시장 줄은 '고점 이후'가 없어 못 쓴다.
    const worst = a.topDrawdowns[0];
    if (worst && worst.depth <= -5) {
      rows.push({
        key: "worst",
        label: "최대 낙폭",
        parts: worst.recovered
          ? [`${span} 가장 깊었던 하락은 `, { b: fmtPct(worst.depth) }, "였고, 고점을 되찾기까지 ", { b: fmtDur(worst.days) }, " 걸렸습니다."]
          : [`${span} 가장 깊었던 하락은 `, { b: fmtPct(worst.depth) }, "입니다."],
      });
    }
  } else if (a.recovery && a.recovery.similarCount > 0) {
    // 회복 — 진행 중인 하락은 마지막 하나뿐이라(새 고점이 앞 하락을 끝낸다) '이번이 N번째 · 앞선 N−1번'으로 말할 수 있다.
    const r = a.recovery;
    const nth = r.similarCount;
    const done = r.recoveredCount;
    const head: SumPart[] = ["이만큼 빠진 하락은 ", { b: nth === 1 ? "이번이 처음" : `이번이 ${nth}번째` }, "입니다."];
    let tail: SumPart[] = [];
    if (r.unrecoveredCount === 1 && done > 0) {
      tail =
        done === 1
          ? [" 앞선 1번은 고점을 되찾기까지 ", { b: fmtDur(r.minDays!) }, " 걸렸습니다."]
          : done === 2
            ? [" 앞선 2번은 고점을 되찾기까지 ", { b: durRange(r.minDays!, r.maxDays!) }, " 걸렸습니다."]
            : [` 앞선 ${done}번은 고점을 되찾기까지 보통 `, { b: fmtDur(r.medianDays!) }, " 걸렸습니다."];
    }
    rows.push({ key: "recovery", label: "회복", parts: nth === 1 ? [`${span} 동안 `, ...head] : [...head, ...tail] });
  }

  const attr = d.attribution;
  let marketShown = false;
  if (!atHigh && attr) {
    const bench = benchName(d.market);
    const eun = d.market === "US" || d.market === "KOSDAQ" ? "은" : "는";
    const since = `${fmtDay(a.athDate, a.asOf)} 고점 이후`;
    if (attr.market !== null) {
      rows.push({ key: "market", label: "시장", parts: versus(`${since} ${bench}${eun}`, `${since} ${bench}도`, "", attr.market, attr.stock) });
      marketShown = true;
    } else if (d.partial?.market) {
      rows.push({ key: "market", label: "시장", parts: [`${bench} 시세를 지금 불러오지 못했습니다.`] });
    }
  }

  const th = d.theme;
  if (th) {
    const who = `${th.name} 대표 ${th.peers.length}종목`;
    if (atHigh) {
      rows.push({ key: "theme", label: "업종", parts: [`${who}은 평균 고점 대비 `, { b: fmtPct(th.avgDd) }, "입니다."] });
    } else if (attr && attr.theme !== null) {
      const lead = marketShown ? "같은 기간" : `${fmtDay(a.athDate, a.asOf)} 고점 이후`;
      rows.push({ key: "theme", label: "업종", parts: versus(`${lead} ${who}은`, `${lead} ${who}도`, "평균 ", attr.theme, attr.stock) });
    }
  }
  return rows;
}
