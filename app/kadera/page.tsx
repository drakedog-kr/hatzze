import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import {
  getChannelRanking,
  getEcosystemSentiment,
  getIssueKeywords,
  getRisingChannels,
  getStockNarratives,
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

import { KADERA_CARD } from "../og-copy";
import { pageMetadata } from "../seo";
import { AiMark, C, Icon, MONO, R } from "../ui";
import { ExpandableList } from "./ExpandableList";
import { Avatar, ChangeRate, DayBars, DeltaPp, Highlight, Pill, QuoteDate, RankBadge, RankDelta, SectionCaps, Sparkline, highlightTerms, termsFor } from "./parts";
import { StockLogo } from "../StockLogo";
import { SectionHead } from "./SectionHead";
import { TrendingTabs } from "./TrendingTabs";

// 미리보기 이미지는 옆의 opengraph-image.tsx 가 그린다(ownImage). 자세한 건 app/seo.ts 주석 참고.
export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata({
    title: "카더라 리포트 | hatzze",
    description: "주식 텔레그램 채널 수백 개를 대신 읽습니다. 오늘 가장 많이 언급된 종목과 가장 많이 퍼진 메시지를 매일 집계합니다.",
    path: "/kadera",
    ownImage: KADERA_CARD.alt,
  });
}

export const dynamic = "force-dynamic";

function compact(n: number): string {
  if (n >= 10000) return `${Math.round(n / 1000)}K`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return `${n}`;
}

/* 요약 글의 굵힘(highlightTerms)은 미장 히어로도 똑같이 쓴다. 한쪽만 고쳐져 두 화면의
   강조 규칙이 갈리지 않도록 ./parts 로 옮겼다 — 규칙과 함정은 그쪽 주석에. */

