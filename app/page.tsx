import { SCORE_TREND_DAYS, getKospiCloseSeries, getKrIndexClosesSide, getLatestDailyScore, getPublicIndicators, getScoreHistory, getTopStockHighGaps } from "@/lib/data";
import { formatKstUpdate } from "@/lib/format";
import { assertLoaded, isLoadFailed } from "@/lib/load-state";
import type { IndicatorCategory } from "@/lib/data";
import { Icon, stageForScore } from "./ui";
import { pick, GenericCard } from "./home/parts";
import { ANCHOR_ALIAS, BAND_LABELS, DIST_FILL } from "./home/Hero";
import type { BandItem } from "./home/Hero";
import { BriefModule, IndexModule } from "./home/V2Briefing";
import { CoverIndexCell, CoverLinkCell, CoverMeta, Module, type CoverLink } from "./kadera/V2Modules";
import { CardBuffett, CardLeverage, CardMarketActions, CardTurnover, CardHighGap, CardSpeed, CardVkospi, CardAsia, CardGoldRatio, CardVolume, CardFx, CardNetBuy, CardLimitUp, CardPutCall, CardDeposit } from "./home/cards-market";
import { CardComingSoon, CardDivergence, CardTrend, CardSentiment, CardYoutube, CardSpending, CardUpbit, CardBrokerage } from "./home/cards-sentiment";
import type { IconName } from "@/lib/icon-names";
import { loadSpotlight, type SpotChip } from "./home/spotlight-data";

// 캐시 주기는 루트 레이아웃의 `revalidate` 가 정한다(app/layout.tsx). 예전엔 여기가
// force-dynamic 이라 방문마다 서버가 새로 그렸다.

/**
 * 섹션 머리 — [제목 + 카드 수] ... [초고온 N].
 *
 * 가로줄을 걷었다. 줄은 "여기서부터 다른 묶음"이라는 것만 말하는데, 목업은 그 자리에
 * **숫자 둘**을 넣는다 — 이 묶음이 몇 장인지, 그중 몇 장이 지금 뜨거운지.
 *
 * 초고온 배지는 0일 때 회색이다. 빨간 알약에 "초고온 0"이라고 적으면 색이 먼저 읽혀서
 * 뜨겁다는 인상이 남는다. 색이 곧 값이어야 한다.
 *
 * ⚠️ count 는 **카드 수**지 지표 수가 아니다(감성은 명품·오마카세가 한 장이고, 시장엔
 * '준비 중' 카드가 한 장 더 있다). 사이드바의 SECTION_NAV 와 같은 값이라 함께 볼 것.
 */
// ── 페이지 ────────────────────────────────────────────────────────
// 목업에서 명시적으로 배치·결합·순서가 정해진 slug들. 이 목록에 없는
// 공개 지표는 각 섹션 끝에 일반 카드로 덧붙여 자동 노출을 유지한다.
const LAID_OUT = new Set([
  "buffett_index", "leverage_etf_volume", "market_actions_30d", "turnover_concentration",
  "kospi_high_gap", "kospi_speed_60d", "vkospi", "kospi_asia_relative_strength",
  "kospi_gold_ratio", "kospi_volume_surge", "usdkrw_volatility",
  "foreign_sell_at_high", "put_call_ratio", "limit_up_breadth", "investor_deposit",
  "naver_search_trend", "dcinside_post_count", "news_sentiment", "bestseller_finance_ratio",
  "youtube_finance_search_views", "luxury_consumption_index", "fine_dining_search_index",
  "upbit_speculation_index", "github_trading_bot_repos", "brokerage_app_rank",
  "small_business_crisis_index",
]);

const FALLBACK_ICONS: Record<string, IconName> = {
  시장: "insights",
  감성: "tag",
};

