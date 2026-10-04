import Link from "next/link";

import type { DividendStock } from "@/lib/dividend";

import { showsSepTax } from "../../dividend/calc";
import { DIVIDEND_PAGE } from "../../dividend/copy";
import { Module } from "../../kadera/V2Modules";

/**
 * 종목 페이지의 배당 모듈 — "이 종목을 1주 들면 1년에 얼마 받나, 어느 달에 받나". 서버가 그린다(크롤러가 읽게).
 *
 * 값은 배당으로 살기(/dividend)와 같은 표(kr_dividend_stock)에서 온다: 최근 12개월 실제 지급 합, 전일 종가로 나눈
 * 배당수익률, 지급 달. 여기서는 셈을 안 하고 보여만 준다 — 주수를 넣어 셈하는 건 /dividend 의 일이라 머리 띠 오른쪽 링크가
 * 그리로 잇는다(`?add=코드` 로 열면 그 종목이 담긴 채 열린다).
 *
 * ⚠️ 아래 곁말(배당성향 · 5년 증가율 · 분리과세)의 뜻은 /dividend 의 줄과 같다. 같은 자료에 같은 말.
 * v2(2026-10-03) — 시트 머리(아이콘 · 부제)를 모듈 머리 띠로, 통계 칸 · 꼬리표 알약을 글자 줄로 바꿨다.
 */

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const won = (v: number) => `${Math.round(v).toLocaleString("ko-KR")}원`;

/** wide — 판 폭 한 줄로 설 때(추이의 짝이 아닐 때). 숫자 칸 · 곁말을 왼쪽 열에, 달 막대를 오른쪽에 둔다(v2.css .v2-sk-dv.is-wide). */
export function DividendCard({ s, wide = false }: { s: DividendStock; wide?: boolean }) {
  const byMonth = new Array<number>(13).fill(0);
  for (const p of s.payments) if (p.pay) byMonth[Number(p.pay.slice(5, 7))] += p.amount;
  const paidMonths = MONTHS.filter((m) => byMonth[m] > 0);
  const max = Math.max(...byMonth);
  const facts: string[] = [];
  if (s.payout) facts.push(`${s.payout.year != null ? `${s.payout.year}년 ` : ""}배당성향 ${Math.round(s.payout.pct).toLocaleString("ko-KR")}%`);
  if (s.growth5 != null && s.streak >= 5 && Math.abs(Math.round(s.growth5)) >= 1) facts.push(`5년 연평균 ${s.growth5 > 0 ? "+" : "-"}${Math.abs(Math.round(s.growth5))}%`);
  if (s.streak >= 3) facts.push(s.streak >= 15 ? "15년 넘게 연속 배당" : `${s.streak}년 연속 배당`);
  if (showsSepTax(s)) facts.push("분리과세 대상");
  const href = `${DIVIDEND_PAGE.href}?add=${encodeURIComponent(s.code)}`;

  return (
    <Module
      title="배당"
      meta="최근 12개월 · 1주 기준 원"
      aside={
        s.dps > 0 ? (
          <Link href={href} className="v2-more" data-ga="cta_click" data-ga-cta="to_dividend_calc" data-ga-surface="stock_page">
            {DIVIDEND_PAGE.label}에서 셈하기
          </Link>
        ) : undefined
      }
      className={`v2-sk-dv${wide ? " is-wide" : ""}`}
    >
      {s.dps > 0 ? (
        <div className="v2-tm-trendbody">
          <div className="v2-tm-figs">
            <span>
              <b>{won(s.dps)}</b>
              <em>1주에 1년</em>
            </span>
            <span>
              <b>{s.yieldPct != null ? `${s.yieldPct.toFixed(2)}%` : "없음"}</b>
              <em>배당수익률</em>
            </span>
            <span>
              <b>{paidMonths.length ? `1년에 ${paidMonths.length}번` : "없음"}</b>
              <em>지급</em>
            </span>
          </div>
          {paidMonths.length > 0 && (
            <div className="v2-sk-months" role="img" aria-label={`지급 달 ${paidMonths.map((m) => `${m}월`).join(" · ")}`}>
              {MONTHS.map((m) => {
                const v = byMonth[m];
                return (
                  <span key={m} className={`hz-tip${m >= 10 ? " hz-tip-end" : m <= 3 ? " hz-tip-start" : ""}`} data-tip={v > 0 ? `${m}월 · ${won(v)}` : `${m}월 · 지급 없음`}>
                    <span className="v2-sk-mbar">
                      <i className={v > 0 ? undefined : "is-none"} style={{ height: v > 0 ? `${Math.max(8, (v / max) * 100)}%` : 3 }} />
                    </span>
                    <em>{m}월</em>
                    {/* 그달 받은 돈 — 누르지 않아도 보이게(1주 기준 · 원은 머리 근거가 말한다). */}
                    {v > 0 && <b>{Math.round(v).toLocaleString("ko-KR")}</b>}
                  </span>
                );
              })}
            </div>
          )}
          {/* 폰 — 막대 아래 금액 칸(23px)이 좁아 숨기는 대신 받은 달만 한 줄로(누르지 않아도 보이게, 2026-10-04 점검). */}
          {paidMonths.length > 0 && <p className="v2-sk-paid">{paidMonths.map((m) => `${m}월 ${Math.round(byMonth[m]).toLocaleString("ko-KR")}`).join(" · ")}</p>}
          {(facts.length > 0 || s.unusual) && (
            <p className="v2-sk-facts">
              {facts.join(" · ")}
              {s.unusual && `${facts.length ? " · " : ""}특별 · 청산배당이 섞여 1년 뒤에도 같으리라 보기 어렵습니다`}
            </p>
          )}
        </div>
      ) : (
        <p className="v2-empty">최근 12개월 현금배당이 없습니다.</p>
      )}
    </Module>
  );
}
