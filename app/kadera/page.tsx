import { Skeleton } from "@/components/ui/skeleton";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import {
  getChannelRanking,
  getEcosystemSentiment,
  getIssueKeywords,
  getRisingChannels,
  getStockNarratives,
  getSurgingOneliners,
  getStockReport,
  getSurgingStocks,
  getTelegramSummary,
  getThemeRotation,
  getTopStocksWithTrend,
  getTrendingMessages,
  KADERA_WINDOW_DAYS,
} from "@/lib/telegram-data";
import type { ThemeRotation } from "@/lib/telegram-data";

import { formatKstUpdate } from "@/lib/format";
import { assertLoaded, isLoadFailed } from "@/lib/load-state";

import { KADERA_CARD } from "../og-copy";
import { pageMetadata } from "../seo";
import { AiMark, C, Icon } from "../ui";
import { SentimentTrendTile, ThemeVsUsualRows, highlightTerms, termsFor } from "./parts";
import { fmtKoDate } from "@/lib/stock-page";
import { THEME_NAMES, themeHref } from "@/lib/theme-href";
import { THEMES } from "@/lib/stock-themes";
import { THEME_PUBLIC } from "../screen-flags";
import { BOARD_TILES, getMoveReasons, getUpcomingEvents, todayKst } from "@/lib/kadera-why";
import { CHANNEL_FORM } from "../brand";
import { StockBoard } from "./StockBoard";
import { PanelTabs } from "./PanelTabs";
import { ChannelRows, EventRows, FeedRows, KeywordRows, RisingRows, ThemeRows } from "./V2Lists";
import type { BoardStock, BoardTab } from "./StockBoard";

// 미리보기 이미지는 옆의 opengraph-image.tsx 가 그린다(ownImage). 자세한 건 app/seo.ts 주석 참고.
export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata({
    title: "국장 카더라 | hatzze",
    description: "주식 텔레그램 채널 수백 개를 대신 읽습니다. 오늘 가장 많이 언급된 종목과 가장 많이 퍼진 메시지를 매일 집계합니다.",
    path: "/kadera",
    ownImage: KADERA_CARD.alt,
  });
}

/**
 * 화면 사본(ISR)의 수명. 루트 레이아웃 기본값(1시간)보다 짧게 두는 건 종목 카드의 시세
 * 때문이다 — 야후 시세는 10분 캐시라 장중엔 페이지가 스스로 낡는다. 30분이면 장중 시세가
 * 최대 30분 묵고, 다시 그리는 값(원천 전송·CPU·ISR 쓰기)은 5분 때의 6분의 1 이다(2026-09-19
 * 셈: 1시간 $0.15 · 30분 $0.21 · 10분 $0.35 / 하루, 전 화면 합). 파이프라인이 총평을 쓴
 * 직후와 끝날 때 /api/revalidate 로 비우므로 자료 쪽 지연은 이 숫자와 무관하다(앞의
 * 것은 이 두 화면만 찍어 비운다 — scripts/revalidate.sh).
 * 예전엔 여기가 force-dynamic 이라 방문마다 서버가 새로 그렸다.
 * ⚠️ 리터럴이어야 한다. 국장·미장이 같은 값이다.
 */
export const revalidate = 1800;

/* 요약 글의 굵힘(highlightTerms)은 미장 히어로도 똑같이 쓴다. 한쪽만 고쳐져 두 화면의
   강조 규칙이 갈리지 않도록 ./parts 로 옮겼다 — 규칙과 함정은 그쪽 주석에. */




/**
 * '급등 종목' 카드에 세우는 타일 수. **3열 격자라 3의 배수여야** 마지막 줄이 찬다(급부상 카드와 같은 판).
 *
 * ⚠️ 숫자를 여기 두지 않는다. lib/kadera-why 의 2차 시세 조회가 **이 장수만큼**을 채우므로,
 *    두 값이 갈리면 화면 끝자리가 다시 '등락 준비 중' 으로 뜬다. 바꿀 땐 그쪽 한 곳만 고친다.
 */
const WHY_TILES = BOARD_TILES;

/**
 * 테마 리포트로 가는 길을 낼 것인가. 안 연 화면(app/screen-flags.ts THEME_PUBLIC)으로 링크를 내면 배포에서 404 라
 * 여는 날까지는 감춘다 — 로컬(배포 아님)에서는 만드는 중에 봐야 하니 켠다. 푸터 바로가기와 같은 규칙.
 * 테마 로테이션 줄·유입/이탈 두 칸·급등 종목/종목 리포트의 테마 칩·오늘의 브리핑 문장 속 테마 이름이 이 값을 본다(2026-09-22).
 */
