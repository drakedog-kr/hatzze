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
import type { ThemeRotation, TrendingMessage } from "@/lib/telegram-data";

import { formatKstUpdate } from "@/lib/format";
import { assertLoaded, isLoadFailed } from "@/lib/load-state";

import { KADERA_CARD } from "../og-copy";
import { pageMetadata } from "../seo";
import { AiMark, C, Icon, MONO } from "../ui";
import { ExpandableList } from "./ExpandableList";
import { Avatar, DeltaPp, RankBadge, RankDelta, SentimentTrendTile, Sparkline, ThemeVsUsualRows, highlightTerms, termsFor } from "./parts";
import { fmtKoDate } from "@/lib/stock-page";
import { THEME_NAMES, themeHref } from "@/lib/theme-href";
import { THEMES } from "@/lib/stock-themes";
import { THEME_PUBLIC } from "../screen-flags";
import { BOARD_TILES, getMoveReasons, getUpcomingEvents, todayKst } from "@/lib/kadera-why";
import { EventsCalendar } from "./EventsCalendar";
import { CHANNEL_FORM } from "../brand";
import { SectionHead } from "./SectionHead";
import { StockBoard } from "./StockBoard";
import type { BoardStock, BoardTab } from "./StockBoard";
import { TrendingTabs } from "./TrendingTabs";
import TimeAgo from "./TimeAgo";
import { timeAgoInitial } from "./time-ago";

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

function compact(n: number): string {
  if (n >= 10000) return `${Math.round(n / 1000)}K`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return `${n}`;
}

/* 요약 글의 굵힘(highlightTerms)은 미장 히어로도 똑같이 쓴다. 한쪽만 고쳐져 두 화면의
   강조 규칙이 갈리지 않도록 ./parts 로 옮겼다 — 규칙과 함정은 그쪽 주석에. */

/** 한 줄 말줄임 — 채널명·종목명처럼 셀을 밀어낼 수 있는 이름에 붙인다. */
const clip: React.CSSProperties = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };



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

/* 채널 표 두 벌(파워 랭킹·뜨는 채널)의 격자는 여기 없다 — globals.css 의 .hz-cols-ch /
   .hz-cols-rise 다. 폰에서 열을 접어야 하는데 인라인 style 은 미디어쿼리를 이겨서,
   여기 두면 @media 가 아무 일도 못 한다. 이유는 그 클래스 주석에 적어 뒀다. */

/* 테마 로테이션 줄의 세로 치수(THEME_NAME_H·THEME_BAR_TOP·THEME_SPARK_TOP …)가 여기
   있었다. '쌓인 줄'이던 시절 스파크라인 밑선을 막대 밑선에 맞추려고 손으로 계산하던
   값인데, 미장과 같은 **표**로 바꾸면서 격자(globals.css 의 .hz-cols-theme)가 그 일을
   맡았다 — 두 표의 줄은 이제 px 이 아니라 구조로 맞는다. 화제어 격자(KEYWORD_COLS)도
   같은 이유로 .hz-cols-kw 로 옮겨 갔다. */

/** 시트 안 '2분할 하이라이트'(테마 로테이션·이슈 키워드의 머리 아래 두 칸). */
/* 하이라이트 칸(카드 위 요약 두 칸)은 미장 카드도 쓴다 → ./parts */

/**
 * 트렌딩 메시지 목록(말풍선 카드). 기간 탭이 세 벌을 미리 렌더해 넘기므로 목록
 * 마크업만 여기로 뽑아 재사용한다 — 조회는 서버에 그대로 남는다.
 *
 * 표가 아니라 말풍선인 이유: 원본이 텔레그램 메시지라 그 매체의 형태를 유지하면
 * "이건 우리가 센 수치가 아니라 누가 한 말"이라는 것이 형태만으로 읽힌다.
 */
