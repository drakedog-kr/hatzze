import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { withObjectParticle } from "@/lib/format";
import { getStockDetail, type StockCongress, type StockInsider } from "@/lib/insider-detail";
import { PRICE_RANGES, type PriceRangeKey, stockDetailHref } from "@/lib/insider-range";
import { assertLoaded } from "@/lib/load-state";

import { SectionHead } from "../../../kadera/SectionHead";
import { CoverMeta, Module } from "../../../kadera/V2Modules";
import { CurrencyToggle } from "../../../AppShell";
import { ChartZoom } from "../../ChartZoom";
import { StockLogo } from "../../../StockLogo";
import { PageJsonLd } from "../../../JsonLd";
import { INSIDER_CARD } from "../../../og-copy";
import { pageMetadata } from "../../../seo";
import { LoadFailedNote } from "../../../LoadFailedNote";
import { ExpandableList } from "../../../kadera/ExpandableList";
import {
  CODE_LABEL,
  AnalystActions,
  ChartLegend,
  ConsensusBody,
  Empty,
  MarkBadges,
  EmptyCard,
  HalfRow,
  MarkRadios,
  Money,
  PriceChart,
  WIDE_COLS,
  WideHead,
  fmtDate,
  wideStockHolderRows,
} from "../../parts";
import { BackTrail } from "@/components/back-trail";

/**
 * 종목 하나의 상세 — 본문과 메타데이터. 주소 둘이 같이 쓴다.
 *
 *   /insider/stock/NVDA       기본 기간(page.tsx)
 *   /insider/stock/NVDA/1y    다른 기간([range]/page.tsx) — canonical 은 기본 주소다
 *
 * 기간을 쿼리(`?p=`)에서 경로로 옮긴 까닭은 lib/insider-range.ts 머리말에 있다(사본 ISR).
 *
 * ## ⭐ 첫 화면을 **카더라 언급 추이**로 연다
 *
 * FolioObs 의 종목 페이지는 시세·컨센서스·어닝콜·뉴스로 시작한다. 그건 이미 어디에나
 * 있고 우리한테는 원천도 없다. 우리한테만 있는 건 **한국 채팅방에서 이 종목이 얼마나
 * 회자되는가**다(실측 40일 시계열). 그걸 먼저 보여주고, 그다음에 공시 셋을 붙인다.
 *
 * ## ⚠️ 없는 것은 안 그린다
 *
 * 섹터·시가총액·직원수는 원천이 없다. "-" 로 자리를 채우거나 그럴듯한 문장을 만들지 말 것.
 * (애널리스트 컨센서스는 2026-08-22 에 원천을 찾아 붙였다 — stockanalysis.com.)
 */
const SHEET_PAIR_MIN = "min(460px, 100%)";
/**
 * 처음 펴는 줄 수와 '더 보기' 한 번의 증가분, 그리고 실어 보내는 상한.
 *
 * ⚠️ 상세는 목록이 길다(코어위브 임원 신고 2,021건). 처음부터 다 펴면 **화면이 자료에
 * 파묻혀** 무엇이 중요한지 안 보인다. 눌러서 늘린다.
 * ⚠️ 안 보이는 줄도 클라이언트로 전송되므로 상한이 따로 필요하다.
 *
 * ⭐ 여는 줄 수가 **카드 폭에 따라 다르다.** 거물 카드는 전폭에 여섯 칸짜리 표라 열 줄이
 * 한눈에 들어오지만, 임원·의원 넷은 반쪽 폭(572px)이라 같은 열 줄이면 화면이 길어지기만
 * 한다. 나란히 선 카드 둘의 높이도 다섯 줄일 때 더 잘 맞는다.
 */
const ROWS_OPEN = 5;
const ROWS_OPEN_WIDE = 10;
const ROWS_STEP = 10;
const ROWS_MAX = 60;

/** 시트의 줄 목록 + 바닥의 '더 보기'. 다섯 시트가 같은 꼴을 쓴다. */
function Rows({ items, name, open = ROWS_OPEN }: { items: React.ReactNode[]; name: string; open?: number }) {
  return (
    <ExpandableList
      items={items}
      name={name}
      initial={open}
      step={ROWS_STEP}
      listStyle={{ padding: 0, display: "block" }}
      footerClassName="hz-sheet-foot-row"
      footerStyle={{ marginTop: "auto" }}
    />
  );
}

