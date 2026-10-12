import Link from "next/link";

import type { EtfDetail, EtfDetailPeriod } from "@/lib/etf-detail";
import { shortDate } from "@/lib/format";

import { DIVIDEND_ADD_LABEL, DIVIDEND_PAGE } from "../../dividend/copy";
import { Module, Spark } from "../../kadera/V2Modules";
import { Icon } from "../../ui";
import { Facts, PANES_COLS } from "../Facts";
import { FEE_GAP_LABEL, feeGapText, flowTone, fmtFee, fmtFlow, fmtPct, lowestFeeLabel, pctTone } from "../format";
import type { BriefRow } from "./brief";
import { dayShort } from "./dates";
import { SiblingTable } from "./SiblingTable";

/**
 * ETF 상세 화면의 부품(서버 부품 — 값이 모두 서버 HTML 에 든다. 크롤러가 이름 · 수익률 · 분배금을 그대로 읽어야 이 화면이 산다).
 * 꼴은 메인 화면(/etf)의 한 벌을 그대로 쓴다 — 히어로 띠 [큰 숫자 카드 | 브리핑 | 400 목록] · 아래 [표 | 400] 두 칸 · 줄 44 · 머리 줄 30.
 */

const won = (v: number) => `${Math.round(v).toLocaleString("ko-KR")}원`;
/** '+20.7%' → ['+20.7', '%'] — 큰 숫자의 단위는 한 단 작게(메인 히어로의 '조'와 같은 .hz-big-unit). */
const splitUnit = (s: string) => [s.slice(0, -1), s.slice(-1)] as const;
const CADENCE: Record<string, string> = {
  월: "매달",
  분기: "분기마다",
  반기: "반년마다",
  연: "해마다",
};
// 분배하지 않으면 '없음' — 이름표가 '분배'라 '분배 없음'이면 같은 말이 두 번 섰다(2026-10-12).
export const cadenceLabel = (c: string | null) => (c ? (CADENCE[c] ?? c) : "없음");

/** 갈림 막대 한 칸 — 0 선에서 오른쪽(빨강) · 왼쪽(파랑), max 가 반 칸(.v2-etf-div). */
function DivBar({ v, max }: { v: number; max: number }) {
  const w = max > 0 ? Math.max((Math.abs(v) / max) * 50, v ? 1 : 0) : 0;
  return (
    <span className="v2-etf-div" aria-hidden="true">
      {w > 0 && <i className={v >= 0 ? "is-up" : "is-down"} style={{ width: `${w}%` }} />}
    </span>
  );
}

/**
 * 수익률 — 메인 히어로 'ETF 순유입' 카드와 같은 꼴: 큰 숫자(1년, 그 안에 상장했으면 상장 이후) · 기간 종가 선 · 곁줄 둘(최고 · 최저) ·
 * 아래 기간 줄 넷(1주 · 1달 · 3달 · 6달, 갈림 막대). 수익률은 분배금을 더한 값이다(lib/etf-detail.ts 머리말 '기간').
 * 큰 숫자 옆 '1달'은 기간 줄로 내렸다 — 메인 순유입 카드와 같은 꼴(큰 숫자 하나 + 아래 기간 사다리 · 2026-10-12).
 */
export function ReturnCard({ d }: { d: EtfDetail }) {
  const h = d.head;
  const tone = (h.ret ?? 0) >= 0 ? "up" : "down";
  const [num, unit] = splitUnit(h.ret == null ? "없음" : fmtPct(h.ret));
  const rows = (["w", "m", "q", "h"] as const).map((k) => d.periods.find((p) => p.key === k)).filter((p): p is EtfDetailPeriod => !!p && p.ret != null);
  const max = Math.max(0, ...rows.map((r) => Math.abs(r.ret!)));
  return (
    <Module title="수익률" meta={h.label}>
      <div className="v2-bigcard v2-etf-hero">
        <span className="v2-card-val is-big">
          <b className={h.ret == null ? undefined : `is-${tone}`}>
            {h.ret == null ? "없음" : num}
            {h.ret != null && <span className="hz-big-unit">{unit}</span>}
          </b>
        </span>
        {d.line.length > 1 && (
          <Spark
            id="v2-etfd-spark"
            values={d.line.map((p) => p.close)}
            w={300}
            h={64}
            tone={tone}
            dot
            tips={d.line.map((p) => `${dayShort(p.date, d.asOf)} · ${won(p.close)}${p.change != null ? ` · ${fmtPct(p.change, 2)}` : ""}`)}
          />
        )}
        {d.high && d.low && (
          <span className="v2-card-foot">
            <span>
              <em>최고 · {dayShort(d.high.date, d.asOf)}</em>
              {won(d.high.close)}
            </span>
            <span>
              <em>최저 · {dayShort(d.low.date, d.asOf)}</em>
              {won(d.low.close)}
            </span>
          </span>
        )}
        {rows.length > 0 && (
          <div className="v2-etf-cnt">
            {rows.map((r) => (
              <div key={r.key} className="v2-etf-cnt-row v2-etfd-rrow">
                <span className="v2-etf-cnt-k">{r.label}</span>
                <DivBar v={r.ret!} max={max} />
                <b className={`v2-etf-cnt-n${pctTone(r.ret!)}`}>{fmtPct(r.ret!)}</b>
              </div>
            ))}
          </div>
        )}
      </div>
    </Module>
  );
}

