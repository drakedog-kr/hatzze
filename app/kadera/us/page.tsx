import type { Metadata } from "next";

import {
  getMarketAttentionSplit,
  getUsChannelShare,
  getUsIssueKeywords,
  getUsKaderaSummary,
  getUsKrComentions,
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
import { C, Icon, MONO } from "../../ui";
import { ExpandableList } from "../ExpandableList";
import {
  Avatar,
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
    getUsKrComentions(12),
    getUsSurgingStocks(6),
    getUsChannelShare(10),
    getUsSentiment(),
    getUsIssueKeywords(),
    getUsThemeRotation(8),
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

  return (
    <>
      {/* ── 오늘의 요약: 이 페이지에서 가장 먼저 읽히는 자리 ─────────────── */}
      <section className="hz-sheet">
        <SectionHead
          icon="auto_awesome"
          title="오늘의 요약"
          note={
            brief.date
              ? `${brief.date.slice(5).replace("-", ".")} 기준`
              : undefined
          }
          desc="아래 카드들의 집계를 읽어 세 대목으로 옮긴 글입니다"
        />
        {brief.paragraphs.length === 0 ? (
          <p
            style={{
              margin: 0,
              padding: "20px 22px",
              color: C.sub,
              fontSize: 13,
            }}
          >
            오늘의 요약을 준비하고 있습니다. 집계가 끝난 뒤 만들어집니다.
          </p>
        ) : (
          <div
            style={{
              padding: "18px 22px",
              display: "flex",
              flexDirection: "column",
              gap: 12,
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
          </div>
        )}
        <div className="hz-sheet-foot">
          <span style={{ fontSize: 11.5, lineHeight: 1.6, color: C.sub }}>
            {/* AiMark 를 안 쓰고 글로 적는다 — 이 시트는 문장이 전부라 아이콘 하나로는
                "무엇이 자동 생성인가"가 안 드러난다. */}
            집계된 숫자를 읽어 자동으로 쓴 글이라 새 사실을 더하지 않습니다 ·
            텔레그램에서 오간 말이지 확인된 사실이 아니며, 매수·매도 신호가
            아닙니다
          </span>
        </div>
      </section>

      {/* ── 머리: 무엇을 보고 있나 ─────────────────────────────────────── */}
      <section className="hz-sheet">
        <SectionHead
          icon="travel_explore"
          title="무엇을 보고 있나"
          desc="국장 카더라와 같은 채널을 봅니다. 사전만 미국 종목으로 바꿔 한 번 더 읽습니다"
        />
        <div className="hz-panelgrid hz-panelgrid-3">
          <div className="hz-panel-pad">
            <div style={{ fontSize: 11.5, color: C.sub2 }}>
              미국 종목을 말하는 채널
            </div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 22,
                fontWeight: 800,
                color: C.ink,
                letterSpacing: "-.02em",
              }}
            >
              {summary.usChannels}
              <span style={{ fontSize: 13, fontWeight: 600, color: C.sub2 }}>
                {" "}
                / {summary.totalChannels}
              </span>
            </div>
            {/* ⭐ 제목은 신호가 아니다 — 실측으로 제목에 '미국'이 든 채널이 만든 언급은 21%뿐이다. */}
            <div style={{ fontSize: 11.5, color: C.sub, marginTop: 2 }}>
              제목에 표시가 없는 채널이 대부분입니다
            </div>
          </div>
          <div className="hz-panel-pad">
            <div style={{ fontSize: 11.5, color: C.sub2 }}>
              최근 {US_WINDOW_DAYS}일 언급
            </div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 22,
                fontWeight: 800,
                color: C.ink,
                letterSpacing: "-.02em",
              }}
            >
              {summary.mentions.toLocaleString()}
              <span style={{ fontSize: 13, fontWeight: 600, color: C.sub2 }}>
                회
              </span>
            </div>
            <div style={{ fontSize: 11.5, color: C.sub, marginTop: 2 }}>
              {summary.tickers}개 종목이 오르내렸습니다
            </div>
          </div>
          <div className="hz-panel-pad">
            <div style={{ fontSize: 11.5, color: C.sub2 }}>가장 최근 집계</div>
            {/* 카드마다 기준일이 다를 수 있어(함께 언급은 창 스냅샷) 머리에 한 번 못박아 둔다. */}
            <div
              style={{
                fontFamily: MONO,
                fontSize: 22,
                fontWeight: 800,
                color: C.ink,
                letterSpacing: "-.02em",
              }}
            >
              {summary.lastDate
                ? summary.lastDate.slice(5).replace("-", ".")
                : "집계 없음"}
            </div>
            <div style={{ fontSize: 11.5, color: C.sub, marginTop: 2 }}>
              평일 아침·저녁 두 번 갱신합니다
            </div>
          </div>
        </div>
      </section>

      <SectionCaps label="미국 소식이 국내로" count={1} />

      {/* ── 함께 언급된 국내 종목: 이 페이지의 존재 이유 ─────────────────── */}
      <section className="hz-sheet">
        <SectionHead
          icon="alt_route"
          title="함께 언급된 국내 종목"
          note={
            comention.windowDays ? `최근 ${comention.windowDays}일` : undefined
          }
          desc="미국 종목 얘기에 같이 불린 국내 종목 · 우연히 함께 나올 확률보다 몇 배나 자주 붙었는지로 줄 세웁니다"
          meta={comention.asOf ? `${comention.asOf} 기준` : undefined}
        />
        {comention.rows.length === 0 ? (
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
          <>
            <div className="hz-thead hz-cols-comention">
              <span>#</span>
              <span>미국</span>
              <span>국내</span>
              <span
                className="hz-tip hz-tip-wide hz-tip-end"
                data-tip="두 종목이 같은 글에 나온 횟수를, 각자 얼마나 자주 등장하는지로 나눈 값입니다. 1이면 우연히 만난 정도이고 클수록 특별히 붙어 다닌다는 뜻입니다. 종목을 잔뜩 나열한 시황 글은 빼고 셉니다."
                data-ga-tip="comention_lift"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  gap: 3,
                  cursor: "help",
                }}
              >
                함께 정도
                <Icon name="help" style={{ fontSize: 12, color: C.hint }} />
              </span>
              <span style={{ textAlign: "right" }}>표본</span>
            </div>
            {comention.rows.map((r, i) => (
              <div
                key={`${r.ticker}-${r.stockCode}`}
                className="hz-trow hz-cols-comention"
              >
                <RankBadge n={i + 1} />
                <span
                  style={{
                    ...clip,
                    fontSize: 14,
                    fontWeight: 700,
                    color: C.ink,
                  }}
                >
                  {r.usName}
                </span>
                <span style={{ minWidth: 0 }}>
                  <span
                    style={{
                      ...clip,
                      display: "block",
                      fontSize: 14,
                      fontWeight: 700,
                      color: C.ink,
                    }}
                  >
                    {r.krName}
                  </span>
                  {/* 폰에서만 보이는 줄. 데스크톱에는 표본 열이 따로 있다(.hz-us-meta). */}
                  <span
                    className="hz-us-meta"
                    style={{ fontFamily: MONO, fontSize: 10.5, color: C.sub2 }}
                  >
                    {r.pairCount}회 · {r.channelCount}채널 · {r.dayCount}일
                  </span>
                </span>
                <span style={{ textAlign: "right" }}>
                  <Pill tone="hot">
                    {r.lift >= 100 ? Math.round(r.lift) : r.lift.toFixed(1)}배
                  </Pill>
                </span>
                {/* ⚠️ 배수만 크게 두면 5회짜리가 279배로 보인다. 표본을 늘 옆에 붙인다 —
                    문턱만으로는 부족하고 보는 사람이 크기를 알아야 한다. */}
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 11.5,
                    color: C.sub2,
                    textAlign: "right",
                    whiteSpace: "nowrap",
                  }}
                >
                  {r.pairCount}회 · {r.channelCount}채널 · {r.dayCount}일
                </span>
              </div>
            ))}
          </>
        )}
        <div className="hz-sheet-foot">
          <span style={{ fontSize: 11.5, lineHeight: 1.6, color: C.sub }}>
            같은 기사가 여러 채널에 퍼지는 일이 잦아, 한 채널·하루에만 나온 짝은
            빼고 셉니다 · 함께 불렸다는 것이지 두 회사가 실제로 엮여 있다는 뜻은
            아닙니다
          </span>
        </div>
      </section>

      <SectionCaps label="지금 뜨는 미국 종목" count={2} />

      {/* ── 급부상 종목 ────────────────────────────────────────────────── */}
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
            {surging.map((s, i) => (
              <div key={s.ticker} className="hz-panel-pad">
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 8,
                    minWidth: 0,
                  }}
                >
                  <RankBadge n={i + 1} />
                  {/* minWidth:0 이 없으면 flex 기본값(min-width:auto) 때문에 이름이 안 줄어 셀 밖으로 넘친다. */}
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
                  {/* 한글 표기가 없어 티커를 그대로 이름으로 쓰는 종목이 있다(RTX·TEAM).
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
                      {US_WINDOW_DAYS}일 {s.recentMentions}회
                    </span>
                  </span>
                </div>
                {/* 국장 급부상 셀과 같은 세로 구성이다(머리 → 큰 배수 → 막대). 두 페이지의
                    같은 카드가 다른 얼개면 옮겨 다닐 때마다 눈이 다시 자리를 찾아야 한다.
                    다른 건 마지막 줄뿐 — 미국 종목은 시세를 실을 출처가 없어 가격 줄이 없다. */}
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
              </div>
            ))}
          </div>
        )}
        <div className="hz-sheet-foot">
          <span style={{ fontSize: 11.5, lineHeight: 1.6, color: C.sub }}>
            주말이면 전체 대화량이 평일의 10분의 1로 줄어, 횟수가 아니라 그날
            대화에서 차지한 몫으로 견줍니다 · 화제성일 뿐 매수·매도 신호가
            아닙니다
          </span>
        </div>
      </section>

      {/* ── 테마 로테이션 ─────────────────────────────────────────────── */}
      <section className="hz-sheet">
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
                    <span style={{ width: `${Math.min(100, t.sharePct)}%` }} />
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
                      style={{ fontFamily: MONO, fontSize: 11, color: C.sub2 }}
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
            한 종목이 여러 테마에 들 수 있어 점유율을 다 더하면 100%를 넘습니다
            · 국장 테마 점유율과는 분모가 달라 (이쪽은 미국 언급 전체) 두 숫자를
            견주면 안 됩니다
          </span>
        </div>
      </section>

      <SectionCaps label="무슨 얘기가 오갔나" count={4} />

      {/* ── 트렌딩 메시지 ─────────────────────────────────────────────── */}
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

      <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
        {/* ── 생태계 센티먼트 ───────────────────────────────────────────── */}
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
            icon="mood"
            title="생태계 센티먼트"
            note={sentiment ? `최근 ${sentiment.windowDays}일` : undefined}
            desc="미국 종목을 말한 글의 톤 · 중립을 뺀 낙관↔비관 비율입니다"
          />
          {!sentiment ? (
            <p
              style={{
                margin: 0,
                padding: "20px 22px",
                color: C.sub,
                fontSize: 13,
              }}
            >
              아직 미국 종목 얘기의 톤 집계가 없습니다.
            </p>
          ) : (
            <div
              style={{
                padding: "18px 22px",
                display: "flex",
                flexDirection: "column",
                gap: 16,
                flex: 1,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <strong
                  style={{
                    fontFamily: MONO,
                    fontSize: 40,
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
                      fontSize: 20,
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
                    marginTop: 2,
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

              {/* 톤 구성 세 갈래. 위 큰 숫자는 중립을 **뺀** 값이라, 뺀 게 얼마나 되는지
                  보여 주지 않으면 78% 가 "글의 78%가 낙관"으로 읽힌다.
                  ⚠️ 순서는 반드시 비관 → 중립 → 낙관이다. 이 카드의 막대가 셋인데 아래 둘은
                     왼쪽이 비관이라, 이 막대만 낙관을 왼쪽에 두면 같은 색이 카드 안에서
                     서로 반대 방향으로 자란다(실제로 그렇게 그렸다가 되돌렸다). */}
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: ".04em",
                    color: C.sub,
                  }}
                >
                  톤 구성
                </span>
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

              {/* ⭐ 이 카드의 값어치는 큰 숫자가 아니라 **이 비교**다. 같은 채널·같은 사흘인데
                  미국 얘기의 톤과 전체 대화의 톤이 다르다는 건 우리만 낼 수 있는 숫자다.
                  ⚠️ 아랫줄은 '국장'이 아니라 '전체 대화'다 — 그 집계에는 미국 얘기도 들어 있다.
                  위 큰 숫자와 첫 줄이 같은 값인 건 중복이 아니라 **기준점**이다. 견줄 대상
                  하나만 그리면 78 과 74 중 어느 쪽이 미국인지 알 수 없다. */}
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: ".04em",
                    color: C.sub,
                  }}
                >
                  전체 대화와 견주면
                </span>
                <SplitBar label="미국 얘기" score={sentiment.score} strong />
                {sentiment.overallScore !== null && (
                  <SplitBar label="전체 대화" score={sentiment.overallScore} />
                )}
              </div>

              {/* 일별 톤. 스파크라인 한 줄로는 "어느 날이 왜 튀었나"를 못 짚는다 —
                  날짜를 붙여야 사흘 창의 78% 가 어디서 왔는지 눈으로 따라갈 수 있다. */}
              {sentiment.series.length >= 3 && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    marginTop: "auto",
                    paddingTop: 6,
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: ".04em",
                      color: C.sub,
                    }}
                  >
                    일별 낙관도 · 최근 {sentiment.series.length}일
                  </span>
                  {sentiment.series.map((p, i) => {
                    const isWindow =
                      i >= sentiment.series.length - sentiment.windowDays;
                    return (
                      <div
                        key={p.date}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "38px 1fr 34px",
                          alignItems: "center",
                          gap: 9,
                        }}
                      >
                        <span
                          style={{
                            fontFamily: MONO,
                            fontSize: 10.5,
                            color: isWindow ? C.label : C.sub2,
                          }}
                        >
                          {p.date.slice(5)}
                        </span>
                        {/* 창 밖의 날은 옅게 — 위 큰 숫자가 센 사흘이 어디인지 색으로 말한다. */}
                        <span
                          style={{
                            display: "flex",
                            height: 6,
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
                            fontSize: 10.5,
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
            </div>
          )}
          <div className="hz-sheet-foot" style={{ marginTop: "auto" }}>
            <span style={{ fontSize: 11.5, lineHeight: 1.6, color: C.sub }}>
              메시지별로 매긴 톤을 센 것이고 새로 분류하지 않습니다 · 아랫줄
              &ldquo;전체 대화&rdquo;에는 미국 얘기도 들어 있어 국내만 따로 잰
              값이 아닙니다
            </span>
          </div>
        </section>

        {/* ── 미장 화제어 ──────────────────────────────────────────────── */}
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

      {/* ── 주요 종목 리포트 ──────────────────────────────────────────── */}
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
            {reports.map((r, i) => (
              <div key={r.ticker} className="hz-panel-pad">
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 8,
                    minWidth: 0,
                  }}
                >
                  <RankBadge n={i + 1} />
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
                  <span style={{ flex: 1 }} />
                  <span
                    style={{
                      fontFamily: MONO,
                      fontSize: 11.5,
                      fontWeight: 700,
                      color: C.label,
                      whiteSpace: "nowrap",
                    }}
                  >
                    언급 {r.recentMentions.toLocaleString()}회
                    {r.channelCount !== null && ` · ${r.channelCount}개 채널`}
                  </span>
                </div>
                {/* 문장이 이 셀의 본론이다. 막대는 그 아래 보조로 둔다 — 반대로 두면
                    카드가 '숫자 카드'가 되고 급부상 종목과 구분이 사라진다. */}
                {r.narrative ? (
                  <p
                    style={{
                      margin: 0,
                      fontSize: 13,
                      lineHeight: 1.75,
                      color: "var(--c-ink-soft)",
                      wordBreak: "keep-all",
                      textWrap: "pretty",
                    }}
                  >
                    {r.narrative}
                  </p>
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
                <div style={{ marginTop: "auto", paddingTop: 2 }}>
                  <DayBars
                    values={r.series}
                    dates={r.seriesDates}
                    tone="warm"
                    hot={US_WINDOW_DAYS}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="hz-sheet-foot">
          <span style={{ fontSize: 11.5, lineHeight: 1.6, color: C.sub }}>
            흐름 요약은 집계와 원문 발췌를 읽어 자동으로 쓴 글입니다 · 무엇이
            화제였는지를 옮긴 것이지 사실 확인을 거친 내용이 아닙니다
          </span>
        </div>
      </section>

      <SectionCaps label="어디를 보고 있나" count={2} />

      <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
        {/* ── 채널의 미장 비중 ──────────────────────────────────────────── */}
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

        {/* ── 국장 vs 미장 관심 배분 ────────────────────────────────────── */}
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

      <section className="hz-sheet">
        <div style={{ padding: "16px 22px" }}>
          <span style={{ fontSize: 12, lineHeight: 1.6, color: C.sub }}>
            한국 주식 텔레그램 채널들이 미국 종목을 두고 무엇을 말하는지 모아
            보여줍니다 · 언급량과 함께 불린 정도를 잰 것이며, 매수·매도 신호가
            아닙니다
          </span>
        </div>
      </section>
    </>
  );
}
