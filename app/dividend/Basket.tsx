"use client";

// 성향별 바스켓 시트. DividendCalculator.tsx 에서 그대로 옮겨 왔다(store.ts 머리말 참고).

import { Icon } from "../ui";
import { SectionHead } from "../kadera/SectionHead";
import { StockLogo } from "../StockLogo";
import { type BasketLite, type StockLite } from "./types";
import { won, wonShort, pct } from "./format";
import type { TaxMode } from "./tax";
import { accountTag, streakLabel, computeLines, basketCodes, basketShares, RULE_TIPS } from "./shared";

/* ── 바스켓 시트 ─────────────────────────────────────────────────── */
/** 바스켓 줄 오른쪽 숫자 — 성향마다 "왜 여기 들었나"를 말하는 값. */
function basketMeta(meta: BasketLite["meta"], s: StockLite): string {
  switch (meta) {
    case "growth":
      return s.growth5 != null ? `연 ${s.growth5.toFixed(0)}% 성장` : "";
    case "streak":
      // 미국은 SEC 로 센 연속 연수가 19~20에서 막힌다 — 해마다 늘린 햇수(stockanalysis)가 있으면 그것.
      return s.growthYears != null ? `${s.growthYears}년 연속 늘림` : streakLabel(s.streak);
    case "months":
      return s.pays.length ? `${[...new Set(s.pays.map(([m]) => m))].sort((a, b) => a - b).join("·")}월` : "";
    case "growthYears":
      return s.growthYears != null ? `${s.growthYears}년 연속 늘림` : "";
    case "payout":
      return s.payout ? `배당성향 ${Math.round(s.payout[1])}%` : "";
    case "septax":
      return `${s.yieldPct != null ? `${pct(s.yieldPct)} · ` : ""}배당성향 ${s.highDiv?.[1] != null ? Math.round(s.highDiv[1]) : "?"}%`;
    case "discount":
      return s.discount != null ? `${s.yieldPct != null ? `${pct(s.yieldPct)} · ` : ""}보통주보다 ${Math.round(s.discount)}% 아래` : s.yieldPct != null ? pct(s.yieldPct) : "";
    default:
      return s.yieldPct != null ? pct(s.yieldPct) : "";
  }
}

export function BasketSheet({
  basket,
  amount,
  byCode,
  mode,
  fx,
  onApply,
  onPick,
}: {
  basket: BasketLite;
  amount: number;
  byCode: Map<string, StockLite>;
  mode: TaxMode;
  fx: number;
  onApply: () => void;
  onPick: (code: string) => void;
}) {
  // '내 계좌 맞춤'은 연금저축·IRP 를 골랐을 때 그 계좌 목록으로 바뀐다(IRP 는 안전자산 셋 포함). 다른 바스켓은 계좌와 무관.
  const codes = basketCodes(basket, mode);
  const holdings = basketShares(codes, amount, byCode, fx).map((h) => ({ id: h.code, ...h }));
  const lines = computeLines(holdings, byCode, fx, mode, mode === "gross" ? "general" : mode);
  const net = lines.reduce((s, l) => s + l.netKrw, 0);
  const gross = lines.reduce((s, l) => s + l.grossKrw, 0);
  const invest = lines.reduce((s, l) => s + (l.investKrw ?? 0), 0);
  const y = invest > 0 ? (gross / invest) * 100 : null;
  return (
    <section className="hz-sheet dv-basket" aria-label={basket.title}>
      <SectionHead
        icon={basket.icon}
        title={
          <>
            {basket.altIrp && mode === "irp" ? `${basket.title} (IRP)` : basket.altPension && mode === "pension" ? `${basket.title} (연금저축)` : basket.altPension && mode === "exempt" ? `${basket.title} (비과세 종합저축)` : basket.altPension ? `${basket.title} (ISA)` : basket.title}
            {/* 주의는 제목 옆 물음표에(2026-09-13 지적) — 바닥에 문장으로 두면 시트가 무거워진다. */}
            {basket.caution && (
              <span className="hz-tip hz-tip-wide dv-help" data-tip={basket.caution} style={{ cursor: "help", marginLeft: 4, verticalAlign: "middle" }} aria-label={`${basket.title} 주의`}>
                <Icon name="help" style={{ fontSize: "var(--fs-14)" }} />
              </span>
            )}
          </>
        }
        desc={basket.desc}
      />
      {lines.length ? (
        <>
          {/* 내 종목 히어로와 같은 꼴 — 라벨·큰 숫자·타일 셋(한 달 평균 · 투자금 · 배당수익률). 한 줄 문장이던 것을 맞췄다(2026-09-15). */}
          <div className="dv-basket-sum">
            <p className="dv-hero-label">1년에 받는 배당{accountTag(mode)}</p>
            <p className="dv-basket-main">{won(net)}</p>
            <div className="hz-tx-stats dv-hero-stats dv-basket-stats">
              <div className="hz-tx-stat">
                <span className="hz-tx-stat-l">한 달 평균</span>
                <span className="hz-tx-stat-v">{won(net / 12)}</span>
              </div>
              {invest > 0 && (
                <div className="hz-tx-stat">
                  <span className="hz-tx-stat-l">투자금</span>
                  <span className="hz-tx-stat-v">{wonShort(Math.round(invest / 1e4) * 1e4)}</span>
                </div>
              )}
              {y != null && (
                <div className="hz-tx-stat">
                  <span className="hz-tx-stat-l">배당수익률</span>
                  <span className="hz-tx-stat-v">{pct(y)}</span>
                </div>
              )}
            </div>
          </div>
          <ul className="dv-basket-list">
            {lines.map((l, i) => (
              <li key={l.stock.code}>
                <button
                  type="button"
                  className="hz-row-link hz-pick dv-basket-row"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", l.stock.code);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  onClick={() => onPick(l.stock.code)}
                  title={`${l.stock.name} 내 종목에 담기`}
                >
                  <span className="dv-rank">{i + 1}</span>
                  <StockLogo code={l.stock.code} name={l.stock.name} market={l.stock.market} lazy />
                  <span className="dv-basket-name">{l.stock.name}</span>
                  <span className="dv-basket-meta">{basketMeta(basket.meta, l.stock)}</span>
                  <span className="dv-basket-shares">{l.shares.toLocaleString("ko-KR")}주</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="dv-basket-foot">
            {/* 규칙은 알약 서너 개 — 문장으로 적으니 세 줄이 됐다(2026-09-13 지적). 열 개씩이라는 건 목록이 말한다. */}
            <div className="dv-basket-rules">
              {(mode === "irp" && basket.rulesIrp ? basket.rulesIrp : mode === "pension" && basket.rulesPension ? basket.rulesPension : basket.rules).map((r) =>
                RULE_TIPS[r] ? (
                  <span key={r} className="dv-tfact hz-tip hz-tip-wide" data-tip={RULE_TIPS[r]}>
                    {r}
                  </span>
                ) : (
                  <span key={r} className="dv-tfact">
                    {r}
                  </span>
                ),
              )}
            </div>

            <button type="button" className="hz-tx-btn dv-apply" onClick={onApply}>
              내 종목에 담기
            </button>
          </div>
        </>
      ) : (
        <p className="dv-basket-none">오늘은 이 규칙에 드는 종목이 없습니다.</p>
      )}
    </section>
  );
}
