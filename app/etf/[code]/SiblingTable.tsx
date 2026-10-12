"use client";

import Link from "next/link";

import type { EtfSibling } from "@/lib/etf-detail";

import { etfHref } from "../copy";
import { flowTone, fmtFee, fmtFlow, fmtPct, fmtSize, pctTone } from "../format";
import { MoreRow, useStepRows } from "../MoreRow";

/** 처음 펴는 줄 수 — 순자산 큰 열(2026-10-12 "최대 10개까지 그 다음은 더보기" · 한때 일곱 + 이 ETF 로 끊고 나머지를 볼 길이 없었다). */
const SIB_FIRST = 10;

/**
 * 같은 지수 ETF 표 — 순자산 차례로 열 줄, 나머지는 마지막 줄 단추로 열 줄씩 더 편다(MoreRow.tsx · 메인 화면 표들과 같은 단추).
 * 이 ETF 가 펴진 줄 밖이면 마지막 자리에 덧붙인다 — 지금 보는 ETF 가 어디쯤인지 늘 보이게. 이 ETF 의 줄은 고른 줄 꼴(옅은 파랑 + 왼쪽 띠)이고
 * 링크가 아니다(지금 화면). 다른 줄은 줄 전체가 그 ETF 상세로 간다. 가장 낮은 보수는 진하게.
 * 펼치기 상태가 있어 클라이언트 부품이다 — 줄 값은 서버가 다 지어 넘긴다(lib/etf-detail.ts siblings).
 */
export function SiblingTable({ siblings, minFee }: { siblings: EtfSibling[]; minFee: number | null }) {
  const more = useStepRows(siblings.length, SIB_FIRST);
  const top = siblings.slice(0, more.shown);
  const self = siblings.find((s) => s.self);
  const shown = self && !top.includes(self) ? [...top, self] : top;
  return (
    <div className="v2-etf-list v2-etf-cmpwrap">
      <div className="v2-etf-row v2-etf-L v2-etf-cmp v2-th">
        <span />
        <span>이름</span>
        <span>순자산</span>
        <span>총보수</span>
        <span>1년 수익률</span>
        <span>하루 거래대금</span>
        <span>1달 순유입</span>
        <span>분배율</span>
      </div>
      <ol className="v2-etf-body">
        {shown.map((s) => {
          const i = siblings.indexOf(s);
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
