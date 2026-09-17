import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getDividendData, getTrends, type DividendStock } from "@/lib/dividend";

import { pageMetadata } from "../seo";
import { DIVIDEND_PUBLIC } from "../screen-flags";
import { DIVIDEND_PAGE } from "./copy";
import { DividendCalculator } from "./DividendCalculator";
import type { MoreLists, MoreRow, StockLite } from "./types";

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
const DAY = (iso: string) => Number(iso.slice(8, 10));

/** 상장 인프라 펀드(맥쿼리인프라·KIND 인프라) — lib/dividend.ts 의 KR_INFRA 와 같은 둘. 리츠처럼 IRP 에 담긴다. */
const KR_INFRA_CODES = new Set(["088980", "415640"]);

function toLite(s: DividendStock): StockLite {
  return {
    code: s.code,
    name: s.name,
    market: s.market,
    kind: s.kind,
    reit: s.isReit || KR_INFRA_CODES.has(s.code),
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
    pays: s.payments.filter((p) => p.pay).map((p) => [MONTH(p.pay as string), p.amount, DAY(p.pay as string)]),
    streak: s.streak,
    growth5: s.growth5,
    nextRecord: s.nextRecord,
    nextPay: s.nextPay ? [s.nextPay.date, s.nextPay.amount] : null,
    taxable: s.taxable,
    taxFreeNote: s.taxFreeNote,
    highDiv: s.highDiv ? [s.highDiv.year, s.highDiv.payoutPct] : null,
    payout: s.payout ? [s.payout.year, s.payout.pct] : null,
    growthYears: s.growthYears,
    discount: s.prefDiscountPct,
  };
}

/** 검색창을 비워 둔 채로도 담을 수 있게 앞에 세워 두는 것 — 판마다 여덟. */
const POPULAR = 8;
/** 칩에 세우려면 이 정도는 줘야 한다(수익률 %). 언급이 많아도 배당이 시늉이면 이 화면의 칩이 아니다. */
const CHIP_MIN_YIELD_KR = 2;
const CHIP_MIN_YIELD_US = 1.5;
const CHIP_MIN_CAP = 3_000e8;
/** 미국 ETF 는 자료가 없어 손으로 적은 순서. 서학개미가 배당·월분배로 가장 많이 드는 것부터. 칩은 앞에서 자른다. */
const US_ETF_ORDER = ["SCHD", "JEPI", "JEPQ", "QYLD", "MSTY", "TSLY", "VYM", "DIVO"];
/* '더 보기' 묶음의 미국 ETF — config/etf_dividends.py 의 48개를 성격으로 가른 것. 순서가 곧 서는 순서다.
   커버드콜은 월분배(JP모건·글로벌X·NEOS·골드만·REX) 다음에 주분배(라운드힐 0DTE)·일드맥스. 지수 ETF(VOO·IVV·QQQ·QQQM…)는
   묶음에 안 세운다 — 배당 화면의 줄이 아니라 검색으로만. */
const US_ETF_COVERED = ["JEPI", "JEPQ", "QYLD", "XYLD", "RYLD", "DIVO", "QDVO", "IDVO", "QQQI", "SPYI", "IWMI", "GPIX", "GPIQ", "FEPI", "AIPI", "XPAY", "XDTE", "QDTE", "RDTE", "SDTY", "QDTY", "RDTY", "MAGY", "YBTC", "YETH", "MSTY", "TSLY", "NVDY", "CONY", "PLTY", "CHPY", "LFGY", "GPTY", "BIGY", "FIAT", "AMZY", "APLY", "GOOY", "MSFO", "NFLY", "YMAX", "YMAG", "ULTY"];
const US_ETF_DIVIDEND = ["SCHD", "VYM", "VIG", "DGRO", "HDV", "DVY", "SPYD", "SPHD", "SCHY", "VYMI", "NOBL", "SDY", "DGRW", "FDVV", "YYY"];
const US_ETF_BOND = ["SGOV", "TLT", "BND", "WEEK"];
const US_ETF_REIT = ["VNQ"];
/** 리츠가 아니지만 같은 자리에 서는 인프라 펀드 — 맥쿼리인프라·KB발해인프라. 이름의 '인프라'로 걸면 NICE인프라·바이오인프라가 딸려 온다. */
const KR_INFRA = new Set(["088980", "415640"]);
/** 묶음 하나에 칩 여덟까지. 둘도 못 채우는 묶음은 안 세운다. */
const ROW = 8;

/**
 * 묶음들을 순서대로 채운다. `exclude`(그 판의 칩)와 앞 묶음에 든 종목은 건너뛴다 — 한 판에 같은 종목이
 * 두 번 서지 않게. 그래서 묶음의 순서가 뜻을 가진다: 좁은 묶음(리츠·우선주)을 먼저 두어야 넓은 묶음
 * (큰 회사부터)이 그것들을 먼저 집어가지 않는다.
 */
