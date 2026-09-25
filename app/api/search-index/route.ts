import { listIndexableStocks } from "@/lib/stock-page";

/**
 * ⌘K 검색(components/command-menu.tsx)이 여는 순간 한 번 받는 종목 목록.
 *
 * 왜 따로 받나. 목록을 화면 HTML 에 같이 실으면 모든 방문이 이걸 받는다 — 배당 화면이 종목 4,366개를
 * 통째로 실어 gzip 219KB 가 된 것과 같은 자리다. 검색을 여는 사람만 받게 여기로 뺐다.
 *
 * 목록은 사이트맵(app/sitemap-stocks.xml)과 같은 기준이다 — 최근 언급이 충분해 종목 화면이 있는 국내 종목.
 * 한 시간마다 새로 만든다(목록이 하루 두 번 파이프라인에서만 바뀐다).
 */
export const revalidate = 3600;

export async function GET() {
  const stocks = await listIndexableStocks();
  if (stocks === null) {
    return Response.json({ stocks: [] }, { status: 503 });
  }
  return Response.json({
    stocks: stocks.map((s) => ({ code: s.code, name: s.name, market: s.market })),
  });
}