const THEME_LINKS = THEME_PUBLIC || !process.env.VERCEL_ENV;

/** 오늘의 브리핑 문장 속 테마 이름 → 테마 리포트 주소(highlightTerms 의 linkTerms). 사전의 26개 이름 그대로다. */
const THEME_LINK_MAP = new Map(THEME_NAMES.map((t) => [t, themeHref(t)]));

/** 종목 이름 → 속한 테마들(사전 순서). 급등 종목·종목 리포트 타일의 테마 칩이 쓴다. 한 종목이 여러 테마에 들 수 있다. */
const THEMES_OF_NAME = new Map<string, string[]>();
for (const [theme, names] of Object.entries(THEMES)) {
  for (const n of names) THEMES_OF_NAME.set(n, [...(THEMES_OF_NAME.get(n) ?? []), theme]);
}

/**
 * 화제 글 패널(오늘 · 7일 · 30일). 이 한 장만 Suspense 로 떼어 놨다 — 조회 셋(기간마다 36건)이 화면의 나머지보다
 * 느려, 기다리면 화면 전체가 그만큼 늦게 뜬다. 기간 탭 셋은 서버가 미리 다 그려 넘긴다.
 */
async function FeedPanel() {
  const [today, week, month] = await Promise.all([
    getTrendingMessages("today", 36),
    getTrendingMessages(7, 36),
    getTrendingMessages(30, 36),
  ]);
  assertLoaded("/kadera trending");
  return (
    <PanelTabs
      className="v2-a-feed"
      name="feed"
      title="화제 글"
      tabs={[
        { key: "today", label: "오늘", node: <FeedRows items={today} label="오늘" /> },
        { key: "w1", label: "7일", node: <FeedRows items={week} label="최근 7일" /> },
        { key: "m1", label: "30일", node: <FeedRows items={month} label="최근 30일" /> },
      ]}
    />
  );
}

/** 화제 글이 오기 전 자리. 판 높이는 격자가 쥐므로 여기선 머리와 줄 몇 개만 흉내 낸다. */
function FeedSkeleton() {
  return (
    <section className="v2-panel v2-a-feed" aria-hidden>
      <header className="v2-p-head">
        <Skeleton style={{ height: 18, width: 72, borderRadius: 6 }} />
      </header>
      <div className="v2-p-body" style={{ padding: "12px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} style={{ height: 58, borderRadius: 8 }} />
        ))}
      </div>
    </section>
  );
}

