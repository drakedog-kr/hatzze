"use client";

// v2 MDD 의 새 모듈 넷(2026-10-03 "껍데기만 바꾸면 v2 가 아니다" → 판정표 1단계).
//  - 낙폭 요약(둘째 줄 셋째 칸) — 옛 '이 하락의 맥락' 세 문단을 이름표 줄로 다시 짰다(문장은 shared.ts mddSummary).
//  - 역대 하락 사례 — 옛 'Top 5' · 리스크 '하락 vs 회복 속도' · '혼자 빠지나, 같이 빠지나' · 성격 타일이 같은 사건을 네 군데서 말하던 것을 표 하나로.
//  - 회복까지 — 옛 '회복까지 걸린 기간' + '이 하락의 성격'(급락형 · 완만형의 회복 중앙값). 깊이 분포 막대는 사례 표와 겹쳐 뺐다.
//  - 해마다 — 옛 리스크 '낙폭 대비 보상'. 최근 다섯 해 + '전체보기' 팝업 대신 조회 기간의 해를 다 펼친다(누르지 않고 보이게).

import { CHARACTER_SPLIT_DAYS } from "@/lib/mdd";
import type { MddAnalysis, RiskProfile as RiskProfileData } from "@/lib/mdd";

import { Module } from "../kadera/V2Modules";
import { RecoveryRange } from "./sheets";
import { benchName, fmtDayCount, fmtDur, fmtPct, fmtYm, mddSummary } from "./shared";
import type { MddResult } from "./shared";

const tone = (v: number | null | undefined) => (v === null || v === undefined || v === 0 ? "" : v > 0 ? " is-up" : " is-down");

/* ── 낙폭 요약 ─────────────────────────────────────────────────── */
/**
 * 시장 브리핑 '오늘의 브리핑'과 같은 꼴(.v2-brief3 — 이름표 칸 · 문장 칸, 줄은 남는 높이를 고르게 받는다).
 * 문장은 계산으로 만든다 — LLM 이 아니라 AI 표시를 안 붙인다.
 */
export function SummaryModule({ data }: { data: MddResult }) {
  const rows = mddSummary(data);
  return (
    <Module title="낙폭 요약" className="v2-md-sum">
      <dl className="v2-brief3">
        {rows.map((r) => (
          <div key={r.key} className="v2-brief3-row">
            <dt>{r.label}</dt>
            <dd>{r.parts.map((p, i) => (typeof p === "string" ? p : <b key={i}>{p.b}</b>))}</dd>
          </div>
        ))}
      </dl>
    </Module>
  );
}

/* ── 역대 하락 사례 ─────────────────────────────────────────────── */
/**
 * 사건마다 한 줄 — 구간 · 깊이 · 같은 기간 시장 · 빠진 기간 · 되찾은 기간 · 유형. 깊은 순(lib/mdd.ts topDrawdowns).
 * 시장 칸은 고점→저점 사이 지수 등락이다(api/mdd 가 채운다). 유형은 고점→저점이 CHARACTER_SPLIT_DAYS 이하면 급락.
 */
export function CasesTable({ a, periodLabel, market }: { a: MddAnalysis; periodLabel: string; market: string | null }) {
  const bench = benchName(market);
  return (
    <Module title="역대 하락 사례" meta={`${periodLabel} · 깊은 순`} className="v2-md-cases-mod">
      <div className="v2-md-cases">
        <div className="v2-md-case v2-md-case-th" aria-hidden="true">
          <span>구간</span>
          <span>깊이</span>
          <span>{bench}</span>
          <span>빠진 기간</span>
          <span>되찾은 기간</span>
          <span>유형</span>
        </div>
        <ol>
          {a.topDrawdowns.map((e) => (
            <li key={e.peakDate} className={`v2-md-case${e.recovered ? "" : " is-now"}`}>
              <span className="v2-md-case-span">
                {fmtYm(e.peakDate)} ~ {e.recovered ? fmtYm(e.recoveryDate!) : <b>진행 중</b>}
              </span>
              <span className="is-num is-down">{fmtPct(e.depth)}</span>
              <span className={`is-num${tone(e.market)}`}>{e.market === null || e.market === undefined ? "없음" : fmtPct(e.market)}</span>
              <span className="is-num">{fmtDur(e.troughDays)}</span>
              {/* 진행 중이면 저점 이후 며칠째인지 — '진행 중'은 구간 칸이 이미 말한다. */}
              <span className="is-num">{e.recovered ? fmtDur(e.days - e.troughDays) : <em>{fmtDayCount(e.days - e.troughDays)}째</em>}</span>
              <span className="v2-md-case-kind">{e.troughDays <= CHARACTER_SPLIT_DAYS ? "급락" : "완만"}</span>
            </li>
          ))}
        </ol>
      </div>
    </Module>
  );
}

