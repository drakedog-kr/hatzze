import "server-only";

import { readFileSync } from "node:fs";

import { getDevOverrides } from "./dev-overrides";
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
  /**
   * ⭐ 사전이 본 방향 — 지수 몫을 뺀 초과분이 (+)인가. 국장 줄의 숫자(오른 날 · 내린 날 성적)가 이 방향을 따른다.
   * ⚠️ 등락률 부호와 다를 수 있다(시장이 3% 오른 날 1% 오른 종목은 '내린 날'). 그날치 한 줄의 짝 목록(pairs ·
   *    마이그레이션 101)에서 읽고, 그 전 줄은 등락률 부호로 물러선다. '겹친 국장 종목'을 셀 때 같은 방향끼리만 센다.
   */
  up: boolean;
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
  /**
   * ⭐ 밤사이 미장이 쉬었으면 그 휴장 이름(노동절 등), 열렸으면 null(마이그레이션 083).
   * 이 값이 있으면 종목 줄은 없고, `spx` 는 **마지막 거래일**(`usSession`)의 등락이다.
   * ⚠️ 그날 spx 로 구간표(KOSPI_AFTER)를 고르지 말 것. 그 움직임은 전날 개장에서 이미 끝났다.
   */
  usHoliday: string | null;
  /** spx 가 나온 미장 세션 날짜(미 동부). 083 전 줄은 null 이다. */
  usSession: string | null;
  /**
   * ⭐ 누적이 시작된 미장 세션(마이그레이션 085). `usSession` 보다 앞이면 국장이 쉬는 동안
   * 미장이 여러 번 열린 날이고, `spx`·종목 등락이 그 세션들의 **누적**이다. 화면이 "연휴 동안" 으로 적는다.
   */
  usFrom: string | null;
  /** ⭐ 밤사이 SOXX(반도체 ETF) 등락 %(마이그레이션 101). 없으면 화면이 그 줄을 안 그린다. */
  soxx: number | null;
  /**
   * ⭐ EWY 의 국장 종가 대비 괴리 %(마이그레이션 101). EWY 하루 등락률이 아니다 — 국장이 닫힌 뒤 한국 주식 묶음이
   * 미국에서 더 움직인 몫이다(fetch_kr_preview.py ewy_premium). 기록이 다섯 번 쌓이기 전에는 null.
   */
  ewyPrem: number | null;
  /** 오늘이거나 그 뒤의 첫 국장 개장일(마이그레이션 101). `date` 와 다르면 오늘은 국장이 쉬는 날이다. */
  nextOpen: string | null;
};

const EMPTY: PreviewData = {
  date: null, updatedAt: null, spx: null, sectors: [], moverCount: 0, pairCount: 0, usHoliday: null, usSession: null, usFrom: null,
  soxx: null, ewyPrem: null, nextOpen: null,
};

/** 깊은 쌍 하나의 그날 값(kr_preview_day.pairs · 마이그레이션 101). 종목 화면의 '함께 움직이는' 모듈이 읽는다. */
export type NightPair = {
  /** 미국 티커 · 한글 이름 */
  t: string;
  us: string;
  /** 국내 종목코드 · 이름 */
  code: string;
  stock: string;
  /** KOSPI · KOSDAQ — 로고 접미사. 수집기가 2026-10-15 뒤로 담는다(없으면 로고 대신 글자 배지). */
  market?: string | null;
  why: string;
  /** 밤사이 미국 등락 % · 평소 폭 배수 · 사전이 본 방향(초과분 부호) */
  dp: number;
  z: number;
  up: boolean;
  /** 최근 5년 이런 날 국내 개장 · 장 중 평균 %. 평소 폭(1.0배)을 넘은 쌍에만 있다 — 문턱 아래는 '이런 날' 이 아니다. */
  open: number | null;
  intra: number | null;
};

type DayRow = {
  date: string; spx_dp: number | null; created_at: string;
  us_session?: string | null; us_holiday?: string | null; us_from?: string | null;
  soxx_dp?: number | null; ewy_prem?: number | null; next_open?: string | null; pairs?: NightPair[] | null;
};

/**
 * 그날치 한 줄에서 읽을 칸. **새 칸부터 하나씩 빼며** 다시 읽는다 — 칸이 없는 표(마이그레이션
 * 083·085 전)에는 조회가 400 으로 오기 때문이다. 한꺼번에 빼면 085 만 없을 때 휴장 칸까지 잃는다.
 * (4xx 라 load-state 의 실패로 세지 않는다. lib/supabase-server.ts noteIfFailed 주석)
 * ⚠️ 이게 다 실패해 줄이 없으면 아래가 종목 표로 물러서서 063 이 고친 '조용한 밤' 문제가 되살아난다.
 */
