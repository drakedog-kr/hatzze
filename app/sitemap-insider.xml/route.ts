import { SITE_URL } from "../brand";
import { insiderSitemapXml } from "@/lib/insider-sitemap";
import { getSupabaseAdmin } from "@/lib/supabase-server";

/**
 * `/sitemap-insider.xml` — 내부자 리포트 상세 한 벌. 미장 종목(`/insider/stock/NVDA`)과 월가 투자자
 * (`/insider/investor/1067983`)다.
 *
 * ## 왜 따로 내나
 *
 * 국장 종목 실주소(`/sitemap-stocks.xml`)와 같은 까닭이다 — DB 를 읽는 목록을 코드에 박힌 두 사이트맵에
 * 얹으면 조회가 실패한 날 그 둘까지 같이 죽는다. 이게 죽어도 나머지는 산다(app/sitemap-stocks.xml/route.ts 머리말).
 *
 * ## 무엇을 싣나
 *
 *   종목    미장 사전 `us_stocks` 전부(약 200). ⌘K 검색이 미장 종목으로 보내는 목록과 같다(app/api/search-index).
 *           화면의 색인 문턱도 같은 잣대다 — 사전 밖 종목은 noindex(app/insider/stock/[ticker]/detail.tsx).
 *   투자자  추적 명단 `us_manager` 중 13F 를 낸 곳(약 60).
 *
 * 2026-08-26 에 열린 뒤로 이 두 갈래는 화면 안 링크로만 닿았다(sitemap-urls.ts 의 '아직 없다' 주석).
 *
 * ## ⛔ 못 읽었으면 빈 사이트맵을 내지 않는다
 *
 * 빈 `<urlset>` 은 "실을 게 없습니다"라는 뜻이 분명한 답이라, 조회가 실패한 날 내보내면 구글은 화면이 사라졌다고
 * 읽는다. 500 을 낸다 — 크롤러는 500 을 보면 다음에 다시 온다(국장 사이트맵과 같은 규칙).
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const db = getSupabaseAdmin();
  const [stocks, managers, latest] = await Promise.all([
    // 사전은 200행 남짓이라 한 번에 받는다(1,000행 캡 아래 · app/api/search-index 와 같다).
    db.from("us_stocks").select("ticker"),
    db.from("us_manager").select("cik,report_date"),
    // 종목 화면의 언급 추이 끝점과 같은 날 — 이 표 전체의 가장 최근 날(lib/insider-detail.ts latestMention).
    db.from("telegram_us_stock_daily").select("date").order("date", { ascending: false }).limit(1),
  ]);

  if (stocks.error || managers.error || !stocks.data?.length) {
    console.error("[sitemap-insider] 목록을 못 만들었습니다 — 빈 사이트맵 대신 500 을 냅니다", stocks.error ?? managers.error);
    return new Response("내부자 리포트 상세 목록을 읽지 못했습니다.\n", {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  // 수정일만 못 읽은 것은 목록을 버릴 까닭이 아니다. 벽시계로 채우지 않고 태그를 뺀다 — 안 바뀐 날에
  // "방금 바뀌었다"고 말하게 된다(usKaderaBaseDate 가 실패하면 오늘로 물러나는 것을 여기서 안 쓰는 이유).
  if (latest.error) console.error("[sitemap-insider] 언급 기준일을 못 읽었습니다 — lastmod 를 뺍니다", latest.error);

  const body = insiderSitemapXml({
    site: SITE_URL,
    tickers: stocks.data.map((r) => r.ticker as string),
    investors: (managers.data ?? []).map((m) => ({ cik: Number(m.cik), reportDate: (m.report_date as string | null) ?? null })),
    stockLastmod: (latest.data?.[0]?.date as string | undefined) ?? null,
  });

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      // 하루 두 번 바뀌는 목록이다. 국장 사이트맵과 같이 잠깐은 재사용하게 둔다.
      "Cache-Control": "public, max-age=600, must-revalidate",
    },
  });
}
