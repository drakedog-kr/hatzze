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

/** 비교국. fetch_seohak_flows.py 의 COUNTRIES 와 같은 목록이고 이름도 거기서 옮겨 왔다. */
const COUNTRY_NAME: Record<string, string> = {
  "43001": "대한민국",
  "42609": "일본",
  "41408": "중국",
  "46302": "대만",
  "42005": "홍콩",
  "46019": "싱가포르",
  "13005": "영국",
};

/** 국민연금. 13F 제출자 중 유일하게 '전 국민의 돈'이라 따로 이름을 둔다. */
const NPS_CIK = "0001608046";

export type FlowRow = {
  month: string;
  holdings: number; // 잔고(백만 달러)
  netPurchase: number; // 그 달 순매수
  valuationChange: number; // 그 달 평가변동
  usHoldings: number | null; // 역방향 — 미국인이 든 한국 주식
  usNetPurchase: number | null; // 역방향 순매수. 음수면 미국인이 판 것
};

export type SettlementDay = {
  date: string;
  usBuy: number;
  usSell: number;
  usBuyCount: number;
  usSellCount: number;
  /** 그날 전 시장 주식 매수 합. 미국 비중의 분모다. */
  allStockBuy: number;
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
  /**
   * 잔고 증감을 순매수 몫과 평가 몫으로 가른 것. **해 단위다.**
   *
   * ⚠️ 앞 판은 최근 12개월을 달별로 냈는데, 그 창이 가장 중요한 사실을 가렸다. 새 돈의
   * 몫은 해마다 14%~49% 로 흔들리고 2022년에는 **−59%** 였다($30.0B 을 넣었는데 평가액이
   * $80.8B 빠져 잔고가 줄었다). 12개월만 보면 그게 "31%" 한 숫자로 뭉개진다.
   *
   * ⛔ 그 몫(%)은 여기서 안 낸다. 분모(순매수+평가)가 0 근처면 값이 폭발한다 — 2018년은
   * 851%, 2015년은 105% 가 나온다. 화면은 두 금액과 막대로만 말한다.
   */
  breakdown: {
    /** 화면에 그리는 첫 해. 각주가 창을 밝히는 데 쓴다. */
    from: number;
    /** 그린 창 전체의 합. 각주의 요약 문장이 쓴다. */
    netPurchase: number;
    valuation: number;
    years: { year: number; netPurchase: number; valuation: number }[];
  };
  /** 우리가 든 미국 주식 ÷ 그들이 든 한국 주식. */
  reversal: {
    /** 꼭대기 이후 미국인의 한국 주식 순매수 합. 음수면 그동안 오히려 팔았다는 뜻이다. */
    usNetSincePeak: number;
    /** 같은 기간 그들이 든 몫이 몇 배가 됐나. 순매수가 음수인데 이게 크면 전부 주가다. */
    theirsGrowth: number | null;
    ratioNow: number | null;
    ours: number;
    theirs: number;
    peakMonth: string;
    peakRatio: number;
    series: { month: string; ratio: number }[];
  };
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
      .select(
        "month, holdings_usd_mn, net_purchase_usd_mn, valuation_change_usd_mn, us_holdings_usd_mn, us_net_purchase_usd_mn",
      )
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
        usNetPurchase:
          r.us_net_purchase_usd_mn == null ? null : Number(r.us_net_purchase_usd_mn),
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

  // ── 아래 카드들은 같은 rows 를 재활용한다 ────────────────────────────
  // 카드마다 표를 다시 읽지 않는다. 498행이 한 번 오면 나머지는 전부 그 위의 산수라,
  // 왕복을 늘리면 화면만 느려지고 값은 한 글자도 안 달라진다.

  // 잔고가 변한 이유 — 해별. 코호트와 같은 해(COHORT_FROM)부터 낸다. 두 카드가 같은
  // 층에 나란히 있어서 창이 갈리면 "2015년"이 두 뜻이 된다.
  const byYearFlow = new Map<number, { netPurchase: number; valuation: number }>();
  for (const r of rows) {
    const y = Number(r.month.slice(0, 4));
    if (y < COHORT_FROM) continue;
    const cur = byYearFlow.get(y) ?? { netPurchase: 0, valuation: 0 };
    cur.netPurchase += r.netPurchase;
    cur.valuation += r.valuationChange;
    byYearFlow.set(y, cur);
  }
  const years = [...byYearFlow.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, v]) => ({ year, ...v }));
  const breakdown = {
    from: years[0]?.year ?? COHORT_FROM,
    netPurchase: years.reduce((s, y) => s + y.netPurchase, 0),
    valuation: years.reduce((s, y) => s + y.valuation, 0),
    years,
  };

  // 역전 — 우리가 든 미국 주식 vs 그들이 든 한국 주식.
  // 배수의 **꼭대기부터** 보여 준다. "역전됐다"는 상태만 말하면 지금이 어느 방향으로
  // 가는 중인지가 빠지는데, 실제로는 2024-12 3.09배에서 무너지는 중이다.
  const withReverse = rows.filter((r) => r.usHoldings && r.usHoldings > 0);
  const reverseSeries = withReverse
    .filter((r) => r.month >= "2015-01-01")
    .map((r) => ({ month: r.month, ratio: r.holdings / (r.usHoldings as number) }));
  let peak = reverseSeries[0] ?? { month: last.month, ratio: 1 };
  for (const p of reverseSeries) if (p.ratio > peak.ratio) peak = p;
  const lastReverse = withReverse[withReverse.length - 1];
  // 꼭대기 이후 미국인이 한국 주식을 실제로 얼마나 사고팔았나. 배수가 무너진 게
  // "그들이 샀기 때문"인지 "한국 주가가 올랐기 때문"인지를 이 합이 가른다.
  const sincePeak = rows.filter((r) => r.month > `${peak.month.slice(0, 7)}-01`);
  const usNetSincePeak = sincePeak.reduce((s, r) => s + (r.usNetPurchase ?? 0), 0);
  const theirsAtPeak = rows.find((r) => r.month === peak.month)?.usHoldings ?? null;
  const reversal = {
    usNetSincePeak,
    theirsGrowth:
      theirsAtPeak && lastReverse?.usHoldings
        ? (lastReverse.usHoldings as number) / theirsAtPeak
        : null,
    ratioNow: lastReverse ? lastReverse.holdings / (lastReverse.usHoldings as number) : null,
    ours: lastReverse?.holdings ?? 0,
    theirs: lastReverse?.usHoldings ?? 0,
    peakMonth: peak.month.slice(0, 7),
    peakRatio: peak.ratio,
    series: reverseSeries,
  };

  return {
    asOf: last.month.slice(0, 7),
    principal,
    marketValue,
    returnPct: (marketValue / principal - 1) * 100,
    indexNow,
    closureErrorPct: (synthetic / marketValue - 1) * 100,
    cohorts,
    series,
    breakdown,
    reversal,
  };
}