const DAY_COLS = [
  "date,spx_dp,created_at,us_session,us_holiday,us_from,soxx_dp,ewy_prem,next_open,pairs",
  "date,spx_dp,created_at,us_session,us_holiday,us_from",
  "date,spx_dp,created_at,us_session,us_holiday",
  "date,spx_dp,created_at",
];

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

/**
 * 로컬 전용 — 수집기가 `--dry-run --dump` 로 뽑은 그날 줄을 DB 대신 읽는다(dev-overrides.json 의 previewDump 경로).
 * 수집 · 계산을 고친 뒤 **운영 표에 쓰기 전에** 화면을 보는 길이다. 운영 빌드에서는 getDevOverrides 가 늘 비어 있다.
 */
function devDump(): { day: DayRow; rows: Row[] } | null {
  const path = getDevOverrides().previewDump;
  if (!path) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as { day: DayRow; rows: Row[] };
  } catch {
    return null;
  }
}

/** 미장이 쉬었을 때를 뺀, 그날치 한 줄의 새 칸들(101)을 화면 값으로. */
function nightExtras(day: DayRow | null): Pick<PreviewData, "soxx" | "ewyPrem" | "nextOpen"> {
  return {
    soxx: day?.soxx_dp == null ? null : Number(day.soxx_dp),
    ewyPrem: day?.ewy_prem == null ? null : Number(day.ewy_prem),
    nextOpen: day?.next_open ?? null,
  };
}

/** 가장 최근 그날치 한 줄. 새 칸부터 하나씩 빼며 읽는다(DAY_COLS 주석). 로컬 덤프가 있으면 그것. */
async function latestDay(): Promise<DayRow | null> {
  const dump = devDump();
  if (dump) return dump.day;
  const db = getSupabaseServer();
  for (const cols of DAY_COLS) {
    const day = await db.from("kr_preview_day").select(cols).order("date", { ascending: false }).limit(1);
    if (day.error) continue;
    return (day.data?.[0] ?? null) as unknown as DayRow | null;
  }
  return null;
}

