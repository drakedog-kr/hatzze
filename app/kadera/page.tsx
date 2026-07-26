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
} from "@/lib/telegram-data";
import type { TrendingMessage } from "@/lib/telegram-data";

import { formatKstUpdate, shortDate } from "@/lib/format";

import { pageMetadata } from "../seo";
import { C, Icon, MONO } from "../ui";
import { ExpandableList } from "./ExpandableList";
import { Avatar, Pill, RankDelta, Sparkline, card as cardStyle, rankNum, subCard } from "./parts";
import { SectionHead } from "./SectionHead";
import { TrendingTabs } from "./TrendingTabs";

export const metadata: Metadata = pageMetadata({
  title: "카더라 리포트 | hatzze",
  description: "주식 텔레그램 채널 수백 개를 대신 읽습니다. 오늘 가장 많이 언급된 종목과 가장 많이 퍼진 메시지를 매일 집계합니다.",
  path: "/kadera",
});

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

/* 생태계 센티먼트 카드의 LLM 총평이 차지하는 자리. 이 두 값이 곧 카드 높이를 결정하므로
   한 곳에 모아 둔다 — 줄 수와 줄 높이가 따로 놀면 height 계산이 조용히 어긋난다.
   4줄로 잡은 근거: 총평은 원래 2문장 설계(generate_telegram_narratives.py 의 '총평 2문장')
   이고, 2문장이면 좁은 화면에서도 3~4줄에 들어간다. */
const SUMMARY_LINES = 4;
const SUMMARY_LINE_HEIGHT = 1.7;

/** 한 줄 말줄임 — 채널명·종목명처럼 카드를 밀어낼 수 있는 이름에 붙인다. */
const clip: React.CSSProperties = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };

/* 테마 로테이션 한 줄의 세로 치수. 오른쪽 스파크라인의 밑선을 왼쪽 점유율 막대의
   밑선에 맞추려면 그 위에 무엇이 얼마나 쌓여 있는지 알아야 해서, 값을 흩어 두지 않고
   여기 모은다(한 곳만 고치면 정렬이 따라온다). */
