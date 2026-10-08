"use client";

// v2 성향별 바스켓(2026-10-03) — 카드 열두 장(3×4, 한 장 643px · 합쳐 2,766px)을 표 한 판 + 읽기 칸으로.
// 카더라 v2 의 '표 + 호버 읽기 칸'과 같은 얼개다: 왼쪽 표는 바스켓마다 한 줄(이름 · 수익률 · 1년에 받는 배당), 줄에 마우스를 올리거나
// 누르면 오른쪽 칸이 그 바스켓의 구성 열 종목 · 규칙 · 담기 단추를 보인다. 처음엔 첫 바스켓이 열려 있다(누르지 않아도 보이게).
// 계산은 옛 바스켓 카드(Basket.tsx BasketSheet)와 같다 — basketCodes → basketShares → computeLines.

import { useMemo, useRef, useState } from "react";
import { Module } from "../kadera/V2Modules";
import { StockLogo } from "../StockLogo";
import type { BasketLite, StockLite } from "./types";
import type { TaxMode } from "./tax";
import { won, wonShort, pct } from "./format";
import { AMOUNT_TICKS, AMOUNT_TYPED_MAX, BASKET_ROWS, RULE_TIPS, accountTag, amountTick, basketCodes, basketShares, computeLines } from "./shared";
import { basketMeta } from "./Basket";

/** 바스켓 제목 — '내 계좌 맞춤'은 고른 계좌 목록이라 꼬리를 단다(옛 카드와 같다). */
function titleOf(b: BasketLite, mode: TaxMode): string {
  if (b.altIrp && mode === "irp") return `${b.title} (IRP)`;
  if (b.altPension && mode === "pension") return `${b.title} (연금저축)`;
  if (b.altPension && mode === "exempt") return `${b.title} (비과세 종합저축)`;
  if (b.altPension && mode === "isa") return `${b.title} (ISA)`;
  // 일반 계좌 · 세전이면 목록은 ISA 것인데 '내 계좌 맞춤 (ISA)'라 적으면 내 계좌가 ISA 로 읽혔다(2026-10-04 점검).
  if (b.altPension) return "ISA 맞춤";
  return b.title;
}

/** 만원 단위 숫자를 쉼표로(1억 → 10,000). */
const manFmt = (v: number) => Math.round(v / 1e4).toLocaleString("ko-KR");

/** 투자금 — 표 머리 줄 하나(만원 입력 + 끌개). 옛 '투자금' 시트(130px · 단추 일곱 · 안내 두 문장)를 한 줄로. */
function AmountBar({ amount, onChange }: { amount: number; onChange: (v: number) => void }) {
  const [typed, setTyped] = useState<string | null>(null);
  const shown = typed ?? manFmt(amount);
  const tick = amountTick(amount);
  const onType = (raw: string) => {
    const digits = raw.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "").slice(0, 7);
    const n = Math.min(AMOUNT_TYPED_MAX, Number(digits) * 1e4);
    setTyped(digits ? manFmt(n) : "");
    if (n >= 1e4) onChange(n);
  };
  return (
    <div className="v2-dv-amt">
      {/* 주수를 어떻게 정하나는 값이 말한다 — 입력 옆 '종목당 100만원'(예전엔 22자 말풍선, 2026-10-04 점검). */}
      <label htmlFor="dv-amount-input" className="v2-dv-amt-k">
        투자금
      </label>
      <span className="v2-dv-amt-v">
        <input
          id="dv-amount-input"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={shown}
          onChange={(e) => onType(e.target.value)}
          onFocus={(e) => e.target.select()}
          onBlur={() => setTyped(null)}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          aria-label="바스켓 투자금(만원)"
          style={{ width: `${Math.max(3, shown.length + 1)}ch` }}
        />
        만원
        {amount >= 1e8 && <em>{wonShort(amount)}</em>}
        <em>종목당 {wonShort(Math.round(amount / 10))}</em>
      </span>
      <input
        type="range"
        min={0}
        max={AMOUNT_TICKS.length - 1}
        step={1}
        value={tick}
        onChange={(e) => {
          setTyped(null);
          onChange(AMOUNT_TICKS[Number(e.target.value)]);
        }}
        aria-label="바스켓 투자금"
        aria-valuetext={wonShort(amount)}
        className="dv-range v2-dv-amt-range"
        style={{ "--p": `${(tick / (AMOUNT_TICKS.length - 1)) * 100}%` } as React.CSSProperties}
      />
    </div>
  );
}

