import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { withSubjectParticle, withTopicParticle } from "@/lib/format";
import {
  STOCK_STAT_DAYS,
  fmtKoDate,
  getStockPage,
  stockHref,
  stockMddHref,
  themePeerStocks,
  type StockPageData,
  type StockTrendPoint,
} from "@/lib/stock-page";

import { PageJsonLd } from "../../JsonLd";
import { SectionHead } from "../../kadera/SectionHead";
import { StockLogo } from "../../StockLogo";
import { pageMetadata } from "../../seo";
import { AiMark, C, Icon, MONO, R } from "../../ui";

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
 * ## ⚠️ 셀 화면이 467장이다
 *
 * 조회를 하나 잘못 고르면 그 대가가 467배다. 야후를 부르지 않고, 채널 합집합을 즉석에서
 * 세지 않는다 — 까닭은 lib/stock-page.ts 머리말에 적혀 있다.
 *
 * ## ⛔ 자기 제목을 자기가 그린다
 *
 * 셸(AppShell)의 본문 헤더는 NAV·DEEP_PAGES 에서 제목을 찾는데, `/stock/…` 은 어느
 * 쪽에도 없어 **제목 칸을 통째로 비운다**(그게 의도다. 종목 이름을 셸이 알 방법이
 * 없다 — 셸은 클라이언트 컴포넌트라 DB 를 못 읽는다). 그래서 h1 과 구조화 데이터를
 * 이 파일이 직접 낸다. 다른 화면처럼 셸에 맡기면 467장이 전부 같은 h1 을 갖는다.
 */
export const dynamic = "force-dynamic";

/** 이동 경로의 부모. 사이드바 NAV 의 라벨과 **같은 문자열**이어야 한다(JsonLd 머리말). */
const PARENT = { name: "국장 카더라", path: "/kadera" };

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const d = await getStockPage(code);
  if (!d) return pageMetadata({ title: "종목 언급 추이 | hatzze", description: "", path: "/kadera" });

  const meta = await pageMetadata({
    title: `${d.name}(${d.code}) 텔레그램 언급 | hatzze`,
    description: `${withSubjectParticle(d.name)} 주식 텔레그램에서 얼마나 회자되는지 봅니다. 최근 ${STOCK_STAT_DAYS}일 언급 ${d.totalMentions.toLocaleString("ko-KR")}회, 언급된 날 ${d.activeDays}일. 일별 추이와 가장 많이 언급된 날을 함께 봅니다.`,
    path: stockHref(d.code),
  });
  // ⛔ 얇은 화면은 색인하지 않는다. 사이트맵에 싣는 문턱(STOCK_INDEX_MIN_DAYS)과
  //    **같은 규칙**이어야 한다 — 사이트맵엔 없는데 색인은 열려 있으면 두 신호가 어긋난다.
  //    follow 는 남긴다. 아래 '함께 보는 종목' 링크는 계속 타고 가도 되는 길이다.
  return d.indexable ? meta : { ...meta, robots: { index: false, follow: true } };
}

/**
 * 언급 추이 막대. **SVG 도 라이브러리도 안 쓴다** — 30개짜리 막대는 div 로 충분하고,
 * 서버 컴포넌트로 남길 수 있어 클라이언트 번들이 안 는다(내부자 종목 상세와 같은 꼴).
 *
 * ⚠️ 빈 날을 0 으로 메워 받는다. 안 메우면 언급 없는 날을 건너뛰어 막대 간격이 날짜와
 *    어긋나고, 추이가 실제보다 촘촘해 보인다.
 */
