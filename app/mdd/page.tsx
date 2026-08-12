import type { Metadata } from "next";

import { getSupabaseServer } from "@/lib/supabase-server";
import { getSurgingStocks, getTopStocksWithTrend } from "@/lib/telegram-data";
import { getUsStockReports, getUsSurgingStocks } from "@/lib/us-telegram-data";
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
 * 미국 종목도 검색된다. 카더라 카드에서 링크로는 이미 열 수 있었는데(code+market=US)
 * **검색창으로는 찾을 수가 없었다** — 목록에 코스피만 실려 있어서다.
 *
 * code 자리에 티커가 들어간다. 국내 코드는 여섯 자리 숫자라 티커와 겹치지 않고,
 * /api/mdd 는 market 으로 갈라 야후 심볼·기준 지수·통화를 정한다.
 *
 * ⚠️ 검색 등급표(rankStockMatches)가 **코드 접두일치**를 이름 접두일치 다음으로 본다 —
 *    "NVDA" 를 치면 이름(엔비디아)이 아니라 티커로 걸린다. 미국 종목을 티커로 찾는 것이
 *    자연스러우므로 그대로 둔다. 한글 표기("엔비디아")로도 이름 접두일치로 걸린다.
 *
 * 178행이라 1,000행 캡과 무관하다.
 */
