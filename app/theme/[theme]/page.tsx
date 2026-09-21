import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { assertLoaded } from "@/lib/load-state";
import { withSubjectParticle, withTopicParticle } from "@/lib/format";
import { eventDateLabel, todayKst, type UpcomingEvent } from "@/lib/kadera-why";
import { fmtKoDate, stockHref } from "@/lib/stock-page";
import { KADERA_WINDOW_DAYS, addDaysISO } from "@/lib/telegram-data";
import {
  THEME_NAMES,
  THEME_TREND_DAYS,
  getThemePage,
  themeFromParam,
  themeHref,
  type ThemeTrendPoint,
} from "@/lib/theme-page";

import { KADERA_CARD } from "../../og-copy";
import { pageMetadata } from "../../seo";
import { THEME_PUBLIC } from "../../screen-flags";
import { StockLogo } from "../../StockLogo";
import { EventsCalendar } from "../../kadera/EventsCalendar";
import { ExpandableList } from "../../kadera/ExpandableList";
import { Avatar, DeltaPp, Pill, RankDelta } from "../../kadera/parts";
import { SectionHead } from "../../kadera/SectionHead";
import TimeAgo from "../../kadera/TimeAgo";
import { timeAgoInitial } from "../../kadera/time-ago";
import { AiMark, C, Icon, MONO, R } from "../../ui";
import { THEME_PAGE } from "../copy";
import { Rate } from "../Rate";
import { ReasonWeeks } from "../ReasonWeeks";
import { Treemap, TreemapLegend, stockTiles } from "../Treemap";

/**
 * 테마 하나의 실주소(`/theme/반도체`).
 *
 * ## 이 화면이 답하는 것
 *
 * "이 테마를 두고 채널에서 요즘 무슨 얘기가 도나." 종목 화면은 종목 하나, 카더라는 시장
 * 전체를 말하는데 그 사이 테마 단위가 비어 있었다. 위에서부터 요즘 무슨 얘기(LLM) →
 * 말 많은 종목과 한 줄 까닭 → 까닭 이력(한 주씩) → 일정(달력) → 발췌 → 함께 거론되는 테마 한 줄.
 * 전부 서술이고 판단·예측·점수는 없다.
 *
 * ## ⭐ 서버가 그린다
 *
 * 종목 화면과 같은 이유다 — 크롤러가 테마 이름·말 많은 종목·까닭을 첫 HTML 에서 읽어야
 * 이 화면이 검색에 잡힌다. 클라이언트 컴포넌트는 로고와 시각(TimeAgo)뿐이다.
 *
 * ## 제목은 셸이 그린다
 *
 * 종목 화면(464장)은 셸이 이름을 알 길이 없어 자기 h1 을 그리지만, 테마 26장은 사전이 정적이라
 * 셸의 DEEP_PAGES 가 이름을 안다(AppShell). 그래서 여기엔 h1 도 구조화 데이터도 없다 — 두면 h1 이
 * 둘이 된다.
 */

/**
 * ⛔ **아직 안 연 화면이다.** 스위치는 `app/screen-flags.ts` 한 곳에 있다.
 */
const PUBLIC = THEME_PUBLIC;
/** 배포된 곳인가. 로컬에서는 PUBLIC 이 false 여도 그대로 보인다(만드는 중에 봐야 하니까). */
const DEPLOYED = Boolean(process.env.VERCEL_ENV);

// 동적 구간은 빈 generateStaticParams 가 있어야 런타임 ISR 이 된다(app/stock/[code]/page.tsx 주석).
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ theme: string }> }): Promise<Metadata> {
  const { theme: raw } = await params;
  const theme = themeFromParam(raw);
  if (!theme) return { title: "테마를 찾을 수 없습니다 | hatzze", robots: { index: false, follow: false } };
  const d = await getThemePage(theme);
  const hot = d?.hotStocks.slice(0, 3).map((s) => s.name) ?? [];
  const meta = await pageMetadata({
    title: `${theme} 테마 텔레그램 언급 | hatzze`,
    description: `${withSubjectParticle(theme)} 주식 텔레그램에서 요즘 어떻게 회자되는지 봅니다.${
      hot.length ? ` 최근 사흘 말 많은 종목은 ${hot.join("·")}입니다.` : ""
    } 말 많은 종목과 그 까닭, 앞으로의 일정을 테마 단위로 읽습니다.`,
    path: themeHref(theme),
    ownImage: KADERA_CARD.alt,
    imagePath: "/kadera",
  });
  return PUBLIC ? meta : { ...meta, robots: { index: false, follow: false } };
}

