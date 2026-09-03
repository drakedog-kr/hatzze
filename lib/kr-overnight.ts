import "server-only";

import { getSupabaseServer } from "./supabase-server";

/**
 * 국내 장이 닫힌 동안 밖에서 붙은 값.
 *
 * 국내 장은 15:30 에 닫고 다음 날 09:00 까지 값이 멈추는데, 삼성전자·SK하이닉스·현대차는
 * 그 사이에도 하이퍼리퀴드(빌더 마켓 `xyz`)에서 계속 거래된다. 달러로 매겨진 그 값을
 * 환율로 되돌린 것이 `krw` 다.
 *
 * ⭐ 이 값은 이 화면의 다른 숫자와 성격이 다르다. 미국 종목 카드는 "엔비디아가 올랐으니
 * 한미반도체가 어떻겠다" 는 간접 신호라 5년 통계를 붙여야 뜻이 서는데, 이건 **그 종목
 * 자신의 값**이다. 실측으로 오전 8시 값과 전날 15시 값을 견주면 그날 실제 개장 갭과
 * 상관 0.94~0.97 이고 기울기가 1.0 이다.
 *
 * ⚠️ 그래서 화면 문구를 조심해야 한다. "오를 것" 으로 쓰면 이 저장소가 지켜 온 선을 넘는다.
 * **"밖에서는 지금 얼마에 거래되고 있다" 는 사실만** 적는다.
 */
export type OvernightRow = {
  code: string;
  name: string;
  /** 선물 심볼(예: xyz:SMSN). 화면에 작게 적어 출처를 밝힌다. */
  symbol: string;
  /** ⭐ 원화 환산가. 화면이 크게 내는 값이다. */
  krw: number;
  /** 달러 표시가. 원화 옆에 작게 붙인다 — 환산 전 값이 있어야 어디서 온 숫자인지 읽힌다. */
  usd: number;
  /** 환산에 쓴 원/달러. */
  fx: number;
  /** 견준 국내 종가와 그 날짜. ⚠️ 날짜를 화면에 함께 낼 것 — 낡은 종가면 diff 가 거짓이다. */
  prevClose: number;
  prevCloseDate: string;
  /** 전날 종가 대비 %(환산가 기준). */
  diffPct: number;
  /** 24시간 거래대금(달러). 얇은 시장을 가리는 데 쓴다. */
  volumeUsd: number | null;
  openInterest: number | null;
};

export type OvernightData = {
  date: string | null;
  /** 값을 찍은 시각(ISO). 화면이 "몇 시 기준" 을 말한다. */
  capturedAt: string | null;
  rows: OvernightRow[];
};

const EMPTY: OvernightData = { date: null, capturedAt: null, rows: [] };

type Raw = {
  date: string;
  code: string;
  name: string;
  symbol: string;
  krw: number;
  perp_usd: number;
  usdkrw: number;
  prev_close: number;
  prev_close_date: string;
  diff_pct: number;
  day_volume_usd: number | null;
  open_interest: number | null;
  captured_at: string;
};

/**
 * 가장 최근 날짜의 줄을 그대로 읽는다.
 *
 * ⚠️ 표가 없거나(마이그레이션 전) 비어 있으면 **던지지 않고 빈 값**을 준다. 이 카드 하나
 * 때문에 화면 전체가 죽으면 안 된다 — 나머지는 다른 표에서 온다.
 */
