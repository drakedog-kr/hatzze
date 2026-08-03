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
import type { ThemeRotation, TrendingMessage } from "@/lib/telegram-data";

import { formatKstUpdate } from "@/lib/format";

import { KADERA_CARD } from "../og-copy";
import { pageMetadata } from "../seo";
import { AiMark, C, Icon, MONO } from "../ui";
import { ExpandableList } from "./ExpandableList";
import { Avatar, ChangeRate, DayBars, Pill, QuoteDate, RankBadge, SectionCaps } from "./parts";
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

/** 시트 안 열 머리·데이터 행이 공유하는 격자. 한 곳에서 내야 두 줄의 칸이 어긋나지 않는다. */
const CHANNEL_COLS = "24px minmax(0,1fr) 54px 56px 54px";
const RISING_COLS = "24px minmax(0,1fr) minmax(60px,1.3fr) 62px";
const THEME_COLS = "minmax(80px,1fr) 52px minmax(70px,1.3fr) 50px";
const KEYWORD_COLS = "26px minmax(80px,1fr) minmax(70px,1.5fr) 58px";

/** 시트 안 '2분할 하이라이트'(테마 로테이션·이슈 키워드의 머리 아래 두 칸). */
function Highlight({ cap, name, value, valueColor, sub, divide }: {
  cap: string;
  name: string;
  value?: string;
  valueColor?: string;
  sub: string;
  divide?: boolean;
}) {
  return (
    <div
      style={{
        padding: "14px 22px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        minWidth: 0,
        boxShadow: divide ? "inset -1px 0 0 var(--c-sheet-row)" : undefined,
      }}
    >
      <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: ".08em", color: C.sub2 }}>{cap}</span>
      <div style={{ display: "flex", alignItems: "baseline", gap: 7, minWidth: 0 }}>
        <strong style={{ ...clip, fontSize: 16, fontWeight: 800, letterSpacing: "-.02em", color: C.ink }}>{name}</strong>
        {value && <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: valueColor, flexShrink: 0 }}>{value}</span>}
      </div>
      <span style={{ ...clip, fontSize: 10.5, color: C.sub2 }}>{sub}</span>
    </div>
  );
}

