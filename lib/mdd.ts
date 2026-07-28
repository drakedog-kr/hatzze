/**
 * MDD(최대낙폭) 분석 — 순수 계산.
 *
 * 야후 일봉 종가 배열 하나로 낙폭 시계열·역대 낙폭 사건·회복 통계를 낸다.
 * server-only 를 붙이지 않는다(순수 함수라 테스트·재사용이 쉽도록). 데이터 조회는
 * lib/yahoo-history.ts, 화면은 app/mdd 가 맡고 여기는 숫자만 만든다.
 *
 * 기준은 전부 **종가**다. 야후의 close 는 액면분할·감자를 소급 조정한 수정주가라
 * (삼성전자 2018년 50:1 분할이 되감겨 있다) 장기 낙폭이 왜곡되지 않는다. 반면
 * adjclose 는 감자에서 음수가 나오는 등 깨져 있어 쓰지 않는다(SK하이닉스 실측).
 */

export type Bar = { date: string; close: number };

/** 각 시점의 고점 대비 낙폭(%). dd 는 0 이하이고, 새 고점에서 0 이 된다. */
export type DrawdownPoint = { date: string; close: number; dd: number };

/**
 * 고점→저점→회복을 한 사건으로 본 하락 에피소드.
 * depth 는 음수(%), days 는 고점일부터 회복일(미회복이면 마지막일)까지의 달력 일수.
 */
export type Episode = {
  peakDate: string;
  troughDate: string;
  depth: number;
  /** 고점을 회복한 날. 아직 회복 못 했으면 null. */
  recoveryDate: string | null;
  /** 고점→회복(미회복이면 마지막)까지의 달력 일수. */
  days: number;
  /** 고점→저점까지의 달력 일수 — 하락 '속도'(급락형/완만형)를 가른다. */
  troughDays: number;
  recovered: boolean;
};

/**
 * 하락의 '성격' — 얼마나 빠르게 빠졌나. 같은 −30%라도 며칠 만에 급락한 것과
 * 몇 달에 걸쳐 흘러내린 것은 회복 양상이 크게 다르다(급락은 빨리, 완만은 오래).
 */
export type DrawdownCharacter = {
  /** 현재 하락의 고점→저점 달력 일수·깊이. */
  currentTroughDays: number;
  currentTroughDepth: number;
  currentClass: "fast" | "slow";
  /** 과거 급락형(빠른 하락)의 사례 수와 회복 일수 중앙값. 사례 없으면 null. */
  fast: { count: number; medianRecovery: number } | null;
  slow: { count: number; medianRecovery: number } | null;
};

/** 고점→저점이 이 일수 이하면 급락형, 넘으면 완만형. */
const CHARACTER_SPLIT_DAYS = 75;
/** 성격 분석에 넣을 '의미 있는' 하락의 최소 깊이(%). 잔물결은 뺀다. */
const CHARACTER_MIN_DEPTH = -15;
/**
 * 성격(급락형/완만형)을 따지기 시작하는 최소 낙폭(%). 이보다 얕으면 판단하지 않는다.
 * 화면이 "왜 안 보이는지"를 이 숫자로 설명하므로 export 한다 — 문턱을 옮기면
 * 안내 문구도 같이 따라와야 한다.
 */
export const CHARACTER_MIN_DD = -8;

export type RecoveryStats = {
  /** 지금과 같거나 더 깊었던 사건 수(진행 중 포함). */
  similarCount: number;
  recoveredCount: number;
  unrecoveredCount: number;
  /** 회복한 사건들의 달력 일수. 회복 사례가 없으면 null. */
  minDays: number | null;
  medianDays: number | null;
  maxDays: number | null;
  /**
   * 통계를 낸 사건 하나하나(진행 중 포함, 고점 날짜순).
   * 최단·중앙값·최장 세 숫자만으로는 "4.7년"이 예외적으로 길었던 한 번인지
   * 늘 그 정도인지 알 수 없어서, 화면이 분포를 그릴 수 있게 표본을 함께 넘긴다.
   * topDrawdowns 로 대신할 수 없다 — 그건 깊이 상위 5건이라 '지금보다 깊었던
   * 사건'이 6건 이상이면 일부가 빠진다.
   */
  samples: { peakDate: string; days: number; depth: number; recovered: boolean }[];
};

