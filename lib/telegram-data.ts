import "server-only";

import { cache } from "react";

import { channelPhotoUrl } from "@/lib/channel-photo";
import { sentimentTone } from "@/lib/format";
import { THEMES } from "@/lib/stock-themes";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { changeRateOf, fetchYahooQuote } from "@/lib/yahoo-quote";

// 카더라 리포트 데이터 접근 계층. telegram_* 테이블은 비공개(공개 read 없음)라
// service_role 클라이언트(getSupabaseAdmin)로만 읽는다 — 서버에서만 호출된다.
// 종목명은 stocks(공개)에서 조인하고, 집계·정렬은 데이터가 작아 JS에서 처리한다.

const TREND_W_VIEWS = 0.5;
const TREND_W_FWD = 3.0;
const TREND_W_REPLIES = 1.5;

function daysAgoISO(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

/** 오늘(KST) 날짜 문자열. 아직 하루가 덜 찬 오늘을 집계에서 제외할 때 쓴다. */
function todayKstDate(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * 오늘(KST)에서 days 일 전 날짜. `date` 컬럼을 조회하는 하한에 쓴다.
 *
 * daysAgoISO 와 하루 어긋날 때가 있다. `date` 는 KST 달력 날짜인데
 * (calculate_stock_daily.py 가 posted_at 을 KST 로 옮겨 적는다) daysAgoISO 는 UTC 로
 * 재므로, 00~09시 KST 사이에는 하루 이른 날짜를 준다. 그 시간대에만 창이 하루 길어져
 * 파이프라인(today_kst() 기준)과 조용히 어긋나므로, 파이프라인과 같은 창을 써야 하는
 * 조회는 이쪽을 쓴다.
 */
function daysAgoKstDate(days: number): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000 - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

/** "YYYY-MM-DD" 에 n일을 더한 날짜. 창의 경계를 만들 때 쓴다. */
function addDaysISO(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * 카더라 리포트의 **기준일** — telegram_sentiment_daily 의 최신 날짜.
 *
 * 파이프라인 generate_telegram_narratives.py 의 `latest` 와 **같은 표의 같은 값**이다.
 * 화면의 창을 여기에 매다는 이유는 하나다 — 이 페이지의 숫자와 그 옆 LLM 문장이 같은
 * 사흘을 말해야 하는데, 문장은 파이프라인이 돌 때 굳고 숫자는 요청마다 다시 계산되기
 * 때문이다. 창의 끝을 벽시계('지금의 KST 오늘')로 잡으면 **새 데이터 없이 자정에만
 * 창이 하루 굴러**, 오전 실행이 끝날 때까지 둘이 서로 다른 기간을 말한다.
 *
 * 실제로 어긋났다(2026-08-05 00:30 KST): 카드가 낙관 71%(08-02~08-04)인데 그 옆 문장은
 * "66%"(08-01~08-03)였다. 그사이 들어온 새 데이터는 없었고, 빠진 날이 토요일이라
 * 5%p 가 벌어졌다. "최근 3일 · N건 분석" 캡션도 7,329 대신 9,515 로 떠 있었다.
 *
 * 기준일에 매달면 화면이 움직이는 계기가 파이프라인 실행 둘(오전·오후)뿐이 된다.
 * 오후 실행도 값을 바꾼다 — 분류가 Batch API 라 제출과 수거가 다른 실행에서 일어나
 * (analyze_telegram_messages.py), 어젯밤 글이 오후 실행에서야 수거돼 어제 행에 얹힌다.
 *
 * 표가 비어 있으면(초기 환경) 벽시계로 떨어진다. 그때는 맞출 문장도 없다.
 */
const kaderaBaseDate = cache(async (): Promise<string> => {
  const db = getSupabaseAdmin();
  const { data } = await db
    .from("telegram_sentiment_daily")
    .select("date")
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.date as string | undefined) ?? todayKstDate();
});

/**
 * **기준일을 뺀** 그 앞 n일의 날짜 목록(오래된→최신).
 *
 * 기준일을 빼는 이유는 하나다 — 아직 하루가 덜 차서, 넣으면 막대가 늘 짧게 나오고
 * 그 반쪽짜리 하루가 합계에도 섞인다. 파이프라인도 같은 자리에서 하루를 뺀다
 * (generate_telegram_narratives.build_brief_digest 의 `end = latest - 1일`).
 *
 * 창을 쓰는 곳마다 이 계산을 따로 하면 "같은 최근 N일"이 서로 다른 N일이 되므로
 * (실제로 카드 1,828 vs 요약문 1,727 로 어긋난 적이 있다) 여기 하나로 모은다.
 */
function windowBefore(base: string, n: number): string[] {
  const end = addDaysISO(base, -1);
  return Array.from({ length: n }, (_, i) => addDaysISO(end, -(n - 1 - i)));
}

/**
 * **생태계 센티먼트 · 주요 종목 리포트**가 함께 쓰는 창(일). 2026-07-26 에 7 → 3 으로
 * 내렸다 — 일주일치는 이미 지나간 얘기가 절반이라 "지금 무엇이 오가나"를
 * 흐렸다.
 *
 * ⚠️ **파이프라인 WINDOW_DAYS 와 같은 값이어야 한다**
 * (data-pipeline/scripts/generate_telegram_narratives.py). 화면 숫자는 여기서, 그 옆
 * LLM 문장은 저기서 나오므로 값이 갈리면 한 카드가 서로 다른 기간을 말한다.
 * Python 과 TS 라 import 로 공유할 수 없어 손으로 맞춘 사본이다.
 *
 * 창은 **길이와 끝점 둘 다** 맞아야 한다. 길이만 맞춰 두고 끝점을 각자 잡았다가
 * 자정에 하루 어긋난 적이 있다(kaderaBaseDate 주석). 끝점은 이제 기준일 하나로 묶여 있다.
 *
 * 이 창을 쓰지 **않는** 것들: 모니터링 현황(활성 채널·총 메시지 7일), 뜨는 채널,
 * 이슈 키워드, 테마 로테이션, 트렌딩 메시지(자체 기간 탭). 각자 이유가 있어 그대로 둔다.
 */
export const KADERA_WINDOW_DAYS = 3;

/**
 * 종목 리포트 **막대 차트**가 그리는 일수. 세는 창(KADERA_WINDOW_DAYS)보다 길다.
 *
 * 3칸짜리 막대는 추이가 안 읽힌다 — "지금 얼마나 뜨거운가"는 최근 3일이 맞지만, 그게
 * 평소보다 많은 건지 적은 건지는 앞선 날들이 있어야 보인다. 눈으로 읽는 축만 길게 둔다.
 * 뒤쪽 KADERA_WINDOW_DAYS 칸이 곧 집계 구간이고, 화면은 그 칸만 진하게 그린다
 * (StockTrendPoint.scored).
 */
export const STOCK_CHART_DAYS = 7;

/**
 * 페이징 대상 쿼리 — 필터까지만 건 상태. `.order()`·`.range()` 는 fetchAllRows 가 건다.
 * 정렬을 호출부에 맡기지 않으려고 일부러 이 모양으로 받는다(아래 주석 참고).
 */
type PagedQuery<T> = {
  order(column: string): {
    range(from: number, to: number): PromiseLike<{ data: T[] | null }>;
  };
};

/**
 * 표 전체를 페이지를 이어 받아 읽는다.
 *
 * 함정이 둘이고, 겪는 순서도 그렇다.
 *
 * **[1] 1,000행 캡** — PostgREST는 한 번에 최대 1,000행만 주고 그 이상은
 * **에러 없이 잘린다**. 일별 집계 표는 날짜가 쌓일수록 커져서(화제어는 하루 200행꼴)
 * 상한을 넘기면 최신 날짜가 통째로 빠지고, "최근 3일 vs 이전" 같은 비교가 조용히
 * 어긋난다. 실제로 화제어 증감(▲▼)이 전부 사라지는 버그가 이 때문에 났다.
 *
 * **[2] 정렬 키의 유일성** — `.range()` 페이징은 요청마다 별개의 쿼리라, 정렬이
 * 없거나 정렬 키가 유일하지 않으면 동점 행들의 순서를 DB가 보장하지 않는다. 그러면
 * 페이지 경계에 걸친 행이 다음 요청에서 자리를 바꿔 **빠지거나 겹친다**. 1,000행
 * 캡과 달리 총 건수는 맞아 보여서 훨씬 안 보인다 — 파이프라인 쪽에서 `indicator_values`
 * 를 `.order("date")` 로 페이징했더니 5,828행을 5,828행으로 받는데 유일 키는 5,820개,
 * 즉 8행이 빠지고 8행이 중복되는 걸 매 실행 재현했다(경계가 같은 날짜 구간 안쪽에
 * 떨어져서다). 여기 telegram_* 표는 날짜 하나에 종목·채널 수백 행이 달리므로 조건이
 * 똑같다. 그래서 정렬 키를 **필수 인자**로 받아 헬퍼 안에서 건다 — 호출부가 잊을
 * 자리를 없앤다. 넘길 값은 유일 키여야 하고, telegram_* 표는 전부 `id`(uuid PK)다.
 *
 * 결과 순서는 이제 orderKey 순이다. 순서에 기대는 소비자는 직접 정렬할 것.
 */
async function fetchAllRows<T>(orderKey: string, build: () => PagedQuery<T>): Promise<T[]> {
  const PAGE = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data } = await build().order(orderKey).range(from, from + PAGE - 1);
    if (!data?.length) break;
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}

/**
 * `.in(칼럼, 목록)` 을 조각내어 부른다.
 *
 * 위 fetchAllRows 가 막는 건 **표가 커서** 넘치는 경우고, 이건 **거르는 목록 자체가
 * 길어서** 넘치는 경우다. 같은 1,000행 캡인데 증상이 달라 따로 물린다. 이쪽이 더 안
 * 보이는 이유는 두 가지다 — (1) 응답이 잘려도 에러가 없고, (2) 못 받은 코드는 Map 에서
 * 그냥 빠지는데 호출부가 `?? code` 로 폴백하고 있어 화면엔 종목명 자리에 6자리 숫자가
 * 찍힐 뿐이다. "이름이 좀 이상하네" 로 넘어가기 쉽다.
 *
 * 실제로 급부상 종목 카드가 그랬다. 14일치 언급 종목이 1,710개인데 한 번에 물어서
 * 1,000개만 돌아왔고, 빠진 710개 중 하나(451760 컨텍)가 카드에 떴다.
 * **이름보다 나쁜 건 market 도 같이 비었다는 것이다** — 표시용 시세를
 * `${code}.${market === "KOSDAQ" ? "KQ" : "KS"}` 로 조회하므로, 코스닥 종목에 코스피
 * 접미사가 붙어 **엉뚱한 종목의 가격이 카드에 찍혔다**(컨텍 종가 7,660원 자리에
 * 12,200원·＋70.15%). 종목명이 틀린 것과 시세가 틀린 것은 무게가 다르다.
 *
 * 조각을 500 으로 둔 건 응답 행수를 캡의 절반 아래로 눌러 두려는 것이다. code 는 유일
 * 키라 조각 하나가 500행을 넘을 수 없고, 이름처럼 유일하지 않은 칼럼으로 걸어도 여유가
 * 남는다. 조각은 병렬로 부른다 — 이 함수는 화면을 그리는 경로에 있어서 직렬로 돌리면
 * 조각 수만큼 지연이 쌓인다.
 */
async function selectInChunks<T>(
  values: string[],
  run: (slice: string[]) => PromiseLike<{ data: T[] | null }>,
): Promise<T[]> {
  const CHUNK = 500;
  if (values.length <= CHUNK) return (await run(values)).data ?? [];
  const slices: string[][] = [];
  for (let i = 0; i < values.length; i += CHUNK) slices.push(values.slice(i, i + CHUNK));
  const pages = await Promise.all(slices.map((s) => run(s)));
  return pages.flatMap((p) => p.data ?? []);
}

export type TelegramSummary = {
  channelCount: number; // 지금 실제로 수집 중인 채널 수(시트 목록 크기가 아니다 — 아래 주석)
  totalSubscribers: number;
  totalMentions: number;
  activeChannels: number;
  messages7d: number;
  lastUpdated: string | null; // 파이프라인이 마지막으로 데이터를 갱신한 시각
};

/**
 * 상단 요약 스탯 — 모니터링 채널 수·총 구독자·총 종목 언급·최근 7일 활성 채널.
 *
 * **채널을 세는 세 줄은 전부 '지금 수집 중인 채널'을 센다.** 목록(telegram_channels
 * 의 is_active) 크기가 아니다. 수집기는 peer 캐시(channel_id·access_hash)가 찬 채널만
 * 열고 나머지는 통째로 건너뛰므로, 캐시가 없는 채널은 모니터링하고 있는 것이 아니다.
 *
 * 2026-07-28 실측이 200/317 이었는데(계정 FloodWait 로 캐시가 200 에서 멈췄다) 카드는
 * "모니터링 채널 317개 · 활성 채널 310개"라고 말했다. 310 은 캐시 없는 117개 중 111개가
 * 아직 7일 창 안에 옛 글을 갖고 있어서 나온 수였다. 카드 아래 언급 수·채널 수·점유율이
 * 전부 200개 채널만의 것인데 화면만 317개를 본다고 말한 셈이다.
 *
 * 세 줄을 함께 옮기는 것이 중요하다. '모니터링 채널'만 200으로 내리면 그 아래 '활성
 * 채널 310'이 더 커져 앞뒤가 안 맞는다.
 *
 * 목록에는 있는데 수집이 안 되는 채널이 몇 개인지는 여기서 화면으로 내보내지 않는다.
 * 그건 방문자가 알 일이 아니라 우리가 알 일이라, 파이프라인의 커버리지 검사가
 * 맡는다(data-pipeline/scripts/check_telegram_coverage.py).
 */
/**
 * 최근 7일 메시지 수 — **파이프라인이 세어 둔 값을 읽는다**(마이그레이션 027).
 *
 * 예전엔 렌더마다 `count(*) … where posted_at >= now() - 7일` 을 돌렸다. 창 안이
 * 4.9만 행이라 표를 훑는데, 버퍼가 식어 있으면 **6,946ms**였다(2026-08-07 콜드 트레이스
 * 실측. 같은 질의가 웜에서는 236ms라 20~30배로 벌어진다).
 *
 * telegram_messages 는 파이프라인이 돌 때만 바뀐다. 그래서 실행과 실행 사이에 이 수는
 * 얼어붙은 입력에 대한 상수고, 매 방문이 같은 답을 다시 세고 있었다. 계산을 옮긴
 * 것이지 캐싱이 아니다 — '얼마나 낡아도 되나'를 거래하지 않는다.
 *
 * ⭐ 오히려 옆줄과 맞아진다. 바로 옆 '활성 채널 7일'은 파이프라인이 실행 시각 기준으로
 * 세어 둔 값(weekly_posts)인데 이 줄만 요청 시각 기준이라, 실행 사이에 창이 미끄러지며
 * 두 숫자가 다른 시점을 말하고 있었다. 이제 같은 실행·같은 창에서 나온다.
 *
 * 저장값이 없으면(마이그레이션 전, 또는 파이프라인이 아직 한 번도 안 돈 상태) 옛 방식
 * 으로 되돌아간다. **되돌아갔다는 사실을 로그에 남긴다** — 안 남기면 파이프라인이
 * 조용히 이 표를 안 채우게 됐을 때 느린 길로 영원히 돌아가 있어도 아무도 모른다.
 */
async function messages7dCount(db: ReturnType<typeof getSupabaseAdmin>): Promise<number> {
  const { data, error } = await db
    .from("telegram_collection_stats")
    .select("messages_7d")
    .limit(1)
    .maybeSingle();
  if (!error && data?.messages_7d != null) return data.messages_7d as number;

  console.warn(
    `[getTelegramSummary] 저장된 수집량이 없어 직접 셉니다(느린 길): ${error?.message ?? "행 없음"}`,
  );
  // 행을 세면 PostgREST 기본 1000행 상한에 걸려 항상 1,000이 된다 — count 쿼리로 정확히.
  //
  // 이 줄만 채널로 안 좁힌다. 세는 단위가 채널이 아니라 **창 안의 메시지**이고, 카드
  // 아래 집계(언급·테마·센티먼트)가 실제로 읽는 것도 창 안 전부이기 때문이다. 수집이
  // 끊긴 채널이 남긴 옛 글도 그 집계에 들어가므로(2026-07-28 기준 37,706건 중 5,224건),
  // 여기서 빼면 '재료가 얼마나 되나'를 되레 적게 말하게 된다.
  // (파이프라인 쪽 save_collection_stats 도 같은 이유로 채널을 안 건다.)
  const { count } = await db
    .from("telegram_messages")
    .select("id", { count: "exact", head: true })
    .gte("posted_at", daysAgoISO(7));
  return count ?? 0;
}

export async function getTelegramSummary(): Promise<TelegramSummary> {
  const db = getSupabaseAdmin();

  // 317행이라 아직 1,000행 캡에 안 닿지만, 여기서 잘리면 잘린 채널이 '수집 안 됨'으로
  // 보여 이 카드의 세 줄이 함께 낮아진다 — 조용히 틀리는 쪽이라 페이징해 읽는다.
  const chans = await fetchAllRows<{ handle: string; subscriber_count: number | null; channel_id: number | null; access_hash: number | null }>(
    "id",
    () => db.from("telegram_channels").select("id,handle,subscriber_count,channel_id,access_hash").eq("is_active", true),
  );
  // 수집 대상의 정의를 fetch_telegram.py 와 **한 글자도 다르지 않게** 맞춘다 —
  // 그쪽은 channel_id·access_hash 가 둘 다 있는 채널만 열고 나머지는 건너뛴다.
  // 둘 중 하나라도 비면 그 채널은 오늘 한 건도 안 걷힌다.
  const collected = chans.filter((c) => c.channel_id != null && c.access_hash != null);
  const collectedHandles = new Set(collected.map((c) => c.handle));
  const channelCount = collected.length;
  const totalSubscribers = collected.reduce((s, c) => s + (c.subscriber_count ?? 0), 0);

  const { count: totalMentions } = await db
    .from("telegram_message_stocks")
    .select("id", { count: "exact", head: true });

  // 활성 채널 = 최근 7일 안에 글을 올린 채널.
  // 예전엔 7일치 메시지를 전부 훑어 distinct 를 셌다. 채널이 12개(2천 행)일 땐 됐지만
  // 317개면 같은 창이 수만 행이라 렌더마다 1,000행씩 수십 번 왕복한다. 파이프라인이
  // 이미 채널별로 같은 7일 창을 세어 두므로(channel_stats.weekly_posts) 그걸 읽는다.
  // 한 채널당 날짜별 한 행이라, 최신 날짜로 좁히면 조회는 채널 수만큼이다.
  const { data: lastStat } = await db
    .from("telegram_channel_stats")
    .select("date")
    .not("weekly_posts", "is", null)
    .order("date", { ascending: false })
    .limit(1);
  const statDate = lastStat?.[0]?.date as string | undefined;
  const { data: weekly } = statDate
    ? await db
        .from("telegram_channel_stats")
        .select("channel_handle,weekly_posts")
        .eq("date", statDate)
    : { data: [] as { channel_handle: string; weekly_posts: number | null }[] };
  // 수집 중인 채널로 좁힌다. 안 좁히면 수집이 끊긴 채널도 7일 창 안에 옛 글이 남아
  // 있는 동안 계속 '활성'으로 세어져, 이 줄만 '모니터링 채널'보다 커진다.
  const activeChannels = (weekly ?? []).filter(
    (r) => (r.weekly_posts ?? 0) > 0 && collectedHandles.has(r.channel_handle),
  ).length;
  const messages7d = await messages7dCount(db);

  // 마지막 갱신 시각 — sync가 채널을 동기화한 시점이 파이프라인 실행 시각과 같다.
  const { data: synced } = await db
    .from("telegram_channels")
    .select("synced_at")
    .not("synced_at", "is", null)
    .order("synced_at", { ascending: false })
    .limit(1);
  const lastUpdated = synced?.[0]?.synced_at ?? null;

  return {
    channelCount,
    totalSubscribers,
    totalMentions: totalMentions ?? 0,
    activeChannels,
    messages7d,
    lastUpdated,
  };
}

// ─── 종목 일별 집계 공통 로더 ────────────────────────────────────────────────

/**
 * 점유율 비교용 평활 상수 — '언급 1회가 그날 대화에서 차지하는 몫'.
 * telegram_stock_daily 949건 실측: 언급 1회 종목의 점유율 중앙값 0.0018.
 * 배수를 낼 때 분자·분모에 함께 더해, 표본이 1회치뿐인 종목이 거대한 배수를
 * 받는 걸 막는다(자세한 이유는 getSurgingStocks 안 주석).
 */
const SHARE_SMOOTHING = 0.002;

// channel_count 는 일부러 뺐다. 창 전체의 '서로 다른 채널 수'는 일별 개수로 복원할 수
// 없어서(recentChannelCount 주석) 프론트가 쓸 데가 없고, 14일 × 수천 행에 실려 오는
// 열이라 안 받는 편이 낫다. 파이프라인 집계에는 그대로 남아 있다.
type DailyRow = { stock_code: string; date: string; weighted_score: number; mention_count: number };

async function loadStockDaily(days: number): Promise<{ rows: DailyRow[]; dates: string[] }> {
  const db = getSupabaseAdmin();
  // 기준일 앞 days 일. 위아래 경계를 둘 다 쿼리에 건다 — 예전엔 하한만 걸고 오늘을
  // 코드에서 걸러 냈는데, 그 '오늘'이 벽시계라 자정마다 창이 굴렀다(windowBefore 주석).
  const window = windowBefore(await kaderaBaseDate(), days);
  const rows = await fetchAllRows<DailyRow>("id", () =>
    db
      .from("telegram_stock_daily")
      .select("stock_code,date,weighted_score,mention_count")
      .gte("date", window[0])
      .lte("date", window[window.length - 1]),
  );
  const dates = [...new Set(rows.map((r) => r.date))].sort();
  return { rows, dates };
}

/**
 * 채널 핸들→(제목, 사진 주소).
 *
 * **photo 컬럼(base64 data URI)은 여기서 절대 읽지 않는다.** 건당 ~12KB 라 화면에 쓰는
 * 60개만 읽어도 응답이 733KB 였고, 이 함수는 카드마다 불려서 그게 페이지 한 장에
 * 예닐곱 번 반복됐다. 사진 바이트는 /api/channel-photo 가 따로 내주고(캐시가 먹는다)
 * 여기서는 그 주소만 만든다 — 자세한 사정은 lib/channel-photo.ts 주석 참고.
 *
 * 사진이 없는 채널(현재 317개 중 19개)은 주소 대신 null 을 줘서 화면이 이니셜
 * 아바타로 폴백하게 한다. 그 판별에 필요한 건 '있다/없다' 뿐이라 핸들만 받아 온다.
 *
 * 컬럼을 안 읽으니 전 채널을 통째로 받아도 10KB 남짓이다. 그래서 핸들로 거르는 대신
 * 요청당 한 번만 읽고 React cache 로 돌려 쓴다 — 카드 5~7장이 각자 하던 왕복이
 * 두 번으로 줄고, 호출부는 무엇을 그릴지 정하기 전에 불러도 손해가 없다.
 *
 * 마이그레이션 016 이전 환경(photo 컬럼 없음)에서는 사진 쿼리가 에러 → 빈 집합이 되어
 * 전부 이니셜 아바타로 떨어진다. 제목은 그대로 나온다.
 */
const channelMeta = cache(
  async (): Promise<{ titleOf: Map<string, string>; photoUrlOf: Map<string, string | null> }> => {
    const db = getSupabaseAdmin();
    // handle 은 unique 라 페이징 정렬 키로 안전하다(fetchAllRows 주석의 함정 [2]).
    const [rows, havePhoto] = await Promise.all([
      fetchAllRows<{ handle: string; title: string | null }>("handle", () =>
        db.from("telegram_channels").select("handle,title"),
      ),
      fetchAllRows<{ handle: string }>("handle", () =>
        db.from("telegram_channels").select("handle").not("photo", "is", null),
      ),
    ]);
    const withPhoto = new Set(havePhoto.map((c) => c.handle));
    return {
      titleOf: new Map(rows.map((c) => [c.handle, c.title ?? c.handle])),
      photoUrlOf: new Map(rows.map((c) => [c.handle, withPhoto.has(c.handle) ? channelPhotoUrl(c.handle) : null])),
    };
  },
);

async function nameMap(codes: string[]): Promise<Map<string, string>> {
  if (!codes.length) return new Map();
  const db = getSupabaseAdmin();
  // 조각내어 부른다(selectInChunks 주석 참고) — 코드 목록이 1,000개를 넘으면 응답이
  // 조용히 잘려 이름이 빠진다.
  const data = await selectInChunks<{ code: string; name: string }>(codes, (slice) =>
    db.from("stocks").select("code,name").in("code", slice),
  );
  return new Map(data.map((s) => [s.code, s.name]));
}

type StockInfo = { name: string; market: string | null; closePrice: number | null; changeRate: number | null; priceDate: string | null };

/** stocks 표에서 그대로 읽어 온 행(칼럼명 그대로). 위 StockInfo 는 화면용으로 옮긴 뒤의 모양. */
type StockRow = {
  code: string;
  name: string;
  market: string | null;
  close_price: number | null;
  change_rate: number | string | null;
  price_date: string | null;
};

/**
 * 카드용 시세 — 야후 실시간(상단 티커와 같은 소스·같은 전일종가 규칙, lib/yahoo-quote).
 * KRX Open API는 며칠 지연돼 티커의 실시간 값과 크게 어긋나므로 표시용은 여기서 먼저
 * 가져오고, 실패하면 호출부가 KRX 저장 종가로 폴백한다.
 * 등락률을 못 내면 null을 준다 — 가격만 보여주면 변동을 오해할 수 있다.
 */
async function stockQuote(symbol: string): Promise<{ price: number; changeRate: number } | null> {
  const q = await fetchYahooQuote(symbol, { next: { revalidate: 600 } });
  if (!q) return null;
  const changeRate = changeRateOf(q);
  return changeRate === null ? null : { price: q.price, changeRate };
}

/** 종목명 + 최신 종가/등락률(마이그레이션 015 이전이면 가격은 null). */
async function stockInfoMap(codes: string[]): Promise<Map<string, StockInfo>> {
  if (!codes.length) return new Map();
  const db = getSupabaseAdmin();
  // 조각내어 부른다(selectInChunks 주석 참고). 여기서 잘리면 이름뿐 아니라 market 까지
  // 비어 시세를 엉뚱한 티커로 조회하게 되므로, 이 함수가 가장 아프게 물린 자리다.
  let failed = false;
  const data = await selectInChunks<StockRow>(codes, async (slice) => {
    const res = await db
      .from("stocks")
      .select("code,name,market,close_price,change_rate,price_date")
      .in("code", slice);
    // 조각 하나라도 실패하면 통째로 폴백한다 — 일부만 가격이 붙은 결과는 "어떤 종목은
    // 시세가 없다"로 보여서, 아예 없는 것보다 읽는 사람을 헷갈리게 한다.
    if (res.error) failed = true;
    return res;
  });
  if (failed) {
    // 가격 컬럼이 아직 없는 환경에서도 이름은 나오도록 폴백.
    const names = await nameMap(codes);
    return new Map(
      [...names].map(([c, n]) => [c, { name: n, market: null, closePrice: null, changeRate: null, priceDate: null }]),
    );
  }
  return new Map(
    data.map((s) => [
      s.code,
      {
        name: s.name,
        market: s.market ?? null,
        closePrice: s.close_price ?? null,
        changeRate: s.change_rate != null ? Number(s.change_rate) : null,
        priceDate: s.price_date ?? null,
      },
    ]),
  );
}

// 종목명이 아닌 '주제' 태그용 키워드. 종목 태그가 없는 메시지에 붙인다.
// 종목 추출과 같은 방식(결정적 사전 매칭)이라 LLM 없이도 동작한다.
const TOPIC_KEYWORDS = [
  "HBM", "반도체", "금리", "환율", "관세", "실적", "수주", "공매도", "배당",
  "유가", "인플레", "연준", "FOMC", "경기침체", "증자", "공모주", "IPO",
  "2차전지", "조선", "방산", "원전", "AI", "로봇", "바이오", "부동산",
];

function extractTopics(text: string, limit = 2): string[] {
  const found: string[] = [];
  for (const k of TOPIC_KEYWORDS) {
    if (text.includes(k) && !found.includes(k)) found.push(k);
    if (found.length >= limit) break;
  }
  return found;
}

export type SurgingStock = {
  code: string;
  name: string;
  recentMentions: number;
  channelCount: number; // 이 종목을 다룬 서로 다른 채널 수(관심의 폭). 규칙은 recentChannelCount.
  ratio: number; // 최근 vs 평소 주목도 배수 (Infinity=신규 등장)
  isNew: boolean;
  series: number[]; // 일별 언급수(오래된→최신)
  /** series 와 자리마다 짝이 맞는 날짜(YYYY-MM-DD). 막대 밑에 축 라벨을 달려면 필요하다 —
   *  series 만으로는 "뒤에서 몇 번째 칸이 며칠인지"를 화면이 알 수 없고, 오늘 날짜에서
   *  거꾸로 세면 파이프라인이 하루 밀린 날에 축이 통째로 어긋난다(loadStockDaily 는
   *  완료된 날만 남기므로 마지막 칸이 어제가 아닐 수 있다). */
  seriesDates: string[];
  /** ratio 가 '최근'으로 친 **마지막 며칠**. 보통 3 이지만 집계가 얕은 초기엔 1~2 다.
   *  막대에서 최근 창을 다른 색으로 칠하려면 이 값이 필요하다 — 3 으로 가정해 칠하면
   *  배수는 2일치로 냈는데 그림은 3일을 가리키는 날이 생긴다. */
  recentDays: number;
  market: string | null;
  closePrice: number | null;
  changeRate: number | null;
  priceDate: string | null;
  isLive: boolean; // true=야후 실시간, false=KRX 저장 종가(priceDate 기준)
};

/**
 * 급부상 종목 — 각 종목의 최근 활동이 평소 대비 얼마나 튀었나(momentum).
 * 최근 3일(완료된 날 기준) 일평균 weighted 를 그 이전 일평균과 비교한다.
 * 이전 기록이 없으면 신규 등장(🆕).
 */
export async function getSurgingStocks(
  limit = 5,
  // 시세를 안 쓰는 호출부(탑바 티커는 종목명과 배수만 쓴다)가 야후 왕복을 건너뛰게 한다.
  // 기본값은 켜 둔 채라 기존 호출부는 그대로다.
  opts: { withQuotes?: boolean } = {},
): Promise<SurgingStock[]> {
  const { rows, dates } = await loadStockDaily(14);
  if (!rows.length) return [];

  const recentN = Math.min(3, Math.max(1, dates.length - 1));
  const recentDateList = dates.slice(-recentN);
  const recentDates = new Set(recentDateList);
  const priorCount = Math.max(dates.length - recentN, 1);

  // 주말엔 전체 언급량이 평일의 1/10~1/20로 떨어져, 절대량으로 비교하면 모든 종목이
  // "감소"로 보여 카드가 비어버린다. 그래서 그날 전체 대비 '비중(share)'으로 비교해
  // 볼륨 수준의 영향을 제거하고 "대화에서 차지한 몫이 커졌나"만 본다.
  const dayTotal = new Map<string, number>();
  for (const r of rows) dayTotal.set(r.date, (dayTotal.get(r.date) ?? 0) + (Number(r.weighted_score) || 0));

  const byStock = new Map<
    string,
    { recentShare: number; recentM: number; priorShare: number; byDate: Map<string, number> }
  >();
  for (const r of rows) {
    const a = byStock.get(r.stock_code) ?? { recentShare: 0, recentM: 0, priorShare: 0, byDate: new Map() };
    a.byDate.set(r.date, r.mention_count || 0);
    const total = dayTotal.get(r.date) || 0;
    const share = total > 0 ? (Number(r.weighted_score) || 0) / total : 0;
    if (recentDates.has(r.date)) {
      a.recentShare += share;
      a.recentM += r.mention_count || 0;
    } else {
      a.priorShare += share;
    }
    byStock.set(r.stock_code, a);
  }

  const infoOf = await stockInfoMap([...byStock.keys()]);

  const scored = [...byStock.entries()]
    .map(([code, a]) => {
      const recentPerDay = a.recentShare / recentDateList.length;
      const base = a.priorShare / priorCount;
      const info = infoOf.get(code);
      return {
        code,
        name: info?.name ?? code,
        recentMentions: a.recentM,
        // 여기서는 못 센다 — '서로 다른 채널 수'는 일별 집계의 합집합이라 원자료를
        // 봐야 하고(recentChannelCount 주석), 카드에 오르지도 못할 1,700여 종목까지
        // 물을 이유가 없다. 정원을 확정한 뒤 그 몇 건만 아래에서 채운다.
        channelCount: 0,
        // 평활(+SHARE_SMOOTHING)한 뒤 나눈다. 그냥 나누면 분모가 거의 0인 종목이
        // "▲162.8배"처럼 터무니없는 배수를 받는데, 실제론 3일간 2회 언급·1개 채널이라
        // 표본이 사실상 없는 경우다. 상수는 '언급 1회가 만드는 몫'(실측 중앙값 0.0018)
        // 이라, 최근 몫이 1회치밖에 안 되면 배수가 2배 근처로 눌리고, 진짜 두꺼운
        // 급증(몫이 1회치의 수십 배)은 거의 그대로 남는다.
        ratio: (recentPerDay + SHARE_SMOOTHING) / (base + SHARE_SMOOTHING),
        isNew: base === 0,
        series: dates.map((d) => a.byDate.get(d) ?? 0),
        seriesDates: dates,
        recentDays: recentDateList.length,
        market: info?.market ?? null,
        closePrice: info?.closePrice ?? null,
        changeRate: info?.changeRate ?? null,
        priceDate: info?.priceDate ?? null,
        isLive: false,
      };
    })
    // 평활 덕에 신규 등장(base=0)도 유한한 배수를 받아 급증주와 같은 축에서 비교된다.
    // 예전엔 ratio=Infinity라 정렬을 독점해서 isNew를 3/2로 환산하는 보정이 필요했는데,
    // 그 보정은 "크게 등장한 신규"와 "1회 언급 신규"를 구분 못 했다. 이제 몫의 크기가
    // 그대로 반영돼 보정 없이 옳게 줄 선다.
    // 마지막 종목코드 비교는 완전한 동점(신규 등장끼리 흔하다)에서 순서가 DB 행
    // 순서에 딸리지 않게 못박는 것이다.
    .sort((x, y) => y.ratio - x.ratio || y.recentMentions - x.recentMentions || x.code.localeCompare(y.code));

  // 카드 정원은 항상 채운다 — 기준을 만족한 종목만 넣으면 조용한 날에 4개·3개로 줄어
  // 레이아웃이 들쭉날쭉해진다. 다만 아무거나 끌어오면 안 되고 '덜 미더운 순서'로 메운다:
  //   ① 언급 2회↑ + 뚜렷하게 뛴 것(본래 기준)
  //   ② 언급 2회↑지만 상승폭이 완만한 것
  //   ③ 언급 1회 — 표본이 하나라 사실상 노이즈
  // ③을 ②보다 먼저 넣으면 4위 ▲1.3배 밑에 5위 ▲37배가 붙어 정렬이 깨져 보인다.
  // (평활 후에는 배수 자체가 눌리지만, '2회 이상'이라는 표본 하한은 그대로 둔다.)
  const tier = (s: SurgingStock) => (s.recentMentions < 2 ? 3 : s.ratio >= 1.3 ? 1 : 2);
  const list = [...scored].sort((x, y) => tier(x) - tier(y)).slice(0, limit);

  // 표시용 가격은 실시간(야후) 우선 — KRX 저장 종가는 며칠 지연돼, 같은 종목이 이 카드와
  // 종목 리포트에서 다른 값으로 보인다. 조회 실패 시 KRX 종가(priceDate 라벨과 함께)를 쓴다.
  // 가격 칸이 없는 호출부(탑바 티커)는 이 왕복만 건너뛴다 — closePrice 는 KRX 값으로 남는다.
  //
  // 채널 수는 **건너뛰지 않는다.** 시세와 서로 상관이 없어 나란히 두면 둘 중 느린 쪽만큼만
  // 걸리고(실측 0.09초, 야후 시세가 늘 더 오래 걸린다), 이걸 빼면 channelCount 가 distinct
  // 규칙을 안 거친 값으로 남아 화면마다 '몇 개 채널'이 달라진다.
  const wantQuotes = opts.withQuotes !== false;
  const [quotes, breadth] = await Promise.all([
    wantQuotes
      ? Promise.all(list.map((s) => stockQuote(`${s.code}.${s.market === "KOSDAQ" ? "KQ" : "KS"}`)))
      : Promise.resolve<Awaited<ReturnType<typeof stockQuote>>[]>([]),
    // 언급 수(recentM)와 **같은 창**이어야 한 줄에 적힌 두 값이 같은 기간을 말한다.
    channelBreadth(
      list.map((s) => s.code),
      recentDateList[0],
      addDaysISO(recentDateList[recentDateList.length - 1], 1),
    ),
  ]);
  list.forEach((s, i) => {
    const q = quotes[i];
    if (q) {
      s.closePrice = Math.round(q.price);
      s.changeRate = q.changeRate;
      s.isLive = true;
    }
    s.channelCount = breadth.get(s.code) ?? 0;
  });

  return list;
}

export type StockTrend = {
  code: string;
  name: string;
  mentions: number;
  series: number[];
};

/** 최근 7일 주목도 상위 종목 + 일별 언급 추이(스파크라인용). 종목 리포트에 쓴다. */
export async function getTopStocksWithTrend(limit = 6): Promise<StockTrend[]> {
  // 어느 종목이 리포트에 뜨는지도 같은 창으로 정한다 — 카드가 "최근 N일"이라 적어 놓고
  // 다른 기간으로 고른 종목을 보여주면 안 된다.
  const { rows, dates } = await loadStockDaily(KADERA_WINDOW_DAYS);
  if (!rows.length) return [];

  // 채널 수는 여기서 내주지 않는다. 예전엔 일별 channel_count 의 최대치를 `channels` 로
  // 실어 보냈는데 **아무도 읽지 않았고**(호출부는 /kadera·/mdd 둘뿐이고 둘 다 코드와
  // 언급 수만 쓴다), 남겨 두면 언젠가 화면에 붙어 max 규칙이 되살아난다.
  // 이 목록에 채널 수가 필요해지면 channelBreadth 로 받을 것.
  const agg = new Map<string, { w: number; m: number; byDate: Map<string, number> }>();
  for (const r of rows) {
    const a = agg.get(r.stock_code) ?? { w: 0, m: 0, byDate: new Map() };
    a.w += Number(r.weighted_score) || 0;
    a.m += r.mention_count || 0;
    a.byDate.set(r.date, r.mention_count || 0);
    agg.set(r.stock_code, a);
  }

  const nameOf = await nameMap([...agg.keys()]);
  return [...agg.entries()]
    .sort((x, y) => y[1].w - x[1].w || x[0].localeCompare(y[0])) // 동점은 종목코드로 못박는다
    .slice(0, limit)
    .map(([code, a]) => ({
      code,
      name: nameOf.get(code) ?? code,
      mentions: a.m,
      series: dates.map((d) => a.byDate.get(d) ?? 0),
    }));
}

export type TrendingMessage = {
  channelHandle: string;
  messageId: number;
  channelTitle: string;
  channelPhotoUrl: string | null; // /api/channel-photo/... (사진이 없는 채널은 null)
  text: string;
  views: number;
  forwards: number;
  replies: number;
  score: number;
  postedAt: string;
  stocks: string[]; // 이 메시지에서 추출된 종목명(태그)
  topics: string[]; // 종목 태그가 없을 때 붙는 핵심 주제 태그(금리·반도체 등)
};

/**
 * 트렌딩 메시지가 볼 수 있는 창.
 *
 * "today"는 일수가 아니라 KST 달력 기준이다 — 화면 라벨이 "오늘"이라 24시간
 * 롤링(daysAgoISO(1))으로 하면 어제 저녁 글이 늘 오늘 것으로 섞인다.
 * 다만 오전 첫 수집 전에는 전날 0시부터로 잡는다(아래 trendingTodayStartISO).
 */
export type TrendingWindow = "today" | number;

/** 수집 워크플로우의 첫 실행 시각(KST). .github/workflows/daily-update.yml 의 cron 과 맞춘다. */
const FIRST_COLLECTION_HOUR_KST = 9;

/**
 * '오늘' 창의 시작 시각.
 *
 * KST 오늘 0시로 그냥 잡으면 자정 직후 이 카드가 통째로 빈다 — 수집이 09시·17시에만
 * 돌아서 새벽에는 오늘 글이 DB 에 아예 없기 때문이다(실측 KST 2026-07-22 00:31:
 * 오늘 0건 / 어제 471건). 볼 게 없는 게 아니라 아직 안 담긴 것뿐인데 "아직 화제
 * 메시지가 없습니다" 만 뜬다.
 *
 * 그래서 첫 수집이 도는 09시 전에는 전날 0시를 창 시작으로 쓴다. 09시가 지나면
 * 그날 글이 담기므로 자연스럽게 오늘 0시로 넘어간다.
 */
function trendingTodayStartISO(): string {
  // Date.now()+9h 의 UTC 시각 = KST 시각(todayKstDate 와 같은 방식).
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const start = new Date(`${todayKstDate()}T00:00:00+09:00`);
  if (kstNow.getUTCHours() < FIRST_COLLECTION_HOUR_KST) {
    start.setUTCDate(start.getUTCDate() - 1);
  }
  return start.toISOString();
}

/** 트렌딩 메시지 TOP N (창: windowDays). 점수는 view가 지배적이라 view순으로 후보를 좁힌 뒤 정확 점수로 정렬. */
export async function getTrendingMessages(
  windowDays: TrendingWindow,
  limit = 8,
): Promise<TrendingMessage[]> {
  const db = getSupabaseAdmin();
  const since = windowDays === "today" ? trendingTodayStartISO() : daysAgoISO(windowDays);
  /* error 를 **받아서 남긴다.** 안 받으면 조회 실패와 "그 창에 글이 없음"이 똑같이
     data=null 로 나가고, 화면은 둘 다 "…기준으로는 아직 화제 메시지가 없습니다"를 띄운다.
     둘은 전혀 다른 사건인데 화면에서도 로그에서도 구별할 방법이 없어진다.

     이게 가설이 아닌 이유: 2026-08-06 새벽 프로덕션에서 7일 창이 36건인데 30일 창이
     0건인 응답이 관측됐다. 7일은 30일에 포함되므로 데이터로는 불가능한 조합이고,
     조회 하나가 실패해 조용히 빈 배열이 된 것으로밖에 설명되지 않는다.

     ⚠️ **동작은 한 글자도 안 바꾼다** — 실패해도 여전히 [] 를 돌려주고 페이지는 그대로
     뜬다. 실패를 '보이게' 만드는 것이 전부다. 실패했을 때 무엇을 보여줄지는 별건이다.

     같은 패턴(에러를 안 받는 조회)이 이 파일에 11곳 더 있다. 실제로 실패가 관측된 건
     여기뿐이라 여기만 고친다. 나머지는 오픈 후 같은 방식으로 훑을 것. */
  const { data: msgs, error } = await db
    .from("telegram_messages")
    .select("channel_handle,message_id,text,views,forwards,replies,posted_at")
    .gte("posted_at", since)
    .not("text", "is", null)
    .order("views", { ascending: false, nullsFirst: false })
    .limit(200);
  if (error) {
    console.error(`[getTrendingMessages] 창=${windowDays} 조회 실패:`, error.message);
  }
  if (!msgs?.length) return [];

  const { titleOf, photoUrlOf } = await channelMeta();

  const top = msgs
    .map((m) => ({
      channelHandle: m.channel_handle,
      messageId: m.message_id as number,
      channelTitle: titleOf.get(m.channel_handle) ?? m.channel_handle,
      channelPhotoUrl: photoUrlOf.get(m.channel_handle) ?? null,
      text: (m.text ?? "").replace(/\s+/g, " ").trim(),
      views: m.views ?? 0,
      forwards: m.forwards ?? 0,
      replies: m.replies ?? 0,
      score: (m.views ?? 0) * TREND_W_VIEWS + (m.forwards ?? 0) * TREND_W_FWD + (m.replies ?? 0) * TREND_W_REPLIES,
      postedAt: m.posted_at,
      stocks: [] as string[],
      topics: [] as string[],
    }))
    .filter((m) => m.text.length > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  // 각 메시지에서 추출해둔 종목을 태그로 붙인다(사전 기반 추출 결과 재사용).
  // message_id 는 채널별로만 유일해서 채널을 안 걸면 다른 채널의 같은 번호 메시지까지
  // 딸려온다(한 번호가 최대 60행). 아래에서 채널까지 포함한 키로 걸러내므로 결과는
  // 맞지만, 행이 많아지면 1000행 상한에 잘려 태그가 조용히 사라질 수 있어 페이징한다.
  const tags = await fetchAllRows<{ channel_handle: string; message_id: number; stock_code: string }>(
    "id",
    () =>
      db
        .from("telegram_message_stocks")
        .select("channel_handle,message_id,stock_code")
        .in("message_id", top.map((m) => m.messageId)),
  );

  if (tags.length) {
    const nameOf = await nameMap([...new Set(tags.map((t) => t.stock_code))]);
    const byMsg = new Map<string, string[]>();
    for (const t of tags) {
      const key = `${t.channel_handle}|${t.message_id}`;
      const arr = byMsg.get(key) ?? [];
      const nm = nameOf.get(t.stock_code);
      if (nm && !arr.includes(nm)) arr.push(nm);
      byMsg.set(key, arr);
    }
    for (const m of top) m.stocks = (byMsg.get(`${m.channelHandle}|${m.messageId}`) ?? []).slice(0, 3);
  }

  // 특정 종목 이야기가 아니면 핵심 주제(금리·반도체 등)를 태그로 붙인다.
  for (const m of top) {
    if (m.stocks.length === 0) m.topics = extractTopics(m.text);
  }

  return top;
}

export type StockReport = {
  code: string;
  name: string;
  market: string | null; // KOSPI | KOSDAQ — MDD 링크가 야후 심볼(.KS/.KQ)을 만들 때 쓴다
  totalMentions: number;
  /** 막대 차트용 일별 언급. scored=false 인 앞쪽 칸은 배경 맥락이라 합계에 안 들어간다. */
  series: { date: string; mentions: number; scored: boolean }[];
  channelCount: number; // 이 종목을 다룬 서로 다른 채널 수(관심의 폭)
  price: number | null; // 실시간 시세
  changeRate: number | null;
};

/**
 * 이 종목을 최근 N일 안에 언급한 **서로 다른 채널 수**('관심의 폭').
 *
 * ⚠️ **'N개 채널'은 어디서든 이 규칙으로 센다.** 화면·방송을 통틀어 네 자리가 같은
 * 라벨을 쓰는데, 예전엔 두 규칙이 섞여 있었다 — 여기만 창 전체의 distinct 였고
 * 나머지 셋은 telegram_stock_daily.channel_count 의 **하루 최대치**(max)였다.
 * 일별 집계는 '그날 그 종목을 다룬 채널 수'라, 날이 달라지면 채널 명단도 달라진다.
 * 그래서 max 는 창을 늘려도 커지지 않고, 언급 수만 늘어 **창이 길수록 채널이 적은**
 * 겉보기에 불가능한 조합이 나왔다(2026-07-31 SK하이닉스 실측: 3일 1,882회·201채널 vs
 * 7일 2,822회·174채널). 라벨이 말하는 '서로 다른 채널 수'는 합집합이고, 합집합은
 * 일별 개수만으로는 복원할 수 없다 — 원자료를 봐야 한다. 그래서 max 를 버렸다.
 *
 * telegram_message_stocks 에는 날짜가 없다(메시지 PK만 갖는다). 그래서 기간으로 자르려면
 * 메시지 쪽 posted_at 을 봐야 하는데, 예전엔 그 짝짓기를 **프론트에서** 했다:
 * 최근 7일 메시지 키를 전부 받아 Set 을 만들고(38,737행 = 1,000행씩 39번 순차 왕복),
 * 종목의 **전체 기간** 언급을 또 전부 받아(삼성전자 2,458행) 그 Set 으로 걸렀다.
 * 숫자 하나 세자고 4만 행을 옮기는 셈이라, 이 한 줄이 /kadera 응답의 70%였다
 * (2026-07-26 실측: 이 조회 ~2.0초 / 페이지 전체 2.85초).
 *
 * telegram_message_stocks → telegram_messages 에 복합 FK(channel_handle, message_id)가
 * 있으므로 PostgREST 가 서버에서 조인해 준다(migration_013 참고). !inner + posted_at
 * 필터로 창 안의 행만 받으면 왕복이 39번에서 종목당 2~3번으로 줄고, 세는 규칙은 그대로다.
 *
 * 페이징은 여전히 필수다 — 인기 종목은 7일치만도 1,000행을 넘는다(삼성전자 2,242행).
 * 안 하면 채널 수가 조용히 적게 나온다.
 */
async function recentChannelCount(code: string, from: string, to: string): Promise<number> {
  const db = getSupabaseAdmin();
  const rows = await fetchAllRows<{ channel_handle: string }>("id", () =>
    db
      .from("telegram_message_stocks")
      // !inner() 의 빈 괄호 — 조인은 걸되 메시지 쪽 컬럼은 하나도 안 받는다.
      // posted_at 은 거르는 데만 쓰고 결과엔 필요 없어서, 행마다 딸려 오지 않게 한다.
      .select("channel_handle,telegram_messages!inner()")
      .eq("stock_code", code)
      // 아래 위아래 경계를 둘 다 건다. 예전엔 하한만(rolling N일) 걸어서 **오늘이 섞였다** —
      // 막대 차트와 언급 수는 오늘을 빼고 그리는데 채널 수만 오늘을 포함해, 한 줄에 적힌
      // 두 값이 서로 다른 기간을 말했다. 창이 7일일 땐 1/7 차이라 안 보였지만 3일이면 1/3 이다.
      .gte("telegram_messages.posted_at", `${from}T00:00:00+09:00`)
      .lt("telegram_messages.posted_at", `${to}T00:00:00+09:00`),
  );
  return new Set(rows.map((r) => r.channel_handle)).size;
}

/**
 * 여러 종목의 '관심의 폭'을 한꺼번에. 종목별로 따로 묻고 **병렬로** 기다린다.
 *
 * `.in(stock_code, 코드들)` 로 한 방에 묻는 쪽이 왕복이 적어 보이지만 실제로는 느리다.
 * 페이징이 순차라서, 종목을 합치면 행이 합쳐진 만큼 페이지가 늘고 그게 전부 직렬로
 * 쌓인다. 종목별로 나누면 각자 1~2 페이지에서 끝나고 그 왕복들이 겹친다
 * (2026-07-31 실측, 급부상 5종목 3일 창: 순차 합 0.49초 → 병렬 0.09초).
 *
 * 목록은 화면에 실제로 그릴 몇 건(카드 정원 5~6)뿐이라 `.in()` 목록 길이 함정과도
 * 무관하다. 순위를 정할 땐 이 값을 쓰지 않으므로 전 종목을 셀 이유가 없다.
 */
async function channelBreadth(codes: string[], from: string, to: string): Promise<Map<string, number>> {
  const counts = await Promise.all(codes.map((c) => recentChannelCount(c, from, to)));
  return new Map(codes.map((c, i) => [c, counts[i]]));
}

/** 종목 텔레그램 리포트 — 특정 종목의 최근 창 언급 추이와 관심의 폭. */
export async function getStockReport(code: string): Promise<StockReport | null> {
  const db = getSupabaseAdmin();
  const { data: stock } = await db.from("stocks").select("name,market").eq("code", code).maybeSingle();
  if (!stock) return null;

  // **차트와 수치의 창이 다르다.** 막대는 STOCK_CHART_DAYS 일치를 그리고, 언급 수·채널
  // 수·LLM 문장은 그중 최근 KADERA_WINDOW_DAYS 일만 센다(요청 사항).
  //
  // 왜 나누나: 3일치 막대 세 개는 추이가 안 읽힌다. "지금 얼마나 뜨거운가"는 최근 3일이
  // 맞지만, 그게 평소보다 많은 건지 적은 건지는 앞선 날들이 있어야 보인다. 그래서 눈으로
  // 읽는 축은 길게 두고 세는 창만 짧게 잡는다.
  //
  // 두 창 모두 기준일은 뺀다 — 아직 하루가 덜 차서 막대가 늘 짧게 나오고, 그 반쪽짜리
  // 하루가 합계·채널 수에도 섞인다.
  const chartDays = windowBefore(await kaderaBaseDate(), STOCK_CHART_DAYS);
  const scoreDays = chartDays.slice(-KADERA_WINDOW_DAYS); // 차트 꼬리 = 집계 창
  const [first, last] = [scoreDays[0], scoreDays[scoreDays.length - 1]];
  const dayAfterLast = addDaysISO(last, 1); // posted_at 상한(미포함)

  // 남은 셋은 서로 의존하지 않는다 — 직렬로 두면 왕복이 그대로 더해진다.
  // (시세만 stock.market 에 걸려 있어 위 조회 뒤에 온다.)
  const [{ data: daily }, channelCount, quote] = await Promise.all([
    db
      .from("telegram_stock_daily")
      .select("date,mention_count")
      .eq("stock_code", code)
      // 막대용이라 차트 창 전체를 받는다(합계는 아래에서 집계 창만 골라 낸다).
      .gte("date", chartDays[0])
      .lte("date", last)
      .order("date"),
    // 채널 수도 같은 창으로 자른다 — 전체 기간으로 세면 모니터링 채널이 12개뿐이라
    // 금세 12로 포화돼 '관심의 폭'을 구분하지 못한다.
    recentChannelCount(code, first, dayAfterLast),
    stockQuote(`${code}.${stock.market === "KOSDAQ" ? "KQ" : "KS"}`),
  ]);
  // 언급이 0인 날은 집계 표에 행 자체가 없다. 있는 행만 그리면 종목마다 막대 개수가
  // 달라져, 나란히 놓인 두 차트가 서로 다른 기간을 그리게 된다(실측: 삼성전자 8칸,
  // 현대차 7칸 — 07-18이 통째로 빠졌다). "최근 이틀 급증" 같은 문장도 눌린 축 위에서
  // 읽히고, 카드 라벨과도 안 맞는다.
  //
  // 그래서 창 전체의 날짜(chartDays)를 먼저 만들고 없는 날은 0으로 채운다 — 같은 파일의
  // getTopStocksWithTrend 가 이미 쓰는 방식이라 그쪽과도 축이 맞는다.
  //
  // scored 는 "이 막대가 집계 창 안인가" — 화면이 뒤쪽 3칸만 진하게 그려, 7칸을 보면서도
  // 아래 '언급 N회'가 어느 구간을 센 값인지 눈으로 짚을 수 있게 한다.
  const byDate = new Map((daily ?? []).map((d) => [d.date, d.mention_count || 0]));
  const scoredFrom = scoreDays[0];
  const series = chartDays.map((date) => ({
    date,
    mentions: byDate.get(date) ?? 0,
    scored: date >= scoredFrom,
  }));
  // 합계는 **집계 창만** 센다. 막대는 7칸이어도 카드에 적히는 수치는 최근 3일치다.
  const totalMentions = series.reduce((s, d) => (d.scored ? s + d.mentions : s), 0);

  return {
    code,
    name: stock.name as string,
    market: (stock.market as string) ?? null,
    totalMentions,
    series,
    channelCount,
    price: quote ? Math.round(quote.price) : null,
    changeRate: quote ? quote.changeRate : null,
  };
}

/** 테마를 이룬 종목 한 건. 카드 툴팁이 이걸로 MDD 정밀분석 링크를 만든다. */
export type ThemeStock = {
  code: string;
  name: string;
  market: string | null; // MDD 링크의 심볼(.KS/.KQ)을 가르는 값
  mentions: number;
};

export type ThemeRotation = {
  theme: string;
  rank: number;
  rankChange: number | null; // 주간 순위 변동(+면 상승). 비교할 과거가 없으면 null
  sharePct: number;
  shareDelta: number | null; // 점유율 증감(%p)
  mentions: number;
  stockCount: number; // = stocks.length. 표시 숫자와 목록이 어긋나지 못하게 한 출처로 묶는다
  stocks: ThemeStock[]; // 최근 창에 실제로 언급된 종목(주목도 내림차순)
  series: number[]; // 일별 점유율 추이(오래된→최신)
};

/**
 * 최근 창에 실제로 언급된 테마별 종목 목록.
 *
 * 테마 집계표(telegram_theme_daily)에는 '몇 종목'만 있고 '어느 종목'이 없어서,
 * 종목 일별 집계를 테마 사전으로 같은 창에서 다시 묶는다. 사전은 lib/stock-themes.ts
 * 인데 이건 파이프라인 config/stock_themes.py 를 손으로 옮긴 사본이다 — 둘이 어긋나면
 * 이 목록과 집계표의 점유율이 서로 다른 바스켓을 가리킨다(그 파일의 경고 참고).
 *
 * 사전에 있어도 창 안에서 언급이 없으면 목록에 없다. 카드가 "이 테마엔 이런 종목이
 * 있습니다"가 아니라 "이 점유율을 만든 종목은 이들입니다"를 말해야 하기 때문이다.
 */
async function themeStocks(windowDates: string[]): Promise<Map<string, ThemeStock[]>> {
  const out = new Map<string, ThemeStock[]>();
  if (!windowDates.length) return out;
  const db = getSupabaseAdmin();

  // 사전은 종목명으로 적혀 있고 집계는 종목코드다 — stocks 로 한 번 옮긴다.
  // 이름은 KRX 정식명이라야 매칭된다(사전 62종목 전부 매칭됨, 동명 종목 없음).
  const names = [...new Set(Object.values(THEMES).flat())];
  const { data: rows } = await db.from("stocks").select("code,name,market").in("name", names);
  const stockOf = new Map((rows ?? []).map((s) => [s.code as string, s]));
  const themesOf = new Map<string, string[]>(); // 종목코드 → 속한 테마(둘 이상일 수 있다)
  const codeOfName = new Map((rows ?? []).map((s) => [s.name as string, s.code as string]));
  for (const [theme, members] of Object.entries(THEMES)) {
    for (const name of members) {
      const code = codeOfName.get(name);
      if (!code) continue; // stocks 에 없는 이름은 파이프라인 집계에서도 빠진다(스크립트가 경고한다)
      themesOf.set(code, [...(themesOf.get(code) ?? []), theme]);
    }
  }

  // 창이 3일이라 지금은 1000행에 못 미치지만, 추출 종목이 늘면 조용히 잘린다 — 페이징한다.
  const daily = await fetchAllRows<{ stock_code: string; mention_count: number; weighted_score: number }>("id", () =>
    db.from("telegram_stock_daily").select("stock_code,mention_count,weighted_score").in("date", windowDates),
  );

  const agg = new Map<string, Map<string, { m: number; w: number }>>();
  for (const r of daily) {
    for (const theme of themesOf.get(r.stock_code) ?? []) {
      const per = agg.get(theme) ?? new Map<string, { m: number; w: number }>();
      const a = per.get(r.stock_code) ?? { m: 0, w: 0 };
      a.m += r.mention_count || 0;
      a.w += Number(r.weighted_score) || 0;
      per.set(r.stock_code, a);
      agg.set(theme, per);
    }
  }

  for (const [theme, per] of agg) {
    out.set(
      theme,
      [...per.entries()]
        // 언급수가 아니라 주목도(weighted) 순 — 테마 점유율을 매긴 잣대와 같아야
        // "1등 테마를 끌어올린 게 누구인가"가 목록 맨 위에 온다. 동점은 코드로 못박는다.
        .sort((x, y) => y[1].w - x[1].w || x[0].localeCompare(y[0]))
        .map(([code, a]) => ({
          code,
          name: (stockOf.get(code)?.name as string) ?? code,
          market: (stockOf.get(code)?.market as string) ?? null,
          mentions: a.m,
        })),
    );
  }
  return out;
}

/**
 * 테마 로테이션 비교 창.
 *
 * ⚠️ **data-pipeline/common/broadcast_content.py 의 같은 이름 상수와 값이 같아야 한다.**
 * 이 카드의 숫자와 방송 C(테마) 글의 숫자가 같은 날 같은 테마를 말하는데, 그 글은 본문에
 * 이 사이트 링크를 달고 나간다 — 창이 갈리면 클릭 한 번에 어긋남이 보인다. 2026-07-31 에
 * 실제로 그랬다(반도체를 카드는 ▲3.7%p, 방송은 +5.6%p 로 적었다. 파이프라인 쪽이 공백
 * 이틀을 기준 창에 넣고 있었다). Python 과 TS 라 import 로 공유할 수 없어 손으로 맞춘
 * 사본이고, 그래서 규칙을 바꿀 땐 **양쪽을 같이** 고쳐야 한다.
 */
const THEME_LOOKBACK_DAYS = 14;
const THEME_RECENT_DAYS = 3;
const THEME_PRIOR_GAP_DAYS = 5;

/**
 * 테마 로테이션 — 테마별 언급 점유율·순위와 그 변화.
 * 절대 언급량은 주말에 급감해 비교가 안 되므로 '그날 전체 대비 점유율'로 본다.
 * 순위 변동·점유율 증감은 5일 이상 이전 데이터가 있을 때만 계산한다(축적 초기 왜곡 방지).
 */
export async function getThemeRotation(limit = 10): Promise<ThemeRotation[]> {
  const db = getSupabaseAdmin();
  const { data } = await db
    .from("telegram_theme_daily")
    .select("date,theme,share_pct,mention_count,stock_count")
    .gte("date", daysAgoKstDate(THEME_LOOKBACK_DAYS));
  if (!data?.length) return [];

  const dates = [...new Set(data.map((r) => r.date))].sort();
  const latestDate = dates[dates.length - 1];
  const DAY = 24 * 60 * 60 * 1000;
  const daysBefore = (d: string) => (new Date(latestDate).getTime() - new Date(d).getTime()) / DAY;

  // 하루치끼리 비교하면 주말·수집 첫날처럼 표본이 얇은 날에 점유율이 요동친다.
  // 그래서 '최근 3일 평균' vs '5일 이상 이전 평균'으로 창을 잡아 비교한다.
  //
  // **사이에 이틀(3·4일 전)을 비워 두는 이유.** 겹침을 막으려는 게 아니다 — 두 창은
  // 공백이 없어도 겹치지 않는다. 막는 건 경계를 갓 넘어온 날이다. 공백을 없애면 기준
  // 창의 가장 최근 날이 '어제까지 최근 창에 있던 날'이 되어, 최근 3일을 하루 밀린 자기
  // 자신과 견주는 꼴이 된다.
  //
  // 다만 **그게 숫자로 낫다는 근거는 없다.** 2026-07-31 에 지난 재생분으로 '하루가
  // 지날 때 변동폭이 흔들린 폭'을 두 방식으로 재 봤는데, 창이 꽉 찬 날만 추리면
  // (6일·55쌍) 평균은 공백 쪽이 0.99 vs 1.09%p 로 조금 낫고 중앙값(0.45 vs 0.44%p)과
  // 최대(7.4 vs 6.7%p)는 오히려 반대였다. 표본이 그만한 차이를 가릴 만큼 작다.
  // 그래서 이 값은 '더 정확해서'가 아니라 **한쪽으로 정해 두려고** 고른 것이다.
  // 고른 쪽이 이 값인 이유는 이슈 키워드(computeIssueKeywords ↔
  // calculate_telegram_sentiment.py)가 이미 양쪽 다 5일로 맞춰져 있어서다.
  // 바꾸고 싶으면 취향이 아니라 표본을 들고 올 것. 그때도 양쪽을 같이 바꿔야 한다.
  const recentDates = dates.slice(-THEME_RECENT_DAYS);
  // recent 는 **개수**로, prior 는 **날짜 간격**으로 잡는다. 그래서 수집이 며칠 끊기면
  // recent 가 THEME_PRIOR_GAP_DAYS 보다 더 뒤까지 손을 뻗어 같은 날이 양쪽에 들어간다
  // (07-20·07-25·07-30·07-31 만 남은 경우 07-25 가 recent 이면서 5일 이상 이전이다).
  // 그 날은 이중으로 세어져 변동폭을 조용히 깎으므로 명시적으로 뺀다. 카더라 수집은
  // 2026-07-26~28 에 실제로 이틀 멈춘 적이 있다.
  const priorDates = dates.filter(
    (d) => daysBefore(d) >= THEME_PRIOR_GAP_DAYS && !recentDates.includes(d),
  );

  // 최근 창에 한 번도 안 뜬 테마도 카드에는 0%로 남겨야 정원(10개)이 채워진다.
  // 그래서 집계 대상 테마는 '최근 창에 등장한 것'이 아니라 조회 구간 전체의 테마다.
  const allThemes = [...new Set(data.map((r) => r.theme))];

  const avgShare = (window: string[]) => {
    const sum = new Map<string, number>(allThemes.map((t) => [t, 0]));
    for (const r of data) {
      if (!window.includes(r.date)) continue;
      sum.set(r.theme, (sum.get(r.theme) ?? 0) + Number(r.share_pct));
    }
    // 그날 등장하지 않은 테마는 0으로 치므로 창 전체 일수로 나눈다.
    return new Map([...sum].map(([t, v]) => [t, v / Math.max(window.length, 1)]));
  };
  const rankMap = (shares: Map<string, number>) =>
    new Map([...shares].sort((a, b) => b[1] - a[1]).map(([t], i) => [t, i + 1]));

  const recentShare = avgShare(recentDates);
  const priorShare = priorDates.length ? avgShare(priorDates) : null;
  const currRank = rankMap(recentShare);
  const prevRank = priorShare ? rankMap(priorShare) : null;

  // 최근 창의 언급수는 표시용으로 최신일 값이 아니라 창 전체 합을 쓴다.
  const agg = new Map<string, { mentions: number }>();
  for (const r of data) {
    if (!recentDates.includes(r.date)) continue;
    const a = agg.get(r.theme) ?? { mentions: 0 };
    a.mentions += r.mention_count ?? 0;
    agg.set(r.theme, a);
  }

  // 종목은 수만 세지 않고 목록째 가져온다 — 툴팁이 어느 종목인지 보여줘야 하고,
  // 그러면 "종목 N개"도 이 목록에서 나와야 둘이 어긋날 수 없다.
  //
  // 그래서 집계표의 stock_count 는 더 쓰지 않는다. 그 값은 '하루치' 종목 수라,
  // 창 전체에 쓰려면 3일 중 최대값을 잡는 수밖에 없었다(합치면 같은 종목이 세 번
  // 세어진다). 언급수는 창 전체 합인데 종목만 하루치 최대라 잣대가 어긋났고,
  // 무엇보다 목록의 길이와 맞지 않는다 — 반도체는 최대 6이지만 3일 동안 언급된
  // 종목은 7개다. 이제 창 전체의 서로 다른 종목 수로 통일한다.
  const stocksOf = await themeStocks(recentDates);

  const seriesOf = (theme: string) =>
    dates.map((d) => Number(data.find((r) => r.date === d && r.theme === theme)?.share_pct ?? 0));

  return [...recentShare.entries()]
    .map(([theme, share]) => {
      const before = priorShare?.get(theme);
      const pr = prevRank?.get(theme);
      const cr = currRank.get(theme) ?? 0;
      return {
        theme,
        rank: cr,
        rankChange: pr != null ? pr - cr : null,
        sharePct: share,
        shareDelta: before != null ? share - before : null,
        mentions: agg.get(theme)?.mentions ?? 0,
        stockCount: stocksOf.get(theme)?.length ?? 0,
        stocks: stocksOf.get(theme) ?? [],
        series: seriesOf(theme),
      };
    })
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit);
}

export type ChannelRank = {
  handle: string;
  title: string;
  photoUrl: string | null;
  rankChange: number | null; // 3일 순위 변동(+면 상승). 비교할 과거 스냅샷이 없으면 null
  subscriberCount: number | null;
  influenceScore: number;
  viewRate: number | null;
  isGrowing: boolean;
};

/** 채널 파워 랭킹 — 가장 최근 날짜의 Influence Score. */
/**
 * 채널 파워 랭킹의 ▲▼ 순위 변동을 며칠 전과 견줄지. **사흘**이다.
 *
 * 7일 → 5일 → 2일 → 1일까지 내려갔다가 3일로 되돌렸다. 하루로 견주면 **진짜 상승을 놓친다** —
 * 영향력 점수의 재료가 "최근 ~30개 글 / 7일 게시물 수"라 점수가 며칠에 걸쳐 천천히 오르는데,
 * 어제와만 견주면 그 상승이 하루치씩 잘게 쪼개져 배지에 안 걸린다.
 *
 * 2026-07-29 스냅샷 실측(상위 10행):
 *   - 1일 기준: 배지 7개, 중앙값 1계단, 최대 13계단
 *   - 3일 기준: 배지 8개, 중앙값 4계단, 최대 117계단
 * 117계단은 오류가 아니라 DSInvResearch 가 사흘 새 77.6 → 87.5 로 오른 것이고(119위 → 2위),
 * **이 채널은 1일 기준에선 변동 0 이라 배지가 아예 안 떴다**. 같은 날 세 스냅샷의 점수 분포는
 * 평균 75·중앙값 76.1·p90 82.3 으로 똑같아, 기준일(07-26)이 수집 중단으로 눌린 것도 아니다.
 *
 * 창을 늘리면 배지 숫자가 커진다는 것도 같이 알아 둘 것(잡음이 줄지 않는다). 점수가 소수
 * 첫째 자리까지만 저장돼 86.5 에만 5개 채널이 동점인데, ±1~2 계단 배지는 대개 그 동점을
 * 가르는 handle 알파벳 순서가 흔들린 것이라 1일이든 3일이든 남는다.
 *
 * 화면에 "3일 기준" 을 따로 적지는 않는다. 카드 오른쪽 "영향력 점수" 툴팁 한 줄로만
 * 밝힌다(app/kadera/page.tsx 의 noteHelp) — 바꾸려면 두 곳을 같이 볼 것.
 */
const RANK_COMPARE_DAYS = 3;

/**
 * 순위를 견주려면 두 스냅샷의 **모집단이 비슷해야 한다**. 기준일 채널 수가 최신일의
 * 이 비율에 못 미치면 비교를 접는다(배지 없음).
 *
 * 감시 채널이 12개에서 317개로 늘던 날 이 장치가 없어서, 12개 중 8위이던 채널이
 * 317개 중 170위가 되며 "▼162계단" 으로 찍혔다. 채널이 내려간 게 아니라 재는 자가
 * 바뀐 것이다. 0.8 은 채널 몇 개가 빠지는 정상 변동은 통과시키되 이런 도약은 막는 선.
 */
const RANK_POOL_MIN_RATIO = 0.8;

export async function getChannelRanking(limit = 50): Promise<ChannelRank[]> {
  const db = getSupabaseAdmin();
  // 채널 12개 × 하루 1행이라 석 달이면 1000행을 넘긴다 — 그때 잘리면 순위 변동 비교용
  // 과거 스냅샷이 사라지므로 미리 페이징해 둔다.
  // 창을 최근 14일로 자른 건 채널이 317개가 되면서다 — 전 기간을 읽으면 하루 317행씩
  // 늘어난 표를 렌더마다 1,000행 단위로 수십 번 왕복한다. 필요한 건 최신 스냅샷과
  // 3일 이상 이전 비교분 하나뿐이라 14일이면 넉넉하다(대신 파이프라인이 2주 넘게
  // 멈추면 이 카드는 빈다 — 그 상황은 실패 알림으로 먼저 잡힌다).
  const stats = await fetchAllRows<{
    channel_handle: string;
    date: string;
    subscriber_count: number | null;
    influence_score: number | null;
    view_rate: number | null;
    is_growing: boolean | null;
  }>("id", () =>
    db
      .from("telegram_channel_stats")
      .select("channel_handle,date,subscriber_count,influence_score,view_rate,is_growing")
      .not("influence_score", "is", null)
      .gte("date", daysAgoISO(14).slice(0, 10)),
  );
  if (!stats.length) return [];

  // 채널별 최신 스냅샷. 예전엔 date 내림차순 정렬에 기대 "먼저 온 행이 최신"으로
  // 골랐는데, 페이징 정렬 키가 id 로 바뀌었고 애초에 date 는 하루 317행이 동점이라
  // 순서를 보장받을 수 없었다 — 날짜를 직접 비교한다.
  const latest = new Map<string, (typeof stats)[number]>();
  for (const r of stats) {
    const cur = latest.get(r.channel_handle);
    if (!cur || r.date > cur.date) latest.set(r.channel_handle, r);
  }

  // 순위 변동 — 최신일과 "RANK_COMPARE_DAYS 일 이상 이전" 스냅샷의 순위를 비교한다.
  // 그만큼 히스토리가 없으면(축적 초기) null로 두고 화면에서 배지를 숨긴다.
  const dates = [...new Set(stats.map((r) => r.date))].sort();
  const latestDate = dates[dates.length - 1];
  const DAY = 24 * 60 * 60 * 1000;
  const daysBefore = (d: string) => (new Date(latestDate).getTime() - new Date(d).getTime()) / DAY;
  // 기준일은 "RANK_COMPARE_DAYS 일 이상 이전" 중 **가장 최근**이다.
  // 예전엔 dates.find(…) 였는데 dates 는 오름차순이라 조건을 만족하는 **가장 오래된** 날이
  // 잡혔다 — "5일 이상"이라 적어 두고 실제로는 창 끝(7일 전)과 비교하고 있었다.
  // 창 길이(14일)를 건드리면 비교 기준이 같이 흔들리는 구조였다.
  const baseDate = [...dates].reverse().find((d) => daysBefore(d) >= RANK_COMPARE_DAYS);
  // 점수가 같으면 handle 로 가른다. influence_score 는 소수 첫째 자리까지만 저장돼
  // 동점이 흔한데(12채널 중 3쌍이 동점), 그때 JS sort 는 입력 순서를 그대로 두므로
  // 순위가 DB가 돌려준 행 순서에 좌우된다 — 조회 방식만 바꿔도 7·8위가 뒤바뀌고
  // '▲1계단' 배지가 사라졌다 확 나타났다 한다. 채널이 317개면 동점은 더 잦다.
  const byScore = (a: { influence_score: number | null; channel_handle: string }, b: typeof a) =>
    Number(b.influence_score) - Number(a.influence_score) || a.channel_handle.localeCompare(b.channel_handle);
  const rankOn = (date: string) =>
    new Map(
      stats
        .filter((r) => r.date === date)
        .sort(byScore)
        .map((r, i) => [r.channel_handle, i + 1]),
    );
  const currRanks = rankOn(latestDate);
  // 모집단이 크게 달라졌으면 비교하지 않는다. 감시 채널이 12개 → 317개로 늘면서
  // 옛 스냅샷(12개) 순위와 지금(317개) 순위를 견주게 됐고, 채널이 내려간 게 아니라
  // 모집단이 26배가 된 것뿐인데 "▼162계단" 이 찍혔다(2026-07-26 실측).
  // 확장 이력이 RANK_COMPARE_DAYS 만큼 쌓일 때까지는 배지를 접어 둔다 — 틀린 숫자를
  // 보여주느니 아무 말도 안 하는 게 낫다.
  const prevAll = baseDate ? rankOn(baseDate) : null;
  const comparable = prevAll != null && prevAll.size >= currRanks.size * RANK_POOL_MIN_RATIO;
  const prevRanks = comparable ? prevAll : null;

  // 순위는 전 채널로 매기고(위 currRanks/prevRanks), 내려보내는 목록만 자른다.
  // 카드는 10개씩 '더보기'로 펼치는데, 자르지 않으면 317개 행이 통째로 페이지
  // payload에 실린다(사진이 인라인이던 시절엔 그게 행마다 ~12KB씩이었다).
  const ranked = [...latest.values()].sort(byScore).slice(0, limit);
  const { titleOf, photoUrlOf } = await channelMeta();

  return ranked.map((r) => ({
    handle: r.channel_handle,
    title: titleOf.get(r.channel_handle) ?? r.channel_handle,
    photoUrl: photoUrlOf.get(r.channel_handle) ?? null,
    rankChange:
      prevRanks && prevRanks.has(r.channel_handle) && currRanks.has(r.channel_handle)
        ? (prevRanks.get(r.channel_handle) as number) - (currRanks.get(r.channel_handle) as number)
        : null,
    subscriberCount: r.subscriber_count,
    influenceScore: Number(r.influence_score),
    viewRate: r.view_rate != null ? Number(r.view_rate) : null,
    isGrowing: !!r.is_growing,
  }));
}

export type RisingChannel = {
  handle: string | null;
  title: string;
  photoUrl: string | null;
  subscriberCount: number;
  delta7d: number;
  isPlaceholder: boolean; // true=정원을 채우려 복제한 행
  spanDays: number; // 증감을 실제로 잰 구간(스냅샷 축적일). 7일 미만이면 카드도 그렇게 표기한다
};

/**
 * 뜨는 채널 — 스냅샷 사이의 구독자 증가. 스냅샷은 백필이 안 돼 하루씩만 쌓이므로,
 * 축적이 7일에 못 미치는 동안에는 잰 구간(spanDays)을 그대로 노출한다.
 */
export async function getRisingChannels(limit = 10): Promise<RisingChannel[]> {
  const db = getSupabaseAdmin();
  // 채널 하나당 하루 한 행이라 8일 창은 채널 수 × 8 이다 — 채널이 317개면 2,500행이
  // 넘어 페이징 없이는 1,000행에서 조용히 잘린다. 잘리면 대부분 채널이 스냅샷 한 개만
  // 잡혀 아래 `arr.length < 2` 에서 탈락하고, 증감 순위가 실제와 무관해진다.
  const data = await fetchAllRows<{ channel_handle: string; date: string; subscriber_count: number | null }>(
    "id",
    () =>
      db
        .from("telegram_channel_stats")
        .select("channel_handle,date,subscriber_count")
        .gte("date", daysAgoISO(8).slice(0, 10)),
  );

  const byCh = new Map<string, { d: string; s: number }[]>();
  for (const r of data ?? []) {
    if (r.subscriber_count == null) continue;
    const arr = byCh.get(r.channel_handle) ?? [];
    arr.push({ d: r.date, s: r.subscriber_count });
    byCh.set(r.channel_handle, arr);
  }
  // 스냅샷은 백필이 안 돼 오늘부터 하루씩 쌓인다 — 지금 잰 구간이 며칠인지 그대로 알린다.
  const snapDates = [...new Set((data ?? []).map((r) => r.date))].sort();
  const spanDays = snapDates.length
    ? Math.round(
        (new Date(snapDates[snapDates.length - 1]).getTime() - new Date(snapDates[0]).getTime()) / (24 * 60 * 60 * 1000),
      )
    : 0;

  type Delta = { handle: string; subscriberCount: number; delta: number };
  const real: Delta[] = [];
  const flat: Delta[] = [];
  for (const [h, arr] of byCh) {
    if (arr.length < 2) continue;
    arr.sort((a, b) => a.d.localeCompare(b.d));
    const delta = arr[arr.length - 1].s - arr[0].s;
    (delta > 0 ? real : flat).push({
      handle: h,
      subscriberCount: arr[arr.length - 1].s,
      delta,
    });
  }
  // 증감이 같으면 handle 로 가른다 — 정수라 동점이 흔하고(특히 0), 동점을 안 가르면
  // 순서가 DB 행 순서에 딸려 흔들린다(채널 랭킹에서 실제로 겪었다).
  const byDelta = (a: Delta, b: Delta) => b.delta - a.delta || a.handle.localeCompare(b.handle);
  real.sort(byDelta);
  flat.sort(byDelta);

  // 카드 정원은 항상 채운다. 실제로 늘어난 채널을 먼저 넣고, 모자라면 증감이 없거나
  // 줄어든 채널까지 순서대로 끌어온다(표시되는 증감은 실제값 그대로).
  // 지금은 모니터링 채널이 12개뿐이라 "늘어난 곳"만 세면 8개 안팎에서 멈춘다 —
  // 시트에 채널이 늘면 이 보충분은 자연히 밀려나 사라진다.
  const top = [...real, ...flat].slice(0, limit);
  const { titleOf, photoUrlOf } = await channelMeta();
  const filled: RisingChannel[] = top.map((t) => ({
    handle: t.handle,
    title: titleOf.get(t.handle) ?? t.handle,
    photoUrl: photoUrlOf.get(t.handle) ?? null,
    subscriberCount: t.subscriberCount,
    delta7d: t.delta,
    isPlaceholder: false,
    spanDays,
  }));
  // 그래도 모자라면(채널 수 자체가 정원보다 적으면) '빈 행'으로 자리만 채운다.
  // 예전엔 마지막 행을 복제했는데, 그러면 같은 채널이 두 번 표시돼 없는 데이터를
  // 지어내는 꼴이었다 — 카드 높이를 지키자고 사용자에게 거짓을 보일 순 없다.
  while (filled.length && filled.length < limit) {
    filled.push({
      handle: null,
      title: "",
      photoUrl: null,
      subscriberCount: 0,
      delta7d: 0,
      isPlaceholder: true,
      spanDays,
    });
  }
  return filled;
}

// ─────────────────────────────────────────────────────────────────────────────
// LLM 분석 계층 — analyze_telegram_messages.py 가 메시지별로 분류하고,
// calculate_telegram_sentiment.py 가 날짜·테마·화제어로 집계한 결과를 읽는다.
// 화면에 뜨는 비율·횟수는 전부 그 집계값이다(LLM이 센 게 아니다).
// ─────────────────────────────────────────────────────────────────────────────

/** 화제어가 카드에 오르기 위한 최소 언급 수(최근 7일). 한두 번 스친 말이 상위에
 *  끼면 "지금 무엇이 화제인가"라는 카드의 목적이 흐려진다. 집계 테이블에는 전부
 *  남아 있어서, 이 기준만 바꾸면 재계산 없이 반영된다. */
const MIN_KEYWORD_MENTIONS = 3;

export type EcosystemSentiment = {
  /** 낙관도 = 낙관 / (낙관 + 비관), 중립 제외. 카드 헤드라인 숫자.
   *  전체 대비 '긍정 비율'을 쓰면 안 된다 — 실측상 중립이 절반쯤이라 긍정 비율은
   *  구조적으로 낮게 나오고, 긍정(30%)이 비관(22%)보다 많은데도 '비관 우세'로
   *  읽히는 일이 생긴다. 바로 옆 테마별 막대도 같은 기준(중립 제외)이라 카드 안에서
   *  기준이 하나로 통일된다. */
  score: number;
  label: string;
  /** 헤드라인 숫자에 쓸 색 톤. label과 같은 구간에서 같이 나온다(sentimentTone). */
  tone: "hot" | "neutral" | "cold";
  positive: number;
  neutral: number;
  negative: number; // 셋의 합은 항상 100(반올림 보정). 아래 3분할 막대가 이걸 그린다
  messageCount: number;
  summary: string | null; // LLM 총평. 아직 생성 전이면 null
  /** 표본(positive/negative/total)을 같이 넘긴다 — 얇은 테마는 100:0 같은 극단값이
   *  나오는데, 몇 건 기준인지 보여줘야 그 숫자를 제대로 읽을 수 있다. */
  byTheme: { name: string; pos: number; positive: number; negative: number; total: number }[];
};

// 낙관도 → 라벨/색 구간은 시장 브리핑의 감성 카드와 공유한다(lib/format.ts sentimentTone).
// LLM에 맡기지 않고 결정적으로 정해서, 같은 수치면 두 화면이 항상 같은 말을 쓴다.

/** 합이 100이 되도록 반올림을 보정한다(단순 반올림은 99·101이 나와 막대가 어긋난다). */
function toPercents(pos: number, neu: number, neg: number): [number, number, number] {
  const total = pos + neu + neg;
  if (!total) return [0, 0, 0];
  const raw = [(pos / total) * 100, (neu / total) * 100, (neg / total) * 100];
  const floors = raw.map(Math.floor);
  let remainder = 100 - floors.reduce((s, v) => s + v, 0);
  // 소수부가 큰 순서로 남은 1%p씩 나눠 준다.
  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  const out = [...floors];
  for (const { i } of order) {
    if (remainder <= 0) break;
    out[i] += 1;
    remainder -= 1;
  }
  return [out[0], out[1], out[2]];
}

/**
 * 카드에 막대로 그릴 테마 수, 그리고 테마가 막대에 오르기 위한 최소 표본.
 *
 * ⚠️ **두 값 모두 data-pipeline/scripts/generate_telegram_narratives.py 의
 * THEME_TOP_N · MIN_DECIDED 와 같은 값이어야 한다.** 그쪽은 같은 테이블을 같은 기준으로
 * 다시 집계해 LLM 총평의 입력(digest)을 만드는데, 총평은 이 카드 **바로 왼쪽**에 붙는다.
 * 한쪽만 고치면 총평이 옆 막대에 없는 테마의 숫자를 인용하고, 독자는 그 숫자를 확인할
 * 방법이 없다. Python 과 TS 라 import 로 공유할 수 없어 손으로 맞춘 사본이다
 * (lib/stock-themes.ts ↔ config/stock_themes.py 와 같은 관례).
 *
 * 실제로 두 번 났던 일이다. 2026-07-22 에는 하한이 어긋나 표본 서너 건짜리 테마의
 * "100% 긍정"이 총평에만 나왔고(하한을 맞춰 고침), 2026-07-26 에는 개수가 어긋나
 * 5·6위 테마(인터넷·플랫폼 96%, 방산 90%)가 총평에만 나왔다.
 *
 * 4개인 이유는 레이아웃이다. 이 카드는 반칸이라 막대 4줄이 왼쪽 종합 막대 블록과
 * 높이가 맞는 한계다. 그래서 **총평 쪽을 이 값에 맞춘다**(카드를 늘리는 게 아니라).
 */
const THEME_TOP_N = 4;

/** 낙관/비관이 합쳐 이만큼은 돼야 비율에 의미가 있다. 그 아래는 한두 건에 100:0이 되어
 *  실제보다 단정적으로 보인다. 남은 극단값은 표본을 툴팁으로 같이 보여 해석을 돕는다.
 *  위 THEME_TOP_N 주석의 동기화 규칙이 이 값에도 그대로 적용된다. */
const THEME_MIN_DECIDED = 8;

/**
 * 낙관도(%) — 중립을 뺀 '낙관 : 비관' 중 낙관 쪽 비중. **평활을 건다.**
 *
 * 날것의 pos/(pos+neg)는 표본이 적으면 0%·100% 같은 절대값을 뱉는다. 창을 3일로 줄이자
 * 인터넷·플랫폼이 82:0 으로 잡혀 막대가 `0:100` 이 됐다(2026-07-26). 82건이 전부 낙관인
 * 건 진짜 신호지만, 화면에 100%가 찍히면 "비관이 하나도 없다"는 단정이 되고 막대 한쪽이
 * 통째로 빈다. 하루만 지나도 뒤집힐 수치라 그렇게 못 박아 보일 이유가 없다.
 *
 * 그래서 양쪽에 가상 표본 SENTIMENT_PRIOR 건씩을 더해 센다(가산 평활/베이즈 축소).
 *   낙관도 = (낙관 + k) / (낙관 + 비관 + 2k)
 *
 * 성질이 딱 맞는다 — **표본이 크면 사실상 그대로, 작을수록 가운데로 당겨진다.**
 * 실측(k=5): 반도체 122:103 54% → 54%(불변), 전체 64% → 64%(불변),
 *            인터넷·플랫폼 82:0 100% → 95%, 하한(8:0) 100% → 72%.
 *
 * ⚠️ 파이프라인 optimism()(generate_telegram_narratives.py)과 **같은 식·같은 k** 여야 한다.
 * 총평 문장이 인용하는 숫자와 그 옆 막대가 갈리면 확인할 방법이 없는 값이 화면에 나간다.
 */
const SENTIMENT_PRIOR = 5;

function optimismPct(pos: number, neg: number): number | null {
  if (pos + neg === 0) return null;
  return Math.round(((pos + SENTIMENT_PRIOR) / (pos + neg + 2 * SENTIMENT_PRIOR)) * 100);
}


/**
 * 생태계 센티먼트 — 최근 7일 메시지 톤 구성 + 테마별 낙관 비중 + LLM 총평.
 * 테마는 파이프라인이 config/stock_themes.py(테마 로테이션과 같은 사전)로 묶어 둔 것이다.
 */
export async function getEcosystemSentiment(): Promise<EcosystemSentiment | null> {
  const db = getSupabaseAdmin();
  // 종목 리포트와 **같은 날짜 구간**을 본다(windowBefore = 기준일 뺀 그 앞 N일).
  // 예전엔 여기만 daysAgoISO 로 굴러 오늘이 섞였는데, 오늘은 하루가 덜 차서 낙관도가
  // 반쪽 표본에 끌려다녔다. 두 카드가 같은 기간을 말해야 총평 문장도 옆 막대와 맞는다.
  const base = await kaderaBaseDate();
  const window = windowBefore(base, KADERA_WINDOW_DAYS);
  const { data } = await db
    .from("telegram_sentiment_daily")
    .select("date,scope,positive_count,neutral_count,negative_count,message_count")
    .gte("date", window[0])
    .lte("date", window[window.length - 1]);
  if (!data?.length) return null;

  const agg = new Map<string, { pos: number; neu: number; neg: number; total: number }>();
  for (const r of data) {
    const a = agg.get(r.scope) ?? { pos: 0, neu: 0, neg: 0, total: 0 };
    a.pos += r.positive_count ?? 0;
    a.neu += r.neutral_count ?? 0;
    a.neg += r.negative_count ?? 0;
    a.total += r.message_count ?? 0;
    agg.set(r.scope, a);
  }

  const overall = agg.get("overall");
  if (!overall?.total) return null;
  const [positive, neutral, negative] = toPercents(overall.pos, overall.neu, overall.neg);

  // 테마 막대는 낙관↔비관 양분 구조라 중립을 뺀 대립 비율로 그린다.
  // 하한·개수는 총평 쪽과 같이 움직여야 한다(THEME_TOP_N 주석 참고).
  const byTheme = [...agg.entries()]
    .filter(([scope, a]) => scope !== "overall" && a.pos + a.neg >= THEME_MIN_DECIDED)
    .map(([scope, a]) => ({
      name: scope,
      pos: optimismPct(a.pos, a.neg) ?? 50,
      positive: a.pos,
      negative: a.neg,
      total: a.total,
    }))
    .sort((x, y) => y.total - x.total)
    .slice(0, THEME_TOP_N);

  // 총평은 **기준일분만** 집는다. 파이프라인이 이 문장을 저장할 때 쓴 날짜가 곧 기준일이라
  // (generate_telegram_narratives 가 `date: latest` 로 upsert), 날짜로 맞추면 문장이 말하는
  // 사흘과 위 window 가 같은 값이 되는 게 구조로 보장된다.
  //
  // 예전엔 날짜를 안 보고 최신 한 행을 집었다. 그래서 그날 실행이 실패하면 이틀·사흘 전
  // 문장이 오늘 숫자 옆에 그대로 붙었다(2026-08-04 수집 타임아웃 같은 날). 못 찾으면
  // 문장 없이 숫자만 낸다 — 틀린 기간을 말하는 문장을 붙이는 것보다 없는 편이 낫다.
  const { data: brief } = await db
    .from("telegram_daily_brief")
    .select("sentiment_summary")
    .eq("date", base)
    .maybeSingle();

  // 헤드라인은 중립을 뺀 낙관도 — 테마별 막대와 같은 기준으로 맞춘다(위 타입 주석 참고).
  const optimism = optimismPct(overall.pos, overall.neg) ?? 50;

  const { label, tone } = sentimentTone(optimism);

  return {
    score: optimism,
    label,
    tone,
    positive,
    neutral,
    negative,
    messageCount: overall.total,
    summary: (brief?.sentiment_summary as string | null) ?? null,
    byTheme,
  };
}

export type IssueKeyword = {
  word: string;
  count: number; // 최근 7일 언급 수(화면에 그대로 표시)
  /**
   * 관심 점유율의 방향. 비교할 과거가 없으면 null.
   *
   * 예전엔 boolean 이라 '변화 없음'을 담을 자리가 없었다 — `recentAvg >= priorAvg` 라
   * 두 값이 같으면 ▲가 붙었고, 최근 3일에 한 번도 안 나온 화제어(둘 다 0)까지 ▲로
   * 표시됐다. "관심이 늘었다"는 화살표가 관심이 사라진 말에 붙는 셈이었다.
   */
  trend: "up" | "flat" | "down" | null;
};

/**
 * 이슈 키워드 — 종목명이 아닌 화제어 순위.
 *
 * 증감(▲▼)은 **절대 언급 수가 아니라 그날 전체 화제어 중 점유율**로 본다.
 * 주말이면 전체 메시지가 평일의 1/10로 떨어져서, 절대량으로 비교하면 모든 화제어가
 * 일제히 ▼로 표시된다(실제로 그렇게 났다). 점유율로 보면 "관심이 이 화제어로
 * 옮겨갔는가"라는 원래 묻고 싶은 것이 남는다 — 테마 로테이션·급부상 종목이 같은 이유로
 * share 기반이다.
 *
 * 창은 테마 로테이션과 동일하게 최근 3일 평균 vs 5일 이상 이전 평균 — 하루치끼리
 * 비교하면 표본이 얇은 날에 요동친다.
 *
 * ⚠️ **이 규칙의 사본이 파이프라인에도 있다**(calculate_telegram_sentiment.py 의
 * issue_keyword_rows). 평소엔 그쪽이 미리 계산한 값을 읽고, 그 표가 비었을 때만 아래
 * computeIssueKeywords 가 돈다. 즉 규칙이 갈리면 **폴백이 열리는 날에만** 화면이
 * 달라진다 — 가장 알아채기 어려운 종류의 어긋남이라, 한쪽을 고치면 반드시 다른 쪽도
 * 고칠 것. 창(14일)·문턱(3회)·flat 판정도 같이 맞춰야 한다.
 */
export async function getIssueKeywords(limit = 10): Promise<IssueKeyword[]> {
  const stored = await loadIssueKeywords(limit);
  return stored ?? computeIssueKeywords(limit);
}

/**
 * 파이프라인이 미리 계산해 둔 카드(마이그레이션 023). 없으면 null 을 돌려
 * 호출부가 즉석 계산으로 떨어진다.
 *
 * **캐시가 아니라 계산을 옮긴 것이다.** telegram_keyword_daily 는 파이프라인이 돌 때만
 * 바뀌므로, 실행과 실행 사이에 아래 computeIssueKeywords 는 얼어붙은 입력에 대한 순수
 * 함수다 — 매 렌더가 14일치 23,672행을 다시 읽어 매번 같은 10줄을 만들고 있었다
 * (실측 2026-07-29: /kadera 서버 렌더 1,775ms 중 1,131ms). 미리 계산해 두어도 화면 값은
 * 한 글자도 달라지지 않는다.
 *
 * 저장된 순서를 그대로 쓴다 — 여기서 다시 정렬하면 파이프라인과 규칙이 갈릴 자리가
 * 하나 더 생긴다.
 */
async function loadIssueKeywords(limit: number): Promise<IssueKeyword[] | null> {
  const db = getSupabaseAdmin();
  try {
    const { data, error } = await db
      .from("telegram_issue_keyword")
      .select("rank,keyword,mention_count,trend")
      .order("rank")
      .limit(limit);
    if (error || !data?.length) return null;
    return data.map((r) => ({
      word: r.keyword as string,
      count: r.mention_count as number,
      trend: (r.trend ?? null) as IssueKeyword["trend"],
    }));
  } catch {
    // 표가 아직 없는 환경(마이그레이션 023 미적용)도 여기로 온다. 화면을 세우지 않고
    // 예전 경로로 간다 — 이 표는 속도만 담당하고 정확성은 담당하지 않는다.
    return null;
  }
}

/** 원자료에서 직접 세는 원래 경로. 위 표가 비었을 때만 쓰인다. */
async function computeIssueKeywords(limit: number): Promise<IssueKeyword[]> {
  const db = getSupabaseAdmin();
  // 화제어는 하루 200행꼴이라 2주면 1,000행 상한을 훌쩍 넘는다 — 반드시 페이징.
  const data = await fetchAllRows<{ date: string; keyword: string; mention_count: number }>(
    "id",
    () =>
      db
        .from("telegram_keyword_daily")
        .select("date,keyword,mention_count")
        .gte("date", daysAgoISO(14).slice(0, 10)),
  );
  if (!data.length) return [];

  const dates = [...new Set(data.map((r) => r.date))].sort();
  const latestDate = dates[dates.length - 1];
  const DAY = 24 * 60 * 60 * 1000;
  const daysBefore = (d: string) => (new Date(latestDate).getTime() - new Date(d).getTime()) / DAY;

  const recentDates = new Set(dates.slice(-3));
  const priorDates = new Set(dates.filter((d) => daysBefore(d) >= 5));
  const last7 = new Set(dates.filter((d) => daysBefore(d) < 7));

  // 그날 전체 화제어 언급 합 — 점유율의 분모.
  const dayTotal = new Map<string, number>();
  for (const r of data) {
    dayTotal.set(r.date, (dayTotal.get(r.date) ?? 0) + (r.mention_count ?? 0));
  }

  const total = new Map<string, number>();
  const recentShare = new Map<string, number>();
  const priorShare = new Map<string, number>();
  for (const r of data) {
    const n = r.mention_count ?? 0;
    if (last7.has(r.date)) total.set(r.keyword, (total.get(r.keyword) ?? 0) + n);
    const share = n / Math.max(dayTotal.get(r.date) ?? 1, 1);
    if (recentDates.has(r.date)) {
      recentShare.set(r.keyword, (recentShare.get(r.keyword) ?? 0) + share);
    }
    if (priorDates.has(r.date)) {
      priorShare.set(r.keyword, (priorShare.get(r.keyword) ?? 0) + share);
    }
  }

  const canCompare = priorDates.size > 0;
  return [...total.entries()]
    .filter(([, count]) => count >= MIN_KEYWORD_MENTIONS)
    // 언급 수가 같으면 화제어로 가른다 — 정수라 동점이 흔하고, 안 가르면 순위가
    // DB 행 순서에 딸려 흔들린다(채널 랭킹에서 실제로 겪었다).
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([word, count]) => {
      // 창 길이가 다르므로 '하루 평균 점유율'로 맞춰 비교한다.
      // 그날 등장하지 않은 화제어는 점유율 0으로 치므로 창 전체 일수로 나눈다.
      const recentAvg = (recentShare.get(word) ?? 0) / Math.max(recentDates.size, 1);
      const priorAvg = (priorShare.get(word) ?? 0) / Math.max(priorDates.size, 1);
      // 부동소수 비교라 정확히 같은 경우는 드물다 — 점유율 차이가 무시할 수준이면
      // 'flat' 으로 본다. 둘 다 0인 경우(최근 창에 한 번도 안 나온 말)도 여기 걸린다.
      const FLAT = 1e-6;
      const trend: IssueKeyword["trend"] = !canCompare
        ? null
        : Math.abs(recentAvg - priorAvg) < FLAT
          ? "flat"
          : recentAvg > priorAvg
            ? "up"
            : "down";
      return { word, count, trend };
    });
}

/**
 * 종목별 흐름 요약(LLM) — **기준일분만** 종목코드로 찾아 쓴다.
 * 파이프라인이 상위 몇 종목만 만들므로, 없는 종목은 카드에서 문단이 빠진다.
 *
 * 센티먼트 총평과 같은 이유로 날짜를 맞춘다 — 이 문장이 세는 창도 기준일 앞 3일이라
 * (build_stock_digests 도 `latest - 1일`에서 끝난다), 날짜를 안 보고 최신 행을 집으면
 * 막대는 기준일까지 그리는데 글은 그 하루 전까지를 말하게 된다.
 */
export async function getStockNarratives(): Promise<Record<string, string>> {
  const db = getSupabaseAdmin();
  const { data } = await db
    .from("telegram_stock_narrative")
    .select("stock_code,narrative")
    .eq("date", await kaderaBaseDate());
  return Object.fromEntries((data ?? []).map((r) => [r.stock_code as string, r.narrative as string]));
}
