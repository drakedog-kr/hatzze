import type { SeohakOverview } from "@/lib/seohak-data";
import { C, MONO, R } from "../ui";
import { BUY, SELL } from "./tone";
import { Card, Em, Verdict } from "./DailyCards";

/**
 * 매매 습관 두 장 — 얼마나 오래 들고 있나 · 미국 채권도 산다.
 *
 * 둘 다 예탁원 결제(국내 증권사를 거친 개인 채널)라 이 페이지의 모집단과 같다.
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

  return (
    <>
      <Verdict>
        요즘은 한 번 사면 <Em>{t.months.toFixed(1)}개월</Em>쯤 들고 있습니다
      </Verdict>

      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
        {/* 해마다의 자리. 막대 길이가 보유기간이고, 마지막 칸이 '지금'이다.
            ⭐ 최소 폭을 8% 주는 이유: 4.5개월이 가장 짧은데 lo 를 0 으로 잡으면 축이
            0~8개월이 되어 칸들이 다 비슷해진다. lo 를 데이터 최솟값에 붙이고 최소 폭을
            남겨 두면 4.5 와 7.3 의 차이가 눈에 들어온다. */}
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex",
                     flexDirection: "column", gap: 4 }}>
          {[...years, { year: 0, months: t.months }].map((y) => {
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

        <div style={{ display: "flex", gap: 7, paddingTop: 9, borderTop: `1px solid ${C.line}` }}>
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

/**
 * ⑭ 미국 채권도 산다.
 *
 * ⭐ 이 카드의 요점은 규모가 아니라 **2023년**이다. 주식에서 $2.8B 를 빼면서 채권으로는
 * $3.2B 를 넣었다 — 주식만 보면 "발을 뺐다"인데 채권까지 보면 "옮겼다"다.
 */
function BondFlow({ ch }: { ch: NonNullable<SeohakOverview["channel"]> }) {
  // ⭐ **최근 열 해만.** 옆 카드(보유기간)가 잔고 문턱 때문에 열 줄로 서는데, 이쪽만
  // 열두 줄이면 나란히 놓인 두 표의 줄 수가 달라 한쪽이 흘러내린 것처럼 보인다.
  // 앞 두 해는 채권이 $0.02B 대라 막대도 안 보이던 줄이다.
  const rows = ch.bondYears.filter((y) => y.net !== 0 || y.stockNet !== 0).slice(-10);
  if (!rows.length) return null;
  const max = Math.max(...rows.flatMap((y) => [Math.abs(y.net), Math.abs(y.stockNet)]), 1);
  /**
   * ⚠️ **결론 문장은 마지막 줄이 아니라 마지막 '온전한 해'를 쓴다.** 올해는 자료가 반년
   * 뿐이라 가장 작은 값인데(2026년 $0.4B), 그걸 머리에 걸면 "채권은 얼마 안 된다"로
   * 읽힌다 — 카드가 말하려는 것과 정반대다.
   */
  const full = rows.filter((y) => y.year < rows[rows.length - 1].year);
  const latest = full[full.length - 1] ?? rows[rows.length - 1];
  /** 주식은 빠졌는데 채권은 들어온 해. 이 카드가 가리키는 자리다. */
  const swap = rows.filter((y) => y.stockNet < 0 && y.net > 0);

  return (
    <>
      <Verdict>
        미국 <Em>채권</Em>에는 {latest.year}년에 <Em>{usdB(latest.net)}</Em>이 들어왔습니다
      </Verdict>

      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex",
                     flexDirection: "column" }}>
          <li style={{ display: "grid", gridTemplateColumns: "34px 1fr 56px 1fr 56px", gap: 8,
                       padding: "0 0 6px", fontSize: 10.5, color: C.faint }}>
            <span>해</span>
            <span />
            <span style={{ textAlign: "right" }}>채권</span>
            <span />
            <span style={{ textAlign: "right" }}>주식</span>
          </li>
          {rows.map((y) => (
            <li key={y.year}
                style={{ display: "grid", gridTemplateColumns: "34px 1fr 56px 1fr 56px",
                         alignItems: "center", gap: 8, padding: "5px 0",
                         borderTop: `1px solid ${C.sheetRow}`,
                         // 주식이 빠진 해를 살짝 띄운다. 이 카드가 가리키는 줄이다.
                         background: y.stockNet < 0 ? C.soft : undefined }}>
              <span style={{ fontSize: 11.5, fontWeight: 600,
                             color: y.stockNet < 0 ? C.ink : C.label }}>{y.year}</span>
              <span className="hz-bar">
                <span style={{ width: `${Math.max(3, (Math.abs(y.net) / max) * 100)}%`,
                               background: y.net >= 0 ? "var(--c-warm-2)" : "var(--c-blue-2)" }} />
              </span>
              <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 700,
                             color: y.net >= 0 ? BUY : SELL, textAlign: "right" }}>
                {usdB(y.net)}
              </span>
              <span className="hz-bar">
                <span style={{ width: `${Math.max(3, (Math.abs(y.stockNet) / max) * 100)}%`,
                               background: y.stockNet >= 0 ? "var(--c-warm-2)" : "var(--c-blue-2)" }} />
              </span>
              <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 700,
                             color: y.stockNet >= 0 ? BUY : SELL, textAlign: "right" }}>
                {usdB(y.stockNet)}
              </span>
            </li>
          ))}
        </ul>
        {swap.length > 0 && (
          <span style={{ fontSize: 11, color: C.sub }}>
            <b style={{ color: C.ink }}>
              {swap.map((y) => `${y.year}년`).join(" · ")}
            </b>
            에는 주식에서 돈을 빼면서 채권으로는 넣었습니다
          </span>
        )}
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
              note="최근 10년"
              foot="잔고가 추정이라 5.9~8.8개월 사이에서 움직입니다.">
          <HoldingPeriod ch={ch} />
        </Card>
      )}
      {ch.bondYears.length > 0 && (
        <Card icon="account_balance_wallet" title="미국 채권도 산다"
              desc="같은 길로 미국 채권에도 돈이 오갑니다."
              note="최근 10년"
              foot="주식과 같은 국내 증권사 채널이고, 국채·회사채를 안 가릅니다.">
          <BondFlow ch={ch} />
        </Card>
      )}
    </>
  );
}
