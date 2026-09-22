import Link from "next/link";

import { KADERA_WINDOW_DAYS } from "@/lib/telegram-data";
import { fmtKoDate } from "@/lib/stock-page";
import { THEME_FLOW_DAYS, THEME_FLOW_TOP, type ThemeOverview, type ThemeRiser } from "@/lib/theme-page";

import { StockLogo } from "../StockLogo";
import { DeltaPp, Pill, RankBadge } from "../kadera/parts";
import { SectionHead } from "../kadera/SectionHead";
import { AiMark, C, MONO } from "../ui";
import type { ThemeMarket } from "./market";
import { Treemap, TreemapLegend, stockTone, themeTiles } from "./Treemap";

/**
 * 테마 목록의 본문 — **국장(/theme)과 미장(/theme/us)이 같이 쓴다.** 위에 히어로(1:1:2 판), 그 아래 **점유율 지도**(트리맵),
 * 테마별 급부상 종목, **열흘 흐름** 표. 자료는 각자 읽어(lib/theme-page.ts · lib/us-theme-page.ts) 같은 타입으로 넘기고,
 * 시장마다 다른 것(주소·사전)은 ThemeMarket(app/theme/market.ts)이 든다.
 *
 * 지도는 "지금 관심이 어디에 몰려 있나"를 한 번에 보인다 — 칸 크기가 최근 3일 언급 점유율, 색이
 * 5일 넘게 이전과 견준 변화다(app/theme/Treemap.tsx). 흐름 표는 다른 테마 사이트의 '테마 흐름'
 * 표에서 형식을 가져왔다(칸마다 그날 순위, 라벨은 지속·첫 등장·간헐). 그쪽은 급등 종목 수를
 * 세고 우리는 언급 점유율을 센다. 카더라의 테마 로테이션 카드가 '3일 vs 이전'을 숫자로
 * 말한다면 여기는 그것을 넓이와 색으로, 열흘을 칸으로 보인다.
 *
 * 제목은 셸이 그린다(안 연 동안은 DEEP_PAGES, 열면 NAV). 이 파일은 본문만 낸다.
 */

const clip: React.CSSProperties = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };

/** 흐름 한 줄 글. 판정 규칙은 lib/theme-page.ts listThemeOverview 에 있다. */
function flowCaption(t: ThemeOverview): { text: string; on: boolean } {
  // 연속 하루째인데 열흘 안에 상위였던 날이 더 있으면 "돌아온" 것이다 — "1일째 상위"는 어색하다.
  if (t.label === "streak") return { text: t.streak === 1 ? "다시 상위" : `${t.streak}일째 상위`, on: true };
  if (t.label === "new") return { text: t.streak === 1 ? "첫 등장" : "2일째 상위", on: true };
  if (t.label === "intermittent") return { text: `10일 중 ${t.topDays}일 상위`, on: false };
  return { text: "상위 밖", on: false };
}

/**
 * 열흘 흐름 — **글 한 조각뿐이다**(n일째 상위 · 다시 상위 · 열흘 중 n일 상위 · 상위 밖). 순위 칸 띠 → 색 띠 →
 * 스파크라인까지 세 번 그림으로 그렸는데 전부 "복잡하다"였다(2026-09-19). 열흘의 뜻은 결국 이 한 줄이고,
 * 날마다의 값은 툴팁(title)에 남긴다.
 */
/**
 * 점유율이 며칠째 같은 방향인가 — 테마 화면 히어로의 "n일째 · 오르는 중"과 같은 셈(집계 있는 날만, 마지막 날부터 거슬러).
 * 마지막 변화가 0 이거나 날이 둘 미만이면 0.
 */
function shareStreak(t: ThemeOverview): { dir: 1 | -1 | 0; days: number } {
  const pts = t.flow.map((r, i) => (r == null ? null : t.shareFlow[i])).filter((v): v is number => v != null);
  let dir: 1 | -1 | 0 = 0;
  let days = 0;
  for (let i = pts.length - 1; i > 0; i--) {
    const diff = pts[i] - pts[i - 1];
    const d = diff > 0 ? 1 : diff < 0 ? -1 : 0;
    if (dir === 0) {
      if (d === 0) break;
      dir = d;
    }
    if (d !== dir) break;
    days += 1;
  }
  return { dir, days };
}