function Trend({ points }: { points: StockTrendPoint[] }) {
  const max = Math.max(1, ...points.map((p) => p.mentions));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 96, padding: "4px 0 0" }}>
      {points.map((p, i) => {
        // ⚠️⚠️ 손닿는 자리는 **막대가 아니라 칸 전체**다. 막대 높이로 호버를 받으면 언급이
        //    적은 날은 높이가 3%(3px)뿐이라 사실상 못 짚는다.
        const at = i / Math.max(1, points.length - 1);
        const edge = at > 0.72 ? " hz-tip-end" : at < 0.28 ? " hz-tip-start" : "";
        return (
          <span
            key={p.date}
            className={`hz-tip hz-vline${edge}`}
            data-tip={`${fmtKoDate(p.date)} · 언급 ${p.mentions}회 · 채널 ${p.channels}곳`}
            style={{
              position: "relative",
              flex: 1,
              minWidth: 0,
              height: "100%",
              display: "flex",
              alignItems: "flex-end",
            }}
          >
            <span
              style={{
                width: "100%",
                // 0 인 날도 1px 은 남긴다. 아예 없으면 "자료가 없는 날"과 구별이 안 된다.
                height: `${Math.max(p.mentions ? 3 : 1, (p.mentions / max) * 100)}%`,
                borderRadius: 2,
                background: p.mentions ? C.blue : C.track,
              }}
            />
          </span>
        );
      })}
    </div>
  );
}

/** 히어로 둘째 칸의 한 줄. 이름은 왼쪽, 값은 오른쪽 끝에 맞춘다. */
function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: C.sub, whiteSpace: "nowrap" }}>{label}</span>
      <span style={{ textAlign: "right", minWidth: 0 }}>
        <strong style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.ink }}>{value}</strong>
        {sub && <span style={{ fontSize: 11, color: C.muted, marginLeft: 5 }}>{sub}</span>}
      </span>
    </div>
  );
}

/**
 * 종가와 등락률. **야후가 아니라 `stocks` 표(KRX)에서 온 값**이다(머리말 참고).
 *
 * ⚠️ 오르내림 색은 이 저장소의 온도색 두 가지를 그대로 쓴다(--c-hot-ink · --c-cold-ink).
 *    빨강·초록을 새로 들이면 이 화면만 다른 색 체계를 갖게 된다. 화살표를 같이 두는
 *    것도 규칙이다 — 색만으로 방향을 말하면 색을 못 가르는 눈에는 아무 말도 아니다.
 *    (app/insider/parts.tsx 의 Quote 와 같은 꼴이다. 저쪽은 달러라 그대로 못 쓴다.)
 */
function Quote({ d }: { d: StockPageData }) {
  if (d.price == null) return null;
  const chg = d.changeRate;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ display: "inline-flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
        <strong style={{ fontFamily: MONO, fontSize: 20, fontWeight: 800, color: C.ink, letterSpacing: "-.02em" }}>
          {d.price.toLocaleString("ko-KR")}
        </strong>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.sub }}>원</span>
        {chg != null && (
          <span
            style={{
              fontFamily: MONO,
              fontSize: 13,
              fontWeight: 700,
              whiteSpace: "nowrap",
              color: chg > 0 ? "var(--c-hot-ink)" : chg < 0 ? "var(--c-cold-ink)" : C.sub2,
            }}
          >
            {chg > 0 ? "▲" : chg < 0 ? "▼" : ""}
            {Math.abs(chg).toFixed(2)}%
          </span>
        )}
      </span>
      {d.priceDate && <span style={{ fontSize: 11, color: C.muted }}>{fmtKoDate(d.priceDate)} 종가</span>}
    </div>
  );
}

