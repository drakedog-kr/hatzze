import type { Metadata } from "next";
import { assertLoaded } from "@/lib/load-state";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";

import { withSubjectParticle, withTopicParticle } from "@/lib/format";
import {
  STOCK_STAT_DAYS,
  STOCK_TREND_DAYS,
  fmtKoDate,
  getStockPage,
  stockHref,
  stockMddHref,
  themePeerStocks,
  type StockPageData,
  type StockTrendPoint,
} from "@/lib/stock-page";

import { getStockDividend } from "@/lib/dividend";
import { daysFromToday, eventDateLabel, getStockEvents, getStockMoveReason } from "@/lib/kadera-why";
import { DIVIDEND_PUBLIC } from "../../screen-flags";
import { DividendCard } from "./DividendCard";
import { Pill } from "../../kadera/parts";
import { PageJsonLd } from "../../JsonLd";
import { SectionHead } from "../../kadera/SectionHead";
import { StockLogo } from "../../StockLogo";
import { KADERA_CARD } from "../../og-copy";
import { pageMetadata } from "../../seo";
import { AiMark, C, Icon, MONO, R } from "../../ui";
import { PageTools } from "../../PageTools";
import { themeHref } from "@/lib/theme-href";
import { KADERA_WINDOW_DAYS } from "@/lib/telegram-data";

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
 *
 * 2026-09-30 부터는 셸이 이 경로에서 **머리를 아예 그리지 않는다**(AppShell 의 SELF_INTRO_PREFIXES). 예전엔 도구(다크 모드)만
 * 남은 빈 띠가 약 58px 있었고, 이름은 첫 카드 안에서야 나왔다. 이제 이 화면의 머리(Intro)가 부모 경로 · 이름(h1) · 종가 ·
 * 도구를 한 줄에 그린다 — 다른 화면의 제목 줄과 같은 자리다.
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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
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

