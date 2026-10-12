import type { EtfFlowBoard } from "@/lib/etf-flow";
import { hasFinal } from "@/lib/format";

import { etfHref } from "./copy";
import { fmtFlow } from "./format";

/**
 * ETF 브리핑 — 히어로 띠 가운데 모듈의 문장. LLM 이 아니라 **숫자로 짓는다**(홈 '오늘의 브리핑'은 LLM 이지만 이 화면은 셈만으로 말할 수
 * 있는 것만 말한다 — 비용 · 파이프라인 단계가 없고, 숫자와 문장이 어긋날 수 없다).
 *
 * ⭐ 줄마다 PC 에서 한 줄 — 문장 폭 331px(13px) 안. 1,280 사이드바 접음의 칸 폭이라 1,440(펼침 341 · 접음 451) · 1,920(473)에서도 한 줄이다
 *    (2026-10-12 "ETF 브리핑은 되도록 한 줄 · 사이드바 접은 상태일 때라도"). 이름표가 말하는 것은 문장에서 뺀다(새 상장 → '10개 중 …').
 *    ETF 이름이 들어간 줄은 이름 길이에 따라 넘칠 수 있다.
 * 줄은 다섯 — 흐름 · 꾸준함 · 유출 · 반전(없으면 1주) · 새 상장(2026-10-12 '유출'을 더해 다섯 — 옆 수익률 상위가 다섯 줄이 되며 가로선을 맞췄다).
 * ETF 이름은 그 상세(/etf/[code])로 잇는다({ b, href }) — 홈 '오늘의 브리핑'의 종목 링크와 같은 꼴(.hz-brief3-link). 줄마다 한 문장(2026-10-11 "브리핑이 다른 페이지들에 비해 너무 길다" → 셋으로 줄였다가
 * "허전하다 · 유용한 정보가 요약돼 있지 않다"로 아래 카드에 없는 요약 넷으로). 짚는 말(몫 · 이름 · 날 수)은 { b } 로 돌려주고 화면이 한 단
 * 진한 잉크로 가른다(MDD 낙폭 요약과 같은 규칙 · 굵게 두면 얼룩진다).
 * ⛔ 사라 · 팔라는 말을 하지 않는다 — 들어오고 나간 사실만.
 */

export type BriefPart = string | { b: string; href?: string };
export type BriefRow = { label: string; parts: BriefPart[] };

/** 받침을 보는 낱말 — 끝 괄호는 벗기고 그 안 끝 글자로('…(합성)' → '성'). */
const iGa = (w: string) => (hasFinal(w.replace(/\)$/, "")) ? "이" : "가");