/**
 * 가장 최근 결제일 하루치.
 *
 * **하루만 읽는다.** 이 표는 32년 × 하루 25행이라 다 받으면 25만 행이고, 매 렌더가
 * 그걸 읽으면 예전에 Egress 를 태운 그 패턴이 된다(전량조회). 카드가 말하는 건
 * "오늘 얼마"라서 하루면 충분하다.
 *
 * 결제일은 거래일 대비 T+1 영업일이라, 최신 행이 곧 **직전 거래일**의 매매다.
 */
export async function getLatestSettlement(): Promise<SettlementDay | null> {
  const { data: head, error: headErr } = await getSupabaseServer()
    .from("seohak_settlement_daily")
    .select("settle_date")
    .order("settle_date", { ascending: false })
    .limit(1);
  if (headErr) throw new Error(`결제 통계 조회 실패: ${headErr.message}`);
  const day = head?.[0]?.settle_date as string | undefined;
  if (!day) return null;

  const { data, error } = await getSupabaseServer()
    .from("seohak_settlement_daily")
    .select("market_code, security_type, buy_count, buy_amount, sell_count, sell_amount")
    .eq("settle_date", day);
  if (error) throw new Error(`결제 통계 조회 실패: ${error.message}`);

  const rows = data ?? [];
  const us = rows.find((r) => r.market_code === "US" && r.security_type === "주식");
  if (!us) return null;
  return {
    date: day,
    usBuy: Number(us.buy_amount ?? 0),
    usSell: Number(us.sell_amount ?? 0),
    usBuyCount: Number(us.buy_count ?? 0),
    usSellCount: Number(us.sell_count ?? 0),
    allStockBuy: rows
      .filter((r) => r.security_type === "주식")
      .reduce((s, r) => s + Number(r.buy_amount ?? 0), 0),
  };
}

