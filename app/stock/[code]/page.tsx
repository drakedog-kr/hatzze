import type { Metadata } from "next";
import { assertLoaded } from "@/lib/load-state";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";

import { withSubjectParticle, withTopicParticle } from "@/lib/format";
import { STOCK_STAT_DAYS, fmtKoDate, getStockPage, stockHref, stockMddHref, themePeerStocks, type StockTrendPoint } from "@/lib/stock-page";

import { getStockDividend } from "@/lib/dividend";
import { eventDateLabel, getStockEvents, getStockMoveReason, todayKst } from "@/lib/kadera-why";
import { DIVIDEND_PUBLIC } from "../../screen-flags";
import { DividendCard } from "./DividendCard";
import { PageJsonLd } from "../../JsonLd";
import { CoverLinkCell, CoverMeta, Module, dayPill } from "../../kadera/V2Modules";
import { StockLogo } from "../../StockLogo";
import { KADERA_CARD } from "../../og-copy";
import { pageMetadata } from "../../seo";
import { BackTrail } from "@/components/back-trail";
import { themeHref } from "@/lib/theme-href";

/**
 * 종목 하나의 실주소(`/stock/005930`).
 *
 * ## 이 화면이 왜 생겼나
 *
 * 종목 하나를 가리키는 주소가 여태 `/mdd?code=005930` 뿐이었다. 그 화면은 낙폭 계산을
 * 브라우저에서 하므로 크롤러가 받는 첫 HTML 에 종목 이름조차 없다. 2026-09-01 서치콘솔
 * 실측으로 그런 주소 37개가 **전부 같은 제목**으로 평균 15위에 걸려 있었고, 걸린 검색어는
 * "램리서치 디시" · "이수페타시스 디시" · "메리츠증권 텔레그램" 처럼 우리 자료가 실제로
 * 답하는 것들이었다. 답이 적힌 화면이 없어서 생긴 자리다.
 *
 * ## ⭐ 서버가 그린다
 *
 * 이 화면의 값은 **하나도 빠짐없이 서버 HTML 에 들어간다.** 자바스크립트를 안 돌리는
 * 크롤러가 종목명·언급 수·일별 추이를 그대로 읽어야 이 화면이 존재하는 뜻이 산다.
 * 그래서 여기엔 클라이언트 컴포넌트를 두지 않는다(로고 하나만 예외 — 이미지 폴백이
 * 필요해서다. 이름은 그 옆에 글자로 따로 있다).
 *
 * ## ⚠️ 셀 화면이 464장이다
 *
 * 조회를 하나 잘못 고르면 그 대가가 464배다. 야후를 부르지 않고, 채널 합집합을 즉석에서
 * 세지 않는다 — 까닭은 lib/stock-page.ts 머리말에 적혀 있다.
 *
 * ## ⛔ 자기 제목을 자기가 그린다
 *
 * 셸(AppShell)의 본문 헤더는 NAV·DEEP_PAGES 에서 제목을 찾는데, `/stock/…` 은 어느
 * 쪽에도 없어 **제목 칸을 통째로 비운다**(그게 의도다. 종목 이름을 셸이 알 방법이
 * 없다 — 셸은 클라이언트 컴포넌트라 DB 를 못 읽는다). 그래서 h1 과 구조화 데이터를
 * 이 파일이 직접 낸다. 다른 화면처럼 셸에 맡기면 464장이 전부 같은 h1 을 갖는다.
 */
// 캐시 주기는 루트 레이아웃의 `revalidate` 가 정한다(app/layout.tsx). 예전엔 여기가
// force-dynamic 이라 방문마다 서버가 새로 그렸다.
//
// 동적 구간([...])은 generateStaticParams 가 없으면 캐시 없이 요청마다 그린다(Next 문서:
// "빈 배열을 돌려줘야 런타임에 ISR 이 된다"). 빈 배열 = 빌드 때는 아무것도 안 만들고,
// 처음 방문한 주소를 그때 그려 사본에 담는다. 없는 주소의 notFound() 도 그대로 동작한다.
export async function generateStaticParams() {
  return [];
}