/** 유입/이탈 그룹을 가르는 알약. 두 그룹이 같은 눈금을 쓰므로 색만 방향을 말한다. */
function GroupTag({ dir }: { dir: "in" | "out" }) {
  const inflow = dir === "in";
  return (
    <div style={{ padding: "10px 22px 7px" }}>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: ".04em",
          color: inflow ? "var(--c-hot-ink)" : "var(--c-cold-ink)",
          background: inflow ? "var(--c-hot-tint)" : "var(--c-cold-tint)",
          borderRadius: 999,
          padding: "3px 9px",
        }}
      >
        <Icon name={inflow ? "north_east" : "south_west"} style={{ fontSize: 12 }} />
        {inflow ? "유입" : "이탈"}
      </span>
    </div>
  );
}

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
      <li key={`${m.channelHandle}-${m.messageId}`} style={{ display: "flex", padding: "18px 22px", gap: 12, minWidth: 0 }}>
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
              <span style={{ fontSize: 10.5, fontFamily: MONO, color: C.faint }}>{timeAgo(m.postedAt)}</span>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 9.5, fontFamily: MONO, fontWeight: 800, color: C.sub2 }}>#{i + 1}</span>
            </div>

            <div className="hz-bubble">
              {/* overflowWrap:anywhere 가 없으면 원문에 섞인 긴 URL 이 줄바꿈을 못 해
                  말풍선 밖으로 잘려 나간다(실제로 뉴스 링크가 통째로 잘려 있었다). */}
              <p
                style={{
                  margin: 0,
                  fontSize: 12,
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
                        fontSize: 9.5,
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
      listClassName="hz-cellgrid hz-cellgrid-auto"
      footerStyle={{ margin: 0, padding: "12px 22px", borderTop: "1px solid var(--c-sheet-line)" }}
    />
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
      // 3×2 셀 격자라 여섯이어야 줄이 찬다(예전 카드 배치에선 다섯이었다).
      getSurgingStocks(6),
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

  const activeRate = summary.channelCount > 0 ? (summary.activeChannels / summary.channelCount) * 100 : 0;

  /* 채널을 세는 세 줄은 전부 **지금 수집 중인 채널**을 센다(getTelegramSummary 주석).
     목록에 있어도 peer 캐시가 없어 한 건도 안 걷히는 채널은 모니터링하고 있는 것이
     아니다. 화면에 덧붙이는 표시는 없다 — 숫자 자체가 사실이면 설명할 것이 없다. */
  const miniStats: { label: string; note?: string; value: string; unit: string; help?: string }[] = [
    { label: "모니터링 채널", value: `${summary.channelCount}`, unit: "개" },
    { label: "총 구독자", value: formatKR(summary.totalSubscribers).replace(/[만억]$/, ""), unit: formatKR(summary.totalSubscribers).slice(-1) },
    { label: "활성 채널", note: "7일", value: `${summary.activeChannels}`, unit: "개", help: "최근 7일 안에 메시지를 올린 채널입니다." },
    { label: "총 메시지", note: "7일", value: summary.messages7d.toLocaleString("ko-KR"), unit: "개" },
  ];

  // ── 테마 로테이션: 유입/이탈 그룹 ───────────────────────────────────
  // 0선 다이버징 막대를 그룹 분리로 바꿨다. 막대가 모두 왼쪽 기준이라 길이 비교가
  // 직접 되고, **두 그룹이 같은 눈금(|변화폭| 최대)을 쓴다.**
  // 변화폭이 없는(비교할 과거가 없거나 반올림해 0.0%p) 테마는 어느 쪽도 아니라
  // 셋째 묶음으로 뺀다 — 0을 이탈에 섞으면 "관심이 빠졌다"는 거짓이 된다.
  const delta = (t: ThemeRotation) => (t.shareDelta === null ? 0 : t.shareDelta);
  // 그룹 안에서는 **변화폭 크기순**으로 세운다. themes 는 점유율 순위대로 오는데, 그 순서
  // 그대로 두면 막대가 +1.1 / +0.2 / +0.7 / +0.8 처럼 들쭉날쭉해 계단으로 안 읽힌다.
  // 아래 topIn·topOut 도 이 정렬에 기대므로 여기서 한 번에 맞춘다.
  const inflow = themes.filter((t) => delta(t) >= 0.05).sort((a, b) => delta(b) - delta(a));
  const outflow = themes.filter((t) => delta(t) <= -0.05).sort((a, b) => delta(a) - delta(b));
  const steady = themes.filter((t) => Math.abs(delta(t)) < 0.05);
  const maxDelta = Math.max(0.1, ...themes.map((t) => Math.abs(delta(t))));
  const topIn = inflow[0] ?? null;
  const topOut = outflow[0] ?? null;

  const themeRow = (t: ThemeRotation, i: number, total: number) => {
    const d = delta(t);
    const ink = d > 0 ? "var(--c-hot-ink)" : d < 0 ? "var(--c-cold-ink)" : C.hint;
    return (
      <div
        key={t.theme}
        className="hz-trow hz-theme-row-sheet"
        style={{ gridTemplateColumns: THEME_COLS }}
        /* 마우스가 없어도(키보드·터치) 종목 목록을 열 수 있게 초점을 받는다.
           언급된 종목이 없는 테마는 열 것도 없으니 초점도 주지 않는다. */
        tabIndex={t.stocks.length ? 0 : undefined}
        aria-label={t.stocks.length ? `${t.theme} 테마를 이룬 종목 ${t.stockCount}개 보기` : undefined}
      >
        <span style={{ ...clip, fontSize: 12, fontWeight: 700, color: C.ink }}>{t.theme}</span>
        <span style={{ fontFamily: MONO, fontSize: 11, color: C.sub2, textAlign: "right" }}>{t.sharePct.toFixed(1)}%</span>
        <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span style={{ flex: 1, minWidth: 20, height: 7, borderRadius: 999, background: C.track, overflow: "hidden" }}>
            <span
              style={{
                display: "block",
                width: `${Math.max(2, (Math.abs(d) / maxDelta) * 100)}%`,
                height: "100%",
                background: d >= 0 ? "var(--c-warm-2)" : "var(--c-blue-3)",
              }}
            />
          </span>
          <span style={{ width: 44, flexShrink: 0, fontFamily: MONO, fontSize: 11, fontWeight: 800, color: ink }}>
            {t.shareDelta === null ? "—" : `${d > 0 ? "+" : d < 0 ? "−" : ""}${Math.abs(d).toFixed(1)}%p`}
          </span>
        </span>
        <span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 700, textAlign: "right", color: t.rankChange ? (t.rankChange > 0 ? "var(--c-hot-ink)" : "var(--c-cold-ink)") : C.hint }}>
          {t.rankChange ? `${t.rankChange > 0 ? "▲" : "▼"}${Math.abs(t.rankChange)}` : "—"}
        </span>

        {/* 이 테마의 점유율을 만든 종목 목록. 줄에 마우스를 올리거나 초점이 가면 열린다
            (CSS 만, globals.css 의 .hz-theme-pop). 아래쪽 줄은 위로 펼친다 — 아래로 열면
            시트를 벗어나 다음 섹션을 덮는다. */}
        {t.stocks.length > 0 && (
          <div className={`hz-theme-pop${i >= total - 4 ? " hz-theme-pop-up" : ""}`}>
            <div className="hz-theme-pop-head">최근 3일 언급 {t.stockCount}종목 · 주목도순</div>
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
        className="hz-trow"
        style={{ gridTemplateColumns: CHANNEL_COLS, textDecoration: "none" }}
        data-ga="kadera_channel_click"
        data-ga-channel={c.handle}
        data-ga-surface="power_rank"
        data-ga-rank={i + 1}
      >
        <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.faint }}>{i + 1}</span>
        <span style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
          <Avatar photoUrl={c.photoUrl} title={c.title} size={26} />
          <span style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
            <span style={{ ...clip, fontSize: 12, fontWeight: 700, color: C.ink }}>{c.title}</span>
            <span style={{ ...clip, fontSize: 10, fontFamily: MONO, color: C.faint }}>
              구독자 {c.subscriberCount ? compact(c.subscriberCount) : "-"}
            </span>
          </span>
        </span>
        <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: C.label, textAlign: "right" }}>
          {c.viewRate != null ? `${c.viewRate.toFixed(1)}%` : "—"}
        </span>
        <span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 700, textAlign: "right", color: c.rankChange ? (c.rankChange > 0 ? "var(--c-hot-ink)" : "var(--c-cold-ink)") : C.hint }}>
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
            <span style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: "-.01em", color: C.ink }}>모니터링 현황</span>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {miniStats.map((s, i) => (
                <div
                  key={s.label}
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                    gap: 8,
                    padding: "11px 0",
                    borderBottom: i === miniStats.length - 1 ? "none" : "1px solid var(--c-sheet-row)",
                  }}
                >
                  {/* wordBreak:keep-all — 이 칸은 25% 폭이라 좁은 구간에서 230px 까지
                      내려간다. 기본 규칙이면 "활성 채널"이 토막나 읽히지 않는다. */}
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: C.sub, display: "inline-flex", alignItems: "baseline", gap: 4, minWidth: 0, wordBreak: "keep-all" }}>
                    {s.label}
                    {s.note && <span style={{ fontSize: 10, color: C.faint }}>{s.note}</span>}
                    {s.help && (
                      <span className="hz-tip hz-tip-wide" data-tip={s.help} data-ga-tip={s.label} style={{ display: "inline-flex", cursor: "help", flexShrink: 0 }}>
                        <Icon name="help" style={{ fontSize: 12, color: C.muted }} />
                      </span>
                    )}
                  </span>
                  {/* 숫자는 절대 안 쪼갠다 — "46,189" 와 "개" 가 두 줄로 갈리면 수치가
                      아니라 오류처럼 보인다. */}
                  <strong style={{ fontFamily: MONO, fontSize: 19, fontWeight: 800, color: C.ink, letterSpacing: "-.03em", whiteSpace: "nowrap", flexShrink: 0 }}>
                    {s.value}
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.sub2 }}>{s.unit}</span>
                  </strong>
                </div>
              ))}
            </div>
            {/* marginTop:auto 로 바닥에 붙인다 — 칸이 옆 칸 높이만큼 늘어나도 남는 자리가
                통계 줄 사이가 아니라 여기 한 곳에만 생긴다. */}
            <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 12, paddingTop: 12, borderTop: "1px solid var(--c-sheet-row)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ flex: 1, height: 6, borderRadius: 999, background: C.track, overflow: "hidden" }}>
                  <span style={{ display: "block", width: `${activeRate}%`, height: "100%", borderRadius: 999, background: "var(--c-blue-2)" }} />
                </span>
                <span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 700, color: C.label, whiteSpace: "nowrap" }}>
                  활성률 {activeRate.toFixed(1)}%
                </span>
              </div>
              {/* 목업은 이 버튼을 페이지 헤더로 올렸지만, 헤더(AppShell 의 PageHeader)는
                  세 페이지가 공유하는 셸이라 카더라 전용 버튼을 끼우면 나머지 둘까지
                  흔든다. 원래 자리인 이 칸 바닥에 그대로 둔다. */}
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
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <span style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: "-.01em", color: C.ink }}>생태계 센티먼트</span>
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
              <p style={{ margin: 0, color: C.sub, fontSize: 12.5 }}>아직 분석된 메시지가 없습니다.</p>
            ) : (
              <>
                {/* 이 칸이 답하는 건 "지금 분위기 좋아, 나빠?" 하나다. 그래서 숫자도 한 벌만
                    쓴다 — 낙관도(중립 제외) 하나로 말하고, 아래 막대는 그 비율을 그림으로
                    반복한다(숫자와 그림이 어긋날 수가 없다). 중립을 얼마나 뺐는지만 옆에. */}
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <strong
                    style={{
                      fontFamily: MONO,
                      fontSize: 40,
                      fontWeight: 800,
                      lineHeight: 0.78,
                      letterSpacing: "-.04em",
                      color: sentiment.tone === "cold" ? C.cold : sentiment.tone === "hot" ? C.hot : C.ink,
                    }}
                  >
                    {sentiment.score}
                    <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-.02em" }}>%</span>
                  </strong>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: C.sub }}>
                      최근 {KADERA_WINDOW_DAYS}일 · {sentiment.messageCount.toLocaleString("ko-KR")}건 분석
                    </span>
                    <span
                      className="hz-tip hz-tip-wide"
                      data-tip="메시지를 비관/중립/낙관으로 나눈 뒤, 중립을 뺀 비관↔낙관 비율입니다. 시황·공시 같은 담담한 글이 절반이라, 같이 세면 늘 비관으로 기웁니다."
                      data-ga-tip="sentiment_ratio"
                      style={{ fontSize: 11.5, fontWeight: 700, color: C.sub, cursor: "help", width: "fit-content" }}
                    >
                      중립 {sentiment.neutral}% 제외 후 환산
                    </span>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  <div style={{ display: "flex", height: 11, borderRadius: 3, overflow: "hidden" }}>
                    <span style={{ width: `${100 - sentiment.score}%`, background: "var(--c-blue-2)" }} />
                    <span style={{ width: `${sentiment.score}%`, background: "var(--c-warm-2)" }} />
                  </div>
                  {/* 두 라벨을 막대의 양 끝에 붙여 어느 쪽이 어느 색인지 위치로 읽히게 한다. */}
                  <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 10.5, fontWeight: 700 }}>
                    <span style={{ color: "var(--c-cold-ink)" }}>비관 {100 - sentiment.score}</span>
                    <span style={{ color: "var(--c-hot-ink)" }}>낙관 {sentiment.score}</span>
                  </div>
                </div>
                {/* marginTop:auto 를 주지 않는다. 옆 '오늘의 요약' 칸이 문단 길이만큼
                    늘어나면 이 칸도 같이 늘어나는데, auto 를 걸면 남는 높이가 통째로
                    이 블록 **위**에 몰려 칸 한가운데가 구멍처럼 빈다. 위에서부터
                    쌓아 두면 그 여백이 맨 아래로 간다. */}
                {sentiment.byTheme.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 9, paddingTop: 14, borderTop: "1px solid var(--c-sheet-row)" }}>
                    <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: ".08em", color: C.sub2 }}>인기 테마별 비관 ↔ 낙관</span>
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
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <AiMark size={14} />
              <span style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: "-.01em", color: C.ink }}>오늘의 요약</span>
              <span style={{ flex: 1 }} />
              {/* formatKstUpdate 가 이미 "… 기준"으로 끝난다 — 여기서 또 붙이면 "기준 기준". */}
              {summary.lastUpdated && (
                <span style={{ fontSize: 10.5, color: C.faint, whiteSpace: "nowrap" }}>{formatKstUpdate(summary.lastUpdated)}</span>
              )}
            </div>
            {/* 높이를 안 잡는다 — 글이 3줄이면 3줄, 4줄이면 4줄로 흐른다. 길이 자체는
                파이프라인이 잡는다(generate_telegram_narratives.py 의 BRIEF_*_LEN).
                여기서 다시 자르지 않는 이유는, 잘라 두면 그쪽이 망가졌을 때 화면이
                조용히 문장을 먹어 치우기 때문이다. */}
            <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.75, color: "var(--c-ink-soft)", textWrap: "pretty", wordBreak: "keep-all" }}>
              {sentiment?.summary ?? "오늘의 요약을 준비하고 있습니다."}
            </p>
          </div>
        </div>
        {/* 이 문장은 빼면 안 된다(공개 저장소·법률). 히어로 시트의 각주 띠에 두면 첫
            화면 안에 들면서도 그래픽을 밀어내지 않는다. */}
        <div className="hz-sheet-foot">
          <span style={{ fontSize: 10.5, lineHeight: 1.6, color: C.sub2 }}>
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
          <p style={{ margin: 0, padding: "20px 22px", color: C.sub, fontSize: 12.5 }}>
            아직 급부상 신호가 뚜렷한 종목이 없습니다. 데이터가 쌓일수록 또렷해집니다.
          </p>
        ) : (
          <>
            <div className="hz-cellgrid hz-cellgrid-3">
              {surging.map((s, i) => {
                const values = s.series.slice(-7);
                const dates = s.seriesDates.slice(-7);
                return (
                  <div key={s.code} className="hz-cell-pad">
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      <RankBadge n={i + 1} />
                      {/* minWidth:0 — flex 항목의 기본 min-width:auto 가 살아 있으면 이름이
                          줄지 않아 말줄임이 안 걸리고 셀 밖으로 넘친다(820px 에서 실측 3px).
                          줄어도 되는 건 이름뿐이라 여기만 풀어 준다. */}
                      <strong style={{ ...clip, minWidth: 0, fontSize: 14, fontWeight: 800, letterSpacing: "-.01em", color: C.ink }}>{s.name}</strong>
                      <span style={{ fontFamily: MONO, fontSize: 10, color: C.faint, flexShrink: 0 }}>{s.code}</span>
                      <span style={{ flex: 1 }} />
                      <span style={{ fontSize: 10.5, color: C.sub2, whiteSpace: "nowrap" }}>{s.channelCount}개 채널</span>
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

                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      <DayBars values={values} dates={dates} tone="warm" hot={Math.min(s.recentDays, values.length)} />
                      {/* ⚠️ '평소 N회'는 여기 적지 않는다. 위 배수는 언급 **횟수**가 아니라
                          그날 전체 대화에서 차지한 **몫(share)** 을 평활해 낸 값이라
                          (getSurgingStocks), 횟수 둘을 나란히 두면 그 비가 배수와 안 맞아
                          한 셀에 눈금이 둘 생긴다. 데이터에 '평소 N회'라는 값 자체가 없다. */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: C.faint }}>최근 {s.recentDays}일</span>
                        <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.ink }}>{s.recentMentions}회</span>
                      </div>
                    </div>

                    <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: 8, paddingTop: 2, flexWrap: "wrap" }}>
                      {s.closePrice != null ? (
                        <>
                          <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: C.label, whiteSpace: "nowrap" }}>
                            {s.closePrice.toLocaleString("ko-KR")}원
                          </span>
                          {/* 야후 실시간이 아니면(KRX 저장 종가 폴백) 등락률 대신 기준일을 단다.
                              폴백이면 등락률도 그날 것이라, 화살표를 그대로 두면 가격뿐 아니라
                              방향까지 뒤집혀 보인다(QuoteDate 주석). */}
                          {s.isLive ? (
                            <ChangeRate rate={s.changeRate} style={{ fontSize: 10.5, fontWeight: 800 }} />
                          ) : (
                            <QuoteDate date={s.priceDate} style={{ fontSize: 10.5 }} />
                          )}
                        </>
                      ) : (
                        <span style={{ fontSize: 11, color: C.muted }}>가격 정보 준비 중</span>
                      )}
                      <span style={{ flex: 1 }} />
                      <MddLink code={s.code} market={s.market} label="MDD" />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="hz-sheet-foot">
              <span style={{ fontSize: 10.5, lineHeight: 1.6, color: C.sub2 }}>
                막대는 최근 7일 일별 언급량이고, 붉은 칸이 배수를 낸 최근 창입니다 · 배수는 언급 횟수가 아니라 그날 전체 대화에서 차지한 몫을 견준 값입니다
              </span>
            </div>
          </>
        )}
      </section>

      {/* ── 테마 로테이션 · 이슈 키워드 (50:50) ──────────────────────── */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <section className="hz-sheet" style={{ flex: "1 1 calc(50% - 8px)", minWidth: 320, display: "flex", flexDirection: "column" }}>
          <SectionHead
            icon="donut_small"
            title="테마 로테이션"
            note="3일 vs 이전"
            desc="관심이 어느 테마로 옮겨가는지 · 점유율 변화 기준"
            noteHelp="최근 3일 평균 점유율을 그 이전과 비교합니다. 하루치끼리 재면 표본 얇은 날에 크게 요동쳐서, 며칠씩 묶어서 봅니다."
          />
          {themes.length === 0 ? (
            <p style={{ margin: 0, padding: "20px 22px", color: C.sub, fontSize: 12.5 }}>아직 집계된 테마가 없습니다.</p>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: "1px solid var(--c-sheet-line)" }}>
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

              <div className="hz-thead" style={{ gridTemplateColumns: THEME_COLS }}>
                <span>테마</span>
                <span style={{ textAlign: "right" }}>점유율</span>
                <span>변화폭</span>
                <span style={{ textAlign: "right" }}>순위</span>
              </div>

              {/* 유입/이탈을 그룹으로 나눠 막대가 모두 왼쪽 기준이 되게 한다. 0선 다이버징
                  이었을 땐 좌우 길이를 눈으로 견줘야 했는데, 이러면 같은 눈금 위에서
                  길이만 비교하면 된다(두 그룹의 분모가 같다 — maxDelta). */}
              {inflow.length > 0 && <GroupTag dir="in" />}
              {inflow.map((t, i) => themeRow(t, i, themes.length))}
              {outflow.length > 0 && <GroupTag dir="out" />}
              {outflow.map((t, i) => themeRow(t, inflow.length + i, themes.length))}
              {steady.length > 0 && (
                <>
                  <div style={{ padding: "10px 22px 7px" }}>
                    <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".04em", color: C.sub2, background: C.chip, borderRadius: 999, padding: "3px 9px" }}>
                      변화 없음
                    </span>
                  </div>
                  {steady.map((t, i) => themeRow(t, inflow.length + outflow.length + i, themes.length))}
                </>
              )}
              <div style={{ marginTop: "auto" }} />
            </>
          )}
        </section>

        <section className="hz-sheet" style={{ flex: "1 1 calc(50% - 8px)", minWidth: 320, display: "flex", flexDirection: "column" }}>
          <SectionHead icon="tag" title="이슈 키워드" note="최근 7일" desc="종목명이 아닌 화제어 · 언급 횟수 기준" />
          {keywords.length === 0 ? (
            <p style={{ margin: 0, padding: "20px 22px", color: C.sub, fontSize: 12.5 }}>아직 뽑을 화제어가 없습니다.</p>
          ) : (
            <>
              {(() => {
                const top = keywords[0];
                const totalTop = keywords.reduce((a, k) => a + k.count, 0);
                const sharePct = Math.round((top.count / Math.max(1, totalTop)) * 100);
                const second = keywords[1];
                return (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: "1px solid var(--c-sheet-line)" }}>
                    <Highlight
                      cap="이번 주 화제어 1위"
                      name={top.word}
                      value={`${top.count.toLocaleString("ko-KR")}회`}
                      valueColor="var(--c-hot-ink)"
                      sub={second ? `2위 ${second.word}의 ${(top.count / Math.max(1, second.count)).toFixed(1)}배` : "비교할 2위가 없습니다"}
                      divide
                    />
                    <Highlight
                      cap={`상위 ${keywords.length}개 중 비중`}
                      name={`${sharePct}%`}
                      sub={sharePct >= 30 ? "한 키워드에 관심이 쏠린 상태" : "관심이 여러 화제어에 흩어진 상태"}
                    />
                  </div>
                );
              })()}

              <div className="hz-thead" style={{ gridTemplateColumns: KEYWORD_COLS }}>
                <span>#</span>
                <span>키워드</span>
                <span>언급량</span>
                <span style={{ textAlign: "right" }}>횟수</span>
              </div>
              {/* 1위는 위 하이라이트가 맡았으므로 목록은 2위부터. 막대는 1위 대비라
                  정의상 한 줄도 100% 가 되지 않는다(1위가 목록에 없다).

                  행마다 flex:1 을 줘 남는 높이를 **행이 나눠 갖게** 한다. 이 시트는 9줄이고
                  짝인 테마 로테이션은 그룹 알약까지 12줄이라 늘 이쪽이 짧은데, 그냥 두면
                  마지막 줄과 각주 사이가 통째로 빈다. space-between 으로 벌리면 구분선이
                  서로 떨어져 표가 끊겨 보이므로, 줄 자체를 고르게 키운다(선은 붙어 있다). */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
              {keywords.slice(1).map((k, i) => (
                <div key={k.word} className="hz-trow" style={{ gridTemplateColumns: KEYWORD_COLS, flex: 1 }}>
                  <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.faint }}>{i + 2}</span>
                  <span style={{ ...clip, fontSize: 12, fontWeight: 700, color: C.ink }}>{k.word}</span>
                  <span style={{ height: 7, borderRadius: 999, background: C.track, overflow: "hidden" }}>
                    <span
                      style={{
                        display: "block",
                        width: `${(k.count / Math.max(1, keywords[0].count)) * 100}%`,
                        height: "100%",
                        // 길이는 7일 횟수, 색은 3일 점유율 방향 — 눈금이 둘이라 각주에 둘 다 적는다.
                        background: k.trend === "up" ? "var(--c-warm-2)" : k.trend === "down" ? "var(--c-blue-3)" : C.hint,
                      }}
                    />
                  </span>
                  <span
                    style={{
                      fontFamily: MONO,
                      fontSize: 11,
                      fontWeight: 800,
                      textAlign: "right",
                      color: k.trend === "up" ? "var(--c-hot-ink)" : k.trend === "down" ? "var(--c-cold-ink)" : C.sub,
                    }}
                  >
                    {k.trend === "up" ? "▲" : k.trend === "down" ? "▼" : ""}
                    {k.count.toLocaleString("ko-KR")}
                  </span>
                </div>
              ))}
              </div>
              {/* ⚠️ "지난주보다 증가"라고 쓰면 거짓이다 — trend 는 주 대비도, 횟수 대비도
                  아니고 **최근 3일 점유율** 방향이다(getIssueKeywords 주석). 막대 길이와
                  색이 서로 다른 눈금이라는 것도 여기서 밝힌다. */}
              <div className="hz-sheet-foot" style={{ marginTop: "auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, color: C.sub }}>
                    <span style={{ width: 8, height: 8, borderRadius: 3, background: "var(--c-warm-2)" }} />
                    최근 3일 관심 점유율 증가
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, color: C.sub }}>
                    <span style={{ width: 8, height: 8, borderRadius: 3, background: "var(--c-blue-3)" }} />
                    감소
                  </span>
                </div>
                <span style={{ fontSize: 10.5, color: C.sub2 }}>막대 길이는 7일 언급 횟수 · 종목명·티커는 제외</span>
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
          <p style={{ margin: 0, padding: "20px 22px", color: C.sub, fontSize: 12.5 }}>아직 리포트를 만들 종목이 없습니다.</p>
        ) : (
          <div className="hz-cellgrid hz-cellgrid-2">
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
                <div key={r.code} className="hz-cell-pad">
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <RankBadge n={i + 1} />
                    {/* minWidth:0 — 급부상 셀과 같은 이유(그쪽 주석). 여기는 오른쪽에
                        일곱 자리 시세("1,567,000원")까지 붙어서 더 빨리 넘쳤다. */}
                    <strong style={{ ...clip, minWidth: 0, fontSize: 14, fontWeight: 800, letterSpacing: "-.01em", color: C.ink }}>{r.name}</strong>
                    <span style={{ fontFamily: MONO, fontSize: 10, color: C.faint, flexShrink: 0 }}>{r.code}</span>
                    <span style={{ flex: 1 }} />
                    {r.price != null && (
                      <span style={{ display: "flex", alignItems: "baseline", gap: 6, whiteSpace: "nowrap", flexShrink: 0 }}>
                        <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: C.label }}>{r.price.toLocaleString("ko-KR")}원</span>
                        <ChangeRate rate={r.changeRate} style={{ fontSize: 10.5, fontWeight: 800 }} />
                      </span>
                    )}
                  </div>

                  <div style={{ display: "flex", alignItems: "baseline", gap: 9, flexWrap: "wrap" }}>
                    <strong style={{ fontFamily: MONO, fontSize: 28, fontWeight: 800, letterSpacing: "-.035em", lineHeight: 1, color: C.ink }}>
                      {r.totalMentions.toLocaleString("ko-KR")}
                    </strong>
                    <span style={{ fontSize: 11.5, color: C.sub2 }}>회 언급</span>
                    <span style={{ flex: 1 }} />
                    <span style={{ fontSize: 10.5, color: C.sub2, whiteSpace: "nowrap" }}>{r.channelCount}개 채널</span>
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
                    <div style={{ display: "flex", gap: 9, background: C.soft, borderRadius: 10, padding: "12px 13px" }}>
                      <AiMark size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                      <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.7, color: "var(--c-ink-soft)", textWrap: "pretty", wordBreak: "keep-all" }}>
                        {narratives[r.code]}
                      </p>
                    </div>
                  )}
                  <div style={{ marginTop: "auto", display: "flex", justifyContent: "flex-end", paddingTop: 2 }}>
                    <MddLink code={r.code} market={r.market} label={`${r.name} MDD 정밀분석`} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── 트렌딩 메시지 ────────────────────────────────────────────── */}
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

      <SectionCaps label="채널" count={2} />

      {/* ── 채널 파워 랭킹 · 뜨는 채널 (50:50) ───────────────────────── */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <section className="hz-sheet" style={{ flex: "1 1 calc(50% - 8px)", minWidth: 320, display: "flex", flexDirection: "column" }}>
          <SectionHead icon="military_tech" title="채널 파워 랭킹" desc="조회율·확산력까지 반영한 채널 영향력" />
          {channels.length === 0 ? (
            <p style={{ margin: 0, padding: "20px 22px", color: C.sub, fontSize: 12.5 }}>아직 채널 점수가 없습니다.</p>
          ) : (
            <>
              <div className="hz-thead" style={{ gridTemplateColumns: CHANNEL_COLS }}>
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
                footerStyle={{ margin: 0, padding: "12px 22px", borderTop: "1px solid var(--c-sheet-line)" }}
              />
              <div style={{ marginTop: "auto" }} />
            </>
          )}
        </section>

        <section className="hz-sheet" style={{ flex: "1 1 calc(50% - 8px)", minWidth: 320, display: "flex", flexDirection: "column" }}>
          {/* 기간 표기는 옆 시트와 "최근 7일"로 맞춘다. 구독자 스냅샷은 백필이 안 돼
              하루씩 쌓이므로 실제로 잰 구간이 그보다 짧은 날이 있다(getRisingChannels 의
              spanDays). 시트에 그 사정까지 적진 않는다. */}
          <SectionHead icon="rocket_launch" title="뜨는 채널" note="최근 7일" desc="최근 구독자가 많이 늘어난 채널" />
          {(() => {
            const real = rising.filter((r) => !r.isPlaceholder);
            const topDelta = Math.max(1, ...real.map((r) => Math.abs(r.delta7d)));
            if (real.length === 0) {
              return <p style={{ margin: 0, padding: "20px 22px", color: C.sub, fontSize: 12.5 }}>아직 구독자 변화를 잴 만큼 스냅샷이 쌓이지 않았습니다.</p>;
            }
            return (
              <>
                <div className="hz-thead" style={{ gridTemplateColumns: RISING_COLS }}>
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
                      <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.faint }}>{i + 1}</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                        <Avatar photoUrl={r.photoUrl} title={r.title} size={26} />
                        <span style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
                          <span style={{ ...clip, fontSize: 12, fontWeight: 700, color: C.ink }}>{r.title}</span>
                          <span style={{ ...clip, fontSize: 10, fontFamily: MONO, color: C.faint }}>구독자 {compact(r.subscriberCount)}</span>
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
                      </span>
                    </>
                  );
                  return r.handle ? (
                    <a
                      key={`${r.handle}-${i}`}
                      href={`https://t.me/${r.handle}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hz-trow"
                      style={{ gridTemplateColumns: RISING_COLS, textDecoration: "none" }}
                      data-ga="kadera_channel_click"
                      data-ga-channel={r.handle}
                      data-ga-surface="rising"
                    >
                      {row}
                    </a>
                  ) : (
                    <div key={`${r.title}-${i}`} className="hz-trow" style={{ gridTemplateColumns: RISING_COLS }}>
                      {row}
                    </div>
                  );
                })}
                <div className="hz-sheet-foot" style={{ marginTop: "auto" }}>
                  <span style={{ fontSize: 10.5, color: C.sub2 }}>
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