/**
 * 30일 점유율 막대. 종목 화면의 언급 막대와 같은 꼴(div 만, 라이브러리 없음)에 **까닭이 붙은 날**을
 * 점으로 얹는다. 다른 테마 사이트의 차트가 이유가 있는 날에 원을 찍는 형식을 가져온 것이다.
 * 점을 누르면 아래 까닭 이력의 그 날짜로 간다.
 */
function Trend({ points, recent }: { points: ThemeTrendPoint[]; recent: Set<string> }) {
  const max = Math.max(0.1, ...points.map((p) => p.share));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 104, padding: "10px 0 0" }}>
      {points.map((p, i) => {
        const at = i / Math.max(1, points.length - 1);
        const edge = at > 0.72 ? " hz-tip-end" : at < 0.28 ? " hz-tip-start" : "";
        const tip = `${fmtKoDate(p.date)} · 점유율 ${p.share.toFixed(1)}%${p.rank ? ` · ${p.rank}위` : ""}${p.hasReason ? " · 까닭 있음" : ""}`;
        // 최근 사흘(위 점유율 칸이 재는 날들)만 진한 파랑, 그 전은 옅은 파랑 — 히어로의 두 칸이 같은 날을 가리킨다.
        const bar = (
          <span
            style={{
              width: "100%",
              height: `${Math.max(p.share ? 3 : 1, (p.share / max) * 100)}%`,
              borderRadius: 3,
              background: !p.share ? C.track : recent.has(p.date) ? C.blue : "var(--c-blue-3)",
            }}
          />
        );
        return (
          <span
            key={p.date}
            className={`hz-tip hz-vline${edge}`}
            data-tip={tip}
            style={{ position: "relative", flex: 1, minWidth: 0, height: "100%", display: "flex", alignItems: "flex-end" }}
          >
            {p.hasReason && (
              // 막대 위 6px 점. 막대와 같은 파랑을 쓰면 묻히니 온도색(따뜻한 잉크)으로 띄운다.
              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  top: 0,
                  left: "50%",
                  width: 6,
                  height: 6,
                  marginLeft: -3,
                  borderRadius: 999,
                  background: "var(--c-hot-ink)",
                }}
              />
            )}
            {p.hasReason ? (
              <a href={`#reason-${p.date}`} aria-label={tip} style={{ display: "flex", alignItems: "flex-end", width: "100%", height: "100%" }}>
                {bar}
              </a>
            ) : (
              bar
            )}
          </span>
        );
      })}
    </div>
  );
}

/** 히어로의 작은 숫자 하나 — 값 위, 이름 아래(내부자 리포트 히어로의 기간 수익률과 같은 꼴). */
function Fig({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
      <span style={{ display: "inline-flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
        <strong style={{ fontFamily: MONO, fontSize: "var(--fs-15)", fontWeight: 800, color: C.ink, letterSpacing: "-.01em", whiteSpace: "nowrap" }}>{value}</strong>
        {sub}
      </span>
      <span style={{ fontSize: "var(--fs-11)", color: C.muted, whiteSpace: "nowrap" }}>{label}</span>
    </span>
  );
}

/** 히어로 칸 제목 옆 물음표(SectionHead 의 noteHelp 와 같은 툴팁). 긴 설명을 칸 안에 문단으로 두지 않는다. */
function HelpTip({ text, ga }: { text: string; ga: string }) {
  return (
    <span className="hz-tip hz-tip-wide hz-tip-start" data-tip={text} data-ga-tip={ga} style={{ display: "inline-flex", cursor: "help" }}>
      <Icon name="help" style={{ fontSize: "var(--fs-12)", color: C.muted }} />
    </span>
  );
}

/** 등락률 한 조각. 온도색 두 가지와 화살표(종목 화면 Quote 와 같은 규칙). */
/** 빈 칸의 한 줄. 카드는 숨기지 않고 왜 비었는지 적는다. */
function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ margin: 0, padding: "16px 22px 20px", fontSize: "var(--fs-12)", fontWeight: 500, color: C.sub, lineHeight: 1.7 }}>
      {children}
    </p>
  );
}

const clip: React.CSSProperties = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };

