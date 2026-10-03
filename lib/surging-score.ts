/**
 * 급부상 배수 — 최근 며칠 동안 그 종목이 대화에서 차지한 몫이 평소보다 몇 배인가. 국장·미장이 같이 쓴다.
 *
 * lib/telegram-data.ts getSurgingStocks(국장)·lib/us-telegram-data.ts getUsSurgingStocks(미장)가 부르는
 * 순수 함수다(DB 없이 테스트하려고 뗐다). 파이썬 사본은 data-pipeline/common/surging.py(surging_shares ·
 * score_surging)와 common/us_surging.py(score_us_surging)이고, 두 테스트가 같은 예제로 같은 배수를
 * 확인한다(tests/surging-score.test.ts · data-pipeline/tests/test_surging_score.py).
 *
 * ## 평소는 합쳐서, 최근은 날마다 평균해서 (2026-09-28)
 *
 * 몫 = 그 종목 가중치 ÷ 그날 전체 가중치. 절대량이 아니라 몫으로 견주는 건 주말엔 전체 언급이 평일의
 * 1/10 안팎이라 절대량으로 보면 모든 종목이 '감소'로 나오기 때문이다.
 *
 * 예전엔 평소도 최근도 날마다 몫을 내 평균했다. 그러면 대화가 평일의 16분의 1인 연휴 하루가 평소 값을
 * 부풀린다 — 2026-09-24 추석 당일 HLB 는 40건으로 그날 몫 24.1%였고, 그게 평소에 들어가 첫 거래일
 * 09-28 에 97건이 0.74배(428위)로 나와 카드에서 빠졌다.
 *
 * - **평소(앞 기간)는 합쳐서 낸다** — 앞 기간 그 종목 가중치 합 ÷ 앞 기간 전체 가중치 합. 조용한 날은
 *   대화량만큼만 반영된다. 09-28 HLB 5위.
 * - **최근은 지금처럼 날마다 평균한다** — 조용한 날 터진 소식도 그날 하루만큼 반영돼야 그날 카드에
 *   뜬다. 최근까지 합치면 09-24 저녁 HLB 가 1위 → 16위, 09-19 이수페타시스가 1위 → 24위로 밀렸다
 *   (#565 가 고친 '그날 소식이 저녁 카드에 없는' 문제가 되살아난다).
 *
 * 08-01~09-28 59일 되돌려 재기(국장): 지금 목록과 6장 중 4.9장 겹침 · 최근 3일 언급 2건 이하 카드
 * 8장 → 4장(국장 하한을 3건으로 올려 0장) · 전날 대비 바뀐 카드 3.4 → 3.2장. 미장은 주말 대화가 덜
 * 줄어 거의 그대로다(5.4장 겹침).
 */

/** 국장 평활 상수 — '언급 1회가 그날 대화에서 차지하는 몫'(telegram_stock_daily 실측 중앙값 0.0018). */
export const SHARE_SMOOTHING = 0.002;
/** 미장 평활 상수. ⚠️ 국장과 다르다(베끼다 틀렸던 자리, common/us_surging.py). */
export const US_SHARE_SMOOTHING = 0.0006;
/** 최근 언급이 이보다 적으면 표본이 얇다. 국장은 카드 정원을 채울 때 맨 뒤로, 미장은 뺀다. */
export const MIN_RECENT_MENTIONS = 3;
/** 최근으로 치는 날 수(국장·미장 같다). */
export const RECENT_DAYS = 3;

export type SurgingDailyRow = { date: string; weighted_score: number; mention_count: number };

export type ShareStat = {
  /** 최근 날마다의 몫 평균 */
  recentShare: number;
  /** 앞 기간을 합친 몫 */
  baseShare: number;
  /** 최근 기간 언급 수 합 */
  recentMentions: number;
  /** 날짜 → 그날 언급 수(막대용) */
  byDate: Map<string, number>;
};

/**
 * `dates` 는 오래된→최신 날짜 목록(rows 에 있는 날들). 마지막 min(recentDays, 날 수 − 1)일이 '최근'이다.
 */
