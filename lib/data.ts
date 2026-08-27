import "server-only";

import { cache } from "react";

import { getDevOverrides } from "@/lib/dev-overrides";
import { getSupabaseServer } from "@/lib/supabase-server";

export type DailyScore = {
  date: string;
  score: number;
  stage: string;
  updated_at: string;
  // LLM(Claude Haiku)이 생성한 오늘의 요약. 컬럼이 없거나(마이그레이션 전) 아직
  // 생성 전이면 null이고, 이땐 히어로가 기존 템플릿 문장으로 폴백한다.
  ai_summary: string | null;
  /**
   * **앞 날짜 행**(=하루 전 마지막으로 저장된 점수)과 그 날짜. 히어로의 "전일 대비 ▲6"
   * 이 이 값과의 차이를 그린다. 앞 행이 없으면(기록이 하루뿐) null.
   *
   * 한때 여기 담긴 건 앞 '날짜'가 아니라 앞 '실행'의 점수였다(daily_score.prev_score,
   * 마이그레이션 024). 파이프라인이 하루 두 번(오전·오후) 돌면서 같은 날짜 행을
   * 덮어쓰므로, 그 편이 "방금 바뀐 온도"를 화살표에 바로 비친다는 이유였다. 그 이유는
   * 티커에서만 성립했다. 티커의 화살표엔 라벨이 없어서 "지난 갱신 뒤로 움직였다"까지만
   * 말했고, 실제로 스스로 '하루 변화가 아니다'라고 못박아 뒀다.
   *
   * 2026-08-03 리디자인이 이 값을 히어로로 옮기면서 **"전일 대비"라는 라벨을 새로
   * 붙였다.** 그래서 두 가지가 깨졌다.
   *
   *   1. 라벨이 거짓이 됐다. 저녁 실행부터 다음 날 오전까지, 즉 하루의 대부분 이 차이는
   *      전일이 아니라 그날 오전과의 차이다(2026-08-05: 29.7 vs 29.19 → ▲1, 진짜 전일
   *      08-04 는 24.49 라 ▲6).
   *   2. 기준선이 같이 움직여서 화살표가 큰 숫자와 어긋난다. 앞 날짜 점수는 하루 동안
   *      고정이라 차이는 화면의 ℃ 가 바뀔 때만 바뀌지만, 앞 실행 점수는 두 항이 같이
   *      움직여 **방향까지 뒤집힌다.** prev_score 가 채워진 5일 중 2일이 그랬다
   *      (08-01 ▼2 인데 하루 변화는 +13 · 08-04 ▲3 인데 −9).
   *
   * 히어로 브리핑 문장은 daily_score 를 날짜별로 읽어 "어제 24℃ … 오늘 30℃"라고 적는다.
   * 그 문장과 이 배지가 같은 화면에서 다른 수를 말한 것이 이 값을 바꾼 이유다. 같은 모순이
   * 문장 쪽에서 났을 때도 날짜 기준으로 맞춰 해결했다(generate_daily_summary.trend_lines).
   *
   * ⚠️ 눈금(SCORE_DISPLAY_ANCHORS)을 바꾼 날은 이 차이가 시장이 아니라 눈금 변경을
   * 반영한다. 저장된 score 가 이미 매핑을 거친 표시값이라 앞 날짜 값은 옛 눈금으로 남기
   * 때문이다(08-01 의 +13 이 대부분 이것이다 — 07-31 저장 27.88 을 지금 코드로 다시 재면
   * 41.41 이다). 하루면 지나가고, 무엇보다 **브리핑 문장이 같은 시계열을 읽어 같은 오염을
   * 함께 받으므로** 배지와 문장이 갈리지는 않는다. 그래서 여기서 보정하지 않는다.
   */
  prevDay: { date: string; score: number } | null;
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
  /**
   * 종합점수에서 이 지표가 차지하는 무게. **파이프라인의
   * `config/indicator_weights.py` 가 소스 오브 트루스**이고 DB 는 그 값을 받아 둔 사본이다
   * (전수 검사에서 둘이 완전히 일치하는지 매번 대조한다).
   * 프론트가 TS 로 표를 또 갖지 않으려고 DB 쪽을 읽는다 — 표를 둘로 두면 갈린다.
   */
  weight: number;
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
  // 두 줄을 읽는다 — 최신 한 줄은 화면 전체가 쓰고, 그 앞 줄이 히어로 배지의 비교 기준
  // (prevDay)이다. 한 줄 더 읽는 비용은 없다시피 하고, 앞 줄 때문에 조회를 한 번 더
  // 내보내면 요청당 왕복이 늘어난다.
  const query = (cols: string) =>
    getSupabaseServer()
      .from("daily_score")
      .select(cols)
      .order("date", { ascending: false })
      .limit(2);

  // ai_summary 컬럼이 아직 없는 환경(마이그레이션 007 전)에서도 페이지가 죽지 않도록
  // 그 칸을 떼고 다시 조회한다.
  let { data, error } = await query("date,score,stage,updated_at,ai_summary");
  if (error) {
    ({ data, error } = await query("date,score,stage,updated_at"));
  }
  if (error) throw error;

  // 동적 select라 supabase-js가 타입을 추론하지 못해 명시적으로 캐스팅한다.
  const rows = (data ?? []) as unknown as {
    date: string;
    score: number;
    stage: string;
    updated_at: string;
    ai_summary?: string | null;
  }[];
  if (!rows.length) return null;
  const row = rows[0];
  const prev = rows[1] ?? null;

  // 로컬 dev 전용 오버레이(운영 빌드에선 no-op). 운영 DB에 요약을 쓰기 전에
  // 로컬에서만 미리 문장을 얹어 보기 위한 장치.
  const summaryOverride = getDevOverrides().summary;

  return {
    date: row.date,
    score: row.score,
    stage: row.stage,
    updated_at: row.updated_at,
    ai_summary: summaryOverride ?? row.ai_summary ?? null,
    // 날짜를 같이 넘긴다. 이 행이 정말 하루 전인지는 화면이 라벨을 고를 때 따져야 한다
    // (자료가 하루 빠진 날엔 "전일"이 아니다).
    prevDay: prev ? { date: prev.date, score: prev.score } : null,
  };
});

