import "server-only";

import { cache } from "react";

import { getDevOverrides } from "@/lib/dev-overrides";
import { getSupabaseServer } from "@/lib/supabase-server";
import { fetchYahooQuote } from "@/lib/yahoo-quote";

export type DailyScore = {
  date: string;
  score: number;
  stage: string;
  updated_at: string;
  // LLM(Claude Haiku)이 생성한 오늘의 요약. 컬럼이 없거나(마이그레이션 전) 아직
  // 생성 전이면 null이고, 이땐 히어로가 기존 템플릿 문장으로 폴백한다.
  ai_summary: string | null;
};

/**
 * 지표별 서브값(예: 레버리지의 ETF/선물 진행률, 안전장치의 매수/매도/CB 건수,
 * 아시아의 각국 수익률). 카드가 목업 원본 시각화를 그릴 때 쓴다. 컬럼이 없거나
 * 값이 아직 안 채워졌으면 null이고, 그 경우 카드는 단순화된 폴백으로 렌더된다.
 *
 * ⚠️ **이 타입은 실제 내용보다 좁다.** 값이 숫자만은 아니어서 — 쏠림도의 top5(객체 배열),
 * 증권앱의 charted(객체 배열), 순매수의 daily5(숫자 배열) — 그런 카드들은
 * `as unknown as` 로 캐스팅해서 쓴다. 정확히 넓히려면(number | number[] | object[])
 * 카드 20곳 이상을 함께 고쳐야 해서(2026-07-23 실측) 별건으로 미뤄 뒀다.
 * 새 카드를 만들 때 캐스팅이 필요하면 그건 타입 잘못이지 코드 잘못이 아니다.
 */
export type IndicatorDetails = Record<string, number>;

export type IndicatorCategory = "시장" | "감성";

// 레거시 category 값(정통/밈)을 현재 명칭(시장/감성)으로 정규화한다. DB 마이그레이션
// 전/중에도 프론트가 항상 새 값을 보도록 하는 안전장치 — 마이그레이션 후엔 no-op.
function normalizeCategory(raw: string): IndicatorCategory {
  if (raw === "정통" || raw === "시장") return "시장";
  return "감성"; // "밈" 또는 "감성"
}

export type IndicatorWithLatestValue = {
  id: string;
  slug: string;
  name: string;
  headline: string | null;
  category: IndicatorCategory;
  description_beginner: string;
  unit: string;
  direction: "high" | "low";
  latest: {
    date: string;
    raw_value: number;
    normalized_score: number | null;
    threshold: number | null;
    details: IndicatorDetails | null;
  } | null;
  // 최근 ~30일 raw_value(시간순, 오래된→최신). 카드가 추세 스파크라인을 그릴 때 쓴다.
  history: number[];
  /** 스파크라인 툴팁용 — 값에 날짜를 붙인 것. 거래일은 주말·휴장을 건너뛰어 역산할 수 없다. */
  historyPoints: { date: string; value: number }[];
};

/**
 * 최신 daily_score 한 줄.
 *
 * 한 요청 안에서 두 번 불린다 — 루트 레이아웃(탑바에 쓸 점수)과 generateMetadata
 * (OG 이미지 URL 에 실을 날짜·도수). supabase-js 는 Next 의 fetch 메모이제이션 대상이
 * 아니라 그냥 두면 조회가 두 번 나가므로, React cache 로 감싸 요청당 한 번만 돈다.
 * (OG 이미지 라우트는 별도 요청이라 여기 캐시를 공유하지 않는다 — 의도된 것이다.)
 */
export const getLatestDailyScore = cache(async function getLatestDailyScore(): Promise<DailyScore | null> {
  const query = (cols: string) =>
    getSupabaseServer()
      .from("daily_score")
      .select(cols)
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle();

  // ai_summary 컬럼이 아직 없는 환경(마이그레이션 007 전)에서도 페이지가 죽지
  // 않도록, 포함 조회가 실패하면 그 컬럼 없이 한 번 더 조회한다.
  let { data, error } = await query("date,score,stage,updated_at,ai_summary");
  if (error) {
    ({ data, error } = await query("date,score,stage,updated_at"));
  }
  if (error) throw error;
  if (!data) return null;

  // 동적 select라 supabase-js가 타입을 추론하지 못해 명시적으로 캐스팅한다.
  const row = data as unknown as {
    date: string;
    score: number;
    stage: string;
    updated_at: string;
    ai_summary?: string | null;
  };

  // 로컬 dev 전용 오버레이(운영 빌드에선 no-op). 운영 DB에 요약을 쓰기 전에
  // 로컬에서만 미리 문장을 얹어 보기 위한 장치.
  const summaryOverride = getDevOverrides().summary;

  return {
    date: row.date,
    score: row.score,
    stage: row.stage,
    updated_at: row.updated_at,
    ai_summary: summaryOverride ?? row.ai_summary ?? null,
  };
});

