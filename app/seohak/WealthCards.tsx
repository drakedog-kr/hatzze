import type { SeohakOverview } from "@/lib/seohak-data";
import type { HouseholdAssets, UsdKrw } from "@/lib/seohak-external";
import { C, MONO, R } from "../ui";
import { Card, Em, Verdict } from "./DailyCards";

/**
 * 자산 두 장 — 원화로 보면 · 가계 자산 속 해외주식.
 *
 * 앞의 것은 예탁원 채널(개인의 상한), 뒤의 것은 자금순환표 가계 부문(진짜 가계)이다.
 * **모집단이 서로 다르므로 두 카드의 숫자를 더하거나 나누면 안 된다.** 각주가 밝힌다.
 */

/** 백만 달러 × 원 → "276조". 이 페이지에서 원화가 나오는 유일한 자리다. */
const won = (mn: number, rate: number) =>
  `${((mn * 1e6 * rate) / 1e12).toLocaleString("ko-KR", { maximumFractionDigits: 0 })}조`;
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
  fx: UsdKrw;
}) {
  /** 유입을 그달 환율로 환산한 가중평균. "그들이 달러를 산 값"이다. */
  let wSum = 0;
  let wNet = 0;
  for (const c of ch.cohorts) {
    // 코호트는 해 단위라 그 해 6월 환율로 대표한다. 달 단위 유입은 이미 채널이 접었다.
    const rate = fx.monthly.get(`${c.year}-06`) ?? fx.monthly.get(`${c.year}-12`);
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
        달러로는 <Em>{pct(usdRet, 0)}</Em>인데 원화로는 <Em>{pct(wonRet, 0)}</Em>입니다
      </Verdict>

      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 11 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "baseline" }}>
          <div>
            <div style={{ fontSize: 11.5, color: C.sub2, marginBottom: 3 }}>넣은 돈</div>
            <div style={{ fontSize: 21, fontWeight: 700, color: C.sub, letterSpacing: "-.02em" }}>
              {won(ch.principal, avgRate)}원
            </div>
          </div>
          <div style={{ fontSize: 18, color: C.hint, alignSelf: "center" }}>→</div>
          <div>
            <div style={{ fontSize: 11.5, color: C.sub2, marginBottom: 3 }}>지금</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: C.ink, letterSpacing: "-.02em" }}>
              {won(ch.value, fx.now)}원
            </div>
          </div>
        </div>

        {/* 수익을 둘로 가른다. 이 세 칸이 카드의 결론이다. */}
        <div style={{ display: "flex", gap: 7 }}>
          {[
            { label: "종목에서", note: "달러 기준", v: pct(usdRet, 0), strong: false },
            { label: "환율에서", note: `${avgRate.toFixed(0)}원 → ${fx.now.toFixed(0)}원`, v: pct(fxRet, 0), strong: false },
            { label: "합쳐서", note: "원화 기준", v: pct(wonRet, 0), strong: true },
          ].map((s) => (
            <div key={s.label} style={{ flex: 1, background: s.strong ? C.blueTint : C.soft,
                                        borderRadius: R.control, padding: "7px 9px",
                                        display: "flex", flexDirection: "column", gap: 1 }}>
              <span style={{ fontSize: 10.5, color: C.label, fontWeight: 700 }}>{s.label}</span>
              <span style={{ fontSize: 10, color: C.faint }}>{s.note}</span>
              <span style={{ fontFamily: MONO, fontSize: 15, fontWeight: 800,
                             color: s.strong ? C.blue : C.ink }}>{s.v}</span>
            </div>
          ))}
        </div>
      </div>
    </>
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
 * ⭐ 그래서 화면은 **오른 것을 주로 말하고 내린 것을 단서로 붙인다.** 8분기를 통으로
 * 보면 오른 게 맞고(10→14%), 꼭짓점(15%)에서 내려온 것도 맞다. 하나만 적으면 창을
 * 골라 이야기를 만든 것이 된다.
 *
 * ⚠️ 자는 **'100원 중 몇 원'(해외 ÷ 국내+해외) 하나로 통일한다.** 두 자를 섞었더니
 * 결론 문장이 "100원 중 14원"인데 표는 16% 를 적고 있었다.
 */