export async function getPublicIndicators(): Promise<IndicatorWithLatestValue[]> {
  // is_public=false인 지표(예: kospi_close_raw)는 다른 지표를 계산하기 위한
  // 내부용 캐시라 화면에 노출하지 않는다. 그 외에는 새로 추가되는 지표도
  // 코드 수정 없이 자동으로 표시된다.
  const baseCols =
    "id, slug, name, headline, category, description_beginner, unit, direction, weight, created_at";

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
    weight: number | null;
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
      // 검증 전 새 지표는 DB 기본값이 1 이라 null 이 오는 일은 없지만, 스키마상 널 허용이라 받아 둔다.
      weight: row.weight ?? 1,
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
  /** 종가 기준일. 행의 날짜(KRX 거래대금 기준일)와 다를 수 있다 — 아래 주석 참고. */
  priceDate: string | null;
};

/**
 * 거래대금 상위 3종목이 각자 52주 신고가에서 얼마나 떨어져 있는지.
 *
 * 지수 괴리율만 보면 "코스피가 고점 대비 -25%"라는 한 덩어리 숫자뿐이라, 그 안에서
 * 주도주들이 어떤 상태인지는 안 보인다. 거래대금 상위 종목(= 지금 돈이 몰리는 곳)의
 * 개별 괴리율을 같이 두면 지수 숫자가 어디서 온 건지 읽힌다.
 *
 * **여기는 조회를 하지 않는다. 저장된 값을 그대로 읽을 뿐이다.**
 *
 * 규칙이 세 번 뒤집혔으니 되돌리기 전에 읽을 것.
 *
 *  1) 처음엔 현재가가 KRX 저장 종가였다. 왼쪽 지수가 KRX 기준이라 날짜가 맞았다.
 *  2) 지수 종가가 야후로 옮겨 가자(2026-07-29) KRX 가 되레 하루 뒤처져, 현재가를
 *     야후 **실시간**으로 바꿨다.
 *  3) 그런데 실시간이면 이 카드가 장중에 움직인다. 같은 카드 왼쪽의 지수 게이지와
 *     햇쩨 지수는 하루 두 번만 바뀌므로 **한 화면에서 시점이 갈린다.** 지표는 온도와
 *     같은 시점이어야 한다는 원칙이 우선이라, 조회를 파이프라인으로 옮겼다
 *     (data-pipeline/scripts/fetch_turnover_concentration.py 의 attach_quotes).
 *
 * 그래서 지금 이 함수는 순수한 읽기다. 화면을 아무리 새로고침해도 값이 안 변하고,
 * 파이프라인이 도는 하루 두 번만 바뀐다 — 지수 카드·햇쩨 지수와 같은 리듬이다.
 *
 * `priceDate` 가 행의 날짜와 다를 수 있다. KRX 거래대금은 T+1 이라 행은 어제인데
 * 종가는 오늘일 수 있어서다. 지수 게이지와 날짜를 맞추는 게 목적이므로 이쪽이 맞다.
 *
 * 52주 고점이 야후인 이유: KRX 일별매매정보에 그 필드가 없어서, 같은 값을 얻으려면
 * 1년치를 훑어야 하고 실측 80분이 걸린다. 야후는 fiftyTwoWeekHigh 를 한 번에 준다.
 * 남는 차이는 야후 고점이 **장중 고가**라 종가 기준보다 3%쯤 높다는 것 — 세 종목에
 * 똑같이 걸리는 편향이고 점수에는 들어가지 않는다.
 */
