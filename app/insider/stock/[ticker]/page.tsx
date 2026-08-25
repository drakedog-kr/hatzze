import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  PRICE_RANGES,
  PRICE_RANGE_DEFAULT,
  getStockDetail,
  type StockCongress,
  type StockInsider,
} from "@/lib/insider-detail";

import { SectionHead } from "../../../kadera/SectionHead";
import { StockLogo } from "../../../StockLogo";
import { pageMetadata } from "../../../seo";
import { C, Icon, MONO } from "../../../ui";
import { ExpandableList } from "../../../kadera/ExpandableList";
import {
  CODE_LABEL,
  AnalystActions,
  ChartLegend,
  ConsensusBody,
  Empty,
  GroupTitle,
  MarkBadges,
  EmptyCard,
  HalfRow,
  MarkRadios,
  Money,
  PriceChart,
  Quote,
  T,
  WIDE_COLS,
  WideHead,
  fmtDate,
  wideStockHolderRows,
} from "../../parts";

/**
 * 종목 하나의 상세.
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
export const dynamic = "force-dynamic";

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

/**
 * 이름 뒤에 붙는 목적격 조사를 **받침으로 골라** 준다("엔비디아를" · "코어위브를" · "스페이스X를").
 *
 * ⚠️ `을(를)` 로 때우고 있었다. 그 표기는 서식 문서에나 쓰는 것이라 검색 결과와 공유
 *    카드에 "엔비디아을(를) 월가 거물 …" 로 그대로 나갔다(2026-08-25 확인).
 * ⚠️ 이름이 로마자로 끝나는 종목이 있다(스페이스X, 티커 폴백). 한글 받침 규칙만으로는
 *    못 고르므로 로마자·숫자는 **한국어 음독의 끝소리**로 표를 둔다(X→엑스라 받침 있음,
 *    Y→와이라 없음). 표에 없는 글자는 받침 없음으로 본다 — 틀려도 "를"이라 덜 어색하다.
 */
const FINAL_CONSONANT: Record<string, boolean> = {
  // 로마자: 한국어로 읽었을 때 끝소리가 자음인 것만 true
  c: true, f: true, l: true, m: true, n: true, r: true, s: true, x: true, z: true,
  // 숫자: 영·일·삼·육·칠·팔
  "0": true, "1": true, "3": true, "6": true, "7": true, "8": true,
};
function hasFinal(word: string): boolean {
  const ch = word.trim().slice(-1);
  if (!ch) return false;
  const code = ch.charCodeAt(0);
  // 한글 음절(가~힣)이면 종성 인덱스로 판정한다.
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0;
  return FINAL_CONSONANT[ch.toLowerCase()] ?? false;
}
/** 목적격 조사를 붙인 이름. */
const withObjectParticle = (name: string) => `${name}${hasFinal(name) ? "을" : "를"}`;

