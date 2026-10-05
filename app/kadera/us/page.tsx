import type { Metadata } from "next";

import {
  getUsDailyBrief,
  getUsIssueKeywords,
  getUsKaderaSummary,
  getUsSentiment,
  getUsStockReports,
  getUsSurgingOneliners,
  getUsSurgingStocks,
  getUsThemeRotation,
  US_WINDOW_DAYS,
} from "@/lib/us-telegram-data";
import { US_BOARD_TILES, getUsMoveReasons, getUsUpcomingEvents } from "@/lib/kadera-us-why";
import { US_THEME_NAMES, usThemeHref } from "@/lib/theme-href";
import { THEME_PUBLIC } from "../../screen-flags";
import { US_THEME_PAGE } from "../../theme/copy";
import { todayKst } from "@/lib/kadera-why";
import { assertLoaded, isLoadFailed } from "@/lib/load-state";
import { formatKstUpdate } from "@/lib/format";
import { lastSession, liveChangeHead } from "@/lib/yahoo-quote";

import { pageMetadata } from "../../seo";
import { US_KADERA_CARD } from "../../og-copy";
import { ThemeVsUsualRows, highlightTerms, termsFor } from "../parts";
import { CoverLinkCell, CoverMeta, CoverUsIndexCell, EventsModule, KeywordTable, Module, SentimentModule, ThemeShares } from "../V2Modules";
import { SignalTable } from "../KaderaBoard";
import { loadUsCover } from "../cover-chips";
import type { BoardRow, BoardSection } from "../KaderaBoard";

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata({
    title: "미장 카더라 | hatzze",
    description:
      "같은 주식 텔레그램 채널들이 미국 종목은 뭐라고 하는지 봅니다. 오늘 가장 많이 언급된 미국 종목과 관심이 어느 테마로 옮겨가는지 매일 집계합니다.",
    path: "/kadera/us",
    ownImage: US_KADERA_CARD.alt,
  });
}

/**
 * 화면 사본(ISR)의 수명. 루트 레이아웃 기본값(1시간)보다 짧게 두는 건 종목 카드의 시세
 * 때문이다 — 야후 시세는 10분 캐시라 장중엔 페이지가 스스로 낡는다. 30분이면 장중 시세가
 * 최대 30분 묵고, 다시 그리는 값(원천 전송·CPU·ISR 쓰기)은 5분 때의 6분의 1 이다(2026-09-19
 * 셈: 1시간 $0.15 · 30분 $0.21 · 10분 $0.35 / 하루, 전 화면 합). 파이프라인이 총평을 쓴
 * 직후와 끝날 때 /api/revalidate 로 비우므로 자료 쪽 지연은 이 숫자와 무관하다(앞의
 * 것은 이 두 화면만 찍어 비운다 — scripts/revalidate.sh).
 * 예전엔 여기가 force-dynamic 이라 방문마다 서버가 새로 그렸다.
 * ⚠️ 리터럴이어야 한다. 국장·미장이 같은 값이다.
 */
export const revalidate = 1800;

/**
 * 미장 테마 리포트(/theme/us)로 가는 길을 낼 것인가. 국장 카더라(app/kadera/page.tsx THEME_LINKS)와 같은 규칙 —
 * 안 연 화면으로 링크를 내면 배포에서 404 라 여는 날까지 감추고, 로컬에서는 만드는 중에 봐야 하니 켠다.
 * 테마 카드 · 오늘의 요약 문장 속 테마 이름이 이 값을 본다.
 */
const THEME_LINKS = THEME_PUBLIC || !process.env.VERCEL_ENV;

/** 오늘의 요약 문장 속 테마 이름 → 미장 테마 리포트 주소(highlightTerms 의 linkTerms). 사전의 16개 이름 그대로다. */
const THEME_LINK_MAP = new Map(US_THEME_NAMES.map((t) => [t, usThemeHref(t)]));

/**
 * 신호 표 하나의 줄 수 — 국장과 같이 열 줄을 다 펼친다(app/kadera/page.tsx MAX_ROWS).
 * 움직인 종목의 시세 2차 조회가 화면에 설 줄을 알아야 해서 그쪽 상수를 그대로 쓴다(lib/kadera-us-why.ts US_BOARD_TILES).
 */