export function BasketBoard({
  baskets,
  amount,
  onAmount,
  byCode,
  mode,
  fx,
  onApply,
  onPick,
}: {
  baskets: BasketLite[];
  amount: number;
  onAmount: (v: number) => void;
  byCode: Map<string, StockLite>;
  mode: TaxMode;
  fx: number;
  onApply: (b: BasketLite) => void;
  onPick: (code: string) => void;
}) {
  // 열두 바스켓의 줄 · 합 — 투자금 · 계좌가 바뀔 때만 다시 센다(열두 × 열 종목).
  const rows = useMemo(
    () =>
      baskets.map((b) => {
        const holdings = basketShares(basketCodes(b, mode), amount, byCode, fx).map((h) => ({ id: h.code, ...h }));
        const lines = computeLines(holdings, byCode, fx, mode, mode === "gross" ? "general" : mode);
        const net = lines.reduce((s, l) => s + l.netKrw, 0);
        const gross = lines.reduce((s, l) => s + l.grossKrw, 0);
        const invest = lines.reduce((s, l) => s + (l.investKrw ?? 0), 0);
        // 수익률은 표 머리와 같은 쪽(세후면 세후 — 첫 칸 '1년에 받는 배당'과 같은 규칙).
        return { b, lines, net, invest, y: invest > 0 ? ((mode === "gross" ? gross : net) / invest) * 100 : null };
      }),
    [baskets, amount, mode, byCode, fx],
  );
  const [sel, setSel] = useState(0);
  const readRef = useRef<HTMLElement>(null);
  // 마우스가 지나가기만 하면 고르지 않는다 — 담기 단추로 가는 길에 지나간 줄이 골라져 다른 바스켓이 담겼다(2026-10-08 마지막 점검).
  const hoverT = useRef<number | undefined>(undefined);
  const cur = rows[sel] ?? rows[0];
  if (!cur) return null;
  const rules = mode === "irp" && cur.b.rulesIrp ? cur.b.rulesIrp : mode === "pension" && cur.b.rulesPension ? cur.b.rulesPension : cur.b.rules;
  const meta = (st: Parameters<typeof basketMeta>[1]) => basketMeta(cur.b.meta, st);
  return (
    <div className="v2-dv-bk">
      {/* 근거는 '투자금 기준' — 표는 입력한 투자금으로 환산한 값이라 읽기 칸 바닥(실제로 담기는 금액)과 숫자가 갈렸다(2026-10-05 점검).
          '1년에 받는 배당'은 바로 아래 열 머리와 같은 말이라 뺐다. */}
      <Module title="성향별 바스켓" meta={`${wonShort(amount)} 기준${mode === "gross" ? " · 세전" : ` · 세후${accountTag(mode)}`}`} className="v2-dv-bk-list">
        <AmountBar amount={amount} onChange={onAmount} />
        <div className="v2-dv-bk-th" aria-hidden="true">
          <span>바스켓</span>
          <span>{mode === "gross" ? "배당수익률" : "세후 수익률"}</span>
          <span>1년에 받는 배당</span>
        </div>
        <div className="v2-dv-bk-rows" role="listbox" aria-label="성향별 바스켓">
          {BASKET_ROWS.map((cap, gi) => (
            <div key={cap} className="v2-dv-bk-group" role="group" aria-label={cap}>
              <span className="v2-dv-bk-cap">{cap}</span>
              {rows.slice(gi * 3, gi * 3 + 3).map((r, k) => {
                const i = gi * 3 + k;
                return (
                  <button
                    key={r.b.key}
                    type="button"
                    role="option"
                    aria-selected={sel === i}
                    className={`v2-dv-bk-row${sel === i ? " is-on" : ""}`}
                    onMouseMove={() => {
                      window.clearTimeout(hoverT.current);
                      hoverT.current = window.setTimeout(() => setSel(i), 120);
                    }}
                    onMouseLeave={() => window.clearTimeout(hoverT.current)}
                    onFocus={() => setSel(i)}
                    onClick={() => {
                      setSel(i);
                      // 좁은 폭에선 읽기 칸이 표 아래로 내려간다 — 보이는 데까지만 올린다(넓으면 이미 보여 그대로).
                      readRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
                    }}
                  >
                    <span className="v2-dv-bk-name">{titleOf(r.b, mode)}</span>
                    <span className="v2-dv-bk-num">{r.y != null ? pct(r.y) : "없음"}</span>
                    {/* 입력한 투자금 기준으로 맞춘 값 — 1주가 비싸 내림으로 잘리면 실제 담긴 돈이 바스켓마다 854만~988만원이라 줄끼리 못 견줬다
                        (2026-10-04 점검). 실제 값(담긴 돈 · 받는 돈)은 오른쪽 읽기 칸 바닥에 그대로 있다. */}
                    <span className="v2-dv-bk-num is-strong">{r.lines.length && r.invest > 0 ? won((r.net * amount) / r.invest) : "없음"}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </Module>

      <section ref={readRef} className="v2-mod v2-dv-bk-read" aria-label={`${cur.b.title} 구성`}>
        <header className="v2-mod-head">
          <h2>{titleOf(cur.b, mode)}</h2>
          <span className="v2-mod-meta">{cur.b.desc}</span>
        </header>
        {cur.lines.length ? (
          <div className="v2-md-body">
            <div className="v2-dv-bk-rules">
              {rules.map((r) =>
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
              {/* 주의 — 머리의 물음표 말풍선이던 것을 규칙 줄 끝 붉은 알약으로(2026-10-04 "헬프 툴팁이 필요하면 심플하지 않다"). */}
              {cur.b.caution && <span className="dv-tfact dv-tfact-warn">{cur.b.caution}</span>}
            </div>
            <ol className="v2-dv-bk-list-st">
              {cur.lines.map((l, i) => (
                <li key={l.stock.code}>
                  <button
                    type="button"
                    className="v2-dv-bk-st"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", l.stock.code);
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    onClick={() => onPick(l.stock.code)}
                    title={`${l.stock.name} 내 종목에 담기`}
                  >
                    <span className="v2-dv-bk-rank">{i + 1}</span>
                    <StockLogo code={l.stock.code} name={l.stock.name} market={l.stock.market} size={20} lazy />
                    {/* 이름 위 · 고른 까닭(15년 넘게 · 70년 연속 늘림) 아래 두 줄, 주 수는 줄 오른쪽 끝(2026-10-04). 까닭이 주 수 바로 앞에
                        오른쪽 정렬로 붙어 있을 땐 '15년 넘게 5주'가 한 덩어리로 읽혔다. */}
                    <span className="v2-dv-bk-stx">
                      <span className="v2-dv-bk-stn">{l.stock.name}</span>
                      {meta(l.stock) && <span className="v2-dv-bk-stm">{meta(l.stock)}</span>}
                    </span>
                    <span className="v2-dv-bk-sts">{l.shares.toLocaleString("ko-KR")}주</span>
                  </button>
                </li>
              ))}
            </ol>
            <div className="v2-dv-bk-foot">
              <span>
                {/* 표와 같은 단위(1년) — '한 달'이면 표의 1년 값과 견줄 수 없었다(2026-10-05 점검). */}
                실제 <b>{wonShort(Math.round(cur.invest / 1e4) * 1e4)}</b> · 1년 <b>{won(cur.net)}</b>
              </span>
              <button type="button" className="v2-dv-cta" onClick={() => onApply(cur.b)}>
                내 종목에 담기
              </button>
            </div>
          </div>
        ) : (
          <p className="v2-empty">오늘은 이 규칙에 드는 종목이 없습니다.</p>
        )}
      </section>
    </div>
  );
}
