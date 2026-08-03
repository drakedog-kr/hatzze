import type { Metadata } from "next";
import Link from "next/link";

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
import type { TrendingMessage } from "@/lib/telegram-data";

import { formatKstUpdate, shortDate } from "@/lib/format";

import { KADERA_CARD } from "../og-copy";
import { pageMetadata } from "../seo";
import { AiMark, C, Icon, MONO } from "../ui";
import { ExpandableList } from "./ExpandableList";
import { Avatar, ChangeRate, Pill, QuoteDate, RankDelta, Sparkline, card as cardStyle, rankNum, subCard } from "./parts";
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

/** 급부상 종목 타일에서 가격 바로 아랫줄(등락률 또는 시세 기준일)의 공통 치수.
    가격이 카드의 주어에서 밑줄로 내려가면서 13/11 로 한 단계씩 줄었다. */
const quoteSubLine: React.CSSProperties = { display: "block", marginTop: 2, fontSize: 11 };

/** 그 종목의 MDD 정밀분석 주소. 이름은 MDD 페이지가 code 로 찾으므로 URL 엔 code·market
   만 실어 깔끔하게 둔다(코스닥은 market 으로 .KQ 심볼이 된다). */
function mddHref(code: string, market: string | null): string {
  return `/mdd?code=${code}${market ? `&market=${market}` : ""}`;
}

/** 종목 카드 → 그 종목의 MDD 정밀분석으로 잇는 작은 링크. */
function MddLink({ code, market }: { code: string; market: string | null }) {
  return (
    <Link href={mddHref(code, market)} className="hz-mdd-link">
      MDD 정밀분석
      <Icon name="arrow_outward" style={{ fontSize: 13 }} />
    </Link>
  );
}

/* 생태계 센티먼트 카드의 LLM 총평 줄 높이.

   **높이는 고정하지 않는다. 3줄이면 3줄, 4줄이면 4줄로 글에 맞춰 흐른다.**
   한때 4줄로 못박아 뒀는데(줄 수는 화면 폭을 타서 같은 240자가 1280px 에선 4줄,
   1920px 에선 3줄이다) 넓은 화면에서 늘 밑에 빈 줄이 하나 남았다. 그 자리는 어떤
   글자수로도 못 채운다 — 넓은 쪽을 채우려면 좁은 쪽이 잘리기 때문이다.

   **옆 카드와 높이를 맞추는 일은 이 상자가 아니라 그리드가 한다**(globals.css 의
   hz-selfstretch-lg). 모니터링 현황이 이 카드 높이로 늘어나므로, 총평이 한 줄 줄면
   두 카드가 나란히 한 줄만큼 줄어든다. 높이는 여전히 서로 같다.

   길이 자체는 파이프라인이 잡는다(generate_telegram_narratives.py 의 BRIEF_TONE_LEN·
   BRIEF_NEWS_LEN = 총 240~258자). 여기서 다시 자르지 않는 이유는, 잘라 두면 그쪽이
   망가졌을 때 화면이 조용히 문장을 먹어 치우기 때문이다. 길어지면 길어진 대로 보이는
   편이 눈에 띈다. */
const SUMMARY_LINE_HEIGHT = 1.7;

/** 한 줄 말줄임 — 채널명·종목명처럼 카드를 밀어낼 수 있는 이름에 붙인다. */
const clip: React.CSSProperties = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };

/* 테마 로테이션 줄의 스파크라인 정렬 상수 넷(THEME_NAME_H·THEME_BAR_TOP·THEME_BAR_H·
   SPARK_H)이 여기 있었다. 그 줄이 두 층(이름 줄 + 막대 줄)이던 시절, 오른쪽 스파크라인의
   밑선을 왼쪽 막대의 밑선에 맞추려고 쌓인 높이를 손으로 더하던 값들이다.
   줄이 한 층 다섯 칸(테마·점유율·변화폭·증감·순위)이 되면서 스파크라인 자리가 없어져
   같이 나갔다. 14일 추이는 카드에서 빠졌다 — 다섯 칸에 여섯째를 끼우면 절반 폭 카드에서
   막대가 30px 로 눌린다. */

/**
 * 트렌딩 메시지 목록(3열 그리드). 기간 탭이 세 벌을 미리 렌더해 넘기므로
 * 목록 마크업만 여기로 뽑아 재사용한다 — 조회는 서버에 그대로 남는다.
 */