function Flow({ t }: { t: ThemeOverview }) {
  const cap = flowCaption(t);
  const streak = shareStreak(t);
  const title = `최근 ${t.flowDates.length}일 순위 ${t.flow.map((r, i) => `${fmtKoDate(t.flowDates[i])} ${r == null ? "집계 없음" : `${r}위`}`).join(" · ")}`;
  return (
    <span title={title} style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
      {/* 상위권 지속(알약) 옆에 점유율 방향 — 테마 화면의 "n일째 · 오르는 중"과 같은 말(2026-09-22). 이틀 이상 이어질 때만 —
          하루짜리까지 적으면 열 줄이 다 "1일째"라 말이 안 된다. */}
      {streak.days >= 2 && (
        <span style={{ fontSize: "var(--fs-11)", fontWeight: 700, whiteSpace: "nowrap", color: streak.dir > 0 ? "var(--c-hot-ink)" : "var(--c-cold-ink)" }}>
          {streak.days}일째 {streak.dir > 0 ? "오르는 중" : "내리는 중"}
        </span>
      )}
      <Pill tone={cap.on ? "blue" : "plain"}>{cap.text}</Pill>
    </span>
  );
}

/** 히어로 회색 타일 안의 한 항목 — 이름표 · 테마(링크) + 값 · 곁말. 테마 화면 히어로의 Fig 와 같은 눈금(값 15/800, 이름표 11). */
type HeroFigData = { cap: string; t: ThemeOverview; value: string; tone: string; sub: string };
function HeroFig({ x, market }: { x: HeroFigData; market: ThemeMarket }) {
  return (
    <span style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
      <span style={{ fontSize: "var(--fs-11)", fontWeight: 700, letterSpacing: ".02em", color: C.sub, whiteSpace: "nowrap" }}>{x.cap}</span>
      <span style={{ display: "flex", alignItems: "baseline", gap: 7, minWidth: 0 }}>
        <Link href={market.themeHref(x.t.theme)} className="hz-stock-link" style={{ ...clip, fontSize: "var(--fs-15)", fontWeight: 800, letterSpacing: "-.02em" }}>
          {x.t.theme}
        </Link>
        <span style={{ fontFamily: MONO, fontSize: "var(--fs-12-5)", fontWeight: 800, color: x.tone, flexShrink: 0, whiteSpace: "nowrap" }}>{x.value}</span>
      </span>
      <span style={{ ...clip, fontSize: "var(--fs-11)", color: C.muted }}>{x.sub}</span>
    </span>
  );
}

/** 흐름 표의 줄 수. 상위 열 줄이면 '지금 화제인 테마'가 다 들어온다. 더 보기는 두지 않는다(2026-09-21) — 나머지는 지도에 있다. */
const FLOW_ROWS = 10;


/** 태그 글자. 새로 등장이면 그 말을, 아니면 "3일 전보다 2.1배"(후보는 1.5배 이상뿐이라 '배'가 손해로 읽힐 일이 없다).
 *  '앞 사흘'은 보통 사람이 안 쓰는 말이다(2026-09-22) — 견주는 창은 그 전 3일이지만 말은 "3일 전보다"로. */
function riserDelta(r: ThemeRiser): string {
  return r.ratio === null ? "새로 등장" : `3일 전 대비 ${r.ratio.toFixed(1)}배`;
}

