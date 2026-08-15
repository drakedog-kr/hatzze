import { getSupabaseServer } from "@/lib/supabase-server";

/**
 * 서학개미 해부도의 **분기 층** — 기관과 나머지.
 *
 * 원천 표는 `seohak_quarterly_returns` 이고, 그건 `calculate_seohak_quarterly.py` 가
 * 13F 23,356행과 TIC 498개월을 접어 만든 것이다. 화면이 13F 를 직접 읽으면 방문 한 번에
 * 2MB 가 나간다 — digest 한 줄이 월 10GB 를 먹던 것과 같은 형태다.
 *
 * ## ⚠️ '기관'은 한국 기관 전부가 아니다
 *
 * SEC 에 13F 를 내는 한국 소재 기관 **9곳**뿐이다(운용자산 $100M 이상 + 미국 상장주식
 * 보유 시 의무). 보험사·중소 운용사·직접 투자하는 법인은 안 잡힌다. 그래서 화면 문구는
 * '기관'이라 쓰되 각주에서 **"SEC 에 신고하는 9곳"** 이라고 밝혀야 한다. 나머지도
 * '개인'이 아니라 '그 9곳이 아닌 전부'다.
 *
 * ## ⚠️⚠️ 분기 하나만 떼서 쓰지 않는다
 *
 * TIC 순매수는 원천이 "연준 스태프 추정치가 섞였다"고 밝힌 분해값이라, 크게 오른
 * 분기에 수익을 거래로 흡수해 전체 수익률을 낮춰 잡는다(2025Q2 나스닥 +17.8% 인데
 * 폐합식은 +7.15%). 오차 방향이 랜덤이라 **누적하면 상쇄된다** — 7분기 복리 +20.89%
 * vs 같은 구간을 한 번에 닫으면 +22.21%. 그래서 이 층은 누적을 주인공으로 쓰고
 * 분기 값은 곡선의 마디로만 보여준다.
 */

/** 13F 마감이 분기말 +45일이라 최근 분기는 한두 곳만 낸 상태로 보인다. */
const MIN_FILERS = 5;

export type QuarterPoint = {
  quarter: string;
  /** 100 에서 출발한 누적 지수. 곡선 두 줄이 이걸 그린다. */
  institution: number;
  rest: number;
  /** 그 분기만의 수익률(%). 툴팁·표에 쓴다. */
  instQ: number;
  restQ: number;
};

export type SeohakQuarterly = {
  /** 마지막으로 다 채워진 분기. */
  asOf: string;
  /** 기관 몫 — 최신 분기. */
  share: number;
  institutionUsd: number;
  totalUsd: number;
  restUsd: number;
  /** 기관 몫의 분기별 추이(%). 안정적인지 보여주는 데 쓴다. */
  shareTrail: { quarter: string; share: number }[];
  /** 누적 곡선. 첫 점은 둘 다 100 이다. */
  race: QuarterPoint[];
  /** 누적 수익률(%). */
  instTotal: number;
  restTotal: number;
  /** 몇 분기를 접은 값인가. */
  quarters: number;
};

export async function getSeohakQuarterly(): Promise<SeohakQuarterly | null> {
  const { data, error } = await getSupabaseServer()
    .from("seohak_quarterly_returns")
    .select(
      "quarter_end, institution_usd, total_usd, institution_share, institution_return, rest_return, filer_count",
    )
    .order("quarter_end", { ascending: true });

  // ⚠️ error 를 안 받으면 조회 실패가 조용히 '데이터 없음'이 된다(telegram-data.ts 에서
  // 13곳 중 12곳이 이랬다). 여기서는 표가 아직 없을 수도 있으므로 던지지 말고 null 을
  // 돌려 화면이 그 층만 접게 한다.
  if (error || !data?.length) return null;

  const rows = data.filter((r) => (r.filer_count ?? 0) >= MIN_FILERS);
  // 수익률이 있는 행만 곱한다. 각 행의 수익률은 **그 분기의 것**이다(앞 분기 대비).
  const usable = rows.filter((r) => r.institution_return !== null);
  if (usable.length < 2) return null;

  const race: QuarterPoint[] = [];
  let ci = 100;
  let cr = 100;
  // ⚠️ 곡선의 출발점은 usable[0] 이 아니라 **그 앞 분기**다. 처음에 usable[0] 을
  // 기준선으로 삼았다가 그 분기의 실제 수익률(+4.70%)을 통째로 버렸고, 누적이
  // 7분기 +25.10% 가 아니라 6분기 +19.5% 로 찍혔다.
  const startIdx = rows.indexOf(usable[0]) - 1;
  race.push({
    quarter: (startIdx >= 0 ? rows[startIdx].quarter_end : usable[0].quarter_end) as string,
    institution: 100,
    rest: 100,
    instQ: 0,
    restQ: 0,
  });
  for (const r of usable) {
    const i = Number(r.institution_return ?? 0);
    const s = Number(r.rest_return ?? 0);
    ci *= 1 + i;
    cr *= 1 + s;
    race.push({
      quarter: r.quarter_end as string,
      institution: ci,
      rest: cr,
      instQ: i * 100,
      restQ: s * 100,
    });
  }

  const last = rows[rows.length - 1];
  const institutionUsd = Number(last.institution_usd ?? 0);
  const totalUsd = Number(last.total_usd ?? 0);

  return {
    asOf: last.quarter_end as string,
    share: Number(last.institution_share ?? 0) * 100,
    institutionUsd,
    totalUsd,
    restUsd: totalUsd - institutionUsd,
    shareTrail: rows.map((r) => ({
      quarter: r.quarter_end as string,
      share: Number(r.institution_share ?? 0) * 100,
    })),
    race,
    instTotal: ci - 100,
    restTotal: cr - 100,
    quarters: usable.length,
  };
}
