import "server-only";

/**
 * 서학개미 해부도의 **바깥 원천 둘** — 원/달러 환율(FRED)과 가계 금융자산(한국은행 ECOS).
 *
 * ## 왜 표에 안 넣고 여기서 직접 받나
 *
 * 둘 다 우리 파이프라인이 안 만드는 자료이고, 표를 새로 파려면 마이그레이션이 필요하다.
 * 대신 **Next 의 Data Cache** 에 얹는다 — 페이지가 `force-dynamic` 이어도 `fetch` 단위
 * 캐시는 따로 돈다. 그래서 방문마다 부르는 게 아니라 하루 몇 번만 부른다.
 *
 * ⚠️ 실패하면 **null 을 돌린다.** 0 이나 빈 값으로 흘리면 화면이 "환율이 0원"이나
 * "가계가 해외주식을 안 든다"로 뜨는데, 그건 고장이 아니라 사실처럼 읽힌다.
 *
 * ## ⚠️ 저작권 — 이 페이지는 벤더 지수를 안 쓴다
 *
 * `lib/seohak-data.ts` 머리말이 못박은 원칙이다(야후·KRX·나스닥·S&P 는 벤더 약관을
 * 따른다). **환율은 그 제약 밖이다** — `DEXKOUS` 는 연준이 내는 H.10 이라 미 정부
 * 저작물이고, ECOS 는 한국은행 공공저작물이다. 둘 다 출처만 밝히면 된다.
 */

/** 하루에 한 번만 부르면 되는 자료들이다. 환율은 장중에 움직이지만 이 카드가 쓰는 건
 *  30년 가중평균이라 6시간이면 넉넉하다. */
const REVALIDATE = 6 * 60 * 60;

export type UsdKrw = {
  /** YYYY-MM → 그달 평균 환율. 유입을 그달 환율로 환산하는 데 쓴다. */
  monthly: Map<string, number>;
  /** 가장 최근 영업일 환율. */
  now: number;
  nowDate: string;
};

/**
 * 원/달러. **월평균과 최신 일별을 따로 받는다.**
 *
 * ⚠️ 월평균 시리즈의 마지막 달을 '지금 환율'로 쓰면 안 된다. 이번 달은 아직 안 끝나서
 * 값이 없거나 반쪽이라, 한두 달 묵은 값을 오늘 것으로 읽게 된다.
 */
export async function getUsdKrw(): Promise<UsdKrw | null> {
  const key = process.env.FRED_API_KEY;
  if (!key) return null;
  const base = "https://api.stlouisfed.org/fred/series/observations";
  const common = `series_id=DEXKOUS&api_key=${key}&file_type=json`;
  try {
    const [mRes, dRes] = await Promise.all([
      fetch(
        `${base}?${common}&frequency=m&aggregation_method=avg&observation_start=1994-01-01`,
        { next: { revalidate: REVALIDATE } },
      ),
      fetch(`${base}?${common}&sort_order=desc&limit=10`, { next: { revalidate: REVALIDATE } }),
    ]);
    if (!mRes.ok || !dRes.ok) return null;
    const mJson = (await mRes.json()) as { observations?: { date: string; value: string }[] };
    const dJson = (await dRes.json()) as { observations?: { date: string; value: string }[] };
    const monthly = new Map<string, number>();
    for (const o of mJson.observations ?? []) {
      if (o.value === ".") continue;
      monthly.set(o.date.slice(0, 7), Number(o.value));
    }
    // ⚠️ FRED 는 휴일을 "." 로 채워 보낸다. 최신 몇 개를 받아 값이 있는 첫 줄을 쓴다.
    const latest = (dJson.observations ?? []).find((o) => o.value !== ".");
    if (!monthly.size || !latest) return null;
    return { monthly, now: Number(latest.value), nowDate: latest.date };
  } catch {
    return null;
  }
}

/** 화면에 세우는 가계 금융자산 항목. 코드는 ECOS `281Y002` 의 금융상품 분류다. */
const HOUSEHOLD_ITEMS = {
  F02TZB: "cash",
  F03ZTB: "insurance",
  F04TTB: "bond",
  F071ZZB: "domestic",
  F072ZZB: "foreign",
  F073ZZB: "fund",
} as const;

