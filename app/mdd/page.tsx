import type { Metadata } from "next";

import { getSupabaseServer } from "@/lib/supabase-server";
import { getSurgingStocks, getTopStocksWithTrend } from "@/lib/telegram-data";
import { MDD_CARD } from "../og-copy";
import { pageMetadata } from "../seo";
import { MddExplorer, type StockOption, type SuggestGroups } from "./MddExplorer";

// 미리보기 이미지는 옆의 opengraph-image.tsx 가 그린다(ownImage). 자세한 건 app/seo.ts 주석 참고.
export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata({
    title: "MDD 정밀분석 | hatzze",
    description:
      "내 종목은 고점에서 얼마나 내려왔습니까. 이만큼 빠졌던 적이 과거에 몇 번이었는지, 회복까지 얼마나 걸렸는지 함께 봅니다.",
    path: "/mdd",
    ownImage: MDD_CARD.alt,
  });
}

export const dynamic = "force-dynamic";

/**
 * MDD 분석 페이지. 검색용 종목 목록(코스피)만 서버가 실어 내려주고, 실제 낙폭
 * 계산은 클라이언트가 /api/mdd 를 호출해 받는다(상단 티커와 같은 온디맨드 방식).
 *
 * 코스피만 싣는 이유: (1) 첫 화면은 코스피부터 노출하기로 했고, (2) 코스닥은
 * 감자·합병·상폐가 잦아 수정주가 함정 검증을 한 번 더 하고 열기로 해서다.
 * 944행이라 PostgREST 1000행 캡 아래다. /api/mdd 자체는 코스닥 코드도 처리한다
 * (테마 비교의 코스닥 대표 종목은 그 경로로 이미 들어온다).
 */
async function loadKospiStocks(): Promise<StockOption[]> {
  try {
    const { data } = await getSupabaseServer()
      .from("stocks")
      .select("code, name, market")
      .eq("market", "KOSPI")
      .order("name", { ascending: true });
    return (data ?? []) as StockOption[];
  } catch {
    return [];
  }
}

/**
 * URL 파라미터로 특정 종목을 지정할 수 있다 — 카더라 리포트의 '급부상 종목'·'주요 종목
 * 리포트' 카드가 이 링크로 해당 종목 MDD 를 연다. URL 은 code·market 만 실어 깔끔하게
 * 두고(예: /mdd?code=058610&market=KOSDAQ), 이름은 여기서 code 로 stocks 에서 찾는다.
 * code 형식이 틀리면 null(기본 종목으로 연다).
 */
async function resolveInitial(sp: Record<string, string | string[] | undefined>): Promise<StockOption | null> {
  const code = typeof sp.code === "string" ? sp.code.trim() : "";
  if (!/^[0-9A-Z]{6}$/.test(code)) return null;
  const marketParam = sp.market === "KOSDAQ" ? "KOSDAQ" : sp.market === "KOSPI" ? "KOSPI" : null;

  // 이름을 code 로 조회한다. stocks 에 없으면(상폐·외국주 등) 이름 자리에 code 를 쓰고
  // market 은 URL 값을 그대로 믿는다 — 심볼(.KS/.KQ)만 맞으면 낙폭은 계산된다.
  let name = code;
  let market = marketParam;
  try {
    const { data } = await getSupabaseServer()
      .from("stocks")
      .select("name, market")
      .eq("code", code)
      .maybeSingle();
    if (data) {
      name = (data.name as string) ?? code;
      market = marketParam ?? ((data.market as string) ?? null);
    }
  } catch {
    // 조회 실패 시 위 기본값(code·URL market)으로 진행
  }
  return { code, name, market };
}

/**
 * 검색창을 눌렀을 때(아직 아무것도 안 쳤을 때) 띄울 추천 종목.
 * 카더라 리포트의 '급부상 종목'·'주요 종목 리포트'를 그대로 가져온다 — 빈 검색창에
 * 채울 거리로 인기 순위를 새로 만들 이유가 없다. 이미 매일 계산해 두는 두 목록이
 * "지금 사람들이 무슨 종목을 말하고 있나"라는 같은 질문의 답이다.
 *
 * 이름·시장은 카더라 쪽 값을 쓰지 않고 stocks 테이블에서 다시 읽는다. 두 가지를 얻는다:
 *  (1) 표기가 MDD 의 나머지(검색 목록·제목)와 어긋나지 않는다.
 *  (2) stocks 에 없는 코드(상폐·외국주)가 자연히 걸러진다 — 어차피 낙폭을 못 그린다.
 *
 * 코스닥이 섞여 들어오는 건 의도한 것이다. 검색 '목록'은 코스피만 싣지만(위 주석),
 * 낙폭 계산 자체는 /api/mdd 가 코스닥도 처리하고, 카더라 카드가 이미 같은 경로로
 * 코스닥 종목을 열고 있다. 텔레그램 대화는 코스닥 비중이 커서, 코스피로 걸러 버리면
 * 추천이 몇 개 남지 않는다.
 */
async function loadSuggestions(): Promise<SuggestGroups> {
  const empty: SuggestGroups = { surging: [], report: [] };
  try {
    const [surging, report] = await Promise.all([getSurgingStocks(5), getTopStocksWithTrend(5)]);
    const codes = [...new Set([...surging.map((s) => s.code), ...report.map((s) => s.code)])];
    if (!codes.length) return empty;

    // 코드가 최대 10개 남짓이라 .in() 목록 길이 걱정은 없다(PostgREST 캡은 훨씬 위).
    const { data } = await getSupabaseServer().from("stocks").select("code, name, market").in("code", codes);
    const known = new Map((data ?? []).map((r) => [r.code as string, r as StockOption]));

    const pick = (code: string, note: string) => {
      const s = known.get(code);
      return s ? { ...s, note } : null;
    };
    return {
      surging: surging
        .map((s) => pick(s.code, s.isNew ? "신규 등장" : `평소 ${s.ratio.toFixed(1)}배`))
        .filter((s): s is NonNullable<typeof s> => s !== null),
      report: report
        .map((s) => pick(s.code, `${s.mentions.toLocaleString()}회 언급`))
        .filter((s): s is NonNullable<typeof s> => s !== null),
    };
  } catch {
    // 추천은 곁다리다. 텔레그램 쪽이 비어도 검색 자체는 그대로 동작해야 한다.
    return empty;
  }
}

export default async function MddPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const [stocks, initial, suggestions] = await Promise.all([
    loadKospiStocks(),
    resolveInitial(sp),
    loadSuggestions(),
  ]);
  // key 로 초기 종목이 바뀌면 리마운트 — /mdd?code=A → ?code=B 로 이동해도 반영된다.
  return <MddExplorer key={initial?.code ?? "default"} stocks={stocks} initial={initial} suggestions={suggestions} />;
}