function Pair({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>{children}</div>;
}

function HalfSheet({ children }: { children: React.ReactNode }) {
  return (
    <section
      className="hz-sheet"
      style={{ flex: "1 1 calc(50% - 8px)", minWidth: SHEET_PAIR_MIN, display: "flex", flexDirection: "column" }}
    >
      {children}
    </section>
  );
}

/** 이동 경로의 부모. 화면 맨 위 줄(BackTrail)과 구조화 데이터가 **같은 문자열**을 쓴다(JsonLd 머리말). */
const PARENT = { name: "내부자 리포트", path: "/insider" };

/**
 * 없는 종목의 메타데이터.
 *
 * ⛔ canonical 을 주지 않는다. 예전엔 `/insider` 를 가리켰는데, 그건 "이 404 주소는 내부자 리포트와
 *    같은 화면입니다"라고 말하는 것이다 — 국장 종목 화면이 먼저 고친 실수다(app/stock/[code]/page.tsx).
 * ⚠️ 그냥 빼면 루트가 선언한 canonical `/` 를 물려받는다(app/seo.ts 주석) — "이 404 는 홈과 같은 화면"이
 *    된다. `null` 로 **지워야** 태그가 안 나간다(프로덕션 빌드로 확인, 2026-09-30).
 */
export const STOCK_NOT_FOUND_META: Metadata = {
  title: "종목을 찾을 수 없습니다 | hatzze",
  robots: { index: false, follow: false },
  alternates: { canonical: null },
};

export async function stockDetailMetadata(ticker: string, range: PriceRangeKey): Promise<Metadata> {
  // 본문과 **같은 인자**로 부른다 — 한 캐시 칸을 같이 쓴다(getStockDetail 주석).
  const d = await getStockDetail(ticker, range);
  if (!d) return STOCK_NOT_FOUND_META;
  const meta = await pageMetadata({
    title: `${d.name || d.ticker}(${d.ticker}) 내부자 공시 | hatzze`,
    description: `${withObjectParticle(d.name || d.ticker)} 월가 거물 ${d.holders.length}명이 보유하고, 미 하원의원 ${
      new Set(d.congress.map((c) => c.member)).size
    }명이 신고했습니다. 주식 텔레그램 언급 추이와 함께 봅니다.`,
    // 기간 주소도 기본 주소를 가리킨다 — 같은 화면의 차트 창만 다르다.
    path: stockDetailHref(d.ticker),
    // 자기 폴더에 카드가 없어 구역(/insider)의 카드를 쓴다(app/seo.ts 의 imagePath).
    ownImage: INSIDER_CARD.alt,
    imagePath: "/insider",
  });
  // ⛔ 못 읽은 축이 있으면 **아무 말도 하지 않는다.** 사전 조회가 깨지면 사전 종목도 사전 밖으로 보여,
  //    그 사이 크롤러가 오면 멀쩡한 화면에 noindex 를 내주게 된다(국장 종목 화면과 같은 규칙).
  if (d.failedSources.length) return meta;
  // ⛔ 사전 밖 종목(의원 신고로만 들어온 것)은 색인하지 않는다. 사이트맵(app/sitemap-insider.xml)이
  //    사전을 그대로 펼치므로 **같은 잣대**여야 한다. follow 는 남긴다 — 의원 이름 링크는 타고 가도 되는 길이다.
  return d.listed ? meta : { ...meta, robots: { index: false, follow: true } };
}

/**
 * 언급 추이 막대. **SVG 도 라이브러리도 안 쓴다** — 40개짜리 막대는 div 로 충분하고,
 * 서버 컴포넌트로 남길 수 있어 클라이언트 번들이 안 는다.
 *
 * ⚠️ 빈 날을 0 으로 메워 받는다(`fillDays`). 안 메우면 주말을 건너뛰어 막대 간격이
 *    날짜와 어긋나고, 추이가 실제보다 촘촘해 보인다.
 */
function Trend({ points }: { points: { date: string; mentions: number; channels: number }[] }) {
  const max = Math.max(1, ...points.map((p) => p.mentions));
  // v2 — 종목 페이지 · 테마 한 장의 추이와 같은 꼴(.v2-tm-trend). 최근 사흘만 진한 파랑.
  const recentFrom = points.length >= 3 ? points[points.length - 3].date : "";
  return (
    <div className="v2-tm-trend" role="img" aria-label={`최근 ${points.length}일 언급 막대`}>
      {points.map((p, i) => {
        const at = i / Math.max(1, points.length - 1);
        const edge = at > 0.72 ? " hz-tip-end" : at < 0.28 ? " hz-tip-start" : "";
        return (
          <span key={p.date} className={`hz-tip hz-vline${edge}`} data-tip={`${fmtDate(p.date)} · 언급 ${p.mentions}회 · 채널 ${p.channels}곳`}>
            <i className={!p.mentions ? "is-none" : p.date >= recentFrom ? "is-recent" : undefined} style={{ height: `${Math.max(p.mentions ? 3 : 1, (p.mentions / max) * 100)}%` }} />
          </span>
        );
      })}
    </div>
  );
}

/**
 * 임원 신고 한 줄. 산 카드와 내놓은 카드가 **같은 함수**를 쓴다.
 *
 * ⚠️ 값 칸이 금액이 아니라 **주식 수로 내려앉을 때가 있다.** 증여·전환은 원천에 단가가
 *    아예 없다(각각 99%). 거기에 "금액 미상"을 적으면 줄에서 가장 강한 자리가 빈 말이
 *    된다 — 주식 수는 늘 있으니 그걸 대신 세운다. 단위가 섞이는 값이라 색을 한 단
 *    내려 다른 종류의 숫자로 보이게 한다.
 */
function insiderRow(t: StockInsider, i: number, rate: number | null) {
  const shares = t.shares != null ? `${Math.round(t.shares).toLocaleString("ko-KR")}주` : "미상";
  return (
    <li key={`${t.ownerName}-${t.filedDate}-${i}`}>
      <HalfRow
        name={t.ownerName ?? "이름 없음"}
        // 무엇을 · 언제. 코드는 알약이 아니라 글자로 둔다 — 알약은 이름과 색을 다투는데
        // 이 카드는 이미 매수·매도로 갈라져 있어 종류가 범주가 아니라 곁가지다.
        note={`${t.code ? (CODE_LABEL[t.code]?.text ?? t.code) : "종류 미상"} · ${fmtDate(t.filedDate)} 접수`}
        value={t.value != null ? <Money usd={t.value} rate={rate} /> : shares}
        valueMuted={t.value == null}
      />
    </li>
  );
}

/**
 * 의원 신고 한 줄.
 *
 * ⚠️ 금액은 **거의 늘 같은 구간**이다 — 실측 2,404건 중 2,069건(86%)이 $1,001~$15,000
 *    하나다. 그래서 이 줄에서 실제로 갈리는 값은 금액이 아니라 **날짜**다. 매매일과
 *    신고일을 가운데에 두고 금액은 끝에서 받는다.
 *
 * ⚠️⚠️ **지연 일수로 접지 말 것.** "27일 뒤 신고"로 적어 봤는데 더 헷갈렸다 — 읽는
 *    사람이 날짜를 기대하는 자리에 기간이 오면 그게 무슨 날인지를 되짚어야 한다.
 *    지연이 얼마나 되는지는 카드 물음표가 제도로 설명한다(최대 45일). 줄은 날짜를 준다.
 */
function congressRow(c: StockCongress, i: number, rate: number | null) {
  return (
    <li key={`${c.member}-${c.filedDate}-${i}`}>
      <HalfRow
        name={c.member}
        // 화살표는 순서를 말한다 — 가운뎃점으로 두면 두 날짜가 나열로 읽힌다.
        note={`${fmtDate(c.transactionDate)} 매매 → ${fmtDate(c.filedDate)} 신고`}
        value={
          c.amountLow != null && c.amountHigh != null ? (
            <>
              <Money usd={c.amountLow} rate={rate} />~<Money usd={c.amountHigh} rate={rate} />
            </>
          ) : (
            "구간 미상"
          )
        }
        valueMuted={c.amountLow == null}
      />
    </li>
  );
}

/**
 * 본문. 기간은 주소(경로)에서 받는다.
 *
 * ⚠️ 기간을 리액트 상태로 두면 차트가 클라이언트 컴포넌트가 되고 일봉이 통째로 번들을 탄다.
 *    주소에 담으면 서버가 그대로 그리고, 링크로 공유도 되고, 기간마다 사본(ISR)이 된다.
 */
export async function StockDetailBody({ ticker, range }: { ticker: string; range: PriceRangeKey }) {
  const d = await getStockDetail(ticker, range);
  // notFound() 앞에서 던진다 — 조회가 죽어 null 이 온 것을 "없는 종목"으로 읽어 404 를 사본에 담거나,
  // 반쯤 빈 화면을 한 시간짜리 사본으로 남기지 않도록(투자자 상세와 같은 이유 · lib/load-state.ts).
  assertLoaded("/insider/stock/[ticker]");
  if (!d) notFound();

  const members = new Set(d.congress.map((c) => c.member)).size;
  const peak = Math.max(0, ...d.trend.map((p) => p.mentions));

  // ⚠️⚠️ 둘로 가르면 **어느 쪽도 아닌 신고**가 남는다 — 임원은 옵션 행사(M)·무상 취득(A)·
  //      전환(C), 의원은 교환(E). 실측으로 임원 전체의 19% 다. 조용히 빠뜨리면 카드 두
  //      장의 합이 히어로의 "임원 신고 222건"과 안 맞는다. 수를 세어 물음표에 적는다.
  const execBuys = d.insiders.filter((t) => t.code === "P");
  // ⚠️ 코드가 아니라 **방향**으로 가른다. 전환(C)이 취득 306건·처분 43건으로 양쪽에
  //    다 있어서 코드만 보면 틀린다. 장내 매도뿐 아니라 세금 원천징수·증여도 손을
  //    떠난 것이라 함께 담는다 — S 만 넣으면 카드가 실제보다 훨씬 작아 보인다.
  const execSells = d.insiders.filter((t) => t.acquiredDisposed === "D");
  const cgBuys = d.congress.filter((c) => c.kind === "P");
  const cgSells = d.congress.filter((c) => c.kind === "S");

  // 거물의 이번 분기 방향. 비교할 직전 분기가 없는 곳은 move 가 null 이라 안 센다.
  const added = d.holders.filter((h) => h.move === "new" || h.move === "add").length;
  const trimmed = d.holders.filter((h) => h.move === "trim").length;
  const quarterMoves = added + trimmed > 0 ? `이번 분기 늘림 ${added} · 줄임 ${trimmed}곳` : "이번 분기 변화 없음";

  return (
    // ⭐ 내부자 리포트는 **달러가 기본**이다 — 재료가 전부 미국 공시라 달러가 원본이고,
    // 원화는 크기를 가늠하라고 얹은 것이다. 쿠키로 한 번이라도 고르면 그 선택이 이긴다
    // (규칙은 globals.css 의 `[data-cur-default]`).
    <div className="hz-tx v2-kd v2-in" data-cur-default="usd">
      <LoadFailedNote sources={d.failedSources} />
      {/* 셸은 이 화면의 이름을 몰라 구조화 데이터를 안 낸다(AppShell PageHeader 의 named). 여기서 낸다.
          ⛔ 색인하지 않는 사전 밖 종목에는 안 낸다 — noindex 와 구조화 데이터가 어긋난 신호가 된다. */}
      {d.listed && (
        <PageJsonLd
          title={d.name}
          description={`${withObjectParticle(d.name || d.ticker)} 월가 거물 보유·임원 신고·미 하원의원 매매와 주식 텔레그램 언급 추이로 봅니다.`}
          path={stockDetailHref(d.ticker)}
          trail={[PARENT]}
        />
      )}
      <BackTrail parent={{ name: PARENT.name, href: PARENT.path }} current={d.name} />

      {/* ── 첫 줄 띠 · 둘째 줄(v2, 2026-10-03) ─────────────────────────────
          옛 히어로 세 칸(종목 정체 · 공시에 남은 것 · 커뮤니티 관심 추이)을 v2 꼴로 옮겼다 — 종목 정체(티커 · 시세 · 52주 위치 · 기간 수익률)는
          첫 줄 띠 칸들로, 나머지 둘은 둘째 줄 짝으로. 통화 스위치도 머리에서 이 띠로 왔다(v2 화면은 머리를 걷는다 · 폰은 탑바).
          ⭐ 52주 위치와 기간 수익률은 받아 둔 일봉에서 공짜로 나온다(새 원천 없음).
          ⭐ 공시에 남은 것은 세 축의 수만이 아니라 **방향까지** 편다 — "임원 신고 222건"보다 "내놓은 것 135 · 장내에서 산 것 0"이 많은 말을 한다. */}
      <div className="v2-cover">
        <div className="v2-cover-cell v2-sk-id">
          <StockLogo code={d.ticker} name={d.name} market="US" size={20} />
          {/* 검색이 이 화면의 이름으로 읽는 자리라 h1 — 티커와 이름 사이 공백은 읽을 때 "NVDA 엔비디아"로 떼어 준다. */}
          <h1>
            {d.ticker}
            {d.name && d.name.toUpperCase() !== d.ticker.toUpperCase() ? <span className="v2-cover-k"> {d.name}</span> : null}
          </h1>
        </div>
        {d.price != null && (
          <div className="v2-cover-cell">
            <span className="v2-cover-k">현재가</span>
            <span className="v2-cover-v">
              <b>
                <Money usd={d.price} rate={d.usdKrw} />
              </b>
              {d.changeRate != null && (
                <span className={`v2-cover-chg${d.changeRate > 0 ? " is-up" : d.changeRate < 0 ? " is-down" : ""}`}>
                  {d.changeRate > 0 ? "+" : d.changeRate < 0 ? "-" : ""}
                  {Math.abs(d.changeRate).toFixed(2)}%
                </span>
              )}
            </span>
          </div>
        )}
        {/* 52주 위치 — 저점 0 · 고점 100 사이 어디인가. "얼마나 올랐나"가 아니다. */}
        {d.week52 && (
          <div className="v2-cover-cell">
            <span className="v2-cover-k">52주 위치</span>
            <span className="v2-cover-v">
              <b>{Math.round(d.week52.position)}%</b>
              <span className="v2-cover-chg">
                <Money usd={d.week52.low} rate={d.usdKrw} /> ~ <Money usd={d.week52.high} rate={d.usdKrw} />
              </span>
            </span>
          </div>
        )}
        {d.returns.length > 0 && (
          <div className="v2-cover-cell v2-cover-idx">
            <span className="v2-cover-k">수익률</span>
            {d.returns.map((r) => (
              <span key={r.label} className="v2-cover-v">
                <em>{r.label}</em>
                <span className={`v2-cover-chg${r.pct > 0 ? " is-up" : r.pct < 0 ? " is-down" : ""}`}>
                  {r.pct > 0 ? "+" : r.pct < 0 ? "-" : ""}
                  {Math.abs(r.pct).toFixed(1)}%
                </span>
              </span>
            ))}
          </div>
        )}
        {d.usdKrw != null && (
          <div className="v2-cover-cell v2-in-cur">
            <span className="v2-cover-k">통화</span>
            <CurrencyToggle fallback="usd" />
          </div>
        )}
        <CoverMeta updated={d.mentionDate ? `${fmtDate(d.mentionDate)} 언급 기준` : "언급 준비 중"} basis={`월가 거물 ${d.managerCount}명 추적`} />
      </div>

      {/* 둘째 줄 — 공시에 남은 것 | 커뮤니티 관심 추이. 둘 다 안이 늘어난다(줄 · 막대). */}
      <div className="v2-tm-band is-brief">
        <Module title="공시에 남은 것" meta="거물 · 의원 · 임원">
          <dl className="v2-isd-facts">
            {[
              { label: "월가 거물 보유", n: d.holders.length, unit: `/${d.managerCount}명`, sub: quarterMoves },
              { label: "미 하원의원 신고", n: members, unit: "명", sub: `매수 ${cgBuys.length} · 매도 ${cgSells.length}건` },
              { label: "임원 신고", n: d.insiders.length, unit: "건", sub: `내놓은 것 ${execSells.length} · 장내에서 산 것 ${execBuys.length}` },
            ].map((s) => (
              <div key={s.label}>
                <dt>{s.label}</dt>
                <dd>
                  <b className={s.n ? undefined : "is-zero"}>
                    {s.n.toLocaleString("ko-KR")}
                    <span>{s.unit}</span>
                  </b>
                  <em>{s.sub}</em>
                </dd>
              </div>
            ))}
          </dl>
        </Module>
        <Module title="커뮤니티 관심 추이" meta={d.trend.length ? `최근 ${d.trend.length}일` : undefined} className="v2-tm-trendmod">
          {d.trend.length === 0 ? (
            <p className="v2-empty">이 종목은 아직 커뮤니티에서 잡힌 적이 없습니다.</p>
          ) : (
            <div className="v2-tm-trendbody">
              <div className="v2-tm-figs">
                <span>
                  <b>{d.mentionsToday}회</b>
                  <em>{fmtDate(d.mentionDate)} 하루 언급</em>
                </span>
                <span>
                  <b>{d.channelsToday}곳</b>
                  <em>그날 채널</em>
                </span>
                <span>
                  <b>{peak}회</b>
                  <em>최근 {d.trend.length}일 최다</em>
                </span>
              </div>
              <Trend points={d.trend} />
            </div>
          )}
        </Module>
      </div>

      {/* ── 주가와 매매 시점 ─────────────────────────────────────────
          ⭐ 벤치마킹한 쪽은 차트에 13F·의회·임원·ETF 를 다 얹는다. 우리는 **사람이
          자기 판단으로 장내에서 사고판 것만** 찍는다 — 옵션 행사와 세금 원천징수를
          같이 찍으면 차트가 "임원이 계속 팔았다"고 말하는데, 그 대부분이 기계적
          흐름이라 틀린 말이다. 13F 도 안 찍는다(분기말 사진이라 '언제'가 없다). */}
      {d.bars.length > 1 && (
        <section className="hz-sheet">
          <SectionHead
            icon="show_chart"
            title="주가와 매매 시점"
            note={`${PRICE_RANGES.find((r) => r.key === range)?.label} · ${d.marks.length}곳`}
            noteHelp="일봉에 매매 시점 표시"
            /* ⚠️ "마우스를 올리면" 이었다. 폰에는 마우스가 없고 탭으로 여는데(TipTap),
                 그 말이 폰에서는 통째로 거짓이 된다. 둘 다 되는 말로 바꾼다.
               ⚠️ 점에 올리면 **누가** 사고팔았는지 나온다는 걸 아무 데서도 안 알려 주고
                 있었다 — 짚어 보기 전엔 알 길이 없는 기능이라 여기 적는다. */
            desc="채운 점이 매수이고 빈 고리가 매도입니다. 선을 짚으면 날짜와 가격이 나오고 점을 짚으면 누가 사고팔았는지 나옵니다."
          />
          {/* ⚠️ 배지가 형제 SVG 의 마커를 흐린다(`:has()`). 감싸는 상자가 있어야 그 규칙이
              닿는다 — 배지와 차트가 같은 부모 안에 있어야 한다. */}
          {/* ⚠️ 라디오가 차트 상자보다 **앞**에 있어야 한다 — CSS 가 형제 선택자(`~`)로
              마커를 흐린다. `:has()` 는 쓰면 안 된다(MarkRadios 주석 참고). */}
          <div className="hz-mkfilter" style={{ padding: "12px 0 16px" }}>
            <MarkRadios id="hz-mkf" />
            {/* ⚠️ 배지를 SectionHead 의 `right` 에 넣으면 note 알약이 통째로 안 그려진다 —
                물음표 툴팁이 거기 붙어 있어 단서가 같이 사라진다. 차트 바로 위에 둔다. */}
            {/* 왼쪽이 매매자 필터(CSS), 오른쪽이 기간(주소)(2026-09-27 자리 바꿈). 둘 다 서버 컴포넌트로 남는다. */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap",
                padding: "0 22px 12px",
              }}
            >
              <MarkBadges id="hz-mkf" />
              <span className="hz-seg hz-seg-hover hz-periodset">
                {PRICE_RANGES.map((r) => (
                  <Link
                    key={r.key}
                    href={stockDetailHref(d.ticker, r.key)}
                    // ⚠️ 스크롤을 위로 튕기지 않는다 — 차트를 보다 기간만 바꾸는 것이라
                    //    맨 위로 올라가면 방금 보던 자리를 잃는다.
                    scroll={false}
                    // ⚠️ 미리 받지 않는다. 기간 주소도 사본(ISR)이라 기본값이면 보이는 순간 **화면 전체**를
                    //    받는다 — 첫 방문마다 사본이 없는 기간 셋을 서버가 새로 그리게 된다(야후 왕복 포함).
                    //    누르면 받는다. 사본이 있으면 금방이다.
                    prefetch={false}
                    aria-current={r.key === range ? "true" : undefined}
                  >
                    {r.label}
                  </Link>
                ))}
              </span>
            </div>
            <div className="hz-mkfilter-chart">
              {/* 폰에서는 뷰박스 720 이 화면 폭으로 눌려 축 라벨이 안 읽힌다. MDD 언더워터
                  차트와 같은 확대 보기를 씌운다(같은 `.hz-zoom-*` · 같은 버튼 자리).
                  ⚠️ 감싸도 마커 필터는 그대로 먹는다 — 그 규칙이 `.hz-mkfilter-chart` 의
                     **자손**을 고르므로 한 겹 더 들어가도 닿는다. */}
              <ChartZoom label="주가와 매매 시점 차트">
                <PriceChart bars={d.bars} marks={d.marks} rate={d.usdKrw} />
              </ChartZoom>
              <ChartLegend />
            </div>
          </div>
        </section>
      )}

      {/* v2(2026-10-03) — 구간 제목('01 밖에서 보는 눈' · '월가 거물이 든 것' · '임원과 의원의 신고')은 걷었다. 모듈 머리가 이름을 말한다. */}
      {/* ── 월가 애널리스트의 시선 ────────────────────────────────────
          ⭐ 공시 셋(임원·거물·의원)이 "이미 무엇을 했나"라면 이건 **"밖에서는 이 회사를
             어떻게 보나"** 다. 우리 표에 없던 유일한 바깥 시선이라 공시들보다 앞에 둔다.
          ⚠️ 커버리지가 없으면 카드를 아예 안 그린다 — 빈 칸을 "-" 로 채우지 않는다. */}
      {d.consensus && (
        <section className="hz-sheet">
          <SectionHead
            icon="reviews"
            title="월가 애널리스트의 시선"
            note={fmtDate(d.consensus.asOf)}
            noteHelp="S&P Global 집계"
            desc="증권사들이 이 종목을 어떻게 보고 있는지입니다."
          />
          <ConsensusBody c={d.consensus} price={d.price} rate={d.usdKrw}>
            <AnalystActions rows={d.analystActions} rate={d.usdKrw} />
          </ConsensusBody>
        </section>
      )}

      {/* ── 거물 보유 ────────────────────────────────────────────────── */}
      <section className="hz-sheet">
        <SectionHead
          icon="groups"
          title="이 종목을 든 월가 거물"
          note={`${d.holders.length}/${d.managerCount}명`}
          noteHelp="분기말 기준"
          desc="금액이 큰 순입니다. 이름 옆에 직전 분기보다 주식 수를 얼마나 늘리고 줄였는지 적었습니다."
        />
        {d.holders.length === 0 ? (
          <Empty>추적 중인 거물 가운데 이 종목을 든 곳은 없습니다.</Empty>
        ) : (
          <>
            {/* 열 머리 — 칸이 여섯이면 무슨 값인지 말해 줘야 한다. 데이터 행과 **같은
                격자**를 쓴다. */}
            <WideHead cols={WIDE_COLS.stockHolders} labels={["거물", "소속", "포트폴리오 비중", "금액"]} />
            <Rows
              name="stock_holders"
              open={ROWS_OPEN_WIDE}
              items={wideStockHolderRows(d.holders.slice(0, ROWS_MAX), d.usdKrw)}
            />
          </>
        )}
      </section>

      {/* ── 임원 신고: 산 것과 내놓은 것 ─────────────────────────────
          ⚠️⚠️ 둘로 가르면 **어느 쪽도 아닌 신고가 생긴다** — 옵션 행사(M)·무상 취득(A)·
          전환(C)이다. 전체의 19%(실측 2,984건)라 그냥 빠뜨리면 합이 안 맞는다.
          각 카드의 물음표가 몇 건이 빠졌는지 적는다. */}
      <Pair>
        <HalfSheet>
          <SectionHead
            icon="trending_up"
            title="임원이 장내에서 산 것"
            note={`${execBuys.length}건`}
            noteHelp="장내 매수(P)만"
            desc="드물게 나옵니다. 없는 것이 정상입니다."
          />
          {execBuys.length === 0 ? (
            <EmptyCard icon="savings">장내에서 산 신고가 없습니다. 임원이 자기 돈으로 사는 일은 대형주에서 드뭅니다.</EmptyCard>
          ) : (
            <Rows name="stock_insider_buy" items={execBuys.slice(0, ROWS_MAX).map((t, i) => insiderRow(t, i, d.usdKrw))} />
          )}
        </HalfSheet>

        <HalfSheet>
          <SectionHead
            icon="trending_down"
            title="임원이 내놓은 것"
            note={`${execSells.length}건`}
            noteHelp="세금·증여 매도 포함"
            desc="접수일 최신 순입니다. 무엇으로 내놓았는지 옆에 적었습니다."
          />
          {execSells.length === 0 ? (
            <EmptyCard icon="inbox">최근 내놓은 신고가 없습니다.</EmptyCard>
          ) : (
            <Rows name="stock_insider_sell" items={execSells.slice(0, ROWS_MAX).map((t, i) => insiderRow(t, i, d.usdKrw))} />
          )}
        </HalfSheet>
      </Pair>

      {/* ── 의원 신고: 산 것과 판 것 ─────────────────────────────────── */}
      <Pair>
        <HalfSheet>
          <SectionHead
            icon="trending_up"
            title="의원이 산 것"
            note={`${cgBuys.length}건`}
            noteHelp="STOCK Act 매수 신고"
            desc="실제 매매일 기준 최신 순입니다."
          />
          {cgBuys.length === 0 ? <EmptyCard icon="inbox">최근 매수 신고가 없습니다.</EmptyCard> : <Rows name="stock_cg_buy" items={cgBuys.slice(0, ROWS_MAX).map((c, i) => congressRow(c, i, d.usdKrw))} />}
        </HalfSheet>

        <HalfSheet>
          <SectionHead
            icon="trending_down"
            title="의원이 판 것"
            note={`${cgSells.length}건`}
            noteHelp="STOCK Act 매도 신고"
            desc="실제 매매일 기준 최신 순입니다."
          />
          {cgSells.length === 0 ? <EmptyCard icon="inbox">최근 매도 신고가 없습니다.</EmptyCard> : <Rows name="stock_cg_sell" items={cgSells.slice(0, ROWS_MAX).map((c, i) => congressRow(c, i, d.usdKrw))} />}
        </HalfSheet>
      </Pair>

      {/* ⛔ 여기 있던 "SEC와 미 하원이 공개한 공시를 그대로 옮긴 것입니다 …" 각주는
          2026-08-23 에 뺐다. 같은 고지("투자 조언이나 매수·매도 추천이 아닙니다. 모든 투자 판단과
          책임은 이용자 본인에게 있습니다")는 투자 유의사항(/disclaimer)이 한다. 2026-10-02 까지는 전역
          푸터가 그 문장을 들었고, 지금은 모든 화면의 푸터가 투자 유의사항으로 건너가는 링크를 든다.
          ⚠️ 다시 넣지 말 것 — 고지를 화면마다 적지 않고 한 페이지에 모으기로 했다(2026-10-02). */}
    </div>
  );
}