export default async function Home() {
  const [dailyScore, indicators, rawTopGaps, rawKospiPath, rawScoreTrend, spotlight, rawIndexes] = await Promise.all([
    getLatestDailyScore(),
    getPublicIndicators(),
    getTopStockHighGaps(3),
    // 상승 속도 카드의 60일 궤적. 내부용 지표라 getPublicIndicators 에 안 잡힌다.
    getKospiCloseSeries(61),
    // 히어로의 햇쩨 지수 추이(최근 SCORE_TREND_DAYS 일).
    getScoreHistory(),
    // 히어로 바닥 '오늘 눈에 띄는 것' 칩. 실패해도 던지지 않는다(app/home/spotlight-data.ts 머리말) —
    // 그래서 아래 assertLoaded 에 넣지 않는다.
    loadSpotlight(),
    // v2 첫 줄의 지수 종가(국장 카더라와 같은 칸). 곁들이는 칸이라 실패해도 칸만 빠진다.
    getKrIndexClosesSide(),
  ]);

  /* 조회 실패를 "자료 없음" 과 가른다(lib/load-state.ts). 두 값 다 카드의 **곁가지**라,
     실패하면 예전엔 그 구간이 소리 없이 사라졌다 — 고점 근접 목록이 통째로 빠지고
     상승 속도 스파크라인이 안 그려졌는데, 카드는 멀쩡해 보였다.
     ⭐ 이 저장소의 규칙은 "카드는 숨기지 말고 이유를 적을 것" 이다. 그래서 값을 감추는
     대신 실패했다는 사실을 카드 안에 한 줄로 남긴다. */
  // 실패한 조회가 있으면 던진다 — 사본(ISR)에 실패한 화면을 담지 않는다(lib/load-state.ts).
  // 아래의 "실패했다는 사실을 카드에 남기는" 길은 그래서 실제로는 안 탄다. 남겨 두는 건
  // 던지지 않기로 되돌릴 때 그대로 살아나게 하려는 것이다.
  assertLoaded("/", { topGaps: rawTopGaps, kospiPath: rawKospiPath, scoreTrend: rawScoreTrend });
  const topGapsFailed = isLoadFailed(rawTopGaps);
  const topGaps = topGapsFailed ? [] : rawTopGaps;
  const kospiPathFailed = isLoadFailed(rawKospiPath);
  const kospiPath = kospiPathFailed ? [] : rawKospiPath;

  const bySlug = new Map(indicators.map((i) => [i.slug, i]));
  const p = (slug: string) => pick(bySlug.get(slug));
  // 카드 isHit과 완전히 동일한 기준(youtube 예외 포함)으로 히어로 카운트를 맞춘다.
  const countHits = (cat: IndicatorCategory) =>
    indicators.filter((i) => i.category === cat && pick(i).isHit).length;

  const extra = (cat: IndicatorCategory) =>
    indicators.filter((i) => i.category === cat && !LAID_OUT.has(i.slug));

  // 히어로 '지표 분포' — 지표(26개)를 네 구간으로 센다. 과열도가 아직 없는 지표는 빼므로 햇쩨 지수 머리의 '지표 N개'도 이 합이다.
  // 카드의 구간 판정(overheatColor)·초고온 배지(isHit)와 **같은 값**을 쓴다: capped(0~100)
  // 를 stageForScore 에 넣는다. 다른 기준으로 세면 "초고온 3개"라고 적어 놓고 시트에는
  // 빨간 셀이 둘만 보이는 일이 난다.
  // capped 가 null 인 지표(자료가 아직 안 온 것)는 **빼고** 센다 — isHit 은 null 을 0 으로
  // 떨어뜨리지만, 그건 '초고온이 아니다'를 판정하려는 것이지 '저온이다'라는 뜻이 아니다.
  //
  // 세는 김에 **이름도 같이 담는다** — 줄에 마우스를 올리면 그 구간의 지표가 목록으로
  // 열린다. 개수와 목록이 같은 순회에서 나오므로 둘이 갈릴 자리가 없다.
  const bandItems: BandItem[][] = [[], [], [], []];
  for (const i of indicators) {
    const v = pick(i).capped;
    if (v === null) continue;
    bandItems[BAND_LABELS.indexOf(stageForScore(v))].push({ slug: i.slug, name: i.name, heat: v });
  }
  // 구간 안에서는 뜨거운 것부터. 목록이 열두 줄까지 가는 구간이 있어서, 순서가 없으면
  // 그 구간에서 무엇이 경계에 가까운지가 안 읽힌다.
  for (const list of bandItems) list.sort((a, b) => b.heat - a.heat);
  const bandCounts = BAND_LABELS.map((label, i) => ({
    label,
    count: bandItems[i].length,
    fill: DIST_FILL[i],
    items: bandItems[i],
  }));
  const bandTotal = bandCounts.reduce((a, b) => a + b.count, 0);

  // 세 줄 요약의 굵은 지표 이름 → 그 카드. 괄호를 뗀 짧은 이름("VKOSPI")도 받는다 — 모델이 줄여 쓴다.
  const nameAnchors: Record<string, string> = {};
  for (const i of indicators) {
    const href = `#ind-${ANCHOR_ALIAS[i.slug] ?? i.slug}`;
    nameAnchors[i.name] = href;
    const short = i.name.replace(/\s*\([^)]*\)\s*$/, "");
    if (short && short !== i.name) nameAnchors[short] = href;
  }

  /* ── v2(2026-10-03) — 카더라 v2 의 디자인 규칙을 옮겼다 ──────────────────────────
     첫 줄 띠(지수 종가 · 링크 칸 · 업데이트) → 둘째 줄 [햇쩨 지수 | 오늘의 브리핑] → 지표 모듈 둘(시장 · 감성).
     페이지 제목 · 구간 제목('01 시장 지표')은 걷고 모듈 머리 띠가 이름을 말한다. 카드 안의 부제 · 바닥 설명 문장은 v2.css .v2-bf 가 숨긴다.
     링크 칸은 홈 '오늘 눈에 띄는 것'의 재료다(급부상 1위 · 테마 유입 1위). ⛔ 밤사이 미장 칸은 안 쓴다 — 2026-10-03 "별로". */
  // 언급 배수('언급 5.9배' · '첫 언급')엔 색을 싣지 않는다 — 빨강은 주가가 오른 말로 읽힌다(카더라 띠 · 표와 같은 규칙, 2026-10-05 점검).
  const toLink = (c: SpotChip): CoverLink => ({
    cap: c.cap,
    name: c.name,
    val: c.val.replace("▲", "+"),
    tone: c.val.includes("언급") ? "flat" : "up",
    href: c.href,
    ga: c.ga,
  });
  const coverLinks = [spotlight.timed.kadera, ...spotlight.fixed].filter((c): c is SpotChip => c !== null).map(toLink);
  const indexes = isLoadFailed(rawIndexes) ? null : rawIndexes;
  const nMarket = indicators.filter((i) => i.category === "시장").length;
  const nSocial = indicators.filter((i) => i.category === "감성").length;
  const hitsMeta = (n: number, hits: number) => `${n}개${hits ? ` · 초고온 ${hits}` : ""}`;


  return (
    /* 뿌리의 hz-tx 는 카드 안 조판(시트 · 셀)을 켠다 — globals.css. v2-kd 는 v2 토큰 · 폭 단계, v2-bf 는 이 화면 전용 덮기(v2.css). */
    <div className="hz-tx v2-kd v2-bf">
            {/* 첫 줄 — 지수 종가 · 링크 칸(카더라로) · 업데이트 */}
            <div className="v2-cover">
              {indexes && <CoverIndexCell kospi={indexes.kospi} kosdaq={indexes.kosdaq} />}
              {coverLinks.map((c) => (
                <CoverLinkCell key={c.ga} c={c} />
              ))}
              {/* '지표 25개 분석'은 걷었다 — 바로 아래 햇쩨 지수 머리('지표 25개')와 같은 말이다(v2, 2026-10-03). */}
              <CoverMeta updated={dailyScore ? formatKstUpdate(dailyScore.updated_at, "업데이트") : "업데이트 준비 중"} />
            </div>

            {/* 둘째 줄 — 햇쩨 지수 | 오늘의 브리핑 */}
            {dailyScore ? (
              <div className="v2-bf-band">
                <IndexModule dailyScore={dailyScore} trend={isLoadFailed(rawScoreTrend) ? null : rawScoreTrend} days={SCORE_TREND_DAYS} bands={bandCounts} total={bandTotal} />
                <BriefModule summary={dailyScore.ai_summary} nameAnchors={nameAnchors} />
              </div>
            ) : (
              <Module id="index" title="햇쩨 지수">
                <p className="v2-empty">아직 계산된 스코어가 없습니다.</p>
              </Module>
            )}

            {/* 시장 지표 (category=시장) — 모듈 하나에 셀 격자. 구간 제목(SectionIntro)의 앵커 id 는 모듈이 그대로 잇는다. */}
            <Module id="market" title="시장 지표" meta={hitsMeta(nMarket, countHits("시장"))} className="v2-sheet">
              <div className="hz-cards">
                {/* 순서 = 가중치(config/indicator_weights.py) × 직관성 × 변동성.
                    ① 가중치 1·2위(4.5/4.0)를 2칸으로 맨 앞에 — 둘 다 설명이 필요 없는 지표다.
                    ② 그 다음 핵심 수급·심리를 1칸으로 묶고,
                    ③ 콘텐츠가 풍부한 2칸 카드들, ④ 해석이 한 단계 필요한 지표 순.
                    버핏지수는 예전에 맨 앞이었지만 분기 GDP 기반이라 30일 변동계수가
                    0.04로 거의 안 움직여(가중치 주석의 "느림·비타이밍"과 같은 이유) 뒤로 뺐다. */}
                <CardHighGap v={p("kospi_high_gap")} tops={topGaps} failed={topGapsFailed} />
                <CardVolume v={p("kospi_volume_surge")} />
                <CardSpeed v={p("kospi_speed_60d")} path={kospiPath} failed={kospiPathFailed} />
                <CardLimitUp v={p("limit_up_breadth")} />
                <CardNetBuy v={p("foreign_sell_at_high")} />
                <CardTurnover v={p("turnover_concentration")} />
                <CardPutCall v={p("put_call_ratio")} />
                <CardMarketActions v={p("market_actions_30d")} />
                <CardVkospi v={p("vkospi")} />
                <CardLeverage v={p("leverage_etf_volume")} />
                <CardBuffett v={p("buffett_index")} />
                <CardGoldRatio v={p("kospi_gold_ratio")} />
                <CardFx v={p("usdkrw_volatility")} />
                <CardAsia v={p("kospi_asia_relative_strength")} />
                {/* 예탁금은 바로 옆 '신용융자 잔고(준비 중)'와 짝이다 — 둘 다 개인이 증권계좌로 들인 돈이다. */}
                <CardDeposit v={p("investor_deposit")} />
                <CardComingSoon />
                {/* 순서 = 가중치 × 직관성 × 변동성. VIX 대비 VKOSPI 스프레드는 내렸다 — 1년의 76%가 과열도 0이라
                    종합점수에 기여하지 못했고, VKOSPI 에서 파생된 지표라 VKOSPI 카드와 겹쳤다.
                    v2 행 구성(4열, 칸 합계 16): [신고가·거래대금·속도·급등] [외국인·쏠림·풋콜·안전장치]
                                                [VKOSPI·레버리지·버핏·금] [환율·아시아·예탁금·준비중]
                    예탁금(2026-10-06)이 들어오며 '준비 중'이 두 칸에서 한 칸이 됐다. */}
                {extra("시장").map((i) => (
                  <GenericCard key={i.id} v={pick(i)} icon={FALLBACK_ICONS["시장"]} />
                ))}
              </div>
            </Module>

            {/* 감성 지표 (category=감성) */}
            <Module id="sentiment" title="감성 지표" meta={hitsMeta(nSocial, countHits("감성"))} className="v2-sheet">
              <div className="hz-cards">
                {/* 시장 지표와 같은 원칙으로 순서만 바꿨다. 검색량(가중치 3.0)과 코인 투기를 앞세우고,
                    명품·오마카세는 재미는 크지만 가중치 0.5+0.5에 후행 지표라 뒤로.
                    v2 행 구성(4열, 칸 합계 12): [검색량·뉴스·디씨·코인] [여윳돈·실물괴리·유튜브·베스트셀러]
                                                [봇레포·증권앱·제보2] */}
                <CardTrend v={p("naver_search_trend")} icon="search" />
                <CardSentiment v={p("news_sentiment")} icon="newspaper" countNoun="뉴스" />
                <CardSentiment v={p("dcinside_post_count")} icon="forum" countNoun="글" />
                <CardUpbit v={p("upbit_speculation_index")} />
                <CardSpending luxury={p("luxury_consumption_index")} dining={p("fine_dining_search_index")} />
                <CardDivergence v={p("small_business_crisis_index")} />
                <CardYoutube v={p("youtube_finance_search_views")} />
                <CardTrend v={p("bestseller_finance_ratio")} icon="menu_book" />
                <CardTrend v={p("github_trading_bot_repos")} icon="terminal" />
                <CardBrokerage v={p("brokerage_app_rank")} />
                {extra("감성").map((i) => (
                  <GenericCard key={i.id} v={pick(i)} icon={FALLBACK_ICONS["감성"]} />
                ))}
                <a
                  className="hz-report-cell hz-cell-wide"
                  href="https://forms.gle/P4wzp2DkP2wyTPWP9"
                  target="_blank"
                  rel="noopener noreferrer"
                  data-ga="cta_click"
                  data-ga-cta="report_indicator"
                  data-ga-surface="sentiment_grid"
                  // v2(2026-10-03): 점선 · 파란 면 · 아이콘 타일 · 곁말('아이디어가 있다면 알려주세요')을 걷고 칸 가운데 링크 한 줄로.
                  // 꼴은 v2.css .hz-report-cell — 이 칸은 홈에만 있어 인라인 값을 !important 로 덮던 것을 걷었다.
                >
                  <Icon name="add_circle" />
                  <strong>새로운 지표 제보하기</strong>
                </a>
              </div>
            </Module>
    </div>
  );
}
