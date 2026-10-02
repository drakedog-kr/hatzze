import Link from "next/link";

import { StockLogo } from "../StockLogo";
import { AiMark } from "../ui";
import { Module } from "./V2Modules";

/**
 * v2 국장 카더라의 신호 표 — 급부상 · 오늘 움직인 종목 · 많이 언급(2026-10-02 3차).
 *
 * 표마다 모듈 한 장이다(머리 띠 + 1px 테두리). 2차의 '줄에 마우스를 올리면 오른쪽 칸이 그 종목으로 바뀌는' 칸은
 * 토스 홈의 얼개 그대로라 걷었다. 대신 줄이 문장을 한 줄로 끝까지 싣고, 잘린 문장은 줄에 마우스를 올리면 전문이
 * 뜬다(title). 줄을 누르면 그 종목 화면 — 거기가 종목 하나의 자료를 다 모은 자리다.
 * 조회는 하지 않는다 — 서버(page.tsx)가 줄을 다 만들어 넘긴다.
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
  /** 마지막 칸 문장(한 줄로 자르고, 전문은 title). */
  text: string | null;
  pending?: string;
};

export type BoardSection = {
  id: string;
  title: string;
  meta?: string;
  kind: "surge" | "move" | "talk";
  heads: string[];
  /** 마지막 칸이 생성형 AI 문장이면 그 머리에 AI 표시(이용약관 4조). */
  aiText?: boolean;
  rows: BoardRow[];
  empty: string;
};

const pct = (r: number) => `${r > 0 ? "+" : r < 0 ? "-" : ""}${Math.abs(r).toFixed(2)}%`;
const chgCls = (r: number | null) => (r === null ? "" : r > 0 ? " is-up" : r < 0 ? " is-down" : "");

function Bars({ values, hot, tone }: { values: number[]; hot: number; tone: "warm" | "cold" }) {
  const max = Math.max(1, ...values);
  const start = values.length - Math.min(hot, values.length);
  let peak = -1;
  for (let i = start; i < values.length; i++) if (peak < 0 || values[i] > values[peak]) peak = i;
  return (
    <span className={`v2-bars is-${tone}`} aria-hidden="true">
      {values.map((v, i) => (
        <i key={i} className={i < start ? "is-off" : i === peak ? "is-peak" : undefined} style={{ height: v > 0 ? `max(3px, ${(v / max) * 100}%)` : 2 }} />
      ))}
    </span>
  );
}

export function SignalTable({ sec }: { sec: BoardSection }) {
  const last = sec.heads.length - 1;
  return (
    <Module id={sec.id} title={sec.title} meta={sec.meta} aside={sec.rows.length > 0 ? `${sec.rows.length}종목` : undefined}>
      {sec.rows.length === 0 ? (
        <p className="v2-empty">{sec.empty}</p>
      ) : (
        <div className={`v2-tbl is-${sec.kind}`}>
          <div className="v2-tr v2-th" aria-hidden="true">
            {sec.heads.map((h, i) => (
              <span key={i}>
                {i === last && sec.aiText && <AiMark size={11} />}
                {h}
              </span>
            ))}
          </div>
          <ol>
            {sec.rows.map((r, i) => (
              <li key={r.code}>
                <Link href={`/stock/${r.code}`} className="v2-tr" title={r.text ?? undefined}>
                  <span className="v2-td-rank">{i + 1}</span>
                  <span className="v2-td-stock">
                    <StockLogo code={r.code} name={r.name} market={r.market} size={22} />
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
    </Module>
  );
}
