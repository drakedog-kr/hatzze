import { NextResponse } from "next/server";

import { LADDER_ROWS, analyzeDrawdown, drawdownNow, drawdownOnDates, drawdownSeries, moveBetween, priceLadder, riskProfile, type Bar } from "@/lib/mdd";
import { getSupabaseServer } from "@/lib/supabase-server";
import { MDD_PEER_MAX, themesForName, THEMES } from "@/lib/stock-themes";
import { US_MDD_PEER_MAX, US_THEMES, themesForTicker } from "@/lib/us-stock-themes";
import { THEME_SLUGS, US_THEME_SLUGS, themeHref, usThemeHref } from "@/lib/theme-href";
import { fetchDailyHistory, yahooSymbol } from "@/lib/yahoo-history";

import { normalizeYears } from "../../mdd/shared";

// MDD(최대낙폭) 분석. 야후 일봉을 호출 시점에 직접 받아 계산하고, 상단 티커
// (/api/ticker)와 같은 방식으로 CDN 에 15분 캐시한다 — 별도 크론·DB 없이.
// 일봉은 하루 한 번 바뀌므로 이 정도 캐시로 야후 부하를 충분히 던다.
export const dynamic = "force-dynamic";
// 시장·테마 대표 종목(최대 10개+코스피)의 히스토리를 병렬 조회한다. 넉넉히 준다.
export const maxDuration = 20;

/** 기간 프리셋(년). "all"은 상장 이후 전체(야후가 상장 이후만 준다). 키는 화면 PERIODS 와 같다(normalizeYears). */
const YEARS: Record<string, number> = { "1": 1, "3": 3, "5": 5, "10": 10, all: 100 };
/** 코스피 지수 심볼 — 코스피 상장 종목의 시장 기준. 상단 티커와 같은 심볼을 쓴다. */
const KOSPI = "^KS11";
/**
 * 코스닥 지수 심볼 — 코스닥 상장 종목의 시장 기준(2026-09-30). 예전엔 국내면 시장과 상관없이 코스피와 견줘,
 * 코스닥이 코스피보다 크게 빠진 구간(바이오·2차전지 조정기)의 '이 종목 고유의 낙폭'·'혼자 빠졌다'가 부풀었다.
 * ⚠️ 화면의 benchName(app/mdd/shared.ts)과 짝이다 — 한쪽만 고치면 "코스피는 −30%" 가 코스닥 숫자를 말한다.
 */
const KOSDAQ = "^KQ11";
/**
 * 미국 상장의 시장 기준. S&P500 이다.
 *
 * 나스닥(^IXIC)이 아닌 이유: 이 사전(us_stocks 178종목)에는 나스닥·NYSE 가 섞여 있어
 * 한쪽 거래소 지수를 기준으로 삼으면 다른 쪽 종목이 엉뚱한 것과 견줘진다.
 * S&P500 은 두 거래소를 아우르는 시장 전체의 대용이다.
 */
const SP500 = "^GSPC";

type Peer = { name: string; code: string; market: string | null; dd: number; isSelf: boolean };
/** href 는 그 테마 리포트 주소(/theme/… · /theme/us/…) — 리포트가 없는 테마면 null. 첫 줄 띠의 링크 칸이 쓴다. */
type Theme = { name: string; peers: Peer[]; avgDd: number; sincePeakAvg: number | null; href: string | null };
/**
 * 테마 비교의 결과와 **얼마나 받아 왔나**. requested 는 조회를 건 대표 종목 수, ok 는 시세를 받은 수다.
 * 사전에 없는 종목이면 requested 0(부분 실패가 아니다). lookupFailed 는 대표 종목 명단 조회 자체가 깨진 것이다.
 */