async function loadUsStocks(): Promise<StockOption[]> {
  try {
    const { data } = await getSupabaseServer()
      .from("us_stocks")
      .select("ticker, name_ko, name_en")
      .order("ticker", { ascending: true });
    return (data ?? []).map((r) => ({
      code: r.ticker as string,
      name: (r.name_ko as string) || (r.ticker as string),
      market: "US",
      // 정식 영문명은 **검색에만** 쓴다(화면 이름은 한글 표기 그대로). 원래 이름이
      // 영어인 회사를 한글로만 찾게 두면 "tesla" 가 아무것도 못 찾는다.
      alias: (r.name_en as string | null) ?? null,
    }));
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
  const isUs = sp.market === "US";

  // 미국은 티커 1~5자, 국내는 6자리다. api/mdd 의 검증과 같은 규칙이어야 한다 —
  // 여기만 통과시키면 화면은 열리는데 조회가 400 으로 죽는다.
  const codeOk = isUs ? /^[A-Z][A-Z.\-]{0,6}$/.test(code) : /^[0-9A-Z]{6}$/.test(code);
  if (!codeOk) return null;

  if (isUs) {
    // 미국 종목의 한글 표기는 us_stocks 가 갖고 있다(원본은 config/us_stock_extraction.py).
    let name = code;
    try {
      const { data } = await getSupabaseServer()
        .from("us_stocks")
        .select("name_ko")
        .eq("ticker", code)
        .maybeSingle();
      if (data?.name_ko) name = data.name_ko as string;
    } catch {
      // 조회 실패 시 티커를 이름 자리에 쓴다 — 심볼만 맞으면 낙폭은 계산된다.
    }
    return { code, name, market: "US" };
  }

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
/** 한 묶음의 줄 수와, 그중 미국 종목에 내주는 자리. */
const SUGGEST_ROWS = 5;
const SUGGEST_US_ROWS = 2;

/**
 * 검색어를 치기 전에 보여 주는 추천 두 묶음.
 *
 * ## 미국 종목은 **자리를 나눠** 넣는다 (섞지 않는다)
 *
 * 값으로 합쳐 상위 다섯을 고르면 급부상 묶음을 미장이 먹는다 — 실측(2026-08-12)으로
 * 상위 5줄 중 4줄이 미국이었다(버크셔 17배 vs 국내 최고 4.2배). 미국 사전이 178종목뿐이라
 * 분모가 작고, 그래서 '평소 대비 배수'가 구조적으로 크게 나온다. 두 시장의 배수는
 * 같은 잣대가 아니다.
 *
 * 주요 종목(언급 수)은 합쳐도 2:3 으로 갈려 괜찮지만, 한쪽만 섞으면 두 묶음이 서로 다른
 * 규칙으로 뽑히게 된다. 둘 다 자리를 나눈다.
 *
 * ⚠️ 줄 수는 그대로 5 다. 드롭다운은 지금 436px 이고 상한이 480px 이라 **한 줄만 더**
 *    들어간다(실측). 묶음을 늘리거나 줄을 늘리면 스크롤이 생기는데, 그 상한 자체가
 *    스크롤을 없애려고 420 → 480 으로 올린 값이다.
 *
 * 국내를 다섯 개 다 받아 두고 미국이 채운 만큼만 잘라 낸다 — 미국 집계가 비는 날에도
 * 묶음이 다섯 줄로 차 있다(추천이 조용히 세 줄로 줄지 않는다).
 */
async function loadSuggestions(): Promise<SuggestGroups> {
  const empty: SuggestGroups = { surging: [], report: [] };
  try {
    const [surging, report, usSurging, usReport] = await Promise.all([
      getSurgingStocks(SUGGEST_ROWS),
      getTopStocksWithTrend(SUGGEST_ROWS),
      getUsSurgingStocks(SUGGEST_US_ROWS).catch(() => []),
      getUsStockReports(SUGGEST_US_ROWS).catch(() => []),
    ]);
    const codes = [...new Set([...surging.map((s) => s.code), ...report.map((s) => s.code)])];
    if (!codes.length && !usSurging.length && !usReport.length) return empty;

    // 코드가 최대 10개 남짓이라 .in() 목록 길이 걱정은 없다(PostgREST 캡은 훨씬 위).
    const { data } = await getSupabaseServer().from("stocks").select("code, name, market").in("code", codes);
    const known = new Map((data ?? []).map((r) => [r.code as string, r as StockOption]));

    const pick = (code: string, note: string) => {
      const s = known.get(code);
      return s ? { ...s, note } : null;
    };
    // 미국은 이름·티커를 이미 들고 있어 stocks 조회를 한 번 더 돌 필요가 없다.
    const usPick = (ticker: string, name: string, note: string) => ({
      code: ticker,
      name,
      market: "US",
      note,
    });
    const join = <T,>(kr: T[], us: T[]) => [...kr.slice(0, SUGGEST_ROWS - us.length), ...us];

    return {
      surging: join(
        surging
          .map((s) => pick(s.code, s.isNew ? "신규 등장" : `평소 ${s.ratio.toFixed(1)}배`))
          .filter((s): s is NonNullable<typeof s> => s !== null),
        usSurging.map((s) => usPick(s.ticker, s.name, `평소 ${s.multiple.toFixed(1)}배`)),
      ),
      report: join(
        report
          .map((s) => pick(s.code, `${s.mentions.toLocaleString()}회 언급`))
          .filter((s): s is NonNullable<typeof s> => s !== null),
        usReport.map((s) => usPick(s.ticker, s.name, `${s.recentMentions.toLocaleString()}회 언급`)),
      ),
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
  // 로딩 화면을 조금 더 보여주려고 **일부러** 0.2초 늦춘다.
  //
  // 이 페이지는 서버 시간이 0.4~0.5초라 스켈레톤이 딱 그만큼만 보인다(실측). 카더라는
  // 0.6~0.9초라, 둘을 오가면 MDD 쪽만 스치듯 지나가 "눌렀는데 반응이 없었다"에 가깝게
  // 읽힌다. 0.2초를 더해 두 페이지의 인상을 같은 대역에 둔다.
  //
  // 병렬이 아니라 순차인 것이 의도다. 아래 조회와 나란히 돌리면 조회(0.4초)가 이미 더
  // 길어서 아무 효과가 없다 — '최소 노출 시간'이 아니라 '더 보여주기'가 목적이다.
  //
  // ⚠️ 모든 방문자가 매번 더 기다리는 값이다. 서버가 느려지면 그만큼 위에 얹히므로,
  //    /mdd 응답이 길어지면 이 줄부터 다시 볼 것.
  await new Promise((r) => setTimeout(r, 200));

  const sp = await searchParams;
  const [kospi, us, initial, suggestions] = await Promise.all([
    loadKospiStocks(),
    loadUsStocks(),
    resolveInitial(sp),
    loadSuggestions(),
  ]);
  // 국내를 앞에 둔다. 등급이 같을 때의 마지막 정렬은 rankStockMatches 가 맡으므로
  // 이 순서가 결과를 흔들지는 않는다 — 두 목록을 잇는 자리일 뿐이다.
  const stocks = [...kospi, ...us];
  // key 로 초기 종목이 바뀌면 리마운트 — /mdd?code=A → ?code=B 로 이동해도 반영된다.
  return <MddExplorer key={initial?.code ?? "default"} stocks={stocks} initial={initial} suggestions={suggestions} />;
}
