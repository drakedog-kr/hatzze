import Link from "next/link";

import type { EtfFlowBoard } from "@/lib/etf-flow";
import { shortDate } from "@/lib/format";

import { Module, Spark } from "../kadera/V2Modules";
import type { BriefRow } from "./brief";
import { etfHref } from "./copy";
import { flowTone, fmtFlow, fmtPct, pctTone } from "./format";

/**
 * ETF 자금 흐름 화면의 히어로 띠 — [ETF 순유입 | ETF 브리핑 | 수익률 상위 ETF](2026-10-11 "다른 페이지처럼 브리핑 히어로 섹션").
 * 셋째 칸은 2026-10-12 투자자별 ETF 순매수에서 수익률 상위 ETF 로 바꿨다(TopReturns 머리말).
 *
 * 홈 둘째 줄 [햇쩨 지수 | 오늘의 브리핑](app/home/V2Briefing.tsx)과 같은 얼개다 — 왼쪽 카드는 큰 숫자 · 오른쪽 덧붙임 · 선 · 곁줄 ·
 * 아래 목록(홈은 구간별 지표 수, 여기는 갈래별 1달 순유입), 가운데는 이름표 칸 + 문장 칸 줄(.v2-brief3). 오른쪽 400 칸은 아래
 * 줄기의 오른쪽 칸과 같은 세로선에 선다.
 */

/** '+7.52조' → ['+7.52', '조'] — 큰 숫자의 단위는 한 단 작게(홈 햇쩨 지수의 ℃ 와 같은 .hz-big-unit). */
const splitUnit = (s: string) => [s.slice(0, -1), s.slice(-1)] as const;

/**
 * ETF 순유입 — 홈 '햇쩨 지수' 카드와 같은 꼴: 큰 숫자(1달 합) · 20거래일 누적 선(0 점선 기준) · 곁줄 셋(하루 최대 · 순유입일 · 순유출일) · 아래 기간 줄 셋
 * (하루 · 1주 · 1년 합 — 큰 숫자 1달을 사이에 둔 기간 사다리 · 상세 수익률 카드 아래 줄과 같은 자리). 선은 남는 키를 받는다(옆 브리핑 다섯 줄 키).
 * 기간 줄은 2026-10-12 브리핑이 다섯 줄이 되며 늘어난 키에 더했다 — 아래 'ETF 자금 흐름' 유형 목록의 '전체'는 숫자가 없어서(합은 이 카드가 말한다)
 * 전체 ETF 의 하루 · 1년 합은 이 화면 어디에도 없었다. 큰 숫자 옆 '1주'는 줄로 내렸다(같은 값이 두 번 서지 않게). 아래에 있던 ETF 수 줄 셋(들어옴 · 빠짐 · 거의 그대로)은 걷었다 — 바로 아래 'ETF 자금 흐름'
 * 요약 칸 '들어온 · 빠진 ETF'와 같은 셈인데 판이 달라(전체 대 파킹형·채권 빼고) 한 화면에 372 · 347 과 275 · 281 이 같이 섰고, 카드 한 장에
 * 그림이 넷이었다(2026-10-12 디자인 점검 "너무 복잡한 곳"). 유형별 금액은 아래 카드의 유형 목록이 맡는다.
 */
