// 배당으로 살기의 셈 가운데 React·세율표 없이 도는 조각. 한 화면의 여러 칸이 같은 담은 종목을 세므로, 칸마다 식을 따로 두면
// 숫자가 어긋난다(2026-09-29 감사). 테스트(tests/dividend-calc.test.ts)가 읽을 수 있게 .tsx 가 아니고, 값을 끌어오는 import 가 없다.

import type { Line } from "./shared";
import type { StockLite } from "./types";

/** 달력이 한 줄에서 보는 칸만. */
type CalLine = Pick<Line, "shares" | "grossKrw" | "netKrw"> & { stock: Pick<StockLite, "currency" | "pays"> };

/**
 * 달력(달마다 얼마 들어오나)의 칸 값(원). m[1]~m[12], m[0] 은 안 쓴다. 지급 건(pays)마다 1주 금액 × 주수 × 그 줄의 세후 비율.
 *
 * 세후 비율은 세율을 여기서 다시 세지 않고 줄의 세후 ÷ 세전(computeLines)으로 — 과세 몫(국내 ETF 과표·감액배당), 연금 계좌의
 * 전액 과세, 비과세 종합저축 한도 초과가 이미 거기 들었다. 달력만 옛 식(1 − 세율)으로 셌더니 감액배당 종목이 15.4% 깎이고
 * 과표 20% ETF 가 전액 과세로 찍혀, 같은 종목이 히어로·표·다가오는 일정과 다른 값이었다.
 */
export function monthlyOf(lines: CalLine[], fx: number): number[] {
  const m = new Array<number>(13).fill(0);
  for (const l of lines) {
    // 세전이 0 인 줄(0주, 최근 1년 배당 0)은 표·합계에서도 0 이라 달력에도 안 넣는다.
    const keep = l.grossKrw > 0 ? l.netKrw / l.grossKrw : 0;
    // 달러 지급 건(미국 주식·ETF)은 환율을 곱해야 원화 달력에 든다 — 빠뜨렸더니 SCHD 3월이 22원으로 찍혔다.
    const f = keep * (l.stock.currency === "USD" ? fx : 1);
    for (const [month, amt] of l.stock.pays) m[month] += amt * l.shares * f;
  }
  return m;
}