export async function getPublicIndicators(): Promise<IndicatorWithLatestValue[]> {
  // is_public=false인 지표(예: kospi_close_raw)는 다른 지표를 계산하기 위한
  // 내부용 캐시라 화면에 노출하지 않는다. 그 외에는 새로 추가되는 지표도
  // 코드 수정 없이 자동으로 표시된다.
  const baseCols =
    "id, slug, name, headline, category, description_beginner, unit, direction, created_at";

  const query = (valueCols: string) =>
    getSupabaseServer()
      .from("indicators")
      .select(`${baseCols}, indicator_values ( ${valueCols} )`)
      .eq("is_public", true)
      .order("created_at", { ascending: true })
      .order("date", { referencedTable: "indicator_values", ascending: false })
      .limit(30, { referencedTable: "indicator_values" });

  // details(JSONB) 컬럼이 아직 없는 환경(마이그레이션 전)에서도 페이지가 죽지
  // 않도록, details 포함 조회가 실패하면 details 없이 한 번 더 조회한다.
  let { data, error } = await query(
    "date, raw_value, normalized_score, threshold, details",
  );
  if (error) {
    ({ data, error } = await query(
      "date, raw_value, normalized_score, threshold",
    ));
  }
  if (error) throw error;

  // 동적 select 문자열이라 supabase-js가 반환 타입을 추론하지 못해, 조회한
  // 컬럼과 일치하는 형태로 명시적으로 캐스팅한다.
  type RawRow = {
    id: string;
    slug: string;
    name: string;
    headline: string | null;
    category: string;
    description_beginner: string;
    unit: string;
    direction: "high" | "low";
    indicator_values: {
      date: string;
      raw_value: number;
      normalized_score: number | null;
      threshold: number | null;
      details?: IndicatorDetails | null;
    }[];
  };

  // 로컬 dev 전용 오버레이(운영 빌드에선 no-op). 설명/서브값을 운영 DB에 쓰기
  // 전에 로컬에서만 미리 보기 위해 slug별로 덮어쓴다.
  const overrides = getDevOverrides();

  return ((data ?? []) as unknown as RawRow[]).map((row) => {
    const iv = row.indicator_values[0];
    const nameOverride = overrides.names?.[row.slug];
    const descOverride = overrides.descriptions?.[row.slug];
    const detailsOverride = overrides.details?.[row.slug];
    const baseDetails =
      (iv as { details?: IndicatorDetails | null } | undefined)?.details ?? null;
    return {
      id: row.id,
      slug: row.slug,
      name: nameOverride ?? row.name,
      headline: row.headline,
      category: normalizeCategory(row.category),
      description_beginner: descOverride ?? row.description_beginner,
      unit: row.unit,
      direction: row.direction,
      latest: iv
        ? {
            date: iv.date,
            raw_value: iv.raw_value,
            normalized_score: iv.normalized_score,
            threshold: iv.threshold,
            details: detailsOverride
              ? { ...(baseDetails ?? {}), ...detailsOverride }
              : baseDetails,
          }
        : null,
      // 조회는 최신순이므로 뒤집어 시간순(오래된→최신)으로 둔다.
      history: [...row.indicator_values].reverse().map((v) => v.raw_value),
      historyPoints: [...row.indicator_values]
        .reverse()
        .map((v) => ({ date: v.date, value: v.raw_value })),
    };
  });
}

/** 거래대금 상위 종목의 52주 신고가 대비 괴리율 (코스피 신고가 카드의 오른쪽 칸). */
export type StockHighGap = {
  name: string;
  code: string;
  price: number;
  high52: number;
  gapPct: number; // 음수 = 고점 아래
};

/**
 * 거래대금 상위 3종목이 각자 52주 신고가에서 얼마나 떨어져 있는지.
 *
 * 지수 괴리율만 보면 "코스피가 고점 대비 -25%"라는 한 덩어리 숫자뿐이라, 그 안에서
 * 주도주들이 어떤 상태인지는 안 보인다. 거래대금 상위 종목(= 지금 돈이 몰리는 곳)의
 * 개별 괴리율을 같이 두면 지수 숫자가 어디서 온 건지 읽힌다.
 *
 * 종목 선정은 turnover_concentration 지표가 이미 저장해 둔 details.top5(거래대금 순)를
 * 재사용한다 — 같은 자료를 두 번 긁지 않기 위해서다. 다만 거기엔 종목명만 있어
 * stocks 에서 코드를 찾아 야후 심볼로 바꾼다.
 *
 * **현재가·52주 고점 둘 다 야후.** 이 규칙은 두 번 뒤집혔으니 되돌리기 전에 읽을 것.
 *
 * 처음엔 현재가가 KRX 종가였다. 왼쪽 지수 괴리율이 KRX 기준이라, 오른쪽만 야후 실시간이면
 * 한 카드에서 날짜가 갈렸기 때문이다 — 배지에 "7/22 기준"이라 적어도 이 숫자는 그날 값이
 * 아니었다. 그런데 2026-07-29 에 **지수 종가가 야후로 옮겨 가면서 그 논리가 뒤집혔다**
 * (data-pipeline/common/yahoo_client.py). KRX 종가는 이제 지수보다 하루 뒤처진 값이라,
 * 날짜를 맞추려면 반대로 야후를 써야 한다.
 *
 * ⚠️ **그래도 장중에는 여전히 갈린다.** 지수는 파이프라인이 16:00 KST 이후에만 쓰는
 * '일별 종가'고 여기는 실시간이다. 장중 = 종목만 오늘 · 지수는 어제, 저녁 실행 뒤 = 둘 다
 * 오늘. 카드 툴팁이 이걸 밝히므로 문구를 지울 때 같이 볼 것.
 *
 * 52주 고점이 야후인 이유(이건 안 바뀐다): KRX 일별매매정보에는 52주 고점 필드가 없어서,
 * 같은 값을 얻으려면 1년치를 훑어야 하고 실측 80분이 걸린다(응답 하나가 KOSPI 943행 +
 * KOSDAQ 1,821행). 야후는 fiftyTwoWeekHigh 를 한 번의 호출로 준다. 지수 쪽은 이미 일별
 * 종가를 쌓고 있어 최고 종가를 공짜로 구하지만(kospi_close_raw), 종목은 그 저장소가 없다.
 *
 * 남는 차이: 야후 고점은 **장중 고가**라 종가 기준보다 3%쯤 높다. 그만큼 종목 괴리율이
 * 깊게 나온다(SK하이닉스 -35.8% → -38.7%). 세 종목에 똑같이 걸리는 편향이고 점수에는
 * 들어가지 않는다.
 */
