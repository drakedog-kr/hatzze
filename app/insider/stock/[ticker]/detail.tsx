import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment } from "react";

import { withObjectParticle } from "@/lib/format";
import { MENTION_TREND_DAYS, getStockDetail } from "@/lib/insider-detail";
import { groupInsiderLines } from "@/lib/insider-person";
import { PRICE_RANGES, type PriceRangeKey, stockDetailHref } from "@/lib/insider-range";
import { assertLoaded } from "@/lib/load-state";

import { CoverMeta, Module } from "../../../kadera/V2Modules";
import { CurrencyToggle } from "../../../AppShell";
import { ChartZoom } from "../../ChartZoom";
import { StockLogo } from "../../../StockLogo";
import { PageJsonLd } from "../../../JsonLd";
import { INSIDER_CARD } from "../../../og-copy";
import { pageMetadata } from "../../../seo";
import { LoadFailedNote } from "../../../LoadFailedNote";
import { AnalystActions, ConsensusBody, ExactMoney, MarkBadges, MarkRadios, PriceChart, fmtDate, markSpotCount, moveKind, quarterLabel } from "../../parts";
import { DetailList, congressLines, groupCongressLines, holderLines, insiderLines } from "../../V2DetailRows";
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
/**
 * 실어 보내는 줄 수 상한. 처음 펴는 줄 수와 '더 보기' 한 번의 증가분은 V2DetailRows(DetailList)가 정한다.
 * ⚠️ 상세는 목록이 길다(코어위브 임원 신고 2,021건). 안 보이는 줄도 클라이언트로 전송되므로 상한이 따로 필요하다.
 */
const ROWS_MAX = 60;

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
    // 이름이 없으면 티커 한 번 — 'MCO(MCO)'로 겹쳤다(2026-10-04 점검).
    title: `${d.name ? `${d.name}(${d.ticker})` : d.ticker} 내부자 공시 | hatzze`,
    description: `${withObjectParticle(d.name || d.ticker)} 월가 거물 ${d.holders.length}명이 보유하고, 미 하원의원 ${congressMembers(d.congress)}명이 신고했습니다. 주식 텔레그램 언급 추이와 함께 봅니다.`,
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
 * 의원 수 — 지역구(state_dst)로 센다. 같은 의원이 표기가 갈려('John McGuire' · 'John J Mr McGuire') 두 명으로 셌다(2026-10-04 점검).
 * 지역구가 없는 행만 이름으로.
 */
function congressMembers(rows: { member: string; stateDst: string | null }[]): number {
  return new Set(rows.map((c) => c.stateDst ?? c.member)).size;
}

/** 언급이 한 번도 없는 종목의 막대 — 언급 표의 끝날까지 0 으로 채운 날들(빈 문장 대신 같은 꼴로 그린다). */
function zeroDays(end: string, days: number) {
  const out: { date: string; mentions: number; channels: number }[] = [];
  const d = new Date(`${end}T00:00:00Z`);
  for (let i = days - 1; i >= 0; i--) {
    const t = new Date(d);
    t.setUTCDate(t.getUTCDate() - i);
    out.push({ date: t.toISOString().slice(0, 10), mentions: 0, channels: 0 });
  }
  return out;
}

/** 목록 모듈의 키 어림 — 펴는 줄(8)까지 + 넘치면 '더 보기' 한 줄. */
const rowsWeight = (n: number) => Math.min(n, 8) + (n > 8 ? 1 : 0);

/** 짝지을 모듈 하나 — w 는 줄 수로 어림한 키(펴는 줄 8 + '더 보기' 1, 애널리스트 칸은 줄 12쯤). n 은 목록의 전체 줄 수(애널리스트 칸은 없음).
    render 는 처음 펼 줄 수를 받는다 — 짝이 정해진 뒤에야 몇 줄을 펼지 안다(openFor). */
type PairMod = { key: string; render: (open?: number) => React.ReactNode; w: number; n?: number };