export type HouseholdAssets = {
  /** 최신 분기(예: "2026Q1"). */
  asOf: string;
  /** 조원. */
  cash: number;
  insurance: number;
  bond: number;
  /** 거주자 발행주식 = 국내 주식. */
  domestic: number;
  /** 비거주자 발행주식 = 해외 주식. */
  foreign: number;
  /** 투자펀드 지분. 국내·해외가 안 갈린다. */
  fund: number;
  /** 위 여섯의 합. '금융자산 중 몇 %'의 분모다. */
  total: number;
  /**
   * 주식 중 해외 몫(%) = 해외 ÷ (국내 + 해외).
   *
   * ⚠️ **'해외 ÷ 국내'와 섞으면 안 된다.** 2026Q1 이 각각 14% 와 16% 라, 한 카드에서
   * 결론 문장은 "100원 중 14원"인데 표는 16% 를 적는 일이 실제로 났다. 이 페이지는
   * '100원 중 몇 원' 어법을 쓰므로 분모는 늘 국내+해외다.
   */
  foreignShare: number;
  /** 8분기 추이. `share` 는 위와 같은 자다(해외 ÷ 국내+해외). */
  series: { quarter: string; domestic: number; foreign: number; share: number }[];
};

/**
 * 가계 및 비영리단체의 금융자산 — 한국은행 자금순환표(금융자산부채잔액표).
 *
 * ## ⭐ 이 페이지에서 **법인이 안 섞인 유일한 숫자**다
 *
 * 나머지 카드는 예탁원 결제(= 국내 증권사를 거친 채널)로 재는데 거기엔 법인·중소기관이
 * 11~12% 섞인다. 이건 부문 `S14 가계 및 비영리단체` 를 원천이 직접 갈라 준 값이다.
 *
 * ## ⚠️ 대신 두 가지를 못 한다
 *
 *  ① **미국만 못 뗀다.** '비거주자 발행주식'은 전 세계다. 개인 해외주식 매수의 95%가
 *     미국이라 근사는 되지만, 화면에 '미국'이라 적으면 안 된다.
 *  ② **해외 ETF 가 빠져 있다.** 해외 상장 ETF 는 '투자펀드 지분'(fund)으로 분류되는데
 *     그건 국내·해외가 안 갈린다. 그래서 `foreign` 은 가계 해외주식의 **하한**이다.
 *
 * ⭐ 와일드카드 항목(`/?/`)으로 한 번에 받는다. 항목마다 부르면 6회 왕복 6.2초인데
 * 한 번이면 2.2초다.
 */
export async function getHouseholdAssets(): Promise<HouseholdAssets | null> {
  const key = process.env.ECOS_API_KEY;
  if (!key) return null;
  // 8분기를 그리려면 3년치면 넉넉하다. 자료가 늦게 나오므로 끝을 넉넉히 잡는다.
  const from = new Date().getUTCFullYear() - 3;
  const to = new Date().getUTCFullYear() + 1;
  const url = `https://ecos.bok.or.kr/api/StatisticSearch/${key}/json/kr/1/1000/281Y002/Q/${from}Q1/${to}Q4/S14/?/A`;
  try {
    const res = await fetch(url, { next: { revalidate: REVALIDATE } });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      StatisticSearch?: { row?: { TIME: string; ITEM_CODE2: string; DATA_VALUE: string }[] };
    };
    const rows = json.StatisticSearch?.row ?? [];
    if (!rows.length) return null;

    const byQuarter = new Map<string, Record<string, number>>();
    for (const r of rows) {
      const field = HOUSEHOLD_ITEMS[r.ITEM_CODE2 as keyof typeof HOUSEHOLD_ITEMS];
      if (!field) continue;
      const cur = byQuarter.get(r.TIME) ?? {};
      // 원천 단위가 십억 원이다. 화면은 조 원이라 여기서 한 번만 나눈다.
      cur[field] = Number(r.DATA_VALUE) / 1000;
      byQuarter.set(r.TIME, cur);
    }
    const quarters = [...byQuarter.keys()].sort();
    const asOf = quarters[quarters.length - 1];
    const last = byQuarter.get(asOf);
    if (!last || !last.foreign || !last.domestic) return null;

    const total = Object.values(HOUSEHOLD_ITEMS).reduce((s, f) => s + (last[f] ?? 0), 0);
    return {
      asOf,
      cash: last.cash ?? 0,
      insurance: last.insurance ?? 0,
      bond: last.bond ?? 0,
      domestic: last.domestic,
      foreign: last.foreign,
      fund: last.fund ?? 0,
      total,
      foreignShare: (last.foreign / (last.domestic + last.foreign)) * 100,
      series: quarters.slice(-8).map((quarter) => {
        const v = byQuarter.get(quarter) ?? {};
        const dom = v.domestic ?? 0;
        const forg = v.foreign ?? 0;
        return {
          quarter,
          domestic: dom,
          foreign: forg,
          share: dom + forg ? (forg / (dom + forg)) * 100 : 0,
        };
      }),
    };
  } catch {
    return null;
  }
}