function TrendingList({ items }: { items: TrendingMessage[] }) {
  const nodes = items.map((m, i) => {
    const tags = [...m.stocks, ...m.topics.map((t) => `#${t}`)];
    return (
      // hz-lift — 호버에 살짝 떠오르고(translateY −2) 테두리가 파랗게 든다. 패널이라
      // 이미 테두리가 있어 색만 바뀌면 되고, 트레이 여백 14 안에서 움직여 시트를 안 넘는다.
      // 레포가 이미 쓰던 클래스라 다른 카드와 감이 같다.
      <li key={`${m.channelHandle}-${m.messageId}`} className="hz-lift hz-msg-card">
        {/* 원문 메시지로 이동 — 텔레그램 공개 채널은 t.me/핸들/메시지ID 로 열린다 */}
        <a
          href={`https://t.me/${m.channelHandle}/${m.messageId}`}
          target="_blank"
          rel="noopener noreferrer"
          data-ga="kadera_message_click"
          data-ga-channel={m.channelHandle}
          className="hz-msg"
        >
          <Avatar photoUrl={m.channelPhotoUrl} title={m.channelTitle} size={34} />
          <div className="hz-msg-body">
            {/* 줄바꿈을 막는다(nowrap). wrap 이면 채널명이 긴 카드에서만 순번(#4)이 아랫줄로
                떨어져 옆 카드와 머리 높이가 어긋났다(2026-09-04 실측). 줄어드는 건 채널명뿐이고
                (minWidth 0 + 말줄임), 시각·순번은 안 줄어든다. */}
            <div style={{ display: "flex", alignItems: "baseline", gap: 7, minWidth: 0 }}>
              <span style={{ ...clip, fontSize: "var(--fs-12-5)", fontWeight: 800, letterSpacing: "-.01em", color: "var(--c-cold-ink)", maxWidth: 220, minWidth: 0 }}>
                {m.channelTitle}
              </span>
              <span style={{ fontSize: "var(--fs-11)", fontFamily: MONO, color: C.sub2, flexShrink: 0 }}><TimeAgo iso={m.postedAt} initial={timeAgoInitial(m.postedAt)} /></span>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: "var(--fs-11)", fontFamily: MONO, fontWeight: 800, color: C.sub, flexShrink: 0 }}>#{i + 1}</span>
            </div>

            <div className="hz-bubble">
              {/* overflowWrap:anywhere 가 없으면 원문에 섞인 긴 URL 이 줄바꿈을 못 해
                  말풍선 밖으로 잘려 나간다(실제로 뉴스 링크가 통째로 잘려 있었다). */}
              <p
                style={{
                  margin: 0,
                  fontSize: "var(--fs-13)",
                  lineHeight: 1.7,
                  color: "var(--c-ink-soft)",
                  overflowWrap: "anywhere",
                  textWrap: "pretty",
                  display: "-webkit-box",
                  WebkitLineClamp: 4,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {m.text}
              </p>
              {tags.length > 0 && (
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {tags.map((t) => (
                    // 말풍선 바탕(--c-soft) 위라 칩은 흰 판으로 띄운다 — 회색 칩을 쓰면
                    // 배경과 한 톤이라 태그가 말풍선에 녹아 안 보인다.
                    <span
                      key={t}
                      style={{
                        fontSize: "var(--fs-11)",
                        fontWeight: 700,
                        color: C.label,
                        /* 이번 리디자인(2026-09): 말풍선이 카드색이 됐으니 칩은 회색 칩으로 갈린다. */
                        background: C.chip,
                        borderRadius: 999,
                        padding: "3px 8px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 14, paddingTop: 2, fontSize: "var(--fs-11)", fontFamily: MONO, fontWeight: 700, color: C.sub }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <Icon name="visibility" style={{ fontSize: "var(--fs-14)", color: C.muted }} />
                  {compact(m.views)}
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <Icon name="shortcut" style={{ fontSize: "var(--fs-14)", color: C.muted }} />
                  {compact(m.forwards)}
                </span>
                {m.replies > 0 && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <Icon name="chat_bubble" style={{ fontSize: "var(--fs-12)", color: C.muted }} />
                    {m.replies}
                  </span>
                )}
                {/* 카드 전체가 텔레그램 원문으로 나가는 링크인데 그 표시가 없었다(토스 Predictable
                    hint). 오른쪽 끝에 작게 — 새 탭으로 나간다는 화살표는 MDD 링크와 같은 것. */}
                <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 2, color: C.sub2, fontWeight: 600 }}>
                  원문
                  <Icon name="arrow_outward" style={{ fontSize: "var(--fs-13)" }} />
                </span>
              </div>
            </div>
          </div>
        </a>
      </li>
    );
  });

  return (
    <ExpandableList
      items={nodes}
      name="trending_messages"
      initial={6}
      step={10}
      listClassName="hz-panelgrid hz-panelgrid-auto"
      footerClassName="hz-sheet-foot-row"
    />
  );
}

/**
 * 트렌딩 메시지 — **이 시트 한 장만 나머지와 떼어 놓는다.**
 *
 * 페이지의 열두 갈래는 원래 `Promise.all` 하나로 묶여 있어서, 제일 늦는 갈래 하나가
 * 판 전체를 붙잡았다. 그 제일 늦는 갈래가 여기다 — 세 창(오늘·7일·30일)이 각각
 * `telegram_messages` 를 `views` 순으로 정렬해 상위 200건을 받는데, **그 열엔 인덱스가
 * 없어서**(migration_026 이 붙이는 것이 그것이다) 창이 넓을수록 표를 통째로 훑는다.
 * 2026-08-06 실측으로 이 한 쿼리가 같은 창·같은 200행인데 정렬 키만 인덱스 있는 것으로
 * 바꾸면 중앙값 244ms → 112ms 였고, 무엇보다 **최대치가 6,750ms → 129ms** 였다.
 * 꼬리가 길어서 평균이 아니라 최악이 화면을 정한다.
 *
 * 인덱스가 붙으면 이 갈래도 빨라지지만, 떼어 놓는 것은 그것과 별개로 남길 값이 있다 —
 * 갈래 하나가 느려질 때 **그 시트 한 장만 늦게 차고 나머지는 제때 뜬다.** 열두 갈래를
 * 한 덩어리로 묶어 두면 앞으로 어느 하나가 느려져도 매번 판 전체가 멈춘다.
 *
 * 왜 하필 여기만인가: 히어로의 굵은 낱말(summaryTerms)이 급부상·종목 리포트·테마·이슈
 * 키워드 넷을 한꺼번에 봐야 정해진다. 그 넷을 떼면 **맨 위가 제일 늦게 차는** 이상한
 * 순서가 된다. 트렌딩만 그 얽힘이 없다.
 */
async function TrendingSection() {
  // 기간 탭이 즉시 전환되도록 세 창을 한 번에 받아둔다(병렬이라 지연은 한 번 분).
  // 6건만 보여주고 '더 보기'로 10건씩 늘리므로, 세 번 펼칠 만큼(36) 미리 받아둔다.
  const [trendingToday, trending, trendingMonth] = await Promise.all([
    getTrendingMessages("today", 36),
    getTrendingMessages(7, 36),
    getTrendingMessages(30, 36),
  ]);
  // 이 구간은 Suspense 로 따로 흐르므로 페이지 본문의 assertLoaded 가 못 본다. 여기서 따로.
  assertLoaded("/kadera trending");
  return (
    <section className="hz-sheet">
      {/* 머리(SectionHead)는 TrendingTabs 안에서 그린다 — 기간 탭이 머리 우측에
          들어가고 목록은 그 아래라, 둘을 한 컴포넌트가 감싸야 상태를 공유한다. */}
      <TrendingTabs
        level={3}
        icon="campaign"
        title="트렌딩 메시지"
        desc="국장 관련 글 중 조회·공유로 가장 널리 퍼진 것"
        panels={[
          { key: "today", label: "오늘", count: trendingToday.length, node: <TrendingList items={trendingToday} /> },
          { key: "w1", label: "최근 7일", count: trending.length, node: <TrendingList items={trending} /> },
          { key: "m1", label: "최근 30일", count: trendingMonth.length, node: <TrendingList items={trendingMonth} /> },
        ]}
      />
    </section>
  );
}

/**
 * 위 시트가 차기 전의 자리표시자. 골격은 loading.tsx 의 시트와 같게 두되 **높이는
 * 실제 시트에 맞춘다**(머리 74 + 본문 745 + 바닥 39 = 858, 2026-08-06 실측).
 *
 * loading.tsx 는 이 칸을 300 으로 그려도 됐다 — 그 화면은 결과가 오면 통째로 교체되지
 * 시트별로 하나씩 차지 않기 때문이다. 여기는 반대로 **이 한 장만 나중에 찬다.**
 * 낮게 잡으면 트렌딩이 도착하는 순간 아래 채널 시트가 446px 밀린다.
 */
/* 실측으로 맞춘 값이다. 계산으로 745−40=705 를 넣었더니 시트가 846 이라 14px 짧았다 —
   자리표시자 머리(60)가 진짜 머리(74)보다 낮아서다. 그 차이를 본문에 얹었다. */
const TRENDING_SKELETON_BODY = 719;

function TrendingSkeleton() {
  const block = (h: number, w: number | string = "100%", r = 8) => (
    <Skeleton style={{ height: h, width: w, borderRadius: r }} />
  );
  return (
    <section className="hz-sheet" aria-hidden>
      <div className="hz-sheet-head hz-sheet-head-bold">
        {block(40, 40, 12)}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 5 }}>
          {block(13, 116, 5)}
          {block(11, 196, 5)}
        </div>
      </div>
      <div style={{ padding: "4px 26px 24px" }}>{block(TRENDING_SKELETON_BODY)}</div>
      <div style={{ height: 39 }} />
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
  /* 이슈 키워드 막대의 분모 — 화면에 세운 낱말들의 합. 표에 있는 값만으로 내므로
     새 조회가 없고, 막대와 숫자가 같은 재료에서 나와 어긋날 수 없다. */
  const keywordTotal = keywords.reduce((a, k) => a + k.count, 0);

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

  /**
   * 테마 한 줄. **미장 카더라와 같은 표 조판이다**(2026-08-12에 통일했다).
   *
   * 예전엔 세 층으로 쌓인 줄이었다(이름+변화폭 / 막대 / 점유율·종목·횟수 + 오른쪽
   * 스파크라인). 두 화면의 같은 카드가 서로 다른 얼개면 오갈 때 같은 것을 다시 읽어야
   * 한다 — 표 쪽이 옆 이슈 키워드와도 골격이 같아 시선이 한 번에 훑린다.
   *
   * 줄의 구성:  [이름 ……… ▲7.7%p]        점유율 · 14일 추이 · 순위 변화
   *             [██████░░░░░░░░░░]
   * 막대가 칸 폭을 꽉 채우므로 이름 줄의 오른끝이 곧 **막대의 오른쪽 위**다 —
   * 얼마나 찼는지와 얼마나 움직였는지가 한 덩어리로 읽힌다.
   */
  const themeRow = (t: ThemeRotation) => {
    const d = delta(t);
    const inner = (
      <>
        <RankBadge n={t.rank} />
        <span style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
          <span style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
            {/* 이름은 반드시 minWidth:0 + 말줄임이다. flex 로 두면 긴 테마명이 배지를 칸 밖으로 민다. */}
            <span style={{ ...clip, minWidth: 0, fontSize: "var(--fs-13-5)", fontWeight: 700, color: C.ink }}>{t.theme}</span>
            <span style={{ flex: 1 }} />
            <DeltaPp value={t.shareDelta} style={{ fontSize: "var(--fs-12)" }} />
          </span>
          {/* 막대는 **절대 점유율**이다. 길이가 점유율, 색이 변화 방향 — 눈금이 둘이지만
              바로 위 칸이 그 방향을 부호 붙은 숫자로 적고 있어 색은 되풀이일 뿐이다. */}
          <span className="hz-bar">
            <span
              style={{
                width: `${Math.min(100, t.sharePct)}%`,
                background: d > 0 ? "var(--c-warm-2)" : d < 0 ? "var(--c-blue-2)" : C.hint,
              }}
            />
          </span>
        </span>
        <span style={{ fontFamily: MONO, fontSize: "var(--fs-13)", fontWeight: 800, color: C.ink, textAlign: "right" }}>
          {t.sharePct.toFixed(1)}%
        </span>
        {/* ⚠️ Sparkline 을 그리드 자식으로 직접 넣지 말 것 — 뿌리에 인라인 display:flex 가
            있어 좁은 화면에서 이 칸을 접는 미디어쿼리를 이긴다. display 없는 span 으로 싼다. */}
        <span>
          <Sparkline data={t.series} width={78} height={24} />
        </span>
        {/* RankDelta 는 0 과 null 을 똑같이 '아무것도 안 그림'으로 낸다. 모든 줄이 같은 두
            창을 견주므로 빈칸이면 "자료가 없나?"로 읽힌다 — 변동 없음은 글자로 적는다. */}
        <span style={{ textAlign: "right" }}>
          {t.rankChange === null ? (
            <span style={{ fontFamily: MONO, fontSize: "var(--fs-11)", color: C.sub2 }}>—</span>
          ) : t.rankChange === 0 ? (
            <span style={{ fontSize: "var(--fs-11)", fontWeight: 700, color: C.sub2, whiteSpace: "nowrap" }}>그대로</span>
          ) : (
            <RankDelta change={t.rankChange} />
          )}
        </span>
      </>
    );
    /* 줄이 곧 **그 테마 리포트로 가는 링크**다(2026-09-22). 예전엔 올리면 종목 목록 팝오버가 열렸는데, 테마 리포트가
       그 목록과 요약·이유·일정을 다 갖고 있어 팝오버를 걷고 줄을 눌러 가게 했다. 테마 리포트가 안 열린 동안은 그냥 줄. */
    return THEME_LINKS ? (
      <Link key={t.theme} href={themeHref(t.theme)} className="hz-trow hz-cols-theme" style={{ flex: 1, textDecoration: "none" }} aria-label={`${t.theme} 테마 리포트 보기`}>
        {inner}
      </Link>
    ) : (
      <div key={t.theme} className="hz-trow hz-cols-theme" style={{ flex: 1 }}>
        {inner}
      </div>
    );
  };

  // ── 채널 파워 랭킹 행 ──────────────────────────────────────────────
  const channelItems = channels.map((c, i) => (
    <li key={c.handle}>
      <a
        href={`https://t.me/${c.handle}`}
        target="_blank"
        rel="noopener noreferrer"
        className="hz-trow hz-cols-ch"
        style={{ textDecoration: "none" }}
        data-ga="kadera_channel_click"
        data-ga-channel={c.handle}
        data-ga-surface="power_rank"
        data-ga-rank={i + 1}
      >
        <span style={{ fontFamily: MONO, fontSize: "var(--fs-11)", fontWeight: 800, color: C.sub2 }}>{i + 1}</span>
        <span style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
          <Avatar photoUrl={c.photoUrl} title={c.title} size={26} />
          <span style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
            <span style={{ ...clip, fontSize: "var(--fs-12)", fontWeight: 700, color: C.ink }}>{c.title}</span>
            <span style={{ ...clip, fontSize: "var(--fs-11)", fontFamily: MONO, color: C.sub2 }}>
              구독자 {c.subscriberCount ? compact(c.subscriberCount) : "-"}
              {/* 폰에서 접히는 조회율·순위 변동을 여기로 되살린다(.hz-ch-meta 는 기본 숨김).
                  값을 버리지 않으려는 것이다 — 폰에서 열을 접는 건 자리가 없어서지
                  그 숫자가 덜 중요해서가 아니다. 순위 변동은 색을 유지한다: 오르내림을
                  ▲▼ 모양 하나로만 두면 잿빛 캡션 안에서 눈에 안 걸린다. */}
              <span className="hz-ch-meta">
                {c.viewRate != null ? ` · 조회 ${c.viewRate.toFixed(1)}%` : ""}
                {c.rankChange ? (
                  <span style={{ color: c.rankChange > 0 ? "var(--c-hot-ink)" : "var(--c-cold-ink)", fontWeight: 700 }}>
                    {` · ${c.rankChange > 0 ? "▲" : "▼"}${Math.abs(c.rankChange)}`}
                  </span>
                ) : null}
              </span>
            </span>
          </span>
        </span>
        <span style={{ fontFamily: MONO, fontSize: "var(--fs-11)", fontWeight: 700, color: C.label, textAlign: "right" }}>
          {c.viewRate != null ? `${c.viewRate.toFixed(1)}%` : "—"}
        </span>
        <span style={{ fontFamily: MONO, fontSize: "var(--fs-11)", fontWeight: 700, textAlign: "right", color: c.rankChange ? (c.rankChange > 0 ? "var(--c-hot-ink)" : "var(--c-cold-ink)") : C.sub2 }}>
          {c.rankChange ? `${c.rankChange > 0 ? "▲" : "▼"}${Math.abs(c.rankChange)}` : "—"}
        </span>
        <span style={{ fontFamily: MONO, fontSize: "var(--fs-13)", fontWeight: 800, color: C.ink, textAlign: "right" }}>
          {c.influenceScore.toFixed(0)}
        </span>
      </a>
    </li>
  ));

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

  return (
    <div className="hz-tx v2-kd">
      <div className="v2-grid">
        {/* ── 지표 띠 ── */}
        <section className="v2-kpis v2-a-kpi" aria-label="오늘의 지표">
          {kpis.map((k) => (
            <a key={k.cap} href={k.href} className="v2-kpi" data-ga="kadera_spotlight_click" data-ga-target={k.href.slice(1)}>
              <span className="v2-kpi-cap">{k.cap}</span>
              <span className="v2-kpi-val" style={{ color: k.ink }}>
                {k.val}
              </span>
              <span className="v2-kpi-sub" style={k.subInk ? { color: k.subInk } : undefined}>
                {k.sub}
              </span>
            </a>
          ))}
          {summary.lastUpdated && (
            <span className="v2-kpi v2-kpi-time">
              <span className="v2-kpi-cap">최종 업데이트</span>
              <span className="v2-kpi-sub">{formatKstUpdate(summary.lastUpdated)}</span>
            </span>
          )}
        </section>

        {/* ── 오늘의 요약(AI) ── 문단은 빈 줄에서 가른다. 굵힌 낱말은 세 문단에 걸쳐 한 번씩만(highlightTerms 주석). */}
        <section className="hz-sheet v2-a-brief">
          <SectionHead
            level={2}
            icon="auto_awesome"
            title={
              <>
                <AiMark size={15} style={{ marginRight: 6, verticalAlign: "-2px" }} />
                오늘의 요약
              </>
            }
          />
          <div className="v2-brief">
            {(() => {
              const used = new Set<string>();
              return (sentiment?.summary ?? "오늘의 요약을 준비하고 있습니다.")
                .split(/\n{2,}/)
                .map((para, i) => <p key={i}>{highlightTerms(para, summaryTerms, used, { linkTerms: THEME_LINKS ? THEME_LINK_MAP : undefined })}</p>);
            })()}
          </div>
        </section>

        {/* ── 여론 ── 낙관도·테마별 기울기·30일 추이. 예전 히어로 오른쪽 칸을 그대로 옮겼다. */}
        <section className="hz-sheet v2-a-mood" id="mood">
          <SectionHead
            level={2}
            icon="query_stats"
            title="여론"
            note={sentiment ? `최근 ${sentiment.windowDays}일 · ${sentiment.messageCount.toLocaleString("ko-KR")}건` : undefined}
          />
          <div className="v2-mood">
            {!sentiment ? (
              <p style={{ margin: 0, color: C.sub, fontSize: "var(--fs-13)" }}>
                {sentimentFailed ? "감성 집계를 불러오지 못했습니다." : "아직 분석된 메시지가 없습니다."}
              </p>
            ) : (
              <>
                <div className="v2-mood-top">
                  <strong className="v2-mood-big" style={{ color: toneInk }}>
                    {sentiment.score}
                    <span>%</span>
                  </strong>
                  <span className="v2-mood-label" style={{ color: toneInk }}>
                    {sentiment.label}
                  </span>
                  <span className="v2-mood-note">
                    중립 {sentiment.neutral}% 제외 · 증시 전체를 다룬 글만
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div className="hz-tx-split">
                    <span style={{ width: `${100 - sentiment.score}%`, background: "var(--c-blue-2)" }} />
                    <span style={{ width: `${sentiment.score}%`, background: "var(--c-warm-2)" }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700 }}>
                    <span style={{ color: "var(--c-cold-ink)" }}>비관 {100 - sentiment.score}</span>
                    <span style={{ color: "var(--c-hot-ink)" }}>낙관 {sentiment.score}</span>
                  </div>
                </div>
                <ThemeVsUsualRows themes={sentiment.byTheme} />
              </>
            )}
            <SentimentTrendTile points={sentimentFailed ? null : (sentiment?.trend ?? [])} />
          </div>
        </section>

        {/* ── 종목 보드 ── 급부상 · 급등 이유 · 많이 언급(StockBoard 머리말). id 는 홈·지표 띠의 목적지다. */}
        <section className="hz-sheet v2-a-board" id="surging">
          <span id="why" aria-hidden="true" />
          <StockBoard tabs={boardTabs} stocks={board} />
        </section>

      {/* ── 테마 로테이션 · 이슈 키워드 (50:50) ──────────────────────── */}
        <section className="hz-sheet v2-a-themes" id="themes">
          {/* 머리 오른쪽은 '테마 리포트 →'(이 카드가 그 화면의 축약본이다). 기간 알약 '3일 vs 이전'은 제목 옆 물음표로 옮겼다(2026-09-22).
              테마 리포트가 안 열린 동안은 알약이 그대로 선다. */}
          <SectionHead level={3}
            icon="donut_small"
            title={
              <>
                테마 로테이션
                <span className="hz-tip hz-tip-wide hz-kd-title-help" data-tip="최근 3일과 그 전 비교" data-ga-tip="테마 로테이션" style={{ cursor: "help", marginLeft: 5, verticalAlign: "middle" }} aria-label="테마 로테이션 셈법">
                  <Icon name="help" style={{ fontSize: "var(--fs-13)", color: C.muted }} />
                </span>
              </>
            }
            note={THEME_LINKS ? undefined : "3일 vs 이전"}
            desc="관심이 어느 테마로 옮겨가는지 · 점유율 변화 기준"
            right={
              THEME_LINKS ? (
                /* 기간 알약과 같은 자리·같은 꼴의 알약(2026-09-22). 눌리는 것이라 올리면 하늘색(.hz-theme-headpill). 화살표는 › 다 — 사이트 안 이동(2026-09-23). */
                <Link href="/theme" className="hz-sheet-head-note hz-theme-headpill">
                  테마 자세히 보기
                  <Icon name="chevron_right" style={{ fontSize: "var(--fs-13)" }} />
                </Link>
              ) : undefined
            }
          />
          {themes.length === 0 ? (
            <p style={{ margin: 0, padding: "20px 22px", color: C.sub, fontSize: "var(--fs-13)" }}>
              {themesFailed ? "테마를 불러오지 못했습니다." : "아직 집계된 테마가 없습니다."}
            </p>
          ) : (
            <>
              {/* v2: '가장 많이 유입·이탈' 두 칸을 걷었다. 유입 1위는 맨 위 수치 띠가 말하고, 이탈은 표의 ▼ 가 말한다. */}
              <div className="hz-thead hz-cols-theme">
                <span>#</span>
                <span>테마</span>
                <span style={{ textAlign: "right" }}>점유율</span>
                <span>최근 14일</span>
                <span style={{ textAlign: "right" }}>순위 변화</span>
              </div>
              {/* 행을 상자로 감싸 남는 높이를 **행들이 나눠 갖게** 한다. 옆 이슈 키워드와
                  머리·하이라이트·열머리 높이가 같으므로 행 높이도 자동으로 같아진다 —
                  손으로 px 을 맞추면 한쪽 글이 바뀔 때마다 어긋난다. */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                {themes.map((t) => themeRow(t))}
              </div>
            </>
          )}
        </section>

        <section className="hz-sheet v2-a-kw" id="keywords">
          <SectionHead level={3} icon="tag" title="이슈 키워드" note="최근 3일" desc="종목명이 아닌 화제어 · 언급 횟수 기준" />
          {keywords.length === 0 ? (
            <p style={{ margin: 0, padding: "20px 22px", color: C.sub, fontSize: "var(--fs-13)" }}>아직 뽑을 화제어가 없습니다.</p>
          ) : (
            <>
              {/* v2: '화제어 1위·가장 큰 변동' 두 칸을 걷었다. 1위는 맨 위 수치 띠가, 변동은 표의 언급량 칸이 말한다. */}
              <div className="hz-thead hz-cols-kw">
                <span>#</span>
                <span>키워드</span>
                <span>언급량</span>
                <span style={{ textAlign: "right" }}>점유율</span>
                <span style={{ textAlign: "right" }}>횟수</span>
              </div>
              {/* ⚠️ **1위부터** 센다(예전엔 2위부터였다). 옆 테마 로테이션과 줄을 맞추려면
                  두 표의 **행 수가 같아야** 하는데, 테마는 하이라이트가 행을 안 먹고
                  화제어는 1위를 먹기 때문이다. 테마 카드도 1위를 하이라이트에 다시 보여주고
                  있으니 되풀이 자체는 이미 이 페이지의 규칙이다.
                  행마다 flex:1 — 남는 높이를 행이 나눠 가지면 두 표의 줄이 저절로 맞는다. */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                {keywords.map((k) => (
                  <div
                    key={k.word}
                    className="hz-trow hz-cols-kw hz-tip hz-tip-wide hz-tip-end"
                    data-tip={`최근 3일 ${k.count.toLocaleString("ko-KR")}회 언급${
                      k.shareDelta === null
                        ? ""
                        : ` · 최근 3일 관심 점유율이 그 이전보다 ${Math.abs(k.shareDelta * 100).toFixed(1)}%p ${k.shareDelta > 0 ? "늘었습니다" : "줄었습니다"}`
                    }`}
                    style={{ flex: 1 }}
                  >
                    <RankBadge n={k.rank} />
                    <span style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
                      <span style={{ ...clip, minWidth: 0, fontSize: "var(--fs-13)", fontWeight: 700, color: C.ink }}>{k.word}</span>
                      <span style={{ flex: 1 }} />
                      {/* 옆 테마 표는 %p 를 이름 줄 오른끝(막대 바로 위)에 둔다. 이 표는
                          이름과 막대가 다른 칸이라 그 자리가 없어 **이름 칸의 오른끝**에
                          붙인다 — 두 표의 이름 칸이 같은 x 에서 끝나므로 두 %p 가 한
                          세로선 위에 선다. shareDelta 는 몫이라 ×100 해서 넘긴다. */}
                      <DeltaPp
                        value={k.shareDelta === null ? null : k.shareDelta * 100}
                        style={{ fontSize: "var(--fs-12)" }}
                      />
                    </span>
                    {/* 막대는 **이 열 낱말 안에서 차지하는 몫**이다. 색은 관심 점유율의 방향.
                        ⚠️ 1위 대비로 그리면 1위가 늘 꽉 차서 "얼마나 앞서나"가 사라진다.
                        그렇다고 전체 화제어 대비로 그리면 화제어가 수백 개라 1위도 7.7%,
                        5위는 1.7%밖에 안 돼 막대가 통째로 안 보인다(실측). 테마는 열한 개뿐이라
                        전체 대비가 통하지만 여기는 눈금이 다르다 — 옆 표를 그대로 못 베낀다. */}
                    <span className="hz-bar">
                      <span
                        style={{
                          width: `${(k.count / Math.max(1, keywordTotal)) * 100}%`,
                          background:
                            k.trend === "up" ? "var(--c-warm-2)" : k.trend === "down" ? "var(--c-blue-3)" : C.hint,
                        }}
                      />
                    </span>
                    {/* 막대가 그린 값을 숫자로 한 번 더. 옆 테마 표가 점유율 칸을 두는 것과
                        같은 자리다 — 두 표를 나란히 훑을 때 같은 칸이 같은 뜻이어야 한다. */}
                    <span
                      style={{
                        fontFamily: MONO,
                        fontSize: "var(--fs-12)",
                        fontWeight: 800,
                        color: C.ink,
                        textAlign: "right",
                      }}
                    >
                      {((k.count / Math.max(1, keywordTotal)) * 100).toFixed(1)}%
                    </span>
                    {/* 화살표는 안 붙인다 — 방향은 왼쪽 %p 와 막대 색이 이미 두 번 말한다.
                        이 칸은 **얼마나 많이**만 말한다. */}
                    <span
                      style={{
                        fontFamily: MONO,
                        fontSize: "var(--fs-12)",
                        fontWeight: 800,
                        textAlign: "right",
                        whiteSpace: "nowrap",
                        color: C.ink,
                      }}
                    >
                      {k.count.toLocaleString("ko-KR")}
                      <span style={{ fontSize: "var(--fs-11)", fontWeight: 700, color: C.sub2, marginLeft: 1 }}>회</span>
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

      {/* ── 트렌딩 메시지 ────────────────────────────────────────────── */}
      {/* 이 한 장만 Suspense 로 떼어 놨다. 이유는 TrendingSection 주석에. */}
      <div className="v2-a-feed">
        <Suspense fallback={<TrendingSkeleton />}>
          <TrendingSection />
        </Suspense>
      </div>

      {/* ── 다가오는 일정: 달력(1/3) + 고른 날의 일정(2/3) ──────────────
          채널 글에서 뽑은 앞날의 일정. "앞으로 뭐 있어"에 답하는 자리다. 달력에는 **날짜가
          적혀 있던 것만** 올린다 — 달·분기·연 단위는 놓을 칸이 없고, 모델이 "연말"을 12-31
          로 굳혀 쓴 값이라 그 자리에 두면 거짓이 된다(lib/kadera-why.ts getUpcomingEvents).
          ⭐ 네 번째 얼개다(표 → 아젠다 → 이것). 아젠다는 날짜별 머리 아래 줄이 길게 서서
             오른쪽이 비었다. 달력은 어느 날에 얼마나 몰렸는지가 한눈에 들어오고, 누르면
             그날 것만 옆에 선다(EventsCalendar 머리말). 같은 (종목, 날짜)를 여러 채널이
             말하면 한 줄로 묶고 채널 수를 센다. */}
      <section className="hz-sheet v2-a-events" id="events">
        <SectionHead level={3}
          icon="calendar_month"
          title="다가오는 일정"
          note="앞으로 5주"
          desc="커뮤니티에서 날짜를 짚어 말한 일정"
        />
        {eventsFailed ? (
          <p style={{ margin: 0, padding: "20px 22px", color: C.sub, fontSize: "var(--fs-13)" }}>일정을 불러오지 못했습니다.</p>
        ) : events.length === 0 ? (
          <p style={{ margin: 0, padding: "20px 22px", color: C.sub, fontSize: "var(--fs-13)" }}>
            앞으로 5주 안에 날짜가 짚인 일정이 아직 없습니다. 커뮤니티 글이 쌓이면 채워집니다.
          </p>
        ) : (
          <>
            <EventsCalendar
              today={kaderaToday}
              events={events.map((e) => ({ code: e.code, name: e.name, market: e.market, date: e.date, event: e.event, channels: e.channels }))}
            />
          </>
        )}
      </section>

      {/* ── 채널 파워 랭킹 · 뜨는 채널 (50:50) ───────────────────────── */}
        <section className="hz-sheet v2-a-ch">
          <SectionHead
            level={3}
            icon="military_tech"
            title="채널 파워 랭킹"
            /* 히어로에서 옮겨 왔던 채널 수 꼬리(" · 모니터링 채널 302곳")는 뺐다(2026-09-28). */
            desc="조회율·확산력까지 반영한 채널 영향력"
            /* 채널 등록 신청을 머리 도구에서 여기로 내렸다(2026-09-22) — 채널을 세는 카드가 신청을 받는 자리이기도 하다.
               알약 꼴은 테마 로테이션 머리의 '테마 자세히 보기'와 같다(.hz-sheet-head-note hz-theme-headpill). */
            right={
              <a
                href={CHANNEL_FORM}
                target="_blank"
                rel="noopener noreferrer"
                className="hz-sheet-head-note hz-theme-headpill"
                data-ga="cta_click"
                data-ga-cta="register_channel"
                data-ga-surface="power_rank"
              >
                <Icon name="add_circle" style={{ fontSize: "var(--fs-13)" }} />
                채널 등록 신청
              </a>
            }
          />
          {channels.length === 0 ? (
            <p style={{ margin: 0, padding: "20px 22px", color: C.sub, fontSize: "var(--fs-13)" }}>아직 채널 점수가 없습니다.</p>
          ) : (
            <>
              <div className="hz-thead hz-cols-ch">
                <span>#</span>
                <span>채널</span>
                <span style={{ textAlign: "right" }}>조회율</span>
                {/* 며칠을 견주는지는 lib/telegram-data.ts 의 RANK_COMPARE_DAYS 와 맞춰야 한다. */}
                <span style={{ textAlign: "right" }}>순위 변동</span>
                <span
                  className="hz-tip hz-tip-wide hz-tip-end"
                  data-tip="조회·전달·규모 합산"
                  data-ga-tip="influence_score"
                  style={{ display: "inline-flex", alignItems: "center", justifyContent: "flex-end", gap: 3, cursor: "help" }}
                >
                  영향력
                  {/* ⚠️ hint 는 점선·비활성 아이콘용이다(라이트 1.49·다크 2.3). 툴팁이
                      있다는 유일한 표시라 보여야 한다 — SectionHead 와 같은 muted. */}
                  <Icon name="help" style={{ fontSize: "var(--fs-12)", color: C.muted }} />
                </span>
              </div>
              <ExpandableList
                items={channelItems}
                name="channel_rank"
                initial={10}
                step={10}
                listStyle={{ display: "block" }}
                footerClassName="hz-sheet-foot-row"
              />
              {/* 남는 높이를 먹던 빈 칸은 뺐다. 이 시트가 옆 시트 키에 맞춰 늘어나면
                  그 여백이 '더 보기' 띠 아래에 깔려 호버 배경이 시트 바닥에 못 닿았다
                  — 이제 띠 자신이 margin-top:auto 로 바닥에 붙는다(.hz-sheet-foot-row).
                  둘을 같이 두면 auto 마진이 둘이라 여백을 반씩 나눠 갖는다. */}
            </>
          )}
        </section>

        <section className="hz-sheet v2-a-rise">
          {/* 기간 표기는 옆 시트와 "최근 7일"로 맞춘다. 구독자 스냅샷은 백필이 안 돼
              하루씩 쌓이므로 실제로 잰 구간이 그보다 짧은 날이 있다(getRisingChannels 의
              spanDays). 시트에 그 사정까지 적진 않는다. */}
          <SectionHead level={3} icon="rocket_launch" title="뜨는 채널" note="최근 7일" desc="최근 구독자가 많이 늘어난 채널" />
          {(() => {
            const real = rising.filter((r) => !r.isPlaceholder);
            const topDelta = Math.max(1, ...real.map((r) => Math.abs(r.delta7d)));
            if (real.length === 0) {
              return <p style={{ margin: 0, padding: "20px 22px", color: C.sub, fontSize: "var(--fs-13)" }}>아직 구독자 변화를 잴 만큼 스냅샷이 쌓이지 않았습니다.</p>;
            }
            return (
              <>
                <div className="hz-thead hz-cols-rise">
                  <span>#</span>
                  <span>채널</span>
                  {/* 셋째 칸은 막대(1위 대비 상대 길이), 넷째 칸은 그 증감의 실수치다.
                      넷째를 '구독자'로 적어 두면 아래 ▲1,234 가 구독자 수로 읽힌다 —
                      구독자 총수는 채널명 아랫줄에 이미 있다. */}
                  <span>증가폭</span>
                  <span style={{ textAlign: "right" }}>7일 증감</span>
                </div>
                {real.map((r, i) => {
                  const row = (
                    <>
                      <span style={{ fontFamily: MONO, fontSize: "var(--fs-11)", fontWeight: 800, color: C.sub2 }}>{i + 1}</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                        <Avatar photoUrl={r.photoUrl} title={r.title} size={26} />
                        <span style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
                          <span style={{ ...clip, fontSize: "var(--fs-12)", fontWeight: 700, color: C.ink }}>{r.title}</span>
                          <span style={{ ...clip, fontSize: "var(--fs-11)", fontFamily: MONO, color: C.sub2 }}>구독자 {compact(r.subscriberCount)}</span>
                        </span>
                      </span>
                      <span style={{ height: 7, borderRadius: 999, background: C.track, overflow: "hidden" }}>
                        <span
                          style={{
                            display: "block",
                            width: `${Math.max(2, (Math.abs(r.delta7d) / topDelta) * 100)}%`,
                            height: "100%",
                            borderRadius: "0 3px 3px 0", // 데이터 끝만 둥글게(shadcn 막대 꼴 · 표 안 막대 .hz-bar 와 같다, 2026-09-27)
                            background: r.delta7d >= 0 ? "var(--c-warm-2)" : "var(--c-blue-3)",
                          }}
                        />
                      </span>
                      {/* 정원을 채우느라 증감이 없거나 줄어든 채널까지 들어올 수 있어 부호를 그대로 쓴다 */}
                      <span
                        style={{
                          fontFamily: MONO,
                          fontSize: "var(--fs-11)",
                          fontWeight: 800,
                          textAlign: "right",
                          whiteSpace: "nowrap",
                          color: r.delta7d > 0 ? "var(--c-hot-ink)" : r.delta7d < 0 ? "var(--c-cold-ink)" : C.sub,
                        }}
                      >
                        {r.delta7d > 0 ? "▲" : r.delta7d < 0 ? "▼" : ""}
                        {Math.abs(r.delta7d).toLocaleString("ko-KR")}
                        {/* 단위를 붙인다 — 이 칸의 1,866 은 구독자 **수**이고, 바로 옆
                            채널명 아랫줄엔 총 구독자가 또 있어 둘이 헷갈리기 쉽다. */}
                        <span style={{ fontWeight: 700, color: C.sub2, marginLeft: 1 }}>명</span>
                      </span>
                    </>
                  );
                  return r.handle ? (
                    <a
                      key={`${r.handle}-${i}`}
                      href={`https://t.me/${r.handle}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hz-trow hz-cols-rise"
                      style={{ textDecoration: "none" }}
                      data-ga="kadera_channel_click"
                      data-ga-channel={r.handle}
                      data-ga-surface="rising"
                    >
                      {row}
                    </a>
                  ) : (
                    <div key={`${r.title}-${i}`} className="hz-trow hz-cols-rise">
                      {row}
                    </div>
                  );
                })}
                {/* 폰에서는 막대 열을 접으므로(.hz-cols-rise) 이 각주도 같이 접는다 —
                    화면에 없는 것을 설명하는 문장만 남으면 안 된다. */}
                <div className="hz-sheet-foot hz-rise-barnote" style={{ marginTop: "auto" }}>
                  <span style={{ fontSize: "var(--fs-12)", color: C.sub }}>
                    막대는 1위({real[0] ? Math.abs(real[0].delta7d).toLocaleString("ko-KR") : "-"}명) 기준 상대 증가폭입니다
                  </span>
                </div>
              </>
            );
          })()}
        </section>
      </div>
    </div>
  );
}
