import { getSupabaseServer, warnIfRowCapped } from "@/lib/supabase-server";

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

/** 13F 를 낸 기관 한 곳. */
export type Filer = {
  /** 화면용 한국어 이름. 표에 없으면 원천의 영문 이름을 그대로 쓴다. */
  name: string;
  usd: number;
  /** 그 분기 신고액 합에서 차지하는 몫(%). */
  share: number;
  /** 신고한 종목 수. */
  holdings: number;
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
  /** `asOf` 분기에 13F 를 낸 기관들, 신고액 큰 순. 표가 없으면 빈 배열. */
  filers: Filer[];
};

/**
 * 13F 신고자 이름 — 영문 원천 → 화면용.
 *
 * ⚠️ 표에 없는 이름은 **영문 그대로 낸다.** 빈칸으로 두면 새 기관이 신고를 시작한
 * 분기에 이름 없는 줄이 생긴다. 지금까지 신고한 곳은 아홉이고 전부 여기 있다.
 */
const FILER_KO: Record<string, string> = {
  "National Pension Service": "국민연금",
  "Korea Investment CORP": "한국투자공사",
  "Mirae Asset Global Investments Co., Ltd.": "미래에셋",
  "BANK OF KOREA": "한국은행",
  "Hanwha Asset Management Co., Ltd.": "한화자산운용",
  "Must Asset Management Inc.": "머스트자산운용",
  "Hyundai Investments Co., Ltd.": "현대인베스트먼트",
  "AJU IB Investment Co., Ltd.": "아주IB투자",
  "Samsung C&T Corp": "삼성물산",
};

/**
 * 그 분기 신고자별 합계.
 *
 * ## ⚠️⚠️ `suspect` 를 반드시 걸러야 한다
 *
 * 안 거르면 2026-03 합이 **$483.7B** 인데 걸러야 $219.1B 다. 집계표
 * (`seohak_quarterly_returns.institution_usd`)가 $219.1B 이므로 **거른 쪽이 맞다.**
 * 차이 하나가 미래에셋의 $299.5B → $34.9B 인데, 13F 는 단위를 잘못 적어 내는 신고가
 * 드물지 않다. 안 거르면 이 표만 집계표와 다른 이야기를 하게 된다.
 *
 * ## ⚠️ 한 분기가 ~2,900행이라 세 번 왕복한다
 *
 * PostgREST 의 집계 함수가 꺼져 있어(`PGRST123`) 합을 여기서 낸다. 압축 전 약 200KB.
 * 자주 바뀌는 자료가 아니므로(분기 1회) 나중에 집계 열을 만들 자리다.
 */
async function loadFilers(quarter: string): Promise<Filer[]> {
  const rows: { filer_name: string; value_usd: number | null }[] = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await getSupabaseServer()
      .from("seohak_institution_13f")
      .select("filer_name, value_usd")
      .eq("report_date", quarter)
      .eq("suspect", false)
      .range(start, start + 999);
    // 실패를 빈 배열로 흘리지 않는다. 목록만 접히고 나머지 카드는 그대로 뜬다.
    if (error) return [];
    const page = data ?? [];
    rows.push(...(page as typeof rows));
    if (page.length < 1000) break;
  }
  if (!rows.length) return [];

  const by = new Map<string, { usd: number; holdings: number }>();
  for (const r of rows) {
    const cur = by.get(r.filer_name) ?? { usd: 0, holdings: 0 };
    cur.usd += Number(r.value_usd ?? 0);
    cur.holdings += 1;
    by.set(r.filer_name, cur);
  }
  const total = [...by.values()].reduce((s, v) => s + v.usd, 0);
  // ⚠️ 몫의 분모는 집계표의 institutionUsd 가 아니라 **여기서 낸 합**이다. 둘이 어긋난
  // 분기가 생기면 화면의 %가 100 을 안 맞춘다.
  return [...by.entries()]
    .map(([name, v]) => ({
      name: FILER_KO[name] ?? name,
      usd: v.usd,
      share: total ? (v.usd / total) * 100 : 0,
      holdings: v.holdings,
    }))
    .sort((a, b) => b.usd - a.usd);
}

export async function getSeohakQuarterly(): Promise<SeohakQuarterly | null> {
  const { data, error } = await getSupabaseServer()
    .from("seohak_quarterly_returns")
    .select(
      "quarter_end, institution_usd, total_usd, institution_share, institution_return, rest_return, filer_count",
    )
    .order("quarter_end", { ascending: true });
  warnIfRowCapped(data, "getSeohakQuarterly 의 분기 수익률 전체");

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
  // 신고자 목록은 **같은 분기**여야 한다. 13F 원천에는 더 최근 분기가 들어와 있을 수
  // 있는데(집계는 filer_count 문턱을 넘어야 잡힌다), 그걸 그리면 카드 머리의 기준일과
  // 표의 기준일이 갈린다.
  const filers = await loadFilers(last.quarter_end as string);

  return {
    asOf: last.quarter_end as string,
    filers,
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
