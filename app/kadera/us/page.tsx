import type { Metadata } from "next";
import Link from "next/link";

import {
  getMarketAttentionSplit,
  getUsChannelShare,
  getUsIssueKeywords,
  getUsKaderaSummary,
  getUsComentionGroups,
  getUsSentiment,
  getUsDailyBrief,
  getUsStockReports,
  getUsSurgingStocks,
  getUsThemeRotation,
  getUsTrendingMessages,
  US_WINDOW_DAYS,
} from "@/lib/us-telegram-data";
import type { UsTrendingMessage } from "@/lib/us-telegram-data";

import { pageMetadata } from "../../seo";
import { AiMark, C, Icon, MONO, R } from "../../ui";
import { StockLogo } from "../../StockLogo";
import { ExpandableList } from "../ExpandableList";
import {
  Avatar,
  ChangeRate,
  DayBars,
  Pill,
  RankBadge,
  RankDelta,
  SectionCaps,
  Sparkline,
} from "../parts";
import { TrendingTabs } from "../TrendingTabs";
import { SectionHead } from "../SectionHead";

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata({
    title: "미장 카더라 | hatzze",
    description:
      "같은 주식 텔레그램 채널들이 미국 종목은 뭐라고 하는지 모읍니다. 미국 기업 소식이 어느 국내 종목과 함께 오르내리는지도 함께 봅니다.",
    path: "/kadera/us",
  });
}

export const dynamic = "force-dynamic";

/** 옆에 나란히 두는 시트의 최소 폭. 국내 페이지와 같은 값이라 두 화면의 접히는 지점이 같다. */
const SHEET_PAIR_MIN = "min(460px, 100%)";

const clip: React.CSSProperties = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

/**
 * 달러 표기. **MDD 화면의 fmtPrice(market="US")와 같은 규칙이어야 한다** — 같은 종목을
 * 두 화면에서 볼 때 소수 자리가 다르면 다른 값처럼 보인다.
 * 소수 둘째 자리까지 쓰는 이유: 달러는 원과 달리 1달러 미만의 움직임이 뜻을 갖는다.
 */
function fmtPrice(n: number, _market: "US"): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * 비관↔낙관 양분 막대 한 줄. 색은 국장 히어로의 같은 막대와 맞춘다 —
 * 파랑이 비관, 따뜻한 색이 낙관이다. 두 화면을 오갈 때 색이 뒤집히면 안 된다.
 */
function SplitBar({
  label,
  score,
  strong,
}: {
  label: string;
  score: number;
  strong?: boolean;
}) {
  return (
    <div
      style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}
    >
      <span
        style={{
          width: 52,
          flexShrink: 0,
          fontSize: 11,
          fontWeight: 700,
          color: strong ? C.label : C.sub2,
        }}
      >
        {label}
      </span>
      <span
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          height: strong ? 11 : 8,
          borderRadius: 3,
          overflow: "hidden",
        }}
      >
        <span
          style={{
            width: `${100 - score}%`,
            background: strong ? "var(--c-blue-2)" : "var(--c-blue-3)",
          }}
        />
        <span
          style={{
            width: `${score}%`,
            background: strong ? "var(--c-warm-2)" : "var(--c-warm-3)",
          }}
        />
      </span>
      <span
        style={{
          fontFamily: MONO,
          fontSize: 11.5,
          fontWeight: 700,
          color: "var(--c-hot-ink)",
          width: 34,
          textAlign: "right",
          flexShrink: 0,
        }}
      >
        {score}%
      </span>
    </div>
  );
}

/**
 * 그 종목의 MDD 정밀분석으로 잇는 링크. 국장 카드와 같은 자리·같은 어법이다.
 *
 * URL 에 `market=US` 를 실어야 한다 — 그 값이 야후 심볼(접미사 없음)·시장 기준
 * 지수(^GSPC)·통화 표기(USD)를 한꺼번에 가른다.
 * ⏸ 테마 비교는 아직 미국에 안 붙는다(미국 테마 사전을 TS 로 옮기는 일이 남았다).
 */
function UsMddLink({
  ticker,
  label = "MDD 정밀분석",
}: {
  ticker: string;
  label?: string;
}) {
  return (
    <Link href={`/mdd?code=${ticker}&market=US`} className="hz-mdd-link">
      {label}
      <Icon name="arrow_outward" style={{ fontSize: 13 }} />
    </Link>
  );
}

/** 조회수 표기. 국장 카드와 같은 규칙이라 두 화면의 같은 숫자가 같은 꼴로 보인다. */
function compact(n: number): string {
  if (n >= 10000) return `${Math.round(n / 1000)}K`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return `${n}`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 60) return `${Math.max(1, min)}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  return `${Math.floor(hr / 24)}일 전`;
}

/**
 * 트렌딩 메시지 목록. 국장 TrendingList 와 같은 마크업이다 — 다른 건 태그가
 * 국내 종목명이 아니라 **미국 종목의 한글 표기**라는 것뿐이고, 국장 쪽의 topics(주제 태그)는
 * 붙이지 않는다(미장에는 그 재료가 아직 없다).
 */
function UsTrendingList({ items }: { items: UsTrendingMessage[] }) {
  const nodes = items.map((m, i) => (
    <li
      key={`${m.channelHandle}-${m.messageId}`}
      className="hz-lift"
      style={{ display: "flex", padding: "16px 18px", gap: 12, minWidth: 0 }}
    >
      <a
        href={`https://t.me/${m.channelHandle}/${m.messageId}`}
        target="_blank"
        rel="noopener noreferrer"
        data-ga="kadera_us_message_click"
        data-ga-channel={m.channelHandle}
        style={{
          display: "flex",
          gap: 12,
          minWidth: 0,
          width: "100%",
          textDecoration: "none",
        }}
      >
        <Avatar photoUrl={m.channelPhotoUrl} title={m.channelTitle} size={34} />
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: 7,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 7,
              flexWrap: "wrap",
              minWidth: 0,
            }}
          >
            <span
              style={{
                ...clip,
                fontSize: 12.5,
                fontWeight: 800,
                letterSpacing: "-.01em",
                color: "var(--c-cold-ink)",
                maxWidth: 220,
              }}
            >
              {m.channelTitle}
            </span>
            <span style={{ fontSize: 11, fontFamily: MONO, color: C.sub2 }}>
              {timeAgo(m.postedAt)}
            </span>
            <span style={{ flex: 1 }} />
            <span
              style={{
                fontSize: 11,
                fontFamily: MONO,
                fontWeight: 800,
                color: C.sub,
              }}
            >
              #{i + 1}
            </span>
          </div>
          <div className="hz-bubble">
            {/* overflowWrap:anywhere 가 없으면 원문에 섞인 긴 URL 이 줄바꿈을 못 해
                말풍선 밖으로 잘려 나간다(국장에서 실제로 그랬다). */}
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
            {m.stocks.length > 0 && (
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {m.stocks.map((t) => (
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
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                paddingTop: 2,
                fontSize: 11,
                fontFamily: MONO,
                fontWeight: 700,
                color: C.sub,
              }}
            >
              <span
                style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
              >
                <Icon
                  name="visibility"
                  style={{ fontSize: 14, color: C.faint }}
                />
                {compact(m.views)}
              </span>
              <span
                style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
              >
                <Icon
                  name="shortcut"
                  style={{ fontSize: 14, color: C.faint }}
                />
                {compact(m.forwards)}
              </span>
              {m.replies > 0 && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <Icon
                    name="chat_bubble"
                    style={{ fontSize: 12, color: C.faint }}
                  />
                  {m.replies}
                </span>
              )}
            </div>
          </div>
        </div>
      </a>
    </li>
  ));

  return (
    <ExpandableList
      items={nodes}
      name="us_trending_messages"
      initial={6}
      step={10}
      listClassName="hz-panelgrid hz-panelgrid-auto"
      footerClassName="hz-sheet-foot-row"
    />
  );
}