export default async function StockPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const d = await getStockPage(code);
  if (!d) notFound();

  const peers = await themePeerStocks(d.code, d.themes);
  const marketLabel = d.market === "KOSDAQ" ? "코스닥" : d.market === "KOSPI" ? "코스피" : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* 셸이 이 주소의 이름을 모른다(위 머리말). 구조화 데이터도 여기서 낸다. */}
      {/* ⚠️ 이름은 **화면에 보이는 것 그대로**여야 한다(JsonLd 머리말). h1 이 "삼성전자"
          이므로 여기도 그것이다. `<title>` 의 긴 꼴을 넣으면 검색 결과의 이동 경로가
          `hatzze.fun › 국장 카더라 › 삼성전자(005930) 텔레그램 언급` 이 되어, 화면에
          없는 이름을 구글에만 말하는 셈이 된다. */}
      <PageJsonLd
        title={d.name}
        description={`${withSubjectParticle(d.name)} 주식 텔레그램에서 얼마나 회자되는지 봅니다.`}
        path={stockHref(d.code)}
        trail={[PARENT]}
      />

      <Link
        href={PARENT.path}
        style={{
          alignSelf: "flex-start",
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          fontSize: 12,
          fontWeight: 700,
          color: C.sub,
          textDecoration: "none",
        }}
      >
        <Icon name="chevron_left" style={{ fontSize: 16 }} />
        {PARENT.name}
      </Link>

      {/* ── 히어로 ──────────────────────────────────────────────────
          세 칸. **종목 정체 · 얼마나 회자됐나 · 일별 추이.**
          가운데 칸이 이 화면의 주인공이다. 시세는 곁다리라 첫 칸 아래에 작게 둔다. */}
      <section className="hz-sheet">
        <div className="hz-kd-hero">
          <div className="hz-kd-hero-q">
            <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
              <StockLogo code={d.code} name={d.name} market={d.market} size={40} />
              <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                {/* 이 화면의 h1. 셸의 헤더가 비어 있으므로 여기가 유일한 h1이다. */}
                <h1
                  style={{
                    margin: 0,
                    fontSize: 20,
                    fontWeight: 800,
                    color: C.ink,
                    letterSpacing: "-.02em",
                    wordBreak: "keep-all",
                  }}
                >
                  {d.name}
                </h1>
                <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, color: C.sub }}>
                  {d.code}
                  {marketLabel && <span style={{ fontFamily: "inherit", marginLeft: 6 }}>{marketLabel}</span>}
                </span>
              </span>
            </div>
            <Quote d={d} />
          </div>

          <div className="hz-kd-hero-q">
            <div className="hz-kd-hero-title">
              <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: "-.01em", color: C.ink }}>
                최근 {STOCK_STAT_DAYS}일
              </span>
            </div>
            <span style={{ display: "inline-flex", alignItems: "baseline", gap: 6 }}>
              <strong
                style={{ fontFamily: MONO, fontSize: 24, fontWeight: 800, color: C.ink, letterSpacing: "-.02em" }}
              >
                {d.totalMentions.toLocaleString("ko-KR")}
              </strong>
              <span style={{ fontFamily: MONO, fontSize: 22, fontWeight: 600, color: C.sub }}>회</span>
              <span style={{ fontSize: 17, fontWeight: 600, color: C.sub }}>언급</span>
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <Stat label="언급된 날" value={`${d.activeDays}일`} />
              {d.peak && (
                <Stat label="가장 많던 날" value={`${d.peak.mentions.toLocaleString("ko-KR")}회`} sub={fmtKoDate(d.peak.date)} />
              )}
              {/* ⛔ '기간 채널 수'가 아니다. 날이 다르면 채널 명단도 달라서 일별 값으로는
                  합집합을 못 만든다(lib/stock-page.ts 머리말 ②). 라벨이 **하루**라고
                  말하고 있어야 이 값이 정확해진다. */}
              {d.peakChannels && (
                <Stat
                  label="하루 최다 채널"
                  value={`${d.peakChannels.channels}곳`}
                  sub={fmtKoDate(d.peakChannels.date)}
                />
              )}
            </div>
          </div>

          <div className="hz-kd-hero-h">
            <div className="hz-kd-hero-title">
              <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: "-.01em", color: C.ink }}>
                일별 언급 추이
              </span>
            </div>
            {d.totalMentions === 0 ? (
              <p style={{ margin: 0, fontSize: 12, fontWeight: 500, color: C.sub, lineHeight: 1.7 }}>
                {withTopicParticle(d.name)} 최근 {STOCK_STAT_DAYS}일 사이 주식 텔레그램에서 잡힌 적이 없습니다.
              </p>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                  <span style={{ fontSize: 12, color: C.sub }}>
                    최근 사흘 {d.recentMentions.toLocaleString("ko-KR")}회
                  </span>
                  {/* ⚠️ "8월 2일부터 30일" 로 적었더니 끝날짜("8월 30일")로 읽혔다.
                      기간은 양끝을 다 적어야 한 가지로만 읽힌다. */}
                  <span style={{ fontSize: 11, color: C.muted, whiteSpace: "nowrap" }}>
                    {fmtKoDate(d.trend[0].date)} ~ {fmtKoDate(d.trend[d.trend.length - 1].date)}
                  </span>
                </div>
                <Trend points={d.trend} />
              </>
            )}
          </div>
        </div>
      </section>

      {/* ── 회자된 까닭(LLM) ────────────────────────────────────────
          파이프라인이 기준일에 상위 몇 종목만 써 둔다. 없는 게 정상이라 없으면 안 그린다.
          ⛔ 없는 자리를 그럴듯한 문장으로 메우지 말 것. */}
      {d.narrative && (
        <section className="hz-sheet">
          <SectionHead icon="auto_awesome" title="무엇이 화제였습니까" note="최근 사흘" level={2} />
          {/* ⚠️ 고지 문구를 **글자로 깔지 않는다.** ✨ 하나가 고지를 품는 것이 이 저장소의
              방식이다(app/ui.tsx AiMark 머리말: 문장마다 한 줄씩 깔면 정작 읽어야 할
              요약보다 고지가 길어진다). 누르거나 마우스를 올리면 문구가 뜨고, 같은
              문장이 aria-label 에도 들어간다.
              틀은 카더라의 종목 서술과 같다(app/kadera/page.tsx). 같은 성격의 글이
              화면마다 다른 꼴로 서면 독자가 매번 무엇인지 다시 읽어야 한다. */}
          <div style={{ padding: "0 22px 20px" }}>
            <div
              style={{ display: "flex", gap: 9, background: C.soft, borderRadius: R.control, padding: "12px 13px" }}
            >
              <AiMark size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  lineHeight: 1.7,
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
          ⭐ 화면 467장이 서로 안 이어져 있으면 크롤러가 못 닿는다. 사전이 이미 종목을
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
          <div style={{ padding: "0 22px 20px", display: "flex", flexWrap: "wrap", gap: 8 }}>
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
                  fontSize: 12,
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

      {/* ── 낙폭으로 이어 주기 ──────────────────────────────────────
          이 화면은 '얼마나 회자되나'만 답한다. '고점에서 얼마나 내려왔나'는 MDD가 답하는데
          그건 브라우저에서 계산하는 도구라 여기 얹지 않는다. 링크로 잇는다. */}
      <section className="hz-sheet">
        <Link
          href={stockMddHref(d.code, d.market)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "18px 22px",
            textDecoration: "none",
          }}
        >
          <span style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: C.ink, letterSpacing: "-.01em" }}>
              MDD 정밀분석에서 보기
            </span>
            <span style={{ fontSize: 12, color: C.sub, wordBreak: "keep-all" }}>
              {withTopicParticle(d.name)} 고점에서 얼마나 내려와 있는지, 이만큼 빠졌던 적이 과거에 몇 번이었는지 봅니다.
            </span>
          </span>
          <Icon name="arrow_forward" style={{ fontSize: 20, color: C.sub, flexShrink: 0 }} />
        </Link>
      </section>

      {/* 자료가 어디까지 찬 날인지. 카드마다 날짜를 적는 대신 바닥에 한 줄로 둔다. */}
      <p style={{ margin: 0, fontSize: 11, color: C.muted, textAlign: "right" }}>
        집계 기준일 {fmtKoDate(d.baseDate)}. 언급은 주식 텔레그램 채널에서 셉니다.
      </p>
    </div>
  );
}