/** "2026-09-07" → "9/7". 막대 아래 눈금은 짧아야 칸 사이에 선다. */
function mdLabel(iso: string) {
  const [, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}`;
}

/** 그 날이 월요일인가 — 막대 아래 주 눈금. 날짜 문자열만 보므로 시간대와 무관하다. */
function isMonday(iso: string) {
  return new Date(`${iso}T00:00:00Z`).getUTCDay() === 1;
}

/**
 * 언급 추이 막대. **SVG 도 라이브러리도 안 쓴다** — 30개짜리 막대는 div 로 충분하고,
 * 서버 컴포넌트로 남길 수 있어 클라이언트 번들이 안 는다(내부자 종목 상세와 같은 꼴).
 *
 * ⚠️ 빈 날을 0 으로 메워 받는다. 안 메우면 언급 없는 날을 건너뛰어 막대 간격이 날짜와
 *    어긋나고, 추이가 실제보다 촘촘해 보인다.
 *
 * 2026-09-30: 최근 사흘(카더라와 같은 창 — 'LLM 문장이 말하는 기간')을 진하게, 그 전을 옅게 칠하고, 가장 많던 날에
 * '최다 N회'를 단다. 기준일은 합계에서 빼지만(아직 반나절) 막대 끝에 **빗금 칸**으로 둔다 — 위의 '왜 움직였나'가 그날
 * 이야기를 하는데 막대가 전날에서 끝나면 급등한 날이 그림에 없었다. 옅은 막대(--c-blue-3)의 명암비는 낮지만(2.0) 값은
 * 툴팁과 왼쪽 통계 칸에 있고, 두 색의 구분은 범례가 받친다(카더라 리포트 타일과 같은 짝).
 */
function Trend({ points, today }: { points: StockTrendPoint[]; today: StockTrendPoint | null }) {
  const max = Math.max(1, ...points.map((p) => p.mentions), today?.mentions ?? 0);
  const cols = points.length + (today ? 1 : 0);
  const recentFrom = points.length - KADERA_WINDOW_DAYS;
  const peakAt = points.reduce((best, p, i) => (p.mentions > points[best].mentions ? i : best), 0);
  const colPct = (i: number) => ((i + 0.5) / cols) * 100;
  return (
    <div className="hz-strend">
      {points[peakAt].mentions > 0 && (
        <span className="hz-strend-peak" style={{ left: `${colPct(peakAt)}%` }}>
          최다 {points[peakAt].mentions.toLocaleString("ko-KR")}회
        </span>
      )}
      <div className="hz-strend-bars">
        {points.map((p, i) => {
          // ⚠️⚠️ 손닿는 자리는 **막대가 아니라 칸 전체**다. 막대 높이로 호버를 받으면 언급이
          //    적은 날은 높이가 3%(3px)뿐이라 사실상 못 짚는다.
          const at = i / Math.max(1, cols - 1);
          const edge = at > 0.72 ? " hz-tip-end" : at < 0.28 ? " hz-tip-start" : "";
          return (
            <span key={p.date} className={`hz-tip hz-vline hz-strend-col${edge}`} data-tip={`${fmtKoDate(p.date)} · 언급 ${p.mentions}회 · 채널 ${p.channels}곳`}>
              <span
                className={`hz-strend-bar${p.mentions ? (i >= recentFrom ? " is-recent" : "") : " is-zero"}`}
                // 0 인 날도 1px 은 남긴다. 아예 없으면 "자료가 없는 날"과 구별이 안 된다.
                style={{ height: `${Math.max(p.mentions ? 3 : 1, (p.mentions / max) * 100)}%` }}
              />
            </span>
          );
        })}
        {today && (
          <span className="hz-tip hz-vline hz-strend-col hz-tip-end hz-strend-today" data-tip={`${fmtKoDate(today.date)} · 집계 중(지금까지 ${today.mentions}회)`}>
            <span className="hz-strend-bar is-partial" style={{ height: `${Math.max(today.mentions ? 3 : 1, (today.mentions / max) * 100)}%` }} />
          </span>
        )}
      </div>
      <div className="hz-strend-x" aria-hidden="true">
        {points.map((p, i) =>
          isMonday(p.date) ? (
            // 끝 쪽 월요일 눈금은 폰에서 '집계 중' 눈금과 겹친다(칸이 좁다) — 그때만 숨긴다(tx.css ≤560).
            <span key={p.date} className={today && i >= points.length - 3 ? "is-near-today" : undefined} style={{ left: `${colPct(i)}%` }}>
              {mdLabel(p.date)}
            </span>
          ) : null,
        )}
        {today && (
          <span className="hz-strend-x-today" style={{ left: `${colPct(points.length)}%` }}>
            {mdLabel(today.date)}
            <br />
            집계 중
          </span>
        )}
      </div>
    </div>
  );
}

/** 통계 칸의 한 줄. 이름은 왼쪽, 값은 오른쪽 끝에 맞춘다. */
function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="hz-sstat">
      <span className="hz-sstat-l">{label}</span>
      <span className="hz-sstat-v">
        <strong>{value}</strong>
        {sub && <span>{sub}</span>}
      </span>
    </div>
  );
}

/** 오르내림 색 — 이 저장소의 온도색 둘(--c-hot-ink · --c-cold-ink). 화살표를 같이 둔다(색만으로 방향을 말하지 않는다). */
function moveColor(v: number) {
  return v > 0 ? "var(--c-hot-ink)" : v < 0 ? "var(--c-cold-ink)" : C.sub2;
}
function moveText(v: number) {
  return `${v > 0 ? "▲" : v < 0 ? "▼" : ""}${Math.abs(v).toFixed(2)}%`;
}

/**
 * 화면 머리 — 부모 경로 · 로고 · 이름(h1) · 코드와 시장 · 오른쪽 종가 · 도구, 그 아래 '왜 움직였나' 한 줄.
 *
 * 종가는 **야후가 아니라 `stocks` 표(KRX)에서 온 값**이다(머리말 참고). 폰(≤560)에서는 종가가 둘째 줄로 내려가고
 * 도구는 탑바가 맡는다(다른 화면의 머리 도구와 같은 규칙 — .hz-page-tools 가 ≤900 에서 숨는다).
 *
 * 한 줄 미리보기는 상자 전체를 링크로 두지 않는다. 안의 ✨(AiMark)가 고지를 여는 **단추**라 링크 안에 넣으면 대화형
 * 요소가 겹친다. 오른쪽 '왜 움직였나 ›' 만 아래 시트로 가는 링크다.
 */
function Intro({ d, marketLabel, why, whyRate }: {
  d: StockPageData;
  marketLabel: string | null;
  why: { reason: string | null } | null;
  whyRate: number | null;
}) {
  return (
    <header className="hz-sintro">
      <nav aria-label="현재 위치" className="hz-sintro-crumb">
        <Link href={PARENT.path} className="hz-back-link">
          {PARENT.name}
        </Link>
        <span aria-hidden="true">
          <Icon name="chevron_right" style={{ fontSize: 15 }} />
        </span>
      </nav>
      <div className="hz-sintro-row">
        <div className="hz-sintro-id">
          <StockLogo code={d.code} name={d.name} market={d.market} size={44} />
          <div className="hz-sintro-name">
            {/* 이 화면의 h1. 셸이 이 경로에서 머리를 그리지 않으므로 여기가 유일한 h1 이다. */}
            <h1>{d.name}</h1>
            <span>
              {d.code}
              {marketLabel && ` · ${marketLabel}`}
            </span>
          </div>
        </div>
        {d.price != null && (
          <div className="hz-sintro-quote">
            <span className="hz-sintro-quote-main">
              <strong>{d.price.toLocaleString("ko-KR")}</strong>
              <span className="hz-sintro-won">원</span>
              {d.changeRate != null && (
                <span className="hz-sintro-chg" style={{ color: moveColor(d.changeRate) }}>
                  {moveText(d.changeRate)}
                </span>
              )}
            </span>
            {d.priceDate && <span className="hz-sintro-date">{fmtKoDate(d.priceDate)} 종가</span>}
          </div>
        )}
        <div className="hz-page-tools hz-sintro-tools">
          <PageTools />
        </div>
      </div>
      {why?.reason && (
        <div className="hz-sintro-why">
          <AiMark size={15} style={{ flexShrink: 0 }} />
          <p>
            {why.reason}
            {whyRate != null && (
              <span className="hz-sintro-why-rate" style={{ color: moveColor(whyRate) }}>
                {" "}
                {moveText(whyRate)}
              </span>
            )}
          </p>
          <a href="#why" className="hz-sintro-why-go">
            왜 움직였나
            <span aria-hidden="true">
              <Icon name="chevron_right" style={{ fontSize: 16 }} />
            </span>
          </a>
        </div>
      )}
    </header>
  );
}

/**
 * 끝의 '다음에 볼 곳'. 이 화면은 '얼마나 회자되나'만 답한다 — 테마의 흐름, 고점에서의 거리, 오늘 무엇이 도는지는
 * 각 화면이 답한다. 예전의 'MDD 정밀분석에서 보기' 카드가 이 줄로 들어왔다(배당 계산은 바로 위 배당 카드의 단추가 잇는다).
 * ⭐ 서버 링크라 크롤러도 타고 간다 — 464장이 서로와 구역 화면으로 이어진다.
 */
function NextLinks({ d }: { d: StockPageData }) {
  const links: { href: string; icon: "hub" | "trending_down" | "forum"; title: string; sub: string }[] = [
    ...(d.themes[0] ? [{ href: themeHref(d.themes[0]), icon: "hub" as const, title: `${d.themes[0]} 테마`, sub: "테마 판세에서 흐름 보기" }] : []),
    { href: stockMddHref(d.code, d.market), icon: "trending_down", title: "MDD 정밀분석", sub: "고점에서 얼마나 내려와 있나" },
    { href: PARENT.path, icon: "forum", title: PARENT.name, sub: "오늘 무엇이 회자되나" },
  ];
  return (
    <nav className="hz-snext" aria-label="다음에 볼 곳">
      <span className="hz-snext-cap">다음에 볼 곳</span>
      <div className="hz-snext-row">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="hz-snext-i">
            <span aria-hidden="true">
              <Icon name={l.icon} style={{ fontSize: 20, color: "var(--c-cold-ink)" }} />
            </span>
            <span className="hz-snext-tx">
              <b>{l.title}</b>
              <span>{l.sub}</span>
            </span>
            <span aria-hidden="true" className="hz-snext-go">
              <Icon name="chevron_right" style={{ fontSize: 18 }} />
            </span>
          </Link>
        ))}
      </div>
    </nav>
  );
}

export default async function StockPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  // 종목코드에 대문자가 섞인 것이 80개 있다(0009K0 · 00088K 같은 새 체계). 그중 넷은
  // 사이트맵에도 실린다. 소문자로 적힌 바깥 링크가 404 가 되지 않게 정본으로 넘긴다.
  const upper = code.toUpperCase();
  const d = await getStockPage(upper);
  // ⚠️ notFound() **앞에서** 던진다. 조회가 5xx 로 죽으면 getStockPage 는 null 을 돌려주는데,
  //    그걸 "없는 종목"으로 읽어 404 를 내면 그 404 가 사본(ISR)에 5분 담긴다 — DB 가 잠깐
  //    아픈 동안 멀쩡한 종목이 404 로 굳는다(로컬 스텁으로 실제로 그렇게 됐다).
  assertLoaded("/stock/[code]");
  // 없는 종목은 **넘기기 전에** 404 를 낸다. 순서를 바꾸면 `/stock/abcdef` 같은 쓰레기
  // 주소가 308 을 한 번 거친 뒤에야 404 가 되어 크롤러에 헛걸음을 두 번 시킨다.
  if (!d) notFound();
  if (code !== upper) permanentRedirect(stockHref(upper));

  const [peers, why, events, dividend] = await Promise.all([
    themePeerStocks(d.code, d.themes),
    getStockMoveReason(d.code, d.baseDate),
    getStockEvents(d.code),
    // 배당 카드 — 배당으로 살기가 열리기 전엔 안 그린다(링크가 404 로 간다). 기본키 조회 셋뿐이라 464장에도 가볍다.
    DIVIDEND_PUBLIC ? getStockDividend(d.code) : Promise.resolve(null),
  ]);
  // 곁다리 넷도 실패하면 폴백(`[]` · `null`)을 돌려줘 그 칸만 빠진다 — 배당 카드가 빠지면 배당 자료가 없는 종목과 똑같이 보인다.
  // 위의 검사는 이 조회들 **앞**이라 못 본다. 한 번 더 던져 칸 빠진 화면이 사본(ISR)에 한 시간 담기지 않게 한다
  // (lib/load-state.ts — kadera 도 따로 받은 구간 뒤에 다시 부른다). 재생성이면 마지막 성공본이 그대로 나간다.
  assertLoaded("/stock/[code]");
  // 그날 등락률. 파이프라인이 KRX 확정값을 채웠으면 그것, 아니면 stocks 의 값이 **그 날짜일 때만** 쓴다
  // (이 화면은 야후를 안 부른다 — lib/stock-page.ts 머리말 ①). 둘 다 아니면 까닭만 보여준다.
  const whyRate = why ? (why.changeRate ?? (d.priceDate === why.date ? d.changeRate : null)) : null;
  const marketLabel = d.market === "KOSDAQ" ? "코스닥" : d.market === "KOSPI" ? "코스피" : null;

  return (
    // 뿌리의 hz-tx 가 이번 리디자인을 켠다(globals.css).
    <div className="hz-tx">
      {/* 셸이 이 주소의 이름을 모른다(위 머리말). 구조화 데이터도 여기서 낸다. */}
      {/* ⚠️ 이름은 **화면에 보이는 것 그대로**여야 한다(JsonLd 머리말). h1 이 "삼성전자"
          이므로 여기도 그것이다. `<title>` 의 긴 꼴을 넣으면 검색 결과의 이동 경로가
          `hatzze.fun › 국장 카더라 › 삼성전자(005930) 상세 정보` 가 되어, 화면에
          없는 이름을 구글에만 말하는 셈이 된다. */}
      <PageJsonLd
        title={d.name}
        description={`${withSubjectParticle(d.name)} 주식 텔레그램에서 얼마나 회자되는지 봅니다.`}
        path={stockHref(d.code)}
        trail={[PARENT]}
      />

      <Intro d={d} marketLabel={marketLabel} why={why} whyRate={whyRate} />

      {/* ── 히어로 ──────────────────────────────────────────────────
          두 칸. **얼마나 회자됐나(1/3) · 일별 추이(2/3).** 종목 정체와 종가는 머리(Intro)로 올라갔다 —
          예전엔 첫 칸이 그 자리였고, 머리 줄은 도구만 있는 빈 띠였다(2026-09-30). */}
      <section className="hz-sheet">
        <div className="hz-kd-hero hz-shero">
          <div className="hz-kd-hero-q">
            <div className="hz-kd-hero-title">
              <span className="hz-shero-t">최근 {STOCK_STAT_DAYS}일</span>
            </div>
            {/* ⛔ 못 읽은 날에 **0 을 찍지 않는다.** 옆 칸은 "못 불러왔다"고 말하는데 이 칸만
                "0회 언급 · 언급된 날 0일" 이면 한 화면이 서로 다른 두 말을 하고, 그중 하나는
                거짓이다. 고장은 고장이라고 적는다. */}
            {d.loadFailed ? (
              <p className="hz-shero-note">집계를 지금 불러오지 못했습니다.</p>
            ) : (
              <>
                <span className="hz-shero-big">
                  <strong>{d.totalMentions.toLocaleString("ko-KR")}</strong>
                  <span>회 언급</span>
                </span>
                <div className="hz-sstats">
                  <Stat label="언급된 날" value={`${d.activeDays}일`} />
                  {/* 막대(최근 30일) 밖의 날짜면 그렇다고 적는다 — 옆 그림에서 그날을 찾다가 못 찾는다. */}
                  {d.peak && (
                    <Stat
                      label="가장 많던 날"
                      value={`${d.peak.mentions.toLocaleString("ko-KR")}회`}
                      sub={`${fmtKoDate(d.peak.date)}${d.peak.date < d.trend[0].date ? " (그래프 밖)" : ""}`}
                    />
                  )}
                  {/* ⛔ '기간 채널 수'가 아니다. 날이 다르면 채널 명단도 달라서 일별 값으로는
                      합집합을 못 만든다(lib/stock-page.ts 머리말 ②). 라벨이 **하루**라고
                      말하고 있어야 이 값이 정확해진다. */}
                  {d.peakChannels && (
                    <Stat
                      label="하루 최다 채널"
                      value={`${d.peakChannels.channels}곳`}
                      sub={`${fmtKoDate(d.peakChannels.date)}${d.peakChannels.date < d.trend[0].date ? " (그래프 밖)" : ""}`}
                    />
                  )}
                </div>
              </>
            )}
          </div>

          <div className="hz-kd-hero-h">
            <div className="hz-kd-hero-title hz-shero-head">
              <span className="hz-shero-t">
                일별 언급 추이 <span>{STOCK_TREND_DAYS}일</span>
              </span>
              {!d.loadFailed && d.totalMentions > 0 && (
                <span className="hz-shero-legend">
                  <i className="is-recent" />
                  최근 {KADERA_WINDOW_DAYS}일 {d.recentMentions.toLocaleString("ko-KR")}회
                  <i />
                  그 전
                </span>
              )}
            </div>
            {d.loadFailed ? (
              /* ⛔ "잡힌 적이 없습니다" 로 적으면 안 된다. 못 읽은 것과 없는 것은 다르고,
                 그 둘이 화면에서 같아지면 고장이 자료로 위장된다. */
              <p className="hz-shero-note">언급 자료를 지금 불러오지 못했습니다. 잠시 뒤 다시 열어 보십시오.</p>
            ) : d.totalMentions === 0 && !d.today?.mentions ? (
              <p className="hz-shero-note">
                {withTopicParticle(d.name)} 최근 {STOCK_STAT_DAYS}일 사이 주식 텔레그램에서 잡힌 적이 없습니다.
              </p>
            ) : (
              <>
                {/* ⚠️ 기간은 양끝을 다 적는다 — "8월 2일부터 30일" 은 끝날짜로 읽혔다. 막대가 어디서 끝나는지와 오늘분이
                    아직 집계 중이라는 것을 함께 말한다(기준일은 합계에 안 들어간다). */}
                <span className="hz-shero-cap">
                  {fmtKoDate(d.trend[0].date)} ~ {fmtKoDate(d.trend[d.trend.length - 1].date)}
                  {d.today ? " · 오늘분 집계 중" : ""}
                </span>
                <Trend points={d.trend} today={d.today} />
              </>
            )}
          </div>
        </div>
      </section>

      {/* ── 왜 움직였나(LLM) ────────────────────────────────────────
          그날 채널이 말한 까닭 한 줄(카더라 '급등 종목'과 같은 표. 이쪽은 **내린 날도 보여준다**).
          3일 안의 것만 보여준다 —
          지난주 까닭을 오늘 시세 옆에 두면 다른 날 이야기가 된다. 없는 게 정상이라 없으면 안 그린다. */}
      {why && (
        // 머리의 한 줄 미리보기가 여기로 온다(#why). 폰 탑바(54)에 안 가리게 scroll-margin 은 tx.css 가 준다.
        <section className="hz-sheet hz-sanchor" id="why">
          <SectionHead
            /* ⚠️ trending_up 이었다. 카더라 '급등 종목' 카드에서 옮겨 온 값인데, 이 표는
               **내린 날도 보여준다**(바로 위 주석). 아래 등락률이 ▼ 로 찍히는 날 아이콘만
               혼자 올라가 있었다. 위아래 화살표는 방향을 말하지 않는다. */
            icon="swap_vert"
            title="왜 움직였나"
            note={fmtKoDate(why.date)}
            desc="그날 커뮤니티가 말한 이유입니다. 확인된 사실이 아니라 오간 이야기입니다."
            level={2}
          />
          <div style={{ padding: "16px 22px 20px" }}>
            <div style={{ fontSize: "var(--fs-13)", lineHeight: 1.7, display: "flex", gap: 9, background: C.soft, borderRadius: R.control, padding: "12px 13px" }}>
              <AiMark size={15} style={{ flexShrink: 0 }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                <p
                  style={{
                    margin: 0,
                    color: why.reason ? C.inkSoft : C.sub2,
                    textWrap: "pretty",
                    wordBreak: "keep-all",
                  }}
                >
                  {why.reason ?? "커뮤니티에서 이유를 말한 곳이 없습니다."}
                </p>
                {/* lineHeight 1.5: 상자가 ✨ 줄 맞춤 때문에 문장의 1.7 을 들고 있어 이 줄까지 물려받는다. */}
                <span style={{ fontSize: "var(--fs-11-5)", lineHeight: 1.5, color: C.sub2 }}>
                  {whyRate != null && (
                    <>
                      <span
                        style={{
                          fontFamily: MONO,
                          fontWeight: 700,
                          color: whyRate > 0 ? "var(--c-hot-ink)" : whyRate < 0 ? "var(--c-cold-ink)" : C.sub2,
                        }}
                      >
                        {whyRate > 0 ? "▲" : whyRate < 0 ? "▼" : ""}
                        {Math.abs(whyRate).toFixed(2)}%
                      </span>
                      {" · "}
                    </>
                  )}
                  커뮤니티 {why.channelCount}곳이 말했습니다
                </span>
              </div>
            </div>
          </div>
        </section>
      )}
      {/* ── 다가오는 일정 ──────────────────────────────────────────
          채널 글에서 뽑은 앞날의 일정. 카더라 카드와 달리 **달·분기·연 단위도** 보여준다 —
          이 화면은 한 종목의 자리라 "10월 중"·"2027년"이 글로 서면 된다(eventDateLabel). */}
      {events.length > 0 && (
        <section className="hz-sheet">
          <SectionHead
            icon="calendar_month"
            title="다가오는 일정"
            note={`앞으로 ${events.length}건`}
            desc="커뮤니티가 짚은 날입니다. 같은 일정을 두고 날짜가 갈리기도 합니다."
            level={2}
          />
          {/* 한 건 한 줄 타임라인(2026-09-30). 예전엔 날짜가 머리, 그 아래 일이 한 줄씩이라 건마다 두 줄에 오른쪽이 비었다.
              이 화면은 한 종목의 자리라 줄에 이름이 없고, 달·분기·해만 짚인 일정도 날짜 칸에 글로 선다("10월 중"). */}
          <ol className="hz-stl">
            {events.map((e) => (
              <li key={`${e.date}-${e.precision}-${e.event}`} className="hz-stl-row">
                <span className="hz-stl-dot" aria-hidden="true" />
                <span className="hz-stl-date">{eventDateLabel(e)}</span>
                <span className="hz-stl-dd">{e.precision === "day" ? daysFromToday(e.date) : ""}</span>
                <span className="hz-stl-ev">{e.event}</span>
                {e.channels >= 2 ? <Pill tone="blue">{e.channels}곳이 언급</Pill> : <span className="hz-stl-one">1곳</span>}
              </li>
            ))}
          </ol>
        </section>
      )}
      {/* ── 회자된 까닭(LLM) ────────────────────────────────────────
          파이프라인이 기준일에 상위 몇 종목만 써 둔다. 없는 게 정상이라 없으면 안 그린다.
          ⛔ 없는 자리를 그럴듯한 문장으로 메우지 말 것. */}
      {d.narrative && (
        <section className="hz-sheet">
          {/* ⚠️ icon 을 auto_awesome 으로 되돌리지 말 것. 바로 아래 본문의 ✨(AiMark)가 같은
              글리프라 머리와 본문에 같은 그림이 두 번 섰고, 무엇보다 ✨ 는 "생성형 AI가 썼다"는
              **고지 표시**다(app/ui.tsx AiMark 머리말). 장식으로 같이 쓰면 그 뜻이 흐려진다.
              확성기는 카더라의 '트렌딩 메시지'와 같은 뜻으로 쓴다 — 채널에서 떠들썩했던 것. */}
          <SectionHead icon="campaign" title="무엇이 화제였나" note="최근 3일" level={2} />
          {/* ⚠️ 고지 문구를 **글자로 깔지 않는다.** ✨ 하나가 고지를 품는 것이 이 저장소의
              방식이다(app/ui.tsx AiMark 머리말: 문장마다 한 줄씩 깔면 정작 읽어야 할
              요약보다 고지가 길어진다). 누르거나 마우스를 올리면 문구가 뜨고, 같은
              문장이 aria-label 에도 들어간다.
              틀은 카더라의 종목 서술과 같다(app/kadera/page.tsx). 같은 성격의 글이
              화면마다 다른 꼴로 서면 독자가 매번 무엇인지 다시 읽어야 한다. */}
          {/* 위 16 은 머리 헤어라인과 첫 내용 사이의 숨이다 — 다른 시트(.hz-tx .hz-panelgrid)와
              같은 값이라 화면을 오갈 때 같은 자리에서 같은 간격을 만난다. */}
          <div style={{ padding: "16px 22px 20px" }}>
            <div
              style={{ fontSize: "var(--fs-13)", lineHeight: 1.7, display: "flex", gap: 9, background: C.soft, borderRadius: R.control, padding: "12px 13px" }}
            >
              <AiMark size={15} style={{ flexShrink: 0 }} />
              <p
                style={{
                  margin: 0,
                  color: C.inkSoft,
                  textWrap: "pretty",
                  wordBreak: "keep-all",
                }}
              >
                {d.narrative}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* ── 함께 보는 종목 ──────────────────────────────────────────
          ⭐ 화면 464장이 서로 안 이어져 있으면 크롤러가 못 닿는다. 사전이 이미 종목을
          테마로 묶어 두고 있으니 새 자료 없이 이웃을 이어 준다(lib/stock-page.ts).
          ⚠️ 손으로 고른 대표 바스켓이라 "이 테마의 전부"라고 말하지 않는다. */}
      {peers.length > 0 && (
        <section className="hz-sheet">
          <SectionHead
            icon="hub"
            title="같은 테마 종목"
            note={d.themes[0]}
            desc="테마를 이루는 대표 종목입니다. 업종 전체가 아니라 손으로 고른 목록입니다."
            level={2}
          />
          <div style={{ padding: "16px 22px 20px", display: "flex", flexWrap: "wrap", gap: 8 }}>
            {peers.map((p) => (
              <Link
                key={p.code}
                href={stockHref(p.code)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 11px",
                  borderRadius: R.pill,
                  background: C.chip,
                  fontSize: "var(--fs-12)",
                  fontWeight: 600,
                  color: C.label,
                  textDecoration: "none",
                  whiteSpace: "nowrap",
                }}
              >
                {p.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── 배당 ─────────────────────────────────────────────────────
          이 종목을 1주 들면 1년에 얼마, 어느 달에 받나. 배당으로 살기와 같은 표를 읽어 서버가 그린다.
          "삼성전자 배당" 같은 검색이 이 화면에 닿게 하는 자리이고, 주수를 넣는 셈은 저쪽으로 잇는다.
          자리는 같은 테마 종목 아래(2026-09-15 지시) — 카더라(왜·화제·일정·테마)가 먼저, 배당은 그다음. */}
      {dividend && <DividendCard s={dividend} />}

      <NextLinks d={d} />

      {/* 자료가 어디까지 찬 날인지. 카드마다 날짜를 적는 대신 바닥에 한 줄로 둔다. 기준일은 합계에 안 들어간다(막대 끝 빗금 칸). */}
      <p style={{ margin: 0, fontSize: "var(--fs-11)", color: C.muted, textAlign: "right" }}>
        집계 기준일 {fmtKoDate(d.baseDate)}(그날분은 집계 중). 언급은 주식 텔레그램 채널에서 셉니다.
      </p>
    </div>
  );
}
