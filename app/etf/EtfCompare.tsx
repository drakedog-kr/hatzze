"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { EtfCompareIndex, EtfCompareRow } from "@/lib/etf-flow";

import { Module } from "../kadera/V2Modules";
import { etfHref } from "./copy";
import { Facts, mdCols } from "./Facts";
import { MoreRow, useStepRows } from "./MoreRow";
import { FEE_GAP_LABEL, feeGapText, flowTone, fmtFee, fmtFlow, fmtPct, fmtSize, lowestFeeLabel, pctTone } from "./format";
import { Rail } from "./Rail";
import { SortHead } from "./SortHead";

type Key = "netAsset" | "fee" | "r" | "tradeValue" | "m" | "yld";

const fmtYld = (v: number | null) => (v == null ? "없음" : `${v.toFixed(2)}%`);
/**
 * 1년 수익률 폭 '12.0 ~ 16.2%' — 둘이 같은 쪽이면 부호를 떼고(폰 요약 칸 105px 에 '+12.0% ~ +16.2%'가 넘쳤다 · 2026-10-12), 갈리면 붙인다.
 */
const retRange = (v: number[]) => {
  if (!v.length) return "없음";
  const lo = Math.min(...v);
  const hi = Math.max(...v);
  if (v.length < 2 || hi - lo < 0.05) return fmtPct(hi);
  const same = lo >= 0 || hi <= 0;
  const f = (x: number) => (same ? Math.abs(x).toFixed(1) : fmtPct(x).replace("%", ""));
  return same && hi <= 0 ? `-${f(hi)} ~ -${f(lo)}%` : `${f(lo)} ~ ${f(hi)}%`;
};


/**
 * 지수별 ETF 비교(2026-10-12 후보 열에서 고른 이름 · 옛 이름 '같은 지수, 어떤 ETF') — 한 카드에 왼쪽 지수 목록(운용사 합산 1달 순유입) · 오른쪽 그 지수를 따르는 국내 상장 ETF 표.
 * 지수를 고르면 표가 바뀌고 표 머리에 그 지수 이름이 선다(배당 바스켓처럼 고른 것과 보이는 것이 한 덩어리 — 2026-10-11 "같은 지수끼리와
 * 같은 지수, 어떤 ETF 가 동떨어진 카드라 상관없어 보인다"). 무엇을 사라고 권하지 않고 견줄 사실만 나란히 둔다.
 * 표 머리를 누르면 그 칸으로 줄 세운다(총보수만 처음 누를 때 낮은 차례). 가장 낮은 보수는 진하게. 표 꼴은 왼쪽 표 한 벌(.v2-etf-L) —
 * 숫자 칸 여섯(표가 좁으면 하루 거래대금을 접는다). 1주 유입은 걷었다 — 같은 ETF 의 1주를 위 'ETF 자금 흐름' 표가 보인다(2026-10-11 중복 걷기).
 * 1년 수익률은 2026-10-12 더했다 — ETF 를 고를 때 가장 먼저 보는 것이 수익률이다(운용사 설문 1만 명 중 63% · 운용사 13% · 거래량 10% · 보수 9%).
 * 같은 지수라도 보수 · 환헤지 · 분배 시점으로 1년 수익률이 갈린다.
 * 이름 아래 곁줄(운용사 · 상장 연도) · 순자산 아래 몫 · 목록 곁줄 · 모듈 근거 글은 걷었다 — 다른 화면 표는 이름 한 줄 · 숫자 한 칸이다
 * (2026-10-12 "짜잘한 설명이 많다"). 운용사는 줄 title 에 남긴다.
 */
