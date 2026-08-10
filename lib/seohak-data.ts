import { getSupabaseServer } from "@/lib/supabase-server";

/**
 * 서학개미 해부도(/seohak)의 데이터층.
 *
 * 이 파일의 모든 숫자가 **표 하나(seohak_country_flows)에서 나온다.** 외부 주가지수를
 * 안 쓰는 게 설계의 핵심이다 — 이유가 둘이다.
 *
 *  ① 재배포 제약. 야후 ToS §2(e)(i)·KRX 약관 제6조 ② 는 물론이고, FRED 를 거치더라도
 *     나스닥·S&P 같은 **벤더 지수는 벤더 약관을 따른다**(FRED 페이지에 저작권 표기가
 *     붙어 있다). 미 재무부 TIC 은 미 정부 저작물이라 그 제약이 없다.
 *  ② 정확도. 외부 지수는 "서학개미가 그 지수를 샀다"는 가정이 필요한데, 아래 합성지수는
 *     **그들이 실제로 든 포트폴리오의 수익률**이라 가정이 없다.
 */

/** 한국. TIC 국가 코드이자 FRED 시리즈 ID 의 접미사다. */
const KOREA = "43001";

export type FlowRow = {
  month: string;
  holdings: number; // 잔고(백만 달러)
  netPurchase: number; // 그 달 순매수
  valuationChange: number; // 그 달 평가변동
  usHoldings: number | null; // 역방향 — 미국인이 든 한국 주식
};

export type Cohort = {
  year: number;
  inflow: number; // 그 해 순매수 합
  nowValue: number; // 오늘 기준 평가
  returnPct: number;
};

export type SeohakOverview = {
  asOf: string; // 기준월(YYYY-MM)
  principal: number; // 누적 순매수 = 투입 원금
  marketValue: number; // 최신 잔고
  returnPct: number;
  /** 합성지수(1984-12 = 1). 그들이 든 포트폴리오의 누적 수익 배수. */
  indexNow: number;
  /** 합성지수로 되짚은 원금 합계. 실제 잔고와 얼마나 어긋나는지 화면에 밝힌다. */
  closureErrorPct: number;
  cohorts: Cohort[];
  series: { month: string; principal: number; value: number }[];
};

/**
 * 한국 행 전체(498개월). PostgREST 1,000행 캡 아래라 한 번에 받지만, 나라가 늘거나
 * 달이 쌓이면 넘을 수 있으므로 페이지를 이어 받는다 — 캡은 **에러 없이 조용히** 자른다.
 */
async function loadKoreaFlows(): Promise<FlowRow[]> {
  const rows: FlowRow[] = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await getSupabaseServer()
      .from("seohak_country_flows")
      .select("month, holdings_usd_mn, net_purchase_usd_mn, valuation_change_usd_mn, us_holdings_usd_mn")
      .eq("country_code", KOREA)
      .order("month", { ascending: true })
      .range(start, start + 999);
    // 조회 실패를 빈 배열로 흘리지 않는다. 그러면 화면이 '자료 없음'으로 보이는데,
    // 그건 고장이 아니라 정상 상태처럼 읽힌다(telegram-data.ts 에서 겪은 함정).
    if (error) throw new Error(`seohak_country_flows 조회 실패: ${error.message}`);
    const page = data ?? [];
    for (const r of page) {
      rows.push({
        month: r.month as string,
        holdings: Number(r.holdings_usd_mn ?? 0),
        netPurchase: Number(r.net_purchase_usd_mn ?? 0),
        valuationChange: Number(r.valuation_change_usd_mn ?? 0),
        usHoldings: r.us_holdings_usd_mn == null ? null : Number(r.us_holdings_usd_mn),
      });
    }
    if (page.length < 1000) break;
  }
  return rows;
}

