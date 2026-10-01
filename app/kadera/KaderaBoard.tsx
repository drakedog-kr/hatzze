"use client";

import Link from "next/link";
import { useState } from "react";

import { StockLogo } from "../StockLogo";
import { AiMark, Icon } from "../ui";

/**
 * v2 국장 카더라의 가운데 판 — 토스증권 홈 '실시간 차트 + 종목 정보'의 얼개(2026-10-02, 해부 노트 5·6·12절).
 *
 * 왼쪽은 표 셋(급부상 · 오늘 움직인 종목 · 많이 언급)을 탭 없이 차례로 쌓는다. 오른쪽 360px 읽기 칸은 평소에
 * '오늘의 요약'을 보여 주고, **표의 줄에 마우스를 올리면 그 종목 정보로 바뀐다**(토스와 같다 — 누르지 않는다).
 * 판 밖으로 마우스가 나가면 다시 요약으로 돌아온다. 줄을 누르면 그 종목 화면으로 간다.
 *
 * 좁은 판(<1100)에선 호버가 없거나 읽기 칸이 표 옆에 못 서므로, 읽기 칸은 늘 요약이고 표 줄이 둘째 줄에 문장을 단다(v2.css).
 * 조회는 하지 않는다 — 서버(page.tsx)가 줄과 종목 정보를 다 만들어 넘긴다.
 */
export type BoardRow = {
  code: string;
  name: string;
  market: string | null;
  change: number | null;
  tag?: string;
  /** 등락률 뒤 숫자 칸들(이미 꼴을 갖춘 글자). hot 이면 빨간 잉크. */
  cells: { v: string; hot?: boolean }[];
  /** 7일 언급 막대. 없으면 그 칸을 비운다. */
  bars?: { values: number[]; hot: number; tone: "warm" | "cold" } | null;
  /** 마지막 칸 문장(짧게 자른다 — 전문은 읽기 칸에). */
  text: string | null;
  pending?: string;
};

export type BoardSection = {
  id: string;
  title: string;
  meta?: string;
  kind: "surge" | "move" | "talk";
  heads: string[];
  rows: BoardRow[];
  empty: string;
};

export type PaneStock = {
  code: string;
  name: string;
  market: string | null;
  price: number | null;
  change: number | null;
  priceNote: string | null;
  series: number[];
  dates: string[];
  hot: number;
  tone: "warm" | "cold";
  facts: { k: string; v: string; hot?: boolean }[];
  notes: { cap: string; text: string | null; fallback: string }[];
};

