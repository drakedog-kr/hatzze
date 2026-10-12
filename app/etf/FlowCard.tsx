"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { EtfFlowRow, EtfGroupFlow, EtfPeriod, EtfPickFacts } from "@/lib/etf-flow";
import { ETF_ALL, ETF_NOCASH, etfPickTest } from "@/lib/etf-groups";
import { etfSortCmp, type EtfSortKey } from "@/lib/etf-sort";

import { Module } from "../kadera/V2Modules";
import { etfHref } from "./copy";
import { Facts, mdCols } from "./Facts";
import { flowTone, fmtFlow, fmtPct, fmtSize, pctTone } from "./format";
import { Rail, type RailItem } from "./Rail";
import { SortHead } from "./SortHead";

/** 기간 이름 — 하루는 '오늘'이라 적지 않는다. KRX 가 그날 값을 다음 날 아침에 주어 화면의 가장 최근 거래일은 늘 어제 이전이다. */
const PERIOD_LABEL: Record<EtfPeriod, string> = {
  d: "하루",
  w: "1주",
  m: "1달",
  y: "1년",
};

/**
 * ETF 자금 흐름 — 한 카드에 왼쪽 유형 목록 · 오른쪽 개별 ETF 표. 유형을 고르면 표가 그 유형의 ETF 로 바뀌고 표 머리에 그 이름이 선다.
 * 한때 [개별 ETF 표(위에 칩 일곱) | 유형별 돈 흐름]이 따로 선 두 카드였다 — 같은 것을 다른 두 곳에서 골라 서로 상관없어 보였다(2026-10-11).
 *
 * 기간(하루 · 1주 · 1달 · 1년)은 머리 오른쪽 세그먼트로 고른다(2026-10-12 "다른 페이지처럼 기간을 고르게") — 유형 목록 · 요약 칸 · 표가
 * 같이 바뀐다. 1년은 1년 합 뷰가 생기고 일별 표가 1년을 덮을 때만 선다(lib/etf-flow.ts 머리말 '기간').
 * 표 칸은 넷으로 고정이다: 순유입 · 수익률(분배금 포함) · 순유입일(2026-10-12 '들어온 날'에서 바꿈) · 순자산(2026-10-13 — 얼마짜리 ETF 에
 * 그만큼 들어왔는지 옆에서 견준다). 하루는 순유입일이 1/1일뿐이라 그 자리에 이어서 들어온 날 수를 둔다.
 * 네 칸 머리를 다 눌러 줄 세운다(한 번 더 누르면 반대 순 · 2026-10-13 순유입일 · 순자산을 더함). 줄은 서버가 판 · 기간 · 정렬 · 방향마다
 * 앞 줄만 골라 보내고(lib/etf-flow.ts), 차례는 둘이 같은 함수로 센다(lib/etf-sort.ts).
 * 이름 아래 곁줄(유형)은 걷었다 — 다른 화면 표는 이름 한 줄이다(2026-10-12 "짜잘한 설명이 많다").
 */