/**
 * 짝 안에서 목록이 처음 펼 줄 수 — 짝 키에 맞춰 빈 자리 없이(2026-10-08 점검). 줄은 남는 높이를 받아 64 까지 늘어나지만(v2.css .v2-isd-list),
 * 그것만으론 모자라 TSLA · PLTR 거물 칸 바닥이 139 · 167px, 애널리스트 칸 짝인 목록은 '더 보기' 위가 70px 안팎 비었다.
 * - 애널리스트 칸과 짝: 목록을 10줄까지 펴서 실제 줄로 채운다. 애널리스트 칸 키가 폭마다 달라(1,280 671 · 1,440 이상 560 안팎) 12줄이면
 *   넓은 화면에서 목록(610)이 더 길어 애널리스트 칸 바닥이 60px 비었다. 10줄(522)은 1,280 에서 줄을 59 까지 늘려 채우고 넓은 화면에선 안에 든다.
 * - 목록끼리: 펴는 줄이 적은 쪽이 키를 정하고(줄을 64 까지 늘린 키), 긴 쪽은 그 키에 들 만큼만 먼저 편다 — 나머지는 '더 보기'에 그대로 있다.
 * 키 셈은 v2 값이다 — 머리 42 · 줄 44 · 늘린 줄 64 · '더 보기' 줄 40.
 */
function openFor(g: PairMod[]): Map<string, number> {
  const out = new Map<string, number>();
  if (g.length !== 2) return out;
  const lists = g.filter((m) => m.n != null);
  if (lists.length === 1) {
    out.set(lists[0].key, Math.min(lists[0].n!, 10));
    return out;
  }
  if (lists.length !== 2) return out;
  const vis = (m: PairMod) => Math.min(m.n!, 8);
  const [short, long] = vis(lists[0]) <= vis(lists[1]) ? [lists[0], lists[1]] : [lists[1], lists[0]];
  if (vis(short) === vis(long)) return out;
  const shortMax = 42 + 64 * vis(short) + (short.n! > 8 ? 40 : 0);
  const k = Math.max(3, Math.floor((shortMax - 42 - 40) / 44));
  if (k < vis(long)) out.set(long.key, k);
  return out;
}

/**
 * 모듈을 둘씩 짝짓는다 — 키가 비슷한 것끼리. [거물 | 애널리스트] · [임원 | 의원]으로 못박았을 땐 한쪽이 없으면 남은 것이 판 폭을
 * 혼자 차지했고(이름과 금액이 1,000px 떨어짐), 줄이 셋뿐인 목록이 키 큰 짝에 맞춰 늘어 한 줄이 200px 가까이 됐다(2026-10-04 점검).
 * 짝의 순서는 원래 순서(거물 → 애널리스트 → 임원 → 의원)의 앞선 것부터. 홀수면 하나가 판 폭으로 선다.
 */
function pairUp(ms: PairMod[]): PairMod[][] {
  if (ms.length <= 2) return ms.length ? [ms] : [];
  const cost = (a: PairMod, b: PairMod) => Math.abs(Math.log(a.w / b.w));
  const idx = (m: PairMod) => ms.indexOf(m);
  const order = (gs: PairMod[][]) => gs.map((g) => [...g].sort((a, b) => idx(a) - idx(b))).sort((a, b) => idx(a[0]) - idx(b[0]));
  if (ms.length === 3) {
    let best: PairMod[][] = [];
    let bc = Infinity;
    for (let solo = 0; solo < 3; solo++) {
      const pair = ms.filter((_, i) => i !== solo);
      const c = cost(pair[0], pair[1]);
      if (c < bc) {
        bc = c;
        best = [pair, [ms[solo]]];
      }
    }
    return order(best);
  }
  const [a, b, c, d] = ms;
  const options = [
    [[a, b], [c, d]],
    [[a, c], [b, d]],
    [[a, d], [b, c]],
  ];
  const best = options.reduce((x, y) => (cost(y[0][0], y[0][1]) + cost(y[1][0], y[1][1]) < cost(x[0][0], x[0][1]) + cost(x[1][0], x[1][1]) ? y : x));
  return order(best);
}

/**
 * 언급 추이 막대. **SVG 도 라이브러리도 안 쓴다** — 40개짜리 막대는 div 로 충분하고,
 * 서버 컴포넌트로 남길 수 있어 클라이언트 번들이 안 는다.
 *
 * ⚠️ 빈 날을 0 으로 메워 받는다(`fillDays`). 안 메우면 주말을 건너뛰어 막대 간격이
 *    날짜와 어긋나고, 추이가 실제보다 촘촘해 보인다.
 */
