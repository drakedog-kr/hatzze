import type { Metadata } from "next";
import Link from "next/link";

import {
  getUsChannelShare,
  getUsIssueKeywords,
  getUsKaderaSummary,
  getUsSentiment,
  getUsDailyBrief,
  getUsStockBreadth,
  getUsStockReports,
  getUsSurgingStocks,
  getUsThemeRotation,
  getUsTrendingMessages,
  US_WINDOW_DAYS,
} from "@/lib/us-telegram-data";
import type { UsTrendingMessage } from "@/lib/us-telegram-data";

import { formatKstUpdate } from "@/lib/format";

import { pageMetadata } from "../../seo";
import { AiMark, C, Icon, MONO, R } from "../../ui";
import { StockLogo } from "../../StockLogo";
import { ExpandableList } from "../ExpandableList";
import {
  Avatar,
  ChangeRate,
  DayBars,
  Highlight,
  Pill,
  RankBadge,
  RankDelta,
  SectionCaps,
  Sparkline,
  highlightTerms,
  termsFor,
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
    breadth,
  ] = await Promise.all([
    getUsKaderaSummary(),
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
    getUsStockBreadth(10),
  ]);

  /* 카드 위 하이라이트 두 칸에 쓸 최대·최소. 표 순서와는 무관하므로 따로 고른다.
     ⚠️ shareDelta 가 null 인 줄(비교할 7일 전 집계가 없는 테마)은 후보에서 뺀다 —
     0 으로 치면 "변동 없음"이 "가장 많이 유입"으로 올라온다. */
  const movedThemes = themes.rows.filter((t) => t.shareDelta !== null);
  const themeIn = movedThemes.length
    ? movedThemes.reduce((a, b) => (b.shareDelta! > a.shareDelta! ? b : a))
    : null;
  const themeOut = movedThemes.length
    ? movedThemes.reduce((a, b) => (b.shareDelta! < a.shareDelta! ? b : a))
    : null;
  /* 화제어의 '가장 큰 변동'은 **위아래를 가리지 않는다**(절댓값 최대). 늘어난 말만
     세우면 관심이 빠진 자리가 화면에서 통째로 안 보인다. 동점은 순위로 가른다 —
     안 가르면 실행마다 다른 말이 뜬다. */
  const kwMoved =
    keywords
      .filter((k) => k.shareDelta !== null)
      .sort(
        (a, b) => Math.abs(b.shareDelta!) - Math.abs(a.shareDelta!) || a.rank - b.rank,
      )[0] ?? null;

  /* 요약 글에서 굵게 집을 낱말. **오늘 이 화면이 이미 뽑아 둔 것**만 쓴다(국장과 같은
     규칙 — parts.tsx 의 highlightTerms 주석 참고). 여기 없는 종목은 요약에 나와도
     굵어지지 않는다. 회자되는 것과 지나가는 이름을 가르는 것이 이 목록의 일이다.
     ⚠️ 한글 표기를 쓴다 — 요약 글이 티커가 아니라 이름으로 쓰여 있다. */
  const summaryTerms = termsFor(
    surging.map((x) => x.name),
    reports.map((x) => x.name),
    themes.rows.slice(0, 4).map((x) => x.theme),
    keywords.slice(0, 5).map((x) => x.keyword),
  );

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

                {/* 큰 숫자와 **같은 값**을 그림으로 되풀이한다(국장 히어로와 같은 규칙).
                    ⚠️ 중립은 안 그린다. 예전엔 비관·중립·낙관 세 칸이었는데, 그러면 이
                    막대만 원자료를 말하고 바로 위 큰 숫자(중립 뺀 환산값)와 어긋난다 —
                    한 칸 안에서 76% 와 '낙관 49' 가 나란히 서서 어느 쪽이 참인지 읽는
                    사람이 판단해야 했다. 중립을 얼마나 뺐는지는 위 캡션 한 줄로 족하다. */}
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 7 }}
                >
                  <span
                    style={{
                      display: "flex",
                      height: 11,
                      borderRadius: 3,
                      overflow: "hidden",
                    }}
                  >
                    <span
                      style={{
                        width: `${100 - sentiment.score}%`,
                        background: "var(--c-blue-2)",
                      }}
                    />
                    <span
                      style={{
                        width: `${sentiment.score}%`,
                        background: "var(--c-warm-2)",
                      }}
                    />
                  </span>
                  {/* 두 라벨을 막대의 양 끝에 붙여 어느 쪽이 어느 색인지 위치로 읽히게 한다. */}
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
                      비관 {100 - sentiment.score}
                    </span>
                    <span style={{ color: "var(--c-hot-ink)" }}>
                      낙관 {sentiment.score}
                    </span>
                  </div>
                </div>

                {/* 테마별 낙관↔비관. 위 큰 숫자와 **같은 사흘**을 쪼갠 것이라, 76% 가
                    어느 테마에서 온 값인지 눈으로 따라갈 수 있다(국장 히어로와 같은 자리·
                    같은 얼개). marginTop:auto — 옆 칸 문단의 밑선에 맞춰 바닥에 붙인다.
                    두 칸은 같은 높이로 늘어나므로, 둘 다 바닥에 붙이면 밑선이 정확히 같다. */}
                {sentiment.byTheme.length > 0 && (
                  <div
                    style={{
                      marginTop: "auto",
                      display: "flex",
                      flexDirection: "column",
                      gap: 9,
                      paddingTop: 14,
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
                      인기 테마별 비관 ↔ 낙관
                    </span>
                    {sentiment.byTheme.map((t) => (
                      <div
                        key={t.name}
                        className="hz-tip hz-tip-wide"
                        data-tip={`${t.name} 언급 ${t.total}건 중 비관 ${t.negative}건 · 낙관 ${t.positive}건 (중립 제외 비율)`}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          minWidth: 0,
                        }}
                      >
                        {/* 이름 칸 폭을 고정한다 — flex 로 두면 테마명 길이에 따라 막대
                            시작점이 행마다 어긋나 눈이 세로로 훑질 못한다.
                            ⚠️ 국장(62px)보다 넓다. 미장 테마명이 더 길어서다
                            ('반도체 장비·소재' · 'AI 인프라·클라우드'). */}
                        <span
                          style={{
                            ...clip,
                            width: 86,
                            flexShrink: 0,
                            fontSize: 11,
                            fontWeight: 700,
                            color: C.label,
                          }}
                        >
                          {t.name}
                        </span>
                        <span
                          style={{
                            flex: 1,
                            minWidth: 0,
                            display: "flex",
                            height: 7,
                            borderRadius: 999,
                            overflow: "hidden",
                          }}
                        >
                          <span
                            style={{
                              width: `${100 - t.pos}%`,
                              background: "var(--c-blue-3)",
                            }}
                          />
                          <span
                            style={{
                              width: `${t.pos}%`,
                              background: "var(--c-warm-3)",
                            }}
                          />
                        </span>
                      </div>
                    ))}
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
                {(() => {
                  /* 굵힌 낱말을 **세 대목에 걸쳐** 기억한다. 대목마다 새로 세면 엔비디아가
                     2·3대목에서 각각 한 번씩 굵어져 화면에는 두 번으로 보인다(국장과 같은
                     규칙 — 함정은 parts.tsx 의 highlightTerms 주석에). */
                  const used = new Set<string>();
                  return brief.paragraphs.map((para, i) => (
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
                      {/* particleAfterLatin — "TSMC의 7월 매출"의 TSMC 를 굵힌다.
                          국장에선 안 켠다(이름이 한글이라 필요가 없고, 켜 봐야 판정만
                          늘어난다). 규칙과 실측은 parts.tsx 의 목록 주석에. */}
                      {highlightTerms(para, summaryTerms, used, {
                        particleAfterLatin: true,
                      })}
                    </p>
                  ));
                })()}
              </div>
            )}
            {/* 기준 시각은 **언제나 이 칸 맨 아래 왼쪽**이다 — 요약 글이 날마다 3줄·4줄로
                달라져도 자리가 안 흔들려야 "이 화면의 기준 시각"으로 읽힌다(국장 카더라·
                시장 브리핑 히어로가 쓰는 것과 같은 조판·같은 schedule 아이콘).
                formatKstUpdate 가 이미 "… 기준"으로 끝난다 — 또 붙이면 "기준 기준". */}
            {summary.lastUpdated && (
              <div
                style={{
                  marginTop: "auto",
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  paddingTop: 10,
                }}
              >
                <Icon name="schedule" style={{ fontSize: 14, color: C.muted }} />
                <span style={{ fontSize: 11.5, color: C.sub }}>
                  최종 업데이트 · {formatKstUpdate(summary.lastUpdated)}
                </span>
              </div>
            )}
          </div>
        </div>
        {/* 이 문장은 빼면 안 된다(공개 저장소·법률). 히어로 시트의 각주 띠에 두면 첫
            화면 안에 들면서도 그래픽을 밀어내지 않는다 — 국장 히어로와 같은 자리다. */}
        <div className="hz-sheet-foot">
          <span style={{ fontSize: 12, lineHeight: 1.6, color: C.sub }}>
            미장 주식 텔레그램 채널들이 지금 무엇에 주목하는지를 모아 보여줍니다 · 조회·확산·언급량을 종합한 화제성 지표이며, 매수·매도 신호가 아닙니다
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
            note="7일 전 대비"
            noteHelp="점유율과 순위는 기준일 하루치입니다. 유입·이탈과 주간 순위는 그 하루를 7일 전 같은 날과 견줍니다."
            desc="미국 종목 얘기가 어느 테마에 몰려 있나 · 막대는 그날 미국 언급 전체에서 차지한 몫"
            meta={themes.date ? `${themes.date} 기준` : undefined}
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
              <div
                className="hz-kd-duo"
                style={{ borderBottom: "1px solid var(--c-sheet-line)" }}
              >
                <Highlight
                  cap="가장 많이 유입"
                  name={themeIn?.theme ?? "—"}
                  value={themeIn ? `▲${themeIn.shareDelta!.toFixed(1)}%p` : undefined}
                  valueColor="var(--c-hot-ink)"
                  sub={
                    themeIn
                      ? `점유율 ${themeIn.sharePct.toFixed(1)}% · ${themeIn.rank}위`
                      : "비교할 7일 전 집계가 없습니다"
                  }
                  divide
                />
                <Highlight
                  cap="가장 많이 이탈"
                  name={themeOut?.theme ?? "—"}
                  value={
                    themeOut
                      ? `▼${Math.abs(themeOut.shareDelta!).toFixed(1)}%p`
                      : undefined
                  }
                  valueColor="var(--c-cold-ink)"
                  sub={
                    themeOut
                      ? themeOut.rankChange
                        ? `순위도 ${Math.abs(themeOut.rankChange)}계단 ${themeOut.rankChange > 0 ? "상승" : "하락"}`
                        : `점유율 ${themeOut.sharePct.toFixed(1)}% · ${themeOut.rank}위`
                      : "비교할 7일 전 집계가 없습니다"
                  }
                />
              </div>

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
            title="이슈 키워드"
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
              <div
                className="hz-kd-duo"
                style={{ borderBottom: "1px solid var(--c-sheet-line)" }}
              >
                <Highlight
                  cap="이번 주 화제어 1위"
                  name={keywords[0].keyword}
                  value={`${keywords[0].mentionCount.toLocaleString("ko-KR")}회`}
                  valueColor="var(--c-hot-ink)"
                  sub={`쏠림 ${keywords[0].skew.toFixed(1)}배 · ${keywords[0].channelCount}개 채널`}
                  divide
                />
                {/* ⚠️ 국장은 이 자리에 "2위의 N배"를 적는다. 미장에선 그러면 안 된다 —
                    국장 카드는 **언급 수** 순이라 1위와 2위의 배수가 곧 순위의 근거지만,
                    이 카드는 **쏠림** 순이다. 실제로 1위 22회 · 2위 22회가 나와 "2위의
                    1.0배"라는 아무 말도 안 하는 줄이 떴다. 순위를 정한 값(쏠림)을 적는다.
                    ⭐ 아래 값의 소수 둘째 자리는 눈속임이 아니다 — 화제어 하나의 점유율이
                    0.0~0.5% 대라 한 자리로 자르면 실측 변동(0.03~0.25%p)이 전부 0.0 이
                    된다. 옆 테마 칸이 한 자리인 것과 다른 이유가 이것뿐이다. */}
                <Highlight
                  cap="가장 큰 변동"
                  name={kwMoved?.keyword ?? "—"}
                  value={
                    kwMoved
                      ? `${kwMoved.shareDelta! > 0 ? "▲" : "▼"}${Math.abs(kwMoved.shareDelta! * 100).toFixed(2)}%p`
                      : undefined
                  }
                  valueColor={
                    kwMoved && kwMoved.shareDelta! > 0
                      ? "var(--c-hot-ink)"
                      : "var(--c-cold-ink)"
                  }
                  sub={
                    kwMoved
                      ? "최근 3일 vs 그 이전 점유율"
                      : "비교할 과거 집계가 없습니다"
                  }
                />
              </div>

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
            icon="hub"
            title="몇 곳이 말하나"
            note={
              breadth.windowDays ? `최근 ${breadth.windowDays}일` : undefined
            }
            desc="그 종목을 언급한 서로 다른 채널 수 · 많을수록 한두 곳이 아니라 여러 곳에서 오르내린 이야기입니다"
          />
          {breadth.rows.length === 0 ? (
            <p
              style={{
                margin: 0,
                padding: "20px 22px",
                color: C.sub,
                fontSize: 13,
              }}
            >
              아직 채널 집계가 없습니다.
            </p>
          ) : (
            breadth.rows.map((b, i) => (
              <div key={b.ticker} className="hz-trow hz-cols-usbreadth">
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
                  <StockLogo
                    code={b.ticker}
                    name={b.name}
                    market="US"
                    size={22}
                  />
                  <span
                    style={{
                      ...clip,
                      fontSize: 13,
                      fontWeight: 700,
                      color: C.ink,
                    }}
                  >
                    {b.name}
                  </span>
                </span>
                {/* 막대의 분모는 **모니터링 채널 전체**다. 상위 종목 대비로 그리면
                    1위가 늘 꽉 차서 "전체의 몇 곳인가"라는 뜻이 사라진다. */}
                <span className="hz-usbar">
                  <span
                    style={{
                      width: pct(
                        b.channelCount / Math.max(1, breadth.totalChannels),
                      ),
                    }}
                  />
                </span>
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 13,
                    fontWeight: 800,
                    color: C.ink,
                    textAlign: "right",
                    whiteSpace: "nowrap",
                  }}
                >
                  {b.channelCount}
                  <span
                    style={{ fontSize: 11, fontWeight: 700, color: C.sub2 }}
                  >
                    곳
                  </span>
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
                  {b.mentionCount.toLocaleString()}회
                </span>
              </div>
            ))
          )}
          <div className="hz-sheet-foot" style={{ marginTop: "auto" }}>
            <span style={{ fontSize: 11.5, lineHeight: 1.6, color: C.sub }}>
              막대는 모니터링 채널 {breadth.totalChannels}곳 중 몇 곳이
              말했는지입니다 · 같은 채널이 며칠에 걸쳐 말해도 한 곳으로 셉니다
            </span>
          </div>
        </section>
      </div>
    </>
  );
}