export type MddAnalysis = {
  firstDate: string;
  asOf: string;
  tradingDays: number;
  price: number;
  ath: number;
  athDate: string;
  currentDd: number;
  /** 조회 구간에서 지금보다 더 깊게 빠져 있던 날의 비율(%). */
  deeperThanNowPct: number;
  mdd: number;
  mddDate: string;
  underwater: DrawdownPoint[];
  recovery: RecoveryStats | null;
  character: DrawdownCharacter | null;
  topDrawdowns: Episode[];
};

/** 종가 배열 → 시점별 고점 대비 낙폭. */
export function drawdownSeries(bars: Bar[]): DrawdownPoint[] {
  const out: DrawdownPoint[] = [];
  let peak = -Infinity;
  for (const b of bars) {
    if (b.close > peak) peak = b.close;
    out.push({ date: b.date, close: b.close, dd: (b.close / peak - 1) * 100 });
  }
  return out;
}

/**
 * 고점에서 시작해 그 고점을 되찾을 때까지를 한 에피소드로 끊는다.
 *
 * 새 고점을 만나면 직전 하락 국면을 '회복됨'으로 종료하고, 마지막까지 고점을 못
 * 넘겼으면 '미회복'(진행 중)으로 남긴다. 진행 중 사건은 recovered=false 라 회복
 * 통계(회복일수)에서 빠진다 — 아직 안 끝난 하락을 "N일 만에 회복"으로 세면 평균이
 * 부당하게 짧아진다.
 */
export function episodes(bars: Bar[]): Episode[] {
  const eps: Episode[] = [];
  if (bars.length === 0) return eps;

  let peak = bars[0].close;
  let peakDate = bars[0].date;
  let trough = bars[0].close;
  let troughDate = bars[0].date;

  const daysBetween = (a: string, b: string) =>
    Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

  for (const b of bars) {
    if (b.close >= peak) {
      if (trough < peak) {
        eps.push({
          peakDate,
          troughDate,
          depth: (trough / peak - 1) * 100,
          recoveryDate: b.date,
          days: daysBetween(peakDate, b.date),
          troughDays: daysBetween(peakDate, troughDate),
          recovered: true,
        });
      }
      peak = b.close;
      peakDate = b.date;
      trough = b.close;
      troughDate = b.date;
    } else if (b.close < trough) {
      trough = b.close;
      troughDate = b.date;
    }
  }

  if (trough < peak) {
    eps.push({
      peakDate,
      troughDate,
      depth: (trough / peak - 1) * 100,
      recoveryDate: null,
      days: daysBetween(peakDate, bars[bars.length - 1].date),
      troughDays: daysBetween(peakDate, troughDate),
      recovered: false,
    });
  }

  return eps;
}

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

/**
 * 지금과 같거나 더 깊었던 사건들의 회복 통계.
 * currentDd 는 음수(%). 표본이 적으므로 화면은 평균이 아니라 범위로 보여준다.
 */
function recoveryStats(eps: Episode[], currentDd: number): RecoveryStats | null {
  // 지금이 사실상 신고가면(≈0) '비슷한 깊이'라는 개념이 성립하지 않는다.
  if (currentDd > -1) return null;
  const similar = eps.filter((e) => e.depth <= currentDd);
  if (similar.length === 0) {
    return { similarCount: 0, recoveredCount: 0, unrecoveredCount: 0, minDays: null, medianDays: null, maxDays: null, samples: [] };
  }
  const recovered = similar.filter((e) => e.recovered);
  const days = recovered.map((e) => e.days);
  return {
    similarCount: similar.length,
    recoveredCount: recovered.length,
    unrecoveredCount: similar.length - recovered.length,
    minDays: days.length ? Math.min(...days) : null,
    medianDays: days.length ? median(days) : null,
    maxDays: days.length ? Math.max(...days) : null,
    samples: [...similar]
      .sort((a, b) => a.peakDate.localeCompare(b.peakDate))
      .map((e) => ({ peakDate: e.peakDate, days: e.days, depth: e.depth, recovered: e.recovered })),
  };
}