const THEME_NAME_H = 20; // 테마명 줄(lineHeight 로 고정)
const THEME_BAR_TOP = 7; // 이름 줄 ↔ 막대 사이 여백
const THEME_BAR_H = 7; // 막대 두께
const SPARK_H = 26; // Sparkline 기본 높이와 같아야 한다
/** 스파크라인을 이만큼 내리면 밑선이 막대 밑선과 같아진다. */
const THEME_SPARK_TOP = THEME_NAME_H + THEME_BAR_TOP + THEME_BAR_H - SPARK_H;


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
            <Avatar photo={m.channelPhoto} title={m.channelTitle} size={22} />
            <b style={{ ...clip, fontSize: 12, fontWeight: 700, color: C.blue }}>{m.channelTitle}</b>
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
  const topStocks = await getTopStocksWithTrend(3);
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
      Promise.all(topStocks.map((s) => getStockReport(s.code))),
      getEcosystemSentiment(),
      getIssueKeywords(10),
      getStockNarratives(),
    ]);
  const stockReports = reports.filter((r): r is NonNullable<typeof r> => r !== null);

  // 배지(순위 변동·성장중)는 채널명 뒤가 아니라 점수 왼쪽 묶음에 둔다. 이름 뒤에 붙이면
  // "주식 급등일보🚀…| Korean Stocks" 같은 긴 이름에서 배지가 말줄임에 먹혀 잘렸다.
  const channelItems = channels.map((c, i) => (
    <li key={c.handle}>
      <a href={`https://t.me/${c.handle}`} target="_blank" rel="noopener noreferrer" className="hz-row-link">
        <span style={{ ...rankNum, color: i < 3 ? C.blue : C.faint }}>{i + 1}</span>
        <Avatar photo={c.photo} title={c.title} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...clip, fontWeight: 700, fontSize: 14, color: C.ink }}>{c.title}</div>
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
            <div style={{ fontFamily: MONO, fontWeight: 800, fontSize: 18, color: C.blue, lineHeight: 1.1, letterSpacing: "-0.02em" }}>
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

  const miniStats: { label: string; value: string; help?: string }[] = [
    { label: "모니터링 채널", value: `${summary.channelCount}개` },
    { label: "총 구독자", value: formatKR(summary.totalSubscribers) },
    { label: "활성 채널 (7일)", value: `${summary.activeChannels}개`, help: "최근 7일 안에 메시지를 올린 채널입니다." },
    { label: "총 메시지 (7일)", value: `${summary.messages7d.toLocaleString("ko-KR")}개` },
  ];

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
      {/* 헤더 — 제목과 소개를 한 덩어리로 묶는다(MDD 정밀분석과 같은 골격).
          예전엔 소개 문단이 그리드 gap 20 만큼 떨어져 있어 제목이 아니라 첫 카드에
          붙어 보였다. 베타 배지는 사이드바 로고 옆으로 옮겼다 — 서비스 전체가
          베타라 페이지마다 붙일 일이 아니다. */}
      <header>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          {/* 이 페이지의 h1. 사이드바 로고는 홈에서만 h1이라 여기와 겹치지 않는다.
              스타일은 h2 때와 동일해 보이는 건 그대로다(제목 크기는 인라인 지정). */}
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: C.ink, letterSpacing: "-0.01em" }}>카더라 리포트</h1>
          <div style={{ height: 1, flex: 1, background: C.line }} />
        </div>
        <p style={{ margin: "8px 0 0", fontSize: 14, lineHeight: 1.7, color: C.sub }}>
          한국 주식 텔레그램 채널들이 <b style={{ color: C.ink }}>지금 무엇에 주목하는지</b>를 모아 보여줍니다.
          조회·확산·언급량을 종합한 <b style={{ color: C.ink }}>화제성</b> 지표이며, 매수·매도 신호가 아닙니다.
        </p>
      </header>

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
                <span style={{ fontSize: 12, color: C.sub, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 }}>
                  {s.label}
                  {s.help && (
                    <span className="hz-tip hz-tip-wide" data-tip={s.help} style={{ display: "inline-flex", cursor: "help" }}>
                      <Icon name="help" style={{ fontSize: 13, color: C.muted }} />
                    </span>
                  )}
                </span>
                <span style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800, color: C.ink, letterSpacing: "-0.02em" }}>{s.value}</span>
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
            note="최근 7일"
            desc="메시지 톤으로 본 시장 분위기"
            meta={summary.lastUpdated ? `최종 업데이트 · ${formatKstUpdate(summary.lastUpdated)}` : undefined}
          />
          {!sentiment ? (
            <p style={{ margin: 0, color: C.sub, fontSize: 13 }}>아직 분석된 메시지가 없습니다.</p>
          ) : (
            <>
              {/* AI 요약 — 아이콘을 글 흐름에 끼우지 않고 제 칸에 세운다. 인라인이면
                  둘째 줄부터 아이콘 아래로 파고들어 첫 줄만 들여쓴 것처럼 보였다. */}
              {sentiment.summary && (
                <div
                  style={{
                    display: "flex",
                    gap: 9,
                    margin: "0 0 18px",
                    background: C.bg,
                    border: `1px solid ${C.line}`,
                    borderRadius: 12,
                    padding: "13px 15px",
                  }}
                >
                  <Icon name="auto_awesome" style={{ fontSize: 15, color: C.blue, flexShrink: 0, marginTop: 4 }} />
                  {/* 높이를 SUMMARY_LINES 줄로 **고정**한다(min/max 가 아니라 height).
                      LLM 총평은 길이가 날마다 달라서, 자라게 두면 이 카드가 옆의 모니터링
                      현황 카드보다 들쭉날쭉 길어진다. 줄 수는 화면 폭에 따라서도 바뀌므로
                      (같은 글이 1280px 에서 5줄, 넓은 모니터에선 4줄) '내용에 맞춘 높이'
                      로는 애초에 안정될 수가 없다. 넘치면 line-clamp 가 말줄임으로 끊는다. */}
                  <p
                    style={{
                      margin: 0,
                      fontSize: 13,
                      lineHeight: SUMMARY_LINE_HEIGHT,
                      color: "var(--c-ink-soft)",
                      wordBreak: "keep-all",
                      height: `${SUMMARY_LINES * SUMMARY_LINE_HEIGHT}em`,
                      display: "-webkit-box",
                      WebkitBoxOrient: "vertical",
                      WebkitLineClamp: SUMMARY_LINES,
                      overflow: "hidden",
                    }}
                  >
                    {sentiment.summary}
                  </p>
                </div>
              )}
              <div style={{ display: "flex", gap: 28, flexWrap: "wrap", alignItems: "center" }}>
                {/* 메시지 톤 종합 — 점수와 그 근거 막대를 한 덩어리로 묶는다 */}
                <div style={{ flex: "1 1 300px", minWidth: 280 }}>
                  {/* 이 카드가 답하는 건 "지금 분위기 좋아, 나빠?" 하나다. 그래서 숫자도 한 벌만
                      쓴다 — 예전엔 헤드라인이 낙관도(중립 제외, 59%)이고 아래 막대는 중립 포함
                      구성(낙관 32%)이라, 한 카드에서 '낙관'이 두 숫자로 나와 어느 쪽이 진짜인지
                      알 수 없었다. 이제 비관:낙관 한 기준으로만 말하고, 막대는 그 비율을 그림으로
                      반복한다(숫자와 그림이 어긋날 수가 없다). 중립은 얼마나 뺐는지만 각주로. */}
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                    <span style={{ fontFamily: MONO, fontSize: 44, fontWeight: 800, lineHeight: 1, letterSpacing: "-0.035em" }}>
                      <span style={{ color: C.cold }}>{100 - sentiment.score}</span>
                      <span style={{ color: C.faint }}>:</span>
                      <span style={{ color: C.hot }}>{sentiment.score}</span>
                    </span>
                    {/* 유저가 실제로 가져가는 답은 이 라벨이다 — 색도 여기가 tone을 쓴다. */}
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: 14,
                        fontWeight: 800,
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
                        style={{ display: "inline-flex", cursor: "help" }}
                      >
                        <Icon name="help" style={{ fontSize: 13, color: C.muted }} />
                      </span>
                    </span>
                  </div>
                  {/* 두 라벨을 막대의 양 끝에 붙여 어느 쪽이 어느 색인지 위치로 바로 읽히게 한다. */}
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 700, margin: "10px 0 6px" }}>
                    <span style={{ color: C.cold }}>비관</span>
                    <span style={{ color: C.hot }}>낙관</span>
                  </div>
                  {/* 반반(50%) 자리에 기준선을 세워 봤다가 걷어냈다. 색이 갈리는 자리(35%)와
                      눈금 자리(50%)가 한 막대에 나란히 생기니, 어느 쪽이 데이터의 경계인지
                      알 수 없는 흰 줄로만 보였다. 기울기는 숫자(35:65)와 색 면적이 이미 말한다. */}
                  <div style={{ display: "flex", height: 13, borderRadius: 999, overflow: "hidden" }}>
                    <div style={{ width: `${100 - sentiment.score}%`, background: C.cold }} />
                    <div style={{ width: `${sentiment.score}%`, background: C.hot }} />
                  </div>
                  <div style={{ marginTop: 9, fontSize: 11.5, color: C.muted, lineHeight: 1.5 }}>
                    총 <span style={{ fontFamily: MONO }}>{sentiment.messageCount.toLocaleString("ko-KR")}</span>건 중{" "}
                    <span style={{ fontFamily: MONO }}>{sentiment.neutral}</span>%는 중립이라 빼고 계산했습니다
                  </div>
                </div>

                {sentiment.byTheme.length > 0 && (
                  <div style={{ flex: "1 1 250px", minWidth: 235, display: "flex", flexDirection: "column", gap: 9 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.muted }}>
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
                        <span style={{ ...clip, fontSize: 11.5, fontWeight: 700, color: C.ink }}>{t.name}</span>
                        {/* 비관(왼쪽)과 낙관(오른쪽)을 한 바에 나눠 담아 비율이 바로 보이게.
                            순서는 시장 브리핑 감성 카드와 맞춘 '비관 : 낙관'이다. */}
                        <span style={{ display: "flex", height: 7, borderRadius: 999, overflow: "hidden" }}>
                          <span style={{ width: `${100 - t.pos}%`, background: C.cold }} />
                          <span style={{ width: `${t.pos}%`, background: C.hot }} />
                        </span>
                        <span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 700, textAlign: "right", whiteSpace: "nowrap" }}>
                          <span style={{ color: C.cold }}>{100 - t.pos}</span>
                          <span style={{ color: C.faint }}>:</span>
                          <span style={{ color: C.hot }}>{t.pos}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
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
              {surging.map((s) => (
                <div key={s.code} style={{ ...subCard, flex: "1 1 168px", padding: "14px 15px", display: "flex", flexDirection: "column" }}>
                  {/* 1) 종목 — 이름 + 코드 */}
                  <div style={{ display: "flex", alignItems: "baseline", gap: 5, minWidth: 0 }}>
                    <span style={{ ...clip, fontWeight: 800, fontSize: 15, color: C.ink }}>{s.name}</span>
                    {/* 종목 코드는 눈에서 흘려보내는 장식이 아니라 읽고 확인하는 값이라
                        faint 가 아니라 한 단계 진한 muted 를 쓴다(10px 이라 더 그렇다). */}
                    <span style={{ fontFamily: MONO, fontSize: 10.5, color: C.muted, flexShrink: 0 }}>{s.code}</span>
                  </div>

                  {/* 2) 시세 — 가격 + 등락률. 좁은 타일에서 일곱 자리 가격("1,759,000원")이
                      등락률과 한 줄에 안 들어가 줄이 갈리므로, 등락률은 아예 아랫줄에
                      고정한다(타일마다 줄 수가 달라지지 않는다). */}
                  <div style={{ marginTop: 8 }}>
                    {s.closePrice != null ? (
                      <>
                        <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 800, color: C.ink, letterSpacing: "-0.02em" }}>
                          {s.closePrice.toLocaleString("ko-KR")}원
                        </div>
                        {s.changeRate != null && (
                          <div style={{ marginTop: 2, fontFamily: MONO, fontSize: 12, fontWeight: 700, color: s.changeRate >= 0 ? C.hot : C.cold }}>
                            {s.changeRate >= 0 ? "▲" : "▼"}
                            {Math.abs(s.changeRate).toFixed(2)}%
                          </div>
                        )}
                      </>
                    ) : (
                      <span style={{ fontSize: 12, color: C.muted }}>가격 정보 준비 중</span>
                    )}
                  </div>

                  {/* 3) 텔레그램 화제도 — 이 카드가 말하려는 건 시세가 아니라 이 배수다.
                      배지는 마이너스 마진으로 왼쪽에 걸쳐 두던 걸 걷고 제자리에 놓는다.
                      '신규 등장' 앞에 붙어 있던 🆕 도 뺐다 — 페이지에서 유일한 컬러
                      이모지라 서체가 갈리고 배지 높이도 저 혼자 달라졌다. */}
                  <div style={{ marginTop: "auto", paddingTop: 12 }}>
                    <div style={{ paddingTop: 11, borderTop: `1px solid ${C.line}` }}>
                      <Pill tone={s.isNew ? "blue" : "hot"}>{s.isNew ? "신규 등장" : `언급 ▲ ${s.ratio.toFixed(1)}배`}</Pill>
                    </div>
                    <div style={{ marginTop: 8, fontSize: 11, fontFamily: MONO, color: C.muted }}>
                      {s.recentMentions}회 언급 · {s.channelCount}개 채널
                    </div>
                    {/* MDD 링크는 통계 아래 우측에 은근히 — 타일이 좁아 한 줄에 같이 두면 넘친다. */}
                    <div style={{ marginTop: 8, textAlign: "right" }}>
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
            desc="관심이 어느 테마로 옮겨가는지"
            noteHelp="최근 3일 평균 점유율을 그 이전과 비교합니다. 하루치끼리 재면 표본 얇은 날에 크게 요동쳐서, 며칠씩 묶어서 봅니다."
          />
          {themes.length === 0 ? (
            <p style={{ margin: 0, color: C.sub, fontSize: 13 }}>아직 집계된 테마가 없습니다.</p>
          ) : (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 15, justifyContent: "space-between" }}>
              {/* 막대 길이는 1위 테마를 가득 찬 것으로 두고 그에 견준 비율이다.
                  점유율을 그대로 폭으로 쓰면(예전 방식) 1위 15%·10위 0.7%라 열 줄 중
                  아홉 줄이 빈 트랙만 남아 순위가 눈에 안 들어왔다. 2.6배를 곱하던 그
                  이전 방식은 38.5%만 넘으면 여러 줄이 한꺼번에 100%로 꽉 차 1위가 늘
                  만땅으로 보였는데, 1위 기준이면 정의상 한 줄만 가득 찬다. 절대값은
                  아래 "점유율 15.4%" 로 그대로 적는다(이슈 키워드 카드와 같은 문법). */}
              {themes.map((t, i) => (
                <div
                  key={t.theme}
                  className="hz-theme-row"
                  /* 마우스가 없어도(키보드·터치) 종목 목록을 열 수 있게 초점을 받는다.
                     언급된 종목이 없는 테마는 열 것도 없으니 초점도 주지 않는다. */
                  tabIndex={t.stocks.length ? 0 : undefined}
                  aria-label={t.stocks.length ? `${t.theme} 테마를 이룬 종목 ${t.stockCount}개 보기` : undefined}
                  style={{ display: "grid", gridTemplateColumns: "17px minmax(0,1fr) 62px", alignItems: "start", gap: 12 }}
                >
                  <span style={{ ...rankNum, paddingTop: 2 }}>{t.rank}</span>
                  <div style={{ minWidth: 0 }}>
                    {/* 줄 높이를 못 박는다 — 오른쪽 스파크라인을 막대 밑선에 맞추려면
                        (THEME_SPARK_TOP) 이 줄이 몇 px 인지 확정돼야 한다. lineHeight 만으론
                        모자란다: 14·12·10px 글자의 베이스라인을 맞추느라 줄이 1px 더 커진다. */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "baseline",
                        gap: 7,
                        height: THEME_NAME_H,
                        lineHeight: `${THEME_NAME_H}px`,
                      }}
                    >
                      <span style={{ ...clip, fontWeight: 800, fontSize: 14, color: C.ink }}>{t.theme}</span>
                      <RankDelta change={t.rankChange} />
                      {t.shareDelta !== null && Math.abs(t.shareDelta) >= 0.1 && (
                        <span
                          style={{
                            marginLeft: "auto",
                            flexShrink: 0,
                            fontFamily: MONO,
                            fontSize: 12,
                            fontWeight: 700,
                            color: t.shareDelta >= 0 ? C.hot : C.cold,
                          }}
                        >
                          {t.shareDelta >= 0 ? "▲" : "▼"}
                          {Math.abs(t.shareDelta).toFixed(1)}%p
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        margin: `${THEME_BAR_TOP}px 0 5px`,
                        height: THEME_BAR_H,
                        background: C.track,
                        borderRadius: 999,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${Math.max(2, Math.min(100, (t.sharePct / Math.max(0.1, themes[0].sharePct)) * 100))}%`,
                          height: "100%",
                          background: C.blue,
                          opacity: 0.85,
                          borderRadius: 999,
                        }}
                      />
                    </div>
                    <div style={{ ...clip, fontSize: 11, color: C.muted }}>
                      점유율 <b style={{ color: C.sub, fontFamily: MONO }}>{t.sharePct.toFixed(1)}%</b> · 종목 {t.stockCount}개 ·{" "}
                      <span style={{ fontFamily: MONO }}>{t.mentions}회</span>
                    </div>
                  </div>
                  {/* 스파크라인은 위에서부터 그려지므로, 밑선을 왼쪽 막대의 밑선에 맞추려면
                      그만큼 내려 앉혀야 한다. 예전엔 이름 줄 높이에 맞춰 떠 있어서 두 그래프가
                      서로 다른 선 위에 놓인 것처럼 보였다.
                      기간은 툴팁으로만 밝힌다 — 카드의 다른 숫자(점유율·종목·회)는 최근 3일
                      평균인데 이 그래프만 14일이라, 적어 두지 않으면 알 길이 없다. */}
                  <span
                    className="hz-tip hz-tip-wide hz-tip-end"
                    data-tip={`최근 ${t.series.length}일 일별 점유율입니다.`}
                    style={{ display: "block", marginTop: THEME_SPARK_TOP }}
                  >
                    <Sparkline data={t.series} />
                  </span>

                  {/* 이 테마의 점유율을 만든 종목 목록. 줄에 마우스를 올리거나 초점이
                      가면 열린다(CSS 만, globals.css 의 .hz-theme-pop).
                      아래쪽 줄은 위로 펼친다 — 아래로 열면 카드를 벗어나 다음 카드를 덮는다. */}
                  {t.stocks.length > 0 && (
                    <div className={`hz-theme-pop${i >= themes.length - 4 ? " hz-theme-pop-up" : ""}`}>
                      <div className="hz-theme-pop-head">최근 3일 언급 {t.stockCount}종목 · 주목도순</div>
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
              ))}
            </div>
          )}
        </div>

        {/* ⑤ 주요 종목 리포트 (½) — 3종목 상세 */}
        <div className="hz-c2" style={{ ...cardStyle, display: "flex", flexDirection: "column" }}>
          <SectionHead
            icon="query_stats"
            title="주요 종목 리포트"
            note="최근 7일 · 상위 3종목"
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
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                      <span style={{ ...clip, fontSize: 18, fontWeight: 800, color: C.ink }}>{r.name}</span>
                      <span style={{ fontFamily: MONO, fontSize: 11, color: C.muted }}>{r.code}</span>
                      {r.price != null && (
                        <span style={{ marginLeft: "auto", display: "flex", alignItems: "baseline", gap: 5, whiteSpace: "nowrap" }}>
                          <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 800, color: C.ink, letterSpacing: "-0.02em" }}>
                            {r.price.toLocaleString("ko-KR")}원
                          </span>
                          {r.changeRate != null && (
                            <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: r.changeRate >= 0 ? C.hot : C.cold }}>
                              {r.changeRate >= 0 ? "▲" : "▼"}
                              {Math.abs(r.changeRate).toFixed(2)}%
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                    {/* 언급 추이 — 막대를 바닥선 위에 세운다. 평소엔 마지막 날만 진해
                        "지금"이 어디인지 눈이 먼저 잡고, 마우스를 올리면 그 날로 강조가
                        옮겨간다(진하기·날짜색 규칙은 globals.css 의 .hz-bars). */}
                    <div className="hz-bars" style={{ display: "flex", alignItems: "flex-end", gap: 4, margin: "14px 0 12px", borderBottom: `1px solid ${C.line}` }}>
                      {r.series.map((d, i) => (
                        <div
                          key={d.date}
                          className="hz-tip hz-bar-col"
                          data-tip={`${shortDate(d.date)} · ${d.mentions}회`}
                          // 커서는 기본 그대로 둔다 — 도움말(?)이 아니라 값을 짚어 보는 차트다.
                          style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 5, minWidth: 0 }}
                        >
                          <div
                            className={`hz-bar${i === r.series.length - 1 ? " hz-bar-last" : ""}`}
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
                        <Icon name="auto_awesome" style={{ fontSize: 13, color: C.blue, flexShrink: 0, marginTop: 3 }} />
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
          <SectionHead
            icon="military_tech"
            title="채널 파워 랭킹"
            note="영향력 점수"
            desc="조회율·확산력까지 반영한 채널 영향력"
            noteHelp="조회율·포워드율·구독자 규모·게시 빈도를 합쳐 52~100으로 낸 점수입니다. 구독자만 많고 안 읽히는 채널은 낮게 나옵니다."
          />
          {channels.length === 0 ? (
            <p style={{ margin: 0, color: C.sub, fontSize: 13 }}>아직 채널 점수가 없습니다.</p>
          ) : (
            // 목록이 남는 높이를 먹고 열 줄이 그 안에서 고르게 벌어진다("더 보기" 버튼은
            // 아래 그대로 붙는다). 이 줄 세 카드는 그리드가 높이를 맞추는데, 카드마다
            // 줄 높이가 달라 짧은 카드는 바닥이 비었다.
            <ExpandableList items={channelItems} initial={10} step={10} listStyle={{ flex: 1, justifyContent: "space-between" }} />
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
                  <Avatar photo={r.photo} title={r.title} size={26} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ ...clip, fontWeight: 700, fontSize: 13, color: C.ink }}>{r.title}</div>
                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 6, marginTop: 2 }}>
                      <span style={{ fontSize: 10.5, fontFamily: MONO, color: C.muted }}>구독자 {compact(r.subscriberCount)}</span>
                      {/* 정원을 채우느라 증감이 없거나 줄어든 채널까지 들어올 수 있어 부호를 그대로 쓴다 */}
                      <span
                        style={{
                          fontFamily: MONO,
                          fontSize: 11,
                          fontWeight: 800,
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
                    <a href={`https://t.me/${r.handle}`} target="_blank" rel="noopener noreferrer" className="hz-row-link" style={{ alignItems: "flex-start", gap: 8 }}>
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
          <SectionHead icon="tag" title="이슈 키워드" note="최근 7일" desc="종목명이 아닌 화제어" />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 19, justifyContent: "space-between" }}>
            {keywords.length === 0 ? (
              <p style={{ margin: 0, color: C.sub, fontSize: 13 }}>아직 뽑을 화제어가 없습니다.</p>
            ) : (
              keywords.map((k, i) => {
                const max = keywords[0].count;
                return (
                  <div key={k.word} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                    <span style={{ ...rankNum, width: 14, fontSize: 11, paddingTop: 1 }}>{i + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 6 }}>
                        <span style={{ ...clip, fontWeight: 700, fontSize: 13, color: C.ink }}>{k.word}</span>
                        {/* 비교할 과거가 아직 없으면 화살표를 숨긴다 — ▲▼ 아무거나 붙이면 거짓말이 된다 */}
                        {/* 화살표는 '관심 점유율이 움직였을 때'만 — 변화 없음(flat)과
                            비교할 과거가 없을 때(null)는 숫자만 둔다. 예전엔 boolean 이라
                            동률과 '최근 창에 안 나온 말'까지 ▲가 붙었다. */}
                        <span
                          style={{
                            fontFamily: MONO,
                            fontSize: 11,
                            fontWeight: 700,
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
                        <div style={{ width: `${(k.count / max) * 100}%`, height: "100%", background: C.blue, borderRadius: 999, opacity: 0.7 }} />
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
