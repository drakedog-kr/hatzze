import { getSupabaseServer } from "@/lib/supabase-server";

/**
 * 서학개미 해부도의 **종류 층** — 화면 이름은 '종류별 구성'.
 *
 * 이 화면은 "얼마나"(TIC 잔고)와 "언제"(예탁원 일별)는 말해 왔지만 **무엇을** 들고
 * 있는지는 못 말했다. 13F 는 기관 9곳뿐이고 예탁원 종목별은 법인 전용이라 막혀 있는데,
 * 종류 단위라면 미 재무부 SHL 연례 조사가 나라별로 그대로 준다.
 *
 * 원천 표는 `seohak_equity_type`(연 1회 · 6월 말 기준 · 이듬해 4월경 공표). 96행뿐이라
 * 전량을 받아도 된다.
 *
 * ## ⚠️ 비교 대상 없이 한국만 보면 안 된다
 *
 * 한국의 '우선주·기타'는 2021년에 10.4%→19.2% 로 두 배가 됐다. 그 해 전 세계가
 * 6.8→6.7 로 가만히 있었다는 걸 같이 보여야 **조사 분류가 바뀐 게 아니라 한국인의
 * 실제 변화**라고 말할 수 있다. 그래서 `world` 를 항상 같이 싣는다.
 */

export type EquityMix = {
  year: number;
  total: number;
  common: number;
  funds: number;
  other: number;
  /** 비중(%). 화면이 매번 나누지 않게 여기서 낸다. */
  commonPct: number;
  fundsPct: number;
  otherPct: number;
};

export type SeohakEquityType = {
  latest: EquityMix;
  first: EquityMix;
  /** 한국의 12년 추이. */
  series: EquityMix[];
  /** 같은 기간 전 세계. '한국만 움직였다'를 말하려면 이게 있어야 한다. */
  world: EquityMix[];
  worldLatest: EquityMix;
  /** 가장 크게 움직인 칸과 그 변화(%p). 결론 문장이 이걸 쓴다. */
  mover: { key: "common" | "funds" | "other"; label: string; deltaPp: number };
};

type Raw = {
  survey_year: number;
  country_code: string;
  total_usd_mn: number | null;
  common_usd_mn: number | null;
  funds_usd_mn: number | null;
  other_usd_mn: number | null;
};

const mix = (r: Raw): EquityMix => {
  const total = Number(r.total_usd_mn ?? 0);
  const common = Number(r.common_usd_mn ?? 0);
  const funds = Number(r.funds_usd_mn ?? 0);
  const other = Number(r.other_usd_mn ?? 0);
  const pct = (v: number) => (total ? (v / total) * 100 : 0);
  return {
    year: r.survey_year,
    total,
    common,
    funds,
    other,
    commonPct: pct(common),
    fundsPct: pct(funds),
    otherPct: pct(other),
  };
};

export async function getSeohakEquityType(): Promise<SeohakEquityType | null> {
  const { data, error } = await getSupabaseServer()
    .from("seohak_equity_type")
    .select("survey_year, country_code, total_usd_mn, common_usd_mn, funds_usd_mn, other_usd_mn")
    .in("country_code", ["KR", "WORLD"])
    .order("survey_year", { ascending: true });

  // 표가 아직 없을 수 있으므로 던지지 않고 null 을 돌려 그 층만 접게 한다.
  if (error || !data?.length) return null;

  const rows = data as Raw[];
  const series = rows.filter((r) => r.country_code === "KR").map(mix);
  const world = rows.filter((r) => r.country_code === "WORLD").map(mix);
  if (series.length < 2 || !world.length) return null;

  const first = series[0];
  const latest = series[series.length - 1];

  // 가장 크게 움직인 칸. 손으로 적어 두면 조사가 갱신된 날 화면이 거짓말한다.
  const moves = [
    { key: "common" as const, label: "보통주", deltaPp: latest.commonPct - first.commonPct },
    { key: "funds" as const, label: "펀드·ETF", deltaPp: latest.fundsPct - first.fundsPct },
    { key: "other" as const, label: "우선주·기타", deltaPp: latest.otherPct - first.otherPct },
  ];
  const mover = moves.reduce((a, b) => (Math.abs(b.deltaPp) > Math.abs(a.deltaPp) ? b : a));

  return {
    latest,
    first,
    series,
    world,
    worldLatest: world[world.length - 1],
    mover,
  };
}
