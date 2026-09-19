import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { assertLoaded } from "@/lib/load-state";
import { withSubjectParticle, withTopicParticle } from "@/lib/format";
import { daysFromToday, eventDateLabel, type UpcomingEvent } from "@/lib/kadera-why";
import { fmtKoDate, stockHref } from "@/lib/stock-page";
import { KADERA_WINDOW_DAYS } from "@/lib/telegram-data";
import {
  THEME_NAMES,
  THEME_TREND_DAYS,
  getThemePage,
  themeFromParam,
  themeHref,
  type ThemePageData,
  type ThemeTrendPoint,
} from "@/lib/theme-page";

import { KADERA_CARD } from "../../og-copy";
import { pageMetadata } from "../../seo";
import { THEME_PUBLIC } from "../../screen-flags";
import { StockLogo } from "../../StockLogo";
import { Avatar, DeltaPp, Pill, RankDelta } from "../../kadera/parts";
import { SectionHead } from "../../kadera/SectionHead";
import TimeAgo from "../../kadera/TimeAgo";
import { timeAgoInitial } from "../../kadera/time-ago";
import { AiMark, C, Icon, MONO, R } from "../../ui";
import { THEME_PAGE } from "../copy";

/**
 * 테마 하나의 실주소(`/theme/반도체`).
 *
 * ## 이 화면이 답하는 것
 *
 * "이 테마를 두고 채널에서 요즘 무슨 얘기가 도나." 종목 화면은 종목 하나, 카더라는 시장
 * 전체를 말하는데 그 사이 테마 단위가 비어 있었다. 위에서부터 요즘 무슨 얘기(LLM) →
 * 말 많은 종목과 한 줄 까닭 → 까닭 이력 → 일정 → 함께 언급되는 테마 → 발췌. 전부
 * 서술이고 판단·예측·점수는 없다.
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
function Trend({ points }: { points: ThemeTrendPoint[] }) {
  const max = Math.max(0.1, ...points.map((p) => p.share));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 96, padding: "10px 0 0" }}>
      {points.map((p, i) => {
        const at = i / Math.max(1, points.length - 1);
        const edge = at > 0.72 ? " hz-tip-end" : at < 0.28 ? " hz-tip-start" : "";
        const tip = `${fmtKoDate(p.date)} · 점유율 ${p.share.toFixed(1)}%${p.rank ? ` · ${p.rank}위` : ""}${p.hasReason ? " · 까닭 있음" : ""}`;
        const bar = (
          <span
            style={{
              width: "100%",
              height: `${Math.max(p.share ? 3 : 1, (p.share / max) * 100)}%`,
              borderRadius: 2,
              background: p.share ? C.blue : C.track,
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

/** 히어로 둘째 칸의 한 줄(종목 화면의 Stat 과 같은 꼴). */
function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
      <span style={{ fontSize: "var(--fs-11)", fontWeight: 600, color: C.sub, whiteSpace: "nowrap" }}>{label}</span>
      <span style={{ textAlign: "right", minWidth: 0 }}>
        <strong style={{ fontFamily: MONO, fontSize: "var(--fs-13)", fontWeight: 800, color: C.ink }}>{value}</strong>
        {sub && <span style={{ fontSize: "var(--fs-11)", color: C.muted, marginLeft: 5 }}>{sub}</span>}
      </span>
    </div>
  );
}

/** 등락률 한 조각. 온도색 두 가지와 화살표(종목 화면 Quote 와 같은 규칙). */
function Rate({ rate }: { rate: number | null }) {
  if (rate == null) return null;
  return (
    <span
      style={{
        fontFamily: MONO,
        fontWeight: 700,
        whiteSpace: "nowrap",
        color: rate > 0 ? "var(--c-hot-ink)" : rate < 0 ? "var(--c-cold-ink)" : C.sub2,
      }}
    >
      {rate > 0 ? "▲" : rate < 0 ? "▼" : ""}
      {Math.abs(rate).toFixed(2)}%
    </span>
  );
}

/** 빈 칸의 한 줄. 카드는 숨기지 않고 왜 비었는지 적는다. */
function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ margin: 0, padding: "16px 22px 20px", fontSize: "var(--fs-12)", fontWeight: 500, color: C.sub, lineHeight: 1.7 }}>
      {children}
    </p>
  );
}