export function FlowHero({ b }: { b: EtfFlowBoard }) {
  const tone = b.totalM >= 0 ? "up" : "down";
  const cum = b.daily.reduce<number[]>((acc, d) => [...acc, (acc.at(-1) ?? 0) + d.flow], []);
  const [num, unit] = splitUnit(fmtFlow(b.totalM));
  const peak = b.daily.length ? b.daily.reduce((m, d) => (d.flow > m.flow ? d : m), b.daily[0]) : null;
  // 순유입일 · 순유출일 — 스무 날 중 ETF 전체가 순유입 · 순유출인 날 수(2026-10-13 순유입일을 앞에 더함).
  const inDays = b.daily.filter((d) => d.flow > 0).length;
  const outDays = b.daily.filter((d) => d.flow < 0).length;
  const last = b.daily.at(-1);
  const per = [
    ...(last ? [{ k: "하루", v: last.flow }] : []),
    { k: "1주", v: b.totalW },
    ...(b.totalY != null ? [{ k: "1년", v: b.totalY }] : []),
  ];
  return (
    // id — 폰에서 이 화면의 대표 숫자(순유입)만 키운다(v2.css 대표 숫자 묶음 · 홈 햇쩨 지수 · 카더라 여론과 같은 32).
    <Module id="etf-flow" title="ETF 순유입" meta="1달">
      <div className="v2-bigcard v2-etf-hero">
        <span className="v2-card-val is-big">
          <b className={`is-${tone}`}>
            {num}
            <span className="hz-big-unit">{unit}</span>
          </b>
        </span>
        {cum.length > 1 && (
          <Spark
            id="v2-etf-spark"
            values={cum}
            base={0}
            baseLabel="0"
            w={300}
            h={64}
            tone={tone}
            dot
            tips={b.daily.map((d, i) => `${shortDate(d.date)} · 그날 ${fmtFlow(d.flow)} · 누적 ${fmtFlow(cum[i])}`)}
          />
        )}
        {peak && (
          <span className="v2-card-foot">
            <span>
              <em>하루 최대 · {shortDate(peak.date)}</em>
              {fmtFlow(peak.flow)}
            </span>
            <span>
              <em>순유입일</em>
              {inDays}일
            </span>
            <span>
              <em>순유출일</em>
              {outDays}일
            </span>
          </span>
        )}
        <div className="v2-etf-cnt">
          {per.map((r) => (
            <div key={r.k} className="v2-etf-cnt-row is-plain">
              <span className="v2-etf-cnt-k">{r.k}</span>
              <b className={`v2-etf-cnt-n${flowTone(r.v)}`}>{fmtFlow(r.v)}</b>
            </div>
          ))}
        </div>
      </div>
    </Module>
  );
}

/**
 * ETF 브리핑 — 숫자로 지은 문장 다섯(brief.ts · 줄은 화면이 지어 넘긴다 — 옆 수익률 상위가 같은 줄 수를 편다). 짚는 숫자는 한 단 진한 잉크,
 * ETF 이름은 그 상세로 가는 링크(홈 '오늘의 브리핑' 종목 링크와 같은 .hz-brief3-link · 2026-10-12).
 */
export function BriefModule({ rows }: { rows: BriefRow[] }) {
  return (
    // 근거(기간) 글은 두지 않는다 — 옆 순유입 머리 '1달 · 20거래일'과 아래 ETF 자금 흐름 머리가 같은 말을 한다(2026-10-11 중복 걷기).
    <Module title="ETF 브리핑">
      <dl className="v2-brief3 v2-etf-brief">
        {rows.map((r) => (
          <div key={r.label} className="v2-brief3-row">
            <dt>{r.label}</dt>
            <dd>
              {r.parts.map((p, i) =>
                typeof p === "string" ? (
                  p
                ) : p.href ? (
                  <Link key={i} href={p.href} className="hz-brief3-link" data-ga="etf_brief_link">
                    {p.b}
                  </Link>
                ) : (
                  <b key={i}>{p.b}</b>
                ),
              )}
            </dd>
          </div>
        ))}
      </dl>
    </Module>
  );
}

/**
 * 수익률 상위 ETF(1달 · 분배금 포함) — 히어로 띠 오른쪽 칸. 배수 상품(레버리지 · 인버스 · 단일종목)은 뺀다(lib/etf-flow.ts topReturns).
 * 한때 이 자리는 '투자자별 ETF 순매수'(KOSIS 월 통계 · ETF 전체 합계)였다 — 두 달 늦게 올라와(10-12 에 8월분) 1달 순유입 옆에 서면 기간이
 * 어긋났고, 검색 · 기사 · 채널 어디서도 '개인 대 외국인 합계'를 묻지 않았다. ETF 를 고를 때 가장 먼저 보는 것은 수익률이고(2025-02 운용사
 * 설문 1만 명 중 63%) 기사 단골도 '수익률 상위 ETF'라 그 자리를 수익률에 줬다(2026-10-12 관심 점검). 머리 줄은 두지 않는다 — 옆 브리핑
 * 네 줄과 줄 높이 · 가로선을 맞추려고(기간은 모듈 근거 글이 말한다). 줄 전체가 그 ETF 상세로 간다.
 */
export function TopReturns({ rows }: { rows: EtfFlowBoard["topReturns"] }) {
  return (
    <div className="v2-etf-list">
      <ol className="v2-etf-body">
        {rows.map((r, i) => (
          <li key={r.code}>
            <Link href={etfHref(r.code)} className="v2-etf-row v2-etf-L" style={{ ["--n" as string]: 1 }} data-ga="etf_detail_click">
              <span className="v2-td-rank">{i + 1}</span>
              <span className="v2-etf-name">
                <span className="v2-td-name" title={r.name}>
                  {r.name}
                </span>
              </span>
              <span className={`v2-td-num v2-etf-strong${pctTone(r.r)}`}>{fmtPct(r.r)}</span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
