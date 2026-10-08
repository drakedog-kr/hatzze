import Link from "next/link";

import { eventDateLabel, todayKst, type UpcomingEvent } from "@/lib/kadera-why";
import { fmtKoDate } from "@/lib/stock-page";
import { KADERA_WINDOW_DAYS, addDaysISO } from "@/lib/telegram-data";
import { THEME_TREND_DAYS, type ThemePageData, type ThemeReasonRow, type ThemeTrendPoint } from "@/lib/theme-page";

import { StockLogo } from "../StockLogo";
import { CoverMeta, Module, dayPill } from "../kadera/V2Modules";
import type { ThemeMarket } from "./market";
import { stockTone, usualDeltaText } from "./Treemap";
import { ShareBar } from "./ShareBar";
import { BackTrail } from "@/components/back-trail";

/**
 * 테마 하나의 화면 본문 — **국장(/theme/[테마])과 미장(/theme/us/[테마])이 같이 쓴다.** 자료는 각자 읽어(lib/theme-page.ts ·
 * lib/us-theme-page.ts) 같은 타입(ThemePageData)으로 넘기고, 시장마다 다른 것(주소·사전·시세 캡션·낱말)은 ThemeMarket
 * (app/theme/market.ts)이 든다. 화면의 구조와 판단은 이 파일 한 곳이다 — 두 벌로 베끼면 한쪽만 고쳐진다.
 *
 * ## 이 화면이 답하는 것
 * "이 테마를 두고 채널에서 요즘 무슨 얘기가 도나." 전부 서술이고 판단·예측·점수는 없다.
 *
 * ## v2(2026-10-03) — 카더라 · MDD · 배당에 쓴 규칙으로
 * 뒤로 가기 줄 → 첫 줄 띠(테마 종목 · 최근 3일 점유율 · 시세 반응 · 기준일) → [요즘 도는 얘기 | 30일 점유율 추이]
 * → [말 많은 종목(줄마다 요즘 도는 얘기) | 다가오는 일정 · 함께 거론되는 테마] → 등락의 이유(최근 7일).
 * - 걷은 것: 회색 타일 히어로, 큰 구간 제목 셋(01 · 02 · 03), 시트 머리 아이콘 타일 · 설명 문장, 등락의 이유 '이전 7일' 단추(쪽 넘김),
 *   '채널에서 오간 글' 카드 여섯 장 + 더 보기 — 카더라 v2 에서 화제 글을 걷은 것과 같은 까닭(눌린 비율 2~5%).
 * - 주인공은 1~5 · 6~10 두 단이었는데 한 단 열 줄로(비교 목록은 한 단 세로 목록이 낫다 — MDD 업종 칸 때 정한 것).
 * - 일정은 5주 달력을 걷고 카더라 v2 일정 꼴(날짜 알약 + 일정)로 — 날짜가 짚인 것 뒤에 달 · 분기만 짚인 것을 같은 줄 꼴로 잇는다.
 *
 * ## ⭐ 서버가 그린다
 * 종목 화면과 같은 이유다 — 크롤러가 테마 이름·말 많은 종목·이유를 첫 HTML 에서 읽어야 이 화면이 검색에 잡힌다.
 * (주를 넘기던 ReasonWeeks 를 걷어 이제 클라이언트 부품은 로고뿐이다.)
 *
 * ## 제목은 셸이 그린다
 * 테마는 사전이 정적이라 셸의 DEEP_PAGES 가 이름을 안다(AppShell). v2 에선 화면에서만 걷고 h1 은 남는다.
 */

/** '말 많은 종목' 줄 수. */
const HOT_ROWS = 10;
/** 일정 — 날짜가 짚인 것은 앞으로 5주(카더라와 같다), 달 · 분기만 짚인 것은 가까운 것 몇 줄. */
const CALENDAR_DAYS = 35;
const VAGUE_ROWS = 6;
/** 등락의 이유 — 기준일까지의 이레. 30일치를 다 세우면 반도체는 1,830px 였다(2026-09-21). 쪽 넘김은 걷었다(v2). */
const REASON_DAYS = 7;
const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];
const mdShort = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;
const fmtKoWd = (iso: string) => `${fmtKoDate(iso)}(${WEEKDAY[new Date(`${iso}T00:00:00Z`).getUTCDay()]})`;

