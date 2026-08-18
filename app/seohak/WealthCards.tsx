import type { SeohakOverview } from "@/lib/seohak-data";
import type { HouseholdAssets } from "@/lib/seohak-external";
import { C, MONO } from "../ui";
import { Baseline, CHART, Card, Chart, Em, RefLine, SignEm, Tiles, Verdict } from "./DailyCards";
import { type Fx, Money, quarterMonth } from "./money";
import { S, T } from "./scale";
import { signInk } from "./tone";

/**
 * 자산 두 장 — 원화로 보면 · 가계 자산 속 해외주식.
 *
 * 앞의 것은 예탁원 채널(개인의 상한), 뒤의 것은 자금순환표 가계 부문(진짜 가계)이다.
 * **모집단이 서로 다르므로 두 카드의 숫자를 더하거나 나누면 안 된다.** 각주가 밝힌다.
 */

/* 손으로 원화를 만들던 `won(mn, rate)` 가 여기 있었다. 통화 스위치가 붙으면서
   `<Money>` 가 두 벌을 함께 그린다. ⚠️ 이 파일의 채널 값은 **백만 달러** 단위라
   `* 1e6` 으로 달러에 맞춰 넘긴다. */
/** 환율. 같은 이유로 `1286원` 이 아니라 `1,286원` 이다. */
const krw = (v: number) => `${Math.round(v).toLocaleString("ko-KR")}원`;
const pct = (v: number, digits = 1) =>
  `${v >= 0 ? "+" : "−"}${Math.abs(v).toLocaleString("ko-KR", { maximumFractionDigits: digits })}%`;

/**
 * ⑮ 원화로 보면.
 *
 * ## ⭐ 이 카드가 말하는 것: 수익의 절반 가까이가 환율이다
 *
 * 달러로는 +83% 인데 원화로는 **+100%** 다. 개인이 달러를 산 가중평균 환율이 1,294원이고
 * 지금이 1,414원이라 그 사이 9%가 통째로 얹힌다.
 *
 * ⚠️ 반대도 참이다. 환율이 평균으로 돌아가면 원화 수익이 그만큼 깎인다. 각주가 그걸
 * 적는다 — 환차익만 적고 위험을 안 적으면 카드가 한쪽만 말한다.
 *
 * ## ⚠️ 저작권이 걸리지 않는 이유
 *
 * 이 페이지는 벤더 지수(나스닥·S&P)를 안 쓴다는 원칙이 있는데, `DEXKOUS` 는 연준
 * H.10 이라 **미 정부 저작물**이라 그 제약 밖이다. `lib/seohak-external.ts` 머리말 참고.
 */
