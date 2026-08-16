import { type SeohakDaily } from "@/lib/seohak-daily";
import { BUY, SELL } from "./tone";
import { C, Icon, MONO, R } from "../ui";

/**
 * 일별 층.
 *
 * ## 세 번째 판 — 규칙을 정하고 다시 짰다 (2026-08-16)
 *
 * 앞의 두 판이 "무슨 말인지 모르겠다"는 평을 받았다. 원인은 배치나 크기가 아니라
 * **무엇을 화면에 내놓았는가**였다.
 *
 *  ⛔ 지표를 정규화 배수(0.930 · 0.641 · 1.18)로 만들어 놓고 그 배수를 그대로 노출했다.
 *     그건 분석가의 언어다. 독자는 "0.930이 뭔데"에서 멈춘다.
 *  ⛔ 비교 대상이 화면에 없었다. 배수만 있고 '평소'가 안 보이니 크고 작음을 판단할 수 없다.
 *
 * 그래서 규칙 셋을 두고 전부 고쳤다.
 *
 *  ① **큰 숫자는 배수가 아니라 실제 값**이다. 배수는 그림의 눈금으로만 쓰고 안 보여준다.
 *  ② **결론은 문장으로** 쓴다. "평소보다 7% 적게 샀습니다" 처럼 읽으면 끝나야 한다.
 *  ③ 제목 아래 **설명 한 줄**을 둔다(브리핑의 desc 와 같은 자리). 각주는 출처·한계만.
 */

