"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { EtfSibling } from "@/lib/etf-detail";

import { etfHref } from "../copy";
import { flowTone, fmtFee, fmtFlow, fmtPct, fmtSize, pctTone } from "../format";
import { MoreRow, useStepRows } from "../MoreRow";
import { SortHead } from "../SortHead";

type Key = "netAsset" | "fee" | "r" | "tradeValue" | "m" | "yld";

/** 처음 펴는 줄 수 — 열(2026-10-12 "최대 10개까지 그 다음은 더보기" · 한때 일곱 + 이 ETF 로 끊고 나머지를 볼 길이 없었다). */
const SIB_FIRST = 10;

/**
 * 같은 지수 ETF 표 — 처음은 순자산 차례로 열 줄, 나머지는 마지막 줄 단추로 열 줄씩 더 편다(MoreRow.tsx · 메인 화면 표들과 같은 단추).
 * 숫자 칸 머리를 눌러 줄 세운다 — 메인 '지수별 ETF 비교'와 같은 꼴(총보수만 처음 누를 때 낮은 차례 · 값 없는 줄은 맨 아래 · 2026-10-13).
 * 이 ETF 가 펴진 줄 밖이면 마지막 자리에 덧붙인다 — 지금 보는 ETF 가 어디쯤인지 늘 보이게. 이 ETF 의 줄은 고른 줄 꼴(옅은 파랑)이고
 * 링크가 아니다(지금 화면). 다른 줄은 줄 전체가 그 ETF 상세로 간다. 가장 낮은 보수는 진하게.
 * 펼치기 · 줄 세우기 상태가 있어 클라이언트 부품이다 — 줄 값은 서버가 다 지어 넘긴다(lib/etf-detail.ts siblings).
 */
export function SiblingTable({ siblings, minFee }: { siblings: EtfSibling[]; minFee: number | null }) {
  const [key, setKey] = useState<Key>("netAsset");
  const [desc, setDesc] = useState(true);
  const sorted = useMemo(
    () =>
      [...siblings].sort((a, b) => {
        const va = a[key];
        const vb = b[key];
        if (va == null) return vb == null ? 0 : 1;
        if (vb == null) return -1;
        return desc ? vb - va : va - vb;
      }),
    [siblings, key, desc],
  );
  const more = useStepRows(siblings.length, SIB_FIRST);
  const top = sorted.slice(0, more.shown);
  const self = sorted.find((s) => s.self);
  const shown = self && !top.includes(self) ? [...top, self] : top;
  const sortBy = (k: Key) => {
    if (k === key) setDesc((d) => !d);
    else {
      setKey(k);
      setDesc(k !== "fee");
    }
  };
  const head = (k: Key, label: string) => <SortHead label={label} on={k === key} desc={desc} onClick={() => sortBy(k)} ga="etf_sibling_sort" />;
  return (
    <div className="v2-etf-list v2-etf-cmpwrap">
      <div className="v2-etf-row v2-etf-L v2-etf-cmp v2-th">
        <span />
        <span>이름</span>
        {head("netAsset", "순자산")}
        {head("fee", "총보수")}
        {head("r", "1년 수익률")}
        {head("tradeValue", "하루 거래대금")}
        {head("m", "1달 순유입")}
        {head("yld", "분배율")}
      </div>
      <ol className="v2-etf-body">
        {shown.map((s) => {
          const i = sorted.indexOf(s);
          const cells = (
            <>
              <span className="v2-td-rank">{i + 1}</span>
              <span className="v2-etf-name">
                <span className="v2-td-name">
                  {s.name}
                  {s.hedged && <span className="v2-badge v2-etf-hedge">환헤지</span>}
                </span>
              </span>
              <span className="v2-td-num">{fmtSize(s.netAsset)}</span>
              <span className={`v2-td-num${s.fee != null && s.fee === minFee ? " v2-etf-best" : ""}${s.fee == null ? " is-none" : ""}`}>{fmtFee(s.fee)}</span>
              <span className={`v2-td-num${s.r == null ? " is-none" : pctTone(s.r)}`}>{s.r == null ? "없음" : fmtPct(s.r)}</span>
              <span className="v2-td-num">{fmtSize(s.tradeValue)}</span>
              <span className={`v2-td-num${flowTone(s.m)}`}>{fmtFlow(s.m)}</span>
              <span className={`v2-td-num${s.yld == null ? " is-none" : ""}`}>
                {s.yldEst && (
                  <span className="v2-badge v2-etf-est" title="상장 1년이 안 돼 예상치">
                    추정
                  </span>
                )}
                {s.yld == null ? "없음" : `${s.yld.toFixed(2)}%`}
              </span>
            </>
          );
          return s.self ? (
            <li key={s.code} className="v2-etf-row v2-etf-L v2-etf-cmp is-self" aria-current="page">
              {cells}
            </li>
          ) : (
            <li key={s.code}>
              <Link href={etfHref(s.code)} className="v2-etf-row v2-etf-L v2-etf-cmp" data-ga="etf_detail_sibling">
                {cells}
              </Link>
            </li>
          );
        })}
        <MoreRow rows={more} ga="etf_sibling_more" />
      </ol>
    </div>
  );
}
