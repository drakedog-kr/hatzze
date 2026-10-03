import Link from "next/link";

import type { AnalystTop, CongressTicker, InsiderActivity, ManagerMove, ManagerRank } from "@/lib/insider-data";

import { StockLogo } from "../StockLogo";
import { Money } from "./parts";

/**
 * 내부자 리포트 본 화면(v2)의 줄 — **한 줄 · 네 칸**(순위 · 종목 · 곁 숫자 · 값). 2026-10-03 "너무 복잡하다"로 새로 짰다.
 *
 * 옛 줄(parts.tsx 의 execRows 따위)은 두 줄이었다 — 티커 · 이름 · 알약('카더라 언급' · '신규 12') 위에, 사람 이름 줄('사우디 국부펀드 ·
 * 다니엘 선드하임 외 10명') · 거래 코드 줄이 아래에, 오른쪽도 값 · 날짜 두 줄. 모듈 여덟 장에 그 줄이 다섯씩이라 한 화면에 알약 · 곁줄이
 * 마흔 개 넘게 섰다. 여기는 **그 표가 줄을 고른 까닭 하나**만 값으로 남기고, 누가 · 어떤 코드로는 종목 화면과 전체보기가 말한다.
 * ⛔ 알약 · 둘째 줄을 다시 붙이지 말 것. 전체보기 · 종목 화면은 옛 줄 그대로다(같은 자료를 자세히 보는 자리).
 */

function Row({
  rank,
  href,
  ticker,
  name,
  sub,
  aux,
  value,
  ga,
}: {
  rank: number;
  href: string;
  ticker?: string;
  name: string;
  /** 종목이 아니라 사람이 주인공인 줄(거물 명단)의 곁 이름 — 운용사. 이름 뒤 회색 글자. */
  sub?: string;
  aux?: React.ReactNode;
  value: React.ReactNode;
  ga: string;
}) {
  // 이름이 티커와 같으면(AMD) 한 번만.
  const showName = !ticker || name.toUpperCase() !== ticker.toUpperCase();
  return (
    <li>
      <Link href={href} className="v2-in-row" data-ga={ga}>
        <span className="v2-in-rank">{rank}</span>
        <span className="v2-in-who">
          {ticker && <StockLogo code={ticker} name={name} market="US" size={20} />}
          {ticker && <b>{ticker}</b>}
          {showName && <span className={ticker ? "v2-in-name" : "v2-in-name is-lead"}>{name}</span>}
          {sub && sub !== name && <span className="v2-in-name">{sub}</span>}
        </span>
        <span className="v2-in-aux">{aux}</span>
        <span className="v2-in-val">{value}</span>
      </Link>
    </li>
  );
}

const stockHref = (ticker: string) => `/insider/stock/${encodeURIComponent(ticker)}`;

/** 임원이 신고한 매매 — 곁 숫자 임원 수, 값은 금액 + 성격(처분 · 매수). 금액 규칙은 InsiderActivity.value(처분 합계, 장내 매수가 더 크면 매수 합계). */
export function execLines(rows: InsiderActivity[], rate: number | null) {
  return rows.map((b, i) => (
    <Row
      key={b.ticker}
      rank={i + 1}
      href={stockHref(b.ticker)}
      ticker={b.ticker}
      name={b.name}
      aux={`임원 ${b.people}명`}
      value={
        <>
          <Money usd={b.value} rate={rate} />
          <em className={b.direction === "buy" ? "is-up" : undefined}>{b.direction === "buy" ? "매수" : "처분"}</em>
        </>
      }
      ga="insider_exec_click"
    />
  ));
}

/** 미 하원의원 — 곁 숫자 의원 수, 값은 산 건수 · 판 건수(사는 쪽 빨강 · 파는 쪽 파랑, 국내 관례). 금액은 구간으로만 신고돼 건수다. */
export function congressLines(rows: CongressTicker[]) {
  return rows.map((c, i) => (
    <Row
      key={c.ticker}
      rank={i + 1}
      href={stockHref(c.ticker)}
      ticker={c.ticker}
      name={c.name}
      aux={`의원 ${c.members}명`}
      value={
        <span className="v2-in-pair-n">
          {c.buys > 0 && <span className="is-up">매수 {c.buys}</span>}
          {c.sells > 0 && <span className="is-down">매도 {c.sells}</span>}
        </span>
      }
      ga="insider_congress_click"
    />
  ));
}

/** 거물 분기 변화 — 곁 숫자 새로 담은(신규) · 다 판(청산) 거물 수, 값은 움직인 거물 수. ⚠️ 금액이 아니라 사람 수다(MoveRow 주석 — 13F 금액은 주가에 오염된다). */
export function moveLines(rows: ManagerMove[], kind: "add" | "trim") {
  return rows.map((m, i) => (
    <Row
      key={m.ticker}
      rank={i + 1}
      href={stockHref(m.ticker)}
      ticker={m.ticker}
      name={m.name}
      aux={m.mark > 0 ? `${kind === "add" ? "신규" : "청산"} ${m.mark}곳` : undefined}
      value={`${m.movers}명`}
      ga={kind === "add" ? "insider_adds_click" : "insider_trims_click"}
    />
  ));
}

/**
 * 운용자산이 큰 순(월가 거물 명단) — 거물 · 운용사 | 가장 크게 담은 한 종목과 그 비중 | 신고 합계(13F).
 * 2026-10-04 되살림(운영자 판단) — 한때 첫 줄 띠의 링크 칸으로만 남겼고 그 자리엔 '커뮤니티에서 뜨거운 종목'이 섰다.
 * ⚠️ 값은 13F 신고 합계라 진짜 운용자산이 아니다(미국 상장주 롱만 · ManagerRank.aum 주석). 모듈 머리의 물음표가 그 말을 한다.
 */
export function managerLines(rows: ManagerRank[], rate: number | null) {
  return rows.map((m, i) => (
    <Row
      key={m.cik}
      rank={i + 1}
      href={`/insider/investor/${m.cik}`}
      name={m.person}
      sub={m.firm}
      aux={m.topTicker ? `최대 비중 ${m.topName || m.topTicker} ${Math.round(m.topWeight)}%` : `${m.holdings}종목`}
      value={<Money usd={m.aum} rate={rate} />}
      ga="insider_managers_click"
    />
  ));
}

/** 증권가가 긍정적으로 보는 종목 — 곁 숫자 등급을 낸 애널리스트 수, 값은 그중 가장 높은 등급 비율. 남의 등급을 옮긴 것이라 온도색을 안 얹는다. */
export function analystLines(rows: AnalystTop[]) {
  return rows.map((a, i) => (
    <Row
      key={a.ticker}
      rank={i + 1}
      href={stockHref(a.ticker)}
      ticker={a.ticker}
      name={a.name}
      aux={`${a.analystCount}명 중 ${a.strongBuy}명`}
      value={`${a.analystCount > 0 ? Math.round((a.strongBuy / a.analystCount) * 100) : 0}%`}
      ga="insider_analyst_click"
    />
  ));
}