function formatKR(n: number): string {
  if (n >= 1e8) return `${(n / 1e8).toFixed(1).replace(/\.0$/, "")}억`;
  if (n >= 1e4) return `${(n / 1e4).toFixed(1).replace(/\.0$/, "")}만`;
  return n.toLocaleString("ko-KR");
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 60) return `${Math.max(1, min)}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  return `${Math.floor(hr / 24)}일 전`;
}

/** 그 종목의 MDD 정밀분석 주소. 이름은 MDD 페이지가 code 로 찾으므로 URL 엔 code·market
   만 실어 깔끔하게 둔다(코스닥은 market 으로 .KQ 심볼이 된다). */
function mddHref(code: string, market: string | null): string {
  return `/mdd?code=${code}${market ? `&market=${market}` : ""}`;
}

/** 셀 → 그 종목의 MDD 정밀분석으로 잇는 작은 링크. */
function MddLink({ code, market, label = "MDD 정밀분석" }: { code: string; market: string | null; label?: string }) {
  return (
    <Link href={mddHref(code, market)} className="hz-mdd-link">
      {label}
      <Icon name="arrow_outward" style={{ fontSize: 13 }} />
    </Link>
  );
}

/** 한 줄 말줄임 — 채널명·종목명처럼 셀을 밀어낼 수 있는 이름에 붙인다. */
const clip: React.CSSProperties = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };

/**
 * 시트 두 장이 한 줄에 나란히 설 최소 폭.
 *
 * 320 이었는데, 그 값이면 창 1100(컨테이너 834)에서도 둘이 나란히 서서 시트 하나가
 * 409px 밖에 안 된다. 그 안에 5열을 넣으면 채널명 칸이 70~93px 로 눌려 최악 67% 가
 * 잘렸다(실측). 460 이면 둘이 서려면 컨테이너 936(창 ~1214) 이 필요해서, 그 아래에서는
 * 한 장씩 세로로 서고 시트가 컨테이너 폭을 통째로 쓴다.
 *
 * 데스크톱은 그대로다 — 창 1440 은 컨테이너 1164 라 936 을 넉넉히 넘긴다.
 */
/* ⚠️ min() 로 감싼다. 그냥 460 을 주면 **컨테이너가 그보다 좁을 때 시트가 안 줄어들어**
   부모를 넘치고, 위쪽 overflow:hidden 에 잘린다 — 360px 폰에서 이슈 키워드 시트가
   318px 칸 안에서 460px 로 버티며 오른쪽이 통째로 잘려 나갔다(#294 가 만든 회귀).
   min(460px, 100%) 면 넓을 땐 460 이 짝 기준으로 살아 있고, 좁을 땐 칸에 맞춰 접힌다. */
const SHEET_PAIR_MIN = "min(460px, 100%)";
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
      <li key={`${m.channelHandle}-${m.messageId}`} className="hz-lift" style={{ display: "flex", padding: "16px 18px", gap: 12, minWidth: 0 }}>
        {/* 원문 메시지로 이동 — 텔레그램 공개 채널은 t.me/핸들/메시지ID 로 열린다 */}
        <a
          href={`https://t.me/${m.channelHandle}/${m.messageId}`}
          target="_blank"
          rel="noopener noreferrer"
          data-ga="kadera_message_click"
          data-ga-channel={m.channelHandle}
          style={{ display: "flex", gap: 12, minWidth: 0, width: "100%", textDecoration: "none" }}
        >
          <Avatar photoUrl={m.channelPhotoUrl} title={m.channelTitle} size={34} />
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 7 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 7, flexWrap: "wrap", minWidth: 0 }}>
              <span style={{ ...clip, fontSize: 12.5, fontWeight: 800, letterSpacing: "-.01em", color: "var(--c-cold-ink)", maxWidth: 220 }}>
                {m.channelTitle}
              </span>
              <span style={{ fontSize: 11, fontFamily: MONO, color: C.sub2 }}>{timeAgo(m.postedAt)}</span>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 11, fontFamily: MONO, fontWeight: 800, color: C.sub }}>#{i + 1}</span>
            </div>

            <div className="hz-bubble">
              {/* overflowWrap:anywhere 가 없으면 원문에 섞인 긴 URL 이 줄바꿈을 못 해
                  말풍선 밖으로 잘려 나간다(실제로 뉴스 링크가 통째로 잘려 있었다). */}
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
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
                        fontSize: 11,
                        fontWeight: 700,
                        color: C.label,
                        background: C.card,
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
              <div style={{ display: "flex", alignItems: "center", gap: 14, paddingTop: 2, fontSize: 11, fontFamily: MONO, fontWeight: 700, color: C.sub }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <Icon name="visibility" style={{ fontSize: 14, color: C.faint }} />
                  {compact(m.views)}
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <Icon name="shortcut" style={{ fontSize: 14, color: C.faint }} />
                  {compact(m.forwards)}
                </span>
                {m.replies > 0 && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <Icon name="chat_bubble" style={{ fontSize: 12, color: C.faint }} />
                    {m.replies}
                  </span>
                )}
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
  return (
    <section className="hz-sheet">
      {/* 머리(SectionHead)는 TrendingTabs 안에서 그린다 — 기간 탭이 머리 우측에
          들어가고 목록은 그 아래라, 둘을 한 컴포넌트가 감싸야 상태를 공유한다. */}
      <TrendingTabs
        icon="campaign"
        title="트렌딩 메시지"
        desc="조회·공유로 가장 널리 퍼진 메시지"
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
    <div className="hz-shimmer" style={{ height: h, width: w, borderRadius: r, background: C.bg }} />
  );
  return (
    <section className="hz-sheet" aria-hidden>
      <div className="hz-sheet-head">
        {block(18, 18, 5)}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 5 }}>
          {block(13, 116, 5)}
          {block(11, 196, 5)}
        </div>
      </div>
      <div style={{ padding: "20px 22px" }}>{block(TRENDING_SKELETON_BODY)}</div>
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
  const topStocksPromise = getTopStocksWithTrend(4);
  const reportsPromise = topStocksPromise.then((tops) =>
    Promise.all(tops.map((s) => getStockReport(s.code))),
  );
  const [
    summary,
    surging,
    channels,
    rising,
    themes,
    reports,
    sentiment,
    keywords,
    narratives,
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
    ]);
  const stockReports = reports.filter((r): r is NonNullable<typeof r> => r !== null);

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

  /* 채널을 세는 세 줄은 전부 **지금 수집 중인 채널**을 센다(getTelegramSummary 주석).
     목록에 있어도 peer 캐시가 없어 한 건도 안 걷히는 채널은 모니터링하고 있는 것이
     아니다. 화면에 덧붙이는 표시는 없다 — 숫자 자체가 사실이면 설명할 것이 없다. */
  const miniStats: { label: string; note?: string; value: string; unit: string; help?: string }[] = [
    { label: "모니터링 채널", value: `${summary.channelCount}`, unit: "개" },
    { label: "총 구독자", value: formatKR(summary.totalSubscribers).replace(/[만억]$/, ""), unit: formatKR(summary.totalSubscribers).slice(-1) },
    { label: "활성 채널", note: "7일", value: `${summary.activeChannels}`, unit: "개", help: "최근 7일 안에 메시지를 올린 채널입니다." },
    { label: "총 메시지", note: "7일", value: summary.messages7d.toLocaleString("ko-KR"), unit: "개" },
  ];

  // ── 테마 로테이션 ──────────────────────────────────────────────────
  // 표는 **점유율 순위 그대로**(themes 가 이미 그 순서다) 순위 번호를 달아 나열한다 —
  // 옆 이슈 키워드와 같은 골격이라 두 시트를 나란히 훑을 수 있다.
  // 막대는 **점유율**이다(변화폭이 아니다). 변화폭으로 그리면 1위 반도체(28%)가 +1.1%p
  // 라는 이유로 작은 막대가 되어, 순위표인데 순위가 그림에서 사라진다. 변화폭은 오른쪽
  // 값 칸이 부호·색으로 말한다(이슈 키워드의 ▲/▼ 횟수와 같은 자리).
  const delta = (t: ThemeRotation) => (t.shareDelta === null ? 0 : t.shareDelta);
  // 위 하이라이트 두 칸에 쓸 최대·최소. 표 순서와는 무관하므로 따로 고른다.
  const moved = themes.filter((t) => t.shareDelta !== null);
  const topIn = moved.length ? moved.reduce((a, b) => (delta(b) > delta(a) ? b : a)) : null;
  const topOut = moved.length ? moved.reduce((a, b) => (delta(b) < delta(a) ? b : a)) : null;

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
  const themeRow = (t: ThemeRotation, i: number, total: number) => {
    const d = delta(t);
    return (
      <div
        key={t.theme}
        className="hz-trow hz-cols-theme hz-theme-host"
        style={{ flex: 1 }}
        /* 마우스가 없어도(키보드·터치) 종목 목록을 열 수 있게 초점을 받는다.
           언급된 종목이 없는 테마는 열 것도 없으니 초점도 주지 않는다. */
        tabIndex={t.stocks.length ? 0 : undefined}
        aria-label={t.stocks.length ? `${t.theme} 테마를 이룬 종목 ${t.stockCount}개 보기` : undefined}
      >
        <RankBadge n={t.rank} />
        <span style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
          <span style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
            {/* 이름은 반드시 minWidth:0 + 말줄임이다. flex 로 두면 긴 테마명이 배지를 칸 밖으로 민다. */}
            <span style={{ ...clip, minWidth: 0, fontSize: 13.5, fontWeight: 700, color: C.ink }}>{t.theme}</span>
            <span style={{ flex: 1 }} />
            <DeltaPp value={t.shareDelta} style={{ fontSize: 12 }} />
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
        <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.ink, textAlign: "right" }}>
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
            <span style={{ fontFamily: MONO, fontSize: 11, color: C.sub2 }}>—</span>
          ) : t.rankChange === 0 ? (
            <span style={{ fontSize: 11, fontWeight: 700, color: C.sub2, whiteSpace: "nowrap" }}>그대로</span>
          ) : (
            <RankDelta change={t.rankChange} />
          )}
        </span>

        {/* 이 테마의 점유율을 만든 종목 목록. 마우스를 올리거나 초점이 가면 열린다(CSS 만).
            아래쪽 줄은 위로 펼친다 — 아래로 열면 시트를 벗어나 다음 구간을 덮는다. */}
        {t.stocks.length > 0 && (
          <div className={`hz-theme-pop${i >= total - 4 ? " hz-theme-pop-up" : ""}`}>
            <div className="hz-theme-pop-head">
              최근 {KADERA_WINDOW_DAYS}일 언급 {t.stockCount}종목 · 총 {t.mentions.toLocaleString("ko-KR")}회 · 주목도순
            </div>
            {t.stocks.map((s) => (
              <Link key={s.code} href={mddHref(s.code, s.market)} className="hz-theme-pop-item">
                <span className="hz-theme-pop-name">{s.name}</span>
                <span className="hz-theme-pop-cnt">{s.mentions}회</span>
                <span className="hz-theme-pop-go">
                  <Icon name="arrow_outward" style={{ fontSize: 13 }} />
                </span>
              </Link>
            ))}
            <div className="hz-theme-pop-foot">종목을 누르면 MDD 정밀분석이 열립니다.</div>
          </div>
        )}
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
        <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.sub2 }}>{i + 1}</span>
        <span style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
          <Avatar photoUrl={c.photoUrl} title={c.title} size={26} />
          <span style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
            <span style={{ ...clip, fontSize: 12, fontWeight: 700, color: C.ink }}>{c.title}</span>
            <span style={{ ...clip, fontSize: 11, fontFamily: MONO, color: C.sub2 }}>
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
        <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: C.label, textAlign: "right" }}>
          {c.viewRate != null ? `${c.viewRate.toFixed(1)}%` : "—"}
        </span>
        <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, textAlign: "right", color: c.rankChange ? (c.rankChange > 0 ? "var(--c-hot-ink)" : "var(--c-cold-ink)") : C.sub2 }}>
          {c.rankChange ? `${c.rankChange > 0 ? "▲" : "▼"}${Math.abs(c.rankChange)}` : "—"}
        </span>
        <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.ink, textAlign: "right" }}>
          {c.influenceScore.toFixed(0)}
        </span>
      </a>
    </li>
  ));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* ── 히어로: 모니터링 25 · 센티먼트 25 · 오늘의 요약 50 ───────────── */}
      <section className="hz-sheet">
        <div className="hz-kd-hero">
          {/* ① 모니터링 현황 */}
          <div className="hz-kd-hero-q">
            <div className="hz-kd-hero-title">
              <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: "-.01em", color: C.ink }}>모니터링 현황</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {miniStats.map((s, i) => (
                <div
                  key={s.label}
                  style={{
                    display: "flex",
                    // baseline 이 아니라 center 다. 라벨(11.5px)과 값(19px)은 줄 상자
                    // 높이가 17.25 : 28.5 로 달라서, 밑선을 맞추면 짧은 라벨이 줄 가운데보다
                    // 아래로 처진다(실측 1.2~2.4px). 게다가 그 처짐이 값에 무슨 글자가
                    // 들었느냐에 따라 흔들려서("42,552개"는 쉼표가 밑선 아래로 내려가 1.2px,
                    // 나머지는 2.3px) 네 줄의 라벨 높이가 서로 어긋나 보였다.
                    // 값이 늘 가장 높은 요소라 center 로 바꿔도 값의 자리는 그대로다
                    // (줄 안쪽 높이 28.5 도 그대로) — 라벨만 제자리를 찾는다.
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    // 첫 줄만 위 여백을 뺀다 — 제목 슬롯 아래 gap 16 이 이미 그 자리를 잡고
                    // 있어서, 여기에 11 을 또 주면 317 만 옆 칸 66% 보다 내려앉는다.
                    padding: i === 0 ? "0 0 11px" : "11px 0",
                    borderBottom: i === miniStats.length - 1 ? "none" : "1px solid var(--c-sheet-row)",
                  }}
                >
                  {/* wordBreak:keep-all — 이 칸은 25% 폭이라 좁은 구간에서 230px 까지
                      내려간다. 기본 규칙이면 "활성 채널"이 토막나 읽히지 않는다. */}
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: C.sub, display: "inline-flex", alignItems: "baseline", gap: 4, minWidth: 0, wordBreak: "keep-all" }}>
                    {s.label}
                    {s.note && <span style={{ fontSize: 11, color: C.sub2 }}>{s.note}</span>}
                    {/* alignSelf:center — 이 줄은 라벨과 '7일'의 밑선을 맞추느라 baseline
                        정렬인데, 물음표까지 거기 딸려 가면 안 된다. 아이콘 글꼴은 글리프
                        밑변이 곧 밑선이라, 밑선에 맞추면 12px 상자가 글자보다 통째로
                        3.1px 떠오른다(실측). 글자와 눈높이를 맞추려면 상자를 줄 한가운데
                        세워야 한다 — 옆 칸 '제외 후 환산 ?' 이 쓰는 것과 같은 기준이다. */}
                    {s.help && (
                      <span className="hz-tip hz-tip-wide" data-tip={s.help} data-ga-tip={s.label} style={{ display: "inline-flex", alignSelf: "center", cursor: "help", flexShrink: 0 }}>
                        <Icon name="help" style={{ fontSize: 12, color: C.muted }} />
                      </span>
                    )}
                  </span>
                  {/* 숫자는 절대 안 쪼갠다 — "46,189" 와 "개" 가 두 줄로 갈리면 수치가
                      아니라 오류처럼 보인다. */}
                  <strong style={{ fontFamily: MONO, fontSize: 19, fontWeight: 800, color: C.ink, letterSpacing: "-.03em", whiteSpace: "nowrap", flexShrink: 0 }}>
                    {s.value}
                    {/* 단위는 숫자에서 떼어 놓는다. 부모의 letterSpacing −.03em 은 마지막
                        숫자와 이 글자 **사이**에도 걸려서, 아무것도 안 주면 "317개" 가
                        한 낱말처럼 붙어 버린다. 음수분을 되돌리는 값(≈0.6px)에 여백을
                        더해 3px. letterSpacing 을 normal 로 되돌리면 글자 **뒤**에도
                        붙어 오른끝 정렬이 어긋나므로 마진으로만 벌린다. */}
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.sub2, marginLeft: 3 }}>{s.unit}</span>
                  </strong>
                </div>
              ))}
            </div>
            {/* 통계 넷 바로 아래. marginTop:auto 로 칸 바닥에 붙인다 — 옆 '오늘의 요약'
                칸이 문단 길이만큼 늘어나면 이 칸도 같이 늘어나는데, 그때 남는 자리가
                통계 줄 사이가 아니라 버튼 위 한 곳에만 생긴다. */}
            <div style={{ marginTop: "auto", paddingTop: 14 }}>
              <a
                href="https://forms.gle/PRapNH9rz8YuF2zu9"
                target="_blank"
                rel="noopener noreferrer"
                className="hz-btn-soft"
                data-ga="cta_click"
                data-ga-cta="register_channel"
                data-ga-surface="channel_rank"
              >
                <Icon name="add_circle" style={{ fontSize: 15 }} />
                채널 등록 신청
              </a>
            </div>
          </div>

          {/* ② 생태계 센티먼트 */}
          <div className="hz-kd-hero-q">
            <div className="hz-kd-hero-title" style={{ justifyContent: "space-between", gap: 10 }}>
              <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: "-.01em", color: C.ink }}>생태계 센티먼트</span>
              {sentiment && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, color: C.label, whiteSpace: "nowrap" }}>
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: sentiment.tone === "hot" ? "var(--c-warm-2)" : sentiment.tone === "cold" ? "var(--c-blue-2)" : C.hint,
                    }}
                  />
                  {sentiment.label}
                </span>
              )}
            </div>
            {!sentiment ? (
              <p style={{ margin: 0, color: C.sub, fontSize: 13 }}>아직 분석된 메시지가 없습니다.</p>
            ) : (
              <>
                {/* 이 칸이 답하는 건 "지금 분위기 좋아, 나빠?" 하나다. 그래서 숫자도 한 벌만
                    쓴다 — 낙관도(중립 제외) 하나로 말하고, 아래 막대는 그 비율을 그림으로
                    반복한다(숫자와 그림이 어긋날 수가 없다). 중립을 얼마나 뺐는지만 옆에. */}
                {/* alignItems:flex-start — 66% 의 **글자 윗선**을 옆 칸 317 의 윗선에 맞추려면
                    이 줄이 세로 가운데 정렬이면 안 된다(오른쪽 두 줄 캡션 높이에 따라 숫자가
                    위아래로 떠다닌다). */}
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                  <strong
                    style={{
                      fontFamily: MONO,
                      fontSize: 40,
                      fontWeight: 800,
                      /* 옆 칸 '317' 의 **숫자 윗선**에 맞춘 값이다. 줄 상자 위끝끼리 맞추면
                         안 된다 — 40px 과 19px 은 줄 상자 안에서 글자가 앉는 깊이가 달라서,
                         상자를 맞추면 정작 눈에 보이는 숫자 윗선이 7px 어긋난다.
                         브라우저에서 두 캡 윗선을 재서 남은 차이를 이 값으로 걷었다
                         (globals.css 의 .hz-kd-hero-title 주석과 한 세트).
                         ↳ 4 → 1. 이 숫자의 **밑선**이 오른쪽 캡션 끝줄('중립 N% 제외 후
                         환산')보다 3.1px 아래에 있었다. 줄 상자가 아니라 baseline 을 재서
                         걷은 값이다 — 40px 과 11.5px 은 상자 안에서 글자가 앉는 깊이가
                         달라 상자 밑끝을 맞추면 눈에 보이는 밑선이 어긋난다.
                         덤으로 317 과의 윗선 차이도 2.1 → 0.9 로 줄었다. */
                      lineHeight: 1,
                      marginTop: 1,
                      letterSpacing: "-.04em",
                      color: sentiment.tone === "cold" ? C.cold : sentiment.tone === "hot" ? C.hot : C.ink,
                    }}
                  >
                    {sentiment.score}
                    <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-.02em" }}>%</span>
                  </strong>
                  {/* 두 줄 캡션은 숫자 윗선이 아니라 숫자 덩어리 가운데에 오게 살짝 내린다. */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0, marginTop: 2 }}>
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: C.sub }}>
                      최근 {KADERA_WINDOW_DAYS}일 · {sentiment.messageCount.toLocaleString("ko-KR")}건 분석
                    </span>
                    {/* 툴팁은 문장이 아니라 물음표에 건다. 글 전체가 hz-tip 이면 마우스를
                        올리기 전엔 설명이 있다는 것 자체가 안 보이고(cursor 가 바뀌어야만
                        안다), 옆 '활성 채널 ?' 과도 규칙이 달라진다. 이 칸의 다른 설명들과
                        같이 물음표를 세워 두고 그 위에서만 연다. */}
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: C.sub, display: "inline-flex", alignItems: "center", gap: 4, width: "fit-content" }}>
                      중립 {sentiment.neutral}% 제외 후 환산
                      <span
                        className="hz-tip hz-tip-wide"
                        data-tip="메시지를 비관/중립/낙관으로 나눈 뒤, 중립을 뺀 비관↔낙관 비율입니다. 시황·공시 같은 담담한 글이 절반이라, 같이 세면 늘 비관으로 기웁니다."
                        data-ga-tip="sentiment_ratio"
                        style={{ display: "inline-flex", cursor: "help", flexShrink: 0 }}
                      >
                        <Icon name="help" style={{ fontSize: 12, color: C.muted }} />
                      </span>
                    </span>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  <div style={{ display: "flex", height: 11, borderRadius: 3, overflow: "hidden" }}>
                    <span style={{ width: `${100 - sentiment.score}%`, background: "var(--c-blue-2)" }} />
                    <span style={{ width: `${sentiment.score}%`, background: "var(--c-warm-2)" }} />
                  </div>
                  {/* 두 라벨을 막대의 양 끝에 붙여 어느 쪽이 어느 색인지 위치로 읽히게 한다. */}
                  <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 11.5, fontWeight: 700 }}>
                    <span style={{ color: "var(--c-cold-ink)" }}>비관 {100 - sentiment.score}</span>
                    <span style={{ color: "var(--c-hot-ink)" }}>낙관 {sentiment.score}</span>
                  </div>
                </div>
                {/* marginTop:auto — 이 블록의 **밑선**을 옆 칸 '채널 등록 신청' 버튼의
                    밑선에 맞춘다. 두 칸은 같은 높이로 늘어나므로(flex), 둘 다 바닥에
                    붙이면 밑선이 정확히 같아진다. 남는 높이는 위 스플릿 막대와 이 블록
                    사이로 간다. */}
                {sentiment.byTheme.length > 0 && (
                  <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 9, paddingTop: 14, borderTop: "1px solid var(--c-sheet-row)" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", color: C.sub }}>인기 테마별 비관 ↔ 낙관</span>
                    {sentiment.byTheme.map((t) => (
                      <div
                        key={t.name}
                        className="hz-tip hz-tip-wide"
                        data-tip={`${t.name} 언급 ${t.total}건 중 비관 ${t.negative}건 · 낙관 ${t.positive}건 (중립 제외 비율)`}
                        style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}
                      >
                        {/* 이름 칸 폭을 고정한다 — flex 로 두면 테마명 길이에 따라 막대
                            시작점이 행마다 어긋나 눈이 세로로 훑질 못한다. */}
                        <span style={{ ...clip, width: 62, flexShrink: 0, fontSize: 11, fontWeight: 700, color: C.label }}>{t.name}</span>
                        <span style={{ flex: 1, minWidth: 0, display: "flex", height: 7, borderRadius: 999, overflow: "hidden" }}>
                          <span style={{ width: `${100 - t.pos}%`, background: "var(--c-blue-3)" }} />
                          <span style={{ width: `${t.pos}%`, background: "var(--c-warm-3)" }} />
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* ③ 오늘의 요약 */}
          <div className="hz-kd-hero-h">
            <div className="hz-kd-hero-title">
              {/* 시장 브리핑의 '오늘의 브리핑'과 같은 표식이다 — 옅은 하늘색 타일에 앉힌
                  ✨. 맨 아이콘으로 두면 누를 수 있는 것(= 생성형 AI 고지)으로 안 보인다.
                  타일이 22px 인 건 이 제목 슬롯이 22px 로 못박혀 있어서다(globals.css 의
                  .hz-kd-hero-title). 브리핑 쪽 26px 을 그대로 가져오면 슬롯을 넘겨,
                  세 칸의 주인공 숫자(317 · 66% · 문단)가 서로 다른 높이에 선다.
                  모서리도 26:9 비례를 지켜 7px. */}
              <span
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 7,
                  background: "var(--c-blue-tint)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <AiMark size={13} style={{ alignSelf: "center" }} />
              </span>
              <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: "-.01em", color: C.ink }}>오늘의 요약</span>
            </div>
            {/* 높이를 안 잡는다 — 글이 3줄이면 3줄, 4줄이면 4줄로 흐른다. 길이 자체는
                파이프라인이 잡는다(generate_telegram_narratives.py 의 BRIEF_*_LEN).
                여기서 다시 자르지 않는 이유는, 잘라 두면 그쪽이 망가졌을 때 화면이
                조용히 문장을 먹어 치우기 때문이다.

                파이프라인이 세 대목을 빈 줄로 이어 보낸다. 여기서 쪼개 문단을 만든다 —
                500자에 가까운 글을 한 덩어리로 두면 눈이 미끄러진다. 문단 사이는 10px 로,
                칸의 gap(16) 보다 좁게 잡았다. 같은 글 안의 문단 사이가 제목과 본문 사이보다
                벌어지면 세 문단이 별개의 블록으로 읽힌다.
                구분자가 없는 옛 데이터(한 덩어리)는 그대로 한 문단이 된다. */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {(() => {
                /* 굵힌 낱말을 **세 문단에 걸쳐** 기억한다. 문단마다 새로 세면 반도체가
                   2문단·3문단에서 각각 한 번씩 굵어져 화면에는 두 번으로 보인다. */
                const used = new Set<string>();
                return (sentiment?.summary ?? "오늘의 요약을 준비하고 있습니다.")
                  .split(/\n{2,}/)
                  .map((para, i) => (
                    <p key={i} style={{ margin: 0, fontSize: 14, lineHeight: 1.7, color: "var(--c-ink-soft)", textWrap: "pretty", wordBreak: "keep-all" }}>
                      {highlightTerms(para, summaryTerms, used)}
                    </p>
                  ));
              })()}
            </div>
            {/* 기준 시각은 **언제나 이 칸 맨 아래 왼쪽**이다 — 요약 글이 날마다 3줄·4줄로
                달라져도 자리가 안 흔들려야 "이 화면의 기준 시각"으로 읽힌다(시장 브리핑
                히어로가 쓰는 것과 같은 조판·같은 schedule 아이콘).
                formatKstUpdate 가 이미 "… 기준"으로 끝난다 — 또 붙이면 "기준 기준". */}
            {summary.lastUpdated && (
              <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: 7, paddingTop: 10 }}>
                <Icon name="schedule" style={{ fontSize: 14, color: C.muted }} />
                <span style={{ fontSize: 11.5, color: C.sub }}>최종 업데이트 · {formatKstUpdate(summary.lastUpdated)}</span>
              </div>
            )}
          </div>
        </div>
        {/* 이 문장은 빼면 안 된다(공개 저장소·법률). 히어로 시트의 각주 띠에 두면 첫
            화면 안에 들면서도 그래픽을 밀어내지 않는다. */}
        <div className="hz-sheet-foot">
          <span style={{ fontSize: 12, lineHeight: 1.6, color: C.sub }}>
            한국 주식 텔레그램 채널들이 지금 무엇에 주목하는지를 모아 보여줍니다 · 조회·확산·언급량을 종합한 화제성 지표이며, 매수·매도 신호가 아닙니다
          </span>
        </div>
      </section>

      <SectionCaps label="최근 뜨는 것" count={3} />

      {/* ── 급부상 종목: 시트 안 3×2 셀 ─────────────────────────────── */}
      <section className="hz-sheet">
        <SectionHead
          icon="local_fire_department"
          title="급부상 종목"
          note="최근 3일 vs 평소"
          desc="평소보다 언급이 갑자기 뛴 종목 · 배수가 클수록 갑작스러운 관심"
        />
        {surging.length === 0 ? (
          <p style={{ margin: 0, padding: "20px 22px", color: C.sub, fontSize: 13 }}>
            아직 급부상 신호가 뚜렷한 종목이 없습니다. 데이터가 쌓일수록 또렷해집니다.
          </p>
        ) : (
          <>
            <div className="hz-panelgrid hz-panelgrid-3">
              {surging.map((s, i) => {
                const values = s.series.slice(-7);
                const dates = s.seriesDates.slice(-7);
                return (
                  <div key={s.code} className="hz-panel-pad">
                    {/* baseline 정렬이어야 한다. flex-start 는 **상자 윗변**을 맞추는데,
                        이 줄엔 14px 종목명과 11px 코드·11.5px 표본이 섞여 있어 상자를 맞추면
                        정작 눈에 보이는 글자 밑선이 어긋난다(실측 3.8px). 순위 배지는 판이라
                        글자 밑선이 아니라 판의 광학 중심으로 읽히므로 같이 내려가도 된다. */}
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
                      <RankBadge n={i + 1} />
                      {/* minWidth:0 — flex 항목의 기본 min-width:auto 가 살아 있으면 이름이
                          줄지 않아 말줄임이 안 걸리고 셀 밖으로 넘친다(820px 에서 실측 3px).
                          줄어도 되는 건 이름뿐이라 여기만 풀어 준다. */}
                      <strong style={{ ...clip, minWidth: 0, fontSize: 14, fontWeight: 800, letterSpacing: "-.01em", color: C.ink }}>{s.name}</strong>
                      <span style={{ fontFamily: MONO, fontSize: 11, color: C.sub2, flexShrink: 0 }}>{s.code}</span>
                      <span style={{ flex: 1 }} />
                      {/* '몇 개 채널'과 '며칠에 몇 회'는 둘 다 이 배수의 표본 크기를 말한다 —
                          한 덩어리로 오른쪽 위에 모아 두면 아래 그래픽이 배수와 막대만 남는다.
                          ⚠️ '평소 N회'는 여기 없다. 배수는 언급 **횟수**가 아니라 그날 전체
                          대화에서 차지한 **몫(share)** 을 평활해 낸 값이라(getSurgingStocks),
                          횟수 둘을 나란히 두면 그 비가 배수와 안 맞아 눈금이 둘 생긴다. */}
                      <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, flexShrink: 0 }}>
                        {/* channelCount 가 null 이면 못 센 것이다(조회 실패). 그 줄만 뺀다 —
                            0 을 찍으면 "이 종목을 다룬 채널이 없다"는 거짓이 되는데, 바로
                            아래 '최근 N일 기준 M회'가 그 말과 대놓고 어긋난다. */}
                        {s.channelCount !== null && (
                          <span style={{ fontSize: 11.5, color: C.sub2, whiteSpace: "nowrap" }}>{s.channelCount}개 채널</span>
                        )}
                        <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 700, color: C.label, whiteSpace: "nowrap" }}>
                          최근 {s.recentDays}일 기준 {s.recentMentions}회
                        </span>
                      </span>
                    </div>

                    {/* 이 셀이 말하려는 건 시세가 아니라 이 배수다 — 30px 로 올려 주인공을 못박는다. */}
                    <div style={{ display: "flex", alignItems: "baseline", gap: 9, flexWrap: "wrap" }}>
                      <strong style={{ fontFamily: MONO, fontSize: 30, fontWeight: 800, letterSpacing: "-.035em", lineHeight: 1, color: C.hot }}>
                        {s.ratio.toFixed(1)}
                        <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-.02em" }}>배</span>
                      </strong>
                      <span style={{ fontSize: 11.5, color: C.sub2 }}>평소 대비</span>
                      {s.isNew && <Pill tone="blue">신규 등장</Pill>}
                    </div>

                    <DayBars values={values} dates={dates} tone="warm" hot={Math.min(s.recentDays, values.length)} />

                    <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: 8, paddingTop: 2, flexWrap: "wrap" }}>
                      {s.closePrice != null ? (
                        <>
                          <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: C.label, whiteSpace: "nowrap", flexShrink: 0 }}>
                            {s.closePrice.toLocaleString("ko-KR")}원
                          </span>
                          {/* 야후 실시간이 아니면(KRX 저장 종가 폴백) 등락률 대신 기준일을 단다.
                              폴백이면 등락률도 그날 것이라, 화살표를 그대로 두면 가격뿐 아니라
                              방향까지 뒤집혀 보인다(QuoteDate 주석). */}
                          {s.isLive ? (
                            <ChangeRate rate={s.changeRate} style={{ fontSize: 11.5, fontWeight: 800 }} />
                          ) : (
                            <QuoteDate date={s.priceDate} style={{ fontSize: 11.5 }} />
                          )}
                        </>
                      ) : (
                        <span style={{ fontSize: 11.5, color: C.sub2 }}>가격 정보 준비 중</span>
                      )}
                      <span style={{ flex: 1 }} />
                      <MddLink code={s.code} market={s.market} label="MDD" />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="hz-sheet-foot">
              <span style={{ fontSize: 12, lineHeight: 1.6, color: C.sub }}>
                막대는 최근 7일 일별 언급량이고, 붉은 칸이 배수를 낸 최근 창입니다 · 배수는 언급 횟수가 아니라 그날 전체 대화에서 차지한 몫을 견준 값입니다
              </span>
            </div>
          </>
        )}
      </section>

      {/* ── 테마 로테이션 · 이슈 키워드 (50:50) ──────────────────────── */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <section className="hz-sheet" style={{ flex: "1 1 calc(50% - 8px)", minWidth: SHEET_PAIR_MIN, display: "flex", flexDirection: "column" }}>
          <SectionHead
            icon="donut_small"
            title="테마 로테이션"
            note="3일 vs 이전"
            desc="관심이 어느 테마로 옮겨가는지 · 점유율 변화 기준"
            noteHelp="최근 3일 평균 점유율을 그 이전과 비교합니다. 하루치끼리 재면 표본 얇은 날에 크게 요동쳐서, 며칠씩 묶어서 봅니다."
          />
          {themes.length === 0 ? (
            <p style={{ margin: 0, padding: "20px 22px", color: C.sub, fontSize: 13 }}>아직 집계된 테마가 없습니다.</p>
          ) : (
            <>
              <div className="hz-kd-duo" style={{ borderBottom: "1px solid var(--c-sheet-line)" }}>
                <Highlight
                  cap="가장 많이 유입"
                  name={topIn?.theme ?? "—"}
                  value={topIn ? `▲${Math.abs(delta(topIn)).toFixed(1)}%p` : undefined}
                  valueColor="var(--c-hot-ink)"
                  sub={topIn ? `점유율 ${topIn.sharePct.toFixed(1)}% · ${topIn.rank}위` : "관심이 새로 몰린 테마가 없습니다"}
                  divide
                />
                <Highlight
                  cap="가장 많이 이탈"
                  name={topOut?.theme ?? "—"}
                  value={topOut ? `▼${Math.abs(delta(topOut)).toFixed(1)}%p` : undefined}
                  valueColor="var(--c-cold-ink)"
                  sub={
                    topOut
                      ? topOut.rankChange
                        ? `순위도 ${Math.abs(topOut.rankChange)}계단 ${topOut.rankChange > 0 ? "상승" : "하락"}`
                        : `점유율 ${topOut.sharePct.toFixed(1)}% · ${topOut.rank}위`
                      : "관심이 빠져나간 테마가 없습니다"
                  }
                />
              </div>

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
                {themes.map((t, i) => themeRow(t, i, themes.length))}
              </div>
            </>
          )}
        </section>

        <section className="hz-sheet" style={{ flex: "1 1 calc(50% - 8px)", minWidth: SHEET_PAIR_MIN, display: "flex", flexDirection: "column" }}>
          <SectionHead icon="tag" title="이슈 키워드" note="최근 3일" desc="종목명이 아닌 화제어 · 언급 횟수 기준" />
          {keywords.length === 0 ? (
            <p style={{ margin: 0, padding: "20px 22px", color: C.sub, fontSize: 13 }}>아직 뽑을 화제어가 없습니다.</p>
          ) : (
            <>
              {(() => {
                const top = keywords[0];
                const second = keywords[1];
                /* '가장 큰 변동'은 **위아래를 안 가린다**(절댓값 최대). 늘어난 말만 세우면
                   관심이 빠진 자리가 화면에서 통째로 안 보인다. 동점은 순위로 가른다 —
                   안 가르면 실행마다 다른 말이 뜬다. 미장 카드와 같은 규칙이다. */
                const moved =
                  keywords
                    .filter((k) => k.shareDelta !== null)
                    .sort((a, b) => Math.abs(b.shareDelta!) - Math.abs(a.shareDelta!) || a.rank - b.rank)[0] ?? null;
                return (
                  <div className="hz-kd-duo" style={{ borderBottom: "1px solid var(--c-sheet-line)" }}>
                    <Highlight
                      cap="화제어 1위"
                      name={top.word}
                      value={`${top.count.toLocaleString("ko-KR")}회`}
                      valueColor="var(--c-hot-ink)"
                      sub={second ? `2위 ${second.word}의 ${(top.count / Math.max(1, second.count)).toFixed(1)}배` : "비교할 2위가 없습니다"}
                      divide
                    />
                    <Highlight
                      cap="가장 큰 변동"
                      name={moved?.word ?? "—"}
                      value={
                        moved
                          ? `${moved.shareDelta! > 0 ? "▲" : "▼"}${Math.abs(moved.shareDelta! * 100).toFixed(1)}%p`
                          : undefined
                      }
                      valueColor={moved && moved.shareDelta! > 0 ? "var(--c-hot-ink)" : "var(--c-cold-ink)"}
                      sub={moved ? "최근 3일 vs 그 이전 점유율" : "비교할 과거 집계가 없습니다"}
                    />
                  </div>
                );
              })()}

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
                      <span style={{ ...clip, minWidth: 0, fontSize: 13, fontWeight: 700, color: C.ink }}>{k.word}</span>
                      <span style={{ flex: 1 }} />
                      {/* 옆 테마 표는 %p 를 이름 줄 오른끝(막대 바로 위)에 둔다. 이 표는
                          이름과 막대가 다른 칸이라 그 자리가 없어 **이름 칸의 오른끝**에
                          붙인다 — 두 표의 이름 칸이 같은 x 에서 끝나므로 두 %p 가 한
                          세로선 위에 선다. shareDelta 는 몫이라 ×100 해서 넘긴다. */}
                      <DeltaPp
                        value={k.shareDelta === null ? null : k.shareDelta * 100}
                        style={{ fontSize: 12 }}
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
                        fontSize: 12,
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
                        fontSize: 12,
                        fontWeight: 800,
                        textAlign: "right",
                        whiteSpace: "nowrap",
                        color: C.ink,
                      }}
                    >
                      {k.count.toLocaleString("ko-KR")}
                      <span style={{ fontSize: 11, fontWeight: 700, color: C.sub2, marginLeft: 1 }}>회</span>
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>

      <SectionCaps label="무슨 얘기가 오갔나" count={2} />

      {/* ── 주요 종목 리포트: 시트 안 2×2 셀 ────────────────────────── */}
      <section className="hz-sheet">
        <SectionHead
          icon="query_stats"
          title="주요 종목 리포트"
          note={`최근 ${KADERA_WINDOW_DAYS}일 · 상위 ${Math.max(1, stockReports.length)}종목`}
          desc="가장 많이 회자된 종목의 언급 추이와 흐름"
        />
        {stockReports.length === 0 ? (
          <p style={{ margin: 0, padding: "20px 22px", color: C.sub, fontSize: 13 }}>아직 리포트를 만들 종목이 없습니다.</p>
        ) : (
          <div className="hz-panelgrid hz-panelgrid-2">
            {stockReports.map((r, i) => {
              const peak = Math.max(0, ...r.series.map((d) => d.mentions));
              /* ⚠️ 목업의 "▼30% 이전 3일" 배지는 넣지 않는다.
                 집계 창(scored, 최근 3일)의 일평균을 앞쪽 4일과 견주면 **주말이 낀 날은
                 전 종목이 일제히 ▼로 찍힌다.** 실제로 그랬다(2026-08-03 기준: 최근 창이
                 토·일·월이고 이전 창이 화~금이라 상위 4종목이 ▼75 · ▼66 · ▼67 · ▼34).
                 종목끼리의 차이가 아니라 요일을 재고 있는 셈이라 값어치가 없다.
                 급부상 배수가 share 기반인 것도 같은 이유고(getSurgingStocks 주석),
                 여기서 같은 보정을 하려면 그날 전체 대화량이 필요한데 StockReport 엔 없다.
                 추이는 아래 7일 막대와 AI 문장이 이미 말한다. */
              return (
                <div key={r.code} className="hz-panel-pad">
                  {/* 순위 배지가 아니라 **로고 + 종목명**이다. 이 시트는 순위표가 아니라
                      종목별 리포트라, 몇 등인지보다 어느 회사인지가 먼저 읽혀야 한다
                      (급부상 셀은 반대라 그쪽엔 배지가 남는다).
                      폰에서는 시세가 다음 줄로 내려간다(globals.css 의 .hz-stock-head) —
                      한 줄에 다 넣으면 시세 묶음이 nowrap 이라 안 줄고, 줄어들 수 있는 건
                      종목명뿐이라 이름이 먼저 0 으로 눌려 사라진다. */}
                  <div className="hz-stock-head" style={{ display: "flex", alignItems: "baseline", gap: 10, minWidth: 0 }}>
                    <StockLogo code={r.code} name={r.name} market={r.market} size={30} />
                    <strong style={{ ...clip, minWidth: 0, fontSize: 17, fontWeight: 800, letterSpacing: "-.02em", color: C.ink }}>{r.name}</strong>
                    <span style={{ fontFamily: MONO, fontSize: 11, color: C.sub2, flexShrink: 0 }}>{r.code}</span>
                    {r.price != null && (
                      <span className="hz-stock-price" style={{ display: "flex", alignItems: "baseline", gap: 7, whiteSpace: "nowrap", flexShrink: 0 }}>
                        <span style={{ fontFamily: MONO, fontSize: 15, fontWeight: 800, color: C.ink, letterSpacing: "-.02em" }}>
                          {r.price.toLocaleString("ko-KR")}원
                        </span>
                        <ChangeRate rate={r.changeRate} style={{ fontSize: 12.5, fontWeight: 800 }} />
                      </span>
                    )}
                  </div>

                  {/* hot = 큰 숫자(totalMentions)가 실제로 센 날 수. StockReport.series 의
                      scored 가 그 창을 표시해 둔다 — 창 밖 칸은 막대가 옅어진다. */}
                  <DayBars
                    values={r.series.map((d) => d.mentions)}
                    dates={r.series.map((d) => d.date)}
                    tone="cold"
                    hot={r.series.filter((d) => d.scored).length}
                    peakLabel={peak > 0 ? `최다 ${peak}회` : undefined}
                  />

                  {narratives[r.code] && (
                    <div style={{ display: "flex", gap: 9, background: C.soft, borderRadius: R.control, padding: "12px 13px" }}>
                      <AiMark size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7, color: "var(--c-ink-soft)", textWrap: "pretty", wordBreak: "keep-all" }}>
                        {narratives[r.code]}
                      </p>
                    </div>
                  )}
                  {/* 표본 크기는 왼쪽 아래, MDD 링크는 오른쪽 아래. 한 줄에 마주 보게 두면
                      "이 리포트가 몇 건을 봤나"와 "더 파고들기"가 같은 높이에서 끝난다. */}
                  <div style={{ marginTop: "auto", display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, paddingTop: 2 }}>
                    <span style={{ fontFamily: MONO, fontSize: 11, color: C.sub2, whiteSpace: "nowrap" }}>
                      {/* 채널 수를 못 셌으면(null) 가운뎃점부터 통째로 뺀다. 위 카드와 같은 규칙이다. */}
                      언급 {r.totalMentions.toLocaleString("ko-KR")}회
                      {r.channelCount !== null && ` · ${r.channelCount}개 채널`}
                    </span>
                    <MddLink code={r.code} market={r.market} label="MDD 정밀분석" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── 트렌딩 메시지 ────────────────────────────────────────────── */}
      {/* 이 한 장만 Suspense 로 떼어 놨다. 이유는 TrendingSection 주석에. */}
      <Suspense fallback={<TrendingSkeleton />}>
        <TrendingSection />
      </Suspense>

      <SectionCaps label="채널" count={2} />

      {/* ── 채널 파워 랭킹 · 뜨는 채널 (50:50) ───────────────────────── */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <section className="hz-sheet" style={{ flex: "1 1 calc(50% - 8px)", minWidth: SHEET_PAIR_MIN, display: "flex", flexDirection: "column" }}>
          <SectionHead icon="military_tech" title="채널 파워 랭킹" desc="조회율·확산력까지 반영한 채널 영향력" />
          {channels.length === 0 ? (
            <p style={{ margin: 0, padding: "20px 22px", color: C.sub, fontSize: 13 }}>아직 채널 점수가 없습니다.</p>
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
                  data-tip="조회율·포워드율·구독자 규모·게시 빈도를 합쳐 52~100으로 낸 점수입니다. 구독자만 많고 안 읽히는 채널은 낮게 나옵니다. ▲▼ 는 3일 전 순위와 견준 것입니다."
                  data-ga-tip="influence_score"
                  style={{ display: "inline-flex", alignItems: "center", justifyContent: "flex-end", gap: 3, cursor: "help" }}
                >
                  영향력
                  <Icon name="help" style={{ fontSize: 12, color: C.hint }} />
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

        <section className="hz-sheet" style={{ flex: "1 1 calc(50% - 8px)", minWidth: SHEET_PAIR_MIN, display: "flex", flexDirection: "column" }}>
          {/* 기간 표기는 옆 시트와 "최근 7일"로 맞춘다. 구독자 스냅샷은 백필이 안 돼
              하루씩 쌓이므로 실제로 잰 구간이 그보다 짧은 날이 있다(getRisingChannels 의
              spanDays). 시트에 그 사정까지 적진 않는다. */}
          <SectionHead icon="rocket_launch" title="뜨는 채널" note="최근 7일" desc="최근 구독자가 많이 늘어난 채널" />
          {(() => {
            const real = rising.filter((r) => !r.isPlaceholder);
            const topDelta = Math.max(1, ...real.map((r) => Math.abs(r.delta7d)));
            if (real.length === 0) {
              return <p style={{ margin: 0, padding: "20px 22px", color: C.sub, fontSize: 13 }}>아직 구독자 변화를 잴 만큼 스냅샷이 쌓이지 않았습니다.</p>;
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
                      <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.sub2 }}>{i + 1}</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                        <Avatar photoUrl={r.photoUrl} title={r.title} size={26} />
                        <span style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
                          <span style={{ ...clip, fontSize: 12, fontWeight: 700, color: C.ink }}>{r.title}</span>
                          <span style={{ ...clip, fontSize: 11, fontFamily: MONO, color: C.sub2 }}>구독자 {compact(r.subscriberCount)}</span>
                        </span>
                      </span>
                      <span style={{ height: 7, borderRadius: 999, background: C.track, overflow: "hidden" }}>
                        <span
                          style={{
                            display: "block",
                            width: `${Math.max(2, (Math.abs(r.delta7d) / topDelta) * 100)}%`,
                            height: "100%",
                            background: r.delta7d >= 0 ? "var(--c-warm-2)" : "var(--c-blue-3)",
                          }}
                        />
                      </span>
                      {/* 정원을 채우느라 증감이 없거나 줄어든 채널까지 들어올 수 있어 부호를 그대로 쓴다 */}
                      <span
                        style={{
                          fontFamily: MONO,
                          fontSize: 11,
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
                  <span style={{ fontSize: 12, color: C.sub }}>
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
