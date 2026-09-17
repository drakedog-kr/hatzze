"use client";

// 목표 배당과 투자금 조절. DividendCalculator.tsx 에서 그대로 옮겨 왔다(store.ts 머리말 참고).

import { useState } from "react";
import { Icon } from "../ui";
import { won, wonShort } from "./format";
import { GOAL_PRESETS_MAN, GOAL_MAX_MONTHS, AMOUNT_TICKS, AMOUNT_QUICK, AMOUNT_TYPED_MAX, amountTick } from "./shared";

/**
 * 달마다 굴린다: 이달 배당 = 자산 × 수익률 ÷ 12, 배당과 매달 넣는 돈을 자산에 더한다. 배당이 해마다 g% 늘면
 * 수익률(자산 대비)이 그만큼 자란다고 본다 — 주가는 그대로라는 가정이라, 배당 성장은 곧 수익률 성장이다.
 * 돌려주는 건 m달째 월 배당의 목록(0 = 지금). 60·120·240달째를 읽으면 5·10·20년 뒤다.
 */
function projectMonthly(invest: number, yearlyRate: number, addMonthly: number, growthPct: number, months: number): number[] {
  const out: number[] = [];
  let p = invest;
  const g = Math.pow(1 + growthPct / 100, 1 / 12);
  let r = yearlyRate;
  for (let m = 0; m <= months; m++) {
    const div = (p * r) / 12;
    out.push(div);
    p += div + addMonthly;
    r *= g;
  }
  return out;
}

function monthsToGoal(invest: number, yearlyRate: number, addMonthly: number, growthPct: number, goalMonthly: number): number | null {
  if (yearlyRate <= 0) return null;
  const path = projectMonthly(invest, yearlyRate, addMonthly, growthPct, GOAL_MAX_MONTHS);
  const m = path.findIndex((div) => div >= goalMonthly);
  return m >= 0 ? m : null;
}

