import { type SeohakDaily } from "@/lib/seohak-daily";
import { SectionHead } from "../kadera/SectionHead";
import { BUY, SELL } from "./tone";
import { C, MONO, R } from "../ui";

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

/**
 * 카드 껍데기.
 *
 * ## ⭐ 손으로 그리던 머리를 `SectionHead` 로 갈았다
 *
 * 이 페이지엔 시트 꼴이 **둘**이었다. 달력·시작 연도별 성과·종류별 구성·잔고가 변한
 * 이유 넷은 `SectionHead` 를 써서 머리에 `--c-title-band`(#eef3f9) 띠가 깔리는데, 이
 * `Card` 로 만든 다섯 장(평소와의 차이 · ETF 둘 · 기관 몫 · 보유분 수익률)만 머리가
 * 흰 바탕이었다. 나란히 놓으면 같은 페이지의 카드들이 서로 다른 물건처럼 보인다.
 *
 * 머리를 손으로 그릴 이유가 애초에 없었다 — `SectionHead` 와 아이콘·제목·설명·기간
 * 알약이 전부 같고 값만 조금씩 어긋나 있었다(제목 13.5/800 → 14/700, 설명 sub2 → sub).
 *
 * 함께 달라진 것 둘.
 *   ① 안쪽 여백이 시트 전체(`--hz-card-pad`)가 아니라 **띠마다** 붙는다. 머리·각주는
 *      제 padding 을 갖고 본문만 여기서 준다 — 그래야 띠가 카드 폭을 꽉 채운다.
 *   ② 각주가 맨 `<p>` 에서 `.hz-sheet-foot` 띠로 바뀐다. 나란한 시트끼리 바닥 높이가
 *      같아진다(min-height 39px).
 *
 * ⚠️ `.hz-sheet-foot` 은 display:flex 다. 안에 맨 텍스트와 태그를 섞어 두면 좁은 폭에서
 * 낱글자로 눌린다 — 통째로 `<span>` 하나에 담는다.
 */
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
    <section className="hz-sheet" style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
      <SectionHead icon={icon} title={title} desc={desc} note={note} />
      {/* flex:1 을 유지할 것. `Flows`·`WeekGrid` 가 `marginTop:auto` 로 목록을 카드 바닥에
          붙이는데, 이 칸이 안 늘어나면 그 auto 가 놀아서 두 카드의 목록 높이가 갈린다. */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14, minWidth: 0,
                    padding: "14px 22px" }}>
        {children}
      </div>
      <div className="hz-sheet-foot" style={{ fontSize: 12, color: C.sub }}>
        <span>{foot}</span>
      </div>
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

/**
 * 카드 두 장을 나란히 놓는 격자. ETF 층과 분기 층이 같은 자를 쓴다.
 *
 * ⚠️ 하한이 **380px** 이다. 300px 이던 시절에는 1,004px 폭에서 트랙이 셋 잡혀 카드가
 * 325px 로 쪼그라들고 오른쪽 한 칸이 빈 채로 남았다. 380 이면 3열에 1,168px 가 필요해
 * 2열로 떨어지고, 카드가 495px 씩 돼서 ETF 층과 폭이 같아진다.
 *
 * ⚠️⚠️ `alignItems: start` 다. **바닥을 맞추려면 두 카드의 자연 높이가 비슷해야 한다.**
 * ETF 두 장은 572 대 597 이라 늘려도 25px 만 벌어지지만, 분기 두 장은 292 대 392 라
 * 늘리면 기관 몫 안에 **78px 짜리 흰 구멍**이 생긴다(결론 문장과 막대 사이). 이 페이지의
 * 다른 2열 줄도 바닥이 어긋나 있으므로(종류별 구성 575 · 잔고가 변한 이유 610) 들쭉날쭉한
 * 바닥이 오히려 이 격자의 기본이다.
 *
 * 바닥을 맞추고 싶은 줄만 `{ ...CARD_GRID, alignItems: "stretch" }` 로 덮는다.
 */