/** 브리핑 — 숫자로 지은 문장 다섯(brief.ts). 메인 화면 'ETF 브리핑'과 같은 꼴(.v2-brief3 · .v2-etf-brief) — ETF 이름은 그 상세로 가는 링크. */
export function DetailBrief({ rows }: { rows: BriefRow[] }) {
  return (
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
                  <Link key={i} href={p.href} className="hz-brief3-link" data-ga="etf_detail_brief_link">
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
 * 기본 정보 — 이름표 · 값 네 줄(옆 브리핑 네 줄과 가로선이 맞는다). 긴 값(추적 지수)은 한 줄 + title.
 * 줄 꼴은 오른쪽 목록 한 벌의 자리 — 빈 순위 칸(20) 뒤에 이름표가 서서 아래 '기간별 순유입'의 기간 · 메인 화면 오른쪽 목록의 이름과
 * 같은 세로선에 선다(2026-10-12 짜임새 점검: 따로 지은 틀이라 이름표가 x779 · 기간이 x777 로 놀았다).
 */
export function InfoList({ items }: { items: { k: string; v: string; title?: string }[] }) {
  return (
    <Module title="기본 정보" className="v2-etfd-infomod">
      <div className="v2-etf-list">
        <ol className="v2-etf-body">
          {items.map((it) => (
            <li key={it.k} className="v2-etf-row v2-etfd-info" title={it.title}>
              <span />
              <span className="v2-etfd-info-k">{it.k}</span>
              <span className="v2-etfd-info-v">{it.v}</span>
            </li>
          ))}
        </ol>
      </div>
    </Module>
  );
}

/**
 * 순유입 · 종가 — 국장 종목 상세 '커뮤니티 관심 추이'(V2Modules MentionTrend)와 같은 그림: 위 칸은 그날 종가 선(맥락), 아래 칸은 그날 순유입 막대(주인공).
 * 칸에 마우스를 올리면 세로선이 두 칸을 함께 지나고 선 위에 점이 서며, 말풍선 한 장에 날짜 · 순유입(첫 줄)과 종가 · 등락(둘째 줄)이 같이 뜬다
 * (2026-10-12 "시세 차트를 자금 흐름과 같이 · 국장 카더라 상세처럼"). 선 · 최고 · 최저 글자 · 끝점 · 호버 점 꼴은 .v2-tm-* 를 그대로 쓴다.
 * 다른 것은 막대 하나 — 순유입은 들고 나므로 아래 칸 안에 0 선을 두고 들어온 날은 위로(빨강) · 빠진 날은 아래로(파랑) 선다. 0 선 자리는
 * 위 · 아래 몫이 같은 눈금이 되게 가장 큰 들어온 날 : 가장 큰 빠진 날이다(빠진 날이 없으면 바닥).
 * 서버 부품 — 막대 · 손닿는 칸은 span, 선은 SVG 한 장(MentionTrend 와 같다). 값이 없는 날(상장 첫날)은 칸만.
 */
function FlowPriceTrend({ flows, asOf, id }: { flows: EtfDetail["flows"]; asOf: string; id: string }) {
  const n = flows.length;
  const vals = flows.map((f) => f.flow ?? 0);
  const up = Math.max(0, ...vals);
  const down = Math.max(0, ...vals.map((v) => -v));
  const range = up + down || 1;
  /** 0 선의 자리 — 아래 칸 바닥에서 몇 몫 위인가(0 = 바닥 · 1 = 아래 칸 꼭대기). */
  const zb = down / range;

  const priced = flows.flatMap((f, i) => (f.close ? [{ i, close: f.close }] : []));
  const hasLine = priced.length >= 2;
  const lo = Math.min(...priced.map((p) => p.close));
  const hi = Math.max(...priced.map((p) => p.close));
  const y = (v: number) => (hi > lo ? ((hi - v) / (hi - lo)) * 100 : 50);
  const xPct = (i: number) => ((i + 0.5) / n) * 100;
  const line = hasLine ? priced.map((p, k) => `${k ? "L" : "M"}${p.i + 0.5},${y(p.close).toFixed(2)}`).join(" ") : "";
  const first = priced[0];
  const last = priced[priced.length - 1];
  const hiAt = priced.find((p) => p.close === hi);
  const loAt = priced.find((p) => p.close === lo);
  const edge = (i: number) => (xPct(i) < 14 ? " is-start" : xPct(i) > 86 ? " is-end" : "");
  const prev = (i: number) => {
    for (let k = i - 1; k >= 0; k--) if (flows[k].close) return flows[k].close!;
    return null;
  };

  return (
    <div
      className={`v2-tm-trend v2-etfd-trend${hasLine ? " has-px" : ""}`}
      style={{ ["--zb" as string]: zb.toFixed(4) }}
      role="img"
      aria-label={`최근 ${n}거래일 순유입 막대${hasLine ? "와 종가 선" : ""}`}
    >
      {flows.map((f, i) => {
        const at = i / Math.max(1, n - 1);
        const tipEdge = at > 0.72 ? " hz-tip-end" : at < 0.28 ? " hz-tip-start" : "";
        const v = f.flow;
        const p = prev(i);
        const chg = f.close && p ? (f.close / p - 1) * 100 : null;
        const head = `${dayShort(f.date, asOf)} · 순유입 ${v == null ? "값 없음" : fmtFlow(v)}`;
        const tip = f.close ? `${head}\n종가 ${won(f.close)}${chg != null ? ` ${fmtPct(chg, 2)}` : ""}` : head;
        const h = v ? Math.abs(v) / range : 0;
        return (
          <span key={f.date} className={`hz-tip hz-vline${f.close ? " hz-tip-wide hz-tip-lines" : ""}${tipEdge}`} data-tip={tip}>
            {v != null && v !== 0 && (
              <i
                className={v > 0 ? "is-up" : "is-down"}
                style={{
                  bottom: `calc(var(--px-bars) * ${(v > 0 ? zb : zb - h).toFixed(4)})`,
                  height: `max(1px, calc(var(--px-bars) * ${h.toFixed(4)}))`,
                }}
              />
            )}
            {hasLine && f.close != null && (
              <span
                className="hz-vdot v2-tm-pxdot"
                style={{ top: `calc(var(--px-top) + (100% - var(--px-top) - var(--px-bottom)) * ${(y(f.close) / 100).toFixed(4)})` }}
              />
            )}
          </span>
        );
      })}
      {hasLine && (
        <div className="v2-tm-pxpane" aria-hidden="true">
          <svg viewBox={`0 0 ${n} 100`} preserveAspectRatio="none">
            <defs>
              <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="currentColor" stopOpacity="0.06" />
                <stop offset="1" stopColor="currentColor" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={`${line} L${last.i + 0.5},100 L${first.i + 0.5},100 Z`} fill={`url(#${id})`} />
            <path d={line} className="v2-tm-px-line" vectorEffect="non-scaling-stroke" />
          </svg>
          {hiAt && loAt && hi > lo && (
            <>
              <span className={`v2-tm-pxlab is-hi${edge(hiAt.i)}`} style={{ left: `${xPct(hiAt.i)}%`, top: `${y(hi)}%` }}>
                최고 {won(hi)}
              </span>
              <span className={`v2-tm-pxlab is-lo${edge(loAt.i)}`} style={{ left: `${xPct(loAt.i)}%`, top: `${y(lo)}%` }}>
                최저 {won(lo)}
              </span>
            </>
          )}
          <span className="v2-tm-pxend" style={{ left: `${xPct(last.i)}%`, top: `${y(last.close)}%` }} />
        </div>
      )}
    </div>
  );
}

/**
 * 자금 흐름 — 메인 화면 아래 카드와 같은 꼴: 요약 칸 줄(카드 폭 · 칸 경계가 아래 두 칸 경계에 맞는다) → [일별 순유입 막대(석 달) | 기간별 순유입].
 * 요약 칸은 막대에서 셈해야 나오는 값만(최대 순유입 · 최대 순유출 날 — 막대는 말풍선을 열어야 값이 보인다) · 순자산 대비 1달 순유입.
 * 오른쪽 목록은 메인 화면 오른쪽 목록 한 벌(.v2-etf-R · 순위 20 · 이름 · 막대 64 · 숫자 64 · 72). 순유입은 좌수 변화 × NAV.
 */
export function FlowModule({ d }: { d: EtfDetail }) {
  const rows: { k: string; flow: number; inDays: number | null; days: number | null }[] = [
    ...(d.flowDay != null ? [{ k: "하루", flow: d.flowDay, inDays: null, days: null }] : []),
    ...d.periods.map((p) => ({ k: p.label, flow: p.flow, inDays: p.inDays, days: p.days })),
    // 1년 안에 상장했으면 1년 줄 대신 상장 이후 줄(수익률 카드의 큰 숫자와 같은 기간).
    ...(d.head.sinceListing ? [{ k: d.head.label, flow: d.head.flow, inDays: d.head.inDays, days: d.head.days }] : []),
  ];
  const max = Math.max(0, ...rows.map((r) => Math.abs(r.flow)));
  const first = d.flows[0]?.date;
  const last = d.flows[d.flows.length - 1]?.date;
  const valued = d.flows.filter((f): f is typeof f & { flow: number } => f.flow != null);
  const top = valued.reduce<(typeof valued)[number] | null>((m, f) => (f.flow > 0 && (!m || f.flow > m.flow) ? f : m), null);
  const bottom = valued.reduce<(typeof valued)[number] | null>((m, f) => (f.flow < 0 && (!m || f.flow < m.flow) ? f : m), null);
  const month = d.periods.find((p) => p.key === "m");
  const rate = month && d.netAsset > 0 ? (month.flow / d.netAsset) * 100 : null;
  return (
    <Module title="자금 흐름" className="v2-etfd-flowmod">
      <Facts
        cols={PANES_COLS}
        items={[
          {
            // '가장 많이 들어온 날'은 '최대 순유입'으로 — 시장 말로는 돈이 '들어왔다'보다 '유입됐다'가 자연스럽다(2026-10-12).
            k: top ? `최대 순유입 · ${dayShort(top.date, d.asOf)}` : "최대 순유입",
            v: top ? fmtFlow(top.flow) : "없음",
            tone: top ? "up" : undefined,
          },
          {
            k: bottom ? `최대 순유출 · ${dayShort(bottom.date, d.asOf)}` : "최대 순유출",
            v: bottom ? fmtFlow(bottom.flow) : "없음",
            tone: bottom ? "down" : undefined,
          },
          {
            k: "순자산 대비 1달 순유입",
            v: rate == null ? "없음" : fmtPct(rate),
            tone: rate == null ? undefined : rate > 0 ? "up" : rate < 0 ? "down" : undefined,
          },
        ]}
      />
      <div className="v2-etf-panes">
        <div className="v2-etf-list v2-etfd-flowpane">
          <div className="v2-etf-row v2-th v2-etfd-fhead">
            <span>순유입 · 종가</span>
            {first && last && (
              <span>
                {dayShort(first, d.asOf)} ~ {dayShort(last, d.asOf)}
              </span>
            )}
          </div>
          <div className="v2-etfd-trendwrap">
            <FlowPriceTrend flows={d.flows} asOf={d.asOf} id={`px-${d.code}`} />
          </div>
        </div>
        <div className="v2-etf-list">
          <div className="v2-etf-row v2-etf-R v2-th">
            <span />
            <span>기간</span>
            <span />
            <span>순유입</span>
            <span>순유입일</span>
          </div>
          <ol className="v2-etf-body">
            {rows.map((r) => (
              <li key={r.k} className="v2-etf-row v2-etf-R">
                <span />
                <span className="v2-td-name is-plain">{r.k}</span>
                <DivBar v={r.flow} max={max} />
                <span className={`v2-td-num${flowTone(r.flow)}`}>{fmtFlow(r.flow)}</span>
                {r.inDays == null ? (
                  // 그날 빠졌으면 '연속 0일' — '없음'은 값이 없다는 말로 읽혔다(2026-10-12).
                  <span className="v2-td-num">연속 {d.streak}일</span>
                ) : (
                  <span className="v2-td-num">
                    {r.inDays}
                    <span className="v2-etf-unit">/{r.days}일</span>
                  </span>
                )}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </Module>
  );
}

/** 분배금 표에 펴는 줄 수 — 옆 달 막대 칸 키에 맞춘다(월 분배 열두 번을 다 펴면 오른쪽 칸 아래가 비었다). */
const DIST_ROWS = 6;
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

/**
 * 분배금 — 메인 화면 아래 카드와 같은 꼴: 요약 칸 줄(기간 합 · 횟수 · 회당 평균) → [최근 분배 이력 | 달마다 받은 분배금].
 * 숫자 셋은 한때 오른쪽 칸 안 숫자 줄이었다 — 메인 화면은 숫자를 카드 위 요약 칸에 두어 두 칸이 같은 머리 줄에서 시작한다(2026-10-12 짜임새 점검).
 * 달 막대는 종목 상세 배당 카드의 .v2-sk-months 를 그대로 쓴다(같은 말엔 같은 꼴).
 */
export function DistModule({ d }: { d: EtfDetail }) {
  const dist = d.dist!;
  const shown = dist.payments.slice(0, DIST_ROWS);
  const byMonth = new Array<number>(13).fill(0);
  for (const p of dist.payments) {
    const day = p.record ?? p.pay;
    if (day && day > d.head.from && day <= d.asOf && p.pay) byMonth[Number(p.pay.slice(5, 7))] += p.amount;
  }
  const max = Math.max(...byMonth);
  const inPeriod = dist.payments.filter((p) => {
    const day = p.record ?? p.pay;
    return day && day > d.head.from && day <= d.asOf && p.pct != null;
  });
  const avgPct = inPeriod.length ? inPeriod.reduce((s, p) => s + p.pct!, 0) / inPeriod.length : null;
  // 1년에 두 번 이하(연 · 반기 분배)면 달 막대 칸을 두지 않는다 — 이력이 한두 줄이라 옆 칸 키에 맞추느라 한 줄이 90px 로 늘었다(머니마켓 · 2026-10-12).
  const paired = dist.yearCount >= 3;
  return (
    <Module
      title="분배금"
      meta={d.head.label}
      // 배당으로 살기(/dividend)에 이 ETF 를 담아 연다 — `?add=코드` 로 열면 담긴 채 주수 칸에 커서가 선다(종목 상세 배당 카드와 같은 단추 ·
      // 같은 말 '내 배당 포폴에 추가하기' · 2026-10-12). 배당 화면은 etf_dividend 의 국내 ETF 를 다 싣는다 — 이 카드가 서는 ETF(분배 기록이 있는 것)는 다 담긴다.
      aside={
        <Link
          href={`${DIVIDEND_PAGE.href}?add=${encodeURIComponent(d.code)}`}
          className="v2-add-btn"
          data-ga="cta_click"
          data-ga-cta="to_dividend_calc"
          data-ga-surface="etf_page"
        >
          <Icon name="add_circle" />
          {DIVIDEND_ADD_LABEL}
        </Link>
      }
      className="v2-etfd-distmod"
    >
      <Facts
        // 짝 칸(달 막대)이 없어도 위 '자금 흐름' 요약 칸과 같은 틀 — 3등분이면 세로선이 383 · 765 대 388 · 776 으로 어긋났다(2026-10-13).
        cols={PANES_COLS}
        items={[
          { k: `${d.head.label} 분배금 합`, v: won(dist.yearSum) },
          { k: "분배 횟수", v: `${dist.yearCount}회` },
          // 회당 분배금을 그 기준일 종가로 나눈 값의 평균(표의 '종가 대비' 칸 평균).
          { k: "회당 평균 분배율", v: avgPct == null ? "없음" : `${avgPct.toFixed(2)}%` },
        ]}
      />
      {paired ? (
        <div className="v2-etf-panes">
          <div className="v2-etf-list">
            <div className="v2-etf-row v2-etf-L v2-th" style={{ ["--n" as string]: 3 }}>
              <span />
              <span>기준일</span>
              <span>지급일</span>
              <span>분배금</span>
              <span>종가 대비</span>
            </div>
            <ol className="v2-etf-body">
              {shown.map((p, i) => (
                <li key={`${p.record}-${p.pay}-${i}`} className="v2-etf-row v2-etf-L" style={{ ["--n" as string]: 3 }}>
                  <span className="v2-td-rank">{i + 1}</span>
                  <span className="v2-td-name is-plain">{p.record ? dayShort(p.record, d.asOf) : "없음"}</span>
                  <span className="v2-td-num">{p.pay ? dayShort(p.pay, d.asOf) : "없음"}</span>
                  <span className="v2-td-num">{won(p.amount)}</span>
                  <span className={`v2-td-num${p.pct == null ? " is-none" : ""}`}>{p.pct == null ? "없음" : `${p.pct.toFixed(2)}%`}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="v2-etf-list v2-etfd-mpane">
            <div className="v2-etf-row v2-th v2-etfd-fhead">
              <span>달마다 받은 분배금</span>
              {dist.next && <span>다음 지급 {shortDate(dist.next.date)}</span>}
            </div>
            {max > 0 && (
              <div className="v2-etfd-mbody">
                <div
                  className="v2-sk-months"
                  role="img"
                  aria-label={`지급 달 ${MONTHS.filter((m) => byMonth[m] > 0)
                    .map((m) => `${m}월`)
                    .join(" · ")}`}
                >
                  {MONTHS.map((m) => {
                    const v = byMonth[m];
                    return (
                      <span
                        key={m}
                        className={`hz-tip${m >= 10 ? " hz-tip-end" : m <= 3 ? " hz-tip-start" : ""}`}
                        data-tip={v > 0 ? `${m}월 · ${won(v)}` : `${m}월 · 지급 없음`}
                      >
                        <span className="v2-sk-mbar">
                          <i className={v > 0 ? undefined : "is-none"} style={{ height: v > 0 ? `${Math.max(8, (v / max) * 100)}%` : 3 }} />
                        </span>
                        <em>{m}<span className="v2-sk-mu">월</span></em>
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="v2-etf-list">
          <div className="v2-etf-row v2-etf-L v2-th" style={{ ["--n" as string]: 3 }}>
            <span />
            <span>기준일</span>
            <span>지급일</span>
            <span>분배금</span>
            <span>종가 대비</span>
          </div>
          <ol className="v2-etf-body">
            {shown.map((p, i) => (
              <li key={`${p.record}-${p.pay}-${i}`} className="v2-etf-row v2-etf-L" style={{ ["--n" as string]: 3 }}>
                <span className="v2-td-rank">{i + 1}</span>
                <span className="v2-td-name is-plain">{p.record ? dayShort(p.record, d.asOf) : "없음"}</span>
                <span className="v2-td-num">{p.pay ? dayShort(p.pay, d.asOf) : "없음"}</span>
                <span className="v2-td-num">{won(p.amount)}</span>
                <span className={`v2-td-num${p.pct == null ? " is-none" : ""}`}>{p.pct == null ? "없음" : `${p.pct.toFixed(2)}%`}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </Module>
  );
}

/**
 * 같은 지수 ETF — 메인 화면 '지수별 ETF 비교'와 같은 꼴: 요약 칸 줄(보수 가장 낮음 · 가장 비싼 곳과 1년 보수 차이 · 이 ETF 의 순자산 비중) → 같은 칸의 표
 * (열 줄 + 더 보기 · SiblingTable.tsx).
 */
export function SiblingModule({ d }: { d: EtfDetail }) {
  const fees = d.siblings.filter((s) => s.fee != null).map((s) => s.fee!);
  const minFee = fees.length ? Math.min(...fees) : null;
  const maxFee = fees.length ? Math.max(...fees) : null;
  const feeGap = minFee != null && maxFee != null ? ((maxFee - minFee) / 100) * 1000 : null;
  const brands = minFee == null ? [] : [...new Set(d.siblings.filter((s) => s.fee === minFee).map((s) => s.name.split(" ")[0]))];
  const total = d.siblings.reduce((a, s) => a + s.netAsset, 0);
  const self = d.siblings.find((s) => s.self);
  return (
    <Module title="같은 지수 ETF" meta={`${d.index?.label ?? ""} · ${d.siblings.length}개`} className="v2-etfd-sibmod">
      {/* 위 '자금 흐름' · '분배금' 요약 칸과 같은 틀 — 3등분이면 세로선이 388 · 776 으로 위 두 카드(383 · 765)와 어긋났다(2026-10-13 "오와 열"). */}
      <Facts
        cols={PANES_COLS}
        items={[
          { k: lowestFeeLabel(brands), v: fmtFee(minFee) },
          { k: FEE_GAP_LABEL, v: feeGapText(feeGap) },
          { k: "같은 지수 중 순자산 비중", v: self && total > 0 ? `${((self.netAsset / total) * 100).toFixed(1)}%` : "없음" },
        ]}
      />
      <SiblingTable siblings={d.siblings} minFee={minFee} />
    </Module>
  );
}