function InWon({ ch, fx }: {
  ch: NonNullable<SeohakOverview["channel"]>;
  fx: Fx;
}) {
  /** 유입을 그달 환율로 환산한 가중평균. "그들이 달러를 산 값"이다. */
  let wSum = 0;
  let wNet = 0;
  for (const c of ch.cohorts) {
    // 코호트는 해 단위라 그 해 6월 환율로 대표한다. 달 단위 유입은 이미 채널이 접었다.
    const rate = fx.rate[`${c.year}-06`] ?? fx.rate[`${c.year}-12`];
    if (!rate) continue;
    wSum += c.inflow * rate;
    wNet += c.inflow;
  }
  const avgRate = wNet ? wSum / wNet : fx.now;
  const fxRet = (fx.now / avgRate - 1) * 100;
  const usdRet = ch.principal ? (ch.value / ch.principal - 1) * 100 : 0;
  const wonRet = ((1 + usdRet / 100) * (1 + fxRet / 100) - 1) * 100;

  return (
    <>
      <Verdict>
        달러로는 <SignEm v={usdRet}>{pct(usdRet, 0)}</SignEm>인데 원화로는{" "}
        <SignEm v={wonRet}>{pct(wonRet, 0)}</SignEm>입니다
      </Verdict>

      {/* ⚠️ `marginTop:auto` 를 안 쓴다. 격자가 stretch 라 남는 폭이 통째로 결론 문장과
          그림 사이로 밀려 들어가 빈 띠가 된다. 남는 건 가운데 환율 그림이 먹는다(`flex:1`).

          ## ⭐ 순서를 이 페이지의 것으로 맞췄다 — **결론 → 그림 → 보조**
          환율 그림이 카드 맨 아래에 있었다. 옆 '평소와의 차이' 는 그림이 결론 바로
          아래라 두 카드가 서로 다른 규칙으로 보였다("통일성이 없어서 별로야").
          큰 숫자 둘은 결론의 일부다 — 문장이 말한 +84%/+102% 를 금액으로 되풀이한다. */}
      <div style={{ display: "flex", flexDirection: "column", gap: S.md, flex: 1, minHeight: 0 }}>
        {/* ⭐ 두 금액이 21 과 28 로 크기가 갈려 있었다. 한 자로 묶고 무게와 색으로만
            가른다 — 크기를 두 단 쓰면 그만큼 자가 늘어난다. */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: S.md, alignItems: "baseline" }}>
          {/* ⚠️⚠️ **두 금액의 환율이 서로 다르다.** 넣은 돈은 유입 가중평균(1,286원),
              지금은 최신(1,414원)이다. 그 차이가 곧 이 카드의 주장이라 하나로 통일하면
              안 된다 — 같은 환율로 두면 '환율에서 +10%' 가 화면에서 사라진다. */}
          {[
            { k: "넣은 돈", usd: ch.principal * 1e6, rate: avgRate, now: false },
            { k: "지금", usd: ch.value * 1e6, rate: fx.now, now: true },
          ].map((b, i) => (
            <span key={b.k} style={{ display: "flex", alignItems: "baseline", gap: S.md }}>
              {/* ⚠️ `alignSelf` 를 줘야 한다. 바깥 줄이 baseline 정렬이라 그냥 두면 화살표가
                  **금액이 아니라 라벨 줄**에 가서 앉는다(실제로 그렇게 났다). 잇는 것은
                  두 금액이므로 아래 끝에 붙인다.
                  ⚠️ 색이 `C.hint` 였다. 그건 점선·비활성 아이콘 값이라 글자에 쓰지 말라고
                  `ui.tsx` 가 못박아 뒀다 — 실제로 화면에서 안 보였다. */}
              {i > 0 && (
                <span style={{ fontSize: T.lead, color: C.faint, alignSelf: "flex-end",
                               paddingBottom: 3 }}>→</span>
              )}
              <span style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ fontSize: T.body, color: C.sub2, marginBottom: 3 }}>{b.k}</span>
                <b style={{ fontFamily: MONO, fontSize: T.big, fontWeight: b.now ? 800 : 700,
                            color: b.now ? C.ink : C.sub, letterSpacing: "-.02em" }}>
                  <Money usd={b.usd} rate={b.rate} fx={fx} suffix="원" />
                </b>
              </span>
            </span>
          ))}
        </div>

        <FxChart fx={fx} avgRate={avgRate} />

        {/* 수익을 둘로 가른다. 이 세 칸이 카드의 결론이다.
            ⚠️ '합쳐서' 가 파란 글자에 파란 바탕이었다. **파란 플러스는 손해로 읽힌다** —
            오르면 빨강이 국내 관행이다(tone.ts). 강조 바탕도 부호를 따라간다. */}
        <Tiles items={[
          { k: "종목에서", n: "달러 기준", v: pct(usdRet, 0), ink: signInk(usdRet) },
          { k: "환율에서", n: `${krw(avgRate)} → ${krw(fx.now)}`,
            v: pct(fxRet, 0), ink: signInk(fxRet) },
          { k: "합쳐서", n: "원화 기준", v: pct(wonRet, 0), ink: signInk(wonRet),
            bg: wonRet >= 0 ? "var(--c-hot-tint)" : "var(--c-cold-tint)" },
        ]} />
      </div>
    </>
  );
}

/**
 * 환율 그림 — **가운데 점선이 그들이 달러를 산 평균값**이고 파란 선이 실제 환율이다.
 *
 * ## ⭐ 이게 왜 여기 있나
 *
 * 이 카드의 각주가 "환율이 평균으로 돌아가면 원화 수익도 줄어듭니다" 라고 경고하는데,
 * 숫자로만 적으면 그 말이 얼마나 먼 이야기인지 알 수 없다. 선과 점선의 벌어진 폭이
 * 곧 각주가 말하는 크기다.
 *
 * ## ⭐ `flex:1` 로 두는 이유 — 남는 폭을 여기서 먹는다
 *
 * 같은 행의 두 카드는 늘 세로가 같은데, 이 카드가 짝보다 115px 짧았다. 그 폭이 카드
 * 바닥의 빈 띠로 남으면 "뭐가 빠졌나"로 읽힌다. 그림이 늘어나 먹으면 폭이 어떻든 구멍이
 * 안 생긴다(옆 카드의 문단이 몇 줄로 접히든 상관없다).
 *
 * ⚠️ 그래서 `preserveAspectRatio="none"` 이다. 세로로 눌리고 늘어나므로
 *   ① 글자를 SVG 안에 두면 안 된다(라벨은 위에 HTML 로 뺐다).
 *   ② 선 굵기는 `vector-effect="non-scaling-stroke"` 로 고정한다. 안 그러면 세로로
 *      눌릴 때 선만 굵어진다.
 * ⛔ 세로 눈금이 늘어난다는 건 **기울기가 폭마다 달라진다**는 뜻이다. 그래서 이 그림에
 * 각도로 읽는 말("가파르게")을 붙이면 안 된다. 읽는 것은 점선과의 위아래뿐이다.
 */
