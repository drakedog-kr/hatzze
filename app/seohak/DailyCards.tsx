import { type SeohakDaily } from "@/lib/seohak-daily";
import type { SeohakYear } from "@/lib/seohak-yearly";
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

/* ── ① 평소와 얼마나 다른가 (한 행 전체) ──────────────────────────────
   ⚠️⚠️ **네 번째 판이다.** 앞의 셋이 각각 이렇게 실패했다.

   1판 두 줄짜리 배수 선 — 두 번 평활돼 모양이 없었고, 기준(±60일)이 나중에 바뀌었다.
   2판 거울 막대 240개 — "눈 아프다".
   3판 옅은 띠 + 5일 평균선 — 차분해졌지만 **여전히 지저분했다.** 띠 2 + 선 2 + 점선 2 +
       라벨 2 + 축까지 아홉 덩어리였다. 게다가 옆 스파크라인은 기준점이 없어 뜻이 없었다.

   ⭐ 근본 원인은 **내가 데이터를 자랑하고 있었다**는 것이다. 이 카드가 하는 말은 하나다 —
   "요즘 사는 양은 평소의 88%, 파는 양은 63%".

   그래서 **'평소의 몇 %' 한 가지 언어로 통일한다.** 세로축도, 옆 숫자 셋도 같은 자다.
   그림에 남는 건 기준선 하나 + 선 둘 + 끝점 둘, 다섯뿐이다. 스파크라인은 지웠다 —
   횟수도 같은 언어의 숫자 하나로 말하면 그림이 필요 없다. */