export async function getOvernight(): Promise<OvernightData> {
  const db = getSupabaseServer();
  const latest = await db
    .from("kr_overnight")
    .select("date")
    .order("date", { ascending: false })
    .limit(1);
  const date = (latest.data?.[0] as { date?: string } | undefined)?.date;
  if (latest.error || !date) return EMPTY;

  const { data, error } = await db
    .from("kr_overnight")
    .select("date,code,name,symbol,krw,perp_usd,usdkrw,prev_close,prev_close_date,diff_pct,day_volume_usd,open_interest,captured_at")
    .eq("date", date);
  if (error || !data?.length) return EMPTY;

  const rows = (data as unknown as Raw[]).map((r) => ({
    code: r.code,
    name: r.name,
    symbol: r.symbol,
    krw: Number(r.krw),
    usd: Number(r.perp_usd),
    fx: Number(r.usdkrw),
    prevClose: Number(r.prev_close),
    prevCloseDate: r.prev_close_date,
    diffPct: Number(r.diff_pct),
    volumeUsd: r.day_volume_usd == null ? null : Number(r.day_volume_usd),
    openInterest: r.open_interest == null ? null : Number(r.open_interest),
  }));

  // 거래대금이 큰 순. 얇은 시장이 맨 앞에 서면 그 값이 대표처럼 읽힌다.
  rows.sort((a, b) => (b.volumeUsd ?? 0) - (a.volumeUsd ?? 0));

  return {
    date,
    capturedAt: (data as unknown as Raw[]).reduce<string | null>(
      (a, r) => (!a || r.captured_at > a ? r.captured_at : a),
      null,
    ),
    rows,
  };
}

/* ── 여기서부터는 **10분마다 새로 받는 값**이다 ────────────────────────────────
 *
 * 아침 파이프라인이 담아 둔 줄은 **하루에 한 번**이라, 09:00 이 가까워질수록 낡는다.
 * 그런데 이 카드가 답하는 물음은 "지금 얼마인가" 라서 그 낡음이 곧 값어치를 깎는다.
 *
 * 그래서 화면을 그릴 때 선물 값과 환율만 새로 받아 덮는다. 10분마다 한 번이면 방문자가
 * 몇이든 상류로는 6분의 1 요청만 나간다(Next 의 fetch 캐시가 방문자 사이에 공유된다).
 *
 * ⚠️⚠️ **기준이 되는 국장 종가는 새로 받지 않는다.** 그건 하루에 한 번만 바뀌는 값이고,
 * 아침에 KRX 에서 받아 담아 둔 것이 정확하다. 여기서 다시 부르면 매 요청마다 KRX 를
 * 두들기면서 얻는 게 없다.
 *
 * ⚠️ **실패하면 담아 둔 값을 그대로 쓴다.** 하이퍼리퀴드나 야후가 넘어졌다고 카드가
 * 사라지면 안 된다 — 낡았다는 사실은 화면의 '시점' 알약이 이미 말한다.
 *
 * ⚠️ 국장이 열려 있는 동안(09:00~15:30)에도 이 값은 계속 붙는다. 다만 그때는 시트 부제의
 * "국장이 닫힌 동안" 이 사실과 어긋난다 — 이 화면 자체가 개장 전용이라 지금은 그대로 뒀다.
 */

const REVALIDATE_SEC = 600;

/**
 * 10분을 **벽시계에 맞춰** 끊는다 — 9:00 · 9:10 · 9:20 …
 *
 * ⚠️ `revalidate: 600` 만으로는 안 된다. 그건 **처음 받은 때부터** 600초라, 첫 방문이
 * 9:12 면 그다음이 9:22 · 9:32 로 어긋난 채 굳는다. 서버가 다시 뜨면 또 다른 자리로 옮겨
 * 간다. 그래서 요청 주소에 10분 칸 번호를 붙여 **칸이 바뀌면 다른 요청**이 되게 한다.
 * 같은 칸 안에서는 주소가 같으니 캐시가 그대로 나온다.
 *
 * ⚠️ 하이퍼리퀴드는 POST 인데 질의 문자열은 무시한다 — 값에 영향이 없고 캐시 키만 바뀐다.
 */
function bucketMs(): number {
  return Math.floor(Date.now() / (REVALIDATE_SEC * 1000)) * REVALIDATE_SEC * 1000;
}
const HL_INFO = "https://api.hyperliquid.xyz/info";
const HL_DEX = "xyz";
const FX_URL = "https://query1.finance.yahoo.com/v8/finance/chart/KRW=X?range=1d&interval=5m";