export default async function UsKaderaPage() {
  const [
    summary,
    comention,
    surging,
    channels,
    sentiment,
    keywords,
    themes,
    brief,
    reports,
    trendToday,
    trendWeek,
    trendMonth,
    split,
  ] = await Promise.all([
    getUsKaderaSummary(),
    getUsComentionGroups(10),
    getUsSurgingStocks(6),
    getUsChannelShare(10),
    getUsSentiment(),
    getUsIssueKeywords(),
    getUsThemeRotation(10),
    getUsDailyBrief(),
    getUsStockReports(4),
    // 기간 탭이 즉시 전환되도록 세 창을 한 번에 받아 둔다(국장과 같은 이유).
    getUsTrendingMessages("today", 36),
    getUsTrendingMessages("w7", 36),
    getUsTrendingMessages("w30", 36),
    // 18일. 옆에 선 채널 시트(10줄·566px)와 높이를 맞추는 값이다 — 자연 높이를 재서
    // 정했다(21일이면 640px 이라 채널 쪽에 74px 구멍이 난다).
    getMarketAttentionSplit(18),
  ]);

  // 히어로 ① 의 네 줄. 국장의 miniStats 와 같은 얼개다 — 라벨·값·단위로 나눠 두면
  // 값의 오른끝이 네 줄 모두 같은 자리에 선다.
  const miniStats: {
    label: string;
    note?: string;
    value: string;
    unit: string;
    help?: string;
  }[] = [
    { label: "모니터링 채널", value: `${summary.totalChannels}`, unit: "개" },
    {
      label: "미국 얘기 채널",
      note: "30일",
      value: `${summary.usChannels}`,
      unit: "개",
      help: "최근 30일 안에 미국 종목을 한 번이라도 언급한 채널입니다. 제목에 '미국'이 없는 평범한 국내 채널이 대부분입니다.",
    },
    {
      label: "미국 종목 언급",
      note: `${US_WINDOW_DAYS}일`,
      value: summary.mentions.toLocaleString("ko-KR"),
      unit: "회",
    },
    {
      label: "오르내린 종목",
      note: `${US_WINDOW_DAYS}일`,
      value: `${summary.tickers}`,
      unit: "개",
    },
  ];

  return (
    <>
      {/* ── 히어로: 모니터링 25 · 센티먼트 25 · 오늘의 요약 50 ─────────────
          국장 카더라와 같은 판이다. 셋을 시트 세 장으로 흩어 놓았다가 한 판으로 모았다 —
          셋 다 "지금 어떤 상태인가"를 말하는데 따로 서면 무엇이 머리인지가 안 보였다. */}
      <section className="hz-sheet">
        <div className="hz-kd-hero">
          {/* ① 모니터링 현황 */}
          <div className="hz-kd-hero-q">
            <div className="hz-kd-hero-title">
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  letterSpacing: "-.01em",
                  color: C.ink,
                }}
              >
                모니터링 현황
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {miniStats.map((s, i) => (
                <div
                  key={s.label}
                  style={{
                    display: "flex",
                    // baseline 이 아니라 center 다 — 라벨(11.5)과 값(19)은 줄 상자 높이가
                    // 달라 밑선을 맞추면 라벨이 줄 가운데보다 아래로 처진다(국장에서 실측).
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    padding: i === 0 ? "0 0 11px" : "11px 0",
                    borderBottom:
                      i === miniStats.length - 1
                        ? "none"
                        : "1px solid var(--c-sheet-row)",
                  }}
                >
                  <span
                    style={{
                      fontSize: 11.5,
                      fontWeight: 600,
                      color: C.sub,
                      display: "inline-flex",
                      alignItems: "baseline",
                      gap: 4,
                      minWidth: 0,
                      // 이 칸은 25% 폭이라 좁은 구간에서 230px 까지 내려간다.
                      // 기본 규칙이면 "미국 얘기 채널"이 토막나 읽히지 않는다.
                      wordBreak: "keep-all",
                    }}
                  >
                    {s.label}
                    {s.note && (
                      <span style={{ fontSize: 11, color: C.sub2 }}>
                        {s.note}
                      </span>
                    )}
                    {s.help && (
                      <span
                        className="hz-tip hz-tip-wide"
                        data-tip={s.help}
                        data-ga-tip={s.label}
                        style={{
                          display: "inline-flex",
                          alignSelf: "center",
                          cursor: "help",
                          flexShrink: 0,
                        }}
                      >
                        <Icon
                          name="help"
                          style={{ fontSize: 12, color: C.muted }}
                        />
                      </span>
                    )}
                  </span>
                  <strong
                    style={{
                      fontFamily: MONO,
                      fontSize: 19,
                      fontWeight: 800,
                      color: C.ink,
                      letterSpacing: "-.03em",
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                    }}
                  >
                    {s.value}
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: C.sub2,
                        marginLeft: 3,
                      }}
                    >
                      {s.unit}
                    </span>
                  </strong>
                </div>
              ))}
            </div>
            {/* 통계 넷 바로 아래. marginTop:auto 로 칸 바닥에 붙인다 — 옆 '오늘의 요약'
                칸이 문단 길이만큼 늘어나면 이 칸도 같이 늘어나는데, 그때 남는 자리가
                통계 줄 사이가 아니라 이 줄 위 한 곳에만 생긴다(국장과 같은 수법).
                국장으로 가는 통로를 여기 두는 이유: 두 화면은 같은 채널을 사전만 바꿔
                읽은 형제라, 한쪽을 보다 다른 쪽이 궁금해지는 게 자연스럽다. */}
            <div style={{ marginTop: "auto", paddingTop: 14 }}>
              <Link
                href="/kadera"
                className="hz-btn-soft"
                data-ga="cta_click"
                data-ga-cta="to_kr_kadera"
                data-ga-surface="us_hero"
              >
                <Icon name="swap_horiz" style={{ fontSize: 15 }} />
                국장 카더라 보기
              </Link>
            </div>
          </div>

          {/* ② 생태계 센티먼트 */}
          <div className="hz-kd-hero-q">
            {/* 제목 우측의 구간 라벨(낙관 우세 등). 큰 숫자만 두면 78% 가 높은 건지
                낮은 건지 읽는 사람이 판단해야 한다 — 국장과 같은 경계·같은 말을 붙인다. */}
            <div
              className="hz-kd-hero-title"
              style={{ justifyContent: "space-between", gap: 10 }}
            >
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  letterSpacing: "-.01em",
                  color: C.ink,
                }}
              >
                생태계 센티먼트
              </span>
              {sentiment && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 11,
                    fontWeight: 700,
                    color: C.label,
                    whiteSpace: "nowrap",
                  }}
                >
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background:
                        sentiment.tone === "hot"
                          ? "var(--c-warm-2)"
                          : sentiment.tone === "cold"
                            ? "var(--c-blue-2)"
                            : C.hint,
                    }}
                  />
                  {sentiment.label}
                </span>
              )}
            </div>
            {!sentiment ? (
              <p style={{ margin: 0, fontSize: 12.5, color: C.sub }}>
                아직 미국 종목 얘기의 톤 집계가 없습니다.
              </p>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                  flex: 1,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <strong
                    style={{
                      fontFamily: MONO,
                      fontSize: 34,
                      fontWeight: 800,
                      lineHeight: 1,
                      letterSpacing: "-.04em",
                      color:
                        sentiment.tone === "cold"
                          ? C.cold
                          : sentiment.tone === "hot"
                            ? C.hot
                            : C.ink,
                    }}
                  >
                    {sentiment.score}
                    <span
                      style={{
                        fontSize: 18,
                        fontWeight: 700,
                        letterSpacing: "-.02em",
                      }}
                    >
                      %
                    </span>
                  </strong>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 3,
                      minWidth: 0,
                      marginTop: 1,
                    }}
                  >
                    <span
                      style={{ fontSize: 11.5, fontWeight: 600, color: C.sub }}
                    >
                      최근 {sentiment.windowDays}일 ·{" "}
                      {sentiment.messageCount.toLocaleString("ko-KR")}건 분석
                    </span>
                    <span
                      style={{
                        fontSize: 11.5,
                        fontWeight: 700,
                        color: C.sub,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        width: "fit-content",
                      }}
                    >
                      중립 {sentiment.neutral}% 제외 후 환산
                      <span
                        className="hz-tip hz-tip-wide"
                        data-tip="메시지를 비관/중립/낙관으로 나눈 뒤, 중립을 뺀 비관↔낙관 비율입니다. 시황·공시 같은 담담한 글이 절반이라, 같이 세면 늘 비관으로 기웁니다."
                        data-ga-tip="us_sentiment_ratio"
                        style={{
                          display: "inline-flex",
                          cursor: "help",
                          flexShrink: 0,
                        }}
                      >
                        <Icon
                          name="help"
                          style={{ fontSize: 12, color: C.muted }}
                        />
                      </span>
                    </span>
                  </div>
                </div>

                {/* 톤 구성. 순서는 반드시 비관 → 중립 → 낙관이다 — 아래 두 막대도 왼쪽이
                    비관이라, 이 막대만 뒤집으면 같은 색이 칸 안에서 반대로 자란다. */}
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 7 }}
                >
                  <span
                    style={{
                      display: "flex",
                      height: 9,
                      borderRadius: 3,
                      overflow: "hidden",
                    }}
                  >
                    <span
                      style={{
                        width: `${sentiment.negative}%`,
                        background: "var(--c-blue-2)",
                      }}
                    />
                    <span
                      style={{
                        width: `${sentiment.neutral}%`,
                        background: "var(--c-chip)",
                      }}
                    />
                    <span
                      style={{
                        width: `${sentiment.positive}%`,
                        background: "var(--c-warm-2)",
                      }}
                    />
                  </span>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontFamily: MONO,
                      fontSize: 11.5,
                      fontWeight: 700,
                    }}
                  >
                    <span style={{ color: "var(--c-cold-ink)" }}>
                      비관 {sentiment.negative}
                    </span>
                    <span style={{ color: C.sub2 }}>
                      중립 {sentiment.neutral}
                    </span>
                    <span style={{ color: "var(--c-hot-ink)" }}>
                      낙관 {sentiment.positive}
                    </span>
                  </div>
                </div>

                {/* 톤 구성과 아래 비교 사이가 통째로 비어 있었다. 일별 낙관도를 여기
                    되살린다 — 사흘 창의 78%가 어디서 왔는지 눈으로 따라갈 수 있어야 한다.
                    히어로 칸은 좁아 14일이 아니라 7일만 그린다. */}
                {sentiment.series.length >= 3 && (
                  <div
                    style={{ display: "flex", flexDirection: "column", gap: 5 }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: ".06em",
                        color: C.sub,
                      }}
                    >
                      일별 낙관도
                    </span>
                    {sentiment.series.slice(-7).map((p, i, arr) => {
                      const isWindow = i >= arr.length - sentiment.windowDays;
                      return (
                        <div
                          key={p.date}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "34px 1fr 30px",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          <span
                            style={{
                              fontFamily: MONO,
                              fontSize: 10,
                              color: isWindow ? C.label : C.sub2,
                            }}
                          >
                            {p.date.slice(5)}
                          </span>
                          {/* 창 밖은 옅게 — 위 큰 숫자가 센 사흘이 어디인지 색으로 말한다. */}
                          <span
                            style={{
                              display: "flex",
                              height: 5,
                              borderRadius: 999,
                              overflow: "hidden",
                              opacity: isWindow ? 1 : 0.45,
                            }}
                          >
                            <span
                              style={{
                                width: `${100 - p.score}%`,
                                background: "var(--c-blue-3)",
                              }}
                            />
                            <span
                              style={{
                                width: `${p.score}%`,
                                background: "var(--c-warm-3)",
                              }}
                            />
                          </span>
                          <span
                            style={{
                              fontFamily: MONO,
                              fontSize: 10,
                              fontWeight: 700,
                              textAlign: "right",
                              color: isWindow ? "var(--c-hot-ink)" : C.sub2,
                            }}
                          >
                            {p.score}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* ⭐ 이 칸의 값어치는 큰 숫자가 아니라 이 비교다. 같은 채널·같은 사흘인데
                    미국 얘기의 톤과 전체 대화의 톤이 다르다는 건 우리만 낼 수 있는 숫자다.
                    ⚠️ 아랫줄은 '국장'이 아니라 '전체 대화'다 — 그 집계엔 미국 얘기도 들어 있다.
                    marginTop:auto — 옆 칸 문단의 밑선에 맞춰 바닥에 붙인다(국장과 같은 수법). */}
                {sentiment.overallScore !== null && (
                  <div
                    style={{
                      marginTop: "auto",
                      display: "flex",
                      flexDirection: "column",
                      gap: 9,
                      paddingTop: 12,
                      borderTop: "1px solid var(--c-sheet-row)",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: ".06em",
                        color: C.sub,
                      }}
                    >
                      전체 대화와 견주면
                    </span>
                    <SplitBar
                      label="미국 얘기"
                      score={sentiment.score}
                      strong
                    />
                    <SplitBar
                      label="전체 대화"
                      score={sentiment.overallScore}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ③ 오늘의 요약 */}
          <div className="hz-kd-hero-h">
            <div className="hz-kd-hero-title">
              {/* 시장 브리핑·국장 카더라와 같은 표식 — 옅은 하늘색 타일에 ✨.
                  22px 인 건 이 제목 슬롯이 22px 로 못박혀 있어서다(globals.css). */}
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
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  letterSpacing: "-.01em",
                  color: C.ink,
                }}
              >
                오늘의 요약
              </span>
              <span style={{ flex: 1 }} />
              {brief.date && (
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 11,
                    color: C.sub2,
                    flexShrink: 0,
                  }}
                >
                  {brief.date.slice(5).replace("-", ".")} 기준
                </span>
              )}
            </div>
            {/* 높이를 안 잡는다 — 길이는 파이프라인이 잡는다(BRIEF_*_LEN). 여기서 또 자르면
                그쪽이 망가졌을 때 화면이 조용히 문장을 먹는다. */}
            {brief.paragraphs.length === 0 ? (
              <p style={{ margin: 0, fontSize: 12.5, color: C.sub }}>
                오늘의 요약을 준비하고 있습니다. 집계가 끝난 뒤 만들어집니다.
              </p>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 11,
                  flex: 1,
                }}
              >
                {brief.paragraphs.map((para, i) => (
                  <p
                    key={i}
                    style={{
                      margin: 0,
                      fontSize: 13.5,
                      lineHeight: 1.85,
                      color: "var(--c-ink-soft)",
                      wordBreak: "keep-all",
                      textWrap: "pretty",
                    }}
                  >
                    {para}
                  </p>
                ))}
                <span
                  style={{
                    marginTop: "auto",
                    paddingTop: 4,
                    fontSize: 11,
                    lineHeight: 1.6,
                    color: C.sub2,
                  }}
                >
                  집계된 숫자를 읽어 자동으로 쓴 글이라 새 사실을 더하지
                  않습니다 · 텔레그램에서 오간 말이지 확인된 사실이 아니며,
                  매수·매도 신호가 아닙니다
                </span>
              </div>
            )}
          </div>
        </div>
      </section>

      <SectionCaps label="미국 소식이 국내로" count={1} />

      <section className="hz-sheet">
        <SectionHead
          icon="alt_route"
          title="함께 언급된 국내 종목"
          note={
            comention.windowDays ? `최근 ${comention.windowDays}일` : undefined
          }
          desc="미국 종목 얘기가 나올 때 어느 국내 종목이 같이 불리는지"
          meta={comention.asOf ? `${comention.asOf} 기준` : undefined}
        />
        {comention.groups.length === 0 ? (
          <p
            style={{
              margin: 0,
              padding: "20px 22px",
              color: C.sub,
              fontSize: 13,
            }}
          >
            아직 뚜렷하게 함께 불린 짝이 없습니다. 같은 글에 두 종목이 여러
            채널·여러 날에 걸쳐 나와야 잡힙니다.
          </p>
        ) : (
          <div className="hz-panelgrid hz-panelgrid-2">
            {comention.groups.map((g) => (
              <div key={g.ticker} className="hz-panel-pad">
                {/* 분모를 그룹 머리에 한 번만 적는다. 줄마다 "9건 중"을 되풀이하면
                    같은 숫자가 두세 번 찍혀 정작 다른 숫자(분자)가 안 읽힌다. */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 9,
                    minWidth: 0,
                  }}
                >
                  <StockLogo
                    code={g.ticker}
                    name={g.usName}
                    market="US"
                    size={26}
                  />
                  <strong
                    style={{
                      ...clip,
                      minWidth: 0,
                      fontSize: 15,
                      fontWeight: 800,
                      letterSpacing: "-.01em",
                      color: C.ink,
                    }}
                  >
                    {g.usName}
                  </strong>
                  <span style={{ flex: 1 }} />
                  <span
                    style={{
                      fontFamily: MONO,
                      fontSize: 11.5,
                      color: C.sub2,
                      whiteSpace: "nowrap",
                    }}
                  >
                    이 종목 얘기 {g.usCount}건 중
                  </span>
                </div>

                <div
                  style={{ display: "flex", flexDirection: "column", gap: 10 }}
                >
                  {g.partners.map((pt) => {
                    const rate = Math.min(
                      100,
                      Math.round((pt.pairCount / Math.max(1, g.usCount)) * 100),
                    );
                    return (
                      <div
                        key={pt.stockCode}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 5,
                          minWidth: 0,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "baseline",
                            gap: 8,
                            minWidth: 0,
                          }}
                        >
                          {/* 화살표가 방향을 만들면 안 된다 — 함께 불렸다는 것이지
                              한쪽이 다른 쪽을 끌었다는 뜻이 아니다. 가운뎃점으로 잇는다. */}
                          <span
                            style={{
                              fontSize: 12,
                              color: C.hint,
                              flexShrink: 0,
                            }}
                          >
                            ·
                          </span>
                          <span
                            style={{
                              ...clip,
                              minWidth: 0,
                              fontSize: 13.5,
                              fontWeight: 700,
                              color: C.ink,
                            }}
                          >
                            {pt.krName}
                          </span>
                          <span style={{ flex: 1 }} />
                          {/* ⭐ 이 카드의 핵심 숫자. 배수(260배)를 걷어내고 분모·분자를 그대로
                              보인다 — 눈으로 확인되고 표본 크기가 저절로 드러난다. */}
                          <span
                            style={{
                              fontFamily: MONO,
                              fontSize: 13,
                              fontWeight: 800,
                              color: C.ink,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {pt.pairCount}건
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                color: C.sub2,
                              }}
                            >
                              {" "}
                              · {rate}%
                            </span>
                          </span>
                        </div>
                        <span className="hz-usbar">
                          <span
                            style={{
                              width: `${rate}%`,
                              background: "var(--c-hot)",
                            }}
                          />
                        </span>
                        <span
                          style={{
                            fontFamily: MONO,
                            fontSize: 10.5,
                            color: C.sub2,
                          }}
                        >
                          {pt.channelCount}개 채널 · {pt.dayCount}일에 걸쳐
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="hz-sheet-foot">
          <span style={{ fontSize: 11.5, lineHeight: 1.6, color: C.sub }}>
            순서는 비율이 아니라{" "}
            <b style={{ color: C.label }}>
              우연히 겹칠 확률보다 얼마나 자주 붙었는지
            </b>
            로 정합니다. 국내에서 흔한 종목은 아무 얘기에나 끼기 때문입니다 ·
            같은 기사가 여러 채널에 퍼지는 일이 잦아, 한 채널·하루에만 나온 짝은
            빼고 셉니다 ·{" "}
            <b style={{ color: C.label }}>
              함께 불렸다는 것이지 두 회사가 실제로 엮여 있다는 뜻은 아닙니다
            </b>
          </span>
        </div>
      </section>

      <SectionCaps label="최근 뜨는 것" count={3} />

      <section className="hz-sheet">
        <SectionHead
          icon="local_fire_department"
          title="급부상 종목"
          note={`최근 ${US_WINDOW_DAYS}일 vs 평소`}
          desc="평소보다 언급이 갑자기 뛴 미국 종목 · 배수가 클수록 갑작스러운 관심"
        />
        {surging.length === 0 ? (
          <p
            style={{
              margin: 0,
              padding: "20px 22px",
              color: C.sub,
              fontSize: 13,
            }}
          >
            아직 급부상 신호가 뚜렷한 종목이 없습니다. 데이터가 쌓일수록
            또렷해집니다.
          </p>
        ) : (
          <div className="hz-panelgrid hz-panelgrid-3">
            {surging.map((s, i) => {
              return (
                <div key={s.ticker} className="hz-panel-pad">
                  {/* baseline 정렬이어야 한다. flex-start 는 상자 윗변을 맞추는데, 이 줄엔
                      14px 종목명과 11px 티커·11.5px 표본이 섞여 있어 상자를 맞추면 정작
                      눈에 보이는 글자 밑선이 어긋난다(국장에서 실측 3.8px). */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: 8,
                      minWidth: 0,
                    }}
                  >
                    <RankBadge n={i + 1} />
                    {/* minWidth:0 — flex 항목의 기본 min-width:auto 가 살아 있으면 이름이
                        안 줄어 말줄임이 안 걸리고 셀 밖으로 넘친다. */}
                    <strong
                      style={{
                        ...clip,
                        minWidth: 0,
                        fontSize: 14,
                        fontWeight: 800,
                        letterSpacing: "-.01em",
                        color: C.ink,
                      }}
                    >
                      {s.name}
                    </strong>
                    {/* 한글 표기가 없어 티커를 이름으로 쓰는 종목이 있다(RTX·TEAM).
                        그때 티커를 또 붙이면 "RTX RTX" 가 된다. */}
                    {s.name !== s.ticker && (
                      <span
                        style={{
                          fontFamily: MONO,
                          fontSize: 11,
                          color: C.sub2,
                          flexShrink: 0,
                        }}
                      >
                        {s.ticker}
                      </span>
                    )}
                    <span style={{ flex: 1 }} />
                    {/* '몇 개 채널'과 '며칠에 몇 회'는 둘 다 이 배수의 표본 크기를 말한다 —
                        한 덩어리로 오른쪽 위에 모아 두면 아래 그래픽이 배수와 막대만 남는다. */}
                    <span
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-end",
                        gap: 2,
                        flexShrink: 0,
                      }}
                    >
                      {s.channelCount !== null && (
                        <span
                          style={{
                            fontSize: 11.5,
                            color: C.sub2,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {s.channelCount}개 채널
                        </span>
                      )}
                      <span
                        style={{
                          fontFamily: MONO,
                          fontSize: 11.5,
                          fontWeight: 700,
                          color: C.label,
                          whiteSpace: "nowrap",
                        }}
                      >
                        최근 {US_WINDOW_DAYS}일 기준 {s.recentMentions}회
                      </span>
                    </span>
                  </div>

                  {/* 이 셀이 말하려는 건 시세가 아니라 이 배수다 — 30px 로 올려 주인공을 못박는다. */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: 9,
                      flexWrap: "wrap",
                    }}
                  >
                    <strong
                      style={{
                        fontFamily: MONO,
                        fontSize: 30,
                        fontWeight: 800,
                        letterSpacing: "-.035em",
                        lineHeight: 1,
                        color: C.hot,
                      }}
                    >
                      {s.multiple >= 10
                        ? Math.round(s.multiple)
                        : s.multiple.toFixed(1)}
                      <span
                        style={{
                          fontSize: 18,
                          fontWeight: 700,
                          letterSpacing: "-.02em",
                        }}
                      >
                        배
                      </span>
                    </strong>
                    <span style={{ fontSize: 11.5, color: C.sub2 }}>
                      평소 대비
                    </span>
                  </div>

                  <DayBars
                    values={s.series}
                    dates={s.seriesDates}
                    tone="warm"
                    hot={US_WINDOW_DAYS}
                  />

                  {/* 국장 셀과 같은 마지막 줄이다. 다른 건 폴백뿐 — 국내는 야후가 안 되면
                      KRX 저장 종가로 떨어지는데(그때 등락률 대신 기준일을 단다) 미국은
                      그 저장분이 없어 그냥 빈칸이다. 틀린 숫자를 그리는 것보다 낫다. */}
                  <div
                    style={{
                      marginTop: "auto",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      paddingTop: 2,
                      flexWrap: "wrap",
                    }}
                  >
                    {s.price != null ? (
                      <>
                        <span
                          style={{
                            fontFamily: MONO,
                            fontSize: 11,
                            fontWeight: 700,
                            color: C.label,
                            whiteSpace: "nowrap",
                            flexShrink: 0,
                          }}
                        >
                          {fmtPrice(s.price, "US")}
                        </span>
                        <ChangeRate
                          rate={s.changeRate}
                          style={{ fontSize: 11.5, fontWeight: 800 }}
                        />
                      </>
                    ) : (
                      <span style={{ fontSize: 11.5, color: C.sub2 }}>
                        시세를 못 받았습니다
                      </span>
                    )}
                    <span style={{ flex: 1 }} />
                    <UsMddLink ticker={s.ticker} label="MDD" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="hz-sheet-foot">
          <span style={{ fontSize: 11.5, lineHeight: 1.6, color: C.sub }}>
            막대는 최근 7일 일별 언급량이고, 붉은 칸이 배수를 낸 최근 창입니다 ·
            배수는 언급 횟수가 아니라 그날 전체 대화에서 차지한 몫을 견준
            값입니다
          </span>
        </div>
      </section>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
        <section
          className="hz-sheet"
          style={{
            flex: "1 1 calc(50% - 8px)",
            minWidth: SHEET_PAIR_MIN,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <SectionHead
            icon="donut_small"
            title="테마 로테이션"
            note={
              themes.date
                ? `${themes.date.slice(5).replace("-", ".")} 기준`
                : undefined
            }
            desc="미국 종목 얘기가 어느 테마에 몰려 있나 · 막대는 그날 미국 언급 전체에서 차지한 몫"
          />
          {themes.rows.length === 0 ? (
            <p
              style={{
                margin: 0,
                padding: "20px 22px",
                color: C.sub,
                fontSize: 13,
              }}
            >
              아직 집계된 테마가 없습니다.
            </p>
          ) : (
            <>
              <div className="hz-thead hz-cols-ustheme">
                <span>#</span>
                <span>테마</span>
                <span style={{ textAlign: "right" }}>점유율</span>
                <span>최근 14일</span>
                <span style={{ textAlign: "right" }}>종목</span>
                <span style={{ textAlign: "right" }}>주간 순위</span>
              </div>
              {themes.rows.map((t) => (
                <div key={t.theme} className="hz-trow hz-cols-ustheme">
                  <RankBadge n={t.rank} />
                  <span
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 5,
                      minWidth: 0,
                    }}
                  >
                    <span
                      style={{
                        ...clip,
                        fontSize: 13.5,
                        fontWeight: 700,
                        color: C.ink,
                      }}
                    >
                      {t.theme}
                    </span>
                    {/* 막대는 이름 아래에 깐다. 옆 칸으로 빼면 이름 칸이 좁아져 '반도체 장비·소재'가
                      잘리는데, 이 카드에서 가장 먼저 읽히는 건 테마 이름이다. */}
                    <span className="hz-usbar">
                      <span
                        style={{ width: `${Math.min(100, t.sharePct)}%` }}
                      />
                    </span>
                  </span>
                  <span
                    style={{
                      fontFamily: MONO,
                      fontSize: 13,
                      fontWeight: 800,
                      color: C.ink,
                      textAlign: "right",
                    }}
                  >
                    {t.sharePct.toFixed(1)}%
                  </span>
                  {/* ⚠️ Sparkline 을 그리드 자식으로 **직접** 넣지 말 것. 그 컴포넌트는
                    자기 뿌리에 인라인 `display:flex` 를 달고 있어서, 좁은 화면에서 이 칸을
                    접는 미디어쿼리를 인라인이 이긴다(막대 트랙에서 이미 한 번 당했다).
                    display 가 없는 span 으로 한 겹 싸면 접는 쪽이 이긴다. */}
                  <span>
                    <Sparkline data={t.series} width={78} height={24} />
                  </span>
                  <span
                    style={{
                      fontFamily: MONO,
                      fontSize: 11.5,
                      color: C.sub2,
                      textAlign: "right",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {t.stockCount}개
                  </span>
                  {/* RankDelta 는 0 과 null 을 똑같이 '아무것도 안 그림'으로 낸다. 이 표는
                    모든 줄이 같은 기준일과 견주므로 빈칸이면 "자료가 없나?"로 읽힌다 —
                    변동 없음은 글자로 적고, 비교할 과거가 없을 때만 —로 둔다. */}
                  <span style={{ textAlign: "right" }}>
                    {t.rankChange === null ? (
                      <span
                        style={{
                          fontFamily: MONO,
                          fontSize: 11,
                          color: C.sub2,
                        }}
                      >
                        —
                      </span>
                    ) : t.rankChange === 0 ? (
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: C.sub2,
                          whiteSpace: "nowrap",
                        }}
                      >
                        그대로
                      </span>
                    ) : (
                      <RankDelta change={t.rankChange} />
                    )}
                  </span>
                </div>
              ))}
            </>
          )}
          <div className="hz-sheet-foot">
            <span style={{ fontSize: 11.5, lineHeight: 1.6, color: C.sub }}>
              한 종목이 여러 테마에 들 수 있어 점유율을 다 더하면 100%를
              넘습니다 · 국장 테마 점유율과는 분모가 달라 (이쪽은 미국 언급
              전체) 두 숫자를 견주면 안 됩니다
            </span>
          </div>
        </section>
        <section
          className="hz-sheet"
          style={{
            flex: "1 1 calc(50% - 8px)",
            minWidth: SHEET_PAIR_MIN,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <SectionHead
            icon="tag"
            title="미장에서만 나오는 말"
            note="최근 7일"
            desc="종목명이 아닌 화제어 · 전체 대화보다 미국 얘기에 몰린 정도로 줄 세웁니다"
            meta={keywords[0] ? `${keywords[0].computedFor} 기준` : undefined}
          />
          {keywords.length === 0 ? (
            <p
              style={{
                margin: 0,
                padding: "20px 22px",
                color: C.sub,
                fontSize: 13,
              }}
            >
              아직 화제어 집계가 없습니다. 한 말이 여러 채널·여러 날에 20회 넘게
              나와야 줄에 오릅니다.
            </p>
          ) : (
            <>
              <div className="hz-thead hz-cols-uskw">
                <span>#</span>
                <span>화제어</span>
                <span
                  className="hz-tip hz-tip-wide hz-tip-end"
                  data-tip="전체 대화에서 이 말이 나온 횟수 중 미국 얘기가 차지한 몫을, 미국 얘기의 평소 몫으로 나눈 값입니다. 1이면 전체와 같은 정도로 나온 말이고, 클수록 미국 얘기에서만 나오는 말입니다."
                  data-ga-tip="us_keyword_skew"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "flex-end",
                    gap: 3,
                    cursor: "help",
                  }}
                >
                  쏠림
                  <Icon name="help" style={{ fontSize: 12, color: C.hint }} />
                </span>
                <span style={{ textAlign: "right" }}>표본</span>
              </div>
              {keywords.map((k) => (
                <div key={k.keyword} className="hz-trow hz-cols-uskw">
                  <RankBadge n={k.rank} />
                  <span
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: 6,
                      minWidth: 0,
                    }}
                  >
                    <span
                      style={{
                        ...clip,
                        minWidth: 0,
                        fontSize: 13.5,
                        fontWeight: 700,
                        color: C.ink,
                      }}
                    >
                      {k.keyword}
                    </span>
                    {/* 화살표는 쏠림이 아니라 **관심의 방향**이다(최근 3일 vs 그 이전 점유율).
                        둘을 한 칸에 두면 같은 줄에서 두 가지를 말하게 되므로 이름 옆에 붙인다. */}
                    {k.trend && k.trend !== "flat" && (
                      <span
                        style={{
                          fontSize: 10.5,
                          fontWeight: 800,
                          color:
                            k.trend === "up"
                              ? "var(--c-hot-ink)"
                              : "var(--c-cold-ink)",
                          flexShrink: 0,
                        }}
                      >
                        {k.trend === "up" ? "▲" : "▼"}
                      </span>
                    )}
                  </span>
                  <span style={{ textAlign: "right" }}>
                    <Pill tone="hot">{k.skew.toFixed(1)}배</Pill>
                  </span>
                  <span
                    style={{
                      fontFamily: MONO,
                      fontSize: 11,
                      color: C.sub2,
                      textAlign: "right",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {k.mentionCount}/{k.totalCount}회 · {k.channelCount}채널
                  </span>
                </div>
              ))}
            </>
          )}
          <div className="hz-sheet-foot" style={{ marginTop: "auto" }}>
            <span style={{ fontSize: 11.5, lineHeight: 1.6, color: C.sub }}>
              종목명은 뺐습니다. 그건 위 두 카드가 말합니다 · 빈도로 줄 세우면
              국장 화제어와 절반 넘게 겹쳐, 쏠림으로 봅니다 · ▲▼는 쏠림이 아니라
              최근 사흘 관심의 방향입니다
            </span>
          </div>
        </section>
      </div>

      <SectionCaps label="무슨 얘기가 오갔나" count={2} />

      <section className="hz-sheet">
        {/* 머리를 TrendingTabs 가 그린다 — 기간 탭이 머리 우측에 앉고 목록은 그 아래라
            둘이 상태를 공유해야 한다. 국장과 같은 컴포넌트를 그대로 쓴다. */}
        <TrendingTabs
          icon="campaign"
          title="트렌딩 메시지"
          desc="미국 종목을 말한 글 중 조회·공유로 가장 널리 퍼진 것"
          panels={[
            {
              key: "today",
              label: "오늘",
              count: trendToday.length,
              node: <UsTrendingList items={trendToday} />,
            },
            {
              key: "w7",
              label: "최근 7일",
              count: trendWeek.length,
              node: <UsTrendingList items={trendWeek} />,
            },
            {
              key: "w30",
              label: "최근 30일",
              count: trendMonth.length,
              node: <UsTrendingList items={trendMonth} />,
            },
          ]}
        />
      </section>

      <section className="hz-sheet">
        <SectionHead
          icon="query_stats"
          title="주요 종목 리포트"
          note={`최근 ${US_WINDOW_DAYS}일`}
          desc="가장 많이 회자된 미국 종목과, 그 종목을 두고 무슨 이야기가 오갔는지"
        />
        {reports.length === 0 ? (
          <p
            style={{
              margin: 0,
              padding: "20px 22px",
              color: C.sub,
              fontSize: 13,
            }}
          >
            아직 집계된 종목이 없습니다.
          </p>
        ) : (
          <div className="hz-panelgrid hz-panelgrid-2">
            {reports.map((r) => {
              const peak = Math.max(0, ...r.series);
              return (
                <div key={r.ticker} className="hz-panel-pad">
                  {/* 순위 배지가 아니라 **로고 + 종목명**이다. 이 시트는 순위표가 아니라
                      종목별 리포트라, 몇 등인지보다 어느 회사인지가 먼저 읽혀야 한다
                      (급부상 셀은 반대라 그쪽엔 배지가 남는다).
                      폰에서는 시세가 다음 줄로 내려간다(globals.css 의 .hz-stock-head). */}
                  <div
                    className="hz-stock-head"
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: 10,
                      minWidth: 0,
                    }}
                  >
                    <StockLogo
                      code={r.ticker}
                      name={r.name}
                      market="US"
                      size={30}
                    />
                    <strong
                      style={{
                        ...clip,
                        minWidth: 0,
                        fontSize: 17,
                        fontWeight: 800,
                        letterSpacing: "-.02em",
                        color: C.ink,
                      }}
                    >
                      {r.name}
                    </strong>
                    {r.name !== r.ticker && (
                      <span
                        style={{
                          fontFamily: MONO,
                          fontSize: 11,
                          color: C.sub2,
                          flexShrink: 0,
                        }}
                      >
                        {r.ticker}
                      </span>
                    )}
                    {r.price != null && (
                      <span
                        className="hz-stock-price"
                        style={{
                          display: "flex",
                          alignItems: "baseline",
                          gap: 7,
                          whiteSpace: "nowrap",
                          flexShrink: 0,
                        }}
                      >
                        <span
                          style={{
                            fontFamily: MONO,
                            fontSize: 15,
                            fontWeight: 800,
                            color: C.ink,
                            letterSpacing: "-.02em",
                          }}
                        >
                          {fmtPrice(r.price, "US")}
                        </span>
                        <ChangeRate
                          rate={r.changeRate}
                          style={{ fontSize: 12.5, fontWeight: 800 }}
                        />
                      </span>
                    )}
                  </div>

                  {/* hot = 큰 숫자가 실제로 센 날 수. 창 밖 칸은 막대가 옅어진다.
                      tone="cold" 인 것도 국장과 같다 — 급부상 셀이 warm 이라, 같은 파랑으로
                      두면 두 카드가 "뜨거운 것"과 "많이 오간 것"으로 구분된다. */}
                  <DayBars
                    values={r.series}
                    dates={r.seriesDates}
                    tone="cold"
                    hot={US_WINDOW_DAYS}
                    peakLabel={peak > 0 ? `최다 ${peak}회` : undefined}
                  />

                  {r.narrative ? (
                    <div
                      style={{
                        display: "flex",
                        gap: 9,
                        background: C.soft,
                        borderRadius: R.control,
                        padding: "12px 13px",
                      }}
                    >
                      <AiMark
                        size={15}
                        style={{ flexShrink: 0, marginTop: 1 }}
                      />
                      <p
                        style={{
                          margin: 0,
                          fontSize: 13,
                          lineHeight: 1.7,
                          color: "var(--c-ink-soft)",
                          textWrap: "pretty",
                          wordBreak: "keep-all",
                        }}
                      >
                        {r.narrative}
                      </p>
                    </div>
                  ) : (
                    <p
                      style={{
                        margin: 0,
                        fontSize: 12.5,
                        lineHeight: 1.7,
                        color: C.sub2,
                      }}
                    >
                      이 종목의 흐름 요약은 아직 만들어지지 않았습니다.
                    </p>
                  )}

                  {/* 표본 크기는 왼쪽 아래, MDD 링크는 오른쪽 아래. 한 줄에 마주 보게 두면
                      "이 리포트가 몇 건을 봤나"와 "더 파고들기"가 같은 높이에서 끝난다. */}
                  <div
                    style={{
                      marginTop: "auto",
                      display: "flex",
                      alignItems: "baseline",
                      justifyContent: "space-between",
                      gap: 12,
                      paddingTop: 2,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: MONO,
                        fontSize: 11,
                        color: C.sub2,
                        whiteSpace: "nowrap",
                      }}
                    >
                      언급 {r.recentMentions.toLocaleString("ko-KR")}회
                      {r.channelCount !== null && ` · ${r.channelCount}개 채널`}
                    </span>
                    <UsMddLink ticker={r.ticker} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="hz-sheet-foot">
          <span style={{ fontSize: 11.5, lineHeight: 1.6, color: C.sub }}>
            흐름 요약은 집계와 원문 발췌를 읽어 자동으로 쓴 글입니다 · 무엇이
            화제였는지를 옮긴 것이지 사실 확인을 거친 내용이 아닙니다
          </span>
        </div>
      </section>

      <SectionCaps label="채널" count={2} />

      <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
        <section
          className="hz-sheet"
          style={{
            flex: "1 1 calc(50% - 8px)",
            minWidth: SHEET_PAIR_MIN,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <SectionHead
            icon="podcasts"
            title="미국을 많이 다루는 채널"
            note="최근 30일"
            desc="그 채널이 쓴 글 중 미국 종목을 말한 글의 비중"
          />
          {channels.length === 0 ? (
            <p
              style={{
                margin: 0,
                padding: "20px 22px",
                color: C.sub,
                fontSize: 13,
              }}
            >
              아직 채널별 집계가 없습니다.
            </p>
          ) : (
            channels.map((c, i) => (
              <div key={c.handle} className="hz-trow hz-cols-usch">
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 12,
                    color: C.sub2,
                    textAlign: "right",
                  }}
                >
                  {i + 1}
                </span>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    minWidth: 0,
                  }}
                >
                  <Avatar photoUrl={c.photoUrl} title={c.title} size={26} />
                  <span
                    style={{
                      ...clip,
                      fontSize: 12.5,
                      fontWeight: 700,
                      color: C.ink,
                    }}
                  >
                    {c.title}
                  </span>
                </span>
                {/* 막대가 비중을 그대로 말한다. 숫자만 두면 60%와 40%의 차이가 안 잡힌다. */}
                <span className="hz-usbar">
                  <span style={{ width: pct(c.share) }} />
                </span>
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 12,
                    fontWeight: 700,
                    color: C.label,
                    textAlign: "right",
                  }}
                >
                  {pct(c.share)}
                </span>
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 11,
                    color: C.sub2,
                    textAlign: "right",
                    whiteSpace: "nowrap",
                  }}
                >
                  {c.usMsgs.toLocaleString()}/{c.totalMsgs.toLocaleString()}
                </span>
              </div>
            ))
          )}
          <div className="hz-sheet-foot" style={{ marginTop: "auto" }}>
            <span style={{ fontSize: 11.5, lineHeight: 1.6, color: C.sub }}>
              30일에 100건 넘게 쓴 채널만 셉니다 · 글이 몇 건뿐인 채널은 비중이
              크게 흔들립니다
            </span>
          </div>
        </section>

        <section
          className="hz-sheet"
          style={{
            flex: "1 1 calc(50% - 8px)",
            minWidth: SHEET_PAIR_MIN,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <SectionHead
            icon="balance"
            title="국장 vs 미장 관심 배분"
            note="최근 18일"
            desc="그날 오간 글 중 국내 종목을 말한 비중과 미국 종목을 말한 비중"
          />
          {split.length === 0 ? (
            <p
              style={{
                margin: 0,
                padding: "20px 22px",
                color: C.sub,
                fontSize: 13,
              }}
            >
              아직 일별 집계가 없습니다.
            </p>
          ) : (
            <div
              style={{
                padding: "14px 22px 4px",
                display: "flex",
                flexDirection: "column",
                gap: 7,
              }}
            >
              {split.map((p) => (
                <div
                  key={p.date}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "44px 1fr 96px",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <span
                    style={{ fontFamily: MONO, fontSize: 11, color: C.sub2 }}
                  >
                    {p.date.slice(5)}
                  </span>
                  {/* ⚠️ 누적 막대를 쓰면 안 된다 — 한 글이 국내·미국을 다 말할 수 있어 합이 100%가 아니다.
                      두 줄을 위아래로 겹치지 않게 그려 각자의 비중만 말하게 한다. */}
                  <span
                    style={{ display: "flex", flexDirection: "column", gap: 2 }}
                  >
                    <span className="hz-usbar">
                      <span
                        style={{ width: pct(p.kr / Math.max(1, p.total)) }}
                      />
                    </span>
                    <span className="hz-usbar">
                      <span
                        style={{
                          width: pct(p.us / Math.max(1, p.total)),
                          background: "var(--c-hot)",
                        }}
                      />
                    </span>
                  </span>
                  <span
                    style={{
                      fontFamily: MONO,
                      fontSize: 11,
                      textAlign: "right",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <span style={{ color: C.blue, fontWeight: 700 }}>
                      {Math.round((p.kr / Math.max(1, p.total)) * 100)}%
                    </span>
                    <span style={{ color: C.sub2 }}> · </span>
                    <span style={{ color: C.hot, fontWeight: 700 }}>
                      {Math.round((p.us / Math.max(1, p.total)) * 100)}%
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="hz-sheet-foot" style={{ marginTop: "auto" }}>
            <span style={{ fontSize: 11.5, lineHeight: 1.6, color: C.sub }}>
              {/* 색 이름을 글로 적을 땐 실제 값과 맞는지 본다 — --c-hot 은 붉은 계열이다. */}
              <span style={{ color: C.blue, fontWeight: 700 }}>파랑</span>이
              국내, <span style={{ color: C.hot, fontWeight: 700 }}>빨강</span>
              이 미국입니다 · 한 글이 양쪽을 다 말하기도 해서 둘을 더해도 100%가
              되지 않습니다 · 주말은 전체 글이 크게 줄어 비중이 흔들립니다
            </span>
          </div>
        </section>
      </div>
    </>
  );
}