export function EtfCompare({ indexes }: { indexes: EtfCompareIndex[] }) {
  // 목록은 1달 순유입 큰 차례 — 줄에 선 숫자가 그 차례라 읽는 대로 순위가 된다. 한때 순자산 차례였다 — 숫자(순유입)와 차례(순자산)가 달라
  // 코스피200 -2,294억이 맨 위에 서고 처음 고른 S&P500 은 둘째 줄이었다(2026-10-12 디자인 점검). 처음 고른 지수는 맨 윗줄(돈이 가장 많이 들어온 곳).
  const ordered = useMemo(() => [...indexes].sort((a, b) => b.m - a.m), [indexes]);
  const [sel, setSel] = useState(() => ordered[0]?.key ?? "");
  const [key, setKey] = useState<Key>("netAsset");
  const [desc, setDesc] = useState(true);

  const idx = indexes.find((i) => i.key === sel) ?? indexes[0];
  const rows = useMemo(() => {
    if (!idx) return [];
    const val = (r: EtfCompareRow) => r[key];
    // 값이 없는 줄(보수 · 분배율 '없음')은 방향과 상관없이 맨 아래로.
    return [...idx.rows].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      if (va == null) return vb == null ? 0 : 1;
      if (vb == null) return -1;
      return desc ? vb - va : va - vb;
    });
  }, [idx, key, desc]);
  // 다섯 줄 + '10개 더 보기' — 왼쪽 지수 목록 여섯 줄과 가로선이 맞는 수(lib/etf-flow.ts COMPARE_INDEXES · MoreRow.tsx). 지수를 바꾸면 처음 다섯 줄로.
  const more = useStepRows(rows.length);
  if (!idx) return null;

  const fees = idx.rows.filter((r) => r.fee != null).map((r) => r.fee!);
  const minFee = fees.length ? Math.min(...fees) : null;
  const maxFee = fees.length ? Math.max(...fees) : null;
  const rets = idx.rows.filter((r) => r.r != null).map((r) => r.r!);
  // 보수 차이를 돈으로 — 1,000만원을 1년 두면 가장 비싼 곳과 가장 싼 곳이 얼마나 다른가(만원, 소수 한 자리).
  const feeGap = minFee != null && maxFee != null ? ((maxFee - minFee) / 100) * 1000 : null;
  // 같은 지수끼리는 이름이 '브랜드 + 지수'라 브랜드만 적어도 갈린다(RISE · ACE · PLUS). 이름표 끝에 첫 브랜드 + 나머지 수로 붙인다 —
  // 값 아래 곁줄로 두면 이 요약 칸만 77px 이라 화면의 다른 요약 칸(59)과 키가 갈렸다(2026-10-12). 가장 낮은 보수는 표에서도 진하다.
  const brands = minFee == null ? [] : [...new Set(idx.rows.filter((r) => r.fee === minFee).map((r) => r.name.split(" ")[0]))];
  const sortBy = (k: Key) => {
    if (k === key) setDesc((d) => !d);
    else {
      setKey(k);
      setDesc(k !== "fee");
    }
  };
  const head = (k: Key, label: string) => <SortHead label={label} on={k === key} desc={desc} onClick={() => sortBy(k)} ga="etf_compare_sort" />;

  const pick = (k: string) => {
    setSel(k);
    more.reset();
  };
  const items = ordered.map((f) => ({ key: f.key, label: f.label, m: f.m }));

  return (
    <Module id="etf-compare" title="지수별 ETF 비교" className="v2-etf-cmpmod">
      {/* 요약 칸 — 고른 지수의 셈. 카드 폭 한 줄 · 첫 칸이 왼쪽 목록 폭(아래 경계와 세로선이 맞는다). */}
      <Facts
        cols={mdCols(3)}
        items={[
          { k: lowestFeeLabel(brands), v: fmtFee(minFee) },
          { k: FEE_GAP_LABEL, v: feeGapText(feeGap) },
          // 셋째 칸은 1년 수익률 폭 — ETF 를 고를 때 가장 먼저 보는 것이 수익률이다(2026-10-12 관심 점검). 한때 분배율 폭이었다(분배율은 표 칸에 있다).
          { k: "1년 수익률", v: retRange(rets) },
        ]}
      />
      <div className="v2-etf-md">
        <Rail items={items} sel={idx.key} onPick={pick} head="지수" numHead="1달 순유입" ga="etf_index_pick" />
        <div className="v2-etf-list v2-etf-cmpwrap">
          <div className="v2-etf-row v2-etf-L v2-etf-cmp v2-th">
            <span />
            <span className="v2-etf-sel">{idx.label}</span>
            {head("netAsset", "순자산")}
            {head("fee", "총보수")}
            {head("r", "1년 수익률")}
            {head("tradeValue", "하루 거래대금")}
            {head("m", "1달 순유입")}
            {head("yld", "분배율")}
          </div>
          <ol className="v2-etf-body">
            {rows.slice(0, more.shown).map((r, i) => (
              <li key={r.code}>
                <Link
                  href={etfHref(r.code)}
                  className="v2-etf-row v2-etf-L v2-etf-cmp"
                  title={[r.manager, r.setupYear ? `${r.setupYear}년 상장` : null].filter(Boolean).join(" · ") || undefined}
                  data-ga="etf_detail_click"
                >
                  <span className="v2-td-rank">{i + 1}</span>
                  <span className="v2-etf-name">
                    <span className="v2-td-name">
                      {r.name}
                      {r.hedged && <span className="v2-badge v2-etf-hedge">환헤지</span>}
                    </span>
                  </span>
                  <span className="v2-td-num">{fmtSize(r.netAsset)}</span>
                  <span className={`v2-td-num${r.fee != null && r.fee === minFee ? " v2-etf-best" : ""}${r.fee == null ? " is-none" : ""}`}>
                    {fmtFee(r.fee)}
                  </span>
                  <span className={`v2-td-num${r.r == null ? " is-none" : pctTone(r.r)}`}>{r.r == null ? "없음" : fmtPct(r.r)}</span>
                  <span className="v2-td-num">{fmtSize(r.tradeValue)}</span>
                  <span className={`v2-td-num${flowTone(r.m)}`}>{fmtFlow(r.m)}</span>
                  <span className={`v2-td-num${r.yld == null ? " is-none" : ""}`}>
                    {r.yldEst && (
                      <span className="v2-badge v2-etf-est" title="상장 1년이 안 돼 예상치">
                        추정
                      </span>
                    )}
                    {fmtYld(r.yld)}
                  </span>
                </Link>
              </li>
            ))}
            <MoreRow rows={more} ga="etf_compare_more" fill total={rows.length} />
          </ol>
        </div>
      </div>
    </Module>
  );
}
