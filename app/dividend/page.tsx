import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getDividendData, getTrends, type DividendStock } from "@/lib/dividend";

import { pageMetadata } from "../seo";
import { DIVIDEND_PUBLIC } from "../screen-flags";
import { DIVIDEND_PAGE } from "./copy";
import { DividendCalculator } from "./DividendCalculator";
import type { BrowseLists, StockLite } from "./types";

/**
 * 배당으로 살기(/dividend) — 종목과 주수를 넣으면 1년에 얼마 받는지, 어느 달에 들어오는지 바로 계산한다.
 * 성향별 바스켓(꾸준함·지금 수익률·성장)은 규칙으로 걸러 그대로 담을 수 있다.
 *
 * 자료는 `kr_dividend_stock` 한 표(lib/dividend.ts). 파이프라인이 매일 예탁결제원 배당
 * 기록과 KRX 전일 종가로 종목 한 줄씩 접어 둔 것이다. 계산은 전부 브라우저에서 한다 —
 * 종목 하나를 더할 때마다 서버를 부르지 않는다. 그래서 상장 종목 전부를 줄여서(types.ts)
 * 한 번에 내려보낸다.
 */

/**
 * ⛔ **아직 안 연 화면이다.** 스위치는 `app/screen-flags.ts` 한 곳에 있다 — 사이드바·푸터·
 * 사이트맵이 같은 값을 읽으므로 여는 날 고칠 곳이 흩어지지 않는다.
 */
const PUBLIC = DIVIDEND_PUBLIC;

/** 배포된 곳인가. Vercel 에서만 `VERCEL_ENV` 가 있고 로컬에는 없다 — 로컬에서는 PUBLIC 이
 *  false 여도 그대로 보인다(만드는 중에 봐야 하니까). */
const DEPLOYED = Boolean(process.env.VERCEL_ENV);

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  // ⚠️ await 를 빼지 말 것 — robots 를 얹으려고 펼친다(app/preview/page.tsx 의 같은 자리 주석).
  const meta = await pageMetadata({
    title: `${DIVIDEND_PAGE.label} | hatzze`,
    description: DIVIDEND_PAGE.description,
    path: DIVIDEND_PAGE.href,
  });
  return PUBLIC ? meta : { ...meta, robots: { index: false, follow: false } };
}

const MONTH = (iso: string) => Number(iso.slice(5, 7));

function toLite(s: DividendStock): StockLite {
  return {
    code: s.code,
    name: s.name,
    market: s.market,
    kind: s.kind,
    asOf: s.asOf,
    currency: s.currency,
    alias: s.alias,
    close: s.close,
    cap: Math.round((s.marketCap ?? 0) / 1e8),
    dps: s.dps,
    yieldPct: s.yieldPct,
    unusual: s.unusual,
    estimated: s.estimated,
    // 지급일이 없는 건(아직 안 정해진 미래분)은 달을 모르니 달력에서 뺀다. 합(dps)에는 든다.
    pays: s.payments.filter((p) => p.pay).map((p) => [MONTH(p.pay as string), p.amount]),
    streak: s.streak,
    growth5: s.growth5,
    nextRecord: s.nextRecord,
    nextPay: s.nextPay ? [s.nextPay.date, s.nextPay.amount] : null,
  };
}

/** 검색창을 비워 둔 채로도 담을 수 있게 앞에 세워 두는 것 — 판마다 여덟. */
const POPULAR = 8;
/** 칩에 세우려면 이 정도는 줘야 한다(수익률 %). 언급이 많아도 배당이 시늉이면 이 화면의 칩이 아니다. */
const CHIP_MIN_YIELD_KR = 2;
const CHIP_MIN_YIELD_US = 1.5;
const CHIP_MIN_CAP = 3_000e8;
/** 미국 ETF 는 자료가 없어 손으로 적은 순서(config/etf_dividends.py 의 33개 전부). 서학개미가 배당·월분배로
 *  가장 많이 드는 것부터 — 칩은 앞에서 자르고, '전체 보기'는 이 순서 그대로 선다. */
const US_ETF_ORDER = [
  "SCHD", "JEPI", "JEPQ", "QYLD", "MSTY", "TSLY", "VYM", "DIVO",
  "XYLD", "RYLD", "VIG", "DGRO", "HDV", "DVY", "SPYD", "SPHD", "SCHY", "VYMI", "NOBL", "SDY", "DGRW", "FDVV",
  "VNQ", "PFF", "TLT", "BND", "SGOV", "VOO", "VTI", "QQQ", "SPY", "NVDY", "CONY",
];

