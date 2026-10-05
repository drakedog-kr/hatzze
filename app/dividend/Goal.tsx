"use client";

// 목표까지. DividendCalculator.tsx 에서 옮겨 왔다(store.ts 머리말 참고). 투자금 조절은 바스켓 표 머리(V2Baskets.tsx AmountBar)로 갔다.

import { Progress, ProgressIndicator, ProgressTrack } from "@/components/ui/progress";
import { Module } from "../kadera/V2Modules";
import { won, wonShort } from "./format";
import { GOAL_PRESETS_MAN, GOAL_MAX_MONTHS } from "./shared";

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

/**
 * 목표까지 — 한 줄 네 토막(v2, 2026-10-03). 예전엔 세 층 452px(목표 칩 · 막대 · 타일 여섯)이었다.
 *   목표      한 달 배당 목표(만원) — 고르기 다섯 + 직접 넣기
 *   지금      지금 한 달 배당 · 목표의 몇 % 막대
 *   필요한 돈 목표에 필요한 투자금 · 더 필요한 돈
 *   걸리는 때 매달 얼마씩 더 넣고 받은 배당을 다시 담으면 몇 년 뒤(지금 담은 종목의 세후 수익률 그대로)
 * 5 · 10 · 20년 뒤 타일은 뺐다 — 걸리는 때가 같은 셈을 한 줄로 말한다.
 */
export function GoalBox({
  invest,
  net,
  skipped,
  goalMan,
  addMan,
  onGoal,
  onAdd,
}: {
  /** 투자금과 그 투자금이 내는 1년 세후 배당 — 종가 없는 줄은 둘 다에서 뺀 값(calc.ts 의 goalBasis). */
  invest: number;
  net: number;
  /** 그렇게 뺀, 배당 있는 줄 수. 있으면 '지금'이 위 한 달 평균보다 적은 까닭을 근거 글자에 적는다. */
  skipped: number;
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
  const monthlyNow = net / 12;
  const years = months != null ? `${Math.floor(months / 12) ? `${Math.floor(months / 12)}년 ` : ""}${months % 12 ? `${months % 12}개월` : ""}`.trim() || "이번 달" : null;
  const manInput = (value: number, onChange: (v: number) => void, label: string, width: number) => (
    <input
      type="number"
      inputMode="numeric"
      min={0}
      step={10}
      value={value}
      onChange={(e) => onChange(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
      aria-label={label}
      className="dv-goal-inline"
      style={{ width }}
    />
  );
  const roundMan = (v: number) => wonShort(Math.round(v / 1e4) * 1e4);
  const progress = goal > 0 ? Math.min(100, (monthlyNow / goal) * 100) : 0;
  const reached = need != null && invest >= need;
  const remaining = need != null ? Math.max(0, need - invest) : 0;
  return (
    <Module
      title="목표까지"
      // 가정은 숫자로 — '지금 담은 종목 수익률 그대로 · 배당은 다시 담음'은 문장이었다(2026-10-05 점검). net 은 세후다(goalBasis).
      meta={`세후 ${rate > 0 ? `${(rate * 100).toFixed(2)}%` : "수익률 없음"} · 배당 재투자${skipped > 0 ? ` · 종가 없는 ${skipped}종목 뺌` : ""}`}
      className="v2-dv-goal"
    >
      <div className="v2-dv-goal-row">
        <div className="v2-dv-goal-cell">
          <span className="v2-dv-goal-k">한 달 배당 목표</span>
          <div className="v2-dv-goal-presets" role="group" aria-label="한 달 배당 목표">
            {GOAL_PRESETS_MAN.map((v) => (
              <button key={v} type="button" aria-pressed={goalMan === v} onClick={() => onGoal(v)}>
                {v.toLocaleString("ko-KR")}만
              </button>
            ))}
            <span className="v2-dv-goal-own">
              {manInput(goalMan, onGoal, "한 달 배당 목표(만원)", 64)}만원
            </span>
          </div>
        </div>
        <div className="v2-dv-goal-cell">
          <span className="v2-dv-goal-k">지금 한 달</span>
          <b className="v2-dv-goal-v">{won(monthlyNow)}</b>
          {/* shadcn Progress(Base UI) — '진행률 막대, 12%'로 읽힌다. */}
          <Progress value={progress} aria-label="한 달 배당 목표 달성" getAriaValueText={() => `목표 한 달 ${wonShort(goal)} 가운데 지금 ${won(monthlyNow)}, ${Math.round(progress)}%`}>
            <ProgressTrack className="dv-goal-bar">
              <ProgressIndicator className="dv-goal-fill" />
            </ProgressTrack>
          </Progress>
          <span className="v2-dv-goal-s">{goal > 0 ? (reached ? "목표를 넘었습니다" : `목표의 ${Math.round(progress)}%`) : "목표를 고르십시오"}</span>
        </div>
        <div className="v2-dv-goal-cell">
          <span className="v2-dv-goal-k">필요한 투자금</span>
          <b className="v2-dv-goal-v">{need != null && goal > 0 ? roundMan(need) : "없음"}</b>
          <span className="v2-dv-goal-s">{need != null && goal > 0 ? (reached ? "더 필요한 돈 없음" : `지금보다 ${roundMan(remaining)} 더`) : ""}</span>
        </div>
        <div className="v2-dv-goal-cell">
          <span className="v2-dv-goal-k">걸리는 기간</span>
          <b className="v2-dv-goal-v">{reached ? "이미 넘음" : months == null ? `${GOAL_MAX_MONTHS / 12}년 넘게` : years}</b>
          <span className="v2-dv-goal-s">
            매달 {manInput(addMan, onAdd, "매달 더 넣는 돈(만원)", 56)}만원씩 더 넣으면
          </span>
        </div>
      </div>
    </Module>
  );
}
