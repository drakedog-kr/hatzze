import type { SeohakOverview } from "@/lib/seohak-data";
import { C, MONO, R } from "../ui";
import { Card, Em, Verdict } from "./DailyCards";

/**
 * 매매 습관 — 얼마나 오래 들고 있나.
 *
 * 예탁원 결제(국내 증권사를 거친 개인 채널)라 이 페이지의 모집단과 같다.
 *
 * ⛔ '미국 채권도 산다' 가 같이 있었는데 뺐다. "주식만 사는 게 아니다"는 사실 교정인데
 * **핵심이 2023년이라 절반이 과거**였다(주식 −$2.8B 인데 채권 +$3.2B). 지금 상태로는
 * "작년에 $9.9B" 한 줄이라 카드 한 장 값이 안 된다.
 * ⚠️ 자료(`channel.bondYears`)는 로더에 남겨 둔다 — 지금을 말할 방법이 생기면 되살릴 것.
 */

/**
 * 백만 달러 → "$1.2B". 이 파일의 값은 전부 백만 달러다.
 * ⚠️ $1B 아래는 두 자리다. 한 자리로 두면 2016년 채권 $0.04B 가 `$0B` 로 찍힌다.
 */
const usdB = (mn: number) => {
  const abs = Math.abs(mn) / 1000;
  const digits = abs < 1 ? 2 : abs < 10 ? 1 : 0;
  return `${mn < 0 ? "−" : ""}$${abs.toLocaleString("ko-KR", { maximumFractionDigits: digits })}B`;
};

/**
 * ⑬ 얼마나 오래 들고 있나.
 *
 * ## ⛔ "점점 오래 들고 있다"고 쓰면 안 된다
 *
 * 처음에 그렇게 적을 뻔했다. 연도별로 보면 **오르내린다** — 2019년 8.1 → 2020년 4.5 →
 * 2023년 7.2 → 2024년 5.3 → 2025년 5.8 → 지금 7.3개월. 2023년에 이미 7.2였다.
 * 그래서 추세가 아니라 **'지금 어느 자리인가'** 로만 말한다.
 *
 * ## ⚠️ 분모가 추정이다
 *
 * 회전율 = (매수+매도) ÷ 잔고인데, 분자는 예탁원 실측이고 분모는 유입을 시장 지수로
 * 굴린 값이다. ±20% 로 흔들면 보유기간이 **5.9~8.8개월**로 움직인다. 각주가 밝힌다.
 */
