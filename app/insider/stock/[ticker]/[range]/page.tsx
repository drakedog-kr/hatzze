import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ALT_RANGE_KEYS, type PriceRangeKey } from "@/lib/insider-range";

import { STOCK_NOT_FOUND_META, StockDetailBody, stockDetailMetadata } from "../detail";

/**
 * 미장 종목 상세의 **다른 기간**(`/insider/stock/NVDA/1y`). 기본 주소와 같은 화면이고 차트 창만 다르다.
 *
 * ⛔ 색인 대상이 아니다. canonical 은 기본 주소이고(stockDetailMetadata) 사이트맵에도 없다.
 * 옛 `?p=1y` 주소는 next.config.ts 의 리다이렉트가 여기로 넘긴다.
 */
// 기본 주소와 같다 — 빈 배열이라야 런타임 ISR 이 된다(../page.tsx 주석).
export async function generateStaticParams() {
  return [];
}

const altRange = (key: string): PriceRangeKey | null => ALT_RANGE_KEYS.find((k) => k === key) ?? null;

export async function generateMetadata({ params }: { params: Promise<{ ticker: string; range: string }> }): Promise<Metadata> {
  const { ticker, range } = await params;
  const r = altRange(range);
  return r ? stockDetailMetadata(ticker, r) : STOCK_NOT_FOUND_META;
}

export default async function StockRangePage({ params }: { params: Promise<{ ticker: string; range: string }> }) {
  const { ticker, range } = await params;
  // 기본 기간(`/…/6m`)은 여기 오지 않는다 — next.config.ts 가 기본 주소로 넘긴다. 여기서 permanentRedirect 를
  // 부르면 화면이 이미 흐르기 시작한 뒤라(app/insider/loading.tsx) 308 이 아니라 200 + meta refresh 가 나갔다.
  const r = altRange(range);
  if (!r) notFound();
  return <StockDetailBody ticker={ticker} range={r} />;
}
