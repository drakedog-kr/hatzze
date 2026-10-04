import Link from "next/link";

import { StockLogo } from "../StockLogo";
import { Module, stockHref } from "./V2Modules";

/**
 * v2 카더라의 신호 표 — 급부상 · 오늘 움직인 종목 · 많이 언급(2026-10-02 3차). 미장 카더라도 같은 표를 쓴다(2026-10-03).
 *
 * 표마다 모듈 한 장이다(머리 띠 + 1px 테두리). 2차의 '줄에 마우스를 올리면 오른쪽 칸이 그 종목으로 바뀌는' 칸은
 * 토스 홈의 얼개 그대로라 걷었다. 대신 줄이 문장을 한 줄로 끝까지 싣고, 잘린 문장은 줄에 마우스를 올리면 전문이
 * 뜬다(title). 줄을 누르면 그 종목 화면 — 거기가 종목 하나의 자료를 다 모은 자리다.
 * 조회는 하지 않는다 — 서버(page.tsx)가 줄을 다 만들어 넘긴다.
 *
 * 2026-10-03 줄을 다섯에서 열로 늘려 다 펼친다. 스무 줄을 다섯 줄씩 쪽을 넘기게 했다가 "불편하다", 표 안 스크롤로 바꿨다가
 * "별로"라 둘 다 걷었다 — 누르지도 안에서 내리지도 않고 한 번에 보이는 것이 잣대다.
 *
 * 칸 차례는 순위 · 종목 · 문장 · 숫자(등락 · 평소 대비 · 언급)다(2026-10-04 "텍스트 배치 개선"). 숫자(오른쪽 정렬)가 문장(왼쪽 정렬) 앞에 서면
 * '6.9배'와 문장 첫 낱말이 12px 사이로 붙어 한 덩어리로 읽혔다 — 테마 판세 표들과 같은 규칙. heads 는 예전 차례(숫자 먼저)로 받아 여기서 돌린다.
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
  cells: { v: string; hot?: boolean; k?: string }[];
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

const pct = (r: number) => `${r > 0 ? "+" : r < 0 ? "-" : ""}${Math.abs(r).toFixed(2)}%`;
const chgCls = (r: number | null) => (r === null ? "" : r > 0 ? " is-up" : r < 0 ? " is-down" : "");

export function SignalTable({ sec }: { sec: BoardSection }) {
  const last = sec.heads.length - 1;
  // 머리 칸 차례 — 순위 · 종목 · 문장(heads 의 마지막) · 숫자들.
  const headOrder = [0, 1, last, ...Array.from({ length: Math.max(0, last - 2) }, (_, k) => k + 2)];
  return (
    /* AI 표시는 모듈 제목 앞에 둔다(네 표 같은 자리). 머리 칸에 두면 폰(머리 줄을 숨긴다)에서 고지가 사라졌다(2026-10-04 점검). */
    <Module id={sec.id} title={sec.title} meta={sec.meta} ai={sec.aiText}>
      {sec.rows.length === 0 ? (
        <p className="v2-empty">{sec.empty}</p>
      ) : (
        <div className={`v2-tbl is-${sec.kind}`}>
          <div className="v2-tr v2-th" aria-hidden="true">
            {headOrder.map((i) => (
              <span key={i}>{sec.heads[i]}</span>
            ))}
          </div>
          {/* 짝지은 칸보다 짧으면 줄이 고르게 늘어난다(v2.css .v2-grid .v2-tbody). */}
          <ol className="v2-tbody">
            {sec.rows.map((r, i) => (
              <li key={r.code}>
                <Link
                  // 국내는 종목 페이지, 미장은 내부자 리포트 종목 화면(stockHref). 시장을 모르면 국내로 본다(국장 표의 예전 동작).
                  href={stockHref(r.code, r.market) ?? `/stock/${r.code}`}
                  className="v2-tr"
                  // 줄에 다 보이는 문장은 OS 툴팁으로 한 번 더 띄우지 않는다 — 흐름 요약처럼 첫 문장만 보일 때만 전문을 단다.
                  title={r.full && r.full !== r.text ? r.full : undefined}
                  // 표마다 이벤트 이름을 따로 둔다 — 맞춤 측정기준 없이도 GA 에서 이름만으로 어느 표가 눌리는지 센다(유용함을 재는 잣대).
                  data-ga={`kadera_${sec.id}_click`}
                >
                  {/* 크게 움직인 종목은 번호를 안 단다 — 위 다섯 줄이 '오른 셋 + 내린 둘'이라 번호가 순위로 읽혀 −10% 종목이 +29.8% 종목보다
                      위로 보였다(2026-10-04 점검). 줄 순서는 그대로다. */}
                  <span className="v2-td-rank">{sec.kind === "move" ? "" : i + 1}</span>
                  <span className="v2-td-stock">
                    <StockLogo code={r.code} name={r.name} market={r.market} size={22} />
                    <span className="v2-td-name">{r.name}</span>
                    {r.tag && (
                      <span className={`v2-badge${r.tagTip ? " hz-tip" : ""}`} data-tip={r.tagTip}>
                        {r.tag}
                      </span>
                    )}
                  </span>
                  <span className={`v2-td-text${r.text ? "" : " is-pending"}`}>{r.text ?? r.pending ?? ""}</span>
                  {/* 값이 없으면 '-' 대신 '없음' — 바로 옆 칸들의 '-0.73%' 와 같은 글자라 내렸다는 뜻으로 읽혔다. */}
                  <span className={`v2-td-num v2-td-chg${chgCls(r.change)}${r.change === null ? " is-none" : ""}`}>{r.change === null ? "없음" : pct(r.change)}</span>
                  {r.cells.map((c, k) => (
                    <span key={k} className={`v2-td-num v2-td-c${k}${c.hot ? " is-hot" : ""}`} data-k={k === 0 ? (c.k === undefined ? sec.key0 : c.k || undefined) : undefined}>
                      {c.v}
                    </span>
                  ))}
                </Link>
              </li>
            ))}
          </ol>
        </div>
      )}
    </Module>
  );
}