export async function getPreview(): Promise<PreviewData> {
  const db = getSupabaseServer();
  const dump = devDump();

  /**
   * ⭐⭐ **날짜는 `kr_preview_day`(하루 한 줄)에서 고른다.** 종목 표에서 고르면 안 된다.
   *
   * 종목 표는 종목 줄만 담아서, 밤사이 크게 움직인 곳이 하나도 없는 날에는 그날 줄이 한
   * 개도 안 생긴다. 거기서 "가장 최근 날짜" 를 고르면 **어제**가 잡혀 어제 종목이 그대로
   * 그려지고 히어로의 S&P 숫자까지 어제 것이 된다. 그런 날을 위해 써 둔 문구
   * ("…조용한 밤이었습니다")도 화면이 보는 줄이 어제 것이라 영영 안 뜬다.
   *
   * ⚠️ 날짜만으로는 못 가른다. 아침 실행(07:01) 전에 어제 것을 보여 주는 건 **의도한
   *    동작**이라, "아직 안 돌았다" 와 "돌았는데 없었다" 가 오늘 날짜인지로는 구별되지
   *    않는다. 돌았다는 **기록**이 있어야 갈린다(마이그레이션 063).
   *
   * ⚠️ 그 표가 아직 없으면(마이그레이션 전) 예전처럼 종목 표에서 고른다. 그때는 조용한
   *    날 문제가 그대로지만 화면이 죽지는 않는다.
   */
  let dayRow = await latestDay();
  // 로컬에서만 세션·휴장을 얹어 본다(lib/dev-overrides.ts · 운영 빌드에선 늘 비어 있다).
  const devDay = getDevOverrides().previewDay;
  if (devDay && dayRow) {
    dayRow = {
      ...dayRow,
      us_session: devDay.usSession ?? dayRow.us_session,
      us_holiday: devDay.usHoliday ?? dayRow.us_holiday,
      us_from: devDay.usFrom ?? dayRow.us_from,
    };
  }
  const usSession = dayRow?.us_session ?? null;
  const usFrom = dayRow?.us_from ?? null;

  /**
   * ⭐⭐ **미장이 쉰 밤에는 종목 표를 읽지 않는다.** 수집기가 그날 종목 줄을 안 쓰고 지우지만,
   * 혹시 남아 있어도 그리면 안 된다 — 지난 세션의 카드이고, 카드 수치를 낸 백테스트는 이런
   * 날을 건너뛴다. 예전엔 이 구별이 없어 노동절 다음 날(2026-09-08)에 09-04 카드 14장이
   * "밤사이" 로 다시 떴다(fetch_kr_preview.py night_state 주석).
   */
  if (dayRow?.us_holiday) {
    return {
      ...EMPTY,
      date: dayRow.date,
      updatedAt: dayRow.created_at,
      spx: dayRow.spx_dp == null ? null : Number(dayRow.spx_dp),
      usHoliday: dayRow.us_holiday,
      usSession,
      usFrom,
      // 다음 개장일만 — 반도체 · EWY 는 지난 세션 값이라 휴장 화면에 안 낸다(S&P 를 큰 숫자로 안 두는 것과 같은 이유).
      nextOpen: dayRow.next_open ?? null,
    };
  }

  let date: string;
  if (dayRow) {
    date = dayRow.date;
  } else {
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
    date = latest.data[0].date as string;
  }

  const { data, error } = dump
    ? { data: dump.rows.map((r) => ({ ...r, created_at: dump.day.created_at })), error: null }
    : await db
        .from("kr_preview_daily")
        .select("date,created_at,ticker,us_name,sector,us_dp,us_z,stock_code,stock_name,why,kind,gap,events,wins,base,kr_open,kospi_open,spx_dp,kr_intra")
        .eq("date", date);
  // ⚠️ **줄이 0개인 것은 고장이 아니다** — 조용한 밤이다. 그날치 한 줄이 있으면 날짜와
  //    지수를 그 줄에서 꺼내 "오늘은 조용했다" 를 말할 수 있다. 그 줄조차 없을 때만 빈다.
  if (error) return EMPTY;
  const rows = (data ?? []) as Row[];
  if (!rows.length && !dayRow) return EMPTY;

  // 시장(KOSPI/KOSDAQ)은 이 표에 없다. 로고가 접미사(.KS/.KQ)를 붙이는 데 쓰므로 따로 받는다.
  const codes = [...new Set(rows.map((r) => r.stock_code))];
  const mk = new Map<string, string>();
  for (let i = 0; i < codes.length; i += 200) {
    const got = await db.from("stocks").select("code,market").in("code", codes.slice(i, i + 200));
    for (const s of got.data ?? []) mk.set(s.code as string, s.market as string);
  }

  // 사전이 본 방향(초과분 부호). 짝 목록이 없는 줄(101 전)은 등락률 부호로 물러선다(PreviewMover.up 주석).
  const upOf = new Map((dayRow?.pairs ?? []).map((p) => [p.t, p.up]));
  const byTicker = new Map<string, PreviewMover>();
  for (const r of rows) {
    let m = byTicker.get(r.ticker);
    if (!m) {
      m = {
        ticker: r.ticker, sector: r.sector, usName: r.us_name, dp: Number(r.us_dp), z: Number(r.us_z),
        up: upOf.get(r.ticker) ?? Number(r.us_dp) > 0, links: [],
      };
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
    // ⭐ 그날치 한 줄이 먼저다. 종목이 0개인 날에는 그 줄에만 지수가 있다.
    spx: dayRow?.spx_dp != null ? Number(dayRow.spx_dp) : rows[0]?.spx_dp == null ? null : Number(rows[0].spx_dp),
    // 줄마다 같은 값이지만 혹시 섞였다면 **가장 늦은 것**을 쓴다 — 화면이 "이 시각 기준"
    // 이라고 말하는데 그보다 뒤에 쓰인 줄이 있으면 거짓이 된다.
    updatedAt:
      rows.reduce<string | null>((a, r) => (!a || r.created_at > a ? r.created_at : a), null) ??
      dayRow?.created_at ??
      null,
    sectors,
    moverCount: byTicker.size,
    pairCount: rows.length,
    usHoliday: null,
    usSession,
    usFrom,
    ...nightExtras(dayRow),
  };
}

export type NightPairs = {
  date: string;
  usSession: string | null;
  usFrom: string | null;
  pairs: NightPair[];
};

/**
 * 종목 화면(국장 /stock/[code] · 미장 /insider/stock/[ticker])의 '함께 움직이는' 모듈 재료 — 그날 깊은 쌍 전부.
 *
 * ⭐ 짝 목록(pairs · 101)이 있으면 그것을, 없으면(101 전 줄) 그날 카드 줄(문턱을 넘은 쌍만)로 물러선다.
 * ⚠️ 미장이 쉰 밤에는 null — 지난 세션 값을 오늘 것처럼 세우지 않는다(getPreview 의 휴장 분기와 같은 이유).
 * ⚠️ 던지지 않는다. 이 모듈 하나 때문에 종목 화면 464장이 무너지면 안 된다.
 */
export async function getNightPairs(): Promise<NightPairs | null> {
  try {
    const day = await latestDay();
    if (!day || day.us_holiday) return null;
    const base = { date: day.date, usSession: day.us_session ?? null, usFrom: day.us_from ?? null };
    if (day.pairs) return { ...base, pairs: day.pairs };
    const dump = devDump();
    const got = dump
      ? { data: dump.rows, error: null }
      : await getSupabaseServer()
          .from("kr_preview_daily")
          .select("ticker,us_name,us_dp,us_z,stock_code,stock_name,why,kr_open,kr_intra")
          .eq("date", day.date);
    if (got.error) return null;
    const pairs = ((got.data ?? []) as Row[]).map((r) => ({
      t: r.ticker, us: r.us_name, code: r.stock_code, stock: r.stock_name, why: r.why,
      dp: Number(r.us_dp), z: Number(r.us_z), up: Number(r.us_dp) > 0,
      open: r.kr_open == null ? null : Number(r.kr_open), intra: r.kr_intra == null ? null : Number(r.kr_intra),
    }));
    return { ...base, pairs };
  } catch (e) {
    console.error("[getNightPairs] 짝 목록을 못 읽었습니다 — 모듈만 뺍니다", e);
    return null;
  }
}

/**
 * 화면 곳곳의 "밤사이" 자리에 들어갈 말. 국장 미리보기(app/preview/page.tsx)와 시장 브리핑 히어로 바닥
 * 칩(app/home/spotlight-data.ts)이 같이 쓴다. 카드의 미장 세션이 **어젯밤** 것이면 "밤사이",
 * 그보다 앞이면 그 세션의 요일("금요일")이고, 세션이 여럿 쌓였으면 "연휴 동안" 이다.
 *
 *   토 아침  세션 금 = 어제      → 밤사이(금요일 미장이 정말 그 밤사이에 닫혔다)
 *   일·월 아침 세션 금 < 어제    → 금요일(그 밤에는 미장이 없었다)
 *   추석 뒤 월 09-28 세션 09-23~25 → 연휴 동안(수집기가 세 세션을 누적했다 · usFrom 09-23)
 *
 * ⚠️ "연휴 동안" 을 요일보다 먼저 본다. 09-28 의 마지막 세션은 금요일이지만 숫자는 수·목·금
 *    누적이라 "금요일" 로 적으면 틀린다.
 *
 * ⚠️ 카드를 비우지 않고 말만 바꾼다. 월요일 개장이 반응하는 게 바로 금요일 미장이고
 *    백테스트도 월요일을 금요일 세션과 짝지어 쟀다. 주말 방문이 몰리는 일요일 저녁도
 *    월요일을 준비하는 때라 그 카드가 필요하다(휴장 다음 날과 다른 점이다).
 * ⚠️ 비교 잣대는 달력의 오늘이 아니라 그 줄의 국내 날짜(`date`)다. 아침 실행 전 새벽에
 *    어제 줄을 보여 줄 때도 그 줄 기준으로 맞아야 한다.
 * `usSession` 이 없는 줄(마이그레이션 083 전·수집기 배포 전)은 예전처럼 "밤사이" 다.
 */
export function sessionWord(date: string | null, usSession: string | null, usFrom: string | null): string {
  const span = sessionSpan(date, usSession, usFrom);
  if (span === "stretch") return "연휴 동안";
  if (span === "night" || !usSession) return "밤사이";
  return `${"일월화수목금토"[new Date(`${usSession}T00:00:00Z`).getUTCDay()]}요일`;
}

/** sessionWord 가 가르는 세 경우 — 어젯밤 세션 · 여러 세션 누적 · 그보다 앞 세션 하나(주말 뒤). */
export type SessionSpan = "night" | "stretch" | "earlier";

export function sessionSpan(date: string | null, usSession: string | null, usFrom: string | null): SessionSpan {
  if (!date || !usSession) return "night";
  if (usFrom && usFrom < usSession) return "stretch";
  const lastNight = new Date(Date.parse(`${date}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  return usSession >= lastNight ? "night" : "earlier";
}
