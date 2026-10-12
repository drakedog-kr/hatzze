import type { EtfDetail } from "@/lib/etf-detail";

import { etfHref } from "../copy";
import { fmtPct, fmtSize } from "../format";
import { dayLong } from "./dates";

/**
 * ETF 상세 브리핑 — 숫자로 지은 문장 다섯(LLM 아님 · 메인 화면 app/etf/brief.ts 와 같은 꼴). 짚는 숫자는 { b } 로 한 단 진한 잉크,
 * 다른 ETF 이름은 { b, href } 로 그 상세 링크(메인 브리핑과 같은 .hz-brief3-link).
 *
 * 줄은 다섯 — 옆 '기본 정보' 다섯 줄과 가로선을 맞춘다(2026-10-12 메인 브리핑 · 수익률 상위가 다섯 줄이 되며 상세도 같이). 자료가 없는 줄은
 * 뒤 후보로 메운다. 차례:
 *   흐름      1달 순유입의 전 ETF 순위 · 최근 연속 유입 날(금액은 아래 '기간별 순유입'이 말한다 — 같은 숫자를 두 번 세우지 않는다)
 *   지수      국내 기초면 추적 지수 대비(배수 상품은 몇 배 움직였나), 해외 기초면 기간 최고가 대비
 *   분배금    가장 최근 분배(매달 나누면 직전 달 대비 증감까지), 없으면 없다는 사실(기간 합은 아래 '분배금' 요약 칸이 말한다)
 *   같은 지수 순자산 · 총보수 순위(가까운 쪽 끝에서 센다)
 *   1년 수익률 같은 지수 ETF 중 1년 수익률 순위 · 1위 이름(링크) — 같은 지수 ETF 가 없거나 1년이 안 됐으면 건넌다
 *   (메움)    거래대금 · 괴리율 → 최고가(지수 줄이 최고가가 아니었으면)
 * ⭐ 줄마다 PC 에서 한 줄 — 문장 폭 331px 안(메인 브리핑 app/etf/brief.ts 머리말과 같은 잣대 · 2026-10-12 "되도록 한 줄"). 그래서 수익률 줄은
 *    이름표를 '1년 수익률'로 두고 같은 지수 줄 뒤에 세워 '15개 중 8위'로 연다.
 * 말은 시장에서 쓰는 꼴로 — 돈이 '들어왔다'가 아니라 자금이 '유입됐다' · '빠져나갔다'(2026-10-12 "들어왔다는 건 흔하지 않다").
 * ⛔ 무엇을 사라고 권하지 않는다 — 사실만.
 */
export type BriefRow = { label: string; parts: (string | { b: string; href?: string })[] };

const ROWS = 5;
const won = (v: number) => `${Math.round(v).toLocaleString("ko-KR")}원`;