/** 심볼 → {달러 표시가, 미결제, 24시간 거래대금}. 한 번의 호출로 그 dex 전체를 받는다. */
async function livePerps(): Promise<{
  px: Record<string, { usd: number; oi: number; vlm: number }>;
  /** ⚠️⚠️ **렌더 시각을 쓰지 말 것.** 이 요청은 10분 캐시라 새로고침해도 값이 안 바뀌는데,
   *  시각만 `new Date()` 로 내면 알약이 매 초 앞으로 간다 — "오전 1:19 시점" 이라고 적힌
   *  옆에 1:09 에 받은 값이 서 있게 된다(2026-09-04 실측). */
  at: string;
} | null> {
  try {
    const res = await fetch(`${HL_INFO}?t=${bucketMs()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "metaAndAssetCtxs", dex: HL_DEX }),
      next: { revalidate: REVALIDATE_SEC },
    });
    if (!res.ok) return null;
    const [meta, ctxs] = (await res.json()) as [
      { universe: { name: string }[] },
      { markPx: string; openInterest?: string; dayNtlVlm?: string }[],
    ];
    const out: Record<string, { usd: number; oi: number; vlm: number }> = {};
    meta.universe.forEach((u, i) => {
      const c = ctxs[i];
      if (!c?.markPx) return;
      out[u.name] = { usd: Number(c.markPx), oi: Number(c.openInterest ?? 0), vlm: Number(c.dayNtlVlm ?? 0) };
    });
    // ⭐ **칸의 시작 시각**을 적는다(9:10 · 9:20 …). 응답의 Date 헤더를 그대로 쓰면 그 칸에
    // 처음 들어온 방문자가 언제 왔는지에 따라 9:17 처럼 어중간한 값이 찍힌다.
    // ⚠️ 이 표기는 실제보다 **오래된 쪽**으로만 틀린다(칸 시작 ≤ 받은 시각). 값을 실제보다
    //    싱싱해 보이게 만드는 방향으로는 안 틀리므로 안전한 쪽이다.
    return { px: out, at: new Date(bucketMs()).toISOString() };
  } catch {
    return null;
  }
}

/** 원/달러. 수집기와 같은 원천(야후 KRW=X)이라 아침 값과 결이 갈리지 않는다. */
async function liveFx(): Promise<number | null> {
  try {
    // ⚠️ User-Agent 가 없으면 야후가 429 를 준다.
    const res = await fetch(`${FX_URL}&t=${bucketMs()}`, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: REVALIDATE_SEC },
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { chart?: { result?: { meta?: { regularMarketPrice?: number } }[] } };
    const v = j.chart?.result?.[0]?.meta?.regularMarketPrice;
    return typeof v === "number" && v > 0 ? v : null;
  } catch {
    return null;
  }
}

/**
 * 담아 둔 줄 위에 **지금 값**을 덮어 준다. 하나라도 못 받으면 담아 둔 값을 그대로 돌려준다.
 */
export async function getOvernightLive(): Promise<OvernightData & { live: boolean }> {
  const stored = await getOvernight();
  if (stored.rows.length === 0) return { ...stored, live: false };

  const [perps, fx] = await Promise.all([livePerps(), liveFx()]);
  if (!perps || !fx) return { ...stored, live: false };

  const rows = stored.rows.map((r) => {
    const p = perps.px[r.symbol];
    if (!p) return r;
    const krw = p.usd * fx;
    return {
      ...r,
      usd: p.usd,
      fx,
      krw: Math.round(krw),
      diffPct: Number(((krw / r.prevClose - 1) * 100).toFixed(2)),
      volumeUsd: p.vlm || r.volumeUsd,
      openInterest: p.oi || r.openInterest,
    };
  });
  // 거래대금이 큰 순. 담아 둔 순서와 같은 규칙이라 카드 자리가 안 흔들린다.
  rows.sort((a, b) => (b.volumeUsd ?? 0) - (a.volumeUsd ?? 0));
  // ⚠️ 렌더 시각이 아니라 **받은 시각**이다(위 livePerps 주석 참고).
  return { ...stored, rows, capturedAt: perps.at, live: true };
}