export const usd = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${Math.round(v).toLocaleString("ko-KR")}`;
};
export const cnt = (v: number) => v.toLocaleString("ko-KR");
/** 배수를 사람 말로. 1.184 → "18% 더". 0.739 → "26% 덜". */
export const asPct = (mult: number) => {
  const d = Math.round(Math.abs(mult - 1) * 100);
  if (d === 0) return "평소와 같이";
  return `${d}% ${mult > 1 ? "더" : "덜"}`;
};

export function Card({
  icon,
  title,
  desc,
  note,
  foot,
  children,
}: {
  icon: string;
  title: string;
  /** 제목 아래 한 줄. 이 카드가 무엇을 재는지 여기서 끝내야 한다. */
  desc: string;
  note?: string;
  foot: string;
  children: React.ReactNode;
}) {
  return (
    <section className="hz-sheet" style={{ padding: "var(--hz-card-pad)", display: "flex",
                                           flexDirection: "column", gap: 14, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <Icon name={icon} style={{ fontSize: 18, color: C.muted, marginTop: 1, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
          <h3 style={{ margin: 0, fontSize: 13.5, fontWeight: 800, color: C.ink,
                       lineHeight: 1.3, letterSpacing: "-.01em", wordBreak: "keep-all" }}>{title}</h3>
          <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.45, color: C.sub2, wordBreak: "keep-all" }}>{desc}</p>
        </div>
        {note && (
          <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, color: C.sub,
                         background: C.chip, borderRadius: R.pill, padding: "3px 8px" }}>{note}</span>
        )}
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>{children}</div>
      <p style={{ margin: 0, fontSize: 12, lineHeight: 1.45, color: C.sub2, wordBreak: "keep-all" }}>{foot}</p>
    </section>
  );
}

/** 결론 문장. 카드마다 같은 자리에서 같은 크기로 나온다. */
export function Verdict({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ margin: 0, fontSize: 15, lineHeight: 1.45, fontWeight: 700, color: C.ink, wordBreak: "keep-all" }}>
      {children}
    </p>
  );
}

export const Em = ({ children }: { children: React.ReactNode }) => (
  <span style={{ color: C.blue }}>{children}</span>
);

/** 카드 격자. 세 층(일별·분기·ETF)이 같은 자를 쓴다.
 *  ⚠️ auto-**fill** 이다. auto-fit 은 빈 트랙을 접어서 마지막 줄에 혼자 남은 카드를
 *  행 전체로 늘려 버린다 — "카드 하나가 가로로 쭉 길어지는" 그 모양이다. */
export const CARD_GRID: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(min(300px, 100%), 1fr))",
  gap: 14,
};

/* ── ① 얼마나 샀고, 그게 평소와 얼마나 다른가 ────────────────────────
   원래 카드 둘이었다. '어제 얼마나 사고팔았나'(실제 금액)와 '평소보다 많이 했나'
   (평소 대비 배수)를 나란히 뒀는데, 둘 다 같은 하루를 말하면서 **어느 쪽도 혼자서는
   문장이 안 됐다.** 금액만 보면 큰지 작은지 모르고, 배수만 보면 얼마인지 모른다.

   합치면 한 줄이 된다: "$811M 샀는데 그건 평소보다 7% 적다."

   ⭐ 그리고 **평소 대비를 앞세운다.** 실제 금액은 위 달력의 오른쪽 칸이 아무 날짜나
   골라 보여주므로, 이 카드가 금액을 주인공으로 삼으면 히어로와 같은 말을 두 번 한다.
   여기서만 할 수 있는 말은 '평소와 견주면' 쪽이다. */
function DayVsUsual({ d }: { d: SeohakDaily }) {
  const rows = [
    { k: "사는 양", rel: d.regime.buy, amt: d.today.buy, n: d.today.buyCount, fill: BUY },
    { k: "파는 양", rel: d.regime.sell, amt: d.today.sell, n: d.today.sellCount, fill: SELL },
  ];
  const span = Math.max(0.2, ...rows.map((r) => Math.abs(r.rel - 1))) * 1.2;
  const up = (v: number) => v >= 1;
  // 네 조합을 문장으로. 사분면 이름("둘 다 줄었다")을 그대로 쓰면 그게 무슨 뜻인지
  // 또 설명해야 하므로, 뜻을 바로 적는다.
  const verdict = up(d.regime.buy) && up(d.regime.sell) ? (
    <>평소보다 <Em>사는 것도 파는 것도 늘었습니다</Em></>
  ) : !up(d.regime.buy) && !up(d.regime.sell) ? (
    <>평소보다 <Em>사는 것도 파는 것도 줄었습니다</Em></>
  ) : up(d.regime.buy) ? (
    <><Em>사는 쪽만</Em> 평소보다 늘었습니다</>
  ) : (
    <><Em>파는 쪽만</Em> 평소보다 늘었습니다</>
  );

  return (
    <>
      <Verdict>{verdict}</Verdict>
      <div style={{ display: "flex", flexDirection: "column", gap: 13, marginTop: "auto" }}>
        {rows.map((r) => {
          const w = (Math.abs(r.rel - 1) / span) * 50;
          const right = r.rel >= 1;
          return (
            <div key={r.k} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: C.label }}>{r.k}</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: right ? C.ink : C.blue }}>
                  {asPct(r.rel)}
                </span>
              </div>
              <span style={{ position: "relative", height: 14, background: C.soft, borderRadius: 3 }}>
                <span style={{ position: "absolute", left: "50%", top: -3, bottom: -3, width: 1.5, background: C.marker }} />
                <span style={{ position: "absolute", top: 3, height: 8, borderRadius: 2,
                               left: right ? "50%" : `${50 - w}%`, width: `${Math.max(1, w)}%`, background: r.fill }} />
              </span>
              {/* 배수 아래에 실제 값을 붙인다 — 이게 두 카드를 합친 이유다. */}
              <span style={{ fontSize: 11, color: C.sub2 }}>
                어제 <b style={{ fontFamily: MONO, color: C.ink }}>{usd(r.amt)}</b> · {cnt(r.n)}번
              </span>
            </div>
          );
        })}
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.faint }}>
          <span>덜 한다</span>
          <span>평소</span>
          <span>더 한다</span>
        </div>
      </div>
    </>
  );
}

/* ── ⑤ 사자와 팔자의 결 ─────────────────────────────────────────────────
   ⚠️⚠️ 앞 판은 **곱셈 항등식**이었다 — "판 돈은 산 돈의 85% = 파는 횟수 75% × 한 번의
   크기 113%". 수식으로는 우아한데 "왜 곱하기가 있는지 모르겠다"를 받았다.

   맞는 지적이다. 곱셈은 **읽는 사람에게 일을 시킨다.** 게다가 "75%"가 무엇의 75%인지
   화면에 없었다(사는 횟수의). 제목의 '사람'도 틀렸다 — 원천은 결제 건수다.

   그래서 식을 버리고 **양쪽을 나란히 놓는다.** 횟수는 사자가 길고 크기는 팔자가 긴,
   서로 엇갈리는 두 줄이 곧 결론이다. 곱하지 않아도 눈이 먼저 읽는다. */
function BuyerVsSeller({ d }: { d: SeohakDaily }) {
  const f = d.flow20;
  const rows = [
    {
      k: "몇 번",
      unit: "번",
      buy: f.buyCount,
      sell: f.sellCount,
      fmt: (v: number) => cnt(Math.round(v)),
    },
    {
      k: "한 번에 얼마",
      unit: "",
      buy: f.buyPer,
      sell: f.sellPer,
      fmt: (v: number) => `$${Math.round(v).toLocaleString("ko-KR")}`,
    },
  ];
  const bigger = d.sizeRatio >= 1;
  const fewer = d.countRatio < 1;

  return (
    <>
      <Verdict>
        파는 쪽은 <Em>{fewer ? "더 뜸하게" : "더 자주"}, {bigger ? "더 크게" : "더 잘게"}</Em> 움직입니다
      </Verdict>

      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
        {rows.map((r) => {
          const max = Math.max(r.buy, r.sell) || 1;
          return (
            <div key={r.k} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 11.5, color: C.sub2, fontWeight: 600 }}>{r.k}</span>
              {[
                { label: "사는 쪽", v: r.buy, tone: BUY },
                { label: "파는 쪽", v: r.sell, tone: SELL },
              ].map((side) => (
                <div key={side.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ flex: "0 0 46px", fontSize: 11.5, color: C.label }}>{side.label}</span>
                  <span style={{ flex: 1, height: 10, background: C.soft, borderRadius: 3,
                                 overflow: "hidden" }}>
                    <span style={{ display: "block", height: "100%", borderRadius: 3,
                                   width: `${(side.v / max) * 100}%`, background: side.tone }} />
                  </span>
                  <b style={{ flex: "0 0 66px", textAlign: "right", fontFamily: MONO, fontSize: 12,
                              fontWeight: 800, color: C.ink }}>
                    {r.fmt(side.v)}{r.unit}
                  </b>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ── ⑥ 산 돈은 어디서 왔나 ──────────────────────────────────────────────
   ⚠️⚠️ 두 판을 갈아엎었다.

   1판 "오간 돈과 남은 돈" — 분모가 매수+매도라 **머릿속에 안 그려졌다.** 사는 것과
   파는 것을 왜 더하나.
   2판 "새 돈은 얼마나 되나" — 분모는 고쳤는데 **'새 돈'이라는 말을 내가 지어냈다.**
   "새 돈이 무슨 뜻이냐"를 받았다. 스스로 설명이 안 되는 이름이었다.

   ⭐ 고쳐 놓고 보니 질문이 잘못돼 있었다. 이 데이터가 답하는 건 "얼마인가"가 아니라
   **"산 돈이 어디서 왔나"** 다. 그렇게 물으면 두 조각이 저절로 서로를 설명한다 —
   갖고 있던 걸 판 돈이거나, 새로 넣은 돈이거나. 둘뿐이고 겹치지 않는다.

   ⚠️ 합계에서 갈라낸 값이지 개인별 자금 출처가 아니다. 각주가 그걸 밝힌다. */
function WhereFrom({ d }: { d: SeohakDaily }) {
  const t = d.turnover;
  const fresh = Math.max(0, t.net);
  const recycled = Math.max(0, t.buy - fresh);
  const freshPct = t.buy ? (fresh / t.buy) * 100 : 0;

  return (
    <>
      <Verdict>
        산 돈의 <Em>{(100 - freshPct).toFixed(0)}%</Em>는 갖고 있던 걸 판 돈이었습니다
      </Verdict>

      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 9 }}>
        <div style={{ display: "flex", height: 30, gap: 2 }}>
          <span style={{ flex: 1, background: C.track, borderRadius: 3 }} />
          <span style={{ width: `${Math.max(3, freshPct)}%`, background: BUY, borderRadius: 3 }} />
        </div>
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex",
                     flexDirection: "column", gap: 6 }}>
          {[
            { c: C.track, k: "갖고 있던 걸 판 돈", v: usd(recycled), n: `${(100 - freshPct).toFixed(0)}%` },
            { c: BUY, k: "새로 넣은 돈", v: usd(fresh), n: `${freshPct.toFixed(0)}%` },
          ].map((r) => (
            <li key={r.k} style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 11.5 }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, background: r.c, flexShrink: 0 }} />
              <span style={{ color: C.sub }}>{r.k}</span>
              <span style={{ marginLeft: "auto", color: C.faint, fontSize: 10 }}>{r.n}</span>
              <b style={{ fontFamily: MONO, color: C.ink, minWidth: 62, textAlign: "right" }}>{r.v}</b>
            </li>
          ))}
        </ul>
        <span style={{ fontSize: 11, color: C.sub2, paddingTop: 6,
                       borderTop: `1px solid ${C.line}` }}>
          {t.days}거래일 동안 <b style={{ fontFamily: MONO, color: C.ink }}>{usd(t.buy)}</b>어치를 사고{" "}
          <b style={{ fontFamily: MONO, color: C.ink }}>{usd(t.sell)}</b>어치를 팔았습니다
        </span>
      </div>
    </>
  );
}

/* ── ⑦ 오늘 몇 명이 움직였나 ───────────────────────────────────────────
   이 카드만 **건수**를 본다. 금액은 큰손 하나가 흔들 수 있지만 건수는 못 흔든다 —
   1건당 평균이 $39,234 라 $1B 를 옮기려면 2만 5천 번을 눌러야 한다.

   그림은 최근 60영업일을 그대로 세워 놓은 기둥이다. "오늘이 이 무리 안에서 어디쯤"이
   질문이므로, 백분위 숫자만 쓰면 독자가 무리를 상상해야 한다. 무리를 그려 주고 오늘만
   칠하면 상상할 게 없다. */
function HowManyToday({ d }: { d: SeohakDaily }) {
  const spark = d.countSpark;
  const max = Math.max(...spark);
  const median = [...spark].sort((a, b) => a - b)[Math.floor(spark.length / 2)];
  const p = Math.round(d.countPercentile);
  const vsMedian = Math.round((d.today.buyCount / median - 1) * 100);

  return (
    <>
      <Verdict>
        {p >= 80 ? (
          <>평소보다 <Em>훨씬 자주</Em> 샀습니다</>
        ) : p >= 55 ? (
          <>평소보다 <Em>조금 많이</Em> 샀습니다</>
        ) : p >= 25 ? (
          <><Em>평범한 하루</Em>였습니다</>
        ) : (
          <>평소보다 <Em>조용한 하루</Em>였습니다</>
        )}
      </Verdict>

      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
          <span style={{ fontSize: 12, color: C.sub, fontWeight: 600 }}>어제 산 횟수</span>
          <span style={{ fontFamily: MONO, fontSize: 21, fontWeight: 800, color: C.ink,
                         letterSpacing: "-0.02em" }}>{cnt(d.today.buyCount)}번</span>
        </div>
        {/* 60일 기둥. 중앙값 선을 하나 그어야 '높다·낮다'가 눈으로 판정된다. */}
        <div style={{ position: "relative", display: "flex", alignItems: "flex-end",
                      gap: 1.5, height: 46 }}>
          <span aria-hidden style={{ position: "absolute", left: 0, right: 0,
                                     bottom: `${(median / max) * 100}%`, height: 1,
                                     background: C.line, zIndex: 1 }} />
          {spark.map((v, i) => (
            <span key={i} style={{ flex: 1, height: `${Math.max(4, (v / max) * 100)}%`,
                                   borderRadius: 1,
                                   background: i === spark.length - 1 ? C.blue : C.track }} />
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.faint }}>
          <span>60영업일 전</span>
          <span style={{ color: C.sub2, fontWeight: 700 }}>
            중앙값보다 {Math.abs(vsMedian)}% {vsMedian >= 0 ? "많음" : "적음"}
          </span>
        </div>
      </div>
    </>
  );
}

export function DailySection({ d }: { d: SeohakDaily }) {
  return (
    <div style={CARD_GRID}>
      <Card icon="swap_vert" title="평소와 얼마나 다른가"
            desc="어제 사고판 양을 각각 평소와 견줍니다."
            note="최근 20일"
            foot={`'평소'는 앞뒤 반년의 중앙값입니다. 한 번 살 때 평균 $${Math.round(d.perTrade).toLocaleString("ko-KR")}.`}>
        <DayVsUsual d={d} />
      </Card>

      <Card icon="compare_arrows" title="사자와 팔자의 결"
            desc="사는 쪽과 파는 쪽이 어떻게 다르게 움직이는지입니다."
            note="최근 20일"
            foot="원천이 결제 건수라 사람 수가 아니라 거래 횟수입니다. 한 사람이 여러 번 눌렀을 수 있습니다.">
        <BuyerVsSeller d={d} />
      </Card>

      <Card icon="savings" title="산 돈은 어디서 왔나"
            desc="1년간 산 돈을 판 돈과 새로 넣은 돈으로 가릅니다."
            note="최근 1년"
            foot="산 돈에서 판 돈을 뺀 나머지가 새로 넣은 몫입니다. 합계로 갈라낸 값이라 누가 무슨 돈으로 샀는지는 아닙니다.">
        <WhereFrom d={d} />
      </Card>

      <Card icon="bar_chart" title="어제 몇 번 샀나"
            desc="금액 말고 산 횟수만 셉니다. 큰손 하나가 못 흔드는 값입니다."
            note="최근 60일"
            foot="원천이 결제 건수라 사람 수가 아니라 거래 횟수입니다.">
        <HowManyToday d={d} />
      </Card>
    </div>
  );
}