function HoldingPeriod({ ch }: { ch: NonNullable<SeohakOverview["channel"]> }) {
  const t = ch.turnover;
  if (!t) return null;
  const years = t.byYear;
  const lo = Math.min(...years.map((y) => y.months), t.months);
  const hi = Math.max(...years.map((y) => y.months), t.months);
  const span = hi - lo || 1;
  /** 산 것 중 지금 남은 몫. 회전율의 다른 얼굴이라 같은 카드에 둔다. */
  const leftPct = ch.grossBuy ? ((ch.grossBuy - ch.grossSell) / ch.grossBuy) * 100 : 0;
  const rows = [...years, { year: 0, months: t.months }];
  /** 한 열에 몇 줄. 두 열로 설 때도 **두 열이 같은 줄 수**여야 줄이 가로로 맞는다. */
  const perCol = Math.ceil(rows.length / 2);
  const cols = [rows.slice(0, perCol), rows.slice(perCol)].filter((c) => c.length);

  return (
    <>
      <Verdict>
        요즘은 한 번 사면 <Em>{t.months.toFixed(1)}개월</Em>쯤 들고 있습니다
      </Verdict>

      {/* ⚠️ 바깥 칸에 `marginTop:auto` 를 안 쓴다. 두 카드가 stretch 로 같은 높이가 되는데,
          그러면 남는 폭이 통째로 **결론 문장과 표 사이**로 밀려 들어가 빈 띠가 생긴다
          ("공백이 너무 커보여"). 결론과 표는 붙여 두고, 남는 폭은 아래 요약 띠만
          바닥으로 밀어 먹는다 — 그 띠는 이미 구분선을 달고 있어서 카드 바닥에 붙으면
          발판처럼 읽힌다. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, minHeight: 0 }}>
        {/* 해마다의 자리. 막대 길이가 보유기간이고, 마지막 칸이 '지금'이다.
            ⭐ 최소 폭을 8% 주는 이유: 4.5개월이 가장 짧은데 lo 를 0 으로 잡으면 축이
            0~8개월이 되어 칸들이 다 비슷해진다. lo 를 데이터 최솟값에 붙이고 최소 폭을
            남겨 두면 4.5 와 7.3 의 차이가 눈에 들어온다. */}
        {/* ⚠️ 열 줄을 두 열로 세울 수 있게 열어 둔 격자다. 이 카드가 전폭(1,004px)이던
            시절엔 한 열이면 막대가 870px 까지 늘어져 4.5개월과 7.3개월이 다 길어 보였다.
            **지금은 카드가 495px 라 실제로는 늘 한 열이다**(두 열엔 626px 가 필요하다).
            폭이 도로 넓어지면 auto-fit 이 알아서 두 열로 선다.

            ## ⭐ `flex:1` + 줄마다 `1fr` — 남는 폭을 표가 먹는다
            같은 행의 두 카드는 늘 세로가 같은데, 짝(평소와의 차이)은 각주가 몇 줄로
            접히느냐에 따라 426~560px 로 오르내린다. 그 차이를 한 곳에 뭉치게 두면
            표와 요약 띠 사이가 134px 짜리 구멍이 된다(1,060px 에서 실측). 줄 간격으로
            고르게 나눠 먹으면 폭이 어떻든 구멍이 안 생긴다.
            ⚠️ 줄 수를 `perCol` 로 **두 열 모두 같게** 박는다. 6줄·5줄로 두고 늘리면
            두 열의 줄이 가로로 어긋난다(한쪽은 6등분, 한쪽은 5등분이라). */}
        <div style={{ display: "grid", columnGap: 26, rowGap: 4, flex: 1, minHeight: 0,
                      gridTemplateColumns: "repeat(auto-fit, minmax(min(300px, 100%), 1fr))" }}>
          {cols.map((col) => (
            <ul key={col[0].year} style={{ listStyle: "none", margin: 0, padding: 0,
                                           display: "grid", rowGap: 4,
                                           gridTemplateRows: `repeat(${perCol}, minmax(17px, 1fr))` }}>
              {col.map((y) => {
                const nowRow = y.year === 0;
                return (
                  <li key={y.year} style={{ display: "grid", gridTemplateColumns: "36px 1fr 46px",
                                            alignItems: "center", gap: 9 }}>
                    <span style={{ fontSize: 11, fontWeight: nowRow ? 800 : 600,
                                   color: nowRow ? C.ink : C.sub2 }}>
                      {nowRow ? "지금" : y.year}
                    </span>
                    <span className="hz-bar">
                      <span style={{ width: `${8 + ((y.months - lo) / span) * 92}%`,
                                     background: nowRow ? C.blue : C.bar }} />
                    </span>
                    <span style={{ fontFamily: MONO, fontSize: 11.5, textAlign: "right",
                                   fontWeight: nowRow ? 800 : 400,
                                   color: nowRow ? C.ink : C.sub2 }}>
                      {y.months.toFixed(1)}
                    </span>
                  </li>
                );
              })}
            </ul>
          ))}
        </div>

        <div style={{ display: "flex", gap: 7, marginTop: "auto", paddingTop: 9,
                      borderTop: `1px solid ${C.line}` }}>
          {[
            { label: "최근 12개월 거래", note: "매수 + 매도", v: usdB(t.traded) },
            { label: "산 것 중 남은 것", note: `${usdB(ch.grossBuy)} 중`, v: `${leftPct.toFixed(1)}%` },
          ].map((s) => (
            <div key={s.label} style={{ flex: 1, background: C.soft, borderRadius: R.control,
                                        padding: "7px 9px", display: "flex",
                                        flexDirection: "column", gap: 1 }}>
              <span style={{ fontSize: 10.5, color: C.label, fontWeight: 700 }}>{s.label}</span>
              <span style={{ fontSize: 10, color: C.faint }}>{s.note}</span>
              <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 800, color: C.ink }}>
                {s.v}
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export function TradingCards({ ch }: { ch: SeohakOverview["channel"] }) {
  if (!ch) return null;
  return (
    <>
      {/* ⚠️ 알약이 '최근 12개월' 이었다. 그건 **결론 문장의 창**이지 표의 창이 아니다 —
          표는 열 해를 세운다. 12개월이라는 창은 '지금' 줄과 아래 '최근 12개월 거래'
          상자가 이미 말하고 있으므로, 알약은 표가 덮는 기간을 적는다(옆 채권 카드와 같은 자).
          ⚠️ 이 주석은 `{ch.turnover && (` **바깥**에 있어야 한다. 안쪽은 JSX 자식 자리가
          아니라 식 자리라 중괄호 주석이 못 들어간다. */}
      {ch.turnover && (
        <Card icon="schedule" title="얼마나 오래 들고 있나"
              desc="한 번 산 것을 평균 몇 달 만에 되파는지입니다."
              note="최근 10년">
          <HoldingPeriod ch={ch} />
        </Card>
      )}
    </>
  );
}