/** 이동 경로의 부모. 사이드바 NAV 의 라벨과 **같은 문자열**이어야 한다(JsonLd 머리말). */
const PARENT = { name: "국장 카더라", path: "/kadera" };

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  const d = await getStockPage(code.toUpperCase());
  // ⛔ 없는 종목에 **canonical 을 주지 않는다.** 예전엔 `/kadera` 를 가리켰는데, 그건
  //    "이 404 주소는 카더라와 같은 화면입니다" 라고 말하는 것이다. 실측으로는 notFound()
  //    쪽 메타데이터가 이기지만(canonical `https://hatzze.fun` · noindex), 그 동작에
  //    기대지 않고 여기서도 색인하지 말라고만 말해 둔다.
  if (!d) return { title: "종목을 찾을 수 없습니다 | hatzze", robots: { index: false, follow: false } };

  const meta = await pageMetadata({
    title: `${d.name}(${d.code}) 상세 정보 | hatzze`,
    description: `${withSubjectParticle(d.name)} 주식 텔레그램에서 얼마나 회자되는지 봅니다. 최근 ${STOCK_STAT_DAYS}일 언급 ${d.totalMentions.toLocaleString("ko-KR")}회, 언급된 날 ${d.activeDays}일. 일별 추이와 가장 많이 언급된 날을 함께 봅니다.`,
    path: stockHref(d.code),
    // 종목 화면은 국장 카더라 구역이라 그 카드를 쓴다(app/seo.ts 의 imagePath).
    ownImage: KADERA_CARD.alt,
    imagePath: "/kadera",
  });
  // ⛔ 집계를 **못 읽은 날에는 아무 말도 하지 않는다.** 그때는 언급이 0 으로 보여 문턱
  //    미달이 되는데, 그 사이 크롤러가 오면 멀쩡한 화면에 noindex 를 내주게 된다.
  if (d.loadFailed) return meta;
  // ⛔ 얇은 화면은 색인하지 않는다. 사이트맵에 싣는 문턱(STOCK_INDEX_MIN_DAYS)과
  //    **같은 규칙**이어야 한다 — 사이트맵엔 없는데 색인은 열려 있으면 두 신호가 어긋난다.
  //    follow 는 남긴다. 아래 '함께 보는 종목' 링크는 계속 타고 가도 되는 길이다.
  return d.indexable ? meta : { ...meta, robots: { index: false, follow: true } };
}

/**
 * 언급 추이 막대. **SVG 도 라이브러리도 안 쓴다** — 막대 90개는 div 로 충분하고, 서버 컴포넌트로 남길 수 있어
 * 클라이언트 번들이 안 는다. 꼴은 테마 한 장의 '30일 점유율 추이'와 같다(.v2-tm-trend) — 최근 사흘만 진한 파랑.
 *
 * ⚠️ 빈 날을 0 으로 메워 받는다. 안 메우면 언급 없는 날을 건너뛰어 막대 간격이 날짜와 어긋나고, 추이가 실제보다 촘촘해 보인다.
 */
function Trend({ points }: { points: StockTrendPoint[] }) {
  const max = Math.max(1, ...points.map((p) => p.mentions));
  const recentFrom = points.length >= 3 ? points[points.length - 3].date : "";
  return (
    <div className="v2-tm-trend" role="img" aria-label={`최근 ${points.length}일 언급 막대`}>
      {points.map((p, i) => {
        const at = i / Math.max(1, points.length - 1);
        const edge = at > 0.72 ? " hz-tip-end" : at < 0.28 ? " hz-tip-start" : "";
        return (
          <span key={p.date} className={`hz-tip hz-vline${edge}`} data-tip={`${fmtKoDate(p.date)} · 언급 ${p.mentions}회 · 채널 ${p.channels}곳`}>
            <i
              className={!p.mentions ? "is-none" : p.date >= recentFrom ? "is-recent" : undefined}
              style={{ height: `${Math.max(p.mentions ? 3 : 1, (p.mentions / max) * 100)}%` }}
            />
          </span>
        );
      })}
    </div>
  );
}

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];
/** "10월 3일(토)" — 날짜만 있는 값이라 UTC 자정으로 읽어 요일을 뽑는다. */
const koDay = (iso: string) => `${fmtKoDate(iso)}(${WEEKDAY[new Date(`${iso}T00:00:00Z`).getUTCDay()]})`;
const md = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;
const signPct = (v: number) => `${v > 0 ? "+" : v < 0 ? "-" : ""}${Math.abs(v).toFixed(2)}%`;
const tone = (v: number | null | undefined) => (v == null || v === 0 ? "" : v > 0 ? " is-up" : " is-down");