const MAX_ROWS = US_BOARD_TILES;

/** 배수 표기 — 10 이상은 정수(첫 줄 칩 · 검색 · 홈과 같은 표기). */
const times = (m: number) => `${m >= 10 ? Math.round(m) : m.toFixed(1)}배`;

/**
 * v2 미장 카더라(2026-10-03) — 국장 카더라 v2 와 **같은 얼개 · 같은 부품**이다. 두 화면은 같은 채널을 사전만 바꿔 읽은
 * 형제라, 오갈 때 같은 자리에서 같은 것을 읽어야 한다.
 *   첫 줄: 그 미국 거래일 S&P500 등락 · 국장 급부상 칸 · 업데이트
 *   둘째 줄: 여론 낙관도(테마별 평소 대비) · 테마 점유율 · 다가오는 일정
 *   셋째 줄: [급부상 | 오늘의 요약] · [크게 움직인 | 이슈 키워드] · [많이 언급]
 * 옛 화면에서 걷은 것 — 히어로(제목 · 바로가기 칩) · 구간 제목 · 트렌딩 메시지 · 미장을 많이 다루는 채널 · 몇 곳이 말하나.
 * 국장이 2026-10-02 에 채널 랭킹 · 뜨는 채널 · 화제 글을 걷은 것과 같은 까닭이다(두 달 동안 카더라 방문자의 2~5%만 눌렀다).
 */
