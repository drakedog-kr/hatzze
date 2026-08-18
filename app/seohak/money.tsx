import type { UsdKrw } from "@/lib/seohak-external";

/**
 * 이 페이지의 **돈 표시** — 달러와 원을 한 번에 그려 두고 CSS 가 하나만 보여 준다.
 *
 * ## ⚠️⚠️ 규칙: **그 돈이 오간 때의 환율로 옮긴다**
 *
 * 오늘 환율 하나로 다 곱하면 안 된다. 이 화면은 1994년부터의 결제를 다루는데, 그 시절
 * 1,200원짜리 달러를 오늘 1,414원으로 치면 그때 실제로 오간 원화가 아니라 "지금 사면
 * 얼마" 가 된다. 게다가 '원화로 보면' 카드가 이미 **유입 가중평균 환율**(1,286원)로
 * 넣은 돈을 재고 있어서, 나머지를 오늘 환율로 두면 같은 페이지가 스스로 어긋난다.
 *
 * 그래서 자리마다 `at` 으로 **그 값이 속한 달**을 넘긴다. 하루치는 그달, 한 달치는 그달,
 * 분기치는 그 분기 끝 달이다. 여러 해에 걸친 누적은 해마다 나눠 더한다(`sumByYear`).
 *
 * ⚠️ 이번 달은 월평균이 아직 반쪽이라 최신 일별(`now`)을 쓴다.
 *
 * ## 왜 둘 다 그려 두나
 *
 * 카드가 거의 다 서버 컴포넌트다. 통화를 리액트 상태로 두면 그 전부를 클라이언트로
 * 끌어와야 한다. 대신 **테마와 같은 수**를 쓴다 — 뿌리 요소의 `data-cur` 를 보고
 * globals.css 가 한쪽을 숨긴다. 기본값(속성 없음)이 원화다.
 *
 * ⚠️ `title`·`data-tip` 같은 **속성에는 이 수를 못 쓴다**(글자 하나뿐이라 숨길 수가 없다).
 * 그 자리는 `both()` 로 두 통화를 나란히 적는다.
 *
 * ⚠️ 환율을 못 받으면(`fx === null`) 달러만 낸다. 0 이나 빈 값으로 흘리면 화면이
 * "0원" 으로 보이는데 그건 고장이 아니라 사실처럼 읽힌다. 스위치도 그때는 안 뜬다.
 */

/** 클라이언트로 넘어가는 꼴. `Map` 대신 맨 객체라 직렬화가 안전하다. */
export type Fx = { rate: Record<string, number>; now: number; nowDate: string };

export function toFx(fx: UsdKrw | null): Fx | null {
  if (!fx) return null;
  return { rate: Object.fromEntries(fx.monthly), now: fx.now, nowDate: fx.nowDate };
}

/**
 * 그 달의 환율. 없으면 가장 가까운 **앞** 달, 그것도 없으면 최신.
 *
 * ⚠️ 뒤가 아니라 앞으로 찾는다. 자료가 늦게 들어오는 달을 뒤에서 메우면 아직 오지 않은
 * 환율로 과거를 재게 된다.
 */
export function rateAt(fx: Fx, ym?: string): number {
  if (!ym || ym >= fx.nowDate.slice(0, 7)) return fx.now;
  const hit = fx.rate[ym];
  if (hit) return hit;
  const keys = Object.keys(fx.rate).filter((k) => k <= ym).sort();
  return keys.length ? fx.rate[keys[keys.length - 1]] : fx.now;
}

/** 최근 n개월 평균 환율. 창이 1년인 누적값에 쓴다. */
export function rateOverMonths(fx: Fx, months: number): number {
  const keys = Object.keys(fx.rate).sort().slice(-months);
  if (!keys.length) return fx.now;
  return keys.reduce((s, k) => s + fx.rate[k], 0) / keys.length;
}

/** "2026Q1" → "2026-03". 분기값은 그 분기 끝 달의 환율로 옮긴다. */
export const quarterMonth = (q: string) =>
  `${q.slice(0, 4)}-${String(Number(q.slice(5)) * 3).padStart(2, "0")}`;