export function ThemeIndexView({
  market,
  themes,
  risers,
}: {
  market: ThemeMarket;
  /** null = 집계를 못 읽었다. */
  themes: ThemeOverview[] | null;
  /** null = 요약 행을 못 읽었다. 이유 없는 줄은 부르는 쪽이 이미 걸렀다. */
  risers: ThemeRiser[] | null;
}) {
  const flowDates = themes?.[0]?.flowDates ?? [];
  const top = themes?.slice(0, 3) ?? [];
  // 히어로 옆 칸의 네 타일 — 표를 다 읽지 않아도 오늘 무엇이 달라졌는지. 칸마다 첫째 잣대에 해당하는 테마가 없으면
  // 둘째 잣대로 바꿔 채운다(빈 칸에 "없습니다"를 두면 히어로가 비어 보인다, 2026-09-22).
  const all = themes ?? [];
  const byDelta = all.filter((t) => t.shareDelta != null).sort((a, b) => (b.shareDelta as number) - (a.shareDelta as number));
  const gainer = byDelta[0] && (byDelta[0].shareDelta as number) > 0 ? byDelta[0] : null;
  const loser = byDelta.length && (byDelta[byDelta.length - 1].shareDelta as number) < 0 ? byDelta[byDelta.length - 1] : null;
  const fresh = all.filter((t) => t.label === "new").sort((a, b) => a.rank - b.rank);
  // 어제는 상위였는데 오늘은 밖인 테마(열흘 흐름의 끝 두 날로 본다).
  const dropped = all
    .filter((t) => {
      const n = t.flow.length;
      const prev = n >= 2 ? t.flow[n - 2] : null;
      const cur = t.flow[n - 1];
      return prev != null && prev <= THEME_FLOW_TOP && (cur == null || cur > THEME_FLOW_TOP);
    })
    .sort((a, b) => a.rank - b.rank);
  const climber = all.filter((t) => (t.rankChange ?? 0) > 0).sort((a, b) => (b.rankChange as number) - (a.rankChange as number))[0] ?? null;
  // '계속'은 사흘 이상. 하루 이틀은 표의 알약이 말한다.
  const lasting = all.filter((t) => t.label === "streak" && t.streak >= 3).sort((a, b) => b.streak - a.streak || a.rank - b.rank);
  const mostTopDays = [...all].sort((a, b) => b.topDays - a.topDays || a.rank - b.rank)[0] ?? null;
  const pctp = (v: number) => `${v > 0 ? "▲" : "▼"}${Math.abs(v).toFixed(1)}%p`;
  // 이틀 넘게 점유율이 오르는 중인 테마(흐름 표의 "n일째 오르는 중"과 같은 셈). 히어로 본문 셋째 줄.
  const rising = all.filter((t) => { const st = shareStreak(t); return st.dir > 0 && st.days >= 2; }).sort((a, b) => a.rank - b.rank).slice(0, 4);
  // 타일 셋째·넷째의 대체 잣대까지 정리한 것.
  const tileC = fresh[0]
    ? { cap: "새로 상위에 오른 테마", t: fresh[0], value: fresh[0].streak === 1 ? "첫 등장" : "2일째", tone: "var(--c-hot-ink)", sub: fresh.length > 1 ? `그 밖에 ${fresh.slice(1).map((x) => x.theme).join(" · ")}` : `${fresh[0].rank}위 · 점유율 ${fresh[0].sharePct.toFixed(1)}%` }
    : dropped[0]
      ? { cap: "상위에서 내려간 테마", t: dropped[0], value: `${dropped[0].rank}위`, tone: "var(--c-cold-ink)", sub: dropped.length > 1 ? `그 밖에 ${dropped.slice(1).map((x) => x.theme).join(" · ")}` : `어제까지 ${THEME_FLOW_TOP}위 안` }
      : climber
        ? { cap: "순위가 가장 오른 테마", t: climber, value: `▲${climber.rankChange}계단`, tone: "var(--c-hot-ink)", sub: `${climber.rank}위 · 점유율 ${climber.sharePct.toFixed(1)}%` }
        : null;
  const tileD = lasting[0]
    ? { cap: "계속 상위인 테마", t: lasting[0], value: `${lasting[0].streak}일째`, tone: "var(--c-cold-ink)", sub: lasting.length > 1 ? `그 밖에 ${lasting.slice(1).map((x) => `${x.theme} ${x.streak}일째`).join(" · ")}` : `${lasting[0].rank}위 · 점유율 ${lasting[0].sharePct.toFixed(1)}%` }
    : mostTopDays && mostTopDays.topDays > 0
      ? { cap: `10일 중 ${THEME_FLOW_TOP}위 안 최다`, t: mostTopDays, value: `${mostTopDays.topDays}일`, tone: "var(--c-cold-ink)", sub: `${mostTopDays.rank}위 · 점유율 ${mostTopDays.sharePct.toFixed(1)}%` }
      : null;
  const tilesA = [
    gainer ? { cap: "가장 늘어난 테마", t: gainer, value: pctp(gainer.shareDelta as number), tone: "var(--c-hot-ink)", sub: `${gainer.rank}위 · 점유율 ${gainer.sharePct.toFixed(1)}%` } : null,
    loser ? { cap: "가장 줄어든 테마", t: loser, value: pctp(loser.shareDelta as number), tone: "var(--c-cold-ink)", sub: `${loser.rank}위 · 점유율 ${loser.sharePct.toFixed(1)}%` } : null,
  ].filter((x): x is NonNullable<typeof x> => x !== null);
  const tilesB = [tileC, tileD].filter((x): x is NonNullable<typeof x> => x !== null);
  // 1위 테마가 며칠째 1위인가(집계 있는 날만, 마지막 날부터). 히어로 문장의 곁말.
  const leadTopDays = (() => {
    const t = top[0];
    if (!t) return 0;
    let n = 0;
    for (let i = t.flow.length - 1; i >= 0; i--) {
      if (t.flow[i] == null) continue;
      if (t.flow[i] !== 1) break;
      n += 1;
    }
    return n;
  })();
  // 첫 문장은 **오늘 가장 크게 달라진 테마**다. "언급의 46.5%가 반도체입니다"는 거의 늘 반도체라 문장이 굳는다(2026-09-22).
  // 절대 %p 로 고르면 그것도 늘 반도체(바탕이 커서)라 **닷새 전 대비 상대 변화**로 고른다 — 1%→2.5% 의 자동차가 36%→46% 의
  // 반도체보다 앞선다. 점유율 1% 미만 테마는 뺀다(0.2→0.6 같은 요동). 늘어난 테마가 없으면 가장 많이 줄어든 테마를.
  const mover = (() => {
    const cands = all
      .filter((t) => t.shareDelta != null && t.sharePct >= 1)
      .map((t) => {
        const before = Math.max(0.5, t.sharePct - (t.shareDelta as number));
        return { t, ratio: t.sharePct / before };
      });
    const up = cands.filter((c) => c.ratio > 1).sort((a, b) => b.ratio - a.ratio)[0];
    if (up) return { ...up, dir: 1 as const };
    const down = cands.filter((c) => c.ratio < 1).sort((a, b) => a.ratio - b.ratio)[0];
    return down ? { ...down, dir: -1 as const } : null;
  })();

  return (
    <div className="hz-tx">
      {/* ── 히어로 ── 다른 화면(테마 상세·내부자·미리보기)과 같은 1:1:2 판(.hz-kd-hero): 회색 타일 둘 + 넓은 흰 칸.
          타일 하나는 관심 변화(가장 늘어난·가장 줄어든), 다른 하나는 상위권(새로 상위·계속 상위, 없으면 대체 잣대),
          넓은 칸은 이 화면의 첫 문장과 아래 세 카드의 요약 한 줄씩. 처음엔 지도 머리의 설명 자리에 작게 있었고,
          그다음 카더라식 2열 판이었다(2026-09-22 "다른 히어로 포맷과 같게"). */}
      {top.length >= 2 && (
        <section className="hz-sheet">
          <div className="hz-kd-hero">
            <div className="hz-kd-hero-q">
              <div className="hz-kd-hero-title">
                <span style={{ fontSize: "var(--fs-14)", fontWeight: 700, letterSpacing: "-.01em", color: C.ink }}>관심 변화</span>
                <span style={{ fontSize: "var(--fs-11)", color: C.muted }}>5일 전 대비</span>
              </div>
              {tilesA.length ? tilesA.map((x) => <HeroFig key={x.cap} x={x} market={market} />) : <span style={{ fontSize: "var(--fs-12)", color: C.sub }}>견줄 5일 전 자료가 없습니다.</span>}
            </div>
            <div className="hz-kd-hero-q">
              <div className="hz-kd-hero-title">
                <span style={{ fontSize: "var(--fs-14)", fontWeight: 700, letterSpacing: "-.01em", color: C.ink }}>상위권</span>
                <span style={{ fontSize: "var(--fs-11)", color: C.muted }}>{THEME_FLOW_TOP}위 안 · 최근 {THEME_FLOW_DAYS}일</span>
              </div>
              {tilesB.length ? tilesB.map((x) => <HeroFig key={x.cap} x={x} market={market} />) : <span style={{ fontSize: "var(--fs-12)", color: C.sub }}>10일 흐름 자료가 없습니다.</span>}
            </div>
            <div className="hz-kd-hero-h">
              <div className="hz-kd-hero-title">
                <span style={{ fontSize: "var(--fs-14)", fontWeight: 700, letterSpacing: "-.01em", color: C.ink }}>테마 브리핑</span>
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: "var(--fs-11)", color: C.muted, whiteSpace: "nowrap" }}>최근 {KADERA_WINDOW_DAYS}일 · {market.themeNames.length}개 테마</span>
              </div>
              <h2 className="hz-tx-hero-title" style={{ margin: 0 }}>
                {mover ? (
                  <>
                    <Link href={market.themeHref(mover.t.theme)} style={{ color: "inherit", textDecoration: "none" }}>
                      {mover.t.theme}
                    </Link>{" "}
                    관심이 5일 전의{" "}
                    <em style={{ color: mover.dir > 0 ? "var(--c-hot-ink)" : "var(--c-cold-ink)" }}>
                      {mover.dir > 0 ? `${mover.ratio.toFixed(1)}배` : `${Math.round(mover.ratio * 100)}%`}
                    </em>
                    입니다.
                  </>
                ) : (
                  <>
                    언급의 <em>{top[0].sharePct.toFixed(1)}%</em>가{" "}
                    <Link href={market.themeHref(top[0].theme)} style={{ color: "inherit", textDecoration: "none" }}>
                      {top[0].theme}
                    </Link>
                    입니다.
                  </>
                )}
              </h2>
              <div className="hz-tx-hero-body">
                <p>
                  {mover && mover.t.theme !== top[0].theme && (
                    <>
                      점유율 {mover.t.sharePct.toFixed(1)}%로 {mover.t.rank}위입니다.{" "}
                    </>
                  )}
                  언급의 {top[0].sharePct.toFixed(1)}%는 {top[0].theme}, 그다음은 {top.slice(1).map((t) => `${t.theme} ${t.sharePct.toFixed(1)}%`).join(", ")}입니다.
                  {top[0].shareDelta != null && top[0].shareDelta !== 0 && (
                    <>
                      {" "}
                      {top[0].theme}는 5일 전보다 {Math.abs(top[0].shareDelta).toFixed(1)}%p {top[0].shareDelta > 0 ? "늘었고" : "줄었고"}
                      {leadTopDays >= 2 ? ` ${leadTopDays}일째 1위입니다.` : " 1위입니다."}
                    </>
                  )}
                </p>
                {/* 아래 두 카드의 요약 한 줄씩 — 히어로가 이 화면의 요약본이 되려면 지도만이 아니라 세 카드를 다 말해야 한다(2026-09-22).
                    종목 이름은 그 종목 화면으로, 테마 이름은 테마 화면으로 간다. */}
                {/* 종목은 태그로, 누르면 종목 화면이 아니라 **이 화면의 급부상 카드 그 줄**로 간다(2026-09-22) — 까닭이 거기 있다.
                    줄에는 id(riser-코드)가 있고 :target 이 그 줄을 잠깐 밝힌다(kadera.css). */}
                {risers && risers.length > 0 && (
                  <p style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 6px" }}>
                    <span>테마별 급부상 종목은</span>
                    {risers.slice(0, 3).map((r) => (
                      <a key={r.code} href={`#riser-${r.code}`} className="hz-theme-tag hz-theme-tag-link">
                        {r.name}
                        <span style={{ fontWeight: 500, color: C.sub2, marginLeft: 4 }}>{r.theme}</span>
                      </a>
                    ))}
                    <span>{risers.length > 3 ? `등 ${risers.length}종목입니다.` : "입니다."}</span>
                  </p>
                )}
                {rising.length > 0 && (
                  <p style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 6px" }}>
                    <span>점유율이 2일 넘게 오르는 중인 테마는</span>
                    {rising.map((t) => (
                      <Link key={t.theme} href={market.themeHref(t.theme)} className="hz-theme-tag hz-theme-tag-link is-up-1">
                        {t.theme}
                      </Link>
                    ))}
                    <span>입니다.</span>
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── 점유율 지도 ── 칸 크기 = 점유율, 색 = 변화. 누르면 그 테마 화면으로. */}
      <section className="hz-sheet">
        <SectionHead
          icon="grid_view"
          title="테마 점유율 지도"
          note={`최근 ${KADERA_WINDOW_DAYS}일`}
          desc="칸이 클수록 최근 3일 언급이 많은 테마입니다. 누르면 해당 테마 상세 페이지로 갑니다."
          noteHelp="넓이는 점유율 · 색은 변화"
          level={2}
        />
        {themes === null ? (
          <p style={{ margin: 0, padding: "16px 22px 20px", fontSize: "var(--fs-12)", color: C.sub, lineHeight: 1.7 }}>
            테마 집계를 지금 불러오지 못했습니다. 잠시 뒤 다시 열어 보십시오.
          </p>
        ) : themes.length === 0 ? (
          <p style={{ margin: 0, padding: "16px 22px 20px", fontSize: "var(--fs-12)", color: C.sub, lineHeight: 1.7 }}>아직 집계된 테마가 없습니다.</p>
        ) : (
          <>
            <div style={{ padding: "16px 22px 0" }}>
              {/* 처음 온 사람에게 가장 큰 칸 안에서 한 번: 칸이 눌리는 곳이라는 것. 내부자 리포트의 쪽지와 같은 기계. */}
              <Treemap
                tiles={themeTiles(themes, market.key)}
                ariaLabel="테마별 최근 3일 언급 점유율"
                hint={{ id: market.key === "us" ? "us-themes" : "themes", text: (label) => `${label} 칸을 누르면 이 테마의 상세 정보가 열립니다` }}
              />
            </div>
            <TreemapLegend up="관심이 늘어난 테마" flat="변화 ±0.3%p 안" down="줄어든 테마" />
          </>
        )}
      </section>

      {/* ── 테마별 급부상 종목 ── 테마마다 앞 사흘보다 언급이 가장 많이 는 종목 하나와 까닭. 종목 지도(테마 화면)가
          색으로 보이는 것을 한 줄씩 모았다. 카더라의 급부상(시장 전체 상위 여섯)과 대상이 다르다. 고르는 것도
          까닭을 쓰는 것도 파이프라인이고(generate_theme_briefs.py) 화면은 요약 행의 riser 를 읽는다. */}
      <section className="hz-sheet">
        <SectionHead
          icon="trending_up"
          /* 제목·설명은 짧고 글자 그대로(2026-09-21 "더 직관적이고 심플하게"). 셈법은 물음표 도움말로 내렸다. */
          title="테마별 급부상 종목"
          note={`최근 ${KADERA_WINDOW_DAYS}일`}
          desc="테마마다 3일 전 대비 언급이 크게 늘어난 종목 하나와 요즘 도는 얘기입니다."
          noteHelp="최근 3일 ÷ 그 전 3일"
          level={2}
        />
        {risers === null ? (
          <p style={{ margin: 0, padding: "16px 22px 20px", fontSize: "var(--fs-12)", color: C.sub, lineHeight: 1.7 }}>
            테마 요약을 지금 불러오지 못했습니다. 잠시 뒤 다시 열어 보십시오.
          </p>
        ) : risers.length === 0 ? (
          <p style={{ margin: 0, padding: "16px 22px 20px", fontSize: "var(--fs-12)", color: C.sub, lineHeight: 1.7 }}>
            3일 전 대비 언급이 늘고 채널이 이유를 말한 종목이 없습니다.
          </p>
        ) : (
          <>
            <div className="hz-thead hz-cols-theme-riser">
              <span>테마</span>
              <span>종목</span>
              <span>요즘 도는 얘기</span>
              <span style={{ textAlign: "right" }}>최근 {KADERA_WINDOW_DAYS}일 언급</span>
            </div>
            <div>
              {risers.map((r) => (
                  <div key={r.theme} id={`riser-${r.code}`} className="hz-trow hz-cols-theme-riser">
                    <Link href={market.themeHref(r.theme)} className="hz-stock-link" style={{ ...clip, minWidth: 0, fontSize: "var(--fs-13)", fontWeight: 700 }}>
                      {r.theme}
                    </Link>
                    {/* 종목 + 3일 전 대비 태그(테마 화면 '이 테마의 주인공'과 같은 태그·같은 색 단계). 예전엔 배수를 파란 알약으로
                        따로 세웠는데, 이 저장소에서 파랑은 '줄었다'라 늘어난 종목에 파란 알약이 어긋났다(2026-09-22). */}
                    <Link href={market.stockHref(r.code)} className="hz-stock-link" style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                      <StockLogo code={r.code} name={r.name} market={r.market} size={26} />
                      <span className="hz-theme-namerow">
                        <span className="hz-theme-name" style={{ ...clip, fontSize: "var(--fs-13-5)", fontWeight: 800, letterSpacing: "-.01em" }}>{r.name}</span>
                        <span className={`hz-theme-tag ${stockTone(r.recent, r.prior)}`}>{riserDelta(r)}</span>
                      </span>
                    </Link>
                    {/* 까닭(LLM 50~90자, ✨ 고지). 카더라 카드의 한 줄(22~30자)보다 길다 — 이 칸은 줄 폭을 다
                        가져서 넓은 화면은 한 줄, 1000px 는 두 줄이다. 없으면 그 사정을 적는다(빈 칸은 줄 높이가 흔들린다). */}
                    <span className="hz-theme-row-brief">
                      <AiMark size={14} style={{ flexShrink: 0, marginTop: 3 }} />
                      <span style={{ minWidth: 0, color: "var(--c-ink-soft)" }}>{r.reason}</span>
                    </span>
                    {/* 언급 수 위, 그 전 3일 수 아래 — 테마 흐름·주인공 표의 오른쪽 두 줄과 같은 꼴. */}
                    <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, flexShrink: 0 }}>
                      <span style={{ fontFamily: MONO, fontSize: "var(--fs-14)", fontWeight: 800, letterSpacing: "-.02em", color: C.ink, whiteSpace: "nowrap" }}>
                        {r.recent.toLocaleString("ko-KR")}회
                      </span>
                      <span style={{ fontFamily: MONO, fontSize: "var(--fs-11)", fontWeight: 600, color: C.sub2, whiteSpace: "nowrap" }}>그 전 {KADERA_WINDOW_DAYS}일 {r.prior.toLocaleString("ko-KR")}회</span>
                    </span>
                  </div>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="hz-sheet">
        <SectionHead
          icon="donut_small"
          title="테마 흐름"
          note={flowDates.length ? `${fmtKoDate(flowDates[0])} ~ ${fmtKoDate(flowDates[flowDates.length - 1])}` : `최근 ${THEME_FLOW_DAYS}일`}
          desc="점유율 상위 10개 테마와 각 테마에서 요즘 도는 얘기입니다."
          noteHelp="최근 3일 평균 점유율"
          level={2}
        />
        {themes === null ? (
          <p style={{ margin: 0, padding: "16px 22px 20px", fontSize: "var(--fs-12)", color: C.sub, lineHeight: 1.7 }}>
            테마 집계를 지금 불러오지 못했습니다. 잠시 뒤 다시 열어 보십시오.
          </p>
        ) : themes.length === 0 ? (
          <p style={{ margin: 0, padding: "16px 22px 20px", fontSize: "var(--fs-12)", color: C.sub, lineHeight: 1.7 }}>아직 집계된 테마가 없습니다.</p>
        ) : (
          <>
            <div className="hz-thead hz-cols-theme-list">
              <span>#</span>
              <span>테마 · 말 많은 종목</span>
              <span>요즘 도는 얘기</span>
              <span style={{ textAlign: "right" }}>점유율 · 최근 {flowDates.length || THEME_FLOW_DAYS}일</span>
            </div>
            {/* 한 줄에 테마 하나(2026-09-19 "한 열에 한 테마씩"). 네 칸 — 순위 · 이름과 변화(아래 말 많은 종목 셋) ·
                ✨ 문장(남는 폭 전부) · 점유율과 10일 한 조각(세로로). 왼쪽 두 줄(이름/종목)과 오른쪽 두 줄(점유율/조각)이
                같은 키라 줄이 반듯하고, 문장이 가운데 폭을 다 써서 넓은 화면에서도 빈 자리가 없다.
                열 줄만 먼저 보이고 나머지는 '더 보기'로 펼친다(26줄을 한 번에 세우면 벽이 된다). */}
            <div>
              {themes.slice(0, FLOW_ROWS).map((t) => (
                  <Link key={t.theme} href={market.themeHref(t.theme)} className="hz-trow hz-cols-theme-list" style={{ textDecoration: "none" }}>
                    <RankBadge n={t.rank} />
                    <span style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                      <span style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
                        <span style={{ ...clip, minWidth: 0, fontSize: "var(--fs-14)", fontWeight: 800, letterSpacing: "-.01em", color: C.ink }}>{t.theme}</span>
                        <DeltaPp value={t.shareDelta} style={{ fontSize: "var(--fs-11)", flexShrink: 0 }} />
                      </span>
                      {/* 말 많은 종목 셋(이름만). 이름 아래 흐리게 — "누가 만든 점유율인가"의 곁말. */}
                      <span style={{ ...clip, fontSize: "var(--fs-11-5)", color: C.sub2 }}>
                        {t.topStocks.length ? t.topStocks.map((x) => x.name).join(" · ") : "최근 언급 없음"}
                      </span>
                    </span>
                    {/* 문장. ✨ 는 생성형 AI 고지(app/ui.tsx AiMark). 요약이 아직 없으면 그 사정을 적고 ✨ 는 안 단다. */}
                    <span className="hz-theme-row-brief">
                      {t.briefLine && <AiMark size={14} style={{ flexShrink: 0, marginTop: 3 }} />}
                      <span style={{ minWidth: 0, color: t.briefLine ? "var(--c-ink-soft)" : C.sub2 }}>
                        {t.briefLine ??
                          (t.topStocks.length
                            ? `최근 ${KADERA_WINDOW_DAYS}일 ${t.topStocks.map((x) => `${x.name} ${x.mentions}회`).join(" · ")}가 언급되었습니다. 요약은 아직 없습니다.`
                            : `최근 ${KADERA_WINDOW_DAYS}일 사이 이 테마 종목이 채널에서 언급되지 않았습니다.`)}
                      </span>
                    </span>
                    <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                      <span style={{ fontFamily: MONO, fontSize: "var(--fs-15)", fontWeight: 800, letterSpacing: "-.02em", color: C.ink, whiteSpace: "nowrap" }}>
                        {t.sharePct.toFixed(1)}%
                      </span>
                      <Flow t={t} />
                    </span>
                  </Link>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