function FxChart({ fx, avgRate }: { fx: Fx; avgRate: number }) {
  // 최근 10년. 옆 '얼마나 오래 들고 있나' 와 같은 창이다.
  const pts = Object.entries(fx.rate).sort(([a], [b]) => a.localeCompare(b)).slice(-120);
  // ⚠️ 월평균의 마지막 달은 아직 안 끝나 반쪽이다. 끝점은 최신 일별로 갈아 붙인다.
  const vals = [...pts.map(([, v]) => v), fx.now];
  if (vals.length < 24) return null;
  const lo = Math.min(...vals, avgRate) * 0.985;
  const hi = Math.max(...vals, avgRate) * 1.015;
  const x = (i: number) => (i / (vals.length - 1)) * CHART.w;
  const y = (v: number) => CHART.h - ((v - lo) / (hi - lo)) * CHART.h;
  const line = vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");

  /* ⚠️ 툴팁 순서는 `vals` 와 같아야 한다. 마지막 하나만 달이 아니라 **그날**이다
     (월평균의 마지막 달은 반쪽이라 최신 일별로 갈아 붙였다) — 날짜를 그대로 적어
     둘이 다른 값이라는 게 드러나게 둔다. */
  const tips = [
    ...pts.map(([m, v]) => ({
      key: m,
      text: `${m.slice(0, 4)}년 ${Number(m.slice(5, 7))}월 · ${krw(v)}`,
    })),
    { key: fx.nowDate, text: `${fx.nowDate} · ${krw(fx.now)}` },
  ];

  return (
    <Chart
      note="원/달러 월평균 · 최근 10년"
      tips={tips}
      legend={
        <Baseline>
          평균 산 값 <b style={{ fontFamily: MONO, color: C.ink }}>{krw(avgRate)}</b>
        </Baseline>
      }
      aria={`원/달러 환율이 최근 10년 동안 평균 산 값 ${krw(avgRate)}의 위아래로 어떻게 움직였는지`}
    >
      <path d={`${line}L${CHART.w},${CHART.h}L0,${CHART.h}Z`} fill={C.blueTint} />
      <RefLine y={y(avgRate)} />
      <path d={line} fill="none" stroke={C.blue} strokeWidth={2}
            strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </Chart>
  );
}

/**
 * ⑯ 가계 자산 속 해외주식.
 *
 * ## ⭐ 이 페이지에서 **법인이 안 섞인 유일한 숫자**다
 *
 * 나머지 카드는 예탁원 채널이라 법인·중소기관이 11~12% 섞이는데, 이건 한국은행이
 * `가계 및 비영리단체` 부문을 직접 갈라 준 값이다.
 *
 * ## ⚠️ 자를 두 번 바꿔 봤다. 결론이 흔들린다
 *
 * '해외 ÷ 국내'로 재면 2024Q4 17.8% → 2026Q1 15.7% 라 **"비중이 내려왔다"** 가 되고,
 * '해외 ÷ (국내+해외)'로 재면 10% → 14% 라 **"비중이 올라왔다"** 가 된다. 같은 자료다.
 *
 * ⭐ 그래서 화면은 **표가 양쪽을 다 보여 주게** 둔다. 8분기를 통으로 보면 오른 게
 * 맞고(10→14%), 꼭짓점(15%)에서 내려온 것도 맞다. 여덟 줄이 그 둘을 다 적고 있으므로
 * 글로 한쪽을 고를 이유가 없다.
 *
 * ⚠️ 자는 **'100원 중 몇 원'(해외 ÷ 국내+해외) 하나로 통일한다.** 두 자를 섞었더니
 * 결론 문장이 "100원 중 14원"인데 표는 16% 를 적고 있었다.
 *
 * ## ⭐ 다섯 줄짜리 문단을 타일 둘로 접었다
 *
 * 카드 바닥에 네 문장이 붙어 있었다("각 카드 하단에 설명 칸은 다 한줄로"). 그중 셋은
 * 위 여덟 줄이 이미 말하는 것이었고(2.1배 · 10→14% · 꼭짓점), 남은 하나만 새 사실이었다 —
 * **가계 금융자산 전체에서는 3.5%** 다. 그 하나와 증가 배수만 타일로 세운다.
 */
