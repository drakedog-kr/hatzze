import Link from "next/link";

import { KADERA_WINDOW_DAYS } from "@/lib/telegram-data";
import { formatKstUpdate } from "@/lib/format";
import { fmtKoDate } from "@/lib/stock-page";
import { THEME_FLOW_DAYS, THEME_FLOW_TOP, type ThemeOverview, type ThemeRiser } from "@/lib/theme-page";

import { StockLogo } from "../StockLogo";
import { DeltaPp, Pill, RankBadge } from "../kadera/parts";
import { SectionHead } from "../kadera/SectionHead";
import { AiMark, C, Icon, MONO } from "../ui";
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
  // 점유율 방향("2일째 오르는 중")과 지속 알약을 **한 줄에** 둔다. 칸이 좁던 때는 이 둘이 172px 이라 124px 칸을 넘어
  // 왼쪽 글자와 겹쳤고(2026-09-22), 접으면 세 줄, 화살표로 줄이면 뜻이 안 읽혔다. 그래서 칸을 176px 로 넓혔다 —
  // 그만큼 가운데 문장 칸이 줄지만(minmax(0,1fr)) 세 판을 거쳐 고른 답이다(kadera.css .hz-cols-theme-list).
  // 이틀 이상 이어질 때만 적는다 — 하루짜리까지 적으면 열 줄이 다 "1일째"라 말이 안 된다.
  const dirOn = streak.days >= 2 && streak.dir !== 0;
  const title = `${dirOn ? `점유율 ${streak.days}일째 ${streak.dir > 0 ? "오르는 중" : "내리는 중"} · ` : ""}최근 ${t.flowDates.length}일 순위 ${t.flow.map((r, i) => `${fmtKoDate(t.flowDates[i])} ${r == null ? "집계 없음" : `${r}위`}`).join(" · ")}`;
  return (
    <span title={title} className="hz-theme-flow">
      {dirOn && (
        <span style={{ fontSize: "var(--fs-11)", fontWeight: 700, whiteSpace: "nowrap", color: streak.dir > 0 ? "var(--c-hot-ink)" : "var(--c-cold-ink)" }}>
          {streak.days}일째 {streak.dir > 0 ? "오르는 중" : "내리는 중"}
        </span>
      )}
      <Pill tone={cap.on ? "blue" : "plain"}>{cap.text}</Pill>
    </span>
  );
}