/** 히어로 첫 칸의 종목 알약 수. 여섯이면 230px 칸에서 두 줄이다. */
const HERO_CHIPS = 6;
/** '지금 말 많은 종목' 표의 줄 수. 지도가 전체를 보이니 표는 상위 다섯이면 된다(2026-09-21). */
const HOT_ROWS = 5;
/** 달력이 보이는 날수. 카더라 '다가오는 일정'과 같은 5주. */
const CALENDAR_DAYS = 35;
/** 달력 아래 '달·분기만 짚인 일정'의 최대 줄 수. 더 보기는 두지 않는다. */
const VAGUE_ROWS = 6;
/** 발췌는 처음 여섯, '더 보기'로 여섯씩(카더라 트렌딩과 같은 단추). 파이프라인이 18건까지 저장한다(EXCERPTS_SHOWN). */
const EXCERPTS_INITIAL = 6;
const EXCERPTS_STEP = 6;

/** 조회·전달 수의 짧은 꼴. 카더라 트렌딩(app/kadera/page.tsx compact)과 같은 규칙이다. */
function compact(n: number): string {
  if (n >= 10000) return `${Math.round(n / 1000)}K`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return `${n}`;
}

export default async function ThemePage({ params }: { params: Promise<{ theme: string }> }) {
  if (!PUBLIC && DEPLOYED) notFound();
  const { theme: raw } = await params;
  const theme = themeFromParam(raw);
  // 사전에 없는 이름은 조회 없이 404 다. 조회 실패와 섞이지 않는다.
  if (!theme) notFound();
  const d = await getThemePage(theme);
  // ⚠️ notFound() 앞에서 던진다 — 조회가 5xx 로 죽은 것을 404 로 굳히지 않는다(종목 화면과 같다).
  assertLoaded("/theme/[theme]");
  if (!d) notFound();

  const mentionedCount = d.hotStocks.length;
  const totalMentions = d.hotStocks.reduce((s, x) => s + x.mentions, 0);
  const trendFrom = d.trend[0]?.date;
  const trendTo = d.trend[d.trend.length - 1]?.date;
  // 추이 위 작은 숫자 셋 — 최고인 날 · 집계가 있는 날의 평균 · 까닭이 붙은 날 수.
  const counted = d.trend.filter((p) => p.rank != null);
  const peak = counted.reduce<ThemeTrendPoint | null>((best, p) => (best == null || p.share > best.share ? p : best), null);
  const avgShare = counted.length ? counted.reduce((sum, p) => sum + p.share, 0) / counted.length : null;
  const reasonDayCount = d.trend.filter((p) => p.hasReason).length;
  const recentSet = new Set(d.recentDays);
  // 칸 1 의 종목 알약 — 최근 사흘 말이 많은 순. 집계가 없으면 사전 순서.
  const chipStocks = (d.hotStocks.length ? d.hotStocks : d.members).slice(0, HERO_CHIPS);

  // 일정은 카더라와 같은 달력이다(2026-09-21 "달력 형태로"). 달력엔 **날짜가 적혀 있던 것(day)**만, 앞으로 5주.
  // 달·분기·연 단위는 놓을 칸이 없고 모델이 "연말"을 12-31 로 굳혀 쓴 값이라 칸에 두면 거짓이 된다(카더라와 같은 규칙).
  // 카더라는 그것들을 버리지만 여기는 종목이 여럿이라 "10월 중 실적 발표" 같은 것이 제법 있어, 달력 아래에 몇 줄 적는다.
  const today = todayKst();
  const calendarEnd = addDaysISO(today, CALENDAR_DAYS);
  const dayEvents = d.events.filter((e) => e.precision === "day" && e.date <= calendarEnd);
  // 머리글(라벨)로 묶는다 — 달·분기·연은 날짜가 달라도 라벨이 같아서("10월 중") (날짜, 정밀도)로 묶으면 같은 머리글이 두 번 선다.
  const vagueGroups = new Map<string, UpcomingEvent[]>();
  let vagueRows = 0;
  for (const e of d.events) {
    if (e.precision === "day" || vagueRows >= VAGUE_ROWS) continue;
    const k = eventDateLabel(e);
    const g = vagueGroups.get(k);
    if (g) g.push(e);
    else vagueGroups.set(k, [e]);
    vagueRows += 1;
  }
  const vagueTotal = d.events.filter((e) => e.precision !== "day").length;

  // 함께 거론되는 테마(요약 행의 related, 많이 같이 나온 순). 사전에 있는 이름만.
  const relatedThemes = (d.brief?.related ?? []).map((r) => r.theme).filter((t) => t !== theme && THEME_NAMES.includes(t));
  // 이웃 테마 — 사전 순서에서 앞뒤 둘씩. 위가 비었을 때의 대신이다. 26장이 서로 이어져야 크롤러가 닿는다.
  const idx = THEME_NAMES.indexOf(theme);
  const neighbors = [-2, -1, 1, 2]
    .map((k) => THEME_NAMES[(idx + k + THEME_NAMES.length) % THEME_NAMES.length])
    .filter((t, i, arr) => t !== theme && arr.indexOf(t) === i);

  return (
    <div className="hz-tx">
      {/* 목록으로 돌아가는 줄. 내부자 리포트 상세(app/insider/stock)와 같은 자리·같은 꼴(2026-09-21). */}
      <Link
        href={THEME_PAGE.href}
        style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 4, fontSize: "var(--fs-12)", fontWeight: 700, color: C.sub, textDecoration: "none" }}
      >
        <Icon name="chevron_left" style={{ fontSize: "var(--fs-16)" }} />
        {THEME_PAGE.label}
      </Link>

      {/* ── 히어로 ── 세 칸. 테마 정체 · 최근 사흘 점유율 · 30일 추이. 제목(h1)은 셸이 위에 그린다. */}
      <section className="hz-sheet">
        <div className="hz-kd-hero">
          {/* 칸 1 — 테마 정체. 큰 수(종목 수) · 최근 사흘 채널에 오른 종목 수 · 말이 많은 순 종목 알약(로고 포함).
              ⚠️ 알약은 회색 칩(--c-chip)이 아니라 **카드색 + 테두리**다. 회색 타일 위에 회색 칩을 두면 경계가 안 보인다
              (2026-09-21 지적). 긴 설명("손으로 고른 대표 종목 묶음")은 제목 옆 물음표로 내렸다. */}
          <div className="hz-kd-hero-q">
            <div className="hz-kd-hero-title">
              <span style={{ fontSize: "var(--fs-14)", fontWeight: 700, letterSpacing: "-.01em", color: C.ink }}>이 테마는</span>
              <HelpTip
                ga="theme_members"
                text={`${withTopicParticle(theme)} 손으로 고른 대표 종목 묶음입니다. 업종 전체가 아니라 채널에서 이 테마로 불리는 종목들입니다. 알약은 최근 ${KADERA_WINDOW_DAYS}일 말이 많은 순입니다.`}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={{ display: "inline-flex", alignItems: "baseline", gap: 6 }}>
                <strong style={{ fontFamily: MONO, fontSize: "var(--fs-24)", fontWeight: 800, color: C.ink, letterSpacing: "-.02em" }}>{d.members.length}</strong>
                <span style={{ fontSize: "var(--fs-17)", fontWeight: 600, color: C.sub }}>종목</span>
              </span>
              {!d.loadFailed && (
                <span style={{ fontSize: "var(--fs-12)", color: C.sub }}>
                  최근 {KADERA_WINDOW_DAYS}일 채널에 오른 종목 <strong style={{ fontFamily: MONO, fontWeight: 800, color: C.ink }}>{mentionedCount}</strong>
                </span>
              )}
            </div>
            <div className="hz-theme-chips">
              {chipStocks.map((m) => (
                <Link key={m.code} href={stockHref(m.code)} className="hz-theme-chip">
                  <StockLogo code={m.code} name={m.name} market={m.market} size={16} />
                  {m.name}
                </Link>
              ))}
              {d.members.length > chipStocks.length && <span className="hz-theme-chip hz-theme-chip-more">+{d.members.length - chipStocks.length}</span>}
            </div>
          </div>

          {/* 칸 2 — 최근 사흘 점유율. 큰 수 + 변화 알약, 그 아래 순위·언급 합 두 숫자. 정의는 물음표로. */}
          <div className="hz-kd-hero-q">
            <div className="hz-kd-hero-title">
              <span style={{ fontSize: "var(--fs-14)", fontWeight: 700, letterSpacing: "-.01em", color: C.ink }}>최근 {KADERA_WINDOW_DAYS}일 점유율</span>
              <HelpTip ga="theme_share" text="점유율은 그날 언급된 전 종목의 주목도 중 이 테마 종목의 몫입니다. 스물여섯 테마를 다 더하면 100%입니다. 변화는 닷새 넘게 이전과 견준 값입니다." />
            </div>
            {d.loadFailed || d.recentShare == null ? (
              <p style={{ margin: 0, fontSize: "var(--fs-12)", fontWeight: 500, color: C.sub, lineHeight: 1.7 }}>
                {d.loadFailed ? "집계를 지금 불러오지 못했습니다." : "아직 집계된 날이 없습니다."}
              </p>
            ) : (
              <>
                <span style={{ display: "inline-flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                  <strong style={{ fontFamily: MONO, fontSize: "var(--fs-24)", fontWeight: 800, color: C.ink, letterSpacing: "-.02em" }}>
                    {d.recentShare.toFixed(1)}
                    <span style={{ fontSize: "var(--fs-17)", fontWeight: 600, color: C.sub, marginLeft: 2 }}>%</span>
                  </strong>
                  <DeltaPp value={d.shareDelta} style={{ fontSize: "var(--fs-12)" }} />
                </span>
                <div className="hz-theme-figs">
                  <Fig
                    label="테마 순위"
                    value={d.recentRank ? `${d.recentRank}위` : "—"}
                    sub={
                      d.rankChange === null ? undefined : d.rankChange === 0 ? (
                        <span style={{ fontSize: "var(--fs-11)", color: C.muted }}>그대로</span>
                      ) : (
                        <RankDelta change={d.rankChange} />
                      )
                    }
                  />
                  <Fig label="언급 합" value={`${totalMentions.toLocaleString("ko-KR")}회`} />
                </div>
              </>
            )}
          </div>

          {/* 칸 3(넓은 칸) — 30일 추이. 위에 작은 숫자 셋(최고·평균·까닭 붙은 날), 막대는 최근 사흘만 진하게, 아래 범례. */}
          <div className="hz-kd-hero-h">
            <div className="hz-kd-hero-title">
              <span style={{ fontSize: "var(--fs-14)", fontWeight: 700, letterSpacing: "-.01em", color: C.ink }}>{THEME_TREND_DAYS}일 점유율 추이</span>
              <span style={{ flex: 1 }} />
              {trendFrom && trendTo && (
                <span style={{ fontSize: "var(--fs-11)", color: C.muted, whiteSpace: "nowrap" }}>
                  {fmtKoDate(trendFrom)} ~ {fmtKoDate(trendTo)}
                </span>
              )}
            </div>
            {d.loadFailed ? (
              <p style={{ margin: 0, fontSize: "var(--fs-12)", fontWeight: 500, color: C.sub, lineHeight: 1.7 }}>
                집계를 지금 불러오지 못했습니다. 잠시 뒤 다시 열어 보십시오.
              </p>
            ) : (
              <>
                <div className="hz-theme-figs hz-theme-figs-row">
                  <Fig label={peak ? `최고 · ${fmtKoDate(peak.date)}` : "최고"} value={peak ? `${peak.share.toFixed(1)}%` : "—"} />
                  <Fig label={`${THEME_TREND_DAYS}일 평균`} value={avgShare == null ? "—" : `${avgShare.toFixed(1)}%`} />
                  <Fig label="까닭이 붙은 날" value={`${reasonDayCount}일`} />
                </div>
                <Trend points={d.trend} recent={recentSet} />
                <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", fontSize: "var(--fs-11)", color: C.sub }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 3, background: C.blue, display: "inline-block" }} />
                    최근 {KADERA_WINDOW_DAYS}일
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 3, background: "var(--c-blue-3)", display: "inline-block" }} />
                    그 전
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 999, background: "var(--c-hot-ink)", display: "inline-block" }} />
                    종목에 까닭 한 줄이 붙은 날. 누르면 그 주로 갑니다
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ── 요즘 무슨 얘기(LLM) ── 이 화면의 본론. 파이프라인이 테마마다 하루 한 번 써 둔다(generate_theme_briefs.py). */}
      <section className="hz-sheet">
        <SectionHead icon="forum" title="요즘 무슨 얘기" note={d.brief ? `${fmtKoDate(d.brief.date)} 기준` : undefined} desc="최근 사흘 채널 글을 읽고 정리한 것입니다. 확인된 사실이 아니라 오간 이야기입니다." level={2} />
        {d.brief?.brief ? (
          <div style={{ padding: "16px 22px 20px" }}>
            {/* 두 문단(파이프라인이 빈 줄로 가른다). 첫 문단은 가장 크게 오간 이야기, 둘째는 그 밖의 이야기. */}
            <div style={{ display: "flex", gap: 10, background: C.soft, borderRadius: R.control, padding: "14px 16px" }}>
              <AiMark size={15} style={{ flexShrink: 0, marginTop: 2 }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
                {d.brief.brief.split(/\n\s*\n/).map((para, i) => (
                  <p key={i} style={{ margin: 0, fontSize: "var(--fs-13-5)", lineHeight: 1.75, color: C.inkSoft, textWrap: "pretty", wordBreak: "keep-all" }}>
                    {para}
                  </p>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* 세 경우를 갈라 적는다 — 아직 안 만들었다 · 글이 없었다 · 만들었지만 검사에 걸려 안 실었다. */
          <Empty>
            {!d.brief
              ? "이 테마의 요약이 아직 없습니다. 매일 저녁 실행 뒤에 채워집니다."
              : d.brief.messageCount === 0
                ? "최근 사흘 사이 이 테마 종목이 언급된 글이 없어 요약할 것이 없습니다."
                : "이번 요약은 검사에 걸려 싣지 않았습니다. 다음 실행에서 다시 만듭니다."}
          </Empty>
        )}
      </section>

      {/* ── 말 많은 종목 ── 위에 종목 지도(칸 = 언급 수, 색 = 앞 사흘과 견준 배수), 아래에 표.
          지도는 "이 테마 안에서 말이 어디 몰렸나"를 한 번에, 표는 까닭 한 줄까지. 테마 목록의 지도와 같은 그림이다. */}
      <section className="hz-sheet">
        <SectionHead
          icon="leaderboard"
          title="지금 말 많은 종목"
          note={`최근 ${KADERA_WINDOW_DAYS}일`}
          desc="칸의 크기는 최근 사흘 언급 수, 색은 그 앞 사흘과 견준 변화입니다. 아래 표는 상위 다섯 종목과 그날 채널이 말한 까닭입니다."
          noteHelp="색은 최근 사흘 언급을 바로 앞 사흘과 나눈 배수입니다. 1.5배 이상이면 따뜻한 색, 1.5분의 1 이하면 파랑이고, 앞 사흘에 없던 종목은 새로 등장으로 칩니다."
          level={2}
        />
        {d.loadFailed ? (
          <Empty>집계를 지금 불러오지 못했습니다.</Empty>
        ) : d.hotStocks.length === 0 ? (
          <Empty>최근 {KADERA_WINDOW_DAYS}일 사이 이 테마 종목이 채널에서 언급되지 않았습니다.</Empty>
        ) : (
          <div style={{ paddingBottom: 6 }}>
            <div style={{ padding: "16px 22px 0" }}>
              <Treemap tiles={stockTiles(d.hotStocks)} ariaLabel={`${theme} 테마 종목별 최근 ${KADERA_WINDOW_DAYS}일 언급`} />
            </div>
            <TreemapLegend up="앞 사흘보다 말이 늘어난 종목" flat="비슷함" down="줄어든 종목" />
            {d.hotStocks.slice(0, HOT_ROWS).map((s, i) => (
              <div key={s.code} className="hz-trow hz-cols-theme-stock">
                <span style={{ fontFamily: MONO, fontSize: "var(--fs-11)", fontWeight: 800, color: C.sub2 }}>{i + 1}</span>
                <Link href={stockHref(s.code)} style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0, textDecoration: "none" }}>
                  <StockLogo code={s.code} name={s.name} market={s.market} size={26} />
                  <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                    <span style={{ ...clip, fontSize: "var(--fs-13)", fontWeight: 700, color: C.ink }}>{s.name}</span>
                    {s.reason && (
                      <span style={{ fontSize: "var(--fs-12)", color: C.inkSoft, lineHeight: 1.55, wordBreak: "keep-all", textWrap: "pretty" }}>
                        <Rate rate={s.reason.changeRate} />
                        {s.reason.changeRate != null && " "}
                        {s.reason.reason}
                        <span style={{ color: C.muted, marginLeft: 6, whiteSpace: "nowrap" }}>{fmtKoDate(s.reason.date)}</span>
                      </span>
                    )}
                  </span>
                </Link>
                <span style={{ textAlign: "right", fontFamily: MONO, fontSize: "var(--fs-13)", fontWeight: 800, color: C.ink, whiteSpace: "nowrap" }}>
                  {s.mentions.toLocaleString("ko-KR")}회
                </span>
                <span style={{ textAlign: "right", fontFamily: MONO, fontSize: "var(--fs-11)", color: C.sub2, whiteSpace: "nowrap" }}>
                  {s.channels}곳
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── 까닭 이력 ── 이 테마 종목이 움직인 날마다 채널이 말한 이유. 위 추이의 점과 같은 날들이다.
          한 주씩 넘겨 본다(ReasonWeeks) — 30일치를 다 세우면 카드가 너무 길다(2026-09-21). */}
      <section className="hz-sheet">
        <SectionHead
          icon="history"
          title="까닭 이력"
          note="한 주씩"
          desc="이 테마 종목이 크게 움직인 날, 그날 채널이 말한 이유입니다. 아래 단추로 지난주를 봅니다."
          noteHelp={`최근 ${THEME_TREND_DAYS}일까지 거슬러 갑니다. 위 추이의 점을 누르면 그날이 든 주로 옮겨 갑니다.`}
          level={2}
        />
        {d.reasons.length === 0 ? (
          <Empty>최근 {THEME_TREND_DAYS}일 사이 이 테마 종목에 붙은 까닭이 없습니다. 까닭은 등락이 큰 날에만 만듭니다.</Empty>
        ) : (
          <ReasonWeeks rows={d.reasons} latest={d.baseDate} earliest={trendFrom ?? addDaysISO(d.baseDate, -THEME_TREND_DAYS)} />
        )}
      </section>

      {/* ── 다가오는 일정 ── 카더라와 같은 달력(1/3) + 고른 날(2/3). 날짜가 적혀 있던 것만 칸에 놓고,
          달·분기만 짚인 것은 아래에 몇 줄 적는다(위 vagueGroups 주석). */}
      <section className="hz-sheet">
        <SectionHead
          icon="calendar_month"
          title="다가오는 일정"
          note="앞으로 5주"
          desc="채널이 날짜를 짚어 말한 이 테마 종목의 일정입니다. 확정 일정은 공시로 확인하십시오."
          noteHelp="같은 일정을 두고 채널마다 날짜가 갈리기도 합니다. 날짜 없이 달이나 분기만 짚인 것은 달력에 놓을 칸이 없어 아래에 따로 적습니다."
          level={2}
        />
        {dayEvents.length === 0 ? (
          <Empty>앞으로 5주 안에 날짜가 짚인 이 테마 종목의 일정이 아직 없습니다.</Empty>
        ) : (
          <EventsCalendar
            today={today}
            events={dayEvents.map((e) => ({ code: e.code, name: e.name, market: e.market, date: e.date, event: e.event, channels: e.channels }))}
          />
        )}
        {vagueGroups.size > 0 && (
          <div style={{ borderTop: "1px solid var(--c-sheet-line)", paddingBottom: 8 }}>
            <div style={{ padding: "16px 22px 2px", display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontSize: "var(--fs-12)", fontWeight: 700, color: C.sub }}>날짜 없이 달·분기만 짚인 일정</span>
              {vagueTotal > vagueRows && (
                <span style={{ fontSize: "var(--fs-11)", color: C.muted }}>{vagueTotal}건 중 가까운 {vagueRows}건</span>
              )}
            </div>
            {[...vagueGroups.entries()].map(([label, items]) => (
              <div key={label}>
                <div className="hz-agenda-day">
                  <span style={{ fontSize: "var(--fs-13-5)", fontWeight: 800, color: C.ink, letterSpacing: "-.01em" }}>{label}</span>
                </div>
                {items.map((e) => (
                  <div key={`${e.code}-${e.event}`} className="hz-trow hz-cols-theme-event">
                    <Link href={stockHref(e.code)} style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, textDecoration: "none" }}>
                      <StockLogo code={e.code} name={e.name} market={e.market} size={22} />
                      <span style={{ ...clip, fontSize: "var(--fs-12-5)", fontWeight: 700, color: C.ink }}>{e.name}</span>
                    </Link>
                    <span style={{ minWidth: 0, fontSize: "var(--fs-13)", lineHeight: 1.6, color: C.inkSoft, wordBreak: "keep-all", textWrap: "pretty" }}>{e.event}</span>
                    {e.channels >= 2 ? <Pill tone="blue">{e.channels}곳이 말함</Pill> : <span />}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── 발췌 ── 최근 사흘 조회가 많은 글. 카더라 트렌딩 메시지와 같은 패널 격자·말풍선(2026-09-21 "카더라 포맷 따오기") —
          원본이 텔레그램 메시지라 그 매체의 형태를 유지하면 "우리가 센 수치가 아니라 누가 한 말"이 형태만으로 읽힌다. */}
      <section className="hz-sheet">
        <SectionHead icon="format_quote" title="채널에서 오간 글" note="최근 사흘 · 조회순" desc="이 테마 종목이 언급된 글 중 많이 읽힌 것입니다. 같은 글이 여러 채널에 실린 것은 한 번만 보입니다." level={2} />
        {!d.brief || d.brief.excerpts.length === 0 ? (
          <Empty>{d.brief ? "최근 사흘 사이 이 테마 종목이 언급된 글을 찾지 못했습니다." : "요약과 함께 매일 저녁 실행 뒤에 채워집니다."}</Empty>
        ) : (
          <ExpandableList
            name="theme_excerpts"
            initial={EXCERPTS_INITIAL}
            step={EXCERPTS_STEP}
            listClassName="hz-panelgrid hz-panelgrid-auto"
            footerClassName="hz-sheet-foot-row"
            items={d.brief.excerpts.map((m, i) => (
              <li key={`${m.channelHandle}-${m.messageId}`} className="hz-lift" style={{ display: "flex", padding: "16px 18px", gap: 12, minWidth: 0 }}>
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
                    <div style={{ display: "flex", alignItems: "baseline", gap: 7, minWidth: 0 }}>
                      <span style={{ ...clip, fontSize: "var(--fs-12-5)", fontWeight: 800, letterSpacing: "-.01em", color: "var(--c-cold-ink)", maxWidth: 220, minWidth: 0 }}>{m.channelTitle}</span>
                      <span style={{ fontSize: "var(--fs-11)", fontFamily: MONO, color: C.sub2, flexShrink: 0 }}>
                        <TimeAgo iso={m.postedAt} initial={timeAgoInitial(m.postedAt)} />
                      </span>
                      <span style={{ flex: 1 }} />
                      <span style={{ fontSize: "var(--fs-11)", fontFamily: MONO, fontWeight: 800, color: C.sub, flexShrink: 0 }}>#{i + 1}</span>
                    </div>
                    <div className="hz-bubble">
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
                      {m.stocks.length > 0 && (
                        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                          {m.stocks.map((t) => (
                            <span key={t} style={{ fontSize: "var(--fs-11)", fontWeight: 700, color: C.label, background: C.chip, borderRadius: 999, padding: "3px 8px", whiteSpace: "nowrap" }}>
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
                        <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 2, color: C.sub2, fontWeight: 600 }}>
                          원문
                          <Icon name="arrow_outward" style={{ fontSize: "var(--fs-13)" }} />
                        </span>
                      </div>
                    </div>
                  </div>
                </a>
              </li>
            ))}
          />
        )}
      </section>

      {/* ── 함께 거론되는 테마 ── 같은 글에 같이 나온 테마(많이 같이 나온 순). 머리·설명 없이 한 줄이다(2026-09-21 "심플하게").
          요약이 아직 없어 같이 나온 테마를 모르면 사전 순서의 앞뒤 넷을 '다른 테마'로 세운다 — 26장이 서로 이어져야 크롤러가 닿는다. */}
      <section className="hz-sheet">
        <div style={{ padding: "16px 22px 18px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: "var(--fs-12)", fontWeight: 700, color: C.sub, whiteSpace: "nowrap" }}>{relatedThemes.length ? "함께 거론되는 테마" : "다른 테마"}</span>
          {(relatedThemes.length ? relatedThemes : neighbors).map((t) => (
            <Link
              key={t}
              href={themeHref(t)}
              style={{ display: "inline-flex", alignItems: "center", padding: "6px 11px", borderRadius: R.pill, background: C.chip, fontSize: "var(--fs-12)", fontWeight: 600, color: C.label, textDecoration: "none", whiteSpace: "nowrap" }}
            >
              {t}
            </Link>
          ))}
          <span style={{ flex: 1 }} />
          <Link href={THEME_PAGE.href} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "var(--fs-12)", fontWeight: 700, color: C.sub, textDecoration: "none", whiteSpace: "nowrap" }}>
            테마 전체 보기
            <Icon name="arrow_forward" style={{ fontSize: "var(--fs-16)" }} />
          </Link>
        </div>
      </section>

      <p style={{ margin: 0, fontSize: "var(--fs-11)", color: C.muted, textAlign: "right" }}>
        집계 기준일 {fmtKoDate(d.baseDate)}. 언급은 주식 텔레그램 채널에서 셉니다.
      </p>
    </div>
  );
}