export default async function DividendPage() {
  if (!PUBLIC && DEPLOYED) notFound();

  const [data, trends] = await Promise.all([getDividendData(), getTrends()]);
  const stocks = data?.stocks ?? [];
  const byMentions = (m: Map<string, number>) => (a: DividendStock, b: DividendStock) =>
    (m.get(b.code) ?? 0) - (m.get(a.code) ?? 0) || (b.marketCap ?? 0) - (a.marketCap ?? 0) || (b.yieldPct ?? 0) - (a.yieldPct ?? 0);
  // 국장 — 배당을 실제로 주는 큰 회사 중 요즘 채널에서 많이 오르내린 순.
  const popular = stocks
    .filter((s) => s.kind === "stock" && s.currency === "KRW" && (s.yieldPct ?? 0) >= CHIP_MIN_YIELD_KR && (s.marketCap ?? 0) >= CHIP_MIN_CAP && !s.unusual && !s.name.includes("스팩"))
    .sort(byMentions(trends.krMentions))
    .slice(0, POPULAR)
    .map((s) => s.code);
  // 미장 — 같은 잣대. 시가총액이 없어 언급 수가 같으면 수익률 순.
  const popularUs = stocks
    .filter((s) => s.kind === "stock" && s.currency === "USD" && (s.yieldPct ?? 0) >= CHIP_MIN_YIELD_US && s.payments.length > 0)
    .sort(byMentions(trends.usMentions))
    .slice(0, POPULAR)
    .map((s) => s.code);
  // ETF — 국내는 최근 30일 돈이 들어온 순(설정·환매, seohak_etf_daily 에 있는 것만), 미국은 손으로 적은 순. 넷씩.
  const etfs = stocks.filter((s) => s.kind === "etf");
  // 돈이 몰려도 분배가 시늉이면(S&P500·나스닥100 지수 ETF 0.5%) 이 화면의 칩이 아니다 — 국장과 같은 문턱.
  const krEtf = etfs
    .filter((s) => s.currency === "KRW" && trends.etfFlow.has(s.code) && (s.yieldPct ?? 0) >= CHIP_MIN_YIELD_KR)
    .sort((a, b) => (trends.etfFlow.get(b.code) ?? 0) - (trends.etfFlow.get(a.code) ?? 0))
    .slice(0, POPULAR / 2)
    .map((s) => s.code);
  const haveEtf = new Set(etfs.map((s) => s.code));
  const usEtf = US_ETF_ORDER.filter((c) => haveEtf.has(c));
  const popularEtf = [...usEtf.slice(0, POPULAR - krEtf.length), ...krEtf];

  // '전체 보기' — 판마다 배당이 있는 종목 전부를 칩과 같은 잣대로 세운다(칩은 문턱을 넘은 여덟, 여기는 다).
  // 다만 배당이 시늉인 종목(수익률이 칩 문턱 미만 — 삼성전자 0.6%·SK하이닉스 0.2%)은 언급이 많아도 뒤로
  // 보낸다. 요즘순 그대로 두면 배당 화면의 첫 줄이 카더라 순위가 된다(2026-09-12 실측). 시총순으로 바꾸면 앞에 온다.
  const byName = (a: DividendStock, b: DividendStock) => a.name.localeCompare(b.name, "ko");
  const dividendFirst = (minYield: number, m: Map<string, number>) => (a: DividendStock, b: DividendStock) =>
    Number((b.yieldPct ?? 0) >= minYield) - Number((a.yieldPct ?? 0) >= minYield) || byMentions(m)(a, b);
  const browseKr = stocks
    .filter((s) => s.kind === "stock" && s.currency === "KRW" && s.dps > 0 && !s.name.includes("스팩"))
    .sort(dividendFirst(CHIP_MIN_YIELD_KR, trends.krMentions))
    .map((s) => s.code);
  const browseUs = stocks
    .filter((s) => s.kind === "stock" && s.currency === "USD" && s.dps > 0)
    .sort(dividendFirst(CHIP_MIN_YIELD_US, trends.usMentions))
    .map((s) => s.code);
  // ETF — 미국 손순서와 국내 유입순(칩과 같이 수익률 2% 이상만)을 하나씩 번갈아(SCHD · TIGER … · JEPI · TIGER …).
  // 나머지(유입 자료가 없는 국내 ETF — seohak_etf_daily 는 해외 투자 ETF 만 있다 — 와 분배가 시늉인 것)는
  // 분배가 있는 쪽을 앞에, 이름순으로 뒤에.
  const krEtfByFlow = etfs
    .filter((s) => s.currency === "KRW" && trends.etfFlow.has(s.code) && (s.yieldPct ?? 0) >= CHIP_MIN_YIELD_KR)
    .sort((a, b) => (trends.etfFlow.get(b.code) ?? 0) - (trends.etfFlow.get(a.code) ?? 0))
    .map((s) => s.code);
  const zipped: string[] = [];
  for (let i = 0; i < Math.max(usEtf.length, krEtfByFlow.length); i++) {
    if (usEtf[i]) zipped.push(usEtf[i]);
    if (krEtfByFlow[i]) zipped.push(krEtfByFlow[i]);
  }
  const placed = new Set(zipped);
  const restEtf = etfs
    .filter((s) => !placed.has(s.code) && s.dps > 0)
    .sort((a, b) => Number((b.yieldPct ?? 0) >= CHIP_MIN_YIELD_KR) - Number((a.yieldPct ?? 0) >= CHIP_MIN_YIELD_KR) || byName(a, b));
  const browseEtf = [...zipped, ...restEtf.map((s) => s.code)];
  const browse: BrowseLists = { kr: browseKr, us: browseUs, etf: browseEtf };

  return (
    <DividendCalculator
      stocks={stocks.map(toLite)}
      baskets={data?.baskets ?? []}
      popular={popular}
      popularUs={popularUs}
      popularEtf={popularEtf}
      browse={browse}
      computedFor={data?.computedFor ?? null}
      priceDate={data?.priceDate ?? null}
      usPriceDate={data?.usPriceDate ?? null}
      usdkrw={data?.usdkrw ?? null}
    />
  );
}