function TrendingList({ items }: { items: TrendingMessage[] }) {
  const nodes = items.map((m, i) => {
    const tags = [...m.stocks, ...m.topics.map((t) => `#${t}`)];
    return (
      <li key={`${m.channelHandle}-${m.messageId}`} style={{ display: "flex" }}>
        {/* 원문 메시지로 이동 — 텔레그램 공개 채널은 t.me/핸들/메시지ID 로 열린다 */}
        <a
          href={`https://t.me/${m.channelHandle}/${m.messageId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="hz-lift"
          data-ga="kadera_message_click"
          data-ga-channel={m.channelHandle}
          style={{
            ...subCard,
            padding: "13px 15px",
            display: "flex",
            flexDirection: "column",
            gap: 10,
            textDecoration: "none",
            width: "100%",
            minHeight: 172,
          }}
        >
          {/* 보낸 채널 */}
          <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
            <span style={{ ...rankNum, width: 13, fontSize: 11, color: i < 3 ? C.hot : C.faint }}>{i + 1}</span>
            <Avatar photoUrl={m.channelPhotoUrl} title={m.channelTitle} size={22} />
            <b style={{ ...clip, fontSize: 12, fontWeight: 600, color: C.blue }}>{m.channelTitle}</b>
            <span style={{ marginLeft: "auto", fontSize: 10.5, fontFamily: MONO, color: C.faint, whiteSpace: "nowrap" }}>
              {timeAgo(m.postedAt)}
            </span>
          </div>

          {/* 본문. overflowWrap:anywhere 가 없으면 원문에 섞인 긴 URL 이 줄바꿈을 못 해
              카드 밖으로 잘려 나간다(실제로 뉴스 링크가 통째로 잘려 있었다). */}
          <p
            style={{
              margin: 0,
              flex: 1,
              fontSize: 13,
              lineHeight: 1.6,
              color: C.ink,
              overflowWrap: "anywhere",
              display: "-webkit-box",
              WebkitLineClamp: 5,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {m.text}
          </p>

          {/* 지표 — 카드 맨 아래 한 줄로 고정한다. 예전엔 종목·주제 태그와 같은 줄에
              섞여, 태그가 많은 메시지에선 조회 수가 어디 있는지 매번 찾아야 했다. */}
          <div style={{ display: "flex", alignItems: "center", gap: 11, fontSize: 11, fontFamily: MONO, color: C.muted }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
              <Icon name="visibility" style={{ fontSize: 13 }} /> {compact(m.views)}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
              <Icon name="shortcut" style={{ fontSize: 13 }} /> {compact(m.forwards)}
            </span>
            {m.replies > 0 && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                <Icon name="chat_bubble" style={{ fontSize: 12 }} /> {m.replies}
              </span>
            )}
          </div>

          {/* 태그는 지표 아래 제 줄에. 실선 대신 여백만으로 나눠 카드가 답답해지지 않게. */}
          {tags.length > 0 && (
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: -3 }}>
              {tags.map((t) => (
                <Pill key={t} tone={t.startsWith("#") ? "plain" : "blue"}>
                  {t}
                </Pill>
              ))}
            </div>
          )}
        </a>
      </li>
    );
  });

  // 3열 그리드 — 한 줄에 3개씩. 카드가 좁아지는 대신 세로로 길어져 실제 텔레그램
  // 메시지처럼 읽힌다. 채널 파워 랭킹과 같은 더 보기(+10)를 붙인다.
  return (
    <ExpandableList
      items={nodes}
      name="trending_messages"
      initial={6}
      step={10}
      listStyle={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))",
        gap: 12,
        alignItems: "stretch",
      }}
    />
  );
}

export default async function KaderaPage() {
  // 종목 리포트는 "어느 종목인지"를 먼저 알아야 해서 getTopStocksWithTrend 에 매여 있다.
  // 그렇다고 이걸 await 한 **뒤에** 나머지를 시작하면, 나머지와 아무 상관 없는 그 왕복이
  // 페이지 앞에 통째로 붙는다(실측 240ms, 콜드 1,976ms). 독립적인 조회들은 지금 바로
  // 띄우고, 종목 리포트만 이 프로미스에 이어 붙인다 — 둘이 나란히 간다.
  const topStocksPromise = getTopStocksWithTrend(3);
  const reportsPromise = topStocksPromise.then((tops) =>
    Promise.all(tops.map((s) => getStockReport(s.code))),
  );
  const [
    summary,
    surging,
    trendingToday,
    trending,
    trendingMonth,
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
      getSurgingStocks(5),
      // 기간 탭이 즉시 전환되도록 세 창을 한 번에 받아둔다(병렬이라 지연은 한 번 분).
      // 6건만 보여주고 '더 보기'로 10건씩 늘리므로, 세 번 펼칠 만큼(36) 미리 받아둔다.
      getTrendingMessages("today", 36),
      getTrendingMessages(7, 36),
      getTrendingMessages(30, 36),
      getChannelRanking(),
      getRisingChannels(10),
      getThemeRotation(10),
      reportsPromise,
      getEcosystemSentiment(),
      getIssueKeywords(10),
      getStockNarratives(),
    ]);
  const stockReports = reports.filter((r): r is NonNullable<typeof r> => r !== null);

  // 배지(순위 변동·성장중)는 채널명 뒤가 아니라 점수 왼쪽 묶음에 둔다. 이름 뒤에 붙이면
  // "주식 급등일보🚀…| Korean Stocks" 같은 긴 이름에서 배지가 말줄임에 먹혀 잘렸다.
  const channelItems = channels.map((c, i) => (
    <li key={c.handle}>
      <a
        href={`https://t.me/${c.handle}`}
        target="_blank"
        rel="noopener noreferrer"
        className="hz-row-link"
        data-ga="kadera_channel_click"
        data-ga-channel={c.handle}
        data-ga-surface="power_rank"
        data-ga-rank={i + 1}
      >
        <span style={{ ...rankNum, color: i < 3 ? C.blue : C.faint }}>{i + 1}</span>
        <Avatar photoUrl={c.photoUrl} title={c.title} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...clip, fontWeight: 600, fontSize: 14, color: C.ink }}>{c.title}</div>
          <div style={{ ...clip, marginTop: 2, fontSize: 11, fontFamily: MONO, color: C.muted }}>
            구독자 {c.subscriberCount ? compact(c.subscriberCount) : "-"}
            {c.viewRate != null && ` · 조회율 ${c.viewRate.toFixed(1)}%`}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <RankDelta change={c.rankChange} />
          {c.isGrowing && <Pill tone="hot">성장중</Pill>}
          {/* 점수는 52~100 이라 앞자리만 보고 줄 세우기 어렵다 — 숫자 아래 가는 띠로
              같은 정보를 한 번 더 그려 위아래 행의 차이가 눈에 먼저 들어오게 한다. */}
          <div style={{ width: 44, textAlign: "right" }}>
            <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 18, color: C.blue, lineHeight: 1.1, letterSpacing: "-0.02em" }}>
              {c.influenceScore.toFixed(0)}
            </div>
            <div style={{ marginTop: 4, height: 3, background: C.track, borderRadius: 999, overflow: "hidden" }}>
              <div
                style={{
                  width: `${Math.max(6, Math.min(100, ((c.influenceScore - 50) / 50) * 100))}%`,
                  height: "100%",
                  background: C.blue,
                  opacity: 0.75,
                  borderRadius: 999,
                }}
              />
            </div>
          </div>
        </div>
      </a>
    </li>
  ));

  /* 채널을 세는 세 줄은 전부 **지금 수집 중인 채널**을 센다(getTelegramSummary 주석).
     목록에 있어도 peer 캐시가 없어 한 건도 안 걷히는 채널은 모니터링하고 있는 것이
     아니다. 화면에 덧붙이는 표시는 없다 — 숫자 자체가 사실이면 설명할 것이 없다. */
  const miniStats: { label: string; value: string; help?: string }[] = [
    { label: "모니터링 채널", value: `${summary.channelCount}개` },
    { label: "총 구독자", value: formatKR(summary.totalSubscribers) },
    { label: "활성 채널 (7일)", value: `${summary.activeChannels}개`, help: "최근 7일 안에 메시지를 올린 채널입니다." },
    { label: "총 메시지 (7일)", value: `${summary.messages7d.toLocaleString("ko-KR")}개` },
  ];

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
      {/* 소개 — 제목은 여기서 안 그린다. 페이지 제목은 셸의 본문 헤더(AppShell 의
          PageHeader)가 그리는 h1 하나뿐이다. 예전엔 여기에 h1 을 또 둬서 "카더라 리포트"가
          화면에 두 번 떴고 문서에 h1 이 둘이었다.
          남은 문단은 그대로 둔다 — "화제성 지표이며 매수·매도 신호가 아닙니다"는 빼면 안 되는
          문장이고, 헤더의 한 줄 부제("주식 텔레그램에서 무엇이 회자되는지")로는 대신 못 한다.
          맨 문단으로 두면 카드 격자 위에 뜬 부스러기처럼 보여서, 다른 섹션과 같은 카드에
          담고 아이콘 타일로 시작점을 맞춘다(제목 칸은 비운다 — 넣으면 다시 중복이다). */}
      <section style={{ ...cardStyle, display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: "var(--r-icon)",
            background: "var(--c-blue-tint)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon name="forum" style={{ fontSize: 21, color: C.blue }} />
        </div>
        <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.75, color: C.inkSoft, textWrap: "pretty" }}>
          한국 주식 텔레그램 채널들이 <b style={{ fontWeight: 800, color: C.ink }}>지금 무엇에 주목하는지</b>를 모아 보여줍니다.
          조회·확산·언급량을 종합한 <b style={{ fontWeight: 800, color: C.ink }}>화제성</b> 지표이며, 매수·매도 신호가 아닙니다.
        </p>
      </section>

      <div className="hz-grid">
        {/* 모니터링 현황 (1칸). 세로 정렬은 hz-selfstretch-lg 가 맡는다 — 데스크톱에선 옆의
            센티먼트 카드와 밑선을 맞추고(stretch), 2열 이하에선 훨씬 긴 '뜨는 채널'이 짝이
            되므로 내용만큼만 선다. 브레이크포인트마다 달라서 인라인 style 로는 안 된다. */}
        <div className="hz-selfstretch-lg" style={{ ...cardStyle, display: "flex", flexDirection: "column" }}>
          <SectionHead icon="monitoring" title="모니터링 현황" desc="추적 중인 텔레그램 채널 규모" />
          {/* 네 줄 사이를 가는 선으로 나눠 한 장의 표로 읽히게 한다. */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            {miniStats.map((s, i) => (
              <div
                key={s.label}
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  gap: 8,
                  padding: "12px 0",
                  borderTop: i === 0 ? "none" : `1px solid var(--c-divider)`,
                }}
              >
                {/* wordBreak:keep-all — 이 카드는 4열 그리드의 1칸이라 1025~1300px 구간에서
                    폭이 185px 까지 좁아진다. 기본 규칙이면 "활성 채널 (7일)"이 "활성 채널 (7"
                    / "일)" 처럼 토막나 읽히지 않는다. 어절 경계에서만 접히게 한다.
                    minWidth:0 — 접힐 수 있어야 옆의 숫자가 밀려나지 않는다. */}
                <span style={{ fontSize: 12, color: C.sub, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4, minWidth: 0, wordBreak: "keep-all" }}>
                  {s.label}
                  {s.help && (
                    <span className="hz-tip hz-tip-wide" data-tip={s.help} data-ga-tip={s.label} style={{ display: "inline-flex", cursor: "help", flexShrink: 0 }}>
                      <Icon name="help" style={{ fontSize: 13, color: C.muted }} />
                    </span>
                  )}
                </span>
                {/* 숫자는 절대 안 쪼갠다 — "38,631" 과 "개" 가 두 줄로 갈리면 수치가 아니라
                    오류처럼 보인다. 라벨이 접히더라도 이쪽은 통째로 유지한다. */}
                <span style={{ fontFamily: MONO, fontSize: 18, fontWeight: 700, color: C.ink, letterSpacing: "-0.02em", whiteSpace: "nowrap", flexShrink: 0 }}>{s.value}</span>
              </div>
            ))}
          </div>
          {/* marginTop:auto 로 버튼을 바닥에 붙인다 — 카드가 옆 카드 높이만큼 늘어나도
              남는 자리가 통계 줄 사이가 아니라 버튼 위 한 곳에만 생긴다. paddingTop 은
              늘어나지 않았을 때의 최소 간격(예전 marginTop:18 과 같은 값). */}
          <div style={{ marginTop: "auto", paddingTop: 18 }}>
            <a
              href="https://forms.gle/PRapNH9rz8YuF2zu9"
              target="_blank"
              rel="noopener noreferrer"
              className="hz-btn-soft"
              data-ga="cta_click"
              data-ga-cta="register_channel"
              data-ga-surface="channel_rank"
            >
              <Icon name="add_circle" style={{ fontSize: 16 }} />
              채널 등록 신청
            </a>
          </div>
        </div>

        {/* 생태계 센티먼트 (3칸) — 메시지별 LLM 분류를 집계한 결과 */}
        <div className="hz-c3" style={cardStyle}>
          {/* 업데이트 시각은 머리의 meta 줄로 넘겼다 — 예전엔 머리 뒤에 음수 마진으로
              끼워 넣어 설명과 붙어 있었고, 여백을 손볼 때마다 이 줄이 어긋났다. */}
          <SectionHead
            icon="psychology"
            title="텔레그램 생태계 센티먼트"
            note={`최근 ${KADERA_WINDOW_DAYS}일`}
            desc="메시지 톤으로 본 시장 분위기"
            meta={summary.lastUpdated ? `최종 업데이트 · ${formatKstUpdate(summary.lastUpdated)}` : undefined}
          />
          {!sentiment ? (
            <p style={{ margin: 0, color: C.sub, fontSize: 13 }}>아직 분석된 메시지가 없습니다.</p>
          ) : (
            <>
              <div style={{ display: "flex", gap: 28, flexWrap: "wrap", alignItems: "center" }}>
                {/* 메시지 톤 종합 — 점수와 그 근거 막대를 한 덩어리로 묶는다 */}
                {/* flex-basis 300 + minWidth 0. basis 로 "300 이 안 되면 아랫줄로" 는 유지하되,
                    아랫줄로 내려간 뒤에는 남은 폭까지 줄어들 수 있게 한다 — minWidth:280 이던
                    때는 줄바꿈 후에도 280 을 고집해, 375px 화면에서 비관↔낙관 막대와 '낙관'
                    라벨이 카드 오른쪽 밖으로 44px 삐져나왔다(히어로 hz-hero 가 겪은 것과 같은
                    문제라 같은 해법을 쓴다). */}
                <div style={{ flex: "1 1 300px", minWidth: 0 }}>
                  {/* 이 카드가 답하는 건 "지금 분위기 좋아, 나빠?" 하나다. 그래서 숫자도 한 벌만
                      쓴다 — 예전엔 헤드라인이 낙관도(중립 제외, 59%)이고 아래 막대는 중립 포함
                      구성(낙관 32%)이라, 한 카드에서 '낙관'이 두 숫자로 나와 어느 쪽이 진짜인지
                      알 수 없었다. 이제 비관:낙관 한 기준으로만 말하고, 막대는 그 비율을 그림으로
                      반복한다(숫자와 그림이 어긋날 수가 없다). 중립은 얼마나 뺐는지만 각주로. */}
                  {/* 큰 숫자는 낙관 쪽 한 값이다(예전엔 35:65 두 값이었다). 비관은 바로
                      아래 막대가 자기 라벨로 말하므로, 여기서 한 번 더 말하면 "어느 쪽이
                      이 카드의 답인가"가 흐려진다. 100−score 는 지금도 막대와 라벨이 쓴다 —
                      한 값에서 나오니 둘이 어긋날 수가 없는 건 그대로다. */}
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                    <span style={{ fontFamily: MONO, fontSize: 44, fontWeight: 700, lineHeight: 1, letterSpacing: "-0.035em", color: C.hot }}>
                      {sentiment.score}
                      <span style={{ fontSize: 22 }}>%</span>
                    </span>
                    {/* 유저가 실제로 가져가는 답은 이 라벨이다 — 색도 여기가 tone을 쓴다. */}
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: 14,
                        fontWeight: 700,
                        color: sentiment.tone === "hot" ? C.hot : sentiment.tone === "cold" ? C.cold : C.sub,
                      }}
                    >
                      {sentiment.label}
                      {/* 계산 기준 도움말 — 헤더에서 이 라벨 옆으로 옮겼다(무엇을 잰 수치인지 바로 옆에서 설명). */}
                      {/* 안쪽(왼쪽)으로 열게 고정 — 이 라벨은 숫자 폭에 따라 자리가 움직여서,
                          좁은 화면에선 가운데 정렬 툴팁이 카드 밖으로 삐져나갔다. */}
                      <span
                        className="hz-tip hz-tip-wide hz-tip-end"
                        data-tip="메시지를 비관/중립/낙관으로 나눈 뒤, 중립을 뺀 비관↔낙관 비율입니다. 시황·공시 같은 담담한 글이 절반이라, 같이 세면 늘 비관으로 기웁니다."
                        data-ga-tip="sentiment_ratio"
                        style={{ display: "inline-flex", cursor: "help" }}
                      >
                        <Icon name="help" style={{ fontSize: 13, color: C.muted }} />
                      </span>
                    </span>
                  </div>
                  {/* 두 라벨을 막대의 양 끝에 붙여 어느 쪽이 어느 색인지 위치로 바로 읽히게 한다.
                      숫자도 여기 붙는다 — 큰 숫자가 낙관 한 값만 말하게 되면서 비관 값이
                      갈 곳이 이 라벨뿐이다.
                      ⚠️ 목업은 이 숫자를 **막대 안**에 흰 글씨로 넣는다. 그러려면 채움색을
                      바꿔야 한다 — 목업의 막대는 진한 파랑(#1b6fb8)과 연한 주황(#f5b451)이라
                      글자가 읽히지만, 우리 강조색 위에 얹으면 명암비가 2.9(흰 글씨/저온)·
                      2.2(어두운 글씨/고온)로 둘 다 못 읽는다. 채움색을 바꾸면 이 막대만
                      페이지의 다른 온도 막대와 색이 갈리므로, 숫자를 밖으로 뺐다. */}
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, fontWeight: 700, margin: "12px 0 7px" }}>
                    <span style={{ color: C.cold }}>
                      비관 <span style={{ fontFamily: MONO }}>{100 - sentiment.score}</span>
                    </span>
                    <span style={{ color: C.hot }}>
                      낙관 <span style={{ fontFamily: MONO }}>{sentiment.score}</span>
                    </span>
                  </div>
                  {/* 반반(50%) 자리에 기준선을 세워 봤다가 걷어냈다. 색이 갈리는 자리(35%)와
                      눈금 자리(50%)가 한 막대에 나란히 생기니, 어느 쪽이 데이터의 경계인지
                      알 수 없는 흰 줄로만 보였다. 기울기는 라벨의 숫자와 색 면적이 이미 말한다. */}
                  <div style={{ display: "flex", height: 18, borderRadius: 999, overflow: "hidden" }}>
                    <div style={{ width: `${100 - sentiment.score}%`, background: C.cold }} />
                    <div style={{ width: `${sentiment.score}%`, background: C.hot }} />
                  </div>
                  {/* 각주 두 개를 칩으로. 한 문장으로 흘려 두면 "총 9,101건 중 46%는 중립이라
                      빼고 계산했습니다"가 막대 밑에서 세 번째 문단처럼 읽혀, 정작 위의 숫자보다
                      길었다. 값 둘을 따로 세워 두면 눈이 필요할 때만 집는다. */}
                  {/* ⚠️ Pill 안은 **한 덩어리**로 넘긴다. Pill 은 inline-flex + gap:3 이라
                      "분석 " / 숫자 / "건" 을 따로 넣으면 낱말 사이마다 3px 이 끼어
                      "분석 9,101 건" 처럼 단위가 떨어져 나온다. */}
                  <div style={{ marginTop: 11, display: "flex", flexWrap: "wrap", gap: 7 }}>
                    <Pill>
                      <span>
                        분석 <b style={{ fontFamily: MONO, fontWeight: 700 }}>{sentiment.messageCount.toLocaleString("ko-KR")}</b>건
                      </span>
                    </Pill>
                    <Pill>
                      <span>
                        중립 <b style={{ fontFamily: MONO, fontWeight: 700 }}>{sentiment.neutral}</b>% 제외
                      </span>
                    </Pill>
                  </div>
                </div>

                {sentiment.byTheme.length > 0 && (
                  <div style={{ flex: "1 1 250px", minWidth: 235, display: "flex", flexDirection: "column", gap: 9 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: C.muted }}>
                      {/* 중립을 뺀 기준이라는 설명은 왼쪽 종합 막대 각주에 이미 있다 —
                          같은 카드 안에서 두 번 말할 필요는 없다. */}
                      인기 테마별 비관 ↔ 낙관
                    </div>
                    {sentiment.byTheme.map((t) => (
                      <div
                        key={t.name}
                        className="hz-tip hz-tip-wide"
                        data-tip={`${t.name} 언급 ${t.total}건 중 비관 ${t.negative}건 · 낙관 ${t.positive}건 (중립 제외 비율)`}
                        // 이름 | 막대 | 비율을 그리드로 고정한다. flex 로 두면 테마명 길이에
                        // 따라 막대 시작점이 행마다 어긋나 눈이 세로로 훑질 못한다.
                        // 실제 테마명은 '지주·밸류업'·'인터넷·플랫폼'처럼 길어 70px 는 있어야 한다.
                        style={{ display: "grid", gridTemplateColumns: "70px minmax(0,1fr) 54px", alignItems: "center", gap: 9 }}
                      >
                        <span style={{ ...clip, fontSize: 11.5, fontWeight: 600, color: C.ink }}>{t.name}</span>
                        {/* 비관(왼쪽)과 낙관(오른쪽)을 한 바에 나눠 담아 비율이 바로 보이게.
                            순서는 시장 브리핑 감성 카드와 맞춘 '비관 : 낙관'이다. */}
                        <span style={{ display: "flex", height: 7, borderRadius: 999, overflow: "hidden" }}>
                          <span style={{ width: `${100 - t.pos}%`, background: C.cold }} />
                          <span style={{ width: `${t.pos}%`, background: C.hot }} />
                        </span>
                        <span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 600, textAlign: "right", whiteSpace: "nowrap" }}>
                          <span style={{ color: C.cold }}>{100 - t.pos}</span>
                          <span style={{ color: C.faint }}>:</span>
                          <span style={{ color: C.hot }}>{t.pos}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* AI 총평 — 카드 **맨 아래**다. 예전엔 맨 위에 있어서, 이 카드에 들어온
                  눈이 숫자(65%)보다 네 줄짜리 산문을 먼저 만났다. 지표 카드의 답은 숫자고
                  총평은 그 뒤에 붙는 해설이라 순서를 뒤집었다.
                  테두리를 떼고 --c-soft 로 판다 — 위의 막대·칩과 한 카드 안에서 층이
                  갈려야 "여기부터는 글"이 눈에 잡힌다.
                  아이콘을 글 흐름에 끼우지 않고 제 칸에 세우는 건 그대로다. 인라인이면
                  둘째 줄부터 아이콘 아래로 파고들어 첫 줄만 들여쓴 것처럼 보였다. */}
              {sentiment.summary && (
                <div
                  style={{
                    display: "flex",
                    gap: 11,
                    marginTop: 18,
                    background: C.soft,
                    borderRadius: "var(--r-tile)",
                    padding: "14px 16px",
                  }}
                >
                  <AiMark size={15} style={{ flexShrink: 0, marginTop: 4 }} />
                  {/* 높이를 안 잡는다 — 글이 3줄이면 3줄, 4줄이면 4줄로 흐른다.
                      옆 카드와 높이를 맞추는 건 그리드 몫이다(SUMMARY_LINE_HEIGHT 주석 참고). */}
                  <p
                    style={{
                      margin: 0,
                      fontSize: 12.5,
                      lineHeight: SUMMARY_LINE_HEIGHT,
                      color: "var(--c-ink-soft)",
                      wordBreak: "keep-all",
                    }}
                  >
                    {sentiment.summary}
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* ② 급부상 종목 (전체폭) */}
        <div className="hz-c4" style={cardStyle}>
          <SectionHead
            icon="local_fire_department"
            title="급부상 종목"
            note="최근 3일 vs 평소"
            desc="평소보다 언급이 갑자기 뛴 종목"
          />
          {surging.length === 0 ? (
            <p style={{ margin: 0, color: C.sub, fontSize: 13 }}>아직 급부상 신호가 뚜렷한 종목이 없습니다. 데이터가 쌓일수록 또렷해집니다.</p>
          ) : (
            // 그리드가 아니라 flex-wrap 이다. 종목이 다섯(소수)이라 그리드로는 어떤 칸수를
            // 잡아도 한 칸이 빈다 — auto-fill 은 최대 폭(카드 안쪽 1130px)에서 168px 칸을
            // 여섯 개 만들어 오른쪽 한 칸을 통째로 비웠고, auto-fit 으로 그건 접었지만
            // 2열 브레이크포인트(칸 폭 650px)에선 3+2 로 접혀 둘째 줄 오른쪽이 또 비었다.
            // flex 는 각 줄에 놓인 타일이 그 줄의 남는 폭을 나눠 가지므로 어느 폭에서도
            // 줄이 꽉 찬다(줄마다 타일 폭이 달라지는 건 감수한다).
            // 기준폭 168px 은 "좁은 화면에서도 다섯이 한 줄"에서 거꾸로 나온 값이다.
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              {surging.map((s, i) => (
                <div key={s.code} style={{ ...subCard, flex: "1 1 168px", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                  {/* 1) 순위 + 종목 — 이름 + 코드 */}
                  {/* 급부상 종목에는 로고를 넣지 않는다 — 타일이 다섯 개 나란히 서면
                      정작 봐야 할 '평소 대비 몇 배'보다 로고가 먼저 눈에 든다.
                      순위 배지를 앞에 세운 건 타일이 줄바꿈으로 흩어지기 때문이다. flex-wrap
                      이라 폭에 따라 3+2·2+3 으로 접히는데, 배지가 없으면 둘째 줄 첫 타일이
                      1위처럼 보인다(그리드처럼 자리가 순위를 말해 주지 않는다). */}
                  <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                    <span
                      style={{
                        flexShrink: 0,
                        fontFamily: MONO,
                        fontSize: 10,
                        fontWeight: 700,
                        color: C.blue,
                        background: "var(--c-blue-tint)",
                        borderRadius: 6,
                        padding: "2px 6px",
                      }}
                    >
                      {i + 1}
                    </span>
                    <span style={{ ...clip, flex: 1, fontWeight: 700, fontSize: 13, color: C.ink }}>{s.name}</span>
                    {/* 종목 코드는 눈에서 흘려보내는 장식이 아니라 읽고 확인하는 값이라
                        faint 가 아니라 한 단계 진한 muted 를 쓴다(10px 이라 더 그렇다). */}
                    <span style={{ fontFamily: MONO, fontSize: 10, color: C.muted, flexShrink: 0 }}>{s.code}</span>
                  </div>

                  {/* 2) 이 카드의 주인공 — 배수. 예전엔 가격이 16px 로 맨 위에 서고 배수는
                      그 아래 작은 알약이었는데, 카드 제목이 "평소보다 언급이 갑자기 뛴 종목"
                      이라 주어와 화면이 어긋나 있었다. 이제 배수가 히어로다.
                      색은 고온(hot) 이다 — 목업은 파랑을 쓰지만, 이 페이지의 다른 '증가'
                      표시(이슈 키워드 ▲, 테마 유입)가 전부 고온색이라 혼자 파랑이면
                      "늘었다"가 아니라 "다른 종류"로 읽힌다. */}
                  <div style={{ display: "flex", alignItems: "baseline", gap: 5, minWidth: 0 }}>
                    {s.isNew ? (
                      <strong style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.1, color: C.blue }}>
                        신규 등장
                      </strong>
                    ) : (
                      <>
                        <strong
                          style={{
                            fontFamily: MONO,
                            fontSize: 30,
                            fontWeight: 700,
                            letterSpacing: "-0.04em",
                            lineHeight: 1,
                            color: C.hot,
                          }}
                        >
                          ×{s.ratio.toFixed(1)}
                        </strong>
                        <span style={{ fontSize: 11, color: C.sub2 }}>평소 대비</span>
                      </>
                    )}
                  </div>

                  {/* 3) 언급 추이 — 목업은 여기에 '평소 9.8회 / 지금 50회' 두 막대를 뒀다.
                      그 두 값은 우리 데이터로 못 만든다: 위 배수는 언급 **횟수**가 아니라
                      그날 전체 대비 **몫(share)** 을 평활해 낸 값이다(getSurgingStocks 주석 —
                      주말엔 전체 언급량이 평일의 1/10 이라 횟수로 재면 모두 '감소'가 된다).
                      횟수로 두 막대를 그리면 그 비가 위 배수와 안 맞아, 한 타일에서 눈금이
                      둘로 갈린다. 대신 실제 일별 언급수를 그대로 그린다 — "평소 납작하다가
                      최근에 솟았다"는 이 카드가 하려던 말을 거짓 없이 한다. */}
                  <div>
                    <span
                      className="hz-tip hz-tip-wide"
                      data-tip={`최근 ${s.series.length}일 일별 언급수입니다. 위 배수는 횟수가 아니라 그날 전체 대비 몫으로 잰 값이라, 이 막대의 비와는 다릅니다.`}
                      style={{ display: "block" }}
                    >
                      <Sparkline data={s.series} fluid height={22} />
                    </span>
                    <div style={{ marginTop: 7, fontSize: 10.5, fontFamily: MONO, color: C.faint }}>
                      {s.recentMentions}회 언급 · {s.channelCount}개 채널
                    </div>
                  </div>

                  {/* 4) 시세 — 카드의 주어가 아니므로 구분선 아래 밑줄로 내린다.
                      좁은 타일에서 일곱 자리 가격("1,759,000원")이 등락률과 한 줄에 안 들어가
                      줄이 갈리므로, 등락률은 아예 아랫줄에 고정한다(타일마다 줄 수가 달라지지
                      않는다). 야후 실시간이 아니면(isLive=false, KRX 저장 종가 폴백) 그 아랫줄을
                      등락률 대신 기준일로 바꿔 단다 — 치환이라 줄 수는 그대로다. 왜 등락률을
                      버리는지는 QuoteDate 주석 참고.
                      MDD 링크는 그 아래 오른쪽 — 가격을 누르러 온 눈이 그대로 이어진다.

                      ⚠️ 가격과 MDD 링크를 **한 줄에 나란히 두지 않는다.** 목업은 그렇게
                      그렸지만 목업의 링크는 "MDD ↗" 두 글자다. 우리 라벨("MDD 정밀분석 ↗",
                      ~90px)과 일곱 자리 가격("1,181,000원", ~85px)은 타일 안쪽 폭(좁을 때
                      136px)에 절대 같이 못 들어간다 — 실제로 "145,600" / "원" 으로 갈라져
                      수치가 아니라 오류처럼 보였다. 줄바꿈에 맡기면 그 타일만 밑줄이
                      높아져 다섯 개의 구분선이 어긋난다. 줄 수를 못박아 다섯이 같은 높이로
                      서게 한다. */}
                  <div style={{ marginTop: "auto", paddingTop: 11, borderTop: `1px solid var(--c-divider-strong)` }}>
                    {s.closePrice != null ? (
                      <>
                        <div
                          style={{
                            fontFamily: MONO,
                            fontSize: 13,
                            fontWeight: 700,
                            color: C.label,
                            letterSpacing: "-0.02em",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {s.closePrice.toLocaleString("ko-KR")}원
                        </div>
                        {s.isLive ? (
                          <ChangeRate rate={s.changeRate} style={quoteSubLine} />
                        ) : (
                          <QuoteDate date={s.priceDate} style={quoteSubLine} />
                        )}
                      </>
                    ) : (
                      <span style={{ display: "block", fontSize: 11.5, color: C.muted }}>가격 정보 준비 중</span>
                    )}
                    <div style={{ marginTop: 7, textAlign: "right" }}>
                      <MddLink code={s.code} market={s.market} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ⑥ 트렌딩 메시지 (전체폭) — 종목/주제 태그 포함 */}
        <div className="hz-c4" style={cardStyle}>
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
        </div>

        {/* ④ 테마 로테이션 (½).
            아래 목록에 flex:1 + space-between 을 건다. 같은 줄의 두 카드는 그리드가
            높이를 맞추는데, 키를 정하는 건 옆의 주요 종목 리포트(요약문 길이에 따라
            들쭉날쭉하다)라 이 카드는 바닥이 남는 날이 생긴다. 그때 열 줄의 간격이
            남는 만큼 벌어져 카드를 채운다(gap 은 최소값으로 남는다). */}
        <div className="hz-c2" style={{ ...cardStyle, display: "flex", flexDirection: "column" }}>
          <SectionHead
            icon="donut_small"
            title="테마 로테이션"
            note="최근 3일 vs 이전"
            desc="관심이 어느 테마로 옮겨가는지 · 점유율 변화 기준"
            noteHelp="최근 3일 평균 점유율을 그 이전과 비교합니다. 하루치끼리 재면 표본 얇은 날에 크게 요동쳐서, 며칠씩 묶어서 봅니다."
          />
          {themes.length === 0 ? (
            <p style={{ margin: 0, color: C.sub, fontSize: 13 }}>아직 집계된 테마가 없습니다.</p>
          ) : (
            (() => {
              /* 이 카드의 질문은 "어느 테마가 큰가"가 아니라 "관심이 어디로 옮겨갔나"다.
                 예전엔 점유율 순으로 한 줄씩 열 개를 세워 두고 변화폭은 줄 끝에 작게 적었는데,
                 그건 앞의 질문에 답하는 배치였다. 이제 **변화폭으로 갈라 두 묶음**으로 세운다.

                 문턱 0.1%p 아래는 방향을 짓지 않는다. 소수 첫째 자리까지만 보여 주므로
                 그보다 작은 움직임은 화면에서 "0.0%p" 로 보이는데, 그걸 유입/이탈로 갈라
                 놓으면 같은 0.0 이 양쪽에 나뉘어 앉는다. 비교할 과거가 없는 것(null)도 같다.
                 ⚠️ 이 문턱은 예전 줄 끝 표시가 쓰던 값과 같아야 한다 — 한쪽만 고치면
                 "▲가 안 붙었는데 유입 묶음에 있는 줄"이 생긴다. */
              const DEAD_ZONE = 0.1;
              const dirOf = (t: (typeof themes)[number]) =>
                t.shareDelta === null || Math.abs(t.shareDelta) < DEAD_ZONE ? 0 : t.shareDelta > 0 ? 1 : -1;

              const inflow = themes.filter((t) => dirOf(t) > 0).sort((a, b) => (b.shareDelta ?? 0) - (a.shareDelta ?? 0));
              const outflow = themes.filter((t) => dirOf(t) < 0).sort((a, b) => (a.shareDelta ?? 0) - (b.shareDelta ?? 0));
              /* 목업엔 없는 셋째 묶음이다. 없으면 문턱에 걸린 테마가 카드에서 통째로
                 사라진다 — 열 개를 세어 보여 주겠다고 해 놓고 여덟 개만 보여주는 꼴이다. */
              const flat = themes.filter((t) => dirOf(t) === 0);

              /* 막대 길이는 **변화폭**이다(예전엔 점유율이었다). 가장 크게 움직인 테마를
                 가득 찬 것으로 두고 그에 견준다 — 유입·이탈 양쪽을 한 자에 재야 "반도체가
                 들어온 만큼 자동차가 빠졌나"를 길이로 견줄 수 있다. 점유율 절대값은
                 옆 칸에 숫자로 그대로 적는다. */
              const maxAbs = Math.max(DEAD_ZONE, ...themes.map((t) => Math.abs(t.shareDelta ?? 0)));

              /* 펼침 목록의 방향은 **카드 안에서 몇 번째 줄인지**로 정한다. 묶음마다 새로
                 세면 이탈 묶음 첫 줄이 "위쪽 줄"로 잡혀 아래로 열리고, 그게 카드 밖으로
                 나가 다음 카드를 덮는다. 그래서 화면에 그려지는 순서로 번호를 매겨 둔다. */
              const drawOrder = [...inflow, ...outflow, ...flat];
              const rowIndexOf = (t: (typeof themes)[number]) => drawOrder.indexOf(t);

              /* 다섯 칸을 머리줄과 각 줄이 똑같이 나눠 써야 세로로 훑힌다. 값이 아니라
                 이름으로 한 번만 정해 둔다 — 두 곳에 따로 적으면 반드시 어긋난다.

                 이름과 막대를 **둘 다 fr** 로 두고 비율(1 : 1.3)로 나눈다. 처음엔 이름을
                 minmax(0,104px) 로 못박고 막대에 1fr 을 줬는데, 그러면 남는 폭을 이름이
                 먼저 다 가져가서 폰(375px)에서 막대가 하한 30px 까지 눌렸다 — 길이를
                 견주라고 그린 막대가 점이 됐다. 비율로 나누면 좁아질 때 둘이 같이 줄어든다.
                 숫자 칸 셋은 고정이다(자릿수가 정해져 있어 줄일 여지가 없다). */
              const GRID = "minmax(0,1fr) 42px minmax(0,1.3fr) 46px 38px";

              const Row = ({ t }: { t: (typeof themes)[number] }) => {
                const dir = dirOf(t);
                const delta = t.shareDelta ?? 0;
                // 흰 바탕 위 글자·면이라 강조색을 그대로 쓴다(tint 위가 아니다 —
                // --c-hot-ink 계열은 tint 배경 전용이다. globals.css 의 그 주석 참고).
                const fill = dir > 0 ? C.hot : dir < 0 ? "var(--c-blue-3)" : C.bar;
                const tone = dir > 0 ? C.hot : dir < 0 ? C.cold : C.muted;
                const i = rowIndexOf(t);
                return (
                  <div
                    className="hz-theme-row"
                    /* 마우스가 없어도(키보드·터치) 종목 목록을 열 수 있게 초점을 받는다.
                       언급된 종목이 없는 테마는 열 것도 없으니 초점도 주지 않는다. */
                    tabIndex={t.stocks.length ? 0 : undefined}
                    aria-label={t.stocks.length ? `${t.theme} 테마를 이룬 종목 ${t.stockCount}개 보기` : undefined}
                    style={{ display: "grid", gridTemplateColumns: GRID, alignItems: "center", gap: 10 }}
                  >
                    {/* 좁은 화면에선 이 칸이 60px 까지 줄어 이름이 잘린다. title 을 달아
                        마우스로는 전체가 보이게 한다(펼침 목록은 테마명을 안 적는다). */}
                    <span style={{ ...clip, fontSize: 12.5, fontWeight: 700, color: C.ink }} title={t.theme}>
                      {t.theme}
                    </span>
                    <span style={{ fontFamily: MONO, fontSize: 10.5, color: C.faint, textAlign: "right" }}>
                      {t.sharePct.toFixed(1)}%
                    </span>
                    <span style={{ height: 9, background: C.track, borderRadius: 999, overflow: "hidden", display: "block" }}>
                      {/* 최소 2% — 문턱에 걸린 줄도 트랙만 남지 않게 흔적은 남긴다. */}
                      <span
                        style={{
                          display: "block",
                          width: `${Math.max(2, Math.min(100, (Math.abs(delta) / maxAbs) * 100))}%`,
                          height: "100%",
                          background: fill,
                          borderRadius: 999,
                        }}
                      />
                    </span>
                    <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 700, color: tone, textAlign: "right", whiteSpace: "nowrap" }}>
                      {dir === 0 ? "—" : `${dir > 0 ? "+" : "−"}${Math.abs(delta).toFixed(1)}%p`}
                    </span>
                    {/* 순위 변동은 있을 때만. RankDelta 가 0·null 이면 아무것도 안 그리므로
                        칸이 비는데, 그 자리에 —를 놓아 다섯 칸의 오른쪽 끝을 고정한다. */}
                    <span style={{ textAlign: "right", fontSize: 9.5 }}>
                      {t.rankChange ? <RankDelta change={t.rankChange} /> : <span style={{ color: C.hint }}>—</span>}
                    </span>

                    {/* 이 테마의 점유율을 만든 종목 목록. 줄에 마우스를 올리거나 초점이
                        가면 열린다(CSS 만, globals.css 의 .hz-theme-pop).
                        아래쪽 줄은 위로 펼친다 — 아래로 열면 카드를 벗어나 다음 카드를 덮는다.
                        언급 횟수는 이 머리줄로 옮겨 왔다 — 줄이 다섯 칸이 되면서 본문에
                        "종목 6개 · 134회"를 놓을 자리가 없어졌는데, 버리지는 않는다. */}
                    {t.stocks.length > 0 && (
                      <div className={`hz-theme-pop${i >= drawOrder.length - 4 ? " hz-theme-pop-up" : ""}`}>
                        <div className="hz-theme-pop-head">
                          최근 3일 {t.mentions}회 · {t.stockCount}종목 · 주목도순
                        </div>
                        {t.stocks.map((s) => (
                          <Link key={s.code} href={mddHref(s.code, s.market)} className="hz-theme-pop-item">
                            <span className="hz-theme-pop-name">{s.name}</span>
                            <span className="hz-theme-pop-cnt">{s.mentions}회</span>
                            {/* Icon 은 클래스를 받지 않으니 한 겹 싼다 — 화살표는 그 줄에
                                마우스를 올렸을 때만 드러난다(칸은 늘 잡혀 있다). */}
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

              const Group = ({
                rows,
                label,
                hint,
                tint,
                ink,
              }: {
                rows: typeof themes;
                label: string;
                hint: string;
                tint: string;
                ink: string;
              }) =>
                rows.length === 0 ? null : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: ink,
                          background: tint,
                          borderRadius: "var(--r-pill)",
                          padding: "4px 10px",
                        }}
                      >
                        {label}
                      </span>
                      <span style={{ fontSize: 10.5, color: C.faint }}>{hint}</span>
                    </div>
                    {rows.map((t) => (
                      <Row key={t.theme} t={t} />
                    ))}
                  </div>
                );

              /* 요약 한 쌍 — 카드를 다 읽지 않아도 답이 나오게. 한쪽이 비면(그날 전부
                 유입이거나 전부 이탈이면) 그 자리는 그리지 않는다. */
              const lead = inflow[0];
              const lag = outflow[0];

              return (
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 18 }}>
                  {(lead || lag) && (
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                      {lead && (
                        <div
                          style={{
                            flex: "1 1 150px",
                            minWidth: 140,
                            background: "var(--c-hot-tint)",
                            borderRadius: "var(--r-tile)",
                            padding: "14px 16px",
                            display: "flex",
                            flexDirection: "column",
                            gap: 4,
                          }}
                        >
                          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--c-hot-ink)" }}>가장 많이 유입</span>
                          <div style={{ display: "flex", alignItems: "baseline", gap: 7, minWidth: 0 }}>
                            <strong style={{ ...clip, fontSize: 16, fontWeight: 800, color: C.ink }}>{lead.theme}</strong>
                            <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: "var(--c-hot-ink)", whiteSpace: "nowrap" }}>
                              ▲{(lead.shareDelta ?? 0).toFixed(1)}%p
                            </span>
                          </div>
                          <span style={{ fontSize: 10.5, color: "var(--c-hot-ink)" }}>
                            점유율 {lead.sharePct.toFixed(1)}% · 전체 {lead.rank}위
                          </span>
                        </div>
                      )}
                      {lag && (
                        <div
                          style={{
                            flex: "1 1 150px",
                            minWidth: 140,
                            background: "var(--c-cold-tint)",
                            borderRadius: "var(--r-tile)",
                            padding: "14px 16px",
                            display: "flex",
                            flexDirection: "column",
                            gap: 4,
                          }}
                        >
                          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--c-cold-ink)" }}>가장 많이 이탈</span>
                          <div style={{ display: "flex", alignItems: "baseline", gap: 7, minWidth: 0 }}>
                            <strong style={{ ...clip, fontSize: 16, fontWeight: 800, color: C.ink }}>{lag.theme}</strong>
                            <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: "var(--c-cold-ink)", whiteSpace: "nowrap" }}>
                              ▼{Math.abs(lag.shareDelta ?? 0).toFixed(1)}%p
                            </span>
                          </div>
                          {/* 순위까지 밀렸으면 그게 더 센 사실이라 먼저 말한다. 안 밀렸으면
                              점유율로 갈음한다 — 없는 변동을 지어내지 않는다. */}
                          <span style={{ fontSize: 10.5, color: "var(--c-cold-ink)" }}>
                            {lag.rankChange && lag.rankChange < 0
                              ? `순위도 ${Math.abs(lag.rankChange)}계단 하락`
                              : `점유율 ${lag.sharePct.toFixed(1)}% · 전체 ${lag.rank}위`}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 머리줄. 다섯 칸이 무슨 값인지 한 번만 적어 두면 아래 열 줄에서
                      숫자마다 단위를 반복하지 않아도 된다. */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: GRID,
                      gap: 10,
                      fontSize: 10,
                      fontWeight: 700,
                      color: C.hint,
                    }}
                  >
                    <span>테마</span>
                    <span style={{ textAlign: "right" }}>점유율</span>
                    <span>변화폭</span>
                    <span style={{ textAlign: "right" }}>증감</span>
                    <span style={{ textAlign: "right" }}>순위</span>
                  </div>

                  {/* 남는 자리는 묶음 사이에 나눠 준다 — 옆 카드(주요 종목 리포트)가 요약문
                      길이에 따라 키를 정해서, 이 카드는 바닥이 남는 날이 생긴다. */}
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 18, justifyContent: "space-between" }}>
                    <Group rows={inflow} label="유입" hint="관심이 들어온 테마" tint="var(--c-hot-tint)" ink="var(--c-hot-ink)" />
                    <Group rows={outflow} label="이탈" hint="관심이 빠져나간 테마" tint="var(--c-cold-tint)" ink="var(--c-cold-ink)" />
                    <Group rows={flat} label="그대로" hint="0.1%p 미만이라 방향을 안 지음" tint="var(--c-chip)" ink="var(--c-sub)" />
                  </div>
                </div>
              );
            })()
          )}
        </div>

        {/* ⑤ 주요 종목 리포트 (½) — 3종목 상세 */}
        <div className="hz-c2" style={{ ...cardStyle, display: "flex", flexDirection: "column" }}>
          <SectionHead
            icon="query_stats"
            title="주요 종목 리포트"
            note={`최근 ${KADERA_WINDOW_DAYS}일 · 상위 3종목`}
            desc="가장 많이 회자된 종목의 추이와 흐름"
          />
          {stockReports.length === 0 ? (
            <p style={{ margin: 0, color: C.sub, fontSize: 13 }}>아직 리포트를 만들 종목이 없습니다.</p>
          ) : (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12, justifyContent: "space-between" }}>
              {stockReports.map((r) => {
                const max = Math.max(1, ...r.series.map((s) => s.mentions));
                return (
                  <div key={r.code} style={{ ...subCard, padding: 16 }}>
                    {/* 폰에서는 시세가 다음 줄로 내려간다(globals.css 의 .hz-stock-head).
                        한 줄에 다 넣으면 시세 묶음이 nowrap 이라 안 줄고, 줄어들 수 있는 건
                        종목명뿐이라 이름이 먼저 0 으로 눌려 사라졌다. marginLeft:auto 를
                        인라인이 아니라 클래스로 옮긴 이유는, 인라인이면 미디어쿼리에서
                        그걸 풀 수 없어서다. */}
                    <div className="hz-stock-head" style={{ display: "flex", alignItems: "center", gap: 9 }}>
                      <StockLogo code={r.code} name={r.name} market={r.market} size={26} />
                      <span style={{ ...clip, fontSize: 18, fontWeight: 700, color: C.ink }}>{r.name}</span>
                      <span style={{ fontFamily: MONO, fontSize: 11, color: C.muted }}>{r.code}</span>
                      {r.price != null && (
                        <span className="hz-stock-price" style={{ display: "flex", alignItems: "baseline", gap: 5, whiteSpace: "nowrap" }}>
                          <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color: C.ink, letterSpacing: "-0.02em" }}>
                            {r.price.toLocaleString("ko-KR")}원
                          </span>
                          <ChangeRate rate={r.changeRate} style={{ fontSize: 11 }} />
                        </span>
                      )}
                    </div>
                    {/* 언급 추이 — 막대를 바닥선 위에 세운다. 진한 칸이 곧 카드 수치에 들어간
                        최근 3일이고 앞쪽 옅은 칸은 배경 맥락이다. 마우스를 올리면 그 날로 강조가
                        옮겨간다(진하기·날짜색 규칙은 globals.css 의 .hz-bars). */}
                    <div className="hz-bars" style={{ display: "flex", alignItems: "flex-end", gap: 4, margin: "14px 0 12px", borderBottom: `1px solid ${C.line}` }}>
                      {r.series.map((d) => (
                        <div
                          key={d.date}
                          className="hz-tip hz-bar-col"
                          data-tip={`${shortDate(d.date)} · ${d.mentions}회`}
                          // 커서는 기본 그대로 둔다 — 도움말(?)이 아니라 값을 짚어 보는 차트다.
                          style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 5, minWidth: 0 }}
                        >
                          {/* 집계 창 밖(앞쪽 칸)은 배경 맥락이라 옅게 — 막대는 7일치인데
                              아래 '언급 N회'는 최근 3일치라, 어디까지가 그 숫자인지 눈으로
                              짚을 수 있어야 한다(globals.css 의 .hz-bar-ctx). */}
                          <div
                            className={`hz-bar${d.scored ? "" : " hz-bar-ctx"}`}
                            style={{
                              width: "100%",
                              height: `${Math.max(3, (d.mentions / max) * 40)}px`,
                              background: C.blue,
                              borderRadius: "4px 4px 0 0",
                            }}
                          />
                          <span className="hz-bar-date" style={{ fontSize: 9.5, fontFamily: MONO, color: C.faint, paddingBottom: 5 }}>
                            {shortDate(d.date)}
                          </span>
                        </div>
                      ))}
                    </div>
                    {narratives[r.code] && (
                      <div style={{ display: "flex", gap: 8, margin: "0 0 12px", background: C.track, borderRadius: 11, padding: "10px 12px" }}>
                        <AiMark size={13} style={{ flexShrink: 0, marginTop: 3 }} />
                        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: "var(--c-ink-soft)", wordBreak: "keep-all" }}>
                          {narratives[r.code]}
                        </p>
                      </div>
                    )}
                    {/* 언급/채널은 하단 좌측, MDD 링크는 하단 우측에 은근히 같은 줄로. */}
                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, fontSize: 11, fontFamily: MONO, color: C.muted }}>
                      <span>언급 {r.totalMentions}회 · {r.channelCount}개 채널</span>
                      <MddLink code={r.code} market={r.market} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ③ 채널 파워 랭킹 (½) */}
        <div className="hz-c2" style={{ ...cardStyle, display: "flex", flexDirection: "column" }}>
          {/* ▲▼ 배지가 며칠을 견주는지는 noteHelp 한 줄로만 밝힌다. 제목 옆에 "3일 기준"
              알약을 하나 더 붙이면, 옆 카드인 "뜨는 채널"("최근 7일")과 나란히 놓여
              카드마다 기간 딱지가 늘어선 줄로 보인다. 일수는 lib/telegram-data.ts 의
              RANK_COMPARE_DAYS 와 맞춰야 한다. */}
          <SectionHead
            icon="military_tech"
            title="채널 파워 랭킹"
            note="영향력 점수"
            desc="조회율·확산력까지 반영한 채널 영향력"
            noteHelp="조회율·포워드율·구독자 규모·게시 빈도를 합쳐 52~100으로 낸 점수입니다. 구독자만 많고 안 읽히는 채널은 낮게 나옵니다. ▲▼ 는 3일 전 순위와 견준 것입니다."
          />
          {channels.length === 0 ? (
            <p style={{ margin: 0, color: C.sub, fontSize: 13 }}>아직 채널 점수가 없습니다.</p>
          ) : (
            // 목록이 남는 높이를 먹고 열 줄이 그 안에서 고르게 벌어진다("더 보기" 버튼은
            // 아래 그대로 붙는다). 이 줄 세 카드는 그리드가 높이를 맞추는데, 카드마다
            // 줄 높이가 달라 짧은 카드는 바닥이 비었다.
            <ExpandableList items={channelItems} name="channel_rank" initial={10} step={10} listStyle={{ flex: 1, justifyContent: "space-between" }} />
          )}
        </div>

        {/* ① 뜨는 채널 (¼) */}
        <div style={{ ...cardStyle, display: "flex", flexDirection: "column" }}>
          {/* 기간 표기는 옆 카드들과 "최근 7일"로 맞춘다. 구독자 스냅샷은 백필이 안 돼
              하루씩 쌓이므로 실제로 잰 구간이 그보다 짧은 날이 있다(getRisingChannels 의
              spanDays). 카드에 그 사정까지 적진 않는다. */}
          <SectionHead icon="rocket_launch" title="뜨는 채널" note="최근 7일" desc="최근 구독자가 많이 늘어난 채널" />
          {/* 이 카드는 ¼ 폭이라 한 줄에 [순위][아바타][이름][증감]을 다 넣으면 이름 쪽이
              먼저 굶는다 — 실제로 "요약하는…"·"타점 읽…"처럼 두세 글자만 남고 구독자 수는
              두 줄로 접혔다. 이름에 한 줄을 통째로 주고, 구독자와 증감은 아바타 아래
              둘째 줄에 나눠 놓는다(행 높이가 채널명 길이와 무관하게 일정해진다). */}
          <ol
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              flex: 1,
              display: "flex",
              flexDirection: "column",
              gap: 15,
              justifyContent: "space-between",
            }}
          >
            {rising.map((r, i) => {
              // 채널 수가 정원보다 적을 때 채워 넣은 빈 행 — 높이만 지키고 아무것도 안 그린다.
              // (이름 줄 + 구독자/증감 줄을 합친 높이라 아래 실제 행과 pitch가 같다.)
              if (r.isPlaceholder) {
                return <li key={`empty-${i}`} style={{ height: 36 }} aria-hidden />;
              }
              const body = (
                <>
                  <span style={{ ...rankNum, width: 14, fontSize: 11 }}>{i + 1}</span>
                  <Avatar photoUrl={r.photoUrl} title={r.title} size={26} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ ...clip, fontWeight: 600, fontSize: 13, color: C.ink }}>{r.title}</div>
                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 6, marginTop: 2 }}>
                      <span style={{ fontSize: 10.5, fontFamily: MONO, color: C.muted }}>구독자 {compact(r.subscriberCount)}</span>
                      {/* 정원을 채우느라 증감이 없거나 줄어든 채널까지 들어올 수 있어 부호를 그대로 쓴다 */}
                      <span
                        style={{
                          fontFamily: MONO,
                          fontSize: 11,
                          fontWeight: 700,
                          color: r.delta7d > 0 ? C.hot : r.delta7d < 0 ? C.cold : C.muted,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {r.delta7d > 0 ? "▲" : r.delta7d < 0 ? "▼" : ""}
                        {Math.abs(r.delta7d).toLocaleString("ko-KR")}명
                      </span>
                    </div>
                  </div>
                </>
              );
              // 핸들이 있는 채널만 링크로 감싼다.
              return (
                <li key={`${r.handle ?? r.title}-${i}`}>
                  {r.handle ? (
                    <a
                      href={`https://t.me/${r.handle}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hz-row-link"
                      data-ga="kadera_channel_click"
                      data-ga-channel={r.handle}
                      data-ga-surface="rising"
                      style={{ alignItems: "flex-start", gap: 8 }}
                    >
                      {body}
                    </a>
                  ) : (
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>{body}</div>
                  )}
                </li>
              );
            })}
          </ol>
        </div>

        {/* 이슈 키워드 (¼) — 종목이 아닌 화제어. analyze_telegram_messages.py 가 메시지별로
            뽑고 calculate_telegram_sentiment.py 가 telegram_keyword_daily 로 집계한 실데이터. */}
        <div style={{ ...cardStyle, display: "flex", flexDirection: "column" }}>
          <SectionHead icon="tag" title="이슈 키워드" note="최근 7일" desc="종목명이 아닌 화제어 · 언급 횟수 기준" />
          {keywords.length === 0 ? (
            <p style={{ margin: 0, color: C.sub, fontSize: 13 }}>아직 뽑을 화제어가 없습니다.</p>
          ) : (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
              {/* 1위는 목록에서 빼내 제 상자를 준다. 열 줄이 같은 굵기로 서 있으면 "이번 주에
                  뭐가 제일 회자됐나"라는 첫 질문에 눈이 한 번 더 훑어야 답한다.
                  상자 색은 고온 tint — 화제어 1위는 정의상 '가장 뜨거운 말'이다. 글자는
                  --c-hot-ink 로 눌러 얹는다(강조색 그대로면 자기 tint 위에서 안 읽힌다). */}
              {(() => {
                const top = keywords[0];
                const total = keywords.reduce((sum, k) => sum + k.count, 0);
                // "상위 N개 중 비중" — 화제어 전체가 아니라 이 카드에 실린 것들 안에서의
                // 몫이다. 라벨에 개수를 박아 둬야 분모를 오해하지 않는다.
                const sharePct = total > 0 ? Math.round((top.count / total) * 100) : 0;
                return (
                  <div
                    style={{
                      background: "var(--c-hot-tint)",
                      borderRadius: "var(--r-tile)",
                      padding: "14px 16px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                    }}
                  >
                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--c-hot-ink)" }}>이번 주 화제어 1위</span>
                    {/* 세로로 쌓는다 — 목업은 낱말과 비중을 좌우로 놨지만 그건 이 카드가
                        절반 폭일 때 이야기다. 우리 격자에서 이 카드는 ¼ 칸이라 큰 숫자
                        둘이 한 줄에 못 선다. */}
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                      <strong style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.03em", color: C.ink, wordBreak: "keep-all" }}>
                        {top.word}
                      </strong>
                      <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: "var(--c-hot-ink)", whiteSpace: "nowrap" }}>
                        {top.trend === "up" ? "▲" : top.trend === "down" ? "▼" : ""}
                        {top.count.toLocaleString("ko-KR")}회
                      </span>
                    </div>
                    <span style={{ fontSize: 10.5, color: "var(--c-hot-ink)" }}>
                      상위 {keywords.length}개 중 비중 <b style={{ fontFamily: MONO, fontWeight: 700 }}>{sharePct}%</b>
                    </span>
                  </div>
                );
              })()}

              {/* 2위부터. 줄은 두 층이다 — 낱말·횟수가 윗줄, 막대가 아랫줄.
                  목업은 [순위 낱말 막대 횟수]를 한 줄에 뒀는데, 그건 절반 폭 카드라 가능한
                  것이다. ¼ 칸(안쪽 ~230px)에서 그렇게 하면 막대 몫이 35px 밖에 안 남아
                  길이 차이가 안 보인다. 폭을 다 쓰는 아랫줄이 순위를 훨씬 잘 그린다. */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 15, justifyContent: "space-between" }}>
                {keywords.slice(1).map((k, i) => {
                  const max = keywords[0].count;
                  // 막대 색이 방향을 진다(아래 범례가 이 색을 설명한다). 비교할 과거가
                  // 없거나(null) 변화가 없으면(flat) 중립색 — 방향을 지어내지 않는다.
                  const barColor = k.trend === "up" ? C.hot : k.trend === "down" ? "var(--c-blue-3)" : C.bar;
                  return (
                    <div key={k.word} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                      <span style={{ ...rankNum, width: 14, fontSize: 11, paddingTop: 1 }}>{i + 2}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 6 }}>
                          <span style={{ ...clip, fontWeight: 600, fontSize: 13, color: C.ink }}>{k.word}</span>
                          {/* 비교할 과거가 아직 없으면 화살표를 숨긴다 — ▲▼ 아무거나 붙이면 거짓말이 된다 */}
                          {/* 화살표는 '관심 점유율이 움직였을 때'만 — 변화 없음(flat)과
                              비교할 과거가 없을 때(null)는 숫자만 둔다. 예전엔 boolean 이라
                              동률과 '최근 창에 안 나온 말'까지 ▲가 붙었다. */}
                          <span
                            style={{
                              fontFamily: MONO,
                              fontSize: 11,
                              fontWeight: 600,
                              color: k.trend === "up" ? C.hot : k.trend === "down" ? C.cold : C.muted,
                              flexShrink: 0,
                            }}
                          >
                            {k.trend === "up" ? "▲ " : k.trend === "down" ? "▼ " : ""}
                            {k.count}회
                          </span>
                        </div>
                        {/* 막대는 1위 대비. 화제어는 순위를 훑는 목록이라 굵기를 4px 로 줄이고
                            투명도를 낮춰, 눈이 막대가 아니라 단어를 먼저 잡게 한다. */}
                        <div style={{ marginTop: 6, height: 4, background: C.track, borderRadius: 999, overflow: "hidden" }}>
                          <div style={{ width: `${(k.count / max) * 100}%`, height: "100%", background: barColor, borderRadius: 999, opacity: 0.8 }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 막대에 색을 입혔으면 그 색이 무슨 뜻인지 적어야 한다. 예전엔 전부 파랑
                  한 색이라 설명할 것이 없었다.

                  ⚠️ 이 줄의 문구는 목업("지난주보다 증가")을 그대로 못 쓴다. 우리 trend 는
                  **지난주 대비가 아니고, 횟수 대비도 아니다** — 최근 3일 평균 *점유율* 을 그
                  이전과 견준 값이다(getIssueKeywords 주석: 주말엔 전체 메시지가 1/10 이라
                  횟수로 재면 모든 말이 일제히 ▼가 된다).
                  그래서 한 줄에 눈금이 둘이다 — **길이는 7일 언급 수, 색은 최근 3일 관심의
                  방향**. 둘을 다 적어 두지 않으면 긴 주황 막대가 "많이 언급됐고 그만큼
                  늘었다"로 읽힌다. */}
              <div
                style={{
                  paddingTop: 12,
                  borderTop: `1px solid var(--c-divider)`,
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  fontSize: 10.5,
                  color: C.muted,
                }}
              >
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 12px" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 3, background: C.hot }} />
                    최근 관심 늘어남
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 3, background: "var(--c-blue-3)" }} />
                    줄어듦
                  </span>
                </div>
                <span style={{ color: C.faint }}>막대 길이는 7일 언급 수입니다</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