function fillRows(specs: { label: string; pick: DividendStock[] }[], exclude: Iterable<string>): MoreRow[] {
  const used = new Set(exclude);
  const out: MoreRow[] = [];
  for (const sp of specs) {
    const codes: string[] = [];
    for (const s of sp.pick) {
      if (used.has(s.code)) continue;
      used.add(s.code);
      codes.push(s.code);
      if (codes.length === ROW) break;
    }
    if (codes.length >= 2) out.push({ label: sp.label, codes });
  }
  return out;
}

/** 미국 손순서와 국내 목록을 하나씩 번갈아 — 한 묶음이 미국 ETF 로만 차지 않게. */
function zip(us: DividendStock[], kr: DividendStock[]): DividendStock[] {
  const out: DividendStock[] = [];
  for (let i = 0; i < Math.max(us.length, kr.length); i++) {
    if (us[i]) out.push(us[i]);
    if (kr[i]) out.push(kr[i]);
  }
  return out;
}

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
  // ETF — 칩은 미국 ETF 여덟(손으로 적은 순). 국내 ETF 는 '더 보기' 첫 줄에 돈이 들어온 순으로(2026-09-13 지적:
  // 칩에 섞여 있던 TIGER 셋을 더 보기로). 돈이 몰려도 분배가 시늉이면(지수 ETF 0.5%) 안 세운다 — 국장과 같은 문턱.
  const etfs = stocks.filter((s) => s.kind === "etf");
  const haveEtf = new Set(etfs.map((s) => s.code));
  const popularEtf = US_ETF_ORDER.filter((c) => haveEtf.has(c)).slice(0, POPULAR);
  const krEtfByFlow = etfs
    .filter((s) => s.currency === "KRW" && trends.etfFlow.has(s.code) && (s.yieldPct ?? 0) >= CHIP_MIN_YIELD_KR)
    .sort((a, b) => (trends.etfFlow.get(b.code) ?? 0) - (trends.etfFlow.get(a.code) ?? 0));

  /* ── '더 보기' 묶음 ─────────────────────────────────────────────────
     칩 여덟 다음이 곧장 검색창이면 "이게 다야?"가 된다(2026-09-12). 그렇다고 1,359종목을 목록으로 펼치면
     훑을 수가 없다(같은 날 지적). 그 사이 — 판마다 성격으로 묶은 줄 서너 개, 줄마다 여덟. 바스켓(꾸준함·
     지금 수익률·성장)과 겹치는 규칙은 안 둔다. 규칙은 전부 여기 적혀 있고 추천이 아니라 분류다. */
  const byCap = (a: DividendStock, b: DividendStock) => (b.marketCap ?? 0) - (a.marketCap ?? 0);
  const byYield = (a: DividendStock, b: DividendStock) => (b.yieldPct ?? 0) - (a.yieldPct ?? 0);
  const isPref = (s: DividendStock) => s.shareKind != null && s.shareKind !== "보통주";
  const isReit = (s: DividendStock) => s.isReit || KR_INFRA.has(s.code);
  const kr = stocks.filter((s) => s.kind === "stock" && s.currency === "KRW" && s.dps > 0 && !s.unusual && !s.name.includes("스팩"));
  const moreKr = fillRows(
    [
      // 리츠·인프라 — 청산·특별분배로 수익률이 30% 를 넘는 건(코람코더원리츠 388%) 뺀다. 큰 것부터.
      { label: "리츠·인프라", pick: kr.filter((s) => isReit(s) && (s.yieldPct ?? 0) <= 30).sort(byCap) },
      // 우선주 — 1,000억은 돼야 거래가 있다. 수익률 순(우선주를 찾는 까닭이 그것이라).
      { label: "우선주", pick: kr.filter((s) => isPref(s) && (s.marketCap ?? 0) >= 1_000e8 && (s.yieldPct ?? 0) >= CHIP_MIN_YIELD_KR).sort(byYield) },
      // 큰 회사부터 — 칩과 같은 문턱(수익률 2%·시총 3,000억)을 시총 순으로. 칩에 선 것은 빠지니 KB금융·신한지주부터.
      { label: "큰 회사부터", pick: kr.filter((s) => !isPref(s) && !isReit(s) && (s.yieldPct ?? 0) >= CHIP_MIN_YIELD_KR && (s.marketCap ?? 0) >= CHIP_MIN_CAP).sort(byCap) },
    ],
    popular,
  );
  const us = stocks.filter((s) => s.kind === "stock" && s.currency === "USD" && s.dps > 0);
  const usTrend = byMentions(trends.usMentions);
  const moreUs = fillRows(
    [
      // 달마다 주는 — 지난 1년 지급 달이 열둘(리얼티인컴·메인스트리트·AGNC).
      { label: "달마다 주는", pick: us.filter((s) => new Set(s.payments.filter((p) => p.pay).map((p) => MONTH(p.pay as string))).size >= 12).sort(usTrend) },
      // 수익률 4% 넘는 — 10% 초과는 뺀다(mREIT·BDC 의 두 자릿수는 원금 위험이 섞인다). 언급 많은 순.
      { label: "수익률 4% 넘는", pick: us.filter((s) => (s.yieldPct ?? 0) >= 4 && (s.yieldPct ?? 0) <= 10).sort(usTrend) },
      // 오래 늘려 온 회사 — 해마다 배당을 늘린 햇수(stockanalysis Growth Years, 코카콜라 64) 순. 25년 넘게 늘린 곳을
      // 배당 귀족이라 부른다. 수익률은 칩 문턱(1.5%) — 마이크로소프트 0.7% 가 배당 줄 맨 앞에 서면 이 화면이 아니다.
      // 라벨은 무엇을 늘렸는지가 보여야 한다("오래 늘려 온 회사"는 뭘 늘렸는지 안 보였다, 2026-09-15 지적).
      { label: "배당 10년 넘게 늘린", pick: us.filter((s) => (s.growthYears ?? 0) >= 10 && (s.yieldPct ?? 0) >= CHIP_MIN_YIELD_US).sort((a, b) => (b.growthYears ?? 0) - (a.growthYears ?? 0) || usTrend(a, b)) },
    ],
    popularUs,
  );
  const etfByCode = new Map(etfs.map((s) => [s.code, s]));
  const usEtfs = (codes: string[]) => codes.map((c) => etfByCode.get(c)).filter((s): s is DividendStock => !!s);
  // 국내 ETF 는 돈이 들어온 순, 유입 자료가 없으면(국내 투자 ETF) 수익률 순.
  const krEtfs = (re: RegExp, not?: RegExp) =>
    etfs
      .filter((s) => s.currency === "KRW" && s.dps > 0 && re.test(s.name) && !(not && not.test(s.name)))
      .sort((a, b) => (trends.etfFlow.get(b.code) ?? 0) - (trends.etfFlow.get(a.code) ?? 0) || byYield(a, b));
  const moreEtf = fillRows(
    [
      // 국내 ETF — 최근 30일 설정·환매로 돈이 들어온 순(seohak_etf_daily 에 있는 해외 투자 ETF 만).
      { label: "국내 ETF", pick: krEtfByFlow },
      { label: "커버드콜", pick: zip(usEtfs(US_ETF_COVERED), krEtfs(/커버드콜/)) },
      { label: "리츠", pick: zip(usEtfs(US_ETF_REIT), krEtfs(/리츠|부동산/)) },
      // '혼합'(테슬라채권혼합·나스닥100채권혼합50)은 주식 반 채권 반이라 채권 줄이 아니다.
      { label: "채권·단기", pick: zip(usEtfs(US_ETF_BOND), krEtfs(/채권|국채|통안채|머니마켓|CD금리|KOFR/, /커버드콜|리츠|혼합/)) },
      { label: "배당 지수", pick: zip(usEtfs(US_ETF_DIVIDEND), krEtfs(/배당/, /커버드콜/)) },
    ],
    popularEtf,
  );
  const n = (v: number) => v.toLocaleString("ko-KR");
  const etfUs = etfs.filter((s) => s.currency === "USD").length;
  // 담기는 수는 묶음 후보(unusual 을 뺀 것)가 아니라 검색에 걸리는 전부 — 배당이 있는 종목 수.
  const krAll = stocks.filter((s) => s.kind === "stock" && s.currency === "KRW" && s.dps > 0 && !s.name.includes("스팩")).length;
  const more: MoreLists = {
    kr: { rows: moreKr, note: `코스피·코스닥에서 배당이 있는 ${n(krAll)}종목이 다 담깁니다.` },
    us: { rows: moreUs, note: `미국 배당주 ${n(us.length)}종목이 담깁니다.` },
    etf: { rows: moreEtf, note: `ETF ${n(etfs.length)}개(미국 ${etfUs} · 국내 ${n(etfs.length - etfUs)})가 담깁니다. 국내는 운용사를 가리지 않고 지난 1년 분배가 있는 전부입니다.` },
  };

  return (
    <DividendCalculator
      stocks={stocks.map(toLite)}
      baskets={data?.baskets ?? []}
      popular={popular}
      popularUs={popularUs}
      popularEtf={popularEtf}
      more={more}
      computedFor={data?.computedFor ?? null}
      priceDate={data?.priceDate ?? null}
      usPriceDate={data?.usPriceDate ?? null}
      usdkrw={data?.usdkrw ?? null}
    />
  );
}
