import type { Metadata } from "next";

import { PRICE_RANGE_DEFAULT } from "@/lib/insider-range";

import { StockDetailBody, stockDetailMetadata } from "./detail";

/**
 * 미장 종목 상세의 **기본 주소**(`/insider/stock/NVDA`) — 기본 기간(6개월) 차트다.
 * 본문과 메타데이터는 ./detail.tsx 에 있고, 다른 기간(`/insider/stock/NVDA/1y`)은 ./[range]/page.tsx 가 같은 것을 부른다.
 */
// 캐시 주기는 루트 레이아웃의 `revalidate` 가 정한다(app/layout.tsx). 예전엔 여기가 force-dynamic 이었다 —
// 기간을 `?p=` 로 받아 searchParams 를 읽었고, 그러면 사본에 못 담긴다. 기간을 경로로 옮기고(lib/insider-range.ts)
// 사본으로 돌렸다. 시세·일봉 fetch 가 더 짧은 주기를 가지면 그게 이 라우트의 주기가 된다(Next 문서).
//
// 동적 구간([...])은 generateStaticParams 가 없으면 캐시 없이 요청마다 그린다(Next 문서:
// "빈 배열을 돌려줘야 런타임에 ISR 이 된다"). 빈 배열 = 빌드 때는 아무것도 안 만들고,
// 처음 방문한 주소를 그때 그려 사본에 담는다. 없는 주소의 notFound() 도 그대로 동작한다.
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ ticker: string }> }): Promise<Metadata> {
  const { ticker } = await params;
  return stockDetailMetadata(ticker, PRICE_RANGE_DEFAULT);
}

export default async function StockDetailPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  return <StockDetailBody ticker={ticker} range={PRICE_RANGE_DEFAULT} />;
}
