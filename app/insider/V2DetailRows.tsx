import Link from "next/link";

import type { ManagerHolding, StockCongress, StockHolder, StockInsider } from "@/lib/insider-detail";
import { groupInsiderLines, ownerDisplayName, shortTitle } from "@/lib/insider-person";

import { ExpandableList } from "../kadera/ExpandableList";
import { StockLogo } from "../StockLogo";
import { CODE_LABEL, Money, fmtDate, moveBadge } from "./parts";

/**
 * 내부자 종목 · 투자자 상세(v2, 2026-10-04)의 줄 — **한 줄 · 칸마다 하나**. 본 화면의 한 줄 네 칸(V2Rows.tsx)과 같은 결이다.
 *
 * 옛 상세는 시트 일곱 장 · 반쪽 카드 넷(임원 산 것 / 내놓은 것 · 의원 산 것 / 판 것)이었고, 줄마다 알약(늘림 · 줄임)과 둘째 줄이
 * 붙었다. 여기는 방향을 **글자 색**으로만 말하고(사는 쪽 빨강 · 파는 쪽 파랑, 국내 관례 · parts.tsx MOVE_TONE 과 같은 뜻),
 * 산 것과 판 것을 한 목록에 섞어 최신 순으로 세운다 — 반으로 가르면 한쪽이 '0건' 빈 카드가 되는 일이 잦았다(대형주 임원 매수).
 *
 * 칸 폭은 목록마다 다르다(v2.css .v2-isd-list[data-cols]). 열 머리는 두지 않는다 — 칸마다 값이 무엇인지 글자가 말한다(금액 · 비중 % · 날짜).
 * ⭐ 비중엔 '비중'을 붙인다 — 숫자만 '7.0%'면 무엇의 %인지 안 읽혔다(2026-10-04 점검).
 */

const ROWS_OPEN = 8;
const ROWS_STEP = 10;

/** 상세의 줄 목록 + 바닥의 '더 보기'. 모듈 높이가 짝 모듈보다 크면 줄이 고르게 늘어난다(v2.css). */
export function DetailList({ items, name, cols, open = ROWS_OPEN }: { items: React.ReactNode[]; name: string; cols: string; open?: number }) {
  return (
    <ExpandableList
      items={items}
      name={name}
      initial={open}
      step={ROWS_STEP}
      listClassName={`v2-isd-list is-${cols}`}
      footerClassName="hz-sheet-foot-row"
    />
  );
}

const toneCls = (tone: "up" | "down" | "flat") => (tone === "up" ? "is-up" : tone === "down" ? "is-down" : "is-flat");

/** 거물의 분기 움직임 글자 — moveBadge(신규 · 7% 늘림 · 6% 줄임 · 유지)를 색 글자로. */
function Move({ move, change }: { move: StockHolder["move"]; change: number | null }) {
  const b = moveBadge(move, change);
  if (!b) return <span className="v2-isd-mid is-flat">-</span>;
  return <span className={`v2-isd-mid ${toneCls(b.tone === "hot" ? "up" : b.tone === "cold" ? "down" : "flat")}`}>{b.text}</span>;
}

/** 종목 상세 — 이 종목을 든 월가 거물. 거물 · 소속 | 분기 움직임 | 그 운용사 안 비중 | 금액. */
export function holderLines(rows: StockHolder[], rate: number | null) {
  return rows.map((h) => (
    <li key={h.cik}>
      <Link href={`/insider/investor/${h.cik}`} className="v2-isd-row" data-ga="insider_holder_click">
        <span className="v2-isd-who">
          <b>{h.person}</b>
          {h.firm && h.firm !== h.person && <span>{h.firm}</span>}
        </span>
        <Move move={h.move} change={h.sharesChange} />
        <span className="v2-isd-num is-sub">비중 {h.weight < 1 ? h.weight.toFixed(2) : h.weight.toFixed(1)}%</span>
        <span className="v2-isd-num">
          <Money usd={h.value} rate={rate} />
        </span>
      </Link>
    </li>
  ));
}

/**
 * 종목 상세 — 임원 신고(산 것 + 손을 떠난 것, 매매일 최신 순). 이름 · 직함 | 무엇을 · 몇 건 · 언제 매매 | 금액.
 * 같은 사람 · 같은 날 · 같은 종류 줄은 하나로 묶는다(lib/insider-person.ts). 날짜는 매매일 — 차트 점과 같은 날이고 의원 줄처럼 '매매'를 붙인다.
 * ⚠️ 금액이 없는 신고(증여 · 전환은 원천에 단가가 없다)는 주식 수를 세우고 한 단 흐리게 한다(옛 insiderRow 와 같은 규칙).
 */
