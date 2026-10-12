/**
 * ETF 자금 흐름 화면의 금액 표기 — 서버(page.tsx)와 표(EtfFlowTable.tsx)가 같이 쓴다.
 *
 * 1조가 넘으면 소수 둘째 자리 조(`+1.78조`), 그 아래는 억(`+6,249억`). 1조 2,929억처럼 조·억을 함께 적으면(lib/format.ts
 * formatEokMixed) 표의 숫자 칸 폭이 줄마다 달라져 오른끝 정렬이 흐트러져서 한 단위로 끊는다.
 * 부호는 늘 붙인다 — 이 화면의 숫자는 전부 들어온(+) · 빠진(-) 돈이다. 0 은 부호 없이.
 */
export function fmtFlow(eok: number): string {
  const r = Math.round(eok);
  if (r === 0) return "0억";
  const sign = r > 0 ? "+" : "-";
  const abs = Math.abs(eok);
  return abs >= 10000 ? `${sign}${(abs / 10000).toFixed(2)}조` : `${sign}${Math.abs(r).toLocaleString("ko-KR")}억`;
}

/**
 * 순자산 · 거래대금 같은 크기(부호 없음). 100조 넘으면 조 정수(순자산 합 464조), 1조~100조는 소수 한 자리(하루 거래대금 2.0조 —
 * 정수로 끊으면 1조 9,929억이 '2조'로 서서 옆 '9,929억'과 자릿수 감이 어긋났다), 그 아래는 억.
 */
export function fmtSize(eok: number): string {
  if (eok >= 1_000_000) return `${Math.round(eok / 10000).toLocaleString("ko-KR")}조`;
  if (eok >= 10000) return `${(eok / 10000).toFixed(1)}조`;
  return `${Math.round(eok).toLocaleString("ko-KR")}억`;
}

/** 오름 빨강 · 내림 파랑 — v2 표의 등락 칸과 같은 클래스. */
export function flowTone(eok: number): string {
  const r = Math.round(eok);
  return r > 0 ? " is-up" : r < 0 ? " is-down" : "";
}

/** 수익률 · 비율(%) — 부호를 늘 붙인다. 자릿수에서 0 으로 끊기면 부호 없이. */
export function fmtPct(v: number, digits = 1): string {
  const r = Number(v.toFixed(digits));
  if (r === 0) return `${(0).toFixed(digits)}%`;
  return `${r > 0 ? "+" : "-"}${Math.abs(r).toFixed(digits)}%`;
}

/** 수익률의 오름 빨강 · 내림 파랑 — fmtPct 와 같은 자릿수에서 가른다. */
export function pctTone(v: number, digits = 1): string {
  const r = Number(v.toFixed(digits));
  return r > 0 ? " is-up" : r < 0 ? " is-down" : "";
}

/** 총보수(연 %) — 0.0098% 같은 넷째 자리까지, 끝의 0 은 뗀다. 못 받았으면 '없음'. */
export const fmtFee = (v: number | null) => (v == null ? "없음" : `${Number(v.toFixed(4))}%`);

/**
 * 같은 지수 ETF 요약 칸 — 메인 '지수별 ETF 비교'와 상세 '같은 지수 ETF'가 같이 쓴다(클라이언트 · 서버 부품 둘 다 부르니 여기 둔다).
 * '보수 가장 낮음 · ACE 외 3' — 이름표 끝에 가장 낮은 보수의 첫 브랜드 + 나머지 수. 값 아래 곁줄로 두면 그 요약 칸만 77px 이라 화면의 다른
 * 요약 칸(59)과 키가 갈렸다(2026-10-12).
 */
export const lowestFeeLabel = (brands: string[]) => (brands.length ? `보수 가장 낮음 · ${brands[0]}${brands.length > 1 ? ` 외 ${brands.length - 1}` : ""}` : "보수 가장 낮음");
/** 1,000만원을 1년 두면 가장 비싼 곳과 가장 싼 곳의 보수 차이(만원). */
export const feeGapText = (gap: number | null) => (gap == null ? "없음" : gap < 0.1 ? "0.1만원 미만" : `${gap.toFixed(1)}만원`);