/**
 * 하락의 성격(급락형/완만형)과 성격별 회복 통계.
 * currentDd 는 음수(%). 지금 하락이 뚜렷하지 않거나(−8% 초과) 표본이 얇으면 null.
 */
function drawdownCharacter(eps: Episode[], currentDd: number): DrawdownCharacter | null {
  if (currentDd > CHARACTER_MIN_DD) return null;
  // 진행 중(미회복) 마지막 사건이 곧 '현재 하락'이다.
  const current = eps.length && !eps[eps.length - 1].recovered ? eps[eps.length - 1] : null;
  if (!current) return null;

  // 표본이 얇으면 급락/완만 비교는 생략하되(버킷 null), 섹션 자체는 살려 둔다 —
  // 현재 하락의 성격(급락/완만)만이라도 보여주고, 화면이 "기간을 넓히라"고 안내한다.
  const meaningful = eps.filter((e) => e.recovered && e.depth <= CHARACTER_MIN_DEPTH);
  const enough = meaningful.length >= 3;

  const bucket = (fast: boolean) => {
    if (!enough) return null;
    const days = meaningful.filter((e) => (e.troughDays <= CHARACTER_SPLIT_DAYS) === fast).map((e) => e.days);
    return days.length ? { count: days.length, medianRecovery: median(days) } : null;
  };

  return {
    currentTroughDays: current.troughDays,
    currentTroughDepth: current.depth,
    currentClass: current.troughDays <= CHARACTER_SPLIT_DAYS ? "fast" : "slow",
    fast: bucket(true),
    slow: bucket(false),
  };
}

/**
 * 낙폭 시계열을 화면용으로 줄인다. 거래소 차트와 같은 방식 — **일정한 시간 간격으로
 * 뽑는다**(10년은 2주에 한 점, 1년은 매일). 기간이 길수록 간격이 굵어져 선이 완만해지고,
 * 짧으면 간격이 1일이라 오르내림이 그대로 보인다.
 *
 * 두 번 갈아엎고 여기로 왔다.
 * 1) 처음엔 이 방식이었는데 극값 보장이 없어, 10년치 삼성전자의 실제 최저일
 *    (2024-11-14 −45.2%)이 통째로 빠지고 차트의 '기간 최저점' 표시가 엉뚱한 날
 *    (2025-02-05 −41.9%)을 가리켰다.
 * 2) 구간마다 최저·최고를 둘 다 남겨 봤다가 톱니가 됐고, LTTB(구간에서 가장 튀는 점을
 *    고르는 방식)로 바꿨더니 이번엔 굴곡이 과장돼 10년 차트가 지그재그로 뒤덮였다.
 *    장기 차트는 원래 완만해야 읽힌다.
 *
 * 그래서 원래의 등간격 샘플링으로 돌아오되, **최저점 한 점만 따로 끼워 넣는다.**
 * 그 점이 빠지는 게 애초의 버그였고, 하나 넣는 걸로 표시와 헤드라인이 다시 맞는다.
 */
function downsample(series: DrawdownPoint[], targetPoints: number): DrawdownPoint[] {
  const n = series.length;
  if (n <= targetPoints || targetPoints < 3) return series;

  const step = Math.ceil(n / targetPoints);
  const keep = new Set<number>();
  for (let i = 0; i < n; i += step) keep.add(i);
  keep.add(0);
  keep.add(n - 1);

  // 기간 최저점은 등간격 격자에 안 걸려도 반드시 남긴다.
  let trough = 0;
  for (let i = 1; i < n; i++) if (series[i].dd < series[trough].dd) trough = i;
  keep.add(trough);

  return [...keep].sort((x, y) => x - y).map((i) => series[i]);
}