export function buildEtfBrief(b: EtfFlowBoard): BriefRow[] {
  const rows: BriefRow[] = [];

  // ⭐ 브리핑은 아래 카드에 없는 말을 한다 — 몫 · 쏠림 · 이어짐 · 새 상장 · 방향이 뒤집힌 곳(셈해서 얻는 말). 1달 합은 옆 큰 숫자가, 유형별 금액은
  // 아래 유형 목록이 이미 보여 적지 않는다(2026-10-11 중복 걷기 — 7.52조가 세 번 섰다). 줄은 넷, 줄마다 한 문장(홈 오늘의 브리핑과 같은 꼴).

  // 흐름 — 순유입 중 파킹형 몫 + 위 10개 ETF 몫. 둘 다 순유입 합(옆 큰 숫자)을 바탕으로 한다. 몫은 합보다 작을 때만 적는다.
  const parking = b.groups.find((g) => g.group === "파킹형");
  const flow: BriefPart[] = [];
  // 말은 시장에서 쓰는 꼴로 — 돈이 '들어왔다'가 아니라 자금이 '유입됐다 · 몰렸다 · 빠져나갔다'(2026-10-12 "들어왔다는 건 흔하지 않다").
  if (b.totalM <= 0) flow.push("ETF 전체로는 자금이 빠져나갔습니다.");
  else {
    const pShare = parking && parking.m > 0 && parking.m <= b.totalM ? Math.round((parking.m / b.totalM) * 100) : null;
    const top = b.top10Share != null && b.top10Share <= 100 ? Math.round(b.top10Share) : null;
    // '위 10개'는 '상위 10개'로 — 순위 말에선 사람들이 '상위'를 쓴다(2026-10-12 디자인 점검).
    if (pShare != null && top != null) flow.push("순유입의 ", { b: `${pShare}%` }, "가 파킹형이고 ", { b: `${top}%` }, "는 상위 10개 ETF입니다.");
    else if (pShare != null) flow.push("순유입의 ", { b: `${pShare}%` }, "가 파킹형입니다.");
    else if (top != null) flow.push("순유입의 ", { b: `${top}%` }, "가 상위 10개 ETF에 몰렸습니다.");
    if (!flow.length) flow.push("ETF 전체로 자금이 유입됐습니다.");
  }
  rows.push({ label: "흐름", parts: flow });

  // 꾸준함 — 가장 길게 이어서 순유입된 ETF(닷새 넘게 이어진 것만 — 그 아래는 흔하다). '13거래일 이어서 들어왔다' → '13거래일 연속 자금이 유입됐다'.
  if (b.streakTop && b.streakTop.streak >= 5) {
    rows.push({
      label: "꾸준함",
      parts: [{ b: b.streakTop.name, href: etfHref(b.streakTop.code) }, "에 ", { b: `${b.streakTop.streak}거래일` }, " 연속 자금이 유입됐습니다."],
    });
  }

  // 유출 — 1달 동안 가장 많이 빠진 ETF. 아래 표는 순유입 차례로 펴서 머리를 눌러야 보인다(2026-10-12 다섯째 줄). '금액 + 빠졌다'는 그대로 둔다.
  if (b.outTop) {
    const amt = fmtFlow(b.outTop.m).replace(/^-/, "");
    rows.push({ label: "유출", parts: [{ b: b.outTop.name, href: etfHref(b.outTop.code) }, "에서 가장 많은 ", { b: amt }, `${iGa(amt)} 빠졌습니다.`] });
  }

  // 반전 — 1달과 방향이 뒤집힌 유형 중 1주 크기가 가장 큰 것(500억 넘는 것만). 없으면 1주 합의 방향(이름표 '1주').
  // '돌아섰다'가 1달은 반대였다는 뜻을 품어 '1달 동안 자금이 빠져나갔지만'은 뺐다(한 줄 폭 · 431px → 264px).
  const flip = b.groups.filter((g) => g.m * g.w < 0 && Math.abs(g.w) >= 500).sort((x, y) => Math.abs(y.w) - Math.abs(x.w))[0];
  if (flip) {
    rows.push({
      label: "반전",
      parts: [{ b: flip.group }, `${iGa(flip.group)} 최근 1주 ${flip.w > 0 ? "순유입으로" : "순유출로"} 돌아섰습니다.`],
    });
  } else {
    rows.push({ label: "1주", parts: [b.totalW >= 0 ? "최근 1주에도 순유입이 이어졌습니다." : "최근 1주에는 자금이 빠져나갔습니다."] });
  }

  // 새 상장 — 1달 안에 상장한 ETF 수와 그중 자금이 가장 많이 몰린 것.
  if (b.newCount > 0) {
    // 이름표가 '새 상장'이라 문장은 '10개 중 …'으로 연다(한 줄 폭 · 501px → 319px).
    const parts: BriefPart[] =
      b.newTop && b.newTop.m > 0
        ? [{ b: `${b.newCount}개` }, " 중 ", { b: b.newTop.name, href: etfHref(b.newTop.code) }, "에 가장 많이 몰렸습니다."]
        : ["1달 동안 ", { b: `${b.newCount}개` }, "가 새로 상장했습니다."];
    rows.push({ label: "새 상장", parts });
  }

  return rows;
}
