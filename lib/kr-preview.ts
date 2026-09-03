import "server-only";

import { getSupabaseServer } from "./supabase-server";

/**
 * 국장 미리보기(/preview)가 읽는 것.
 *
 * 계산은 전부 파이프라인이 끝내 놓는다(`data-pipeline/scripts/fetch_kr_preview.py`).
 * 여기서는 표를 그대로 읽어 화면이 그릴 모양으로 묶기만 한다.
 *
 * ⚠️ **읽는 시점에 시세를 부르지 않는다.** 핀허브 무료가 분당 60건이라 사전의 미국
 * 70종목을 방문자마다 받을 수 없다(실측: 60개까지 받고 429). 그 제약이 이 화면의 구조를
 * 정했다 — 아침에 한 번 만들어 두고 하루 종일 같은 것을 보인다.
 */

export type PreviewLink = {
  stock: string;
  code: string;
  market: string | null;
  why: string;
  /** ⭐ 관계 **종류**(peer·supply·cycle·license·channel·rival). `why` 가 개별 이름이라면
   *  이건 그걸 묶은 여섯 갈래다. 시트 부제가 그날 뜬 종류를 세어 문장을 짓는다.
   *  ⚠️ 마이그레이션 061 전에 쓰인 줄은 null 이다 — 화면이 고정 문구로 물러선다. */
  kind: string | null;
  /** 과거에 이런 날 개장 갭이 **코스피보다** 얼마나 더 컸는지의 평균(%p). */
  gap: number;
  /** 과거에 그런 날이 몇 번 있었나. */
  events: number;
  /** ⭐ 그 가운데 국내 개장이 미국과 같은 방향이었던 횟수. 마이그레이션 056 전 줄은 null 이다. */
  wins: number | null;
  /** ⭐⭐ 평소라면 그랬을 횟수. **wins 와 짝이라 따로 쓰지 않는다.** */
  base: number | null;
  /** ⭐ 과거 그런 날 이 종목의 **날것** 개장 갭 평균(%). 화면이 내는 건 이 값이다. */
  krOpen: number | null;
  /** ⭐⭐ 같은 날들의 코스피 개장 갭 평균(%). 지금은 화면에 안 낸다. */
  kospiOpen: number | null;
  /** ⭐ 개장 뒤(시가 → 종가) 평균(%). 하루 전체는 krOpen 과 곱해 화면이 낸다. */
  krIntra: number | null;
};

export type PreviewMover = {
  ticker: string;
  /** 그 종목의 미국 테마(섹터). 화면은 이걸 카드 위 작은 라벨로 쓴다 — 섹터로 묶어
   *  큰 상자를 만들지 않는다(섹터마다 종목 수가 1~5 라 상자 키가 제각각이 된다). */
  sector: string;
  usName: string;
  /** 간밤 등락률(%). 사람이 아는 숫자라 초과분이 아니라 이 값을 보인다. */
  dp: number;
  /** 그 종목 평소 폭의 몇 배인가. 등락률만으로는 큰 움직임인지 알 수 없어서 함께 낸다. */
  z: number;
  links: PreviewLink[];
};

export type PreviewSector = { sector: string; movers: PreviewMover[] };

export type PreviewData = {
  /** ⭐ 간밤 S&P500(SPY) 등락률(%). 히어로가 이 값으로 과거 같은 구간의 코스피 성적을 고른다. */
  spx: number | null;
  /** 국내 거래일(KST). ⚠️ 간밤 미장은 그 전날 세션이라 미국 날짜와 하루 어긋난다. */
  date: string | null;
  /** ⭐ 파이프라인이 이 줄들을 쓴 시각(ISO). 히어로 '최종 업데이트' 가 이 값을 쓴다.
   *  수집기가 그날 줄을 통째로 갈아 끼우므로 `created_at` 이 곧 마지막 실행 시각이다. */
  updatedAt: string | null;
  sectors: PreviewSector[];
  moverCount: number;
  pairCount: number;
};

const EMPTY: PreviewData = { date: null, updatedAt: null, spx: null, sectors: [], moverCount: 0, pairCount: 0 };

type Row = {
  date: string;
  created_at: string;
  ticker: string;
  us_name: string;
  sector: string;
  us_dp: number;
  us_z: number;
  stock_code: string;
  stock_name: string;
  why: string;
  kind: string | null;
  gap: number;
  events: number;
  wins: number | null;
  base: number | null;
  kr_open: number | null;
  kospi_open: number | null;
  spx_dp: number | null;
  kr_intra: number | null;
};

