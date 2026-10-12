"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { EtfCoveredRow } from "@/lib/etf-extras";

import { Module } from "../kadera/V2Modules";
import { etfHref } from "./copy";
import { Facts } from "./Facts";
import { MoreRow, useStepRows } from "./MoreRow";
import { fmtPct, fmtSize, pctTone } from "./format";
import { SortHead } from "./SortHead";

/**
 * ETF 자금 흐름 화면 아래쪽 모듈 — 커버드콜(괴리율 · 작은 ETF 는 2026-10-12 걷었다). 레버리지는 1년 · 1달을 바꾸는 세그먼트가 있어 따로 둔다
 * (LeverModule.tsx). 자료와 셈은 lib/etf-extras.ts 머리말.
 *
 * 줄 꼴은 이 화면 표 한 벌(.v2-etf-L · v2.css) — 순위 · 이름 한 줄 · 숫자 칸. ⛔ 무엇을 사라고 권하지 않는다 — 사실만 나란히.
 * 이름 아래 곁말(순자산 · 분배 횟수 · 거래대금 · 유형)과 요약 칸 곁말은 걷었다(2026-10-12 "짜잘한 설명이 많다" — 다른 화면 표는 이름 한 줄).
 */

type Key = "dist" | "price" | "total";

/**
 * 커버드콜 수익률 카드 — 머리 오른쪽 세그먼트로 1달 · 1년을 고른다(처음 1년 · 옆 레버리지 카드와 같은 자리 · 같은 차례 —
 * 2026-10-12 "두 개 다 우측 상단에 1달 1년 옵션 · 1년 기본"). 차례는 'ETF 자금 흐름' 카드처럼 짧은 기간부터.
 * 1년이 없는 날(스냅숏 전)은 1달만 서고 세그먼트를 안 그린다.
 */
export function CoveredModule({ year, month, className }: { year: EtfCoveredRow[]; month: EtfCoveredRow[]; className?: string }) {
  const periods = [
    { key: "month", label: "1달", rows: month },
    { key: "year", label: "1년", rows: year },
  ].filter((p) => p.rows.length);
  const [sel, setSel] = useState(year.length ? "year" : "month");
  const cur = periods.find((p) => p.key === sel) ?? periods[0];
  return (
    <Module
      title="커버드콜 수익률"
      className={className}
      aside={
        periods.length > 1 ? (
          <span className="hz-seg hz-seg-hover" role="group" aria-label="기간">
            {periods.map((p) => (
              <button key={p.key} type="button" aria-pressed={p.key === cur?.key} onClick={() => setSel(p.key)} data-ga="etf_covered_period">
                {p.label}
              </button>
            ))}
          </span>
        ) : undefined
      }
    >
      {cur ? <CoveredRows rows={cur.rows} /> : <p className="v2-empty">커버드콜 수익률 자료가 없습니다.</p>}
    </Module>
  );
}

/**
 * 커버드콜 — 기간(1년 · 1달) 동안 받은 분배금 · 가격 변화 · 둘의 합계 · 같은 지수 기초 ETF 의 합. 합계가 기초 지수에 못 미치면 옵션을 팔아 놓친
 * 상승이다(2026-10-08 KODEX 200타겟위클리커버드콜 +95.7% · KODEX 200 +123.6%). 분배금을 받은 만큼 가격이 빠졌는지는 앞 두 칸이 말한다
 * (KODEX 미국나스닥100데일리커버드콜OTM 분배금 +20.3% · 가격 −10.0%). 막대는 걷었다 — 표 안 그래픽이 여덟 가지라 짜임새가 없었다(2026-10-11).
 *
 * 처음은 분배금 큰 차례 — 커버드콜을 두고 가장 많이 묻는 것이 '분배금을 얼마나 주나'이고(기사 · 블로그의 '배당순위'), 그 옆 가격 · 합계 칸이
 * 그 대가를 말한다. 한때 순자산 차례였다 — 순자산 칸이 없어 순위가 무엇의 차례인지 안 보였다(2026-10-12). 분배금 · 가격 · 합계 머리를 눌러
 * 줄 세운다. 요약 칸은 펴진 줄이 아니라 1년 넘은 커버드콜 전부로 센다(줄 세우기 · 펼치기와 상관없이 같은 값).
 * '분배금 포함' 머리는 '합계'로 바꿨다 — 왼쪽 두 칸을 더한 값이라는 게 이름에서 바로 읽힌다(2026-10-12).
 */
