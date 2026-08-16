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

/* ── ① 평소와 얼마나 다른가 (한 행 전체) ──────────────────────────────
   ⚠️⚠️ **앞 판의 선 그림을 버렸다.** 두 가지가 틀렸다.

   ① **모양이 없었다.** 매수와 매도는 둘 다 전체 활동량에 끌려 상관이 높은데, 거기에
      20일 중앙값을 씌우니 두 번 평활된 선이 되어 나란히 흐를 뿐이었다. 선 두 개를
      그렸지만 사실상 한 줄을 두 번 그린 셈이다.
   ② **나중에 값이 바뀌었다.** 기준이 ±60영업일 중앙값이라 최근 날짜는 뒤쪽 절반이
      아직 없다. 실측 262표본에서 **65%가 5%p 넘게** 달라졌다.

   그래서 **원자료로 돌아간다.** 하루하루 실제 금액은 튀어서 모양이 있고, '평소'를
   2년 고정 창의 중앙값으로 두면 값이 다시 안 바뀐다.

   ⭐ 위로 빨강(산 금액) 아래로 파랑(판 금액)인 **거울 막대**다. 하루가 위아래 한 쌍이라
   그날의 균형이 그대로 보이고, 양쪽에 그은 '평소' 선 덕분에 "요즘은 선 아래"가 눈으로
   판정된다. 배수도 창도 설명할 필요가 없다. */