const clip: React.CSSProperties = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };

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

  // 까닭 이력을 날짜로 묶는다(최신순). 같은 날 여러 종목이면 채널 수가 많은 것이 먼저.
  const reasonDays = new Map<string, ThemePageData["reasons"]>();
  for (const r of d.reasons) {
    const g = reasonDays.get(r.date);
    if (g) g.push(r);
    else reasonDays.set(r.date, [r]);
  }
  for (const g of reasonDays.values()) g.sort((a, b) => b.channelCount - a.channelCount);

  // 일정을 머리글(날짜 라벨)로 묶는다. 달·분기·연 단위는 날짜가 달라도 라벨이 같아서("10월 중"),
  // (날짜, 정밀도)로 묶으면 같은 머리글이 두 번 선다 — 종목 화면과 달리 여기는 종목이 여럿이라 실제로 그랬다.
  const eventGroups = new Map<string, UpcomingEvent[]>();
  for (const e of d.events) {
    const k = e.precision === "day" ? e.date : eventDateLabel(e);
    const g = eventGroups.get(k);
    if (g) g.push(e);
    else eventGroups.set(k, [e]);
  }

  // 이웃 테마 — 사전 순서에서 앞뒤 둘씩. 26장이 서로 이어져야 크롤러가 닿는다(종목 화면의 '같은 테마 종목'과 같은 이유).
  const idx = THEME_NAMES.indexOf(theme);
  const neighbors = [-2, -1, 1, 2]
    .map((k) => THEME_NAMES[(idx + k + THEME_NAMES.length) % THEME_NAMES.length])
    .filter((t, i, arr) => t !== theme && arr.indexOf(t) === i);

  return (
    <div className="hz-tx">
      {/* ── 히어로 ── 세 칸. 테마 정체 · 최근 사흘 점유율 · 30일 추이. 제목(h1)은 셸이 위에 그린다. */}
      <section className="hz-sheet">
        <div className="hz-kd-hero">
          <div className="hz-kd-hero-q">
            <div className="hz-kd-hero-title">
              <span style={{ fontSize: "var(--fs-14)", fontWeight: 700, letterSpacing: "-.01em", color: C.ink }}>이 테마는</span>
            </div>
            <span style={{ display: "inline-flex", alignItems: "baseline", gap: 6 }}>
              <strong style={{ fontFamily: MONO, fontSize: "var(--fs-24)", fontWeight: 800, color: C.ink, letterSpacing: "-.02em" }}>{d.members.length}</strong>
              <span style={{ fontSize: "var(--fs-17)", fontWeight: 600, color: C.sub }}>종목</span>
              {!d.loadFailed && (
                <span style={{ fontSize: "var(--fs-12)", color: C.sub }}>
                  중 최근 {KADERA_WINDOW_DAYS}일 언급 {mentionedCount}종목
                </span>
              )}
            </span>
            <p style={{ margin: 0, fontSize: "var(--fs-12)", color: C.sub, lineHeight: 1.7, wordBreak: "keep-all", textWrap: "pretty" }}>
              {withTopicParticle(theme)} 손으로 고른 대표 종목 묶음입니다. 업종 전체가 아니라 채널에서 이 테마로 불리는 종목들입니다.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {d.members.slice(0, 8).map((m) => (
                <Link
                  key={m.code}
                  href={stockHref(m.code)}
                  style={{ display: "inline-flex", alignItems: "center", padding: "4px 9px", borderRadius: R.pill, background: C.chip, fontSize: "var(--fs-11)", fontWeight: 600, color: C.label, textDecoration: "none", whiteSpace: "nowrap" }}
                >
                  {m.name}
                </Link>
              ))}
              {d.members.length > 8 && <span style={{ fontSize: "var(--fs-11)", color: C.muted, alignSelf: "center" }}>외 {d.members.length - 8}종목</span>}
            </div>
          </div>

          <div className="hz-kd-hero-q">
            <div className="hz-kd-hero-title">
              <span style={{ fontSize: "var(--fs-14)", fontWeight: 700, letterSpacing: "-.01em", color: C.ink }}>최근 {KADERA_WINDOW_DAYS}일 점유율</span>
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
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <Stat
                    label="테마 순위"
                    value={d.recentRank ? `${d.recentRank}위` : "—"}
                    sub={d.rankChange === null ? undefined : d.rankChange === 0 ? "그대로" : undefined}
                  />
                  {d.rankChange !== null && d.rankChange !== 0 && (
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <RankDelta change={d.rankChange} />
                    </div>
                  )}
                  <Stat label="언급 합" value={`${totalMentions.toLocaleString("ko-KR")}회`} />
                </div>
                <span style={{ fontSize: "var(--fs-11)", color: C.muted, lineHeight: 1.6, wordBreak: "keep-all" }}>
                  점유율은 그날 언급된 전 종목의 주목도 중 이 테마 종목의 몫입니다. 변화는 닷새 넘게 이전과 견준 값입니다.
                </span>
              </>
            )}
          </div>

          <div className="hz-kd-hero-h">
            <div className="hz-kd-hero-title">
              <span style={{ fontSize: "var(--fs-14)", fontWeight: 700, letterSpacing: "-.01em", color: C.ink }}>{THEME_TREND_DAYS}일 점유율 추이</span>
            </div>
            {d.loadFailed ? (
              <p style={{ margin: 0, fontSize: "var(--fs-12)", fontWeight: 500, color: C.sub, lineHeight: 1.7 }}>
                집계를 지금 불러오지 못했습니다. 잠시 뒤 다시 열어 보십시오.
              </p>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                  <span style={{ fontSize: "var(--fs-12)", color: C.sub, display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 999, background: "var(--c-hot-ink)", display: "inline-block" }} />
                    점은 종목에 까닭 한 줄이 붙은 날입니다
                  </span>
                  {trendFrom && trendTo && (
                    <span style={{ fontSize: "var(--fs-11)", color: C.muted, whiteSpace: "nowrap" }}>
                      {fmtKoDate(trendFrom)} ~ {fmtKoDate(trendTo)}
                    </span>
                  )}
                </div>
                <Trend points={d.trend} />
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
            <div style={{ display: "flex", gap: 9, background: C.soft, borderRadius: R.control, padding: "12px 13px" }}>
              <AiMark size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <p style={{ margin: 0, fontSize: "var(--fs-13)", lineHeight: 1.7, color: C.inkSoft, textWrap: "pretty", wordBreak: "keep-all" }}>{d.brief.brief}</p>
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

      {/* ── 말 많은 종목 ── 최근 사흘 언급, 주목도순. 까닭이 붙은 종목은 그 한 줄을 같이 보인다. */}
      <section className="hz-sheet">
        <SectionHead
          icon="leaderboard"
          title="지금 말 많은 종목"
          note={`최근 ${KADERA_WINDOW_DAYS}일`}
          desc="이 테마 종목 중 채널에서 많이 언급된 순서입니다. 까닭은 그날 채널이 말한 이유입니다."
          level={2}
        />
        {d.loadFailed ? (
          <Empty>집계를 지금 불러오지 못했습니다.</Empty>
        ) : d.hotStocks.length === 0 ? (
          <Empty>최근 {KADERA_WINDOW_DAYS}일 사이 이 테마 종목이 채널에서 언급되지 않았습니다.</Empty>
        ) : (
          <div style={{ paddingBottom: 6 }}>
            {d.hotStocks.slice(0, 12).map((s, i) => (
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
            {d.hotStocks.length > 12 && (
              <p style={{ margin: 0, padding: "10px 22px 6px", fontSize: "var(--fs-11)", color: C.muted }}>
                상위 12종목만 보입니다. 나머지 {d.hotStocks.length - 12}종목은 언급이 더 적습니다.
              </p>
            )}
          </div>
        )}
      </section>

      {/* ── 까닭 이력 ── 이 테마 종목이 움직인 날마다 채널이 말한 이유. 위 추이의 점과 같은 날들이다. */}
      <section className="hz-sheet">
        <SectionHead
          icon="history"
          title="까닭 이력"
          note={`최근 ${THEME_TREND_DAYS}일`}
          desc="이 테마 종목이 크게 움직인 날, 그날 채널이 말한 이유를 날짜순으로 모았습니다."
          level={2}
        />
        {d.reasons.length === 0 ? (
          <Empty>최근 {THEME_TREND_DAYS}일 사이 이 테마 종목에 붙은 까닭이 없습니다. 까닭은 등락이 큰 날에만 만듭니다.</Empty>
        ) : (
          <div style={{ paddingBottom: 6 }}>
            {[...reasonDays.entries()].map(([date, rows]) => (
              <div key={date} id={`reason-${date}`}>
                <div className="hz-agenda-day">
                  <span style={{ fontSize: "var(--fs-13-5)", fontWeight: 800, color: C.ink, letterSpacing: "-.01em" }}>{fmtKoDate(date)}</span>
                </div>
                {rows.map((r) => (
                  <div key={`${date}-${r.code}`} className="hz-trow hz-cols-theme-reason">
                    <Link href={stockHref(r.code)} style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, textDecoration: "none" }}>
                      <StockLogo code={r.code} name={r.name} market={r.market} size={22} />
                      <span style={{ ...clip, fontSize: "var(--fs-12-5)", fontWeight: 700, color: C.ink }}>{r.name}</span>
                    </Link>
                    <span style={{ fontSize: "var(--fs-12)", textAlign: "right" }}>
                      <Rate rate={r.changeRate} />
                    </span>
                    <span style={{ minWidth: 0, fontSize: "var(--fs-13)", lineHeight: 1.6, color: C.inkSoft, wordBreak: "keep-all", textWrap: "pretty" }}>
                      {r.reason}
                      {r.channelCount >= 2 && <span style={{ color: C.muted, marginLeft: 6, whiteSpace: "nowrap", fontSize: "var(--fs-11)" }}>{r.channelCount}곳이 말함</span>}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── 다가오는 일정 ── 테마 종목들의 앞날. 종목 화면과 같은 아젠다 꼴에 종목 이름이 붙는다. */}
      <section className="hz-sheet">
        <SectionHead icon="calendar_month" title="다가오는 일정" desc="채널이 짚은 날입니다. 같은 일정을 두고 날짜가 갈리기도 합니다." level={2} />
        {d.events.length === 0 ? (
          <Empty>채널이 짚은 이 테마 종목의 앞날 일정이 아직 없습니다.</Empty>
        ) : (
          <div style={{ paddingBottom: 6 }}>
            {[...eventGroups.values()].map((items) => (
              <div key={`${items[0].date}-${items[0].precision}`}>
                <div className="hz-agenda-day">
                  <span style={{ fontSize: "var(--fs-13-5)", fontWeight: 800, color: C.ink, letterSpacing: "-.01em" }}>{eventDateLabel(items[0])}</span>
                  {items[0].precision === "day" && (
                    <Pill tone={["오늘", "내일"].includes(daysFromToday(items[0].date)) ? "blue" : "plain"}>{daysFromToday(items[0].date)}</Pill>
                  )}
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

      {/* ── 함께 언급되는 테마 ── 같은 글에 같이 나온 테마. 가격이 아니라 언급으로 묶인 이웃이다. */}
      <section className="hz-sheet">
        <SectionHead icon="hub" title="함께 언급되는 테마" note="최근 사흘" desc="이 테마 종목과 같은 글에 함께 나온 다른 테마입니다. 숫자는 그런 글의 수입니다." level={2} />
        {d.brief && d.brief.related.length > 0 ? (
          <div style={{ padding: "16px 22px 20px", display: "flex", flexWrap: "wrap", gap: 8 }}>
            {d.brief.related.map((r) => (
              <Link
                key={r.theme}
                href={themeHref(r.theme)}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 11px", borderRadius: R.pill, background: C.chip, fontSize: "var(--fs-12)", fontWeight: 600, color: C.label, textDecoration: "none", whiteSpace: "nowrap" }}
              >
                {r.theme}
                <span style={{ fontFamily: MONO, fontWeight: 700, color: C.sub2 }}>{r.messages}</span>
              </Link>
            ))}
          </div>
        ) : (
          <Empty>{d.brief ? "최근 사흘 사이 다른 테마와 같은 글에 오른 적이 없습니다." : "요약과 함께 매일 저녁 실행 뒤에 채워집니다."}</Empty>
        )}
      </section>

      {/* ── 발췌 ── 최근 사흘 조회가 많은 글. 원본이 텔레그램 메시지라 말풍선으로 둔다(카더라 트렌딩과 같은 형태). */}
      <section className="hz-sheet">
        <SectionHead icon="format_quote" title="채널에서 오간 글" note="최근 사흘 · 조회순" desc="이 테마 종목이 언급된 글 중 많이 읽힌 것입니다. 같은 글이 여러 채널에 실린 것은 한 번만 보입니다." level={2} />
        {!d.brief || d.brief.excerpts.length === 0 ? (
          <Empty>{d.brief ? "최근 사흘 사이 이 테마 종목이 언급된 글을 찾지 못했습니다." : "요약과 함께 매일 저녁 실행 뒤에 채워집니다."}</Empty>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: "10px 8px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
            {d.brief.excerpts.map((m, i) => (
              <li key={`${m.channelHandle}-${m.messageId}`} className="hz-lift" style={{ display: "flex", padding: "12px 14px", gap: 12, minWidth: 0 }}>
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
                    </div>
                  </div>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── 이웃 테마 ── 26장이 서로 이어지게 사전 순서의 앞뒤를 잇는다. */}
      <section className="hz-sheet">
        <div style={{ padding: "16px 22px 18px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: "var(--fs-12)", fontWeight: 700, color: C.sub, whiteSpace: "nowrap" }}>다른 테마</span>
          {neighbors.map((t) => (
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