/** 종가 시계열 하나를 받아 화면에 필요한 모든 수치를 낸다. */
export function analyzeDrawdown(bars: Bar[]): MddAnalysis | null {
  if (bars.length < 2) return null;

  const ds = drawdownSeries(bars);
  const last = ds[ds.length - 1];

  let ath = -Infinity;
  let athDate = bars[0].date;
  let mdd = 0;
  let mddDate = bars[0].date;
  for (const p of ds) {
    if (p.close > ath) {
      ath = p.close;
      athDate = p.date;
    }
    if (p.dd < mdd) {
      mdd = p.dd;
      mddDate = p.date;
    }
  }

  const deeperDays = ds.filter((p) => p.dd <= last.dd).length;
  const eps = episodes(bars);

  return {
    firstDate: bars[0].date,
    asOf: last.date,
    tradingDays: bars.length,
    price: last.close,
    ath,
    athDate,
    currentDd: last.dd,
    deeperThanNowPct: (deeperDays / ds.length) * 100,
    mdd,
    mddDate,
    // 목표 250점 = 샘플 간격이 기간에 따라 저절로 정해진다(거래소 차트와 같은 방식).
    //   1년 250거래일  → 간격 1일  = 일봉처럼 오르내림이 다 보인다
    //   5년 1,230일    → 간격 5일  ≈ 주봉
    //   10년 2,470일   → 간격 10일 ≈ 2주봉, 선이 완만해진다
    underwater: downsample(ds, 250),
    recovery: recoveryStats(eps, last.dd),
    character: drawdownCharacter(eps, last.dd),
    topDrawdowns: [...eps].sort((a, b) => a.depth - b.depth).slice(0, 5),
  };
}

/* ── 리스크 프로필 ─────────────────────────────────────────────────
 * 종목의 '기질'을 숫자 몇 개로 요약한다(스탯 타일용):
 *   보상 = 감수한 최악 낙폭 대비 벌어준 수익(연환산)
 *   빈도 = 큰 하락(−20% 이상)이 평균 몇 년에 한 번
 *   동반 = 그 큰 하락들이 시장과 함께였나, 이 종목만이었나
 */

/** 큰 하락으로 셀 낙폭 기준(%, 음수). */
const RP_BIG_DROP = -20;
/** 시장이 종목 낙폭의 이 비율만큼 이상 빠졌으면 '시장 동반'으로 본다. */
const RP_MARKET_RATIO = 0.5;

export type RiskProfile = {
  /** 분석 기간(년). 수익·빈도는 이 기간에 의존한다. */
  years: number;
  /** 연환산 수익률(%). 음수일 수 있다. */
  annualReturn: number;
  /** 최대 낙폭(%, 음수). */
  mdd: number;
  /** 큰 하락 기준(%, 음수). */
  bigDropThreshold: number;
  /** 큰 하락 횟수. */
  bigDropCount: number;
  /** 큰 하락 중 시장과 함께 빠진 횟수. 코스피 데이터 없으면 null. */
  withMarket: number | null;
  /** 큰 하락의 고점→저점 일수 중앙값(빠지는 속도). 표본 얇으면 null. */
  dropDaysMedian: number | null;
  /** 큰 하락의 저점→회복 일수 중앙값(되찾는 속도). 표본 얇으면 null. */
  recoverDaysMedian: number | null;
  /** 큰 하락 사건들 — 그때 종목 낙폭과 코스피 낙폭(같은 창). '시장 동반성' 시각화용. */
  events: RiskEvent[];
  /** 해마다 얼마 벌고(수익) 얼마나 아팠나(그 해 최악 낙폭). '낙폭 대비 보상' 시각화용. */
  yearly: YearStat[];
};

/**
 * 큰 하락 한 번 — 그 창에서 종목·코스피가 각각 얼마나 빠졌나,
 * 그리고 고점→저점(dropDays)·저점→회복(recoverDays)이 각각 며칠이었나.
 */
export type RiskEvent = {
  year: number;
  /** 고점이 난 달(1~12). 한 해에 두 건 이상이면 화면에서 이걸로 줄을 구분한다. */
  month: number;
  stock: number;
  market: number | null;
  dropDays: number;
  /** 저점→고점 회복까지의 일수. 아직 회복 못 했으면 null. */
  recoverDays: number | null;
};

/** 한 해의 수익률과 그 해 안에서 겪은 최악 낙폭(둘 다 %). */
export type YearStat = { year: number; ret: number; mdd: number };

/** date(YYYY-MM-DD) 당일 또는 그 이전의 마지막 종가. 없으면 null. */
function closeOnOrBefore(bars: Bar[], date: string): number | null {
  let res: number | null = null;
  for (const b of bars) {
    if (b.date <= date) res = b.close;
    else break;
  }
  return res;
}