export function insiderLines(rows: StockInsider[], rate: number | null) {
  return groupInsiderLines(rows).map((t, i) => {
    const tone = t.code === "P" ? "up" : t.acquiredDisposed === "D" ? "down" : "flat";
    const what = t.code ? (CODE_LABEL[t.code]?.text ?? t.code) : "종류 미상";
    const title = shortTitle(t.ownerTitle);
    return (
      <li key={`${t.ownerName}-${t.transactionDate ?? t.filedDate}-${i}`}>
        <div className="v2-isd-row">
          <span className="v2-isd-who">
            <b>{ownerDisplayName(t.ownerName) ?? "이름 없음"}</b>
            {title && <span>{title}</span>}
          </span>
          <span className={`v2-isd-mid ${toneCls(tone)}`}>
            {what}
            {t.count > 1 ? ` ${t.count}건` : ""}
            <em>{fmtDate(t.transactionDate ?? t.filedDate)} 매매</em>
          </span>
          <span className={`v2-isd-num${t.value == null ? " is-sub" : ""}`}>
            {t.value != null ? <Money usd={t.value} rate={rate} /> : t.shares != null ? `${Math.round(t.shares).toLocaleString("ko-KR")}주` : "미상"}
          </span>
        </div>
      </li>
    );
  });
}

/**
 * 종목 상세 — 의원 신고(산 것 + 판 것, 매매일 최신 순). 의원 | 매수 · 매도 · 매매일 | 신고 구간.
 * ⚠️ 금액은 늘 구간이고 대부분 같은 구간이라($1K~$15K, 86%) 이 줄에서 갈리는 값은 날짜다(옛 congressRow 주석).
 */
export function congressLines(rows: StockCongress[], rate: number | null) {
  return rows.map((c, i) => {
    const buy = c.kind === "P";
    return (
      <li key={`${c.member}-${c.filedDate}-${i}`}>
        <div className="v2-isd-row">
          <span className="v2-isd-who">
            <b>{c.member}</b>
          </span>
          <span className={`v2-isd-mid ${buy ? "is-up" : c.kind === "S" ? "is-down" : "is-flat"}`}>
            {buy ? "매수" : c.kind === "S" ? "매도" : "교환"}
            <em>{fmtDate(c.transactionDate)} 매매</em>
          </span>
          <span className="v2-isd-num is-sub">
            {c.amountLow != null && c.amountHigh != null ? (
              <>
                <Money usd={c.amountLow} rate={rate} />~<Money usd={c.amountHigh} rate={rate} />
              </>
            ) : (
              "구간 미상"
            )}
          </span>
        </div>
      </li>
    );
  });
}

/** 종목 칸 — 로고 · 티커 · 한글 이름(티커와 같으면 한 번만). */
function StockWho({ ticker, name }: { ticker: string; name: string }) {
  return (
    <span className="v2-isd-who">
      <StockLogo code={ticker} name={name} market="US" size={20} />
      <b>{ticker}</b>
      {name && name.toUpperCase() !== ticker.toUpperCase() && <span>{name}</span>}
    </span>
  );
}

/** 투자자 상세 — 보유 종목. 종목 | 분기 움직임 | 포트폴리오 비중 | 금액. 주식 수는 걷었다(비중 · 금액이 크기를 말한다). */
export function holdingLines(rows: ManagerHolding[], rate: number | null) {
  return rows.map((h) => (
    <li key={h.ticker}>
      <Link href={`/insider/stock/${encodeURIComponent(h.ticker)}`} className="v2-isd-row" data-ga="insider_holding_click">
        <StockWho ticker={h.ticker} name={h.name} />
        <Move move={h.move} change={h.sharesChange} />
        <span className="v2-isd-num is-sub">비중 {h.weight < 1 ? h.weight.toFixed(2) : h.weight.toFixed(1)}%</span>
        <span className="v2-isd-num">
          <Money usd={h.value} rate={rate} />
        </span>
      </Link>
    </li>
  ));
}

/** 투자자 상세 — 이번 분기에 전량 정리한 종목. 종목 | 정리 전 비중 | 정리 전 금액. */
export function exitedLines(rows: { ticker: string; name: string; value: number; weight: number }[], rate: number | null) {
  return rows.map((e) => (
    <li key={e.ticker}>
      <Link href={`/insider/stock/${encodeURIComponent(e.ticker)}`} className="v2-isd-row" data-ga="insider_exited_click">
        <StockWho ticker={e.ticker} name={e.name} />
        <span className="v2-isd-num is-sub">비중 {e.weight < 1 ? e.weight.toFixed(2) : e.weight.toFixed(1)}%</span>
        <span className="v2-isd-num">
          <Money usd={e.value} rate={rate} />
        </span>
      </Link>
    </li>
  ));
}