export type Peer = { code: string; name: string; holdings: number; isHome: boolean };

/** 같은 달, 나라별 잔고. 한국이 어디쯤인지 보여 주는 데만 쓴다. */
export async function getPeers(month: string): Promise<Peer[]> {
  const { data, error } = await getSupabaseServer()
    .from("seohak_country_flows")
    .select("country_code, holdings_usd_mn")
    .eq("month", `${month}-01`);
  if (error) throw new Error(`비교국 조회 실패: ${error.message}`);
  return (data ?? [])
    .map((r) => ({
      code: r.country_code as string,
      name: COUNTRY_NAME[r.country_code as string] ?? (r.country_code as string),
      holdings: Number(r.holdings_usd_mn ?? 0),
      isHome: r.country_code === KOREA,
    }))
    .sort((a, b) => b.holdings - a.holdings);
}

export type NpsHolding = { issuer: string; value: number; sharePct: number };
export type NpsPortfolio = {
  reportDate: string;
  positions: number;
  total: number;
  top: NpsHolding[];
  added: number;
  removed: number;
  prevDate: string | null;
};

/** 한 제출자·한 분기의 보유 전부. 562종목이라 1,000행 캡 아래지만 페이지를 이어 받는다. */
async function loadFiling(cik: string, reportDate: string) {
  const rows: { cusip: string; issuer: string; value: number }[] = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await getSupabaseServer()
      .from("seohak_institution_13f")
      .select("cusip, issuer, value_usd")
      .eq("filer_cik", cik)
      .eq("report_date", reportDate)
      // 원문 오류 의심 제출은 통째로 뺀다(migration_030 의 suspect 주석).
      .eq("suspect", false)
      .order("cusip", { ascending: true })
      .range(start, start + 999);
    if (error) throw new Error(`13F 조회 실패: ${error.message}`);
    const page = data ?? [];
    for (const r of page)
      rows.push({ cusip: r.cusip as string, issuer: r.issuer as string, value: Number(r.value_usd ?? 0) });
    if (page.length < 1000) break;
  }
  return rows;
}

export async function getNpsPortfolio(): Promise<NpsPortfolio | null> {
  // 최근 두 분기의 날짜만 먼저 집는다. 분기말이 언제인지는 제출자마다 다르고
  // (한 곳은 이미 6/30 을 냈고 국민연금은 3/31 이 최신이다) 코드에 박으면 낡는다.
  const { data: dates, error } = await getSupabaseServer()
    .from("seohak_institution_13f")
    .select("report_date")
    .eq("filer_cik", NPS_CIK)
    .order("report_date", { ascending: false })
    .limit(1200);
  if (error) throw new Error(`13F 분기 조회 실패: ${error.message}`);
  const uniq = [...new Set((dates ?? []).map((d) => d.report_date as string))].sort().reverse();
  if (!uniq.length) return null;

  const [cur, prev] = uniq;
  const rows = await loadFiling(NPS_CIK, cur);
  if (!rows.length) return null;
  const total = rows.reduce((s, r) => s + r.value, 0);

  // 알파벳처럼 한 회사가 두 클래스로 나뉘어 CUSIP 이 둘인 경우가 있다. 표에는
  // **회사 이름으로 합쳐** 보여 준다 — 순위표에 같은 이름이 두 줄로 서면 오류로 읽힌다.
  const byIssuer = new Map<string, number>();
  for (const r of rows) byIssuer.set(r.issuer, (byIssuer.get(r.issuer) ?? 0) + r.value);
  const top = [...byIssuer.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([issuer, value]) => ({ issuer, value, sharePct: (value / total) * 100 }));

  let added = 0;
  let removed = 0;
  if (prev) {
    const before = new Set((await loadFiling(NPS_CIK, prev)).map((r) => r.cusip));
    const after = new Set(rows.map((r) => r.cusip));
    for (const c of after) if (!before.has(c)) added++;
    for (const c of before) if (!after.has(c)) removed++;
  }

  return {
    reportDate: cur,
    positions: rows.length,
    total,
    top,
    added,
    removed,
    prevDate: prev ?? null,
  };
}
