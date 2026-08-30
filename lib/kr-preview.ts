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
  /** 과거에 이런 날 개장 갭이 **코스피보다** 얼마나 더 컸는지의 평균(%p). */
  gap: number;
  events: number;
};

export type PreviewMover = {
  ticker: string;
  usName: string;
  /** 간밤 등락률(%). 사람이 아는 숫자라 초과분이 아니라 이 값을 보인다. */
  dp: number;
  /** 그 종목 평소 폭의 몇 배인가. 등락률만으로는 큰 움직임인지 알 수 없어서 함께 낸다. */
  z: number;
  links: PreviewLink[];
};

export type PreviewSector = { sector: string; movers: PreviewMover[] };

export type PreviewData = {
  /** 국내 거래일(KST). ⚠️ 간밤 미장은 그 전날 세션이라 미국 날짜와 하루 어긋난다. */
  date: string | null;
  sectors: PreviewSector[];
  moverCount: number;
  pairCount: number;
};

const EMPTY: PreviewData = { date: null, sectors: [], moverCount: 0, pairCount: 0 };

type Row = {
  date: string;
  ticker: string;
  us_name: string;
  sector: string;
  us_dp: number;
  us_z: number;
  stock_code: string;
  stock_name: string;
  why: string;
  gap: number;
  events: number;
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
    .select("date,ticker,us_name,sector,us_dp,us_z,stock_code,stock_name,why,gap,events")
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
      m = { ticker: r.ticker, usName: r.us_name, dp: Number(r.us_dp), z: Number(r.us_z), links: [] };
      byTicker.set(r.ticker, m);
    }
    m.links.push({
      stock: r.stock_name,
      code: r.stock_code,
      market: mk.get(r.stock_code) ?? null,
      why: r.why,
      gap: Number(r.gap),
      events: r.events,
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
    sectors,
    moverCount: byTicker.size,
    pairCount: rows.length,
  };
}