export function GoalBox({
  invest,
  net,
  goalMan,
  addMan,
  onGoal,
  onAdd,
}: {
  invest: number;
  net: number;
  goalMan: number;
  addMan: number;
  onGoal: (v: number) => void;
  onAdd: (v: number) => void;
}) {
  const rate = net / invest;
  const goal = goalMan * 1e4;
  const add = addMan * 1e4;
  const need = rate > 0 ? (goal * 12) / rate : null;
  const months = goal > 0 ? monthsToGoal(invest, rate, add, 0, goal) : null;
  // 5·10·20년 뒤 한 달 배당 — 같은 셈을 240달까지 돌려 읽는다(배당 성장 0%).
  const path = rate > 0 ? projectMonthly(invest, rate, add, 0, 240) : null;
  const monthlyNow = net / 12;
  const years = months != null ? `${Math.floor(months / 12) ? `${Math.floor(months / 12)}년 ` : ""}${months % 12 ? `${months % 12}개월` : ""}`.trim() : null;
  const manInput = (value: number, onChange: (v: number) => void, label: string, opts: { step?: number; max?: number; width?: number } = {}) => (
    <input
      type="number"
      inputMode="numeric"
      min={0}
      max={opts.max}
      step={opts.step ?? 10}
      value={value}
      onChange={(e) => onChange(Math.max(0, Math.min(opts.max ?? Infinity, Math.floor(Number(e.target.value) || 0))))}
      aria-label={label}
      className="dv-goal-inline"
      style={opts.width ? { width: opts.width } : undefined}
    />
  );
  const roundMan = (v: number) => wonShort(Math.round(v / 1e4) * 1e4);
  // 막대는 목표와 같은 단위(한 달 배당)로 — "투자금 12%"보다 "한 달 13만원, 목표의 12%"가 바로 읽힌다.
  const progress = goal > 0 ? Math.min(100, (monthlyNow / goal) * 100) : 0;
  const reached = need != null && invest >= need;
  const tile = (label: string, value: string, strong = false) => (
    <div className={`hz-tx-stat${strong ? " dv-goal-tile-strong" : ""}`}>
      <span className="hz-tx-stat-l">{label}</span>
      <span className="hz-tx-stat-v">{value}</span>
    </div>
  );
  const remaining = need != null ? Math.max(0, need - invest) : 0;
  return (
    <div className="dv-goal">
      {/* 다섯 토막, 토막마다 이름표 한 줄 — 목표 · 지금 · 필요한 돈 · 목표 달성까지 · 이대로 가면. 무엇이 무엇인지
          이름표가 말하고(2026-09-15: "한 달에 XXX만원이 뭔지, 도달까지가 뭔지, 왜 늘어나는지 모르겠다"), 숫자는
          타일 모양 하나로. */}
      <div className="dv-goal-head">
        <span className="dv-cal-title">
          목표까지
          <span
            className="hz-tip hz-tip-wide dv-help"
            data-tip="지금 담은 종목의 비율(배당수익률)이 그대로 가고, 받은 배당은 다시 담고, 주가와 배당은 지금과 같다고 보고 셉니다."
            style={{ cursor: "help" }}
            aria-label="목표까지 셈법"
          >
            <Icon name="help" style={{ fontSize: 14 }} />
          </span>
        </span>
      </div>

      <div className="dv-goal-block">
        <span className="dv-goal-blabel">한 달 배당금 목표</span>
        <div className="dv-goal-presets" role="group" aria-label="한 달 배당금 목표">
          {GOAL_PRESETS_MAN.map((v) => (
            <button key={v} type="button" className={`dv-quick${goalMan === v ? " dv-quick-on" : ""}`} aria-pressed={goalMan === v} onClick={() => onGoal(v)}>
              {v.toLocaleString("ko-KR")}만원
            </button>
          ))}
          <span className="dv-goal-custom">
            {manInput(goalMan, onGoal, "한 달 배당금 목표(만원)", { width: 72 })}
            <span>만원</span>
          </span>
        </div>
      </div>

      {goal > 0 && need != null ? (
        <>
          <div className="dv-goal-block">
            <div className="dv-goal-ends">
              <span>
                지금 한 달 배당금 <b>{won(monthlyNow)}</b>
              </span>
              <span>
                목표 <b>{wonShort(goal)}</b>
              </span>
            </div>
            <div className="dv-goal-bar" role="img" aria-label={`목표 한 달 ${wonShort(goal)} 가운데 지금 ${won(monthlyNow)}, ${Math.round(progress)}%`}>
              <span className="dv-goal-fill" style={{ width: `${Math.max(2, progress)}%` }} />
            </div>
            <span className="dv-goal-bnote">{reached ? "목표를 이미 넘었습니다" : `목표의 ${Math.round(progress)}%입니다`}</span>
          </div>

          <div className="dv-goal-block">
            <span className="dv-goal-blabel">필요한 돈</span>
            <div className="hz-tx-stats dv-goal-stats">
              {tile("목표에 필요한 투자금", roundMan(need))}
              {tile("지금 투자금", roundMan(invest))}
              {tile("더 필요한 돈", reached ? "없음" : roundMan(remaining))}
            </div>
          </div>

          {!reached && (
            <div className="dv-goal-block">
              <span className="dv-goal-blabel">목표 달성까지</span>
              <div className="dv-goal-answer">
                <span className="dv-goal-aval">{months == null ? `${GOAL_MAX_MONTHS / 12}년 넘게 걸립니다` : years}</span>
                <span className="dv-goal-acond">
                  매달 {manInput(addMan, onAdd, "매달 더 넣는 돈(만원)", { width: 60 })}만원씩 더 넣고 받은 배당을 다시 담을 때
                </span>
              </div>
            </div>
          )}

          {path && (
            <div className="dv-goal-block">
              <span className="dv-goal-blabel">이대로 가면 한 달 배당금</span>
              <div className="hz-tx-stats dv-goal-stats">
                {tile("5년 뒤", roundMan(path[60]))}
                {tile("10년 뒤", roundMan(path[120]))}
                {tile("20년 뒤", roundMan(path[240]))}
              </div>
            </div>
          )}
        </>
      ) : (
        <p className="dv-goal-out">{goal <= 0 ? "목표를 고르면 얼마가 필요한지 셉니다." : "배당이 0이라 셀 수 없습니다."}</p>
      )}
    </div>
  );
}