// 부호 · 색은 **반올림한 값**으로 정한다 — −0.001 이 '−0.00%'로, +0.04%p 가 회색이 아닌 빨강 '0.0%p'로 찍혔다(2026-10-04 점검).
const signed = (v: number, digits: number, unit: string) => {
  const r = Number(v.toFixed(digits));
  return `${r > 0 ? "+" : r < 0 ? "-" : ""}${Math.abs(r).toFixed(digits)}${unit}`;
};
const signPct = (v: number) => signed(v, 2, "%");
const pp = (v: number) => signed(v, 1, "%p");
const toneCls = (v: number | null | undefined, digits = 2) => {
  const r = v == null ? 0 : Number(v.toFixed(digits));
  return r > 0 ? " is-up" : r < 0 ? " is-down" : "";
};

/**
 * 30일 점유율 막대. 최근 사흘(띠의 점유율 칸이 재는 날들)만 진한 파랑, 그 전은 옅은 파랑 — 두 자리가 같은 날을 가리킨다.
 * 막대 칸은 모듈 남는 높이를 다 받는다(옆 '요즘 도는 얘기'가 키를 정한다).
 */
function Trend({ points, recent }: { points: ThemeTrendPoint[]; recent: Set<string> }) {
  const max = Math.max(0.1, ...points.map((p) => p.share));
  return (
    <div className="v2-tm-trend" role="img" aria-label={`최근 ${points.length}일 점유율 막대`}>
      {points.map((p, i) => {
        const at = i / Math.max(1, points.length - 1);
        const edge = at > 0.72 ? " hz-tip-end" : at < 0.28 ? " hz-tip-start" : "";
        return (
          <span
            key={p.date}
            className={`hz-tip hz-vline${edge}`}
            // 계산에서 뺀 날(기준일 아침처럼 표본이 거의 없는 날)은 '집계 전' — 0.0% 로 적으면 틀린 값으로 읽혔다(lib/theme-page.ts thin).
            data-tip={p.thin ? `${fmtKoDate(p.date)} · 집계 전` : `${fmtKoDate(p.date)} · 점유율 ${p.share.toFixed(1)}%${p.rank ? ` · ${p.rank}위` : ""}`}
          >
            <i
              className={!p.share ? "is-none" : recent.has(p.date) ? "is-recent" : undefined}
              style={{
                // 0 인 날은 2px 바닥선(내부자 · 종목 추이와 같은 꼴, 2026-10-05).
                height: p.share ? `${Math.max(3, (p.share / max) * 100)}%` : "2px",
              }}
            />
          </span>
        );
      })}
    </div>
  );
}