export async function getPreview(): Promise<PreviewData> {
  const db = getSupabaseServer();

  // 가장 최근 날짜를 먼저 찾고 그 하루만 읽는다. 날짜를 오늘로 못박으면 파이프라인이
  // 아직 안 돈 새벽에 화면이 통째로 빈다 — 어제 것이라도 있는 편이 낫고, 화면은 날짜를
  // 함께 내므로 낡은 걸 낡았다고 말할 수 있다.
  const latest = await db
    .from("kr_preview_daily")
    .select("date")
    .order("date", { ascending: false })
    .limit(1);
  // 표가 아직 없거나(마이그레이션 전) 비어 있으면 빈 화면으로 둔다. 던지지 않는다 —
  // 이 화면 하나 때문에 셸까지 무너뜨릴 이유가 없다.
  if (latest.error || !latest.data?.length) return EMPTY;

  const date = latest.data[0].date as string;
  const { data, error } = await db
    .from("kr_preview_daily")
    .select("date,created_at,ticker,us_name,sector,us_dp,us_z,stock_code,stock_name,why,kind,gap,events,wins,base,kr_open,kospi_open,spx_dp,kr_intra")
    .eq("date", date);
  if (error || !data?.length) return EMPTY;

  const rows = data as Row[];

  // 시장(KOSPI/KOSDAQ)은 이 표에 없다. 로고가 접미사(.KS/.KQ)를 붙이는 데 쓰므로 따로 받는다.
  const codes = [...new Set(rows.map((r) => r.stock_code))];
  const mk = new Map<string, string>();
  for (let i = 0; i < codes.length; i += 200) {
    const got = await db.from("stocks").select("code,market").in("code", codes.slice(i, i + 200));
    for (const s of got.data ?? []) mk.set(s.code as string, s.market as string);
  }

  const byTicker = new Map<string, PreviewMover>();
  for (const r of rows) {
    let m = byTicker.get(r.ticker);
    if (!m) {
      m = { ticker: r.ticker, sector: r.sector, usName: r.us_name, dp: Number(r.us_dp), z: Number(r.us_z), links: [] };
      byTicker.set(r.ticker, m);
    }
    m.links.push({
      stock: r.stock_name,
      code: r.stock_code,
      market: mk.get(r.stock_code) ?? null,
      why: r.why,
      kind: r.kind ?? null,
      gap: Number(r.gap),
      events: r.events,
      wins: r.wins == null ? null : Number(r.wins),
      base: r.base == null ? null : Number(r.base),
      krOpen: r.kr_open == null ? null : Number(r.kr_open),
      kospiOpen: r.kospi_open == null ? null : Number(r.kospi_open),
      krIntra: r.kr_intra == null ? null : Number(r.kr_intra),
    });
  }
  // 한 종목 안에서는 과거 초과갭이 큰 쪽이 위다.
  for (const m of byTicker.values()) m.links.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));

  const bySector = new Map<string, PreviewMover[]>();
  for (const m of byTicker.values()) {
    const key = rows.find((r) => r.ticker === m.ticker)!.sector;
    (bySector.get(key) ?? bySector.set(key, []).get(key)!).push(m);
  }

  /**
   * ⭐ 섹터 순서는 **그날 신호가 센 순**이다. 사전 전체로 보면 에너지·원자재(평균 r 0.200)
   * 나 전력·원자력(0.199)이 세지만, 그 세기로 줄을 세우면 **그날 조용한 섹터가 맨 위에
   * 온다** — 실측으로 에너지에서 1.1% 움직인 종목 하나가 엔비디아 +7.8% 보다 위에 섰다.
   * 그날의 세기는 평소 대비 배수 × 그 쌍의 과거 초과갭으로 잰다.
   */
  const score = (m: PreviewMover) => m.z * Math.max(...m.links.map((l) => Math.abs(l.gap)), 0);
  const sectors: PreviewSector[] = [...bySector.entries()]
    .map(([sector, movers]) => ({ sector, movers: movers.sort((a, b) => score(b) - score(a)) }))
    .sort((a, b) => score(b.movers[0]) - score(a.movers[0]));

  return {
    date,
    spx: rows[0]?.spx_dp == null ? null : Number(rows[0].spx_dp),
    // 줄마다 같은 값이지만 혹시 섞였다면 **가장 늦은 것**을 쓴다 — 화면이 "이 시각 기준"
    // 이라고 말하는데 그보다 뒤에 쓰인 줄이 있으면 거짓이 된다.
    updatedAt: rows.reduce<string | null>((a, r) => (!a || r.created_at > a ? r.created_at : a), null),
    sectors,
    moverCount: byTicker.size,
    pairCount: rows.length,
  };
}