export function surgingShares<R extends SurgingDailyRow>(
  rows: R[],
  dates: string[],
  keyOf: (r: R) => string,
  recentDays: number = RECENT_DAYS,
): { recentDates: string[]; stats: Map<string, ShareStat> } {
  const recentN = Math.min(recentDays, Math.max(1, dates.length - 1));
  const recentDates = dates.slice(-recentN);
  const recentSet = new Set(recentDates);

  const dayTotal = new Map<string, number>();
  let priorTotal = 0;
  for (const r of rows) {
    const w = Number(r.weighted_score) || 0;
    dayTotal.set(r.date, (dayTotal.get(r.date) ?? 0) + w);
    if (!recentSet.has(r.date)) priorTotal += w;
  }

  const acc = new Map<string, { recentShareSum: number; priorW: number; recentM: number; byDate: Map<string, number> }>();
  for (const r of rows) {
    const key = keyOf(r);
    const w = Number(r.weighted_score) || 0;
    const a = acc.get(key) ?? { recentShareSum: 0, priorW: 0, recentM: 0, byDate: new Map() };
    a.byDate.set(r.date, r.mention_count || 0);
    if (recentSet.has(r.date)) {
      const total = dayTotal.get(r.date) || 0;
      a.recentShareSum += total > 0 ? w / total : 0;
      a.recentM += r.mention_count || 0;
    } else {
      a.priorW += w;
    }
    acc.set(key, a);
  }

  const stats = new Map<string, ShareStat>();
  for (const [key, a] of acc) {
    stats.set(key, {
      recentShare: a.recentShareSum / recentN,
      baseShare: priorTotal > 0 ? a.priorW / priorTotal : 0,
      recentMentions: a.recentM,
      byDate: a.byDate,
    });
  }
  return { recentDates, stats };
}

export type SurgingScore = { recentMentions: number; ratio: number; isNew: boolean; byDate: Map<string, number> };

/** 국장 — 종목코드별 배수. 평활한 뒤 나눈다(그냥 나누면 3일간 2회 언급이 "▲162.8배"로 나온 적이 있다). */
export function scoreSurging(
  rows: (SurgingDailyRow & { stock_code: string })[],
  dates: string[],
): { recentDates: string[]; scores: Map<string, SurgingScore> } {
  const { recentDates, stats } = surgingShares(rows, dates, (r) => r.stock_code);
  const scores = new Map<string, SurgingScore>();
  for (const [code, s] of stats) {
    scores.set(code, {
      recentMentions: s.recentMentions,
      ratio: (s.recentShare + SHARE_SMOOTHING) / (s.baseShare + SHARE_SMOOTHING),
      isNew: s.baseShare === 0,
      byDate: s.byDate,
    });
  }
  return { recentDates, scores };
}

export type UsSurgingScore = { ticker: string; multiple: number; recentMentions: number; isNew: boolean; byDate: Map<string, number> };

/** 미장 — 최근 언급 MIN_RECENT_MENTIONS 미만·배수 1 이하는 빼고 배수 내림차순. */
export function scoreUsSurging(
  rows: (SurgingDailyRow & { ticker: string })[],
  dates: string[],
  recentDays: number = RECENT_DAYS,
): { recentDates: string[]; ranked: UsSurgingScore[] } {
  const { recentDates, stats } = surgingShares(rows, dates, (r) => r.ticker, recentDays);
  const ranked: UsSurgingScore[] = [];
  for (const [ticker, s] of stats) {
    if (s.recentMentions < MIN_RECENT_MENTIONS) continue;
    const multiple = (s.recentShare + US_SHARE_SMOOTHING) / (s.baseShare + US_SHARE_SMOOTHING);
    if (multiple <= 1) continue;
    // isNew — 평소 기간엔 언급이 없던 종목(국장 scoreSurging 과 같은 뜻). v2 표가 '첫 언급' 꼬리표를 단다.
    ranked.push({ ticker, multiple, recentMentions: s.recentMentions, isNew: s.baseShare === 0, byDate: s.byDate });
  }
  ranked.sort((a, b) => b.multiple - a.multiple);
  return { recentDates, ranked };
}
