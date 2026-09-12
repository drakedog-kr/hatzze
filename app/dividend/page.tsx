import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getDividendData, type DividendStock } from "@/lib/dividend";

import { pageMetadata } from "../seo";
import { DIVIDEND_PUBLIC } from "../screen-flags";
import { DIVIDEND_PAGE } from "./copy";
import { DividendCalculator } from "./DividendCalculator";
import type { StockLite } from "./types";

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
  };
}

/** 검색창을 비워 둔 채로도 담을 수 있게 앞에 세워 두는 종목 — 배당 주는 회사 중 큰 순. */
const POPULAR = 8;

export default async function DividendPage() {
  if (!PUBLIC && DEPLOYED) notFound();

  const data = await getDividendData();
  const stocks = data?.stocks ?? [];
  const popular = stocks
    .filter((s) => s.kind === "stock" && (s.yieldPct ?? 0) >= 1.5 && !s.unusual && !s.name.includes("스팩"))
    .sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0))
    .slice(0, POPULAR)
    .map((s) => s.code);
  // ETF 칩 — 많이 찾는 순서로 손으로 적는다(표는 코드순이라 그대로 쓰면 데일리커버드콜이 맨 앞에 선다).
  // 표에 없는 코드는 조용히 빠진다.
  const have = new Set(stocks.filter((s) => s.kind === "etf").map((s) => s.code));
  const popularEtf = ["SCHD", "JEPI", "JEPQ", "QYLD", "XYLD", "458730", "441680", "329200"].filter((c) => have.has(c));

  return (
    <DividendCalculator
      stocks={stocks.map(toLite)}
      baskets={data?.baskets ?? []}
      popular={popular}
      popularEtf={popularEtf}
      computedFor={data?.computedFor ?? null}
      priceDate={data?.priceDate ?? null}
      usPriceDate={data?.usPriceDate ?? null}
      usdkrw={data?.usdkrw ?? null}
    />
  );
}