/** 달러. 이 페이지가 쭉 쓰던 꼴 그대로다. */
export function usd(v: number): string {
  const a = Math.abs(v);
  const s = v < 0 ? "−" : "";
  if (a >= 1e9) {
    const b = a / 1e9;
    // ⚠️ 자릿수를 크기에 따라 접는다. `toFixed(2)` 로 고정하면 12개월 거래가
    // `$642.00B` 로 찍힌다 — 소수 두 자리는 $10B 아래에서만 뜻이 있다.
    const digits = b >= 100 ? 0 : b >= 10 ? 1 : 2;
    return `${s}$${b.toLocaleString("ko-KR", { maximumFractionDigits: digits,
                                               minimumFractionDigits: digits })}B`;
  }
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(0)}M`;
  return `${s}$${Math.round(a).toLocaleString("ko-KR")}`;
}

/**
 * 원. 조 → 억 → 만 순으로 떨어진다.
 *
 * ## ⚠️ '원' 을 **붙인다**
 *
 * 안 붙이고 뒀었다 — 조·억·만 이 이미 원화라고 말한다고 봤다. 그런데 달러 쪽은 `$` 가
 * **앞에 서서 통화를 먼저 알려 주는데** 원화 쪽은 끝까지 읽어야 알 수 있다. 통화를
 * 갈아 끼우는 화면에서 그 비대칭은 그냥 헷갈린다.
 *
 * ⚠️ 붙여 쓴다(`8,591억원`). 이 저장소가 쭉 그래 왔다 — `104.3조원` · `4조원` · `억원`.
 * 맞춤법대로면 띄는 쪽이지만, 값의 표기는 한 화면 안에서 같은 게 먼저다.
 *
 * ⚠️⚠️ 조 단위 소수 한 자리는 **100조까지 유지한다.** 10조에서 끊었더니 이 달 산 금액
 * 14.4조와 판 금액 13.5조가 **둘 다 "14조"** 로 찍혔다. 자릿수를 아끼려다 서로 다른 두
 * 값이 같아 보이면 아낀 게 아니다.
 */
export function won(v: number): string {
  const a = Math.abs(v);
  const s = v < 0 ? "−" : "";
  if (a >= 1e12) {
    const t = a / 1e12;
    return `${s}${t.toLocaleString("ko-KR", { maximumFractionDigits: t >= 100 ? 0 : 1,
                                              minimumFractionDigits: t >= 100 ? 0 : 1 })}조원`;
  }
  if (a >= 1e8) return `${s}${Math.round(a / 1e8).toLocaleString("ko-KR")}억원`;
  if (a >= 1e4) return `${s}${Math.round(a / 1e4).toLocaleString("ko-KR")}만원`;
  return `${s}${Math.round(a).toLocaleString("ko-KR")}원`;
}

/**
 * 금액 한 자리. `usd` 나 `krw` 중 **가진 쪽**을 넘기면 반대쪽을 만들어 함께 그린다.
 *
 * ⚠️ 두 벌 다 `<span>` 이라 부모의 정렬·줄바꿈을 그대로 탄다. 숨는 쪽은
 * `display:none` 이라 자리를 안 먹는다.
 */
export function Money({ usd: v, krw: w, at, rate, fx, signed }: {
  usd?: number;
  krw?: number;
  /** 이 값이 속한 달(YYYY-MM). 안 넘기면 최신 환율이다. */
  at?: string;
  /**
   * 환율을 직접 준다. `at` 을 이긴다.
   *
   * 한 달로 못 집는 값에 쓴다 — 창이 1년인 누적(`rateOverMonths`)이나, '원화로 보면'
   * 카드가 이미 재 둔 **유입 가중평균**처럼.
   */
  rate?: number;
  fx: Fx | null;
  /** 양수에 `+` 를 붙인다. 음수 부호는 두 형식이 이미 넣는다. */
  signed?: boolean;
}) {
  const plus = (t: string) => (signed && !t.startsWith("\u2212") ? `+${t}` : t);
  if (!fx) {
    // 환율이 없으면 원천이 준 통화 그대로 낸다. 없는 값을 지어내지 않는다.
    return <>{v !== undefined ? plus(usdFmt(v)) : plus(won(w ?? 0))}</>;
  }
  const r = rate ?? rateAt(fx, at);
  const dollars = v !== undefined ? v : (w ?? 0) / r;
  const wons = w !== undefined ? w : (v ?? 0) * r;
  return (
    <>
      <span className="hz-usd">{plus(usdFmt(dollars))}</span>
      <span className="hz-krw">{plus(won(wons))}</span>
    </>
  );
}

/** `usd` 라는 이름을 매개변수로 가려서 안쪽에서 부를 이름이 필요하다. */
const usdFmt = usd;

/**
 * 속성(`title`·`data-tip`)에 넣을 두 통화. CSS 로 숨길 수가 없어 나란히 적는다.
 * 앞이 기본 통화(원)다.
 */
export function both(v: number, fx: Fx | null, at?: string): string {
  if (!fx) return usd(v);
  return `${won(v * rateAt(fx, at))} (${usd(v)})`;
}