function VsUsual({ d }: { d: SeohakDaily }) {
  const r = d.recent;
  const W = 1000;
  // 거울로 세로를 반씩 나눠 쓰므로 한쪽 몫이 절반뿐이다. 132 면 실제 렌더가 66px 이라
  // '평소' 선과 데이터가 겹쳐 아무것도 안 읽힌다.
  const H = 230;
  const MID = H / 2;
  const peak = Math.max(...r.flatMap((x) => [x.buy, x.sell]), d.usual.buy, d.usual.sell) || 1;
  const x = (i: number) => (i / Math.max(1, r.length - 1)) * W;
  const h = (v: number) => (v / peak) * (MID - 14);

  /** 5영업일 이동평균. 원자료는 옅은 면으로 깔고 눈이 따라갈 선은 이걸로 그린다. */
  const smooth = (key: "buy" | "sell") =>
    r.map((_, i) => {
      const w = r.slice(Math.max(0, i - 4), i + 1).map((p) => p[key]);
      return w.reduce((a, b) => a + b, 0) / w.length;
    });
  /** 원자료 띠. 가운데 축에서 시작해 값을 따라 갔다가 축으로 돌아온다. */
  const band = (key: "buy" | "sell", dir: -1 | 1) =>
    `M0,${MID}` +
    r.map((p, i) => `L${x(i).toFixed(1)},${(MID + dir * h(p[key])).toFixed(1)}`).join("") +
    `L${W},${MID}Z`;
  const trend = (vals: number[], dir: -1 | 1) =>
    vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${(MID + dir * h(v)).toFixed(1)}`).join("");

  // ⚠️ regime(±60일 정규화)이 아니라 vsUsual 을 쓴다. 그림의 '평소' 선과 같은 기준이라야
  // 같은 말이 두 가지를 가리키지 않는다.
  const buyPct = d.vsUsual.buy;
  const sellPct = d.vsUsual.sell;
  const spark = d.countSpark;
  const sparkMax = Math.max(...spark);
  const sparkMin = Math.min(...spark);
  const sparkY = (v: number) => 34 - ((v - sparkMin) / (sparkMax - sparkMin || 1)) * 30;
  const sparkPath = spark
    .map((v, i) => `${i ? "L" : "M"}${((i / (spark.length - 1)) * 200).toFixed(1)},${sparkY(v).toFixed(1)}`)
    .join("");
  const p = Math.round(d.countPercentile);

  const up = (v: number) => v >= 100;
  const verdict = up(buyPct) && up(sellPct) ? (
    <>요즘 <Em>사는 것도 파는 것도 평소보다 많습니다</Em></>
  ) : !up(buyPct) && !up(sellPct) ? (
    <>요즘 <Em>사는 것도 파는 것도 평소보다 적습니다</Em></>
  ) : up(buyPct) ? (
    <><Em>사는 쪽만</Em> 평소보다 많습니다</>
  ) : (
    <><Em>파는 쪽만</Em> 평소보다 많습니다</>
  );

  return (
    <>
      <Verdict>{verdict}</Verdict>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 18 }}>
        <div style={{ flex: "2 1 min(420px, 100%)", minWidth: 0, display: "flex",
                      flexDirection: "column", gap: 6 }}>
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}
               role="img" aria-label="최근 반년의 산 금액과 판 금액 흐름">
            {/* ⚠️ 막대 240개를 최대 채도로 그렸더니 "눈 아프다"를 받았다. 잉크가 너무
                많았다 — 마디마다 같은 목소리로 외치면 눈이 쉴 데가 없다.
                원자료는 **옅은 띠**로 깔아 결만 남기고, 눈이 따라갈 선은 5일 평균
                하나씩만 또렷하게 둔다(dataviz 의 '얇은 마크·물러선 배경'). */}
            <path d={band("buy", -1)} fill={BUY} opacity={0.18} />
            <path d={band("sell", 1)} fill={SELL} opacity={0.18} />
            <path d={trend(smooth("buy"), -1)} fill="none" stroke={BUY} strokeWidth={2}
                  strokeLinejoin="round" strokeLinecap="round" />
            <path d={trend(smooth("sell"), 1)} fill="none" stroke={SELL} strokeWidth={2}
                  strokeLinejoin="round" strokeLinecap="round" />
            {/* '평소' 선. 데이터가 아니라 자라서 점선으로 둔다. 2년 고정 창의 중앙값이라
                시간이 지나도 이 자리가 다시 안 바뀐다. */}
            {/* '평소' 선 둘. 이 그림의 핵심이라 막대에 묻히면 안 된다 — 라벨을 오른쪽
                끝에 카드색 판을 깔고 얹어 막대 위에서도 읽히게 한다. */}
            {[
              { y: MID - h(d.usual.buy), t: "평소 산 금액", anchor: -1 },
              { y: MID + h(d.usual.sell), t: "평소 판 금액", anchor: 1 },
            ].map((g) => (
              <g key={g.t}>
                <line x1={0} x2={W} y1={g.y} y2={g.y} stroke={C.ink} strokeWidth={1.5}
                      strokeDasharray="6 4" opacity={0.7} />
                <rect x={W - 122} y={g.y + (g.anchor < 0 ? -19 : 3)} width={118} height={16}
                      fill={C.card} rx={3} opacity={0.9} />
                <text x={W - 6} y={g.y + (g.anchor < 0 ? -7 : 15)} fontSize={13} fill={C.sub}
                      textAnchor="end" fontWeight={700}>{g.t}</text>
              </g>
            ))}
            <line x1={0} x2={W} y1={MID} y2={MID} stroke={C.line} strokeWidth={1} />
          </svg>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11,
                        color: C.faint }}>
            <span>{r[0]?.date.slice(0, 7).replace("-", "년 ")}월</span>
            <span>{r.length}거래일 · 진한 선은 5일 평균</span>
            <span>어제</span>
          </div>
        </div>

        {/* 오른쪽 한 칸 — 요약 셋. 그림이 '언제'를 말하고 여기가 '얼마나'를 말한다. */}
        <div style={{ flex: "1 1 min(220px, 100%)", minWidth: 0, display: "flex",
                      flexDirection: "column", gap: 8 }}>
          {[
            { k: "사는 양", v: buyPct, tone: BUY },
            { k: "파는 양", v: sellPct, tone: SELL },
          ].map((t) => (
            <div key={t.k} style={{ background: C.soft, borderRadius: R.control, padding: "9px 11px",
                                    display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5,
                             color: C.sub2, fontWeight: 600 }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, background: t.tone }} />
                {t.k}
              </span>
              <span style={{ marginLeft: "auto", display: "flex", alignItems: "baseline", gap: 5 }}>
                <b style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800, color: C.ink }}>
                  {Math.round(t.v)}%
                </b>
                <span style={{ fontSize: 11, color: C.faint }}>평소의</span>
              </span>
            </div>
          ))}
          <div style={{ background: C.soft, borderRadius: R.control, padding: "9px 11px",
                        display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
            <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontSize: 11.5, color: C.sub2, fontWeight: 600 }}>어제 산 횟수</span>
              <b style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 16, fontWeight: 800,
                          color: C.ink }}>{cnt(d.today.buyCount)}번</b>
            </span>
            {/* 위 그림과 같은 병을 앓고 있었다 — 비슷한 높이의 막대 60개가 회색 덩어리
                하나로 보였다. 선 하나로 바꾸고 어제만 점으로 짚는다. */}
            {/* ⚠️ preserveAspectRatio="none" 이 필요하다. viewBox 비율(200:38)과 고정
                높이(38px)가 싸우면 기본값 meet 이 200px 로 줄여 **가운데 정렬**해 버린다 —
                선이 칸 한복판에만 뜨고 양옆이 빈다. 스파크라인은 가로로 늘어나야 한다. */}
            <svg viewBox="0 0 200 38" preserveAspectRatio="none"
                 style={{ width: "100%", height: 38, display: "block", marginTop: "auto" }}
                 role="img" aria-label="최근 60영업일 산 횟수">
              <path d={sparkPath} fill="none" stroke={C.marker} strokeWidth={1.5}
                    vectorEffect="non-scaling-stroke"
                    strokeLinejoin="round" strokeLinecap="round" />
              {/* 늘어난 좌표계에서 원은 타원이 된다. 마지막 점은 세로 획으로 짚는다. */}
              <line x1={199} x2={199} y1={sparkY(spark[spark.length - 1]) - 4}
                    y2={sparkY(spark[spark.length - 1]) + 4} stroke={BUY} strokeWidth={3}
                    vectorEffect="non-scaling-stroke" strokeLinecap="round" />
            </svg>
            <span style={{ fontSize: 10.5, color: C.faint }}>
              최근 {spark.length}영업일 중 {p >= 50 ? "많은" : "적은"} 쪽 {Math.max(1, p >= 50 ? 100 - p : p)}%
            </span>
          </div>
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

export function DailySection({ d }: { d: SeohakDaily }) {
  return (
    // 한 행짜리 카드 하나 + 반 칸짜리 둘. 셋을 같은 격자에 두면 첫 카드만 늘리려고
    // gridColumn 을 손대야 하는데, 그 격자는 폭에 따라 열 수가 바뀌어 span 이 어긋난다
    // (예전에 span 2 로 그렇게 깨졌다). 세로 흐름 + 안쪽 2열이 안 깨진다.
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Card icon="show_chart" title="평소와 얼마나 다른가"
            desc="반년치를 하루씩 세워, 요즘 사고파는 양이 평소와 얼마나 다른지 봅니다."
            note="최근 6개월"
            foot="옅은 띠가 하루씩 실제 결제된 금액이고 진한 선은 5일 평균입니다. '평소'는 최근 2년 하루 금액의 중앙값이라, 시간이 지나도 이 선의 자리가 다시 바뀌지 않습니다.">
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

        <Card icon="savings" title="산 돈은 어디서 왔나"
              desc="1년간 산 돈을 판 돈과 새로 넣은 돈으로 가릅니다."
              note="최근 1년"
              foot="산 돈에서 판 돈을 뺀 나머지가 새로 넣은 몫입니다. 합계로 갈라낸 값이라 누가 무슨 돈으로 샀는지는 아닙니다.">
          <WhereFrom d={d} />
        </Card>
      </div>
    </div>
  );
}