export async function getTopStockHighGaps(limit = 3): Promise<StockHighGap[]> {
  const { data: rows } = await getSupabaseServer()
    .from("indicators")
    .select("id,indicator_values(date,details)")
    .eq("slug", "turnover_concentration")
    .order("date", { referencedTable: "indicator_values", ascending: false })
    .limit(1, { referencedTable: "indicator_values" })
    .maybeSingle();

  const details = rows?.indicator_values?.[0]?.details as { top5?: { name: string }[] } | null;
  const names = (details?.top5 ?? []).map((s) => s.name).slice(0, limit);
  if (!names.length) return [];

  const { data: stocks } = await getSupabaseServer()
    .from("stocks")
    // close_price·price_date 는 더 안 읽는다 — 현재가가 야후로 바뀌면서 쓸 데가 없어졌다
    // (그 컬럼 자체는 fetch_krx_stocks.py 가 계속 채우고 카더라 폴백이 쓴다).
    .select("code,name,market")
    .in("name", names);
  const infoOf = new Map((stocks ?? []).map((s) => [s.name as string, s]));

  const results = await Promise.all(
    names.map(async (name) => {
      const info = infoOf.get(name);
      if (!info) return null;
      const q = await fetchYahooQuote(`${info.code}.${info.market === "KOSDAQ" ? "KQ" : "KS"}`, {
        next: { revalidate: 600 },
      });
      // 시세를 못 믿으면(낡은 값 포함, lib/yahoo-quote 참고) 52주 고점만 따로 건지지
      // 않고 종목을 통째로 뺀다. 카드 왼쪽 게이지는 KRX 값이라 그대로 서고 오른쪽 목록만
      // 줄어든다 — 드물고 잠깐이라 이 정도 손해는 받는다.
      if (!q || q.fiftyTwoWeekHigh === null || q.fiftyTwoWeekHigh <= 0) return null;

      // 현재가는 야후를 쓴다(2026-07-29 에 KRX 우선에서 뒤집었다).
      //
      // 예전엔 KRX 저장 종가를 우선했고 이유는 "지수 쪽 배지와 같은 거래일을 가리키게"
      // 였다. 지수가 KRX 라 둘 다 전일 종가로 맞아떨어졌기 때문이다. 그런데 지수 종가가
      // 야후로 옮겨 가면서(data-pipeline/common/yahoo_client.py) **같은 규칙이 정반대
      // 결과를 낸다** — KRX 종가는 이제 지수보다 하루 뒤처진 값이다.
      //
      // ⚠️ 그렇다고 날짜가 늘 맞는 건 아니다. 지수는 파이프라인이 16:00 KST 이후에만
      // 쓰는 '일별 종가'고 여기는 실시간이라, **장중에는 종목만 오늘이고 지수는 어제**다
      // (저녁 실행 뒤에야 둘 다 오늘이 된다). 카드 툴팁이 그 사실을 밝힌다.
      //
      // KRX 저장 종가로 폴백하지는 않는다. 이 카드는 52주 고점이 있어야 성립하는데 그
      // 필드는 야후에만 있어서, 야후를 못 믿는 순간 어차피 종목을 통째로 뺀다(위 가드).
      const price = Math.round(q.price);
      return {
        name,
        code: info.code as string,
        price,
        high52: Math.round(q.fiftyTwoWeekHigh),
        // 현재가와 고점이 같은 응답에서 나온다 — 예전엔 KRX 종가 ÷ 야후 고점이라 한
        // 숫자가 두 소스에 걸쳐 있었다.
        gapPct: (price / q.fiftyTwoWeekHigh - 1) * 100,
      };
    }),
  );
  return results.filter((r): r is StockHighGap => r !== null);
}
