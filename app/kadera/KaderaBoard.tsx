import Link from "next/link";

import { StockLogo } from "../StockLogo";
import { AiMark } from "../ui";
import { PagerControls, PagerRows, PagerScope } from "./Pager";
import { Module } from "./V2Modules";

/**
 * v2 국장 카더라의 신호 표 — 급부상 · 오늘 움직인 종목 · 많이 언급(2026-10-02 3차).
 *
 * 표마다 모듈 한 장이다(머리 띠 + 1px 테두리). 2차의 '줄에 마우스를 올리면 오른쪽 칸이 그 종목으로 바뀌는' 칸은
 * 토스 홈의 얼개 그대로라 걷었다. 대신 줄이 문장을 한 줄로 끝까지 싣고, 잘린 문장은 줄에 마우스를 올리면 전문이
 * 뜬다(title). 줄을 누르면 그 종목 화면 — 거기가 종목 하나의 자료를 다 모은 자리다.
 * 조회는 하지 않는다 — 서버(page.tsx)가 줄을 다 만들어 넘긴다.
 *
 * 2026-10-02 '헷갈리는 것 걷기'로 뺀 것: 7일 언급 막대 칸. 한 화면에 기간이 2·3·7·14·30일로 다섯 갈래라 무엇이 며칠인지
 * 놓쳤고, 급부상은 빨강·많이 언급은 파랑이라 같은 막대가 표마다 색이 달랐다. 흐름은 종목 화면에서 본다.
 */
export type BoardRow = {
  code: string;
  name: string;
  market: string | null;
  change: number | null;
  tag?: string;
  /** 꼬리표에 마우스를 올리면 뜨는 뜻(15자 안). */
  tagTip?: string;
  /** 등락률 뒤 숫자 칸들(이미 꼴을 갖춘 글자). hot 이면 빨간 잉크. */
  cells: { v: string; hot?: boolean }[];
  /** 마지막 칸 문장(두 줄까지). */
  text: string | null;
  /** 줄에 마우스를 올리면 뜨는 전문. 없으면 text. */
  full?: string | null;
  pending?: string;
};

export type BoardSection = {
  id: string;
  title: string;
  meta?: string;
  kind: "surge" | "move" | "talk";
  heads: string[];
  /** 첫 숫자 칸의 이름(폰에서 값 앞에 붙는다). 폰은 표 머리 줄을 숨겨 '6.2배'만 남으면 무엇의 배수인지 몰랐다. */
  key0?: string;
  /** 마지막 칸이 생성형 AI 문장이면 그 머리에 AI 표시(이용약관 4조). */
  aiText?: boolean;
  rows: BoardRow[];
  empty: string;
};

/** 한 쪽에 서는 줄 수. 표는 이만큼씩 쪽을 넘긴다(Pager.tsx). page.tsx 가 줄 수를 이 수의 배수로 자른다(쪽마다 꽉 차게). */
export const PAGE_ROWS = 5;

const pct = (r: number) => `${r > 0 ? "+" : r < 0 ? "-" : ""}${Math.abs(r).toFixed(2)}%`;
const chgCls = (r: number | null) => (r === null ? "" : r > 0 ? " is-up" : r < 0 ? " is-down" : "");

export function SignalTable({ sec }: { sec: BoardSection }) {
  const last = sec.heads.length - 1;
  return (
    <PagerScope id={sec.id} rows={sec.rows.length} size={PAGE_ROWS}>
      {/* 많이 언급(talk)은 줄이 두 층이다 — 숫자 줄 아래 흐름 요약이 판 폭을 다 쓴다(v2.css). 그 칸엔 머리가 없으니 AI 표시는 모듈 제목 앞으로. */}
      <Module id={sec.id} title={sec.title} meta={sec.meta} aside={<PagerControls label={sec.title} />} ai={sec.kind === "talk" && sec.aiText}>
        {sec.rows.length === 0 ? (
          <p className="v2-empty">{sec.empty}</p>
        ) : (
          <div className={`v2-tbl is-${sec.kind}`}>
            <div className="v2-tr v2-th" aria-hidden="true">
              {sec.heads.map((h, i) => (
                <span key={i}>
                  {i === last && sec.aiText && sec.kind !== "talk" && <AiMark size={11} />}
                  {h}
                </span>
              ))}
            </div>
            <PagerRows>
              {sec.rows.map((r, i) => (
                <li key={r.code}>
                  <Link
                    href={`/stock/${r.code}`}
                    className="v2-tr"
                    title={r.full ?? r.text ?? undefined}
                    // 표마다 이벤트 이름을 따로 둔다 — 맞춤 측정기준 없이도 GA 에서 이름만으로 어느 표가 눌리는지 센다(유용함을 재는 잣대).
                    data-ga={`kadera_${sec.id}_click`}
                  >
                    <span className="v2-td-rank">{i + 1}</span>
                    <span className="v2-td-stock">
                      <StockLogo code={r.code} name={r.name} market={r.market} size={22} />
                      <span className="v2-td-name">{r.name}</span>
                      {r.tag && (
                        <span className={`v2-badge${r.tagTip ? " hz-tip" : ""}`} data-tip={r.tagTip}>
                          {r.tag}
                        </span>
                      )}
                    </span>
                    {/* 값이 없으면 '-' 대신 '없음' — 바로 옆 칸들의 '-0.73%' 와 같은 글자라 내렸다는 뜻으로 읽혔다. */}
                    <span className={`v2-td-num v2-td-chg${chgCls(r.change)}${r.change === null ? " is-none" : ""}`}>{r.change === null ? "없음" : pct(r.change)}</span>
                    {r.cells.map((c, k) => (
                      <span key={k} className={`v2-td-num v2-td-c${k}${c.hot ? " is-hot" : ""}`} data-k={k === 0 ? sec.key0 : undefined}>
                        {c.v}
                      </span>
                    ))}
                    <span className={`v2-td-text${r.text ? "" : " is-pending"}`}>{r.text ?? r.pending ?? ""}</span>
                  </Link>
                </li>
              ))}
            </PagerRows>
          </div>
        )}
      </Module>
    </PagerScope>
  );
}
