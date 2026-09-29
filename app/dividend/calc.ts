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

/** 해를 뗀 날의 자리(1~365, 윤년은 안 따진다) — 지난해 지급일과 올해 확정 지급일을 견줄 때. */
const dayOfYear = (m: number, d: number) => Math.round((Date.UTC(2001, m - 1, d) - Date.UTC(2001, 0, 1)) / 86400e3) + 1;

/**
 * 다가오는 일정의 '예상' 건 — 지난 1년 지급 건([달, 1주 금액, 날])을 올해(지났으면 내년)로 옮긴 날 가운데 오늘(iso)~horizon,
 * 가까운 순. 석 달 안 합은 이 건 **전부**를 더한다 — 월배당은 석 달에 세 번 들어오는데 종목마다 가장 가까운 한 번만 더했더니
 * JEPI 같은 월배당이 석 달 치의 3분의 1로 적혔다. 표에는 (확정 건이 없을 때) 첫 건 하나만 선다.
 *
 * 공시된 확정 건(sure)이 있으면 그 건의 짝(지난해의 같은 차례)을 빼야 두 번 안 센다.
 *   지급일이 있으면 — 짝은 지난해 지급일 가운데 해를 떼고 그날에 가장 가까운 것(달로 가르면 9/30 확정과 지난해 10/1 이
 *     다른 건이 된다). 짝이 오늘 앞이라 내년으로 밀려 창 밖이면 뺄 게 없다. 확정 건보다 앞선 예상도 뺀다 — 다음 지급이
 *     확정 건이니 그 앞에 들어올 건 없다.
 *   지급일 없이 기준일만 있으면(국내 결산배당 공시) — 지급은 기준일 뒤라 기준일 뒤 첫 예상이 짝이다.
 */
export function expectedPays(
  pays: [number, number, number][],
  iso: string,
  horizon: string,
  sure: { pay: string | null; record: string | null } | null,
): { date: string; v: number }[] {
  const year = Number(iso.slice(0, 4));
  const all = pays
    .map(([m, v, d], i) => {
      const md = `${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      return { date: `${year}-${md}` >= iso ? `${year}-${md}` : `${year + 1}-${md}`, v, i };
    })
    .filter((e) => e.date <= horizon)
    .sort((a, b) => a.date.localeCompare(b.date));
  let twin = -1;
  if (sure?.pay) {
    const at = dayOfYear(Number(sure.pay.slice(5, 7)), Number(sure.pay.slice(8, 10)));
    const gap = ([m, , d]: [number, number, number]) => {
      const g = Math.abs(dayOfYear(m, d) - at);
      return Math.min(g, 365 - g);
    };
    pays.forEach((p, i) => {
      if (twin < 0 || gap(p) < gap(pays[twin])) twin = i;
    });
  } else if (sure?.record) {
    const record = sure.record;
    twin = all.find((e) => e.date >= record)?.i ?? -1;
  }
  const after = sure?.pay ?? "";
  return all.filter((e) => e.i !== twin && e.date > after).map(({ date, v }) => ({ date, v }));
}
