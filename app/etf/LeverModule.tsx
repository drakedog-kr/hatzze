"use client";

import Link from "next/link";
import { useState } from "react";

import type { EtfLeverRow } from "@/lib/etf-extras";

import { Module } from "../kadera/V2Modules";
import { etfHref } from "./copy";
import { Facts } from "./Facts";
import { MoreRow, useStepRows } from "./MoreRow";
import { fmtPct, pctTone } from "./format";

const multLabel = (m: number) => (m === -1 ? "인버스" : m < 0 ? `인버스 ${-m}배` : `${m}배`);

/** 실제 배수(ETF 수익률 ÷ 지수 수익률) — 지수가 거의 안 움직였으면 나눈 값이 튀어 싣지 않는다(상세 브리핑 app/etf/[code]/brief.ts 와 같은 0.5%). */
const realMult = (r: EtfLeverRow) => (Math.abs(r.idx) < 0.5 ? null : r.actual / r.idx);

/**
 * 레버리지 · 인버스 — 지수가 움직인 사이 ETF 가 실제로 몇 배 움직였나 표 한 칸. 커버드콜 수익률과 한 줄에 반씩 선다(2026-10-12 · 파킹형을 걷은 자리).
 * 1달 · 1년을 머리의 세그먼트로 바꾼다(처음은 1년 — 하루 배수가 쌓여 벌어지는 차이가 1년에서 크다. 2026-10-08 코스닥150 지수 +8.9% ·
 * KODEX 코스닥150레버리지 −17.5% · 실제 배수 −2.0배).
 * 칸 = 지수 · 수익률 · 실제 배수. '지수 × 배수' 칸은 걷었다 — 1년 인버스 2배가 −235.0% 처럼 나올 수 없는 값이 섰다(2026-10-12 "디자인 이상하다").
 * 줄 이름(지수 · 배수)에 목표 배수가 있어 실제 배수와 바로 맞댄다. ETF 이름은 줄 title 에 남긴다.
 * 요약 칸은 표에서 센 값만 — 한때 셋째 칸이던 '레버리지 쪽 돈이 큰 곳'(기초자산별 5거래일 거래대금)은 표에 없는 숫자에 기간을 바꿔도
 * 그대로라 걷었다(같은 날 그 셈도 lib/etf-flow.ts 에서 걷었다).
 * 지수 이름과 배수가 같은 ETF 는 순자산이 가장 큰 하나만 싣고(lib/etf-extras.ts) 순자산 차례로 다섯 줄을 편다 — 나머지는 마지막 줄 단추로
 * 열 줄씩 더 편다(MoreRow.tsx · 한때 여덟 줄에서 끊어 1년 21개 중 열셋을 볼 길이 없었다 · 2026-10-12). 세그먼트는 머리에 둔다 — 표 위 줄을 따로 두면
 * 옆 커버드콜과 줄 높이가 갈린다. 줄 꼴은 왼쪽 표 한 벌(.v2-etf-L).
 */
export function LeverModule({ year, month, className }: { year: EtfLeverRow[]; month: EtfLeverRow[]; className?: string }) {
  // 세그먼트 차례는 짧은 기간부터(1달 · 1년 — 'ETF 자금 흐름' · 옆 커버드콜 카드와 같다), 처음 고른 것은 1년(2026-10-12).
  const periods = [
    { key: "month", label: "1달", rows: month },
    { key: "year", label: "1년", rows: year },
  ].filter((p) => p.rows.length);
  const [sel, setSel] = useState(year.length ? "year" : "month");
  const cur = periods.find((p) => p.key === sel) ?? periods[0];
  const rows = cur?.rows ?? [];
  const more = useStepRows(rows.length);
  // 요약 칸 — 레버리지 · 인버스 각각 목표 배수보다 덜 움직인 상품, 목표와 거꾸로 간 상품. 표에 적힌 한 자리 배수로 센다 —
  // 1.96배를 '덜 간' 쪽에 세면 표의 '2.0배'와 말이 어긋난다. 실제 배수가 없는 줄(지수가 거의 안 움직임)은 세지 않는다.
  const shown = rows.map((r) => ({ r, m: realMult(r) })).filter((x): x is { r: EtfLeverRow; m: number } => x.m != null);
  const less = (list: typeof shown) => list.filter((x) => Math.abs(Number(x.m.toFixed(1))) < Math.abs(x.r.mult)).length;
  const long = shown.filter((x) => x.r.mult > 0);
  const short = shown.filter((x) => x.r.mult < 0);
  const flipped = shown.filter((x) => x.m * x.r.mult < 0).length;
  return (
    <Module
      title="레버리지·인버스"
      className={className}
      aside={
        periods.length > 1 ? (
          <span className="hz-seg hz-seg-hover" role="group" aria-label="기간">
            {periods.map((p) => (
              <button key={p.key} type="button" aria-pressed={p.key === sel} onClick={() => setSel(p.key)} data-ga="etf_lever_period">
                {p.label}
              </button>
            ))}
          </span>
        ) : undefined
      }
    >
      <Facts
        items={[
          { k: "배수에 못 미친 레버리지", v: long.length ? `${less(long)} / ${long.length}개` : "없음" },
          { k: "배수에 못 미친 인버스", v: short.length ? `${less(short)} / ${short.length}개` : "없음" },
          { k: "반대로 움직인 상품", v: `${flipped}개` },
        ]}
      />
      {rows.length ? (
        <div className="v2-etf-list">
          <div className="v2-etf-row v2-etf-L v2-th" style={{ ["--n" as string]: 3 }}>
            <span />
            <span>지수 · 배수</span>
            <span>기초 지수</span>
            <span>수익률</span>
            <span>실제 배수</span>
          </div>
          <ol className="v2-etf-body">
            {rows.slice(0, more.shown).map((r, i) => {
              const m = realMult(r);
              return (
                <li key={r.code}>
                  <Link href={etfHref(r.code)} className="v2-etf-row v2-etf-L" style={{ ["--n" as string]: 3 }} title={r.name} data-ga="etf_detail_click">
                    <span className="v2-td-rank">{i + 1}</span>
                    <span className="v2-etf-name">
                      <span className="v2-td-name">
                        {r.index} {multLabel(r.mult)}
                      </span>
                    </span>
                    <span className={`v2-td-num${pctTone(r.idx)}`}>{fmtPct(r.idx)}</span>
                    <span className={`v2-td-num${pctTone(r.actual)}`}>{fmtPct(r.actual)}</span>
                    {m == null ? <span className="v2-td-num is-none">없음</span> : <span className="v2-td-num">{m.toFixed(1)}배</span>}
                  </Link>
                </li>
              );
            })}
            <MoreRow rows={more} ga="etf_lever_more" />
          </ol>
        </div>
      ) : (
        <p className="v2-empty">레버리지 수익률 자료가 없습니다.</p>
      )}
    </Module>
  );
}