type ThemeFetch = { theme: Theme | null; requested: number; ok: number; lookupFailed: boolean };
const NO_THEME: ThemeFetch = { theme: null, requested: 0, ok: 0, lookupFailed: false };

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = (searchParams.get("code") ?? "").trim();
  const market = searchParams.get("market");
  const name = (searchParams.get("name") ?? "").trim();
  // ⚠️ 모르는 키는 기본 기간으로 접는다 — `YEARS["constructor"]` 가 함수라 NaN 기간으로 502 가 났고, "7" 은 10년으로
  //    계산하면서 응답에 "7" 을 실어 화면이 '최근 7년'이라 적었다. 응답에도 접은 키를 싣는다.
  const yearsKey = normalizeYears(searchParams.get("years"));
  const years = YEARS[yearsKey];

  // 국내는 6자리(숫자·영문), 미국은 티커 1~5자다. 예전엔 `{6}` 고정이라 미국 티커가
  // 통째로 400 이었다 — 미장 카드에서 링크를 걸 수 없던 이유가 이것이다.
  const isUs = market === "US";
  const codeOk = isUs ? /^[A-Z][A-Z.\-]{0,6}$/.test(code) : /^[0-9A-Z]{6}$/.test(code);
  if (!codeOk) {
    return NextResponse.json({ ok: false, error: "종목 코드가 올바르지 않습니다." }, { status: 400 });
  }

  const symbol = yahooSymbol(code, market);
  const bars = await fetchDailyHistory(symbol, years, { volume: true });
  const analysis = bars ? analyzeDrawdown(bars) : null;
  if (!bars || !analysis) {
    // 표에 없는 코드(잘못 친 · 상장폐지)와 일시 실패를 가른다 — 같은 문구 · 빨간 아이콘이라 없는 코드도 '고장'으로 읽혔다(2026-10-04 점검).
    let known = true;
    try {
      const { data } = await getSupabaseServer()
        .from(isUs ? "us_stocks" : "stocks")
        .select(isUs ? "ticker" : "code")
        .eq(isUs ? "ticker" : "code", code)
        .maybeSingle();
      known = !!data;
    } catch {
      // 표 조회가 깨졌으면 일시 실패로 둔다.
    }
    return NextResponse.json(
      known
        ? { ok: false, error: "이 종목의 과거 시세를 불러오지 못했습니다. 잠시 뒤 다시 열어 보십시오." }
        : { ok: false, missing: true, error: "찾을 수 없는 종목 코드입니다. 위 검색창에서 종목 이름으로 찾아 보십시오." },
      { status: known ? 502 : 404 },
    );
  }

  // 신고가 부근이면 설명할 하락 자체가 없다 — 원인 분해·시장 비교를 건너뛴다.
  const atHigh = analysis.currentDd > -1;
  const athDate = analysis.athDate;

  // 시장 지수는 항상 받는다 — 원인 분해(고점 이후)와 역대 하락 사례의 '같은 기간 시장' 칸이 지수 시계열을 쓴다.
  // 시장 기준은 상장 시장을 따른다 — 코스피 · 코스닥(2026-09-30) · 미국은 S&P500. 엔비디아 낙폭을 코스피와,
  // 알테오젠 낙폭을 코스피와 견주는 건 뜻이 없다.
  //
  // 테마 비교도 시장에 따라 갈린다. 사전만 다르고 결과 모양은 같아 화면은 하나다.
  const [marketBars, themeFetch] = await Promise.all([
    fetchDailyHistory(isUs ? SP500 : market === "KOSDAQ" ? KOSDAQ : KOSPI, years),
    isUs
      ? buildUsThemeComparison(code, years, analysis.currentDd, athDate)
      : buildThemeComparison(name, code, market, years, analysis.currentDd, athDate),
  ]);
  // 역대 하락 사례마다 같은 기간(고점→저점) 시장 등락 — 사례 표의 '시장' 칸(lib/mdd.ts Episode.market).
  if (marketBars) {
    analysis.topDrawdowns = analysis.topDrawdowns.map((e) => ({ ...e, market: moveBetween(marketBars, e.peakDate, e.troughDate) }));
  }
  const theme = themeFetch.theme;
  // 같은 기간 기준 지수의 지금 낙폭 — 첫 줄 띠의 시장 칸('최근 10년 고점 대비 코스피 −23.2%').
  const bench = marketBars ? drawdownNow(marketBars) : null;
  // 물속 차트의 '시장과 함께' 선 — 종목 물속 점과 같은 날짜로 맞춘 지수 낙폭(250개 남짓).
  const benchUnderwater = marketBars ? drawdownOnDates(marketBars, analysis.underwater.map((p) => p.date)) : null;

  // 해마다 수익 · 낙폭과 복리 연평균(화면 '해마다' 모듈) — 종목 종가로 요약.
  // ⏳ 옛 화면 받침 — v2 배포 순간 열려 있던 옛 /mdd 탭은 이 API 를 직접 부르고 risk.events.slice · bigDropCount 를 읽는다
  //    (origin/main app/mdd/RiskProfile.tsx). 새 risk 엔 그 칸이 없어 TypeError 로 오류 화면이 떴다(2026-10-04 머지 전 점검).
  //    빈 값으로 한동안 함께 실어 보낸다 — v2 화면은 이 칸을 안 읽는다. 다음 판에서 걷는다.
  const riskCore = riskProfile(bars);
  const risk = riskCore ? { ...riskCore, events: [], bigDropCount: 0, withMarket: null, dropDaysMedian: null, recoverDaysMedian: null } : riskCore;
  // 최근 1년 가격대별 거래대금('수익 · 손실 비율' 칸).
  const ladder = priceLadder(bars, LADDER_ROWS);

  // 원인 분해 — 이 종목의 고점 이후, 같은 기간 시장·테마는 얼마나 움직였나.
  // stock 은 곧 currentDd(고점 이후 수익률과 같다). 시장·테마와 나란히 놓아
  // "시장 탓인가 종목 탓인가"를 보여준다. 정밀 요인분해가 아니라 같은 창 비교다.
  const marketSincePeak = marketBars ? returnSince(marketBars, athDate) : null;
  const attribution =
    !atHigh && (marketSincePeak !== null || theme?.sincePeakAvg != null)
      ? {
          sincePeakDays: daysBetween(athDate, analysis.asOf),
          stock: analysis.currentDd,
          market: marketSincePeak,
          theme: theme?.sincePeakAvg ?? null,
        }
      : null;

  // 고점 부근이면 원인을 나눌 하락이 없다 — 대신 최근 1년을 시장과 견준다('시장 탓' 칸 자리). 빈 판이던 자리다(2026-10-04 점검).
  const yearAgo = new Date(Date.parse(`${analysis.asOf}T00:00:00Z`) - 365 * 86_400_000).toISOString().slice(0, 10);
  const yearCmp =
    atHigh && marketBars
      ? (() => {
          const stock = returnSince(bars, yearAgo);
          const mk = returnSince(marketBars, yearAgo);
          return stock !== null && mk !== null ? { stock, market: mk } : null;
        })()
      : null;

  /**
   * ## 부분 실패는 짧게 캐시하고 화면에 알린다
   *
   * 지수나 대표 종목 조회가 일시적으로 실패해도(야후 429·타임아웃) 응답은 200 이다 — 종목 자체의 낙폭은 섰다.
   * 예전엔 그 응답이 성공과 같은 15분(+10분)을 달고 나가, 화면이 "고점 무렵의 코스피 기록이 없어"·"테마를 찾지
   * 못했습니다"처럼 **일시 실패를 자료 부재로** 설명한 채 그 주소의 모든 방문자에게 25분간 굳었다(mdd#1).
   * 지금은 무엇이 빠졌는지 `partial` 에 싣고, 1분만 캐시해 곧 다시 받게 한다.
   */
  const marketFailed = marketBars === null;
  const peersFailed = themeFetch.lookupFailed || themeFetch.ok < themeFetch.requested;
  const partial =
    marketFailed || peersFailed
      ? { market: marketFailed, peersRequested: themeFetch.requested, peersOk: themeFetch.ok, lookupFailed: themeFetch.lookupFailed }
      : null;

  return NextResponse.json(
    { ok: true, code, name, market, symbol, years: yearsKey, analysis, attribution, yearCmp, theme, risk, partial, bench, benchUnderwater, ladder },
    {
      headers: {
        "Cache-Control": partial
          ? "public, s-maxage=60, stale-while-revalidate=60"
          : "public, s-maxage=900, stale-while-revalidate=600",
      },
    },
  );
}