/** 만원 단위 숫자를 쉼표로. 적는 칸이 이 꼴로 보인다(1억 → 10,000). */
const manFmt = (v: number) => Math.round(v / 1e4).toLocaleString("ko-KR");

export function AmountControl({ amount, onChange }: { amount: number; onChange: (v: number) => void }) {
  // 적는 칸은 만원 단위. 치는 동안의 문자열을 따로 들어야 "1,00" 같은 중간 상태에서 값이 튀지 않고,
  // 칸을 떠나면 다시 금액에서 그린다. 치는 대로 바로 반영해서 아래 바스켓 주수가 같이 움직인다.
  const [typed, setTyped] = useState<string | null>(null);
  const shown = typed ?? manFmt(amount);
  const tick = amountTick(amount);
  const onType = (raw: string) => {
    const digits = raw.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "").slice(0, 7);
    const n = Math.min(AMOUNT_TYPED_MAX, Number(digits) * 1e4);
    // 상한을 넘겨 치면 칸에도 바로 상한을 보인다 — 칸은 200,000,000 인데 옆 억 표기는 100억이면 어느 쪽이 맞는지 모른다.
    setTyped(digits ? manFmt(n) : "");
    if (n >= 1e4) onChange(n);
  };
  return (
    <div className="hz-sheet dv-amount">
      <div className="dv-amount-head">
        <label className="dv-amount-label" htmlFor="dv-amount-input">투자금</label>
        <span className="dv-amount-val">
          <input
            id="dv-amount-input"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            className="dv-amount-input"
            value={shown}
            onChange={(e) => onType(e.target.value)}
            onFocus={(e) => e.target.select()}
            onBlur={() => setTyped(null)}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            aria-label="바스켓 투자금(만원)"
            style={{ width: `${Math.max(3, shown.length + 1)}ch` }}
          />
          <span className="dv-amount-unit">만원</span>
          {/* 1억부터는 만원 숫자만으로 자릿수를 세야 해서 억 단위로 한 번 더 적는다(50,000만원 → 5억원). */}
          {amount >= 1e8 && <span className="dv-amount-echo">{wonShort(amount)}</span>}
        </span>
        <span className="dv-amount-quick">
          {AMOUNT_QUICK.map((v) => (
            <button key={v} type="button" className={`dv-quick${amount === v ? " dv-quick-on" : ""}`} onClick={() => { setTyped(null); onChange(v); }} aria-pressed={amount === v}>
              {wonShort(v)}
            </button>
          ))}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={AMOUNT_TICKS.length - 1}
        step={1}
        value={tick}
        onChange={(e) => { setTyped(null); onChange(AMOUNT_TICKS[Number(e.target.value)]); }}
        aria-label="바스켓 투자금"
        aria-valuetext={wonShort(amount)}
        className="dv-range"
        // 채운 만큼을 트랙 색으로 — 브라우저 기본 슬라이더는 옛 모양이라(2026-09-15 지적) 트랙·손잡이를 직접 그린다.
        style={{ "--p": `${(tick / (AMOUNT_TICKS.length - 1)) * 100}%` } as React.CSSProperties}
      />
      <p className="dv-amount-note">이 돈을 열 종목에 같은 금액씩 나눠 담으면 종목마다 몇 주가 되는지로 계산합니다. 한 주가 몫보다 비싸면 1주로 잡아 투자금이 조금 넘을 수 있습니다.</p>
    </div>
  );
}