/** 히어로 회색 타일 안의 한 항목 — 이름표 · 테마(링크) + 값 · 곁말. 테마 화면 히어로의 Fig 와 같은 눈금(값 15/800, 이름표 11).
 *  이름표는 "가장 늘어난"이 아니라 **"가장 많이 늘어난"** 이다 — '가장' 뒤에 동사만 오면 한국어로 어색하다(2026-09-22).
 *  카더라의 '가장 많이 유입'·'가장 많이 이탈'과 같은 말투다. 11자까지는 230px 타일에서 한 줄에 선다. */
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
  updatedAt,
}: {
  market: ThemeMarket;
  /** null = 집계를 못 읽었다. */
  themes: ThemeOverview[] | null;
  /** null = 요약 행을 못 읽었다. 이유 없는 줄은 부르는 쪽이 이미 걸렀다. */
  risers: ThemeRiser[] | null;
  /** 테마 요약이 마지막으로 쓰인 시각(lastThemeBriefAt). null 이면 '최종 업데이트' 줄을 안 그린다. */
  updatedAt: string | null;
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
  const climbers = all.filter((t) => (t.rankChange ?? 0) > 0).sort((a, b) => (b.rankChange as number) - (a.rankChange as number));
  const pctp = (v: number) => `${v > 0 ? "▲" : "▼"}${Math.abs(v).toFixed(1)}%p`;
  // 이틀 넘게 점유율이 오르는 중인 테마(흐름 표의 "n일째 오르는 중"과 같은 셈). 히어로 본문 셋째 줄.
  const rising = all.filter((t) => { const st = shareStreak(t); return st.dir > 0 && st.days >= 2; }).sort((a, b) => a.rank - b.rank).slice(0, 4);
  // 타일 셋째·넷째의 대체 잣대까지 정리한 것.
  // 열흘 안에서 순위가 가장 크게 오르내린 폭(최고 − 최저). 집계가 없는 날은 빼고 센다. 밀려난 테마가 없는 날의 대신이다.
  const swing = all
    .map((t) => {
      const seen = t.flow.filter((r): r is number => r != null);
      return { t, span: seen.length >= 2 ? Math.max(...seen) - Math.min(...seen) : 0, best: seen.length ? Math.min(...seen) : 0, worst: seen.length ? Math.max(...seen) : 0 };
    })
    .filter((x) => x.span > 0)
    .sort((a, b) => b.span - a.span || a.t.rank - b.t.rank);

  /* 히어로에 **같은 테마를 두 번 세우지 않는다**. 왼쪽 칸(관심 변화)이 이미 쓴 이름은 오른쪽 칸(상위권) 후보에서 뒤로 민다 —
     %p 가 가장 는 테마는 순위도 오르기 쉬워, 안 거르면 판 하나에 같은 이름이 두 번 선다(2026-09-22 미장에서 실제로 그랬다).
     거른 뒤 아무것도 안 남으면 그냥 쓴다 — 칸을 비우느니 겹치는 편이 낫다. */
  const usedByA = new Set([gainer?.theme, loser?.theme].filter((x): x is string => Boolean(x)));
  const notUsed = <T,>(list: T[], nameOf: (x: T) => string) => list.find((x) => !usedByA.has(nameOf(x))) ?? list[0] ?? null;

  // 상위권 칸의 두 줄은 **상위권의 문이다** — 들어온 테마와 밀려난 테마. 예전 둘째 줄은 '계속 상위인 테마'였는데
  // 25일을 되짚어 보니 국장은 25일 내내 반도체, 미장은 내내 AI반도체였다(2026-09-22 실측). 1위가 오래 버티는 건
  // 이 화면의 상수라 칸 하나를 줄 값이 아니다 — 며칠째 상위인지는 흐름 표의 줄마다 알약이 말하고, 1위가 며칠째인지는
  // 아래 브리핑 문장이 적는다. 새 두 줄은 같은 25일에 각각 서로 다른 값 12개(미장 9·10)가 나온다.
  const freshPick = notUsed(fresh, (t) => t.theme);
  const climberPick = notUsed(climbers, (t) => t.theme);
  const tileC = freshPick
    ? { cap: "새로 상위에 오른 테마", t: freshPick, value: freshPick.streak === 1 ? "첫 등장" : "2일째", tone: "var(--c-hot-ink)", sub: fresh.length > 1 ? `그 밖에 ${fresh.filter((x) => x !== freshPick).map((x) => x.theme).join(" · ")}` : `${freshPick.rank}위 · 점유율 ${freshPick.sharePct.toFixed(1)}%` }
    : climberPick
      ? { cap: "순위가 가장 많이 오른 테마", t: climberPick, value: `▲${climberPick.rankChange}계단`, tone: "var(--c-hot-ink)", sub: `${climberPick.rank}위 · 점유율 ${climberPick.sharePct.toFixed(1)}%` }
      : null;
  // 둘째 줄은 첫째 줄과 **같은 테마를 안 쓴다** — 한 칸에 같은 이름이 두 번 서면 둘 중 하나는 빈 줄과 같다.
  const usedTheme = tileC?.t.theme;
  const droppedOut = dropped.filter((t) => t.theme !== usedTheme);
  const dropPick = notUsed(droppedOut, (t) => t.theme);
  const swinger = notUsed(swing.filter((x) => x.t.theme !== usedTheme), (x) => x.t.theme);
  const tileD = dropPick
    ? { cap: "상위에서 내려간 테마", t: dropPick, value: `${dropPick.rank}위`, tone: "var(--c-cold-ink)", sub: droppedOut.length > 1 ? `그 밖에 ${droppedOut.filter((x) => x !== dropPick).map((x) => x.theme).join(" · ")}` : `어제까지 ${THEME_FLOW_TOP}위 안` }
    : swinger
      ? { cap: "가장 많이 오르내린 테마", t: swinger.t, value: `${swinger.span}계단`, tone: "var(--c-cold-ink)", sub: `최고 ${swinger.best}위 · 최저 ${swinger.worst}위` }
      : null;
  const tilesA = [
    gainer ? { cap: "가장 많이 늘어난 테마", t: gainer, value: pctp(gainer.shareDelta as number), tone: "var(--c-hot-ink)", sub: `${gainer.rank}위 · 점유율 ${gainer.sharePct.toFixed(1)}%` } : null,
    loser ? { cap: "가장 많이 줄어든 테마", t: loser, value: pctp(loser.shareDelta as number), tone: "var(--c-cold-ink)", sub: `${loser.rank}위 · 점유율 ${loser.sharePct.toFixed(1)}%` } : null,
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
          타일 하나는 관심 변화(가장 많이 늘어난·가장 많이 줄어든), 다른 하나는 상위권의 문(들어온 테마·밀려난 테마, 없으면 대체 잣대),
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
              <div className="hz-kd-hero-title hz-theme-brief-head">
                <span style={{ fontSize: "var(--fs-14)", fontWeight: 700, letterSpacing: "-.01em", color: C.ink }}>테마 브리핑</span>
                <span style={{ flex: 1 }} />
                {/* 기준 시각 — 카더라 '오늘의 브리핑' 눈썹 줄과 같은 꼴(아이콘 · 글자 크기 · 굵기). "최근 3일 · 26개 테마"였는데
                    기간은 지도·표 머리가 이미 적고 있어 이 자리를 언제 쓰인 글인지로 바꿨다(2026-09-23).
                    formatKstUpdate 가 "… 기준"으로 끝난다 — 또 붙이면 "기준 기준".
                    생김새는 클래스에 둔다(kadera.css .hz-theme-brief-when) — 폰에서 글자를 줄여야 하는데 인라인은 미디어쿼리를 이긴다. */}
                {updatedAt && (
                  <span className="hz-theme-brief-when">
                    <Icon name="schedule" style={{ fontSize: "var(--fs-14)", color: C.muted }} />
                    최종 업데이트 · {formatKstUpdate(updatedAt)}
                  </span>
                )}
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
                        {/* 곁말(테마)은 종목 이름보다 흐리되 C.sub2 는 다크에서 태그 바탕 위 4.01 이라 AA 미달이었다(2026-09-22 실측) — 한 단 진한 C.label. */}
                        <span style={{ fontWeight: 500, color: C.label, marginLeft: 4 }}>{r.theme}</span>
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
          /* 알약이 든 날짜는 **오른쪽 칸 알약이 세는 열흘**이다. 도움말이 "최근 3일 평균 점유율"이라 날짜와 딴 말을 하고 있었다
             (2026-09-22 지적) — 점유율 셈법은 그 숫자가 선 열 머리로 옮겼다. */
          noteHelp="순위를 센 10일"
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
              {/* 이 칸에 두 값이 선다 — 점유율(최근 3일 평균)과 열흘 한 조각. 셈법은 여기서 한 번 말한다(머리 알약은 날짜만). */}
              <span
                className="hz-tip hz-tip-wide hz-tip-end"
                data-tip="점유율은 최근 3일 평균"
                data-ga-tip="theme_flow_share"
                style={{ display: "inline-flex", alignItems: "center", justifyContent: "flex-end", gap: 3, cursor: "help" }}
              >
                점유율 · 최근 {flowDates.length || THEME_FLOW_DAYS}일
                <Icon name="help" style={{ fontSize: "var(--fs-12)", color: C.muted }} />
              </span>
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
                        {/* 요약이 없을 때의 대신. 머리가 이미 기간을 적고 있어 여기선 "최근 3일"을 되풀이하지 않는다(2026-09-22). */}
                        {t.briefLine ??
                          (t.topStocks.length
                            ? `${t.topStocks.map((x) => `${x.name} ${x.mentions}회`).join(" · ")}가 언급되었습니다. 요약은 아직 없습니다.`
                            : "이 테마 종목이 아직 언급되지 않았습니다.")}
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