export const CARD_GRID: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(380px, 100%), 1fr))",
  gap: 14,
  alignItems: "start",
};

/* ── ① 평소와의 차이 (한 행 전체) ──────────────────────────────
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
  const net = d.turnover.buy - d.turnover.sell;
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

      {/* ⭐ 카드 둘을 접으면서 **거기서 쓸모 있던 한 줄씩만** 데려왔다.
          - '얼마나 사고팔았나'(막대 셋)는 통째로 뺐다. 1년 총매수·총매도 막대는 이 카드가
            이미 '평소의 몇 %'로 말하는 것과 같은 이야기를 크기만 바꿔 되풀이했다.
            남길 값어치가 있던 건 마지막 줄, **그래서 얼마가 남았나** 하나뿐이다.
          - '사자와 팔자의 결'(막대 넷)도 뺐다. 알맹이는 "파는 쪽이 더 뜸하고 더 크다"
            한 문장인데, 그걸 말하려고 막대를 넷 그리고 있었다.

          ⚠️ 셋의 **창이 다르다**(그림 6개월 · 결 20일 · 순매수 250거래일). 한 카드에
          모으면 같은 창으로 읽히므로 문장마다 기간을 직접 적는다. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 12,
                    borderTop: `1px solid ${C.line}` }}>
        <span style={{ fontSize: 12.5, lineHeight: 1.5, color: C.sub, wordBreak: "keep-all" }}>
          최근 {cnt(d.turnover.days)}거래일 동안{" "}
          {net >= 0 ? "산 것이 판 것보다" : "판 것이 산 것보다"}{" "}
          <b style={{ fontFamily: MONO, color: C.ink }}>{usd(Math.abs(net))}</b> 많았습니다
        </span>
        {/* ⚠️ `asPct` 를 쓰면 "횟수가 25% 덜, 한 번에 13% 더 움직였습니다"가 되어 말이
            엉킨다. 그 함수는 '평소 대비 배수'용이지 두 쪽을 견주는 자리엔 안 맞는다. */}
        <span style={{ fontSize: 12.5, lineHeight: 1.5, color: C.sub, wordBreak: "keep-all" }}>
          최근 20일, 파는 쪽은 사는 쪽보다{" "}
          <b style={{ color: C.ink }}>
            횟수가 {Math.abs(Math.round((d.countRatio - 1) * 100))}%{" "}
            {d.countRatio < 1 ? "적고" : "많고"}, 한 번에{" "}
            {Math.abs(Math.round((d.sizeRatio - 1) * 100))}%{" "}
            {d.sizeRatio > 1 ? "큽니다" : "작습니다"}
          </b>
        </span>
      </div>
    </>
  );
}

/**
 * '어떻게 사고파나' — 이제 카드 **하나**다.
 *
 * ⭐ 셋이었다. '사자와 팔자의 결'과 '얼마나 사고팔았나'를 접고, 거기서 쓸모 있던 한
 * 줄씩만 이 카드 바닥으로 옮겼다. 셋 다 결국 같은 것을 세 번 그리고 있었다 — 사는 양과
 * 파는 양. 창만 6개월·20일·1년으로 달랐다.
 *
 * ⚠️ 카드가 하나뿐이라 격자가 필요 없다. 예전엔 `CARD_GRID` 에 셋을 담고 첫 카드만
 * 늘리려 애썼는데(span 이 열 수에 따라 어긋났다) 그 문제도 같이 사라진다.
 */
export function DailySection({ d }: { d: SeohakDaily }) {
  return (
    <Card icon="show_chart" title="평소와의 차이"
          desc="사고파는 양이 평소의 몇 %인지, 반년치를 봅니다."
          note="최근 6개월"
          foot="'평소'는 최근 2년 하루 값의 중앙값이라 시간이 지나도 자리가 안 바뀝니다. 선은 5일 평균이고, 횟수는 사람 수가 아니라 결제 건수입니다. 아래 두 줄은 기간이 달라 각각 적었습니다.">
      <VsUsual d={d} />
    </Card>
  );
}