/**
 * 해마다 '얼마 벌었나(수익률)'와 '그 해 안에서 얼마나 아팠나(최악 낙폭)'.
 * 낙폭은 그 해 안의 고점 대비로만 잰다 — 해를 넘겨 이어지는 낙폭이 아니라
 * "그 해를 보낸 사람이 겪은 최악"을 보여주려는 것이다.
 */
function yearlyStats(bars: Bar[]): YearStat[] {
  const byYear = new Map<number, Bar[]>();
  for (const b of bars) {
    const y = Number(b.date.slice(0, 4));
    const arr = byYear.get(y);
    if (arr) arr.push(b);
    else byYear.set(y, [b]);
  }

  const out: YearStat[] = [];
  for (const [year, ys] of [...byYear.entries()].sort((a, b) => a[0] - b[0])) {
    if (ys.length < 20) continue; // 상장·조회 경계의 토막 난 해는 뺀다
    let peak = -Infinity;
    let mdd = 0;
    for (const b of ys) {
      if (b.close > peak) peak = b.close;
      const dd = (b.close / peak - 1) * 100;
      if (dd < mdd) mdd = dd;
    }
    out.push({ year, ret: (ys[ys.length - 1].close / ys[0].close - 1) * 100, mdd });
  }
  return out;
}

/** 종목 종가 + (있으면) 시장 종가로 리스크 프로필을 낸다. */
export function riskProfile(bars: Bar[], marketBars: Bar[] | null): RiskProfile | null {
  const n = bars.length;
  if (n < 30) return null;
  const first = bars[0];
  const last = bars[n - 1];
  const years = (Date.parse(last.date) - Date.parse(first.date)) / (365 * 86_400_000);
  if (years < 0.5) return null;

  const annualReturn = (Math.pow(last.close / first.close, 1 / years) - 1) * 100;

  let peak = -Infinity;
  let mdd = 0;
  for (const b of bars) {
    if (b.close > peak) peak = b.close;
    const dd = (b.close / peak - 1) * 100;
    if (dd < mdd) mdd = dd;
  }

  const big = episodes(bars).filter((e) => e.depth <= RP_BIG_DROP);
  const bigDropCount = big.length;
  const hasMarket = !!(marketBars && marketBars.length > 1);

  // 큰 하락마다 그 창에서 코스피가 얼마나 빠졌는지. 시각화(events)와 동반 판정(withMarket)에 둘 다 쓴다.
  const events: RiskEvent[] = big.map((e) => {
    let market: number | null = null;
    if (hasMarket) {
      const mp = closeOnOrBefore(marketBars!, e.peakDate);
      const mt = closeOnOrBefore(marketBars!, e.troughDate);
      if (mp && mt) market = (mt / mp - 1) * 100;
    }
    return {
      year: Number(e.peakDate.slice(0, 4)),
      month: Number(e.peakDate.slice(5, 7)),
      stock: e.depth,
      market,
      dropDays: e.troughDays,
      recoverDays: e.recovered ? e.days - e.troughDays : null,
    };
  });

  // 시장이 종목 낙폭의 절반 이상 함께 빠졌으면 '동반'. 코스피가 아예 없으면 null.
  const withMarket = hasMarket
    ? events.filter((ev) => ev.market !== null && ev.market <= RP_MARKET_RATIO * ev.stock).length
    : null;

  // 하락 vs 회복 속도 — 되찾은 큰 하락만(고점→저점, 저점→회복). 표본 2건 미만이면 null.
  const bigRecovered = big.filter((e) => e.recovered);
  const enoughSpeed = bigRecovered.length >= 2;

  return {
    years,
    annualReturn,
    mdd,
    bigDropThreshold: RP_BIG_DROP,
    bigDropCount,
    withMarket,
    dropDaysMedian: enoughSpeed ? median(bigRecovered.map((e) => e.troughDays)) : null,
    recoverDaysMedian: enoughSpeed ? median(bigRecovered.map((e) => e.days - e.troughDays)) : null,
    events: events.slice(-6),
    yearly: yearlyStats(bars).slice(-6),
  };
}