export function CoveredRows({ rows }: { rows: EtfCoveredRow[] }) {
  const [key, setKey] = useState<Key>("dist");
  const [desc, setDesc] = useState(true);
  const sorted = useMemo(() => [...rows].sort((a, b) => (desc ? b[key] - a[key] : a[key] - b[key])), [rows, key, desc]);
  // 다섯 줄 + '10개 더 보기' — 옆 레버리지 카드와 같은 수라 두 카드 키가 같다(MoreRow.tsx).
  const more = useStepRows(rows.length);
  const withBase = rows.filter((r) => r.base);
  const behind = withBase.filter((r) => r.total < r.base!.total).length;
  const avgDist = rows.length ? rows.reduce((s, r) => s + r.dist, 0) / rows.length : null;
  const down = rows.filter((r) => r.price < 0).length;
  const sortBy = (k: Key) => {
    if (k === key) setDesc((d) => !d);
    else {
      setKey(k);
      setDesc(true);
    }
  };
  const head = (k: Key, label: string) => <SortHead label={label} on={k === key} desc={desc} onClick={() => sortBy(k)} ga="etf_covered_sort" />;
  return (
    <div className="v2-etf-list">
      <Facts
        items={[
          {
            k: "기초 지수에 못 미친 상품",
            v: `${behind} / ${withBase.length}개`,
          },
          {
            k: "분배금 평균",
            v: avgDist == null ? "없음" : `${avgDist.toFixed(1)}%`,
          },
          { k: "가격이 내린 상품", v: `${down} / ${rows.length}개` },
        ]}
      />
      <div className="v2-etf-row v2-etf-L v2-th" style={{ ["--n" as string]: 4 }}>
        <span />
        <span>이름</span>
        {head("dist", "분배금")}
        {head("price", "가격")}
        {head("total", "합계")}
        <span>기초 지수</span>
      </div>
      <ol className="v2-etf-body">
        {sorted.slice(0, more.shown).map((r, i) => (
          <li key={r.code}>
            <Link
              href={etfHref(r.code)}
              className="v2-etf-row v2-etf-L"
              style={{ ["--n" as string]: 4 }}
              // 반 폭 카드라 긴 이름이 말줄임된다(1,280 에서 이름 칸 135px) — 말풍선에 전체 이름부터.
              title={`${r.name} · 순자산 ${fmtSize(r.netAsset)} · 분배 ${r.pays}회`}
              data-ga="etf_detail_click"
            >
              <span className="v2-td-rank">{i + 1}</span>
              <span className="v2-etf-name">
                <span className="v2-td-name">{r.name}</span>
              </span>
              <span className={`v2-td-num${pctTone(r.dist)}`}>{fmtPct(r.dist)}</span>
              <span className={`v2-td-num${pctTone(r.price)}`}>{fmtPct(r.price)}</span>
              <span className={`v2-td-num${pctTone(r.total)}`}>{fmtPct(r.total)}</span>
              {r.base ? (
                <span className={`v2-td-num${pctTone(r.base.total)}`} title={`${r.base.label} · ${r.base.name}`}>
                  {fmtPct(r.base.total)}
                </span>
              ) : (
                <span className="v2-td-num is-none">없음</span>
              )}
            </Link>
          </li>
        ))}
        <MoreRow rows={more} ga="etf_covered_more" />
      </ol>
    </div>
  );
}