/**
 * 합성 수익지수. **잔고 변화에서 순매수를 뺀 나머지를 전부 수익으로 본다.**
 *
 *   r(t) = ( 잔고(t) − 잔고(t−1) − 순매수(t) ) / 잔고(t−1)
 *
 * 원천이 주는 '평가변동' 시리즈를 그대로 쓰지 않는 이유가 여기 있다. TIC 은 잔고 변화를
 * 순매수 · 평가변동 · **잔차(기타 변동, 미포함)** 로 나누는데, 그 잔차를 빼고 계산하면
 * 전체가 안 닫힌다. 실측으로 셋을 견줬다(2026-05 기준, 원금 $317.1B):
 *
 *   평가변동 시리즈 사용 → $694.4B (실제 잔고 대비 −14.8%)
 *   외부 지수(나스닥) 근사 → $986.4B (+21.1%)
 *   **이 방식 → $809.7B (−0.6%)**
 *
 * 잔고는 실측이고 순매수만 추정이라, 잔차를 수익 쪽으로 흡수시키는 이 방식이 유일하게
 * 닫힌다. 코호트 수익률은 방법에 따라 두 배까지 갈렸으므로(2015년 +243% ~ +440%),
 * **닫히는 방식을 쓰는 게 그냥 취향 문제가 아니다.**
 */
function buildIndex(rows: FlowRow[]): Map<string, number> {
  const level = new Map<string, number>();
  let lvl = 1;
  level.set(rows[0].month, lvl);
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1].holdings;
    const r = prev ? (rows[i].holdings - prev - rows[i].netPurchase) / prev : 0;
    lvl *= 1 + r;
    level.set(rows[i].month, lvl);
  }
  return level;
}

/** 코호트를 낼 최소 연도. 이보다 앞은 금액이 너무 작아(연 $1B 미만) 줄이 의미가 없다. */
const COHORT_FROM = 2015;

export async function getSeohakOverview(): Promise<SeohakOverview> {
  const rows = await loadKoreaFlows();
  if (rows.length < 2) throw new Error("seohak_country_flows 행이 부족합니다");

  const level = buildIndex(rows);
  const last = rows[rows.length - 1];
  const indexNow = level.get(last.month) ?? 1;

  const principal = rows.reduce((s, r) => s + r.netPurchase, 0);
  const marketValue = last.holdings;

  // 연도별로 접는다. 그 해 안에서는 매달 들어온 돈을 그 달 지수 수준에 넣고,
  // 오늘 지수로 평가한다(연평균 지수를 쓰면 큰 유입이 몰린 달의 가중이 사라진다).
  const byYear = new Map<number, { inflow: number; now: number }>();
  let synthetic = 0;
  for (const r of rows) {
    const lv = level.get(r.month) ?? 1;
    const now = r.netPurchase * (indexNow / lv);
    synthetic += now;
    const y = Number(r.month.slice(0, 4));
    const cur = byYear.get(y) ?? { inflow: 0, now: 0 };
    cur.inflow += r.netPurchase;
    cur.now += now;
    byYear.set(y, cur);
  }

  const cohorts: Cohort[] = [];
  for (const [year, v] of [...byYear.entries()].sort((a, b) => a[0] - b[0])) {
    if (year < COHORT_FROM || v.inflow <= 0) continue;
    cohorts.push({
      year,
      inflow: v.inflow,
      nowValue: v.now,
      returnPct: (v.now / v.inflow - 1) * 100,
    });
  }

  // 원금선과 평가선을 함께 그리는 데 쓴다. 1994년부터만 담는다 — 그 전은 잔고가
  // $0.1B 대라 같은 축에 그리면 곡선이 바닥에 붙어 30년이 한 줄로 뭉갠다.
  let cum = 0;
  const series: SeohakOverview["series"] = [];
  for (const r of rows) {
    cum += r.netPurchase;
    if (r.month >= "1994-01-01") series.push({ month: r.month, principal: cum, value: r.holdings });
  }

  return {
    asOf: last.month.slice(0, 7),
    principal,
    marketValue,
    returnPct: (marketValue / principal - 1) * 100,
    indexNow,
    closureErrorPct: (synthetic / marketValue - 1) * 100,
    cohorts,
    series,
  };
}