/**
 * 코스피 지수 종가 최근 n거래일(오래된→최신). 상승 속도 카드가 60일 궤적을 그리는 데 쓴다.
 *
 * kospi_close_raw 는 is_public=false 인 내부용 캐시라 getPublicIndicators 에 안 잡힌다.
 * 화면에 직접 쓰는 건 이 카드 하나뿐이라 여기서 따로 읽는다. 날짜를 같이 돌려주는 건
 * 차트 호버 툴팁이 "며칟날 몇 %"를 적어야 해서다.
 */
export type ClosePoint = { date: string; close: number };

export async function getKospiCloseSeries(days = 61): Promise<ClosePoint[]> {
  const { data, error } = await getSupabaseServer()
    .from("indicators")
    .select("id,indicator_values(date,raw_value)")
    .eq("slug", "kospi_close_raw")
    .order("date", { referencedTable: "indicator_values", ascending: false })
    .limit(days, { referencedTable: "indicator_values" })
    .maybeSingle();
  // 실패해도 빈 배열이라 차트가 "자료 없음" 으로 보인다. 폴백은 그대로 두고 소리만 낸다.
  if (error) console.error("[getKospiCloseSeries] 코스피 종가 계열을 못 읽었습니다", error);
  const rows = (data?.indicator_values ?? []) as { date: string; raw_value: number }[];
  // 위 쿼리는 최신순이라 뒤집어 시간 순으로 돌려준다.
  return rows
    .slice()
    .reverse()
    .map((r) => ({ date: r.date, close: Number(r.raw_value) }))
    .filter((p) => Number.isFinite(p.close) && p.close > 0);
}

export async function getTopStockHighGaps(limit = 3): Promise<StockHighGap[]> {
  const { data: rows, error } = await getSupabaseServer()
    .from("indicators")
    .select("id,indicator_values(date,details)")
    .eq("slug", "turnover_concentration")
    .order("date", { referencedTable: "indicator_values", ascending: false })
    .limit(1, { referencedTable: "indicator_values" })
    .maybeSingle();
  if (error) console.error("[getTopStockHighGaps] 고점 근접 종목을 못 읽었습니다", error);

  type StoredStock = { name: string; code?: string; price?: number; high52?: number; gap_pct?: number };
  const details = rows?.indicator_values?.[0]?.details as
    | { top5?: StoredStock[]; price_date?: string }
    | null;

  // 종가가 아직 안 붙은 종목은 뺀다(파이프라인이 한 번도 안 돌았거나 야후 조회 실패).
  // 카드 왼쪽 게이지는 지수 값이라 그대로 서고 오른쪽 목록만 줄어든다.
  return (details?.top5 ?? [])
    .filter(
      (s): s is StoredStock & { code: string; price: number; high52: number } =>
        typeof s.code === "string" &&
        typeof s.price === "number" &&
        typeof s.high52 === "number" &&
        s.high52 > 0,
    )
    .slice(0, limit)
    .map((s) => ({
      name: s.name,
      code: s.code,
      price: s.price,
      high52: s.high52,
      gapPct: typeof s.gap_pct === "number" ? s.gap_pct : (s.price / s.high52 - 1) * 100,
      priceDate: details?.price_date ?? null,
    }));
}