export default async function KaderaPage() {
  // 종목 리포트는 "어느 종목인지"를 먼저 알아야 해서 getTopStocksWithTrend 에 매여 있다.
  // 그렇다고 이걸 await 한 **뒤에** 나머지를 시작하면, 나머지와 아무 상관 없는 그 왕복이
  // 페이지 앞에 통째로 붙는다(실측 240ms, 콜드 1,976ms). 독립적인 조회들은 지금 바로
  // 띄우고, 종목 리포트만 이 프로미스에 이어 붙인다 — 둘이 나란히 간다.
  // 4종목인 이유: 시트 안 2×2 격자라 넷이어야 줄이 찬다. 파이프라인은 상위 6종목까지
  // 흐름 요약을 만들므로(NARRATIVE_TOP_N) 넷째 칸에도 문단이 붙는다.
  const topStocksPromise = getTopStocksWithTrend(6);
  const reportsPromise = topStocksPromise.then((tops) =>
    Promise.all(tops.map((s) => getStockReport(s.code))),
  );
  const [
    summary,
    surging,
    channels,
    rising,
    rawThemes,
    reports,
    rawSentiment,
    keywords,
    rawNarratives,
    rawSurgeLines,
    rawWhy,
    rawEvents,
  ] =
    await Promise.all([
      getTelegramSummary(),
      // 3×2 셀 격자라 여섯이어야 줄이 찬다(예전 카드 배치에선 다섯이었다).
      getSurgingStocks(6),
      getChannelRanking(),
      getRisingChannels(10),
      getThemeRotation(10),
      reportsPromise,
      getEcosystemSentiment(),
      getIssueKeywords(10),
      getStockNarratives(),
      getSurgingOneliners(),
      getMoveReasons(),
      getUpcomingEvents(35, 400),
    ]);
  const stockReports = reports.filter((r): r is NonNullable<typeof r> => r !== null);

  /* ── 조회 실패를 "자료 없음" 과 가른다 ───────────────────────────────────
     세 로더는 실패하면 `LOAD_FAILED` 를 돌려준다(lib/load-state.ts). 여기서 **한 번만**
     갈라 두면 아래 렌더 1,000여 줄은 예전 타입 그대로 쓰고, 빈 상태를 그리는 자리에서만
     문구를 바꿔 끼우면 된다.

     ⭐ 폴백 값은 예전과 같다(`[]` · `null` · `{}`). 달라지는 건 **화면이 그 빈 값을 뭐라고
     설명하느냐**뿐이다 — "아직 없습니다" 는 사실이 아닐 수 있고, 실패했을 때 그렇게 적으면
     화면이 거짓말을 한다(2026-08-06 "언급 1,002회 · 0개 채널"). */
  // 실패한 조회가 있으면 던진다 — 사본(ISR)에 실패한 화면을 담지 않는다(lib/load-state.ts).
  // 아래의 "실패와 부재를 갈라 문구를 바꾸는" 길은 그래서 실제로는 안 탄다. 던지지 않기로
  // 되돌릴 때 그대로 살아나게 남겨 둔다.
  assertLoaded("/kadera", {
    themes: rawThemes, sentiment: rawSentiment, narratives: rawNarratives,
    surgeLines: rawSurgeLines, why: rawWhy, events: rawEvents,
  });
  const themesFailed = isLoadFailed(rawThemes);
  const themes = themesFailed ? [] : rawThemes;
  const sentimentFailed = isLoadFailed(rawSentiment);
  const sentiment = sentimentFailed ? null : rawSentiment;
  /* ⚠️ 흐름 요약은 **문구를 안 붙인다.** 이 문단은 종목 카드 4장 안에 각각 들어가서, 한 줄을
     넣으면 같은 문장이 네 번 뜬다. 게다가 문단이 빠져도 카드가 거짓을 말하지는 않는다 —
     "요약이 없다"고 적는 자리가 아니라 그냥 없는 것이다. 실패는 #394 의 로그로만 잡는다. */
  const narratives = isLoadFailed(rawNarratives) ? {} : rawNarratives;
  // 급부상 카드의 한 줄. 없는 종목은 그 줄만 빠진다(주요 종목 리포트와 같은 규칙).
  const surgeLines = isLoadFailed(rawSurgeLines) ? {} : rawSurgeLines;
  /* '급등 종목'·'다가오는 일정'도 같은 규칙 — 실패와 부재를 갈라 빈 자리의 문구를 바꾼다. */
  const whyFailed = isLoadFailed(rawWhy);
  const why = whyFailed ? null : rawWhy;
  const eventsFailed = isLoadFailed(rawEvents);
  const events = eventsFailed ? [] : rawEvents;
  // 달력의 '오늘'은 집계 기준일이 아니라 벽시계(KST)다 — 사람이 사는 날짜여야 "내일"이 맞다.
  const kaderaToday = todayKst();

  /* 요약 글에서 굵게 집을 낱말. **오늘 화면이 이미 뽑아 둔 것**만 쓴다(highlightTerms
     주석 참고). 여기 없는 종목은 요약에 나와도 굵어지지 않는다 — 회자되는 것과
     지나가는 이름을 가르는 것이 이 목록의 일이다.
     긴 것부터 대야 "삼성전자"가 "삼성"에 먼저 걸리지 않는다. */

  const summaryTerms = termsFor(
    surging.map((x) => x.name),
    stockReports.map((x) => x.name),
    themes.slice(0, 4).map((x) => x.theme),
    keywords.slice(0, 5).map((x) => x.word),
  );

  /* 히어로의 현황 타일(모니터링 채널·총 구독자·활성 채널·총 메시지)은 전부 걷었다(2026-09-27).
     그 자리는 센티먼트 추이가 다 쓴다 — 오른쪽 칸이 통째로 여론 이야기라 왼쪽 제목과 한 덩어리로 읽힌다.
     - 메시지 수는 이미 히어로에 있다(센티먼트 캡션의 "최근 N일 · N건 분석").
     - 채널 수는 채널 파워 랭킹 머리로 옮겼다가 거기서도 뺐다(2026-09-28). 화면에 채널 수가 없다.
     - 총 구독자는 채널마다 구독자를 더한 값이라 여러 채널을 구독한 한 사람이 여러 번 세어졌다. */

  // ── 테마 로테이션 ──────────────────────────────────────────────────
  // 표는 **점유율 순위 그대로**(themes 가 이미 그 순서다) 순위 번호를 달아 나열한다 —
  // 옆 이슈 키워드와 같은 골격이라 두 시트를 나란히 훑을 수 있다.
  // 막대는 **점유율**이다(변화폭이 아니다). 변화폭으로 그리면 1위 반도체(28%)가 +1.1%p
  // 라는 이유로 작은 막대가 되어, 순위표인데 순위가 그림에서 사라진다. 변화폭은 오른쪽
  // 값 칸이 부호·색으로 말한다(이슈 키워드의 ▲/▼ 횟수와 같은 자리).
  const delta = (t: ThemeRotation) => (t.shareDelta === null ? 0 : t.shareDelta);
  // 맨 위 수치 띠의 '테마 유입 1위'. 표 순서와는 무관하므로 따로 고른다.
  const moved = themes.filter((t) => t.shareDelta !== null);
  const topIn = moved.length ? moved.reduce((a, b) => (delta(b) > delta(a) ? b : a)) : null;

  /* ── 히어로 헤드라인 ────────────────────────────────────────────────
     토스의 어법(큰 두 줄 제목 + 짧은 본문)을 빌렸다. 첫 줄은 고정이고 둘째 줄은
     센티먼트 구간(lib/format.ts 의 sentimentTone)이 정한다 — 같은 구간에서 옆 타일의
     라벨('낙관 우세')과 큰 숫자가 나오므로 셋이 한 사실을 말한다. 낱말 하나만 잉크색으로
     짚는다. 잉크 토큰(--c-hot-ink)이지 원색(--c-hot)이 아니다 — 회색 타일 위에서도
     4.5 를 넘기는 값은 잉크 쪽이다(Pill 주석의 실측). */
  const toneInk = sentiment?.tone === "hot" ? "var(--c-hot-ink)" : sentiment?.tone === "cold" ? "var(--c-cold-ink)" : C.ink;
  /* ── 종목 보드(가운데 판)의 재료 ───────────────────────────────────────
     급부상 · 급등 이유 · 많이 언급, 세 목록을 **종목 하나의 사실 묶음**으로 합친다(StockBoard 머리말).
     한 종목이 여러 목록에 오르면 상세 패널이 그 사실을 다 모은다. 시세는 실시간을 먼저 쓴다 —
     급부상·주요 종목은 야후 실시간(못 받으면 KRX 저장 종가), 급등 이유는 그날 종가라 맨 뒤다. */
  const board: Record<string, BoardStock> = {};
  const boardBase = (code: string, name: string, market: string | null): BoardStock =>
    (board[code] ??= {
      code,
      name,
      market,
      price: null,
      change: null,
      priceNote: null,
      series: [],
      dates: [],
      hot: 0,
      themes: (THEMES_OF_NAME.get(name) ?? []).slice(0, 3).map((t) => ({ name: t, href: THEME_LINKS ? themeHref(t) : null })),
    });
  for (const s of surging) {
    const b = boardBase(s.code, s.name, s.market);
    b.price = s.closePrice;
    // 야후 실시간이 아니면 등락률 대신 기준일을 단다 — 저장 종가면 등락률도 그날 것이라 방향까지 뒤집혀 보인다(QuoteDate 주석).
    b.change = s.isLive ? s.changeRate : null;
    b.priceNote = s.isLive ? null : s.priceDate ? `${fmtKoDate(s.priceDate)} 종가` : "종가 기준";
    b.series = s.series;
    b.dates = s.seriesDates;
    b.hot = s.recentDays;
    b.surge = { ratio: s.ratio, isNew: s.isNew, mentions: s.recentMentions, days: s.recentDays, channels: s.channelCount, line: surgeLines[s.code] ?? null };
  }
  for (const r of stockReports) {
    const b = boardBase(r.code, r.name, r.market);
    if (b.price === null && r.price != null) {
      b.price = r.price;
      b.change = r.changeRate;
    }
    if (!b.series.length) {
      b.series = r.series.map((d) => d.mentions);
      b.dates = r.series.map((d) => d.date);
      b.hot = r.series.filter((d) => d.scored).length;
    }
    b.talk = { mentions: r.totalMentions, days: KADERA_WINDOW_DAYS, channels: r.channelCount, narrative: narratives[r.code] ?? null };
  }
  const moveRows = (why?.rows ?? []).slice(0, WHY_TILES);
  for (const r of moveRows) {
    const b = boardBase(r.code, r.name, r.market);
    if (b.price === null && r.closePrice != null) {
      b.price = r.closePrice;
      // 그날 종가다. 등락률은 패널의 '등락' 칸이 따로 적으니 시세 옆엔 기준일만 단다.
      b.priceNote = `${fmtKoDate(r.date)} 종가`;
    }
    b.move = { reason: r.reason, change: r.changeRate, date: r.date, channels: r.channelCount };
  }
  const surgeDays = surging[0]?.recentDays ?? KADERA_WINDOW_DAYS;
  const boardTabs: BoardTab[] = [
    {
      key: "surge",
      label: "급부상",
      note: `최근 ${surgeDays}일 vs 평소`,
      heads: ["평소 대비", "7일 언급", `최근 ${surgeDays}일`],
      codes: surging.map((s) => s.code),
      empty: "아직 급부상 신호가 뚜렷한 종목이 없습니다. 데이터가 쌓일수록 또렷해집니다.",
    },
    {
      key: "move",
      label: "급등 이유",
      note: why ? `${fmtKoDate(why.date)} 기준` : "그날 기준",
      heads: ["등락률", "커뮤니티가 말한 이유"],
      codes: moveRows.map((r) => r.code),
      empty: whyFailed ? "이유를 불러오지 못했습니다." : "오늘 집계가 끝나면 채워집니다. 저녁 실행 뒤에 그날 것이 붙습니다.",
    },
    {
      key: "talk",
      label: "많이 언급",
      note: `최근 ${KADERA_WINDOW_DAYS}일`,
      heads: [`최근 ${KADERA_WINDOW_DAYS}일`, "7일 언급", "채널"],
      codes: stockReports.map((r) => r.code),
      empty: "아직 리포트를 만들 종목이 없습니다.",
    },
  ];

  /* ── 지표 띠(맨 위) ────────────────────────────────────────────────────
     예전 히어로의 큰 두 줄 제목과 '오늘 눈에 띄는 것' 칩 셋을 한 줄의 수치 칸으로 바꿨다(토스증권 지수 띠 ·
     Blockworks 'Market Overview' 의 자리). 칸마다 1위 하나만 — 집계값이라 날마다 사실이다. 없는 칸은 빠진다. */
  const topMove = moveRows[0];
  const kpis = [
    sentiment && {
      cap: "여론 낙관도",
      val: `${sentiment.score}%`,
      ink: toneInk,
      sub: sentiment.label,
      href: "#mood",
    },
    surging[0] && { cap: "급부상 1위", val: surging[0].name, ink: C.ink, sub: `평소 대비 ${surging[0].ratio.toFixed(1)}배`, subInk: "var(--c-hot-ink)", href: "#surging" },
    topMove && {
      cap: "가장 많이 오른",
      val: topMove.name,
      ink: C.ink,
      sub: topMove.changeRate !== null ? `▲${Math.abs(topMove.changeRate).toFixed(2)}%` : fmtKoDate(topMove.date),
      subInk: "var(--c-hot-ink)",
      href: "#surging",
    },
    topIn && { cap: "테마 유입 1위", val: topIn.theme, ink: C.ink, sub: `점유율 ▲${Math.abs(delta(topIn)).toFixed(1)}%p`, subInk: "var(--c-hot-ink)", href: "#themes" },
    keywords[0] && { cap: "화제어 1위", val: keywords[0].word, ink: C.ink, sub: `${keywords[0].count.toLocaleString("ko-KR")}회`, href: "#keywords" },
  ].filter((x): x is NonNullable<typeof x> => Boolean(x)) as { cap: string; val: string; ink: string; sub: string; subInk?: string; href: string }[];

  const briefNode = (
    <div className="v2-brief">
      {(() => {
        const used = new Set<string>();
        return (sentiment?.summary ?? "오늘의 요약을 준비하고 있습니다.")
          .split(/\n{2,}/)
          .map((para, i) => <p key={i}>{highlightTerms(para, summaryTerms, used, { linkTerms: THEME_LINKS ? THEME_LINK_MAP : undefined })}</p>);
      })()}
    </div>
  );
  const moodNode = !sentiment ? (
    <p className="v2-empty">{sentimentFailed ? "감성 집계를 불러오지 못했습니다." : "아직 분석된 메시지가 없습니다."}</p>
  ) : (
    <div className="v2-mood">
      <div className="v2-mood-top">
        <strong className="v2-mood-big" style={{ color: toneInk }}>
          {sentiment.score}
          <span>%</span>
        </strong>
        <span className="v2-mood-label" style={{ color: toneInk }}>
          {sentiment.label}
        </span>
        <span className="v2-mood-note">중립 {sentiment.neutral}% 제외 · 증시 전체를 다룬 글만</span>
      </div>
      <div className="hz-tx-split">
        <span style={{ width: `${100 - sentiment.score}%`, background: "var(--c-blue-2)" }} />
        <span style={{ width: `${sentiment.score}%`, background: "var(--c-warm-2)" }} />
      </div>
      <ThemeVsUsualRows themes={sentiment.byTheme} />
      <SentimentTrendTile points={sentimentFailed ? null : sentiment.trend} />
    </div>
  );

  return (
    <div className="hz-tx v2-kd">
      <div className="v2-grid">
        {/* ── 수치 띠 ── */}
        <section className="v2-kpis v2-a-kpi" aria-label="오늘의 수치">
          {kpis.map((k) => (
            <a key={k.cap} href={k.href} className="v2-kpi" data-ga="kadera_spotlight_click" data-ga-target={k.href.slice(1)}>
              <span className="v2-kpi-cap">{k.cap}</span>
              <span className="v2-kpi-line">
                <span className="v2-kpi-val" style={{ color: k.ink }}>
                  {k.val}
                </span>
                <span className="v2-kpi-sub" style={k.subInk ? { color: k.subInk } : undefined}>
                  {k.sub}
                </span>
              </span>
            </a>
          ))}
        </section>

        {/* ── 종목 보드 ── 급부상 · 급등 이유 · 많이 언급(StockBoard 머리말). id 는 홈·수치 띠의 목적지다. */}
        <section className="v2-panel v2-a-board" id="surging">
          <span id="why" aria-hidden="true" />
          <StockBoard tabs={boardTabs} stocks={board} />
        </section>

        {/* ── 오늘의 요약 · 여론 ── */}
        <PanelTabs
          className="v2-a-brief"
          id="mood"
          name="brief"
          tabs={[
            {
              key: "brief",
              label: "오늘의 요약",
              meta: (
                <span className="v2-ai">
                  <AiMark size={13} />
                  {summary.lastUpdated ? formatKstUpdate(summary.lastUpdated) : "AI 요약"}
                </span>
              ),
              node: briefNode,
            },
            {
              key: "mood",
              label: "여론",
              meta: sentiment ? `최근 ${sentiment.windowDays}일 · ${sentiment.messageCount.toLocaleString("ko-KR")}건` : undefined,
              node: moodNode,
            },
          ]}
        />

        {/* ── 테마 · 화제어 ── */}
        <PanelTabs
          className="v2-a-lists"
          id="themes"
          name="themes"
          tabs={[
            {
              key: "themes",
              label: "테마",
              meta: THEME_LINKS ? (
                <Link href="/theme" className="v2-more">
                  전체 보기
                  <Icon name="chevron_right" />
                </Link>
              ) : (
                "최근 3일 vs 이전"
              ),
              node: <ThemeRows themes={themes} hrefOf={(t) => (THEME_LINKS ? themeHref(t) : null)} />,
            },
            { key: "kw", label: "화제어", meta: "최근 3일", node: <KeywordRows keywords={keywords} /> },
          ]}
        />

        {/* ── 화제 글 ── 이 한 장만 늦게 온다(FeedPanel 머리말). */}
        <Suspense fallback={<FeedSkeleton />}>
          <FeedPanel />
        </Suspense>

        {/* ── 일정 · 채널 ── */}
        <PanelTabs
          className="v2-a-side"
          id="events"
          name="side"
          tabs={[
            {
              key: "events",
              label: "일정",
              meta: "앞으로 5주",
              node: eventsFailed ? <p className="v2-empty">일정을 불러오지 못했습니다.</p> : <EventRows events={events} today={kaderaToday} />,
            },
            {
              key: "ch",
              label: "채널 순위",
              meta: (
                <a
                  href={CHANNEL_FORM}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="v2-more"
                  data-ga="cta_click"
                  data-ga-cta="register_channel"
                  data-ga-surface="power_rank"
                >
                  채널 등록 신청
                </a>
              ),
              node: <ChannelRows channels={channels} />,
            },
            { key: "rise", label: "뜨는 채널", meta: "최근 7일", node: <RisingRows rising={rising} /> },
          ]}
        />
      </div>
    </div>
  );
}