function Trend({ points, partial = false }: { points: { date: string; mentions: number; channels: number }[]; partial?: boolean }) {
  const max = Math.max(1, ...points.map((p) => p.mentions));
  // v2 — 종목 페이지 · 테마 한 장의 추이와 같은 꼴(.v2-tm-trend). 최근 사흘만 진한 파랑.
  const recentFrom = points.length >= 3 ? points[points.length - 3].date : "";
  return (
    <div className="v2-tm-trend" role="img" aria-label={`최근 ${points.length}일 언급 막대`}>
      {points.map((p, i) => {
        const at = i / Math.max(1, points.length - 1);
        const edge = at > 0.72 ? " hz-tip-end" : at < 0.28 ? " hz-tip-start" : "";
        // 마지막 칸이 오늘(아직 안 끝난 날)이면 옅게 · 말풍선에 '집계 중'(mentionTrend partial).
        const part = partial && i === points.length - 1;
        return (
          <span key={p.date} className={`hz-tip hz-vline${edge}`} data-tip={`${fmtDate(p.date)} · 언급 ${p.mentions}회 · 채널 ${p.channels}곳${part ? " · 집계 중" : ""}`}>
            <i
              className={[!p.mentions ? "is-none" : p.date >= recentFrom ? "is-recent" : "", part ? "is-part" : ""].filter(Boolean).join(" ") || undefined}
              // 0 인 날은 2px 바닥선 — 1px 막대 40개는 빈 칸이나 깨진 그림으로 보였다(언급 0 종목, 2026-10-05 점검).
              style={{ height: p.mentions ? `${Math.max(3, (p.mentions / max) * 100)}%` : "2px" }}
            />
          </span>
        );
      })}
    </div>
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

  const members = congressMembers(d.congress);
  const peak = Math.max(0, ...d.trend.map((p) => p.mentions));
  const trendPoints = d.trend.length ? d.trend : d.mentionAsOf ? zeroDays(d.mentionAsOf, MENTION_TREND_DAYS) : [];

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
  // 한 목록에 섞어 매매일 최신 순으로(의원과 같은 잣대 — 차트 점과 같은 날, 2026-10-04 점검). 매매일이 없으면 접수일.
  const execTrades = [...execBuys, ...execSells].sort((a, b) => (b.transactionDate ?? b.filedDate).localeCompare(a.transactionDate ?? a.filedDate));
  // 장내 매수도 처분도 아닌 신고(무상 취득 · 옵션 행사 취득 · 전환) — 큰 숫자(임원 신고)와 두 갈래 합을 맞춘다(2026-10-04 점검).
  const execOther = d.insiders.length - execBuys.length - execSells.length;
  // 연도까지('26.1.2 이후') — 연도 없는 '1/2 이후' 아래에 '24.10.23' 줄이 서 모순으로 읽혔다(2026-10-05 점검).
  const since = (iso: string | null) => (iso ? `${iso.slice(2, 4)}.${Number(iso.slice(5, 7))}.${Number(iso.slice(8, 10))} 이후` : "");
  const cgTrades = [...cgBuys, ...cgSells].sort((a, b) => (b.transactionDate ?? b.filedDate).localeCompare(a.transactionDate ?? a.filedDate));

  // 거물의 이번 분기 방향. 비교할 직전 분기가 없는 곳은 move 가 null 이라 안 센다.
  // 줄 글자(늘림 · 줄임 · 유지)와 같은 잣대로 센다(parts.tsx moveKind).
  const kinds = d.holders.map((h) => moveKind(h.move, h.sharesChange));
  // 신규는 따로 센다 — '늘림 1명'인데 아래 줄은 '신규'였다(2026-10-05 점검). 0 인 갈래는 적지 않는다.
  const newly = kinds.filter((k) => k === "new").length;
  const added = kinds.filter((k) => k === "add").length;
  const trimmed = kinds.filter((k) => k === "trim").length;
  // '이번 분기'가 아니라 분기 이름(2026 Q2) — 오늘(4분기)과 헷갈렸다. 다 판 거물(정리)도 센다 — 차트의 거물 '줄임 · 정리'와 같은 수(2026-10-04 점검).
  const q = d.holdersQuarter ? quarterLabel(d.holdersQuarter) : "";
  const quarterMoves =
    d.holders.length === 0 && d.exitedCount === 0
      ? "보유한 거물 없음"
      : newly + added + trimmed + d.exitedCount > 0
        ? `${q} ${[
            newly ? `신규 ${newly}명` : "",
            added ? `늘림 ${added}명` : "",
            trimmed ? `줄임 ${trimmed}명` : "",
            d.exitedCount ? `정리 ${d.exitedCount}명` : "",
          ]
            .filter(Boolean)
            .join(" · ")}`.trim()
        : `${q} 변화 없음`.trim();

  const holdersMod =
    d.holders.length > 0
      ? (open?: number) => (
          <Module title="이 종목을 든 월가 거물" meta={`${d.holders.length}/${d.managerCount}명 · ${q ? `${q} 말` : "분기말"}`} className="v2-isd-mod">
            <DetailList name="stock_holders" cols="holder" items={holderLines(d.holders.slice(0, ROWS_MAX), d.usdKrw)} open={open} />
          </Module>
        )
      : null;
  const consensusMod = d.consensus ? (
    <Module title="월가 애널리스트의 시선" meta={fmtDate(d.consensus.asOf)} className="v2-isd-mod v2-isd-consensus">
      <ConsensusBody c={d.consensus} price={d.price} rate={d.usdKrw}>
        <AnalystActions rows={d.analystActions} rate={d.usdKrw} />
      </ConsensusBody>
    </Module>
  ) : null;
  const execMod =
    execTrades.length > 0
      ? (open?: number) => (
          // 머리는 기간만 — 수는 둘째 줄 '공시에 남은 것'이 말한다(네 조각이었다, 2026-10-05 점검). '~ 순' 정렬 표기는 걷었다(운영자 판단).
          <Module title="임원 신고" meta={since(d.insiderSince) ? `${since(d.insiderSince)} 접수` : undefined} className="v2-isd-mod">
            <DetailList name="stock_insider" cols="trade" items={insiderLines(execTrades.slice(0, ROWS_MAX), d.usdKrw)} open={open} />
          </Module>
        )
      : null;
  const cgMod =
    cgTrades.length > 0
      ? (open?: number) => (
          <Module title="미 하원의원 신고" meta={since(d.congressSince) ? `${since(d.congressSince)} 접수` : undefined} className="v2-isd-mod">
            <DetailList name="stock_congress" cols="congress" items={congressLines(cgTrades.slice(0, ROWS_MAX), d.usdKrw)} open={open} />
          </Module>
        )
      : null;
  const holdersN = Math.min(d.holders.length, ROWS_MAX);
  const execN = groupInsiderLines(execTrades.slice(0, ROWS_MAX)).length;
  const cgN = groupCongressLines(cgTrades.slice(0, ROWS_MAX)).length;

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
          title={d.name || d.ticker}
          description={`${withObjectParticle(d.name || d.ticker)} 월가 거물 보유·임원 신고·미 하원의원 매매와 주식 텔레그램 언급 추이로 봅니다.`}
          path={stockDetailHref(d.ticker)}
          trail={[PARENT]}
        />
      )}
      {/* 이름 사전에 없는 종목은 티커 — 빈 이름이면 이동 경로 끝이 빈칸이었다(SMCIP, 2026-10-04 점검). */}
      <BackTrail parent={{ name: PARENT.name, href: PARENT.path }} current={d.name || d.ticker} />

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
          // v2-cover-price — 폰에서 이 화면의 대표 숫자(현재가)만 키운다(v2.css 모바일 묶음).
          <div className="v2-cover-cell v2-cover-price">
            <span className="v2-cover-k">현재가</span>
            <span className="v2-cover-v">
              {/* 시세는 소수 둘째 자리까지(ExactMoney) — 금액 접기(Money)는 $1,000 미만을 정수로 반올림해 $6.92 가 '$7'로 섰다(2026-10-04 점검). */}
              <b>
                <ExactMoney usd={d.price} rate={d.usdKrw} />
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
                <ExactMoney usd={d.week52.low} rate={d.usdKrw} /> ~ <ExactMoney usd={d.week52.high} rate={d.usdKrw} />
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
        {/* 언급이 없는 종목도 언급 표의 끝날로 — '언급 준비 중'은 자료가 준비 중인 것으로 읽혔다(2026-10-04 점검). */}
        <CoverMeta updated={d.mentionDate ?? d.mentionAsOf ? `${fmtDate(d.mentionDate ?? d.mentionAsOf)} 언급 기준` : "언급 기록 없음"} basis={`월가 거물 ${d.managerCount}명 추적`} />
      </div>

      {/* 둘째 줄 — 공시에 남은 것 | 커뮤니티 관심 추이. 둘 다 안이 늘어난다(줄 · 막대). */}
      <div className="v2-tm-band is-brief">
        {/* 머리 근거는 걷었다 — 바로 아래 세 줄 이름의 되풀이였고 폰에서 머리를 61px 로 키웠다(2026-10-05 점검). */}
        <Module title="공시에 남은 것">
          <dl className="v2-isd-facts">
            {[
              { label: "월가 거물 보유", n: d.holders.length, unit: `/${d.managerCount}명`, sub: quarterMoves },
              // 기간을 적는다 — 세 축의 기간이 달라(거물 분기 · 의원 표 전체 · 임원 표 전체) 본 화면의 90일 숫자와 어긋나 보였다(2026-10-04 점검).
              { label: "미 하원의원 신고", n: members, unit: "명", sub: [`매수 ${cgBuys.length} · 매도 ${cgSells.length}건`, since(d.congressSince)].filter(Boolean).join(" · ") },
              // 셋째 갈래(그 밖)를 넣어 합이 큰 숫자와 맞는다 — 낱말 · 순서는 아래 임원 모듈 머리와 같게(장내 매수 · 처분).
              {
                label: "임원 신고",
                n: d.insiders.length,
                unit: "건",
                sub: [`장내 매수 ${execBuys.length} · 처분 ${execSells.length}${execOther > 0 ? ` · 그 밖 ${execOther}` : ""}`, since(d.insiderSince)].filter(Boolean).join(" · "),
              },
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
        <Module title="커뮤니티 관심 추이" meta={trendPoints.length ? `최근 ${trendPoints.length}일` : undefined} className="v2-tm-trendmod">
          {trendPoints.length === 0 ? (
            <p className="v2-empty">언급 기록을 아직 못 읽었습니다.</p>
          ) : d.trend.length === 0 ? (
            // 언급이 한 번도 없는 종목 — 문장 한 줄 아래가 비던 것을 같은 꼴(0 막대 · 숫자 칸)로(2026-10-04 점검).
            <div className="v2-tm-trendbody">
              <div className="v2-tm-figs">
                <span>
                  <b>0회</b>
                  <em>최근 {trendPoints.length}일 언급</em>
                </span>
              </div>
              <Trend points={trendPoints} />
            </div>
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
              <Trend points={d.trend} partial={d.mentionPartial} />
            </div>
          )}
        </Module>
      </div>

      {/* ── 주가와 매매 시점 ─────────────────────────────────────────
          ⭐ 벤치마킹한 쪽은 차트에 13F·의회·임원·ETF 를 다 얹는다. 우리는 **사람이
          자기 판단으로 장내에서 사고판 것만** 찍는다 — 옵션 행사와 세금 원천징수를
          같이 찍으면 차트가 "임원이 계속 팔았다"고 말하는데, 그 대부분이 기계적
          흐름이라 틀린 말이다. 13F 는 분기말 한 점이다(점 툴팁이 '분기말 기준'이라 말한다).
          v2(2026-10-04) — 시트 머리(아이콘 · 부제 · 사용법 문장)와 차트 아래 각주 두 문장을 걷었다. 걸러 낸 신고는 범례의 물음표가 말한다. */}
      {d.bars.length > 1 && (
        <Module
          title="주가와 매매 시점"
          // '28곳'은 무엇이 28 인지 안 읽혔다(2026-10-04 점검) — 차트 위 점(매매 시점)의 수다.
          // 차트가 그리는 자리 수 — 같은 날 · 같은 봉의 신고는 한 점이라 신고 수(d.marks)와 달랐다(2026-10-05 점검).
          meta={`${PRICE_RANGES.find((r) => r.key === range)?.label} · 매매 시점 ${markSpotCount(d.bars, d.marks)}개`}
          className="v2-isd-chart"
          // 누가 언제 사고팔았는지는 차트 말풍선 안에만 있다 — 폰은 눌러야 열린다. 차트 안 왼쪽 위에 한 번.
          hint={{ id: "insider-chart", anchor: ".hz-mkfilter-chart", at: "inside", text: "차트를 누르면 그날 주가와 신고된 매매가 나옵니다" }}
          aside={
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
                  prefetch={false}
                  aria-current={r.key === range ? "true" : undefined}
                >
                  {r.label}
                </Link>
              ))}
            </span>
          }
        >
          {/* ⚠️ 라디오가 차트 상자보다 **앞**에 있어야 한다 — CSS 가 형제 선택자(`~`)로
              마커를 흐린다. `:has()` 는 쓰면 안 된다(MarkRadios 주석 참고). */}
          <div className="hz-mkfilter">
            <MarkRadios id="hz-mkf" />
            <div className="v2-isd-chartbar">
              <MarkBadges id="hz-mkf" />
              <span className="v2-isd-legend">
                <span>
                  <i className="is-fill" />
                  매수
                </span>
                <span>
                  <i />
                  매도
                </span>
                {/* 걸러 낸 신고 — 물음표 말풍선이던 것을 범례 끝 글자로(2026-10-04 "헬프 툴팁이 필요하면 심플하지 않다"). */}
                <span className="v2-isd-legend-note">옵션 행사 · 원천징수 제외</span>
              </span>
            </div>
            <div className="hz-mkfilter-chart">
              {/* 폰에서는 뷰박스 720 이 화면 폭으로 눌려 축 라벨이 안 읽힌다. MDD 언더워터
                  차트와 같은 확대 보기를 씌운다(같은 `.hz-zoom-*` · 같은 버튼 자리). */}
              <ChartZoom label="주가와 매매 시점 차트">
                <PriceChart bars={d.bars} marks={d.marks} rate={d.usdKrw} />
              </ChartZoom>
            </div>
          </div>
        </Module>
      )}

      {/* ── 거물 · 애널리스트 · 임원 · 의원 — 있는 모듈을 키가 비슷한 것끼리 둘씩(pairUp) ───────────────
          v2(2026-10-04) — 구간 제목 · 시트 머리 부제를 걷고 모듈 짝으로. 줄은 한 줄 네 칸(V2DetailRows).
          ⭐ 빈 모듈은 그리지 않는다 — 0건은 둘째 줄 '공시에 남은 것'이 이미 말하고, 빈 모듈을 세우면 옆 짝 높이만큼 아래가 빈다
             (에보뮨: 거물 0 → 576px · 의원 0 → 167px, 2026-10-04 실측). 애널리스트 커버리지가 없을 때도 같다. */}
      {pairUp(
        (
          [
            holdersMod ? { key: "holders", render: holdersMod, w: rowsWeight(holdersN), n: holdersN } : null,
            consensusMod ? { key: "consensus", render: () => consensusMod, w: 12 } : null,
            execMod ? { key: "exec", render: execMod, w: rowsWeight(execN), n: execN } : null,
            cgMod ? { key: "congress", render: cgMod, w: rowsWeight(cgN), n: cgN } : null,
          ] as (PairMod | null)[]
        ).filter((m): m is PairMod => m != null),
      ).map((g) => {
        const open = openFor(g);
        // 애널리스트 칸 짝인 목록이 10줄도 못 채우면(줄이 다 떨어짐) 줄을 80 까지 늘린다(v2.css .is-fill) — 64 로는 TSLA 거물 여덟 줄 아래가 117px 비었다.
        const fill = g.length === 2 && g.some((m) => m.n == null) && g.some((m) => m.n != null && m.n < 10);
        return (
          <div key={g.map((m) => m.key).join("-")} className={g.length === 2 ? `v2-tm-band is-pair${fill ? " is-fill" : ""}` : "v2-tm-band is-hot is-solo"}>
            {g.map((m) => (
              <Fragment key={m.key}>{m.render(open.get(m.key))}</Fragment>
            ))}
          </div>
        );
      })}

      {/* 임원 목록은 산 것과 판 것을 한 목록에(최신 순).
          ⚠️⚠️ 산 것 · 판 것으로 가르면 **어느 쪽도 아닌 신고**가 남는다(옵션 행사 M · 무상 취득 A · 전환 C, 임원 전체의 19%).
          예전 반쪽 카드 넷이 그랬듯 여기도 장내 매수(P)와 손을 떠난 것(방향 D)만 담는다 — 둘째 줄이 그 밖의 수를 따로 적는다.
          대형주는 임원 장내 매수가 거의 없어 옛 '산 것' 카드가 늘 '0건' 빈 카드였다 — 한 목록이면 그 빈 칸이 없다. */}

      {/* ⛔ 여기 있던 "SEC와 미 하원이 공개한 공시를 그대로 옮긴 것입니다 …" 각주는
          2026-08-23 에 뺐다. 같은 고지("투자 조언이나 매수·매도 추천이 아닙니다. 모든 투자 판단과
          책임은 이용자 본인에게 있습니다")는 투자 유의사항(/disclaimer)이 한다. 2026-10-02 까지는 전역
          푸터가 그 문장을 들었고, 지금은 모든 화면의 푸터가 투자 유의사항으로 건너가는 링크를 든다.
          ⚠️ 다시 넣지 말 것 — 고지를 화면마다 적지 않고 한 페이지에 모으기로 했다(2026-10-02). */}
    </div>
  );
}
