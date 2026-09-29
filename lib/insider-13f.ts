/**
 * 월가 거물(13F) 보유를 **두 분기로 견주는** 규칙. DB 를 안 만지는 순수 계산이라
 * 단위 테스트(tests/insider-13f.test.ts)가 그대로 부른다. 조회는 lib/insider-detail.ts 가 한다.
 *
 * ## ⚠️ 분기는 그 운용사가 **낸 분기 전체**에서 고른다
 *
 * 한 종목의 행만 보고 고르면 안 된다. 수집기(fetch_us_13f.py)는 들고 있는 종목만 적고
 * 0주 행을 안 남긴다. 그래서
 *   - 이번 분기에 새로 담은 곳은 그 종목의 직전 분기 행이 없어 **'비교할 분기 없음'** 이 되고,
 *   - 전량 정리한 곳은 최신 분기 행이 없어 **지난 분기 보유가 지금 보유로** 뜬다.
 * 종목 상세가 실제로 그랬다(신규 배지가 한 번도 안 붙었다). 메인·인물 상세는 이미 운용사
 * 보유 전체에서 분기를 고르고 있었다.
 *
 * ## ⚠️ 한 운용사가 한 분기에 행을 **여럿** 가질 수 있다
 *
 * 버크셔 주소는 BRK-A·BRK-B 를 같이 묻는다(lib/us-ticker-spellings.ts). 두 클래스를 다 든
 * 곳은 분기마다 행이 둘이라, 앞의 한 줄만 집으면 금액이 반쪽이 되고 BRK-A 주식 수를
 * BRK-B 와 견주는 일까지 생긴다(정렬이 cik 하나라 어느 줄이 앞일지도 정해져 있지 않다).
 */

/** 한 분기 · 한 클래스의 보유. 같은 (운용사, 티커, 분기)는 수집기가 한 줄로 합쳐 둔다. */
export type ClassRow = { ticker: string; shares: number | null; value: number | null };

/** 분기 사이의 움직임. `exit` 는 전량 정리다(종목 상세의 보유자 표에는 안 들어간다). */
export type QuarterShift = {
  move: "new" | "add" | "trim" | "hold" | "exit";
  /** 직전 분기 대비 주식 수 증감률(%). 신규·청산이거나 직전이 0주면 null. */
  sharesChange: number | null;
};

const sum = (rows: ClassRow[], k: "shares" | "value") => rows.reduce((s, r) => s + (r[k] ?? 0), 0);

/** 운용사별로 **자기가 낸** 분기, 오래된 순. 받는 행은 그 운용사의 보유 전체여야 한다. */
export function filedQuarters(rows: { cik: number; report_date: string }[]): Map<number, string[]> {
  const out = new Map<number, string[]>();
  for (const r of rows) {
    const qs = out.get(r.cik) ?? [];
    if (!qs.includes(r.report_date)) qs.push(r.report_date);
    out.set(r.cik, qs);
  }
  for (const qs of out.values()) qs.sort();
  return out;
}

/**
 * 한 운용사가 한 종목을 직전 분기(`before`)에서 이번 분기(`now`)로 어떻게 바꿨나.
 * 둘 다 비었으면(두 분기 모두 안 들었으면) null.
 *
 * ⚠️ 판정은 **주식 수**로 한다. 금액은 주가가 움직여도 변해서, 한 주도 안 사고 늘어난
 *    것처럼 보인다.
 * ⚠️ 클래스가 여럿이면 주식 수를 그냥 더하면 안 된다 — BRK-A 1주가 BRK-B 1,500주 몫이라
 *    그 합은 없는 수다. 클래스마다 **직전 분기 한 주 값**으로 환산해 더한다(이번에 새로
 *    담은 클래스는 이번 분기 값으로). 주가 변동은 빠지고 수량 변화만 남는다.
 */
export function quarterShift(now: ClassRow[], before: ClassRow[]): QuarterShift | null {
  if (!now.length && !before.length) return null;
  if (!before.length) return { move: "new", sharesChange: null };
  if (!now.length) return { move: "exit", sharesChange: null };
  const tickers = [...new Set([...now, ...before].map((r) => r.ticker))].sort();
  let shares: number;
  let was: number;
  if (tickers.length === 1) {
    // 인물 상세(`getManagerDetail`)와 **같은 식**이다. 한쪽만 고치면 같은 보유가
    // 두 화면에서 다른 증감률로 뜬다.
    shares = sum(now, "shares");
    was = sum(before, "shares");
  } else {
    const unit = (t: string) => {
      const b = before.find((r) => r.ticker === t);
      const a = now.find((r) => r.ticker === t);
      if (b?.shares && b.value) return b.value / b.shares;
      if (a?.shares && a.value) return a.value / a.shares;
      return 0;
    };
    shares = 0;
    was = 0;
    for (const t of tickers) {
      const u = unit(t);
      shares += (now.find((r) => r.ticker === t)?.shares ?? 0) * u;
      was += (before.find((r) => r.ticker === t)?.shares ?? 0) * u;
    }
  }
  return {
    move: shares > was ? "add" : shares < was ? "trim" : "hold",
    sharesChange: was ? ((shares - was) / was) * 100 : null,
  };
}

/**
 * 종목 상세의 거물 한 줄 재료 — 이 운용사가 **자기 최신 분기에** 이 종목을 어떻게 들고 있나.
 *
 * `rows` 는 이 운용사의 이 종목 행(클래스 전부 · 분기 전부), `quarters` 는 이 운용사가 낸
 * 분기(filedQuarters). 최신 분기에 행이 없으면 null — 전량 정리했으니 보유자가 아니다.
 * 직전 분기를 아예 안 냈으면 move 가 null 이다(비교 불가).
 */
export function stockPosition(
  rows: (ClassRow & { report_date: string })[],
  quarters: string[],
): { reportDate: string; shares: number; value: number; move: "new" | "add" | "trim" | "hold" | null; sharesChange: number | null } | null {
  const latest = quarters[quarters.length - 1];
  if (!latest) return null;
  const prior = quarters[quarters.length - 2] ?? null;
  const now = rows.filter((r) => r.report_date === latest);
  if (!now.length) return null;
  const s = prior ? quarterShift(now, rows.filter((r) => r.report_date === prior)) : null;
  return {
    reportDate: latest,
    // ⚠️ 클래스가 여럿이면 클래스별 주식 수를 그냥 더한 값이라 견주는 데 쓰면 안 된다.
    shares: sum(now, "shares"),
    value: sum(now, "value"),
    move: s && s.move !== "exit" ? s.move : null,
    sharesChange: s?.sharesChange ?? null,
  };
}