const pct = (r: number) => `${r > 0 ? "+" : r < 0 ? "-" : ""}${Math.abs(r).toFixed(2)}%`;
const chgCls = (r: number | null) => (r === null ? "" : r > 0 ? " is-up" : r < 0 ? " is-down" : "");
const md = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}`;
};

function Bars({ values, hot, tone, big }: { values: number[]; hot: number; tone: "warm" | "cold"; big?: boolean }) {
  const max = Math.max(1, ...values);
  const start = values.length - Math.min(hot, values.length);
  let peak = -1;
  for (let i = start; i < values.length; i++) if (peak < 0 || values[i] > values[peak]) peak = i;
  return (
    <span className={`v2-bars is-${tone}${big ? " is-big" : ""}`} aria-hidden="true">
      {values.map((v, i) => (
        <i key={i} className={i < start ? "is-off" : i === peak ? "is-peak" : undefined} style={{ height: v > 0 ? `max(3px, ${(v / max) * 100}%)` : 2 }} />
      ))}
    </span>
  );
}

function StockPane({ s }: { s: PaneStock }) {
  return (
    <div className="v2-pane-stock">
      <div className="v2-ps-head">
        <StockLogo code={s.code} name={s.name} market={s.market} size={32} />
        <span className="v2-ps-id">
          <b>{s.name}</b>
          <span>
            {s.code}
            {s.market && ` · ${s.market === "KOSDAQ" ? "코스닥" : "코스피"}`}
          </span>
        </span>
      </div>
      <div className="v2-ps-quote">
        {s.price !== null ? <b>{s.price.toLocaleString("ko-KR")}원</b> : <span className="v2-muted">가격 정보 준비 중</span>}
        {s.change !== null ? <span className={`v2-ps-chg${chgCls(s.change)}`}>{pct(s.change)}</span> : s.priceNote && <span className="v2-muted">{s.priceNote}</span>}
      </div>
      {s.facts.length > 0 && (
        <dl className="v2-ps-facts">
          {s.facts.map((f) => (
            <div key={f.k}>
              <dt>{f.k}</dt>
              <dd className={f.hot ? "is-hot" : undefined}>{f.v}</dd>
            </div>
          ))}
        </dl>
      )}
      {s.notes.map((n) => (
        <div key={n.cap} className="v2-ps-note">
          <span className="v2-ps-cap">
            <AiMark size={13} />
            {n.cap}
          </span>
          <p className={n.text ? undefined : "v2-muted"}>{n.text ?? n.fallback}</p>
        </div>
      ))}
      {s.series.length > 1 && (
        <div className="v2-ps-chart">
          <span className="v2-ps-cap">최근 {s.series.length}일 언급</span>
          <Bars values={s.series} hot={s.hot} tone={s.tone} big />
          <span className="v2-ps-axis">
            <span>{md(s.dates[0])}</span>
            <span>{md(s.dates[s.dates.length - 1])}</span>
          </span>
        </div>
      )}
      <div className="v2-ps-links">
        <Link href={`/stock/${s.code}`}>
          종목 화면
          <Icon name="chevron_right" />
        </Link>
        <Link href={`/mdd?code=${s.code}${s.market ? `&market=${s.market}` : ""}`}>
          MDD 정밀분석
          <Icon name="chevron_right" />
        </Link>
      </div>
    </div>
  );
}

export function KaderaBoard({
  sections,
  stocks,
  summary,
  after,
}: {
  sections: BoardSection[];
  stocks: Record<string, PaneStock>;
  /** 읽기 칸의 평소 모습(오늘의 요약). 서버가 그린다. */
  summary: React.ReactNode;
  /** 표 셋 아래 왼쪽 칸에 붙는 것(화제어 칩). */
  after?: React.ReactNode;
}) {
  const [sel, setSel] = useState<string | null>(null);
  const picked = sel ? stocks[sel] : undefined;
  return (
    <div className="v2-board" onMouseLeave={() => setSel(null)}>
      <div className="v2-tables">
        {sections.map((sec) => (
          <section key={sec.id} id={sec.id} className="v2-sec">
            <header className="v2-sec-head">
              <h2>{sec.title}</h2>
              {sec.meta && <span>{sec.meta}</span>}
            </header>
            {sec.rows.length === 0 ? (
              <p className="v2-empty">{sec.empty}</p>
            ) : (
              <div className={`v2-tbl is-${sec.kind}`}>
                <div className="v2-tr v2-th" aria-hidden="true">
                  {sec.heads.map((h, i) => (
                    <span key={i}>{h}</span>
                  ))}
                </div>
                <ol>
                  {sec.rows.map((r, i) => (
                    <li key={r.code}>
                      <Link
                        href={`/stock/${r.code}`}
                        className={`v2-tr${sel === r.code ? " is-on" : ""}`}
                        onMouseEnter={() => setSel(r.code)}
                        onFocus={() => setSel(r.code)}
                      >
                        <span className="v2-td-rank">{i + 1}</span>
                        <span className="v2-td-stock">
                          <StockLogo code={r.code} name={r.name} market={r.market} size={24} />
                          <span className="v2-td-name">{r.name}</span>
                          {r.tag && <span className="v2-badge">{r.tag}</span>}
                        </span>
                        <span className={`v2-td-num v2-td-chg${chgCls(r.change)}`}>{r.change === null ? "-" : pct(r.change)}</span>
                        {r.cells.map((c, k) => (
                          <span key={k} className={`v2-td-num v2-td-c${k}${c.hot ? " is-hot" : ""}`}>
                            {c.v}
                          </span>
                        ))}
                        {sec.kind !== "move" && <span className="v2-td-bars">{r.bars && <Bars values={r.bars.values} hot={r.bars.hot} tone={r.bars.tone} />}</span>}
                        <span className={`v2-td-text${r.text ? "" : " is-pending"}`}>{r.text ?? r.pending ?? ""}</span>
                      </Link>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </section>
        ))}
        {after}
      </div>
      <aside className="v2-pane" data-mode={picked ? "stock" : "summary"} aria-live="polite">
        <div className="v2-pane-sum">{summary}</div>
        {picked && <StockPane s={picked} />}
      </aside>
    </div>
  );
}