/**
 * 미국판 테마 비교. 국내(buildThemeComparison)와 **같은 결과 모양**이라 화면은 하나다.
 * 갈리는 것은 사전 하나뿐이다 — 이 저장소가 미장 카더라 전체에서 지킨 원칙과 같다.
 *
 * 국내와 다른 점 둘.
 *  ① 사전의 키가 이름이 아니라 **티커**다. 그래서 stocks 표를 거쳐 코드로 옮기는
 *     단계가 없다 — 미국 종목의 한글 표기는 흔들리지만 티커는 안 흔들린다.
 *  ② 이름은 화면에 쓸 한글 표기라 us_stocks 에서 받는다. 못 받으면 티커를 그대로 쓴다
 *     (사전에 있는데 표에 없는 종목은 없지만, 조회가 실패해도 카드는 살아야 한다).
 */
async function buildUsThemeComparison(
  ticker: string,
  years: number,
  selfDd: number,
  athDate: string,
): Promise<ThemeFetch> {
  if (!ticker) return NO_THEME;
  const matched = themesForTicker(ticker);
  if (matched.length === 0) return NO_THEME;
  const themeName = matched[0];
  const peerTickers = US_THEMES[themeName].filter((t) => t !== ticker).slice(0, US_MDD_PEER_MAX);
  if (!peerTickers.length) return NO_THEME;

  // 최대 10개라 1,000행 캡과 무관하다.
  let nameOf = new Map<string, string>();
  try {
    const { data } = await getSupabaseServer()
      .from("us_stocks")
      .select("ticker, name_ko")
      .in("ticker", [...peerTickers, ticker]);
    nameOf = new Map((data ?? []).map((r) => [r.ticker as string, r.name_ko as string]));
  } catch {
    nameOf = new Map();
  }

  const fetched = await Promise.all(
    peerTickers.map(async (t) => {
      const bars = await fetchDailyHistory(yahooSymbol(t, "US"), years);
      if (!bars) return null;
      const ds = drawdownSeries(bars);
      return {
        name: nameOf.get(t) ?? t,
        code: t,
        dd: ds[ds.length - 1].dd,
        sincePeak: returnSince(bars, athDate),
      };
    }),
  );

  const ok = fetched.filter((p): p is NonNullable<typeof p> => p !== null);
  const counts = { requested: peerTickers.length, ok: ok.length, lookupFailed: false };
  const peers: Peer[] = ok.map((p) => ({ name: p.name, code: p.code, market: "US", dd: p.dd, isSelf: false }));
  peers.push({ name: nameOf.get(ticker) ?? ticker, code: ticker, market: "US", dd: selfDd, isSelf: true });
  peers.sort((a, b) => a.dd - b.dd); // 깊게 빠진 순
  if (peers.length < 2) return { theme: null, ...counts };

  const avgDd = peers.reduce((s, p) => s + p.dd, 0) / peers.length;
  const sinceVals = ok.map((p) => p.sincePeak).filter((v): v is number => v !== null);
  const sincePeakAvg = sinceVals.length ? sinceVals.reduce((s, v) => s + v, 0) / sinceVals.length : null;

  return { theme: { name: themeName, peers, avgDd, sincePeakAvg, href: US_THEME_SLUGS[themeName] ? usThemeHref(themeName) : null }, ...counts };
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

/**
 * 기준일(date) 이후 마지막까지의 수익률(%). date 당시 이 종목이 존재해야 의미가
 * 있으므로, date 이상인 첫 봉이 date 로부터 14일 넘게 떨어져 있으면(=그때 상장 전)
 * 계산하지 않고 null 을 준다.
 */
function returnSince(bars: Bar[], date: string, toleranceDays = 14): number | null {
  const start = bars.find((b) => b.date >= date);
  if (!start || daysBetween(date, start.date) > toleranceDays) return null;
  const last = bars[bars.length - 1];
  if (last.date <= start.date) return null;
  return (last.close / start.close - 1) * 100;
}

/**
 * 같은 테마 대표 종목 비교. 두 가지를 함께 낸다:
 *  - peers/avgDd: 각 종목의 '현재 낙폭'(자기 고점 대비) — 테마 안 회복력 순위.
 *  - sincePeakAvg: '이 종목의 고점 이후' 같은 기간 대표 종목들의 평균 수익률 — 원인 분해용.
 * 자기 종목은 이미 계산한 currentDd 를 재사용하고, 나머지 피어만 병렬 조회한다.
 * 어느 테마에도 없으면 null(테마 카드를 띄우지 않는다).
 */
async function buildThemeComparison(
  name: string,
  selfCode: string,
  market: string | null,
  years: number,
  selfDd: number,
  athDate: string,
): Promise<ThemeFetch> {
  if (!name) return NO_THEME;
  const matched = themesForName(name);
  if (matched.length === 0) return NO_THEME;
  const themeName = matched[0]; // 여러 테마에 걸치면 첫 번째(사전 순서 = 대표성 순서)
  // **앞에서부터 잘라 쓴다**(미국 쪽과 같다). 이 화면은 "○○ 대표 N종목"이지 업종
  // 통계가 아니다. 사전이 카더라 쪽 필요로 366종목까지 넓어져 반도체만 55종목이라,
  // 전부 데려오면 카드의 성격이 바뀐다. 앞쪽은 넓히기 전 대형주 순서 그대로다.
  const memberNames = THEMES[themeName].filter((n) => n !== name).slice(0, MDD_PEER_MAX);

  // 대표 종목의 코드·시장을 stocks(공개 read)에서 한 번에 받는다. 이름은 KRX 정식명과
  // 정확히 일치한다(사전이 그 전제로 큐레이션돼 있다). 최대 10개라 1000행 캡과 무관.
  let members: { code: string; name: string; market: string | null }[] = [];
  // 명단 조회가 깨지면 대표 종목이 0 이 된다 — "테마를 찾지 못했다"가 아니라 "못 불러왔다"다(아래 partial).
  let lookupFailed = false;
  try {
    const { data, error } = await getSupabaseServer()
      .from("stocks")
      .select("code, name, market")
      .in("name", memberNames);
    if (error) throw error;
    members = data ?? [];
  } catch {
    members = [];
    lookupFailed = true;
  }

  const fetched = await Promise.all(
    members.map(async (m) => {
      const bars = await fetchDailyHistory(yahooSymbol(m.code, m.market), years);
      if (!bars) return null;
      const ds = drawdownSeries(bars);
      return { name: m.name, code: m.code, market: m.market, dd: ds[ds.length - 1].dd, sincePeak: returnSince(bars, athDate) };
    }),
  );

  const ok = fetched.filter((p): p is NonNullable<typeof p> => p !== null);
  const counts = { requested: members.length, ok: ok.length, lookupFailed };
  const peers: Peer[] = ok.map((p) => ({ name: p.name, code: p.code, market: p.market, dd: p.dd, isSelf: false }));
  peers.push({ name, code: selfCode, market, dd: selfDd, isSelf: true });
  peers.sort((a, b) => a.dd - b.dd); // 깊게 빠진 순

  // 자기 종목만 남으면(피어를 하나도 못 받음) 비교의 의미가 없다.
  if (peers.length < 2) return { theme: null, ...counts };

  const avgDd = peers.reduce((s, p) => s + p.dd, 0) / peers.length;
  const sinceVals = ok.map((p) => p.sincePeak).filter((v): v is number => v !== null);
  const sincePeakAvg = sinceVals.length ? sinceVals.reduce((s, v) => s + v, 0) / sinceVals.length : null;

  return { theme: { name: themeName, peers, avgDd, sincePeakAvg, href: THEME_SLUGS[themeName] ? themeHref(themeName) : null }, ...counts };
}