export function buildEtfDetailBrief(d: EtfDetail, mult: number | null): BriefRow[] {
  const rows: BriefRow[] = [];
  const h = d.head;
  const per = h.label;

  // 흐름 — 들어왔으면 순유입 순위, 빠졌으면 빠져나간 쪽 순위('1,172개 중 1,172위'는 끝자리라는 뜻이 한번에 안 읽혔다 · 2026-10-12).
  const month = d.periods.find((p) => p.key === "m");
  if (d.rank && month) {
    const of = { b: `${d.rank.of.toLocaleString("ko-KR")}개` };
    // 순자산의 0.1% 도 안 움직였으면 순위 대신 '엇비슷하다' — KODEX 200(순자산 24.5조) 1달 −18억이 '빠진 돈이 213번째로 많다'로 섰다(2026-10-12).
    const flat = d.netAsset > 0 && Math.abs(month.flow) < d.netAsset * 0.001;
    // 연속 유입은 같은 문장 뒤에 붙인다('…이고 3거래일 연속 유입 중입니다') — 두 문장이면 한 줄을 넘었다.
    const streak = d.streak >= 3 ? { b: `${d.streak}거래일` } : null;
    const k = d.rank.of - d.rank.flow + 1;
    const outRank = { b: `${k.toLocaleString("ko-KR")}위` };
    const parts: BriefRow["parts"] = flat
      ? streak
        ? ["1달 유입과 유출이 엇비슷하고 ", streak, " 연속 유입 중입니다."]
        : ["1달 동안 자금 유입과 유출이 엇비슷합니다."]
      : month.flow >= 0
        ? streak
          ? ["1달 순유입이 전체 ", { b: `${d.rank.flow.toLocaleString("ko-KR")}위` }, "이고 ", streak, " 연속 유입 중입니다."]
          : ["1달 순유입이 전체 ETF ", of, " 중 ", { b: `${d.rank.flow.toLocaleString("ko-KR")}위` }, "입니다."]
        : streak
          ? ["1달 유출이 전체 ", outRank, "지만 ", streak, " 연속 유입 중입니다."]
          : k === 1
            ? ["1달 동안 빠져나간 자금이 전체 ETF 중 ", { b: "가장 많습니다" }, "."]
            : ["1달 동안 빠져나간 자금이 전체 ", { b: `${k.toLocaleString("ko-KR")}번째로 많습니다` }, "."];
    rows.push({ label: "흐름", parts });
  }

  // 지수 — 국내 기초. 해외 기초는 지수 값이 원화 환산 전이라 최고가 대비로 갈음한다.
  const high = (): BriefRow | null => {
    if (!d.high || !d.close) return null;
    const off = (d.close / d.high.close - 1) * 100;
    return {
      label: "최고가",
      parts:
        off > -0.05
          ? [`${per} 최고가입니다.`]
          : [`${per} 최고가(`, { b: dayLong(d.high.date, d.asOf) }, ")보다 ", { b: `${Math.abs(off).toFixed(1)}%` }, " 낮습니다."],
    };
  };
  let usedHigh = false;
  if (!d.abroad && h.ret != null && h.idx != null && Math.abs(h.idx) >= 0.5) {
    if (mult) {
      const times = h.ret / h.idx;
      rows.push({
        label: "지수",
        parts: [`${per === "1년" ? "1년간" : per} 추적 지수가 `, { b: fmtPct(h.idx) }, h.idx > 0 ? " 오를 때 " : " 내릴 때 ", { b: `${times.toFixed(1)}배` }, " 움직였습니다."],
      });
    } else {
      const diff = h.ret - h.idx;
      const abs = Math.abs(diff);
      rows.push({
        label: "지수",
        parts:
          abs < 0.05
            ? [`${per} 수익률이 추적 지수와 같습니다.`]
            : [`${per} 수익률이 추적 지수보다 `, { b: `${abs.toFixed(1)}%p` }, diff > 0 ? " 높습니다." : " 낮습니다."],
      });
    }
  } else {
    const r = high();
    if (r) {
      rows.push(r);
      usedHigh = true;
    }
  }

  // 분배금 — 가장 최근 분배. 한때 '1년 합'을 적었다 — 바로 아래 분배금 요약 칸 첫 칸과 같은 숫자였고, 한 번만 분배한 머니마켓은
  // '1,498원을 나눴고 1년 합은 1,498원'이 됐다(2026-10-12 디자인 점검). 직전 대비 증감은 매달 분배하는 것만 — 분기 분배는 4월(국내 기업
  // 결산 배당)이 커서 KODEX 200 이 '직전보다 59.0% 적다'가 됐다. 분배 기록은 1년치라 1년 전 같은 차례와는 못 견준다.
  if (d.dist) {
    const [p, prev] = d.dist.payments;
    const day = p.record ?? p.pay;
    const parts: BriefRow["parts"] = day ? [{ b: dayLong(day, d.asOf) }, " 기준 ", { b: won(p.amount) }] : [{ b: won(p.amount) }];
    const chg = d.dist.cadence === "월" && prev && prev.amount > 0 ? (p.amount / prev.amount - 1) * 100 : null;
    if (chg == null) parts.push("을 분배했습니다.");
    else if (Math.abs(chg) < 0.5) parts.push("으로 직전과 같습니다.");
    else parts.push("으로 직전보다 ", { b: `${Math.abs(chg).toFixed(1)}%` }, chg > 0 ? " 늘었습니다." : " 줄었습니다.");
    rows.push({ label: "분배금", parts });
  } else {
    rows.push({ label: "분배금", parts: ["최근 1년 분배 기록이 없습니다."] });
  }

  // 같은 지수 — 순자산 · 총보수 순위.
  const sib = d.siblings;
  if (sib.length >= 2) {
    const sizeRank = sib.findIndex((s) => s.self) + 1;
    const fees = sib.filter((s) => s.fee != null).map((s) => s.fee!);
    const self = sib.find((s) => s.self);
    // 이름표가 '같은 지수'라 문장은 'ETF n개 중'으로 연다 — '같은 지수 같은 지수 ETF'로 겹쳤다(2026-10-12).
    const parts: BriefRow["parts"] = ["ETF ", { b: `${sib.length}개` }, " 중 순자산 ", { b: `${sizeRank}위` }];
    if (self?.fee != null && fees.length >= 2) {
      // 가까운 쪽 끝에서 센다 — 15개 중 '14번째로 낮다' · 3개 중 '3번째로 낮다'(= 가장 높다)는 한번에 안 읽혔다(2026-10-12).
      const cheaper = fees.filter((f) => f < self.fee!).length;
      const pricier = fees.filter((f) => f > self.fee!).length;
      const fee =
        cheaper === 0 ? "가장 낮습니다" : pricier === 0 ? "가장 높습니다" : cheaper <= pricier ? `${cheaper + 1}번째로 낮습니다` : `${pricier + 1}번째로 높습니다`;
      parts.push("이고 총보수는 ", { b: fee }, ".");
    } else parts.push("입니다.");
    rows.push({ label: "같은 지수", parts });
  }

  // 1년 수익률 — 같은 지수 ETF 중 1년 수익률 순위. 1위가 아니면 1위 이름을 그 상세로 잇는다 — 같은 지수에서 가장 많이 번 상품이
  // 무엇인지가 고를 때 가장 먼저 보는 것이다(2025-02 운용사 설문 · 수익률 63%). 바로 위 같은 지수 줄이 'ETF 15개 중'을 말해 '15개 중 8위'로 연다.
  const withR = d.siblings.filter((s) => s.r != null);
  const me = withR.find((s) => s.self);
  if (me && withR.length >= 2 && per === "1년") {
    const higher = withR.filter((s) => s.r! > me.r!).length;
    const best = withR.reduce((m, s) => (s.r! > m.r! ? s : m), withR[0]);
    // 표는 '(H)'를 떼고 환헤지 꼬리표를 단다 — 문장엔 꼬리표가 없어 '(H)'를 되붙인다(안 붙이면 'RISE 미국S&P500'이 다른 상품 이름이 된다).
    const bestName = best.hedged && !best.name.includes("환헤지") ? `${best.name}(H)` : best.name;
    const of: BriefRow["parts"] = [{ b: `${withR.length}개` }, " 중 "];
    rows.push({
      label: "1년 수익률",
      parts:
        higher === 0
          ? [...of, { b: "가장 높습니다" }, "."]
          : [...of, { b: `${higher + 1}위` }, "이고 1위는 ", { b: bestName, href: etfHref(best.code) }, "입니다."],
    });
  }

  // 메움 — 다섯이 안 되면 거래 → 최고가 차례로.
  if (rows.length < ROWS) {
    const parts: BriefRow["parts"] = ["하루 평균 거래대금은 ", { b: fmtSize(d.tradeValue) }];
    if (d.gap != null) parts.push("이고 괴리율은 ", { b: fmtPct(d.gap, 2) }, "입니다.");
    else parts.push("입니다.");
    rows.push({ label: "거래", parts });
  }
  if (rows.length < ROWS && !usedHigh) {
    const r = high();
    if (r) rows.push(r);
  }
  return rows.slice(0, ROWS);
}