export default async function UsKaderaPage() {
  const [summary, surging, sentiment, keywords, themes, brief, reports, surgeLines, rawWhy, rawEvents, cover, usSession] = await Promise.all([
    getUsKaderaSummary(),
    getUsSurgingStocks(MAX_ROWS),
    getUsSentiment(),
    getUsIssueKeywords(),
    getUsThemeRotation(10),
    getUsDailyBrief(),
    getUsStockReports(MAX_ROWS),
    getUsSurgingOneliners(),
    getUsMoveReasons(),
    getUsUpcomingEvents(35, 400),
    // 첫 줄 — 시장 맥락 · 국장 급부상 칸. 곁들이는 칸이라 실패해도 화면을 세우고 그 칸만 뺀다.
    loadUsCover(),
    // 급부상 · 많이 언급의 등락 칸 머리 — 미국장이 쉬면 '지금' 대신 마지막 거래일(국장과 같은 규칙).
    lastSession("^GSPC", "America/New_York").catch(() => null),
  ]);
  const liveHead = liveChangeHead(usSession);

  /* 국장과 같은 규칙 — 조회 실패와 자료 없음을 갈라 빈 자리의 문구를 바꾼다(lib/load-state.ts). */
  // 실패한 조회가 있으면 던진다 — 사본(ISR)에 실패한 화면을 담지 않는다(lib/load-state.ts).
  assertLoaded("/kadera/us", { why: rawWhy, events: rawEvents });
  const whyFailed = isLoadFailed(rawWhy);
  const why = whyFailed ? null : rawWhy;
  const eventsFailed = isLoadFailed(rawEvents);
  const events = eventsFailed ? [] : rawEvents;
  // 달력의 '오늘'은 집계 기준일이 아니라 벽시계(KST)다 — 사람이 사는 날짜여야 "내일"이 맞다.
  const usToday = todayKst();

  /* 요약 글에서 굵게 집을 낱말. **오늘 이 화면이 이미 뽑아 둔 것**만 쓴다(국장과 같은
     규칙 — parts.tsx 의 highlightTerms 주석 참고). ⚠️ 한글 표기를 쓴다 — 요약 글이 티커가 아니라 이름으로 쓰여 있다. */
  const summaryTerms = termsFor(
    surging.map((x) => x.name),
    reports.map((x) => x.name),
    themes.rows.slice(0, 4).map((x) => x.theme),
    keywords.slice(0, 5).map((x) => x.keyword),
  );

  /* ── 신호 표 셋의 재료(국장 page.tsx 와 같은 짜임 · 같은 칸) ───────────────── */
  // 흐름 요약은 첫 문장만 줄에 싣는다. 급부상 줄도 한 줄 요약이 없으면 이 첫 문장을 빌린다.
  const narrativeLead = (t: string | null) => (t ? t.split(/(?<=[가-힣]\.)\s+/)[0] : null);
  const narrativeOf = new Map(reports.map((r) => [r.ticker, r.narrative] as const));
  const moveReason = new Map([...(why?.rows ?? []), ...(why?.down ?? [])].map((r) => [r.ticker, r.reason] as const));
  const surgeRows: BoardRow[] = surging.map((s) => ({
    code: s.ticker,
    name: s.name,
    market: "US",
    change: s.changeRate,
    // 첫 언급은 배수 대신 그 말을 숫자 칸에(국장 page.tsx 와 같은 규칙, 2026-10-04 점검).
    // 빨강으로 칠하지 않는다(국장 page.tsx 와 같은 규칙, 2026-10-05 점검).
    cells: [s.isNew ? { v: "첫 언급", k: "" } : { v: times(s.multiple) }],
    // 한 줄 요약이 없으면 흐름 요약 첫 문장을, 그것도 없으면 '크게 움직인 종목'의 이유를 빌린다(국장 page.tsx 와 같은 규칙).
    text: surgeLines[s.ticker] ?? narrativeLead(narrativeOf.get(s.ticker) ?? null) ?? moveReason.get(s.ticker) ?? null,
    pending: "정리 중",
  }));

  /* 크게 내린 것(큰 순, lib/kadera-us-why.ts DOWN_MIN) → 오른 것(큰 순). 내린 줄은 적어도 둘 · 부호는 한 번만 바뀐다(국장 주석). */
  const ups = why?.rows ?? [];
  const downs = why?.down ?? [];
  const nDown = Math.min(downs.length, Math.max(2, MAX_ROWS - ups.length));
  const moveRows: BoardRow[] = [...downs.slice(0, nDown), ...ups.slice(0, MAX_ROWS - nDown)]
    .map((r) => ({ code: r.ticker, name: r.name, market: "US", change: r.changeRate, cells: [], text: r.reason }));

  /* 언급 수 순(getUsStockReports 가 이미 그 순서다). 흐름 요약은 첫 문장만 줄에 싣고 전문은 줄 title 로. */
  const talkRows: BoardRow[] = reports.map((r) => ({
    code: r.ticker,
    name: r.name,
    market: "US",
    change: r.changeRate,
    cells: [{ v: `${r.recentMentions.toLocaleString("ko-KR")}회` }],
    text: narrativeLead(r.narrative) ?? surgeLines[r.ticker] ?? null,
    full: r.narrative,
    pending: "정리 중",
  }));

  /* ⚠️⚠️ 움직인 종목의 등락은 '그날'이 아니라 **직전 미국장 세션**이다(lib/kadera-us-why.ts 머리말). 머리에 세션 날짜를 단다.
     연휴처럼 판이 오래되면(stale) 그 세션 날짜가 곧 판의 날이다. */
  const session = ups[0]?.sessionDate ?? downs[0]?.sessionDate ?? null;
  const sessionDay = session ? session.slice(5).split("-").map(Number).join("/") : null;
  const sections: BoardSection[] = [
    {
      id: "surging",
      title: "언급 급부상 종목",
      meta: `최근 ${US_WINDOW_DAYS}일 · 평소 대비`,
      // 국장과 같은 자리 · 같은 차례. 미장 줄은 내부자 리포트 종목 화면으로 가서 문구가 다르다.
      hint: { id: "stock-row-us", order: 0, text: "종목을 누르면 월가 거물·임원 매매까지 함께 나옵니다" },
      kind: "surge",
      heads: ["", "종목", liveHead, "언급 증가", "왜 뜨나"],
      key0: "언급",
      aiText: true,
      rows: surgeRows,
      empty: "아직 급부상 신호가 뚜렷한 종목이 없습니다.",
    },
    {
      id: "why",
      title: "크게 움직인 종목",
      // 날짜 꼴은 표 머리 · 첫 줄 띠와 같은 M/D(국장 page.tsx 와 같은 규칙).
      meta: sessionDay ? `${sessionDay} 미국장 마감` : undefined,
      kind: "move",
      heads: ["", "종목", sessionDay ? `${sessionDay} 등락` : "등락", "움직인 이유"],
      aiText: true,
      rows: moveRows,
      empty: whyFailed ? "이유를 불러오지 못했습니다." : "오늘 집계가 끝나면 채워집니다. 저녁 실행 뒤에 그날 것이 붙습니다.",
    },
    {
      id: "talk",
      title: "많이 언급된 종목",
      meta: `최근 ${US_WINDOW_DAYS}일`,
      kind: "talk",
      heads: ["", "종목", liveHead, "언급", "흐름 요약"],
      key0: "언급",
      aiText: true,
      rows: talkRows,
      empty: "아직 리포트를 만들 종목이 없습니다.",
    },
  ];

  return (
    <div className="hz-tx v2-kd">
      {/* 첫 줄 — 그 미국 거래일 S&P500 · 국장 급부상 칸 · 언제 · 얼마나 읽었나 */}
      <div className="v2-cover">
        {cover.index && <CoverUsIndexCell label={cover.index.label} spx={cover.index.spx} />}
        {cover.chips.map((c) => (
          <CoverLinkCell key={c.ga} c={c} />
        ))}
        <CoverMeta
          updated={summary.lastUpdated ? formatKstUpdate(summary.lastUpdated, "업데이트") : "업데이트 준비 중"}
          basis={sentiment ? `채널 글 ${sentiment.messageCount.toLocaleString("ko-KR")}건 · 최근 ${sentiment.windowDays}일` : null}
        />
      </div>

      {/* 둘째 줄 — 여론 · 오늘의 요약 · 일정(국장과 같은 자리 · 2026-10-04 요약을 테마 점유율 자리로 올렸다) */}
      <div className="v2-band">
        {sentiment ? (
          <SentimentModule score={sentiment.score} label={sentiment.label} trend={sentiment.trend ?? []} days={sentiment.windowDays}>
            <ThemeVsUsualRows themes={sentiment.byTheme} />
          </SentimentModule>
        ) : (
          <Module id="mood" title="여론 낙관도">
            <p className="v2-empty">아직 분석된 메시지가 없습니다.</p>
          </Module>
        )}
        <Module id="brief" title="오늘의 요약" ai>
          <div className="v2-brief">
            {brief.paragraphs.length === 0 ? (
              <p>
                <span>오늘의 요약을 준비하고 있습니다.</span>
              </p>
            ) : (
              (() => {
                /* 굵힌 낱말을 **대목에 걸쳐** 기억한다 — 대목마다 새로 세면 한 종목이 두 번 굵어진다(parts.tsx 주석).
                   particleAfterLatin — "TSMC의 7월 매출"의 TSMC 를 굵힌다. 미장은 라틴 이름 + 조사가 흔하다(highlightTerms 주석). */
                const used = new Set<string>();
                return brief.paragraphs.map((para, i) => (
                  <p key={i}>
                    <span>{highlightTerms(para, summaryTerms, used, { particleAfterLatin: true, linkTerms: THEME_LINKS ? THEME_LINK_MAP : undefined })}</span>
                  </p>
                ));
              })()
            )}
          </div>
        </Module>
        <EventsModule events={events} today={usToday} failed={eventsFailed} limit={10} />
      </div>

      {/* 셋째 줄 — [급부상 | 테마 점유율] · [크게 움직인 | 이슈 키워드] · [많이 언급(판 폭 전체)]. 자리는 v2.css .v2-grid 의 영역 이름이 정한다. */}
      <div className="v2-grid">
        {sections.map((sec) => (
          <SignalTable key={sec.id} sec={sec} />
        ))}
        <ThemeShares themes={themes.rows} hrefOf={THEME_LINKS ? usThemeHref : null} allHref={US_THEME_PAGE.href} />
        <KeywordTable
          keywords={keywords.map((k) => ({ rank: k.rank, word: k.keyword, count: k.mentionCount, trend: k.trend }))}
          split={false}
        />
      </div>
    </div>
  );
}