export function FlowCard({
  rows,
  groups,
  picks,
  periods,
  limit,
}: {
  rows: EtfFlowRow[];
  groups: EtfGroupFlow[];
  picks: Record<string, Partial<Record<EtfPeriod, EtfPickFacts>>>;
  periods: EtfPeriod[];
  limit: number;
}) {
  // 처음 판은 '파킹형·채권 빼고' — 전체는 위 히어로가 요약하고(파킹형이 순유입의 70%), 이 카드는 주식형 ETF 를 먼저 보인다(2026-10-11).
  const [pick, setPick] = useState(ETF_NOCASH);
  const [per, setPer] = useState<EtfPeriod>(periods.includes("m") ? "m" : periods[0]);
  const [key, setKey] = useState<EtfSortKey>("f");
  const [desc, setDesc] = useState(true);

  const items = useMemo<RailItem[]>(() => {
    const cash = groups.filter((g) => g.group === "파킹형" || g.group === "채권");
    const sum = (list: EtfGroupFlow[]) => list.reduce((s, g) => s + (g.p[per] ?? 0), 0);
    return [
      // '전체'는 숫자 없이 — 합은 위 히어로 큰 숫자가 말한다(2026-10-11 중복 걷기).
      { key: ETF_ALL, label: "전체" },
      {
        key: ETF_NOCASH,
        label: "파킹형·채권 빼고",
        m: sum(groups) - sum(cash),
      },
      ...[...groups].sort((a, b) => (b.p[per] ?? 0) - (a.p[per] ?? 0)).map((g) => ({ key: g.group, label: g.group, m: g.p[per] ?? 0 })),
    ];
  }, [groups, per]);
  const label = items.find((i) => i.key === pick)?.label ?? "전체";
  const pf = picks[pick]?.[per];

  const shown = useMemo(() => {
    const test = etfPickTest(pick);
    return rows
      .filter((r) => test(r.group))
      .sort(etfSortCmp(per, key, desc))
      .slice(0, limit);
  }, [rows, pick, per, key, desc, limit]);

  const sortBy = (k: EtfSortKey) => {
    if (k === key) setDesc((d) => !d);
    else {
      setKey(k);
      setDesc(true);
    }
  };
  const daily = per === "d";

  return (
    <Module
      title="ETF 자금 흐름"
      className="v2-etf-main"
      // 안내 쪽지 — 줄이 상세로 가는 링크인데 화살표가 없다(app/V2Hint.tsx). 상세 '같은 지수 ETF' 줄과 같은 가르침이라 id 를 같이 쓴다.
      hint={shown.length ? { id: "etf-row", order: 1, anchor: "ol.v2-etf-body > li:first-child", text: "ETF를 누르면 수익률 · 분배금 · 자금 흐름이 나옵니다" } : undefined}
      aside={
        periods.length > 1 ? (
          <span className="hz-seg hz-seg-hover" role="group" aria-label="기간">
            {periods.map((p) => (
              <button key={p} type="button" aria-pressed={p === per} onClick={() => setPer(p)} data-ga="etf_flow_period">
                {PERIOD_LABEL[p]}
              </button>
            ))}
          </span>
        ) : undefined
      }
    >
      {/* 요약 칸 — 고른 판 · 기간의 전 종목 셈(표는 앞 줄만이라 서버가 센다 · lib/etf-flow.ts pickFacts). 첫 칸이 왼쪽 목록 폭이라 아래 목록 | 표
          경계와 세로선이 맞는다. 그 아래 두 칸은 머리 줄 30 + 열네 줄 × 44 로 가로선이 맞는다. */}
      {/* 금액은 칸을 나눠 하나씩 — 한 칸에 '+6.99조 · -4.83조'로 붙이니 무엇이 들고 난 돈인지 바로 안 갈렸다(2026-10-13 '위 3개 비중'을 걷고 더함). */}
      {pf && (
        <Facts
          cols={mdCols(4)}
          items={[
            {
              k: "순유입 · 순유출 ETF",
              v: `${pf.inN.toLocaleString("ko-KR")} · ${pf.outN.toLocaleString("ko-KR")}개`,
            },
            { k: "순유입 금액", v: fmtFlow(pf.inSum), tone: pf.inSum >= 0.5 ? "up" : undefined },
            { k: "순유출 금액", v: fmtFlow(pf.outSum), tone: pf.outSum <= -0.5 ? "down" : undefined },
            {
              k: "순자산 대비 순유입",
              v: pf.rate == null ? "없음" : fmtPct(pf.rate, daily ? 2 : 1),
              tone: pf.rate == null ? undefined : pf.rate > 0 ? "up" : pf.rate < 0 ? "down" : undefined,
            },
          ]}
        />
      )}
      <div className="v2-etf-md">
        <Rail items={items} sel={pick} onPick={setPick} head="유형" numHead="순유입" ga="etf_type_pick" />
        <div className="v2-etf-list">
          <div className="v2-etf-row v2-etf-L v2-th" style={{ ["--n" as string]: 4 }}>
            <span />
            <span className="v2-etf-sel">{label}</span>
            <SortHead label="순유입" on={key === "f"} desc={desc} onClick={() => sortBy("f")} ga="etf_sort" />
            <SortHead label="수익률" on={key === "r"} desc={desc} onClick={() => sortBy("r")} ga="etf_sort" />
            <SortHead label={daily ? "연속 순유입" : "순유입일"} on={key === "d"} desc={desc} onClick={() => sortBy("d")} ga="etf_sort" />
            <SortHead label="순자산" on={key === "a"} desc={desc} onClick={() => sortBy("a")} ga="etf_sort" />
          </div>
          <ol className="v2-etf-body">
            {shown.map((r, i) => {
              const s = r.p[per];
              return (
                <li key={r.code}>
                  <Link href={etfHref(r.code)} className="v2-etf-row v2-etf-L" style={{ ["--n" as string]: 4 }} data-ga="etf_detail_click">
                    <span className="v2-td-rank">{i + 1}</span>
                    <span className="v2-etf-name">
                      <span className="v2-td-name" title={r.name}>
                        {r.name}
                      </span>
                    </span>
                    <span className={`v2-td-num${flowTone(s?.f ?? 0)}`}>{fmtFlow(s?.f ?? 0)}</span>
                    <span className={`v2-td-num${s?.r == null ? " is-none" : pctTone(s.r)}`}>{s?.r == null ? "없음" : fmtPct(s.r)}</span>
                    {daily ? (
                      <span className="v2-td-num">{r.streak}일</span>
                    ) : s?.inDays == null ? (
                      <span className="v2-td-num is-none">없음</span>
                    ) : (
                      <span className="v2-td-num">
                        {s.inDays}
                        <span className="v2-etf-unit">/{s.days}일</span>
                      </span>
                    )}
                    <span className="v2-td-num">{fmtSize(r.netAsset)}</span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </Module>
  );
}
