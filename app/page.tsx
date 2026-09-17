import { getKospiCloseSeries, getLatestDailyScore, getPublicIndicators, getTopStockHighGaps } from "@/lib/data";
import { isLoadFailed } from "@/lib/load-state";
import { SectionIntro } from "./SectionIntro";
import type { IndicatorCategory } from "@/lib/data";
import { C, Icon, R, stageForScore } from "./ui";
import { pick, GenericCard } from "./home/parts";
import { BAND_LABELS, DIST_FILL, Hero } from "./home/Hero";
import type { BandItem } from "./home/Hero";
import { CardBuffett, CardLeverage, CardMarketActions, CardTurnover, CardHighGap, CardSpeed, CardVkospi, CardAsia, CardGoldRatio, CardVolume, CardFx, CardNetBuy, CardLimitUp, CardPutCall } from "./home/cards-market";
import { CardComingSoon, CardDivergence, CardTrend, CardSentiment, CardYoutube, CardSpending, CardUpbit, CardBrokerage } from "./home/cards-sentiment";

// 지표는 하루 단위(GitHub Actions 배치)로 갱신되므로, 빌드 시점에 정적으로
// 굳어버리지 않도록 매 요청마다 서버에서 새로 조회한다.
export const dynamic = "force-dynamic";

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
  "foreign_sell_at_high", "put_call_ratio", "limit_up_breadth",
  "naver_search_trend", "dcinside_post_count", "news_sentiment", "bestseller_finance_ratio",
  "youtube_finance_search_views", "luxury_consumption_index", "fine_dining_search_index",
  "upbit_speculation_index", "github_trading_bot_repos", "brokerage_app_rank",
  "small_business_crisis_index",
]);

const FALLBACK_ICONS: Record<string, string> = {
  시장: "insights",
  감성: "tag",
};

export default async function Home() {
  const [dailyScore, indicators, rawTopGaps, rawKospiPath] = await Promise.all([
    getLatestDailyScore(),
    getPublicIndicators(),
    getTopStockHighGaps(3),
    // 상승 속도 카드의 60일 궤적. 내부용 지표라 getPublicIndicators 에 안 잡힌다.
    getKospiCloseSeries(61),
  ]);

  /* 조회 실패를 "자료 없음" 과 가른다(lib/load-state.ts). 두 값 다 카드의 **곁가지**라,
     실패하면 예전엔 그 구간이 소리 없이 사라졌다 — 고점 근접 목록이 통째로 빠지고
     상승 속도 스파크라인이 안 그려졌는데, 카드는 멀쩡해 보였다.
     ⭐ 이 저장소의 규칙은 "카드는 숨기지 말고 이유를 적을 것" 이다. 그래서 값을 감추는
     대신 실패했다는 사실을 카드 안에 한 줄로 남긴다. */
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

  // 히어로 '지표 분포' — 25개를 네 구간으로 센다.
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

  return (
    /* 뿌리의 hz-tx 가 이번 리디자인(시트 모서리 20·구간 제목·히어로 격자)을 켠다 — globals.css. */
    <div className="hz-tx">
            {dailyScore ? (
              <Hero
                dailyScore={dailyScore}
                tradHits={countHits("시장")}
                socialHits={countHits("감성")}
                bandCounts={bandCounts}
                bandTotal={bandTotal}
              />
            ) : (
              <section style={{ background: C.card, borderRadius: 16, padding: 44, textAlign: "center", color: C.sub }}>
                아직 계산된 스코어가 없습니다.
              </section>
            )}

            {/* 시장 지표 (category=시장) */}
            <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <SectionIntro n={1} id="market" title="시장 지표" />
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
                <CardComingSoon />
                {/* 순서 = 가중치 × 직관성 × 변동성. 칸 합계 20으로 5행이 정확히 채워진다.
                    VIX 대비 VKOSPI 스프레드는 내렸다 — 1년의 76%가 과열도 0이라 종합점수에
                    기여하지 못했고, VKOSPI 에서 파생된 지표라 VKOSPI 카드와 겹쳤다.
                    그 한 칸을 버핏지수(1→2칸)로 돌려 총량은 그대로다.
                    행 구성: [신고가2·거래대금·예탁금] [VKOSPI·순매수·풋콜·쏠림]
                             [안전장치2·위험자산2] [버핏2·레버리지2]
                             [환율·아시아2·준비중] */}
                {extra("시장").map((i) => (
                  <GenericCard key={i.id} v={pick(i)} icon={FALLBACK_ICONS["시장"]} />
                ))}
              </div>
            </section>

            {/* 감성 지표 (category=감성) */}
            <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <SectionIntro n={2} id="sentiment" title="감성 지표" />
              <div className="hz-cards">
                {/* 시장 지표와 같은 원칙으로 순서만 바꿨다 — 칸 수는 기존과 동일(12칸).
                    검색량(가중치 3.0)과 코인 투기를 앞세우고, 명품·오마카세는 재미는 크지만
                    가중치 0.5+0.5에 후행 지표라 뒤로, 베스트셀러는 30일간 값이 2종류뿐일
                    만큼 안 움직여 맨 뒤로 뺐다.
                    행 구성: [검색량·코인·디씨·뉴스] [증권앱·유튜브·실물괴리2]
                             [명품2·봇레포·베스트셀러] — 3행이 정확히 채워진다. */}
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
                  href="https://forms.gle/P4wzp2DkP2wyTPWP9"
                  target="_blank"
                  rel="noopener noreferrer"
                  data-ga="cta_click"
                  data-ga-cta="report_indicator"
                  data-ga-surface="sentiment_grid"
                  // 시트의 한 칸이라 **라운드를 주지 않는다.** 라운드를 두면 격자 안에서
                  // 이 칸만 안쪽으로 물러난 카드처럼 보인다. 점선 테두리가 이미 "이건
                  // 지표가 아니라 빈자리"를 말한다.
                  style={{
                    background: "var(--c-blue-tint2)",
                    border: "1.5px dashed var(--c-blue-4)",
                    padding: 22,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 10,
                    textAlign: "center",
                    minHeight: 180,
                    textDecoration: "none",
                  }}
                >
                  <div style={{ width: 44, height: 44, borderRadius: R.control, background: "var(--c-card)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Icon name="add_circle" style={{ fontSize: "var(--fs-23)", color: "var(--c-blue)" }} />
                  </div>
                  <strong style={{ fontSize: "var(--fs-15)", fontWeight: 800, color: "var(--c-ink)" }}>새로운 지표 제보하기</strong>
                  <span style={{ fontSize: "var(--fs-12-5)", color: "var(--c-sub)" }}>아이디어가 있다면 알려주세요</span>
                </a>
              </div>
            </section>
    </div>
  );
}