export async function generateMetadata({ params }: { params: Promise<{ ticker: string }> }): Promise<Metadata> {
  const { ticker } = await params;
  const d = await getStockDetail(ticker);
  if (!d) return pageMetadata({ title: "내부자 리포트 | hatzze", description: "", path: "/insider" });
  return pageMetadata({
    title: `${d.name || d.ticker}(${d.ticker}) 내부자 공시 | hatzze`,
    description: `${withObjectParticle(d.name || d.ticker)} 월가 거물 ${d.holders.length}명이 보유하고, 미 하원의원 ${
      new Set(d.congress.map((c) => c.member)).size
    }명이 신고했습니다. 주식 텔레그램 언급 추이와 함께 봅니다.`,
    path: `/insider/stock/${d.ticker}`,
  });
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
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 96, padding: "4px 22px 0" }}>
      {points.map((p, i) => {
        // ⚠️⚠️ 손닿는 자리는 **막대가 아니라 칸 전체**다. 막대 높이로 호버를 받으면 언급이
        //    적은 날은 높이가 3%(3px)뿐이라 사실상 못 짚는다 — 0 인 날은 1px 이다.
        //    빈 칸을 세로로 꽉 채워 두고 그 안에 막대를 아래로 붙인다.
        // ⚠️ 가장자리에서 여는 방향은 앵커 위치지정이 알아서 튼다(globals.css). 아래
        //    start/end 는 그걸 모르는 브라우저용 보험이다.
        const at = i / Math.max(1, points.length - 1);
        const edge = at > 0.72 ? " hz-tip-end" : at < 0.28 ? " hz-tip-start" : "";
        return (
          <span
            key={p.date}
            className={`hz-tip hz-vline${edge}`}
            data-tip={`${fmtDate(p.date)} · 언급 ${p.mentions}회 · 채널 ${p.channels}곳`}
            style={{ position: "relative", flex: 1, minWidth: 0, height: "100%", display: "flex", alignItems: "flex-end" }}
          >
            <span
              style={{
                width: "100%",
                // 0 인 날도 1px 은 남긴다 — 아예 없으면 "자료가 없는 날"과 구별이 안 된다.
                height: `${Math.max(p.mentions ? 3 : 1, (p.mentions / max) * 100)}%`,
                borderRadius: 2,
                background: p.mentions ? "var(--c-blue)" : "var(--c-track)",
              }}
            />
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

export default async function StockDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ ticker: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { ticker } = await params;
  // ⚠️ 기간을 리액트 상태로 두면 차트가 클라이언트 컴포넌트가 되고 일봉이 통째로
  //    번들을 탄다. 주소에 담으면 서버가 그대로 그리고, 링크로 공유도 된다.
  const sp = await searchParams;
  const rangeRaw = Array.isArray(sp.p) ? sp.p[0] : sp.p;
  const range = PRICE_RANGES.some((r) => r.key === rangeRaw) ? rangeRaw! : PRICE_RANGE_DEFAULT;
  const d = await getStockDetail(ticker, range);
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
  const execOther = d.insiders.length - execBuys.length - execSells.length;
  const cgBuys = d.congress.filter((c) => c.kind === "P");
  const cgSells = d.congress.filter((c) => c.kind === "S");
  const cgOther = d.congress.length - cgBuys.length - cgSells.length;

  // 거물의 이번 분기 방향. 비교할 직전 분기가 없는 곳은 move 가 null 이라 안 센다.
  const added = d.holders.filter((h) => h.move === "new" || h.move === "add").length;
  const trimmed = d.holders.filter((h) => h.move === "trim").length;
  const quarterMoves = added + trimmed > 0 ? `이번 분기 늘림 ${added} · 줄임 ${trimmed}곳` : "이번 분기 변화 없음";


  return (
    // ⭐ 내부자 리포트는 **달러가 기본**이다 — 재료가 전부 미국 공시라 달러가 원본이고,
    // 원화는 크기를 가늠하라고 얹은 것이다. 쿠키로 한 번이라도 고르면 그 선택이 이긴다
    // (규칙은 globals.css 의 `[data-cur-default]`).
    <div data-cur-default="usd" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Link
        href="/insider"
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
        내부자 리포트
      </Link>

      {/* ── 히어로 ──────────────────────────────────────────────────
          세 칸 — **종목 정체 · 공시에 남은 것 · 커뮤니티 관심 추이.**

          ⭐ 예전엔 첫 칸이 로고와 시세뿐이라 아래가 통째로 비었다. 주가 일봉을 이미
          받고 있으므로 **52주 위치와 기간 수익률이 공짜로 나온다** — 새 원천 없이
          같은 자료를 더 쓰는 것이다.
          ⭐ 둘째 칸은 세 축의 수만 세던 것을 **방향까지** 편다. "임원 신고 222건"보다
          "내놓은 것 135 · 장내에서 산 것 0"이 훨씬 많은 말을 한다. */}
      <section className="hz-sheet">
        <div className="hz-kd-hero">
          <div className="hz-kd-hero-q">
            <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
              <StockLogo code={d.ticker} name={d.name} market="US" size={40} />
              <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                <strong style={{ fontFamily: MONO, fontSize: 20, fontWeight: 800, color: C.ink, letterSpacing: "-.02em" }}>
                  {d.ticker}
                </strong>
                <span style={{ fontSize: T.body, color: C.sub, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {d.name || "이름 미상"}
                </span>
              </span>
            </div>
            <Quote price={d.price} change={d.changeRate} rate={d.usdKrw} large />

            {d.week52 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontSize: T.small, fontWeight: 600, color: C.sub }}>52주 위치</span>
                  <span style={{ fontFamily: MONO, fontSize: T.small, fontWeight: 800, color: C.ink }}>
                    {Math.round(d.week52.position)}%
                  </span>
                </div>
                {/* 저점~고점 사이 어디인가. 노브 하나로 위치를 찍는다 — 막대만 채우면
                    "얼마나 올랐나"로 잘못 읽힌다. */}
                <span className="hz-range">
                  <span className="hz-range-knob" style={{ left: `${d.week52.position}%` }} />
                </span>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontFamily: MONO, fontSize: 10.5, color: C.muted }}>
                    <Money usd={d.week52.low} rate={d.usdKrw} />
                  </span>
                  <span style={{ fontFamily: MONO, fontSize: 10.5, color: C.muted }}>
                    <Money usd={d.week52.high} rate={d.usdKrw} />
                  </span>
                </div>
              </div>
            )}

            {/* 기간 수익률 셋(1개월·3개월·1년)을 **한 줄**로.
                ⚠️ 칸을 넷으로 늘려 봤다가 되돌렸다. 히어로 왼쪽 칸이 203px 인데 넷은
                   226px 를 요구해서 2×2 가 되고, 그 두 줄이 어색했다(2026-08-25).
                   셋이면 가장 넓은 종목도 여유가 남는다(insider-detail 의 returns 주석).
                ⭐ flexWrap 은 남겨 둔다 — 세 자리 수익률(+1234.5%) 같은 극단에서
                  잘리느니 접히는 편이 낫다. 평소엔 아무 일도 안 한다. */}
            {d.returns.length > 0 && (
              <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
                {d.returns.map((r) => (
                  <span key={r.label} style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                    <span
                      style={{
                        fontFamily: MONO,
                        fontSize: 12.5,
                        fontWeight: 800,
                        color: r.pct > 0 ? "var(--c-hot-ink)" : r.pct < 0 ? "var(--c-cold-ink)" : C.sub,
                      }}
                    >
                      {r.pct > 0 ? "+" : r.pct < 0 ? "−" : ""}
                      {Math.abs(r.pct).toFixed(1)}%
                    </span>
                    <span style={{ fontSize: 10.5, color: C.muted }}>{r.label}</span>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="hz-kd-hero-q">
            <div className="hz-kd-hero-title">
              <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: "-.01em", color: C.ink }}>공시에 남은 것</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                {
                  label: "월가 거물 보유",
                  n: d.holders.length,
                  unit: `/${d.managerCount}명`,
                  sub: quarterMoves,
                },
                {
                  label: "미 하원의원 신고",
                  n: members,
                  unit: "명",
                  sub: `매수 ${cgBuys.length} · 매도 ${cgSells.length}건`,
                },
                {
                  label: "임원 신고",
                  n: d.insiders.length,
                  unit: "건",
                  sub: `내놓은 것 ${execSells.length} · 장내에서 산 것 ${execBuys.length}`,
                },
              ].map((s) => (
                <div key={s.label} style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: C.sub }}>{s.label}</span>
                    <strong style={{ fontFamily: MONO, fontSize: 17, fontWeight: 800, color: s.n ? C.ink : C.muted }}>
                      {s.n.toLocaleString("ko-KR")}
                      {/* 단위는 값보다 **한 단 아래**다 — 이 저장소가 `num()` 주석에 적어 둔
                          규칙이고, 그 자리는 값 13 옆에 단위 12/600 이다(한 포인트 차이에
                          굵기와 색으로 가른다). 여기도 같은 비율로 17 옆에 15/600 이다.
                          ⚠️ 11px/700 이었다. 여섯 단이 벌어져 단위가 각주처럼 작았다.
                          ⚠️ 그렇다고 **같은 크기로 두면 안 된다** — `num()` 주석의 경고
                             그대로 "17"과 "/63명"이 두 덩이로 읽힌다(2026-08-26 에 해 보고
                             되돌렸다). 크기는 붙이고 굵기·색으로 가르는 게 답이다.
                          ⚠️ `<strong>` 안이라 굵기를 안 적으면 800 을 물려받는다. */}
                      <span style={{ fontSize: 15, fontWeight: 600, color: C.sub2, marginLeft: 2 }}>{s.unit}</span>
                    </strong>
                  </div>
                  {/* ⭐ 수 하나보다 **방향**이 말이 많다. 같은 222건이어도 무엇이었는지가 다르다. */}
                  <span style={{ fontSize: 10.5, color: C.muted, textAlign: "right" }}>{s.sub}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ⭐ 제일 넓은 칸이 **카더라 언급 추이**다. 이 화면이 저쪽과 갈리는 자리다. */}
          <div className="hz-kd-hero-h" style={{ padding: 0 }}>
            <div style={{ padding: "22px 22px 0" }}>
              <div className="hz-kd-hero-title">
                <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: "-.01em", color: C.ink }}>
                  커뮤니티 관심 추이
                </span>
              </div>
              {d.trend.length === 0 ? (
                <p style={{ margin: "10px 0 0", fontSize: T.body, color: C.sub, lineHeight: 1.7 }}>
                  이 종목은 아직 커뮤니티에서 잡힌 적이 없습니다.
                </p>
              ) : (
                <div style={{ display: "flex", alignItems: "baseline", gap: 7, marginTop: 10, flexWrap: "wrap" }}>
                  <strong style={{ fontFamily: MONO, fontSize: 24, fontWeight: 800, color: C.ink, letterSpacing: "-.02em" }}>
                    {d.mentionsToday}
                  </strong>
                  {/* 위 '공시에 남은 것'의 단위와 같은 규칙 — 값보다 한 단 아래(24 → 22),
                      굵기와 색으로 가른다. */}
                  <span style={{ fontFamily: MONO, fontSize: 22, fontWeight: 600, color: C.sub }}>회</span>
                  <span style={{ fontSize: T.body, color: C.sub }}>
                    {fmtDate(d.mentionDate)} 하루 · 채널 {d.channelsToday}곳 · 최근 {d.trend.length}일 최다 {peak}회
                  </span>
                </div>
              )}
            </div>
            {d.trend.length > 0 && <Trend points={d.trend} />}
          </div>
        </div>
      </section>

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
            noteHelp="야후 일봉에 임원·의원의 매매 시점을 얹었습니다."
            desc="채운 점이 매수, 빈 고리가 매도입니다. 선에 마우스를 올리면 날짜와 가격이 나옵니다."
          />
          {/* ⚠️ 배지가 형제 SVG 의 마커를 흐린다(`:has()`). 감싸는 상자가 있어야 그 규칙이
              닿는다 — 배지와 차트가 같은 부모 안에 있어야 한다. */}
          {/* ⚠️ 라디오가 차트 상자보다 **앞**에 있어야 한다 — CSS 가 형제 선택자(`~`)로
              마커를 흐린다. `:has()` 는 쓰면 안 된다(MarkRadios 주석 참고). */}
          <div className="hz-mkfilter" style={{ padding: "12px 0 16px" }}>
            <MarkRadios id="hz-mkf" />
            {/* ⚠️ 배지를 SectionHead 의 `right` 에 넣으면 note 알약이 통째로 안 그려진다 —
                물음표 툴팁이 거기 붙어 있어 단서가 같이 사라진다. 차트 바로 위에 둔다. */}
            {/* 왼쪽이 기간(주소), 오른쪽이 축 필터(CSS). 둘 다 서버 컴포넌트로 남는다. */}
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
              <span className="hz-periodset">
                {PRICE_RANGES.map((r) => (
                  <Link
                    key={r.key}
                    href={`/insider/stock/${encodeURIComponent(d.ticker)}${r.key === PRICE_RANGE_DEFAULT ? "" : `?p=${r.key}`}`}
                    // ⚠️ 스크롤을 위로 튕기지 않는다 — 차트를 보다 기간만 바꾸는 것이라
                    //    맨 위로 올라가면 방금 보던 자리를 잃는다.
                    scroll={false}
                    className={r.key === range ? "is-on" : undefined}
                    aria-current={r.key === range ? "true" : undefined}
                  >
                    {r.label}
                  </Link>
                ))}
              </span>
              <MarkBadges id="hz-mkf" />
            </div>
            <div className="hz-mkfilter-chart">
              <PriceChart bars={d.bars} marks={d.marks} rate={d.usdKrw} />
              <ChartLegend />
            </div>
          </div>
        </section>
      )}

      {d.consensus && <GroupTitle>밖에서 보는 눈</GroupTitle>}

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
            noteHelp="stockanalysis.com이 싣는 S&P Global 집계입니다. 등급과 목표가는 낸 사람이 다릅니다."
            desc="증권사들이 이 종목을 어떻게 보고 있는지입니다."
          />
          <ConsensusBody c={d.consensus} price={d.price} rate={d.usdKrw}>
            <AnalystActions rows={d.analystActions} rate={d.usdKrw} />
          </ConsensusBody>
        </section>
      )}

      <GroupTitle>월가 거물이 든 것</GroupTitle>

      {/* ── 거물 보유 ────────────────────────────────────────────────── */}
      <section className="hz-sheet">
        <SectionHead
          icon="groups"
          title="이 종목을 든 월가 거물"
          note={`${d.holders.length}/${d.managerCount}명`}
          noteHelp="분기말 기준이라 지금과 다를 수 있습니다. 증감은 주식 수 기준입니다."
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

      {/* ⭐ 메인 화면의 같은 구간과 **같은 문구**다. 두 화면이 같은 자료를 보는 것이라
          이름이 갈리면 다른 묶음으로 읽힌다. */}
      <GroupTitle>임원과 의원의 신고</GroupTitle>

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
            noteHelp={`장내 매수(P)만입니다. 전체 신고의 1%뿐이라 드뭅니다.${
              execOther > 0 ? ` 매매가 아닌 ${execOther}건은 뺐습니다.` : ""
            }`}
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
            noteHelp={`장내 매도에 세금 원천징수·증여가 섞여 있습니다.${
              execOther > 0 ? ` 매매가 아닌 ${execOther}건은 뺐습니다.` : ""
            }`}
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
            noteHelp={`STOCK Act 신고 중 매수(P)입니다. 금액은 구간으로만 신고됩니다.${
              cgOther > 0 ? ` 교환(E) ${cgOther}건은 어느 쪽도 아니라 뺐습니다.` : ""
            }`}
            desc="실제 매매일 기준 최신 순입니다."
          />
          {cgBuys.length === 0 ? <EmptyCard icon="inbox">최근 매수 신고가 없습니다.</EmptyCard> : <Rows name="stock_cg_buy" items={cgBuys.slice(0, ROWS_MAX).map((c, i) => congressRow(c, i, d.usdKrw))} />}
        </HalfSheet>

        <HalfSheet>
          <SectionHead
            icon="trending_down"
            title="의원이 판 것"
            note={`${cgSells.length}건`}
            noteHelp={`STOCK Act 신고 중 매도(S)입니다. 금액은 구간으로만 신고됩니다.${
              cgOther > 0 ? ` 교환(E) ${cgOther}건은 어느 쪽도 아니라 뺐습니다.` : ""
            }`}
            desc="실제 매매일 기준 최신 순입니다."
          />
          {cgSells.length === 0 ? <EmptyCard icon="inbox">최근 매도 신고가 없습니다.</EmptyCard> : <Rows name="stock_cg_sell" items={cgSells.slice(0, ROWS_MAX).map((c, i) => congressRow(c, i, d.usdKrw))} />}
        </HalfSheet>
      </Pair>

      {/* ⛔ 여기 있던 "SEC와 미 하원이 공개한 공시를 그대로 옮긴 것입니다 …" 각주는
          2026-08-23 에 뺐다. **전역 푸터(app/Footer.tsx)가 이미 같은 고지를 한다** —
          "투자 조언이나 매수·매도 추천이 아닙니다. 모든 투자 판단과 책임은 이용자 본인에게
          있습니다." 그 푸터는 AppShell 이 모든 화면에 붙이므로 이 화면에도 뜬다.
          ⚠️ 다시 넣지 말 것. 넣더라도 **푸터가 그 고지를 잃은 뒤에만** 넣는다. */}
    </div>
  );
}