/* ── 회복까지 ───────────────────────────────────────────────────── */
/**
 * 지금만큼(또는 더) 빠졌던 하락이 고점을 되찾기까지 걸린 기간 — 중앙값 · 최단~최장 · 그중 몇 번 되찾았나.
 * 아래 두 줄은 빠진 속도별(급락형 · 완만형) 회복 중앙값이고 지금 하락이 어느 쪽인지 꼬리표를 단다(옛 '이 하락의 성격').
 */
export function RecoveryModule({ a }: { a: MddAnalysis }) {
  const r = a.recovery!;
  const ch = a.character;
  const sincePeak = Math.round((Date.parse(a.asOf) - Date.parse(a.athDate)) / 86_400_000);
  const hasRange = r.recoveredCount >= 2 && r.minDays !== null && r.maxDays !== null && r.maxDays > r.minDays;
  const kinds = ch
    ? ([
        ["fast", "급락형", ch.fast],
        ["slow", "완만형", ch.slow],
      ] as const)
    : [];
  return (
    <Module title="회복까지" meta={`이만큼 빠졌던 ${r.similarCount}번 중 ${r.recoveredCount}번 되찾음`} className="v2-md-rec">
      <div className="v2-md-body">
        <span className="v2-card-val is-big">
          {r.recoveredCount > 0 ? (
            <>
              <b>{fmtDur(r.medianDays!)}</b>
              <span className="v2-reason">중앙값</span>
            </>
          ) : (
            <>
              <b className="is-down">{fmtDayCount(sincePeak)}째</b>
              <span className="v2-reason">되찾은 전례 없음</span>
            </>
          )}
        </span>
        {hasRange && <RecoveryRange min={r.minDays!} median={r.medianDays!} max={r.maxDays!} />}
        {kinds.some(([, , k]) => k) && (
          <div className="v2-md-kinds">
            {kinds.map(([key, label, k]) => (
              <div key={key} className={`v2-md-kind${ch!.currentClass === key ? " is-now" : ""}`}>
                <span className="v2-md-kind-name">
                  {label}
                  {ch!.currentClass === key && <span className="v2-badge">지금</span>}
                </span>
                <span className="v2-md-kind-n">{k ? `${k.count}번` : "없음"}</span>
                <span className="v2-md-kind-v">{k ? fmtDur(k.medianRecovery) : ""}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Module>
  );
}

/* ── 해마다 ─────────────────────────────────────────────────────── */
/**
 * 조회 기간의 해마다 주가 수익(전해 마지막 종가 대비)과 그 해 안의 최대 낙폭. 머리 숫자는 복리 연평균(CAGR · 배당 제외)이다.
 * ⚠️ 해는 조회 기간만큼 자른다 — yearlyStats 는 거래일 20일 넘는 해를 다 세서 10년 조회에 11개가 나온다(옛 RiskProfile 과 같다).
 */
export function YearsModule({ r, periodLabel }: { r: RiskProfileData; periodLabel: string }) {
  const yrs = Math.max(1, Math.round(r.years));
  const years = r.yearly.slice(-yrs);
  const avgMdd = years.length ? years.reduce((s, y) => s + y.mdd, 0) / years.length : 0;
  return (
    <Module title="해마다" meta={`${periodLabel} · 주가만(배당 제외)`} className="v2-md-years">
      <div className="v2-md-body">
        <span className="v2-card-val is-big">
          <b className={tone(r.annualReturn).trim()}>연 {fmtPct(r.annualReturn)}</b>
          <span className="v2-reason">복리 수익</span>
          <span className="v2-md-aside">
            해마다 낙폭 평균 <b className="is-down">{fmtPct(avgMdd)}</b>
          </span>
        </span>
        <div className="v2-md-yrs">
          <div className="v2-md-yr is-head" aria-hidden="true">
            <span>연도</span>
            <span>수익</span>
            <span>낙폭</span>
          </div>
          {years.map((y) => (
            <div key={y.year} className="v2-md-yr">
              <span>{y.year}</span>
              <span className={`is-num${tone(y.ret)}`}>{fmtPct(y.ret)}</span>
              <span className="is-num is-low">{fmtPct(y.mdd)}</span>
            </div>
          ))}
        </div>
      </div>
    </Module>
  );
}