export function ThemeDetailView({ market, d }: { market: ThemeMarket; d: ThemePageData }) {
  const theme = d.theme;
  const mentionedCount = d.hotStocks.length;
  const trendFrom = d.trend[0]?.date;
  const trendTo = d.trend[d.trend.length - 1]?.date;
  // 추이 위 숫자 셋 — 최고인 날 · 집계가 있는 날의 평균 · 연속 오른(내린) 날.
  const counted = d.trend.filter((p) => p.rank != null);
  const peak = counted.reduce<ThemeTrendPoint | null>((best, p) => (best == null || p.share > best.share ? p : best), null);
  const avgShare = counted.length ? counted.reduce((sum, p) => sum + p.share, 0) / counted.length : null;
  // 연속 오른(내린) 날 — 집계가 있는 날만 이어 보며 마지막 날부터 거슬러 같은 방향이 며칠째인지. 마지막 변화가 0 이거나 날이 둘 미만이면 0일.
  let streakDir: 1 | -1 | 0 = 0;
  let streakDays = 0;
  for (let i = counted.length - 1; i > 0; i--) {
    const diff = counted[i].share - counted[i - 1].share;
    const dir = diff > 0 ? 1 : diff < 0 ? -1 : 0;
    if (streakDir === 0) {
      if (dir === 0) break;
      streakDir = dir;
    }
    if (dir !== streakDir) break;
    streakDays += 1;
  }
  const recentSet = new Set(d.recentDays);
  const today = todayKst();

  /* 일정 — 날짜가 짚인 것(앞으로 5주)을 먼저, 그 뒤에 달 · 분기 · 연만 짚인 것을 가까운 순으로. 달 · 분기는 놓을 날짜 칸이 없어
     예전엔 달력 아래 따로 적었다 — 같은 줄 꼴에 알약 글자만 '10월 중'으로 다르게 둔다. */
  const calendarEnd = addDaysISO(today, CALENDAR_DAYS);
  const dayEvents = d.events
    .filter((e) => e.precision === "day" && e.date >= today && e.date <= calendarEnd)
    .sort((a, b) => a.date.localeCompare(b.date) || b.channels - a.channels);
  // 달 · 분기 일정도 그 기간이 앞으로 5주 안에 시작하는 것만 — 머리가 '앞으로 5주'인데 12월 · 2027년 일정이 실렸다(2026-10-04 점검).
  // 반기 · 해 단위('2026년')는 5주 일정이라 부르기 어려워 뺀다.
  const vagueEvents = d.events.filter((e) => (e.precision === "month" || e.precision === "quarter") && e.date <= calendarEnd).slice(0, VAGUE_ROWS);
  // 줄 수는 주인공 표 줄 수 + 둘까지 — 오른쪽 칸이 더 길면 주인공 줄이 그 키를 나눠 받아 한 줄이 89~100px 로 늘었다(빅테크 일정 16줄).
  const hotRows = Math.min(HOT_ROWS, d.hotStocks.length);
  const events: { e: UpcomingEvent; pill: string; today: boolean }[] = [
    ...dayEvents.map((e) => ({
      e,
      pill: dayPill(e.date, today),
      today: e.date === today,
    })),
    ...vagueEvents.map((e) => ({ e, pill: eventDateLabel(e), today: false })),
  ].slice(0, Math.max(6, hotRows + 2));

  // 일정이 주인공 표 줄 수의 70% 가 안 되면 옆 칸에 두지 않는다 — 일정 줄이 주인공 키를 나눠 받아 한 줄이 84~187px 로 늘어 칸이 텅 비었다
  // (방산 2건 · 미장 메모리 1건 · 미장 AI반도체 5건, 2026-10-05 점검). 그때는 주인공을 판 폭으로 펴고 그 아래에 일정(두 단) → 함께 거론되는
  // 테마를 판 폭으로 쌓는다. 짝(두 칸)으로 두면 키가 같아져 알약 칸 아래가 비었다.
  const solo = events.length < hotRows * 0.7;

  /* 등락의 이유 — 기준일까지의 이레를 날짜로 묶는다(오래된 날이 위 · 달력 순서, 같은 날은 여러 채널이 말한 것이 먼저). */
  const reasonEnd = d.baseDate;
  const reasonStart = addDaysISO(reasonEnd, -(REASON_DAYS - 1));
  const reasonDays = (() => {
    const m = new Map<string, ThemeReasonRow[]>();
    for (const r of d.reasons) {
      if (r.date < reasonStart || r.date > reasonEnd) continue;
      const g = m.get(r.date);
      if (g) g.push(r);
      else m.set(r.date, [r]);
    }
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, list]) => [date, list.sort((a, b) => b.channelCount - a.channelCount)] as const);
  })();
  // 종가 칸 — 국장만 있다(미장은 늘 null). 하나도 없으면 칸째 걷는다.
  const anyClose = d.reasons.some((r) => r.close != null);
  // 가장 최근 날의 등락률은 다음 날 낮에 채워진다(KRX 가 그날 종가를 이튿날 준다) — 그날 빈칸엔 '종가 전'. 그보다 옛날의 빈칸은 '-'.
  const newestReason = d.reasons.reduce((m, r) => (r.date > m ? r.date : m), "");

  // 함께 거론되는 테마(요약 행의 related, 많이 같이 나온 순). 요약이 없으면 사전 순서의 앞뒤 넷 — 26장이 서로 이어져야 크롤러가 닿는다.
  const relatedThemes = (d.brief?.related ?? []).map((r) => r.theme).filter((t) => t !== theme && market.themeNames.includes(t));
  const names = market.themeNames;
  const idx = names.indexOf(theme);
  const neighbors = [-2, -1, 1, 2].map((k) => names[(idx + k + names.length) % names.length]).filter((t, i, arr) => t !== theme && arr.indexOf(t) === i);

  /* 일정 · 함께 거론되는 테마 — 보통은 주인공 옆 오른쪽 칸에 쌓는다. 일정이 하나도 없으면 오른쪽 칸이 한 줄 빼고 통째로 비어서
     (원전, 2026-10-03 실측 223px) 주인공을 판 폭 전체로 펴고 이 둘을 그 아래 한 줄 짝으로 내린다. */
  const sideMods = (
    <>
      <Module title="다가오는 일정" meta={`앞으로 ${CALENDAR_DAYS / 7}주`} className="v2-tm-events">
        {events.length === 0 ? (
          <p className="v2-empty">앞으로 {CALENDAR_DAYS / 7}주 안에 짚인 이 테마 종목의 일정이 아직 없습니다.</p>
        ) : (
          // --ev-rows — 두 단으로 세로 먼저 채울 때의 줄 수(판 폭으로 쌓일 때 · 1,000 미만 옆 칸, v2.css .v2-tm-events).
          <ul className="v2-events" style={{ ["--ev-rows" as string]: Math.ceil(events.length / 2) }}>
            {events.map(({ e, pill, today: isToday }) => (
              <li key={`${e.code}-${e.date}-${e.event}`}>
                <Link href={market.stockHref(e.code)} className="v2-ev-row" data-ga="theme_event_click">
                  <span className={`v2-daypill${isToday ? " is-today" : ""}`}>{pill}</span>
                  <span className="v2-event-txt">
                    <b>{e.name}</b> {e.event}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Module>
      {/* 함께 거론되는 테마 — 같은 글에 같이 나온 테마(많이 같이 나온 순). 요약이 아직 없으면 사전 순서의 이웃 넷. */}
      <Module
        title={relatedThemes.length ? "함께 거론되는 테마" : "다른 테마"}
        aside={
          <Link href={market.indexHref} className="v2-more">
            테마 전체
          </Link>
        }
        className="v2-tm-related"
      >
        <div className="v2-tm-pills">
          {(relatedThemes.length ? relatedThemes : neighbors).map((t) => (
            <Link key={t} href={market.themeHref(t)} className="v2-tm-pill" data-ga="theme_related_click">
              {t}
            </Link>
          ))}
        </div>
      </Module>
    </>
  );
  const anyTalk = d.hotStocks.slice(0, HOT_ROWS).some((x) => x.talk);

  return (
    <div className="hz-tx v2-kd v2-tm">
      {/* 목록으로 돌아가는 줄 — v2 에선 화면 제목이 걷혀 이 줄이 테마 이름을 말하는 자리다. */}
      <BackTrail parent={{ name: market.indexLabel, href: market.indexHref }} current={theme} />

      {/* 첫 줄 — 테마 종목 · 최근 사흘 점유율 · 시세 반응 · 기준일 */}
      <div className="v2-cover">
        <div className="v2-cover-cell">
          <span className="v2-cover-k">테마 종목</span>
          <span className="v2-cover-v">
            <b>{d.members.length}종목</b>
            {!d.loadFailed && (
              // '최근 3일 언급 49'는 49 가 횟수인지 종목 수인지 안 읽혔다(2026-10-04 점검).
              <em>
                최근 {KADERA_WINDOW_DAYS}일 언급된 종목 {mentionedCount}
              </em>
            )}
          </span>
        </div>
        <div className="v2-cover-cell">
          {/* 칸 이름엔 점유율의 기간만, 변화(+%p)가 견준 기간은 그 값 바로 앞에 — 칸 이름에 '최근 3일 점유율 · 1~2주 전 대비'로 나란히
              두었더니 두 기간이 한 덩어리로 읽혔다(2026-10-05 운영자 판단, 카더라 · 테마 판세와 같은 정리). '평소'라 부르지 않는 건
              말 많은 종목 태그(앞 27일)와 두 뜻이 돼서다(2026-10-04 점검). */}
          <span className="v2-cover-k">최근 {KADERA_WINDOW_DAYS}일 점유율</span>
          <span className="v2-cover-v">
            {d.loadFailed || d.recentShare == null ? (
              <em>{d.loadFailed ? "집계를 불러오지 못했습니다" : "집계된 날이 없습니다"}</em>
            ) : (
              <>
                <b>{d.recentShare.toFixed(1)}%</b>
                {d.shareDelta != null && (
                  <>
                    <em>1주 전 대비</em>
                    <span className={`v2-cover-chg${toneCls(d.shareDelta, 1)}`}>{pp(d.shareDelta)}</span>
                  </>
                )}
                {d.recentRank && <em>{d.recentRank}위</em>}
              </>
            )}
          </span>
        </div>
        {/* 시세 반응 — 최근 거래일 테마 종목의 평균 등락과 오른 · 내린 종목 수. 언급(말) 옆에 시세(값)를 두면 값이 말을 따라왔는지가 보인다. */}
        {d.quotes.avgChange != null && (
          <div className="v2-cover-cell">
            <span className="v2-cover-k">{market.quotesCaption(d.quotes.date)}</span>
            <span className="v2-cover-v">
              <em>평균</em>
              <b className={toneCls(d.quotes.avgChange).trim() || undefined}>{signPct(d.quotes.avgChange)}</b>
              {/* 종목 수는 색만 — 한 줄에 굵은 덩어리가 셋이었다(2026-10-05 점검). 굵게는 평균 등락 하나. */}
              <em>오른 종목</em>
              <span className="v2-cover-chg is-up">{d.quotes.up}</span>
              <em>내린 종목</em>
              <span className="v2-cover-chg is-down">{d.quotes.down}</span>
            </span>
          </div>
        )}
        <CoverMeta updated={`${fmtKoDate(d.baseDate)} 기준`} />
      </div>

      {/* 둘째 줄 — [요즘 도는 얘기 | 30일 점유율 추이]. 글이 키를 정하고 막대가 남는 높이를 받는다. */}
      <div className="v2-tm-band is-brief">
        {/* 모듈 머리 날짜는 모두 M/D — 한 화면에 '10/2~10/4' · '9월 28일 ~ 10월 4일' 두 꼴이 섰다(2026-10-05 점검). 알약(10/7(수))과 같은 꼴이다. */}
        <Module title="요즘 도는 얘기" ai meta={d.brief ? `${mdShort(d.brief.date)} · 최근 ${KADERA_WINDOW_DAYS}일 채널 글` : undefined}>
          {d.brief?.brief ? (
            <div className="v2-brief">
              {/* 두 문단(파이프라인이 빈 줄로 가른다). 첫 문단은 가장 크게 오간 이야기, 둘째는 그 밖의 이야기. */}
              {d.brief.brief.split(/\n\s*\n/).map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>
          ) : (
            /* 세 경우를 갈라 적는다 — 아직 안 만들었다 · 글이 없었다 · 만들었지만 검사에 걸려 안 실었다. */
            <p className="v2-empty">
              {!d.brief
                ? "이 테마의 요약이 아직 없습니다."
                : d.brief.messageCount === 0
                  ? `최근 ${KADERA_WINDOW_DAYS}일 사이 이 테마 종목이 언급된 글이 없습니다.`
                  : "이번 요약은 검사에 걸려 싣지 않았습니다."}
            </p>
          )}
        </Module>

        <Module
          title={`${THEME_TREND_DAYS}일 점유율 추이`}
          meta={trendFrom && trendTo ? `${mdShort(trendFrom)}~${mdShort(trendTo)}` : undefined}
          className="v2-tm-trendmod"
          // 날마다의 값은 막대 말풍선에만 있다 — 폰은 눌러야 열린다(종목 화면 일별 언급 추이와 같은 id).
          hint={!d.loadFailed && d.trend.length ? { id: "trend-bar", anchor: ".v2-tm-trend", at: "inside", text: "막대를 누르면 그날 값이 나옵니다" } : undefined}
        >
          {d.loadFailed ? (
            <p className="v2-empty">집계를 지금 불러오지 못했습니다. 잠시 뒤 다시 열어 보십시오.</p>
          ) : (
            <div className="v2-tm-trendbody">
              <div className="v2-tm-figs">
                <span>
                  <b>{peak ? `${peak.share.toFixed(1)}%` : "-"}</b>
                  <em>최고{peak ? ` · ${fmtKoDate(peak.date)}` : ""}</em>
                </span>
                <span>
                  <b>{avgShare == null ? "-" : `${avgShare.toFixed(1)}%`}</b>
                  <em>{THEME_TREND_DAYS}일 평균</em>
                </span>
                {/* "1일 · 연속 내린 날"은 30일 중 하루가 그랬다는 말로 읽혔다(2026-09-21). "1일째 · 내리는 중"이면 지금 진행형이다. */}
                {/* 하루뿐이면 '1일째 오르는 중' 대신 '어제보다 오름'(목록은 이틀부터 적던 것과 맞춘다, 2026-10-05 점검). */}
                <span>
                  <b>{streakDays === 1 ? "어제보다" : streakDays ? `${streakDays}일째` : "-"}</b>
                  <em>{streakDays === 1 ? (streakDir < 0 ? "내림" : "오름") : streakDir < 0 ? "내리는 중" : streakDir > 0 ? "오르는 중" : "어제와 같음"}</em>
                </span>
              </div>
              <Trend points={d.trend} recent={recentSet} />
              <div className="v2-tm-legend">
                <span>
                  <i className="is-recent" />
                  최근 {KADERA_WINDOW_DAYS}일
                </span>
                <span>
                  <i />그 전
                </span>
              </div>
            </div>
          )}
        </Module>
      </div>

      {/* 셋째 줄 — [이 테마의 주인공 | 다가오는 일정 · 함께 거론되는 테마]. 주인공 열 줄이 키를 정하고 오른쪽 일정 줄이 그 높이를 나눠 받는다. */}
      <div className={`v2-tm-band is-hot${solo ? " is-solo" : ""}`}>
        {/* 이름은 목록 화면과 같은 '말 많은 종목'(2026-10-04 점검). 요즘 도는 얘기 칸이 AI 글이라 고지는 머리에. */}
        {/* 사흘을 날짜로 — 이 화면의 사흘은 기준일을 넣고(2026-09-29 결정), 종목 화면 · 카더라는 기준일 앞 사흘이라 같은 '최근 3일'에
            숫자가 달랐다(삼성전자 318회 · 612회, 2026-10-04 점검). */}
        <Module
          title="말 많은 종목"
          meta={`${d.recentDays.length ? `${mdShort(d.recentDays[0])}~${mdShort(d.recentDays[d.recentDays.length - 1])}` : `최근 ${KADERA_WINDOW_DAYS}일`} 언급 · 평소 대비`}
          className="v2-tm-hot"
          ai={anyTalk}
        >
          {d.loadFailed ? (
            <p className="v2-empty">집계를 지금 불러오지 못했습니다.</p>
          ) : d.hotStocks.length === 0 ? (
            <p className="v2-empty">최근 {KADERA_WINDOW_DAYS}일 사이 이 테마 종목이 채널에서 언급되지 않았습니다.</p>
          ) : (
            <>
              {/* 앞 다섯 종목의 몫과 나머지 — "몇 종목에 쏠렸나". */}
              <div className="v2-tm-share">
                <ShareBar stocks={d.hotStocks} ariaLabel={`${theme} 테마 종목별 최근 ${KADERA_WINDOW_DAYS}일 언급의 몫`} />
              </div>
              {/* 열 종목 모두 도는 얘기가 없으면(요약 행이 아직 없는 날) 그 칸을 걷는다 — '-' 만 열 줄 서 있었다(원전). */}
              <div className={`v2-tbl v2-tm-hottbl${anyTalk ? "" : " no-reason"}`}>
                {/* 칸 차례는 이름 → 문장 → 숫자(2026-10-04, 테마 목록의 두 표와 같다). 숫자(오른쪽 정렬)가 문장 앞에 붙으면 '597회'와 이유 첫 낱말이
                    한 덩어리로 읽혔다. */}
                <div className="v2-tr v2-th" aria-hidden="true">
                  <span />
                  <span>종목</span>
                  {anyTalk && <span>요즘 도는 얘기</span>}
                  <span>언급 · 채널</span>
                </div>
                <ol className="v2-tbody">
                  {d.hotStocks.slice(0, HOT_ROWS).map((s, i) => (
                    <li key={s.code}>
                      <Link href={market.stockHref(s.code)} className="v2-tr" data-ga="theme_hot_click">
                        <span className="v2-td-rank">{i + 1}</span>
                        <span className="v2-td-stock">
                          <StockLogo code={s.code} name={s.name} market={s.market} size={22} />
                          <span className="v2-td-name">{s.name}</span>
                          {/* 평소와 견준 언급 변화 — 색은 지도 칸과 같은 단계(stockTone). */}
                          <span className={`hz-theme-tag ${stockTone(s.mentions, s.usualMentions)}`}>{usualDeltaText(s.mentions, s.usualMentions)}</span>
                        </span>
                        {/* 요즘 도는 얘기 한 줄(파이프라인이 줄마다 쓴다 · lib/theme-page.ts talkOf). 예전 이 칸은 '채널이 말한 이유'(등락 까닭)라
                            움직이지 않은 종목은 비어 열 줄 중 대여섯이 빈칸이었고, 같은 문장이 아래 '등락의 이유'에 또 섰다(2026-10-05 운영자 결정).
                            없는 줄은 비워 둔다 — '-' 가 줄마다 서면 잡음이다. */}
                        {anyTalk && <span className={`v2-td-text${s.talk ? "" : " is-pending"}`}>{s.talk}</span>}
                        <span className="v2-td-num v2-td-two">
                          {s.mentions.toLocaleString("ko-KR")}회<em>{s.channels}곳</em>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ol>
              </div>
            </>
          )}
        </Module>

        {!solo && <div className="v2-tm-side">{sideMods}</div>}
      </div>

      {/* [판단 8 · 2026-10-08 마지막 점검] 일정이 1건 이하면 두 칸으로 나란히(is-short) — 판 폭으로 쌓으면 함께 거론 알약 끝(622)부터
          모듈 오른끝까지 790px 가 비었다. 일정이 여럿이면 10-05 결정대로 쌓는다(알약 칸이 일정 키로 늘어 비었다). */}
      {solo && <div className={`v2-tm-stack${events.length <= 1 ? " is-short" : ""}`}>{sideMods}</div>}

      {/* 넷째 줄 — 등락의 이유(기준일까지의 이레). 날짜 머리 하나 아래 그날 종목들 — 줄은 종목 · 까닭(남는 폭) · 종가 · 등락 · 채널 수.
          숫자는 줄 오른쪽 끝에 모은다(2026-10-04) — 등락이 종목과 까닭 사이에 있을 땐 '+3.27%'와 까닭 첫 낱말이 붙어 읽혔다.
          종가는 % 앞에(같은 날 요청). 미장은 그날 종가가 없어(lib/theme-page.ts ThemeReasonRow.close) 그 칸째 걷는다. */}
      {/* '크게 움직인 날'은 뺐다 — 이유 후보엔 많이 언급된 종목도 들어 −0.98% 같은 작은 움직임 줄이 섞인다(2026-10-04 점검). */}
      {/* 이유가 하나도 없는 주는 모듈째 그리지 않는다 — 문장 한 줄짜리 판 폭 모듈이 섰다(방산, 2026-10-05 점검). */}
      {reasonDays.length > 0 && (
        <Module title="등락의 이유" meta={`${mdShort(reasonStart)}~${mdShort(reasonEnd)}`} className="v2-tm-reasons" ai>
          <div className={`v2-tm-days${anyClose ? "" : " no-close"}`}>
            {reasonDays.map(([date, list]) => (
              <section key={date} aria-label={fmtKoWd(date)}>
                <div className="v2-tm-dayhead">
                  <b>{fmtKoWd(date)}</b>
                  {date === today && <span className="v2-badge">오늘</span>}
                  <em>{list.length}건</em>
                </div>
                <ol className="v2-tm-reasonrows">
                  {list.map((r) => (
                    <li key={`${date}-${r.code}`}>
                      <Link href={market.stockHref(r.code)} className="v2-tr" data-ga="theme_reason_click">
                        <span className="v2-td-stock">
                          <StockLogo code={r.code} name={r.name} market={r.market} size={22} />
                          <span className="v2-td-name">{r.name}</span>
                        </span>
                        <span className="v2-td-text">{r.reason}</span>
                        {anyClose && <span className="v2-td-num v2-td-px">{r.close == null ? "" : `${Math.round(r.close).toLocaleString("ko-KR")}원`}</span>}
                        <span className={`v2-td-num v2-td-chg${toneCls(r.changeRate)}${r.changeRate == null ? " is-none" : ""}`} title={market.reasonRateNote}>
                          {r.changeRate == null ? (market.key === "kr" && date === newestReason ? "종가 전" : "-") : signPct(r.changeRate)}
                        </span>
                        <span className="v2-td-num v2-td-ch">{r.channelCount}곳 언급</span>
                      </Link>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </div>
        </Module>
      )}
    </div>
  );
}