function VsUsual({ d }: { d: SeohakDaily }) {
  const r = d.recentPct;
  const W = 1000;
  const H = 170;
  const PAD = { t: 16, b: 22, l: 0, r: 0 };
  const vals = r.flatMap((p) => [p.buy, p.sell]);
  // 축은 늘 100(평소)을 품는다. 안 그러면 기준선이 밖으로 나가 '평소의 %'가 뜻을 잃는다.
  const lo = Math.min(100, ...vals) * 0.96;
  const hi = Math.max(100, ...vals) * 1.04;
  const x = (i: number) => (i / Math.max(1, r.length - 1)) * W;
  const y = (v: number) => H - PAD.b - ((v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
  const path = (k: "buy" | "sell") =>
    r.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join("");

  const tiles = [
    { k: "사는 양", v: d.vsUsual.buy, tone: BUY, sub: `어제 ${usd(d.today.buy)}` },
    { k: "파는 양", v: d.vsUsual.sell, tone: SELL, sub: `어제 ${usd(d.today.sell)}` },
    { k: "산 횟수", v: d.vsUsual.buyCount, tone: C.marker, sub: `어제 ${cnt(d.today.buyCount)}번` },
  ];
  const up = (v: number) => v >= 100;
  const verdict = up(d.vsUsual.buy) && up(d.vsUsual.sell) ? (
    <>요즘 <Em>사는 것도 파는 것도 평소보다 많습니다</Em></>
  ) : !up(d.vsUsual.buy) && !up(d.vsUsual.sell) ? (
    <>요즘 <Em>사는 것도 파는 것도 평소보다 적습니다</Em></>
  ) : up(d.vsUsual.buy) ? (
    <><Em>사는 쪽만</Em> 평소보다 많습니다</>
  ) : (
    <><Em>파는 쪽만</Em> 평소보다 많습니다</>
  );

  return (
    <>
      <Verdict>{verdict}</Verdict>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 18 }}>
        <div style={{ flex: "2 1 min(400px, 100%)", minWidth: 0 }}>
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}
               role="img" aria-label="사는 양과 파는 양이 평소의 몇 %인지, 최근 반년">
            <line x1={0} x2={W} y1={y(100)} y2={y(100)} stroke={C.marker} strokeWidth={1.5} />
            <text x={0} y={y(100) - 7} fontSize={14} fill={C.sub2} fontWeight={700}>평소</text>
            {(["sell", "buy"] as const).map((k) => (
              <path key={k} d={path(k)} fill="none" stroke={k === "buy" ? BUY : SELL}
                    strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
            ))}
            {(["sell", "buy"] as const).map((k) => (
              <circle key={k} cx={W} cy={y(r[r.length - 1][k])} r={5}
                      fill={k === "buy" ? BUY : SELL} stroke={C.card} strokeWidth={2} />
            ))}
            <text x={0} y={H - 4} fontSize={13} fill={C.faint}>
              {r[0]?.date.slice(0, 7).replace("-", "년 ")}월
            </text>
            <text x={W} y={H - 4} fontSize={13} fill={C.faint} textAnchor="end">어제</text>
          </svg>
        </div>

        <div style={{ flex: "1 1 min(210px, 100%)", minWidth: 0, display: "flex",
                      flexDirection: "column", gap: 8 }}>
          {tiles.map((t) => (
            <div key={t.k} style={{ background: C.soft, borderRadius: R.control, padding: "10px 12px",
                                    display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, background: t.tone, flexShrink: 0 }} />
              <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                <span style={{ fontSize: 12, color: C.label, fontWeight: 700 }}>{t.k}</span>
                <span style={{ fontSize: 10.5, color: C.faint }}>{t.sub}</span>
              </span>
              <span style={{ marginLeft: "auto", display: "flex", alignItems: "baseline", gap: 4 }}>
                <b style={{ fontFamily: MONO, fontSize: 20, fontWeight: 800, color: C.ink,
                            letterSpacing: "-0.02em" }}>{Math.round(t.v)}%</b>
                <span style={{ fontSize: 10.5, color: C.faint }}>평소의</span>
              </span>
            </div>
          ))}
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

/* ── ⑥ 쌓는 해인가, 빼는 해인가 ────────────────────────────────────────
   ⚠️⚠️ **다섯 판을 갈아엎고서야 질문이 잘못됐다는 걸 알았다.**

     1판 오간 돈과 남은 돈    분모가 매수+매도라 안 그려졌다
     2판 새 돈은 얼마나 되나  '새 돈'을 지어냈다
     3판 산 돈은 어디서 왔나  헤드라인이 근거(추론)를 넘었다
     4판 사고판 끝에 얼마가   '늘어난 것'이 수익으로 읽혔다
     5판 얼마나 사고팔았나    낱말은 맞는데 **"무슨 쓸모냐"**

   ⭐ 5판까지는 전부 "1년 치를 어떻게 말할까"를 고쳤는데, 진짜 문제는 **1년 치 정지된
   숫자엔 쓸모가 없다**는 것이었다. 한 번 보면 끝이고 알고 나서 할 게 없다.

   같은 값도 **여러 해를 나란히 놓으면 국면이 된다.** 실측하니 2020년엔 산 것의 18.1%가
   쌓였는데 **2023년은 −2.1%, 즉 순매도였다** — 나스닥이 43% 오른 해에 판 것이 더
   많았다. 정지된 숫자로는 절대 안 보이는 사실이고, 이게 이 카드의 쓸모다. */
function AccumulateOrDrain({ years }: { years: SeohakYear[] }) {
  const H = 120;
  const lo = Math.min(-3, ...years.map((y) => y.netPct));
  const hi = Math.max(3, ...years.map((y) => y.netPct));
  const zero = (hi / (hi - lo)) * H;
  const last = years[years.length - 1];
  const drained = years.filter((y) => y.net < 0);

  return (
    <>
      <Verdict>
        {last.netPct >= 0 ? (
          <>올해는 산 것의 <Em>{last.netPct.toFixed(0)}%</Em>가 쌓였습니다</>
        ) : (
          <>올해는 <Em>판 것이 더 많습니다</Em></>
        )}
      </Verdict>

      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 7 }}>
        {/* 0 선을 낀 막대. 위로 뻗으면 쌓은 해, 아래로 뻗으면 뺀 해다.
            비율 하나만 그리므로 눈금도 범례도 필요 없다. */}
        <div style={{ position: "relative", height: H, display: "flex", alignItems: "stretch",
                      gap: 5 }}>
          <span aria-hidden style={{ position: "absolute", left: 0, right: 0, top: zero,
                                     height: 1, background: C.marker }} />
          {years.map((y) => {
            const up = y.netPct >= 0;
            const h = (Math.abs(y.netPct) / (hi - lo)) * H;
            return (
              <div key={y.year} style={{ flex: 1, position: "relative", minWidth: 0 }}
                   title={`${y.year} · 산 것 ${usd(y.buy)} · 순매수 ${usd(y.net)}`}>
                <span style={{ position: "absolute", left: 0, right: 0,
                               top: up ? zero - h : zero, height: Math.max(3, h),
                               background: up ? BUY : SELL, borderRadius: 3,
                               opacity: y.partial ? 0.45 : 1 }} />
                <span style={{ position: "absolute", left: 0, right: 0,
                               top: up ? zero - h - 15 : zero + h + 3, textAlign: "center",
                               fontSize: 10.5, fontWeight: 800,
                               color: up ? C.ink : SELL }}>
                  {y.netPct >= 0 ? "" : "−"}{Math.abs(y.netPct).toFixed(0)}%
                </span>
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 5 }}>
          {years.map((y) => (
            <span key={y.year} style={{ flex: 1, textAlign: "center", fontSize: 10,
                                        color: C.faint, minWidth: 0 }}>
              {`'${String(y.year).slice(2)}`}
            </span>
          ))}
        </div>
        <span style={{ fontSize: 11.5, color: C.sub2, paddingTop: 7,
                       borderTop: `1px solid ${C.line}` }}>
          {drained.length > 0 ? (
            <>
              <b style={{ color: C.ink }}>{drained.map((y) => `${y.year}년`).join("·")}</b>은
              산 것보다 판 것이 많았습니다
            </>
          ) : (
            <>이 구간 내내 산 것이 판 것보다 많았습니다</>
          )}
        </span>
      </div>
    </>
  );
}

export function DailySection({ d, years }: { d: SeohakDaily; years: SeohakYear[] | null }) {
  return (
    // 한 행짜리 카드 하나 + 반 칸짜리 둘. 셋을 같은 격자에 두면 첫 카드만 늘리려고
    // gridColumn 을 손대야 하는데, 그 격자는 폭에 따라 열 수가 바뀌어 span 이 어긋난다
    // (예전에 span 2 로 그렇게 깨졌다). 세로 흐름 + 안쪽 2열이 안 깨진다.
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Card icon="show_chart" title="평소와 얼마나 다른가"
            desc="사고파는 양이 평소의 몇 %인지, 반년치를 봅니다."
            note="최근 6개월"
            foot="'평소'는 최근 2년 하루 값의 중앙값이라 시간이 지나도 자리가 안 바뀝니다. 선은 5일 평균입니다.">
        <VsUsual d={d} />
      </Card>

      <div style={{ display: "grid", gap: 14,
                    gridTemplateColumns: "repeat(auto-fit, minmax(min(320px, 100%), 1fr))" }}>
        <Card icon="compare_arrows" title="사자와 팔자의 결"
              desc="사는 쪽과 파는 쪽이 어떻게 다르게 움직이는지입니다."
              note="최근 20일"
              foot="원천이 결제 건수라 사람 수가 아니라 거래 횟수입니다. 한 사람이 여러 번 눌렀을 수 있습니다.">
          <BuyerVsSeller d={d} />
        </Card>

        {years && (
          <Card icon="savings" title="쌓는 해인가, 빼는 해인가"
                desc="해마다 산 것 중 순매수가 얼마였는지입니다."
                note={`${years[0].year}~`}
                foot="순매수는 수익이 아니라 '얼마를 더 넣었나'입니다. 옅은 막대는 아직 안 끝난 해입니다.">
            <AccumulateOrDrain years={years} />
          </Card>
        )}
      </div>
    </div>
  );
}