function HouseholdShare({ h }: { h: HouseholdAssets }) {
  const first = h.series[0];
  const barMax = Math.max(...h.series.map((s) => s.domestic + s.foreign), 1);
  const shares = h.series.map((s) => s.share);
  const hi = Math.max(...shares);

  return (
    <>
      <Verdict>
        가계가 든 주식 100원 중 해외가{" "}
        <Em>{h.foreignShare.toFixed(0)}원</Em>입니다
      </Verdict>

      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 11 }}>
        {/* 국내 대 해외. 길이는 금액, 오른쪽 숫자는 비중이다. */}
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex",
                     flexDirection: "column", gap: 4 }}>
          {h.series.map((s, i) => {
            const last = i === h.series.length - 1;
            return (
              <li key={s.quarter} style={{ display: "grid", gridTemplateColumns: "50px 1fr 44px",
                                           alignItems: "center", gap: 9 }}>
                <span style={{ fontSize: 10.5, fontWeight: last ? 800 : 600,
                               color: last ? C.ink : C.sub2 }}>{s.quarter}</span>
                <span style={{ display: "flex", height: 11, gap: 2 }}>
                  <span style={{ width: `${(s.domestic / barMax) * 100}%`, background: C.bar,
                                 borderRadius: 2 }} />
                  <span style={{ width: `${(s.foreign / barMax) * 100}%`, background: C.blue,
                                 borderRadius: 2 }} />
                </span>
                <span style={{ fontFamily: MONO, fontSize: 11, textAlign: "right",
                               fontWeight: last ? 800 : 400, color: last ? C.ink : C.sub2 }}>
                  {s.share.toFixed(0)}%
                </span>
              </li>
            );
          })}
        </ul>

        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: C.bar }} />
            <span style={{ color: C.sub }}>국내주식</span>
            <b style={{ fontFamily: MONO, color: C.ink }}>{h.domestic.toFixed(0)}조</b>
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: C.blue }} />
            <span style={{ color: C.sub }}>해외주식</span>
            <b style={{ fontFamily: MONO, color: C.ink }}>{h.foreign.toFixed(0)}조</b>
          </span>
        </div>

        <span style={{ fontSize: 11, color: C.sub, paddingTop: 8, borderTop: `1px solid ${C.line}` }}>
          해외주식은 {first.quarter} {first.foreign.toFixed(0)}조에서{" "}
          <b style={{ color: C.ink }}>
            {h.foreign.toFixed(0)}조로 {(h.foreign / (first.foreign || 1)).toFixed(1)}배
          </b>{" "}
          늘었고, 주식 중 몫도 {first.share.toFixed(0)}% 에서{" "}
          <b style={{ color: C.ink }}>{h.foreignShare.toFixed(0)}%</b> 가 됐습니다. 다만{" "}
          {hi.toFixed(0)}% 였던 때보다는 낮은데, 그 사이 국내주식이 더 올랐기 때문입니다.
          가계 금융자산 전체로 보면 해외주식은{" "}
          <b style={{ color: C.ink }}>{((h.foreign / h.total) * 100).toFixed(1)}%</b> 이고
          현금·예금이 {h.cash.toFixed(0)}조입니다.
        </span>
      </div>
    </>
  );
}

export function WealthCards({ ch, fx, household }: {
  ch: SeohakOverview["channel"];
  fx: UsdKrw | null;
  household: HouseholdAssets | null;
}) {
  return (
    <>
      {ch && fx && (
        <Card icon="currency_exchange" title="원화로 보면"
              desc="달러로 잰 수익을 원화로 옮기면 얼마인지입니다."
              note={`환율 ${fx.nowDate}`}
              foot="개인이 달러를 산 평균 환율은 해마다의 유입을 그해 평균 환율로 가중해 낸 값입니다. 환율이 그 평균으로 돌아가면 원화 수익도 그만큼 줄어듭니다. 환율은 연준이 내는 H.10(FRED DEXKOUS)입니다.">
          <InWon ch={ch} fx={fx} />
        </Card>
      )}
      {household && (
        <Card icon="savings" title="가계 자산 속 해외주식"
              desc="가계가 든 국내주식과 해외주식을 나란히 둡니다."
              note={`${household.asOf} · 가계 부문`}
              foot="한국은행 자금순환표의 '가계 및 비영리단체' 부문이라, 이 페이지에서 유일하게 법인이 안 섞인 숫자입니다. 다만 해외주식은 전 세계이고(미국만 못 뗍니다) 해외 상장 ETF 는 '투자펀드'로 따로 잡혀 빠져 있어 실제보다 낮습니다. 분기 자료라 서너 달 늦게 나옵니다.">
          <HouseholdShare h={household} />
        </Card>
      )}
    </>
  );
}
