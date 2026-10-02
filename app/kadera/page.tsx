import type { Metadata } from "next";
import Link from "next/link";

import {
  getEcosystemSentiment,
  getIssueKeywords,
  getStockNarratives,
  getSurgingOneliners,
  getStockReport,
  getSurgingStocks,
  getTelegramSummary,
  getThemeRotation,
  getTopStocksWithTrend,
  KADERA_WINDOW_DAYS,
} from "@/lib/telegram-data";

import { assertLoaded, isLoadFailed } from "@/lib/load-state";

import { KADERA_CARD } from "../og-copy";
import { pageMetadata } from "../seo";
import { Icon } from "../ui";
import { highlightTerms, termsFor } from "./parts";
import { fmtKoDate } from "@/lib/stock-page";
import { THEME_NAMES, themeHref } from "@/lib/theme-href";
import { THEMES } from "@/lib/stock-themes";
import { THEME_PUBLIC } from "../screen-flags";
import { getMoveReasons, getUpcomingEvents, todayKst } from "@/lib/kadera-why";
import { EventsModule, Module, SentimentModule, ThemeHeat } from "./V2Modules";
import { SignalTable } from "./KaderaBoard";
import type { BoardRow, BoardSection } from "./KaderaBoard";

/** "10/1 19:30" — 패널 머리에 들어갈 짧은 KST 시각. */
function shortKst(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 9 * 3600_000);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${hh}:${mm}`;
}

// 미리보기 이미지는 옆의 opengraph-image.tsx 가 그린다(ownImage). 자세한 건 app/seo.ts 주석 참고.
export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata({
    title: "국장 카더라 | hatzze",
    description: "주식 텔레그램 채널 수백 개를 대신 읽습니다. 오늘 가장 많이 언급된 종목과 가장 많이 퍼진 메시지를 매일 집계합니다.",
    path: "/kadera",
    ownImage: KADERA_CARD.alt,
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

/* 요약 글의 굵힘(highlightTerms)은 미장 히어로도 똑같이 쓴다. 한쪽만 고쳐져 두 화면의
   강조 규칙이 갈리지 않도록 ./parts 로 옮겼다 — 규칙과 함정은 그쪽 주석에. */


/**
 * 테마 리포트로 가는 길을 낼 것인가. 안 연 화면(app/screen-flags.ts THEME_PUBLIC)으로 링크를 내면 배포에서 404 라
 * 여는 날까지는 감춘다 — 로컬(배포 아님)에서는 만드는 중에 봐야 하니 켠다. 사이드바와 같은 규칙.
 * 테마 로테이션 줄·유입/이탈 두 칸·급등 종목/종목 리포트의 테마 칩·오늘의 브리핑 문장 속 테마 이름이 이 값을 본다(2026-09-22).
 */
const THEME_LINKS = THEME_PUBLIC || !process.env.VERCEL_ENV;

/** 오늘의 브리핑 문장 속 테마 이름 → 테마 리포트 주소(highlightTerms 의 linkTerms). 사전의 26개 이름 그대로다. */
const THEME_LINK_MAP = new Map(THEME_NAMES.map((t) => [t, themeHref(t)]));

/** 종목 이름 → 속한 테마들(사전 순서). 급등 종목·종목 리포트 타일의 테마 칩이 쓴다. 한 종목이 여러 테마에 들 수 있다. */
const THEMES_OF_NAME = new Map<string, string[]>();
for (const [theme, names] of Object.entries(THEMES)) {
  for (const n of names) THEMES_OF_NAME.set(n, [...(THEMES_OF_NAME.get(n) ?? []), theme]);
}

export default async function KaderaPage() {
  // 종목 리포트는 "어느 종목인지"를 먼저 알아야 해서 getTopStocksWithTrend 에 매여 있다.
  // 그렇다고 이걸 await 한 **뒤에** 나머지를 시작하면, 나머지와 아무 상관 없는 그 왕복이
  // 페이지 앞에 통째로 붙는다(실측 240ms, 콜드 1,976ms). 독립적인 조회들은 지금 바로
  // 띄우고, 종목 리포트만 이 프로미스에 이어 붙인다 — 둘이 나란히 간다.
  // 4종목인 이유: 시트 안 2×2 격자라 넷이어야 줄이 찬다. 파이프라인은 상위 6종목까지
  // 흐름 요약을 만들므로(NARRATIVE_TOP_N) 넷째 칸에도 문단이 붙는다.
  const topStocksPromise = getTopStocksWithTrend(6);
  const reportsPromise = topStocksPromise.then((tops) =>
    Promise.all(tops.map((s) => getStockReport(s.code))),
  );
  const [
    summary,
    surging,
    rawThemes,
    reports,
    rawSentiment,
    keywords,
    rawNarratives,
    rawSurgeLines,
    rawWhy,
    rawEvents,
  ] =
    await Promise.all([
      getTelegramSummary(),
      // 3×2 셀 격자라 여섯이어야 줄이 찬다(예전 카드 배치에선 다섯이었다).
      getSurgingStocks(6),
      // v2: 채널 파워 랭킹 · 뜨는 채널 · 화제 글은 걷었다(2026-10-02). 두 달 동안 카더라 방문자의 2~5%만 눌렀다.
      getThemeRotation(10),
      reportsPromise,
      getEcosystemSentiment(),
      getIssueKeywords(10),
      getStockNarratives(),
      getSurgingOneliners(),
      getMoveReasons(),
      getUpcomingEvents(35, 400),
    ]);
  const stockReports = reports.filter((r): r is NonNullable<typeof r> => r !== null);

  /* ── 조회 실패를 "자료 없음" 과 가른다 ───────────────────────────────────
     세 로더는 실패하면 `LOAD_FAILED` 를 돌려준다(lib/load-state.ts). 여기서 **한 번만**
     갈라 두면 아래 렌더 1,000여 줄은 예전 타입 그대로 쓰고, 빈 상태를 그리는 자리에서만
     문구를 바꿔 끼우면 된다.

     ⭐ 폴백 값은 예전과 같다(`[]` · `null` · `{}`). 달라지는 건 **화면이 그 빈 값을 뭐라고
     설명하느냐**뿐이다 — "아직 없습니다" 는 사실이 아닐 수 있고, 실패했을 때 그렇게 적으면
     화면이 거짓말을 한다(2026-08-06 "언급 1,002회 · 0개 채널"). */
  // 실패한 조회가 있으면 던진다 — 사본(ISR)에 실패한 화면을 담지 않는다(lib/load-state.ts).
  // 아래의 "실패와 부재를 갈라 문구를 바꾸는" 길은 그래서 실제로는 안 탄다. 던지지 않기로
  // 되돌릴 때 그대로 살아나게 남겨 둔다.
  assertLoaded("/kadera", {
    themes: rawThemes, sentiment: rawSentiment, narratives: rawNarratives,
    surgeLines: rawSurgeLines, why: rawWhy, events: rawEvents,
  });
  const themesFailed = isLoadFailed(rawThemes);
  const themes = themesFailed ? [] : rawThemes;
  const sentimentFailed = isLoadFailed(rawSentiment);
  const sentiment = sentimentFailed ? null : rawSentiment;
  /* ⚠️ 흐름 요약은 **문구를 안 붙인다.** 이 문단은 종목 카드 4장 안에 각각 들어가서, 한 줄을
     넣으면 같은 문장이 네 번 뜬다. 게다가 문단이 빠져도 카드가 거짓을 말하지는 않는다 —
     "요약이 없다"고 적는 자리가 아니라 그냥 없는 것이다. 실패는 #394 의 로그로만 잡는다. */
  const narratives = isLoadFailed(rawNarratives) ? {} : rawNarratives;
  // 급부상 카드의 한 줄. 없는 종목은 그 줄만 빠진다(주요 종목 리포트와 같은 규칙).
  const surgeLines = isLoadFailed(rawSurgeLines) ? {} : rawSurgeLines;
  /* '급등 종목'·'다가오는 일정'도 같은 규칙 — 실패와 부재를 갈라 빈 자리의 문구를 바꾼다. */
  const whyFailed = isLoadFailed(rawWhy);
  const why = whyFailed ? null : rawWhy;
  const eventsFailed = isLoadFailed(rawEvents);
  const events = eventsFailed ? [] : rawEvents;
  // 달력의 '오늘'은 집계 기준일이 아니라 벽시계(KST)다 — 사람이 사는 날짜여야 "내일"이 맞다.
  const kaderaToday = todayKst();

  /* 요약 글에서 굵게 집을 낱말. **오늘 화면이 이미 뽑아 둔 것**만 쓴다(highlightTerms
     주석 참고). 여기 없는 종목은 요약에 나와도 굵어지지 않는다 — 회자되는 것과
     지나가는 이름을 가르는 것이 이 목록의 일이다.
     긴 것부터 대야 "삼성전자"가 "삼성"에 먼저 걸리지 않는다. */

  const summaryTerms = termsFor(
    surging.map((x) => x.name),
    stockReports.map((x) => x.name),
    themes.slice(0, 4).map((x) => x.theme),
    keywords.slice(0, 5).map((x) => x.word),
  );

  /* 히어로의 현황 타일(모니터링 채널·총 구독자·활성 채널·총 메시지)은 전부 걷었다(2026-09-27).
     그 자리는 센티먼트 추이가 다 쓴다 — 오른쪽 칸이 통째로 여론 이야기라 왼쪽 제목과 한 덩어리로 읽힌다.
     - 메시지 수는 이미 히어로에 있다(센티먼트 캡션의 "최근 N일 · N건 분석").
     - 채널 수는 채널 파워 랭킹 머리로 옮겼다가 거기서도 뺐다(2026-09-28). 화면에 채널 수가 없다.
     - 총 구독자는 채널마다 구독자를 더한 값이라 여러 채널을 구독한 한 사람이 여러 번 세어졌다. */

  /* ── 신호 표 셋의 재료 ──────────────────────────────────────────────────
     급부상 · 오늘 움직인 종목(오른 것 + 5% 넘게 내린 것) · 많이 언급(KaderaBoard 머리말). */
  const surgeDays = surging[0]?.recentDays ?? KADERA_WINDOW_DAYS;

  const surgeRows: BoardRow[] = surging.map((s) => ({
    code: s.code,
    name: s.name,
    market: s.market,
    // 야후 실시간이 아니면(KRX 저장 종가 폴백) 등락률을 비운다 — 그날 것이라 방향까지 뒤집혀 보인다(QuoteDate 주석).
    change: s.isLive ? s.changeRate : null,
    tag: s.isNew ? "신규" : undefined,
    cells: [{ v: `${s.ratio.toFixed(1)}배`, hot: true }, { v: `${s.recentMentions}회` }],
    bars: { values: s.series.slice(-7), hot: s.recentDays, tone: "warm" },
    text: surgeLines[s.code] ?? null,
    pending: "집계가 끝나면 붙습니다",
  }));

  // 오른 것 여섯 뒤에 크게 내린 것 셋까지(lib/kadera-why.ts DOWN_MIN). 내린 줄은 없는 날이 많고, 부호 색이 둘을 가른다.
  const moveRows: BoardRow[] = [...(why?.rows ?? []).slice(0, 6), ...(why?.down ?? []).slice(0, 3)].map((r) => ({
    code: r.code,
    name: r.name,
    market: r.market,
    change: r.changeRate,
    cells: [{ v: r.closePrice != null ? `${r.closePrice.toLocaleString("ko-KR")}원` : "-" }],
    text: r.reason,
  }));

  const talkRows: BoardRow[] = stockReports.map((r) => ({
    code: r.code,
    name: r.name,
    market: r.market,
    change: r.changeRate,
    cells: [{ v: `${r.totalMentions.toLocaleString("ko-KR")}회` }, { v: r.channelCount !== null ? `${r.channelCount}곳` : "-" }],
    bars: { values: r.series.slice(-7).map((d) => d.mentions), hot: r.series.slice(-7).filter((d) => d.scored).length, tone: "cold" },
    text: narratives[r.code] ?? null,
    pending: "집계가 끝나면 붙습니다",
  }));

  const sections: BoardSection[] = [
    {
      id: "surging",
      title: "급부상 종목",
      meta: `최근 ${surgeDays}일 언급 · 평소와 견줌`,
      kind: "surge",
      heads: ["", "종목", "등락률", "평소 대비", `${surgeDays}일 언급`, "7일", "왜 뜨나"],
      aiText: true,
      rows: surgeRows,
      empty: "아직 급부상 신호가 뚜렷한 종목이 없습니다.",
    },
    {
      id: "why",
      title: "오늘 움직인 종목",
      meta: why ? `${fmtKoDate(why.date)} 종가 · 채널 글이 말한 까닭` : "채널 글이 말한 까닭",
      kind: "move",
      heads: ["", "종목", "등락률", "종가", "까닭"],
      aiText: true,
      rows: moveRows,
      empty: whyFailed ? "까닭을 불러오지 못했습니다." : "오늘 집계가 끝나면 채워집니다. 저녁 실행 뒤에 그날 것이 붙습니다.",
    },
    {
      id: "talk",
      title: "많이 언급된 종목",
      meta: `최근 ${KADERA_WINDOW_DAYS}일 언급 수`,
      kind: "talk",
      heads: ["", "종목", "등락률", "언급", "채널", "7일", "흐름 요약"],
      aiText: true,
      rows: talkRows,
      empty: "아직 리포트를 만들 종목이 없습니다.",
    },
  ];

  /* 첫 줄 — 집계 개요. 블록웍스의 'Market Overview' 띠처럼 작은 이름 위에 값. 숫자마다 근거(기간)를 단다. */
  const newCount = surging.filter((x) => x.isNew).length;
  const topTheme = themes[0];
  const cover: { k: string; v: string; sub?: string; live?: boolean }[] = [
    { k: "집계", v: summary.lastUpdated ? shortKst(summary.lastUpdated) : "준비 중", live: true },
    ...(sentiment ? [{ k: "분석한 글", v: `${sentiment.messageCount.toLocaleString("ko-KR")}건`, sub: `최근 ${sentiment.windowDays}일` }] : []),
    { k: "급부상", v: `${surging.length}종목`, sub: newCount > 0 ? `신규 ${newCount}` : undefined },
    ...(topTheme ? [{ k: "가장 많이 말한 테마", v: topTheme.theme, sub: `${topTheme.sharePct.toFixed(1)}%` }] : []),
  ];

  /* 화제어 — 오른쪽 줄기 맨 아래 모듈. 칩마다 언급 수와 점유율 변화. */
  const keywordModule = (
    <Module id="keywords" title="화제어" meta="최근 3일 · 종목명이 아닌 말">
      {keywords.length === 0 ? (
        <p className="v2-empty">아직 뽑을 화제어가 없습니다.</p>
      ) : (
        <ul className="v2-chips">
          {keywords.slice(0, 12).map((k) => {
            const d = k.shareDelta === null ? null : k.shareDelta * 100;
            return (
              <li key={k.word} className="v2-chip">
                <b>{k.word}</b>
                <span>{k.count.toLocaleString("ko-KR")}</span>
                {d !== null && Math.abs(d) >= 0.05 && (
                  <span className={d > 0 ? "is-up" : "is-down"}>
                    {d > 0 ? "+" : "-"}
                    {Math.abs(d).toFixed(1)}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Module>
  );

  return (
    <div className="hz-tx v2-kd">
      {/* 첫 줄 — 집계 개요 */}
      <div className="v2-cover">
        {cover.map((c) => (
          <div key={c.k} className="v2-cover-cell">
            <span className="v2-cover-k">
              {c.live && <i className="v2-dot" />}
              {c.k}
            </span>
            <span className="v2-cover-v">
              <b>{c.v}</b>
              {c.sub && <em>{c.sub}</em>}
            </span>
          </div>
        ))}
        {THEME_LINKS && (
          <Link href="/theme" className="v2-cover-link">
            테마 전체 보기
            <Icon name="chevron_right" />
          </Link>
        )}
      </div>

      <div className="v2-grid">
        {/* 왼쪽 줄기 — 오늘의 요약 → 신호 표 셋 */}
        <div className="v2-col">
          <Module
            id="brief"
            title="오늘의 요약"
            ai
            meta={summary.lastUpdated ? `${shortKst(summary.lastUpdated)} 작성` : undefined}
            aside={sentiment ? `근거 글 ${sentiment.messageCount.toLocaleString("ko-KR")}건` : undefined}
          >
            <div className="v2-brief">
              {(() => {
                const used = new Set<string>();
                return (sentiment?.summary ?? "오늘의 요약을 준비하고 있습니다.")
                  .split(/\n{2,}/)
                  .map((para, i) => <p key={i}>{highlightTerms(para, summaryTerms, used, { linkTerms: THEME_LINKS ? THEME_LINK_MAP : undefined })}</p>);
              })()}
            </div>
          </Module>
          {sections.map((sec) => (
            <SignalTable key={sec.id} sec={sec} />
          ))}
        </div>

        {/* 오른쪽 줄기 — 여론 · 테마 · 화제어 · 일정 */}
        <div className="v2-col v2-rail">
          {sentiment ? (
            <SentimentModule score={sentiment.score} label={sentiment.label} trend={sentiment.trend ?? []} />
          ) : (
            <Module id="mood" title="여론 낙관도">
              <p className="v2-empty">{sentimentFailed ? "감성 집계를 불러오지 못했습니다." : "아직 분석된 메시지가 없습니다."}</p>
            </Module>
          )}
          <ThemeHeat themes={themes} hrefOf={THEME_LINKS ? themeHref : null} />
          {keywordModule}
          {/* 맨 아래 — 왼쪽 줄기 끝까지 늘어나는 자리(v2.css .v2-grid). 목록이 가장 길게 늘 수 있는 모듈이라 여기 둔다. */}
          <EventsModule events={events} today={kaderaToday} failed={eventsFailed} />
        </div>
      </div>
    </div>
  );
}