export default async function StockPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const upper = code.toUpperCase();
  const d = await getStockPage(upper);
  assertLoaded("/stock/[code]");
  if (!d) notFound();
  if (code !== upper) permanentRedirect(stockHref(upper));

  const [peers, why, events, dividend] = await Promise.all([
    themePeerStocks(d.code, d.themes),
    getStockMoveReason(d.code, d.baseDate),
    getStockEvents(d.code),
    DIVIDEND_PUBLIC ? getStockDividend(d.code) : Promise.resolve(null),
  ]);
  assertLoaded("/stock/[code]");
  const whyRate = why ? (why.changeRate ?? (d.priceDate === why.date ? d.changeRate : null)) : null;
  const marketLabel = d.market === "KOSDAQ" ? "코스닥" : d.market === "KOSPI" ? "코스피" : null;
  const today = todayKst();
  const hasTalk = Boolean(d.narrative || why);

  /* ── v2(2026-10-03) — 테마 한 장과 같은 부품 ──────────────────────────
     뒤로 가기 줄 → 첫 줄 띠(종목 · 종가 · 테마 · MDD · 집계 기준) → 요즘 도는 얘기(판 폭) → [일별 언급 추이 | 다가오는 일정 또는 배당]
     → 배당(판 폭, 위에서 안 쓴 날) → 같은 테마 종목(판 폭). 옛 히어로 판 · 시트 부제 · 아이콘 타일 · 바닥 '다음에 볼 곳' · 각주는 걷었다 —
     다음에 볼 곳(테마 · MDD)은 첫 줄 띠의 링크 칸이, 국장 카더라는 뒤로 가기 줄이 맡는다. 집계 기준은 띠의 업데이트 자리로.
     ⭐ 짝은 **안쪽이 늘어나는 모듈끼리만** 짓는다 — 추이(막대) · 일정(줄) · 배당(달 막대)은 키를 받아 늘어나도 빈 곳이 없지만,
        요즘 도는 얘기(한두 문장) · 같은 테마 종목(알약)은 늘리면 안이 빈다. 그래서 그 둘은 판 폭 한 줄로 따로 선다.
        한때 [요즘 도는 얘기 | 추이] 짝이었는데 삼성전자에서 문장 두 줄 아래 120px 가 비었다. */
  const peersMod =
    peers.length > 0 ? (
      // ⭐ 화면 464장이 서로 안 이어져 있으면 크롤러가 못 닿는다. 사전이 이미 종목을 테마로 묶어 두고 있으니 새 자료 없이 이웃을 잇는다.
      // ⚠️ 손으로 고른 대표 바스켓이라 "이 테마의 전부"라고 말하지 않는다.
      <Module
        title="같은 테마 종목"
        meta={d.themes[0]}
        aside={
          d.themes[0] ? (
            <Link href={themeHref(d.themes[0])} className="v2-more">
              테마 판세
            </Link>
          ) : undefined
        }
      >
        <div className="v2-tm-pills">
          {peers.map((p) => (
            <Link key={p.code} href={stockHref(p.code)} className="v2-tm-pill" data-ga="stock_peer_click">
              {p.name}
            </Link>
          ))}
        </div>
      </Module>
    ) : null;
  // 이 종목을 1주 들면 1년에 얼마, 어느 달에 받나. 카더라(화제 · 일정 · 테마)가 먼저, 배당은 그다음(2026-09-15 지시).
  const dividendMod = dividend ? <DividendCard s={dividend} /> : null;

  const eventsMod =
    events.length > 0 ? (
      // 채널 글에서 뽑은 앞날의 일정. 카더라 카드와 달리 달 · 분기 · 연 단위도 보여준다 — 한 종목의 자리라 "10월 중" · "2027년"이 글로 서면 된다.
      <Module title="다가오는 일정" meta={`채널이 짚은 날짜 · 앞으로 ${events.length}건`} className="v2-tm-events">
        <ul className="v2-events">
          {events.map((e) => (
            <li key={`${e.date}-${e.precision}-${e.event}`}>
              <div className="v2-ev-row">
                <span className={`v2-daypill${e.precision === "day" && e.date === today ? " is-today" : ""}`}>
                  {e.precision === "day" ? dayPill(e.date, today) : eventDateLabel(e)}
                </span>
                <span className="v2-event-txt">{e.event}</span>
                <span className="v2-sk-evn">{e.channels}곳</span>
              </div>
            </li>
          ))}
        </ul>
      </Module>
    ) : null;
  // 추이의 짝 — 일정이 있으면 일정, 없으면 배당. 둘 다 안쪽이 늘어나는 모듈이다.
  // ⚠️ 배당이 없는 종목('최근 12개월 현금배당이 없습니다' 한 줄)은 짝으로 세우지 않는다 — 추이 키에 맞춰 늘면 그 한 줄 아래가 통째로 빈다.
  const dividendRich = Boolean(dividend && dividend.dps > 0);
  const partner = eventsMod ?? (dividendRich ? dividendMod : null);

  return (
    <div className="hz-tx v2-kd v2-tm v2-sk">
      {/* 구조화 데이터 · 이동 경로는 이 파일이 직접 낸다(머리말 '자기 제목을 자기가 그린다'). 제목은 종목 이름만 —
          `<title>` 의 긴 꼴을 넣으면 검색 결과의 이동 경로에 화면에 없는 이름이 선다. */}
      <PageJsonLd title={d.name} description={`${withSubjectParticle(d.name)} 주식 텔레그램에서 얼마나 회자되는지 봅니다.`} path={stockHref(d.code)} trail={[PARENT]} />

      <BackTrail parent={{ name: PARENT.name, href: PARENT.path }} current={d.name} />

      {/* 첫 줄 — 종목(h1) · 종가 · 테마 · MDD · 집계 기준. ⚠️ h1 은 이 칸의 종목 이름이다(셸은 이 주소의 제목을 모른다). */}
      <div className="v2-cover">
        <div className="v2-cover-cell v2-sk-id">
          <StockLogo code={d.code} name={d.name} market={d.market} size={20} />
          <h1>{d.name}</h1>
          <span className="v2-cover-k">
            {d.code}
            {marketLabel ? ` · ${marketLabel}` : ""}
          </span>
        </div>
        {d.price != null && (
          <div className="v2-cover-cell">
            <span className="v2-cover-k">{d.priceDate ? `${md(d.priceDate)} 종가` : "종가"}</span>
            <span className="v2-cover-v">
              <b>{d.price.toLocaleString("ko-KR")}원</b>
              {d.changeRate != null && <span className={`v2-cover-chg${tone(d.changeRate)}`}>{signPct(d.changeRate)}</span>}
            </span>
          </div>
        )}
        {d.themes[0] && <CoverLinkCell c={{ cap: "테마", name: d.themes[0], href: themeHref(d.themes[0]), ga: "stock_cover_theme" }} />}
        <CoverLinkCell c={{ cap: "MDD 정밀분석", name: "고점 대비 낙폭", href: stockMddHref(d.code, d.market), ga: "stock_cover_mdd" }} />
        <CoverMeta updated={`${koDay(d.baseDate)} 집계 기준`} basis="주식 텔레그램 채널 언급" />
      </div>

      {/* 둘째 줄 — 요즘 도는 얘기(최근 사흘 화제 · 움직인 날의 까닭), 판 폭. 없는 날은 안 그린다. */}
      {hasTalk && (
        <Module title="요즘 도는 얘기" ai meta="채널 글 요약">
          <dl className="v2-brief3">
            {d.narrative && (
              <div className="v2-brief3-row">
                <dt>최근 3일</dt>
                <dd>{d.narrative}</dd>
              </div>
            )}
            {/* 움직인 날의 까닭 — 3일 안의 것만(지난주 까닭을 오늘 시세 옆에 두면 다른 날 이야기가 된다). 내린 날도 보여준다. */}
            {why && (
              <div className="v2-brief3-row">
                <dt>
                  {md(why.date)} {whyRate != null && <b className={tone(whyRate).trim() || undefined}>{signPct(whyRate)}</b>}
                </dt>
                <dd>
                  {why.reason ?? "커뮤니티에서 이유를 말한 곳이 없습니다."}
                  <span className="v2-sk-src"> · 채널 {why.channelCount}곳</span>
                </dd>
              </div>
            )}
          </dl>
        </Module>
      )}

      {/* 셋째 줄 — 일별 언급 추이 | 일정(없으면 배당). 짝이 없으면 추이가 판 폭. */}
      <div className={`v2-tm-band is-brief${partner ? "" : " is-solo"}`}>
        <Module
          title="일별 언급 추이"
          meta={d.trend.length ? `${fmtKoDate(d.trend[0].date)} ~ ${fmtKoDate(d.trend[d.trend.length - 1].date)}` : undefined}
          className="v2-tm-trendmod"
        >
          {/* 실패와 '없음'을 다른 문장으로 — 같은 문장이면 고장이 자료로 위장된다. */}
          {d.loadFailed ? (
            <p className="v2-empty">언급 자료를 지금 불러오지 못했습니다. 잠시 뒤 다시 열어 보십시오.</p>
          ) : d.totalMentions === 0 ? (
            <p className="v2-empty">
              {withTopicParticle(d.name)} 최근 {STOCK_STAT_DAYS}일 사이 주식 텔레그램에서 잡힌 적이 없습니다.
            </p>
          ) : (
            <div className="v2-tm-trendbody">
              <div className="v2-tm-figs">
                <span>
                  <b>{d.totalMentions.toLocaleString("ko-KR")}회</b>
                  <em>최근 {STOCK_STAT_DAYS}일 언급</em>
                </span>
                <span>
                  <b>{d.activeDays}일</b>
                  <em>언급된 날</em>
                </span>
                {d.peak && (
                  <span>
                    <b>{d.peak.mentions.toLocaleString("ko-KR")}회</b>
                    <em>가장 많던 날 · {fmtKoDate(d.peak.date)}</em>
                  </span>
                )}
                {/* 하루 최다 채널 — 채널 합집합은 하루 단위로만 정확하다(lib/stock-page.ts 머리말 ②). 라벨이 '하루'라고 말해야 한다. */}
                {d.peakChannels && (
                  <span>
                    <b>{d.peakChannels.channels}곳</b>
                    <em>하루 최다 채널 · {fmtKoDate(d.peakChannels.date)}</em>
                  </span>
                )}
              </div>
              <Trend points={d.trend} />
              <div className="v2-tm-legend">
                <span>
                  <i className="is-recent" />
                  최근 3일 {d.recentMentions.toLocaleString("ko-KR")}회
                </span>
                <span>
                  <i />그 전
                </span>
              </div>
            </div>
          )}
        </Module>
        {partner}
      </div>

      {/* 넷째 줄부터 — 배당(추이 짝으로 안 쓴 날) · 같은 테마 종목, 각자 판 폭. 없는 게 정상인 칸은 안 그린다. */}
      {partner !== dividendMod && dividendMod}
      {peersMod}
    </div>
  );
}