function HouseholdShare({ h, fx }: { h: HouseholdAssets; fx: Fx | null }) {
  const first = h.series[0];
  /** 분기값은 그 분기 **끝 달**의 환율로 옮긴다. 잔액표라 시점값이다. */
  const at = quarterMonth(h.asOf);
  const barMax = Math.max(...h.series.map((s) => s.domestic + s.foreign), 1);

  return (
    <>
      <Verdict>
        가계가 든 주식 100원 중 해외가{" "}
        <Em>{h.foreignShare.toFixed(0)}원</Em>입니다
      </Verdict>

      {/* ⚠️ `marginTop:auto` 를 안 쓴다. 격자가 stretch 라 남는 폭이 통째로 결론 문장과
          그림 사이로 밀려 들어가 빈 띠가 된다. 남는 건 표가 줄 간격으로 나눠 먹는다. */}
      <div style={{ display: "flex", flexDirection: "column", gap: S.md, flex: 1, minHeight: 0 }}>
        {/* 국내 대 해외. 길이는 금액, 오른쪽 숫자는 비중이다.
            ⭐ 줄마다 `1fr` 이라 남는 폭을 표가 고르게 나눠 먹는다 — 옆 카드가 몇 줄로
            접히든 이 카드에 구멍이 안 생긴다('얼마나 오래 들고 있나' 와 같은 수). */}
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", rowGap: S.xs,
                     flex: 1, minHeight: 0,
                     gridTemplateRows: `repeat(${h.series.length}, minmax(17px, 1fr))` }}>
          {h.series.map((s, i) => {
            const last = i === h.series.length - 1;
            return (
              <li key={s.quarter} style={{ display: "grid", gridTemplateColumns: "50px 1fr 44px",
                                           alignItems: "center", gap: S.sm }}>
                <span style={{ fontSize: T.small, fontWeight: last ? 800 : 600,
                               color: last ? C.ink : C.sub2 }}>{s.quarter}</span>
                <span style={{ display: "flex", height: 11, gap: 2 }}>
                  <span style={{ width: `${(s.domestic / barMax) * 100}%`, background: C.bar,
                                 borderRadius: 2 }} />
                  <span style={{ width: `${(s.foreign / barMax) * 100}%`, background: C.blue,
                                 borderRadius: 2 }} />
                </span>
                <span style={{ fontFamily: MONO, fontSize: T.small, textAlign: "right",
                               fontWeight: last ? 800 : 400, color: last ? C.ink : C.sub2 }}>
                  {s.share.toFixed(0)}%
                </span>
              </li>
            );
          })}
        </ul>

        <div style={{ display: "flex", justifyContent: "space-between", gap: S.sm,
                      fontSize: T.small }}>
          {[
            { k: "국내주식", v: h.domestic, tone: C.bar },
            { k: "해외주식", v: h.foreign, tone: C.blue },
          ].map((g) => (
            <span key={g.k} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <span aria-hidden style={{ width: 8, height: 8, borderRadius: 2, background: g.tone }} />
              <span style={{ color: C.sub }}>{g.k}</span>
              <b style={{ fontFamily: MONO, color: C.ink }}>
                <Money krw={g.v * 1e12} at={at} fx={fx} />
              </b>
            </span>
          ))}
        </div>

        <Tiles items={[
          { k: "2년 새",
            n: <>{first.quarter}{" "}
                 <Money krw={first.foreign * 1e12} at={quarterMonth(first.quarter)} fx={fx} />에서</>,
            v: `${(h.foreign / (first.foreign || 1)).toFixed(1)}배` },
          { k: "금융자산 중",
            n: <>현금·예금 <Money krw={h.cash * 1e12} at={at} fx={fx} /></>,
            v: `${((h.foreign / h.total) * 100).toFixed(1)}%` },
        ]} />
      </div>
    </>
  );
}

export function WealthCards({ ch, fx, household }: {
  ch: SeohakOverview["channel"];
  fx: Fx | null;
  household: HouseholdAssets | null;
}) {
  return (
    <>
      {ch && fx && (
        <Card icon="currency_exchange" title="원화로 보면"
              desc="달러로 잰 수익을 원화로 옮기면 얼마인지"
              note={`환율 ${fx.nowDate}`}
              foot="환율이 평균으로 돌아가면 원화 수익도 그만큼 줄어듭니다.">
          <InWon ch={ch} fx={fx} />
        </Card>
      )}
      {household && (
        <Card icon="savings" title="가계 자산 속 해외주식"
              desc="가계가 든 국내주식과 해외주식을 나란히"
              note={`${household.asOf} · 가계 부문`}
              foot="해외주식은 미국만이 아닌 전 세계이고, 해외 ETF는 빠져 있습니다.">
          <HouseholdShare h={household} fx={fx} />
        </Card>
      )}
    </>
  );
}
