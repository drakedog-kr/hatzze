import Link from "next/link";

import type { DividendStock } from "@/lib/dividend";

import { DIVIDEND_PAGE } from "../../dividend/copy";
import { SectionHead } from "../../kadera/SectionHead";
import { C, MONO } from "../../ui";

/**
 * 종목 페이지의 배당 카드 — "이 종목을 1주 들면 1년에 얼마 받나, 어느 달에 받나". 서버가 그린다(크롤러가 읽게).
 *
 * 값은 배당으로 살기(/dividend)와 같은 표(kr_dividend_stock)에서 온다: 최근 12개월 실제 지급 합, 전일 종가로 나눈
 * 배당수익률, 지급 달. 여기서는 셈을 안 하고 보여만 준다 — 주수를 넣어 셈하는 건 /dividend 의 일이라 마지막 줄이
 * 그리로 잇는다(`?add=코드` 로 열면 그 종목이 담긴 채 열린다).
 *
 * ⚠️ 이름 옆 배지·알약의 뜻은 /dividend 의 줄과 같다(배당성향·5년 증가율·분리과세). 같은 자료에 같은 말.
 */
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const won = (v: number) => `${Math.round(v).toLocaleString("ko-KR")}원`;

export function DividendCard({ s }: { s: DividendStock }) {
  // 달마다 1주에 얼마 — 지급일이 있는 건만(지급일 없는 미래분은 달을 모른다).
  const byMonth = new Array<number>(13).fill(0);
  for (const p of s.payments) if (p.pay) byMonth[Number(p.pay.slice(5, 7))] += p.amount;
  const paidMonths = MONTHS.filter((m) => byMonth[m] > 0);
  const max = Math.max(...byMonth);
  const facts: string[] = [];
  if (s.payout) facts.push(`${s.payout.year != null ? `${s.payout.year}년 ` : ""}배당성향 ${Math.round(s.payout.pct).toLocaleString("ko-KR")}%`);
  if (s.growth5 != null && s.streak >= 5 && Math.abs(Math.round(s.growth5)) >= 1) facts.push(`5년 연 ${s.growth5 > 0 ? "+" : "−"}${Math.abs(Math.round(s.growth5))}%`);
  if (s.streak >= 3) facts.push(s.streak >= 15 ? "15년 넘게 연속 배당" : `${s.streak}년 연속 배당`);
  if (s.highDiv) facts.push("분리과세 대상");
  const href = `${DIVIDEND_PAGE.href}?add=${encodeURIComponent(s.code)}`;

  return (
    <section className="hz-sheet">
      <SectionHead
        // 'paid'(동전 더미)는 사이드바 NAV 와 오픈 소식 띠가 쓴다 — 띠가 뜨는 동안 이 카드와 한 화면에 서므로 다른 그림(payments).
        icon="payments"
        title="배당"
        desc={s.dps > 0 ? "최근 12개월에 실제로 준 배당과 지급된 달입니다. 다음 해에도 같으리라는 보장은 없습니다." : "최근 12개월 현금배당이 없습니다."}
        level={2}
      />
      {s.dps > 0 && (
        <div style={{ padding: "16px 22px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="hz-tx-stats" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))", maxWidth: 560 }}>
            <div className="hz-tx-stat">
              <span className="hz-tx-stat-l">1주에 1년</span>
              <span className="hz-tx-stat-v" style={{ fontFamily: MONO }}>{won(s.dps)}</span>
            </div>
            <div className="hz-tx-stat">
              <span className="hz-tx-stat-l">배당수익률</span>
              <span className="hz-tx-stat-v" style={{ fontFamily: MONO }}>{s.yieldPct != null ? `${s.yieldPct.toFixed(2)}%` : "·"}</span>
            </div>
            <div className="hz-tx-stat">
              <span className="hz-tx-stat-l">지급</span>
              <span className="hz-tx-stat-v">{paidMonths.length ? `1년에 ${paidMonths.length}번` : "·"}</span>
            </div>
          </div>

          {/* 열두 칸 — 지급된 달만 막대와 금액. /dividend 의 달력과 같은 그림이되 누를 것은 없다. */}
          {paidMonths.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(12, minmax(0, 1fr))", gap: 6 }}>
              {MONTHS.map((m) => {
                const v = byMonth[m];
                return (
                  <div key={m} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 4, minHeight: 64 }}>
                    <span
                      aria-hidden="true"
                      style={{
                        width: "100%",
                        maxWidth: 26,
                        height: v > 0 ? `${Math.max(8, (v / max) * 100)}%` : 3,
                        borderRadius: v > 0 ? "4px 4px 2px 2px" : 2,
                        background: v > 0 ? C.blue : C.track,
                      }}
                    />
                    <span style={{ fontSize: "var(--fs-11)", color: C.sub }}>{m}월</span>
                    <span style={{ fontFamily: MONO, fontSize: "var(--fs-11)", fontWeight: 700, color: v > 0 ? C.ink : C.muted, whiteSpace: "nowrap" }}>{v > 0 ? won(v) : "·"}</span>
                  </div>
                );
              })}
            </div>
          )}

          {(facts.length > 0 || s.unusual) && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
              {facts.map((f) => (
                <span key={f} className="dv-tfact">
                  {f}
                </span>
              ))}
              {s.unusual && <span style={{ fontSize: "var(--fs-11-5)", color: C.label }}>특별·청산배당이 섞여 있어 1년 뒤에도 같으리라 보기 어렵습니다</span>}
            </div>
          )}

          <Link
            href={href}
            className="hz-tx-btn"
            style={{ alignSelf: "flex-start", padding: "0 16px" }}
            data-ga="cta_click"
            data-ga-cta="to_dividend_calc"
            data-ga-surface="stock_page"
          >
            {/* 화살표 아이콘은 아래 'MDD 정밀분석에서 보기'가 이미 쓴다 — 한 화면에 같은 아이콘 둘 금지. */}
            {DIVIDEND_PAGE.label}에서 주수 넣어 계산하기
          </Link>
        </div>
      )}
    </section>
  );
}
