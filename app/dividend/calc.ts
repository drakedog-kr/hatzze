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

/**
 * 목표까지 칸이 세는 바탕 — 투자금과 그 투자금이 내는 1년 세후 배당(원). 수익률(세후 ÷ 투자금)이 필요한 투자금·달 수·
 * 5·10·20년 뒤를 다 정한다. 종가도 평단도 없는 줄(investKrw null)은 배당만 있고 투자금은 0 으로 들어가 수익률을 부풀린다
 * (KRX 시세를 못 받은 날엔 국내 ETF 가 전부 그렇다) — 둘에서 다 뺀다. 히어로의 배당수익률과 같은 식이다.
 * skipped 는 그렇게 뺀 줄 가운데 배당이 있는 것의 수(칸에 "빼고 셌다"고 적는다).
 */
export function goalBasis(
  lines: (Pick<Line, "investKrw" | "netKrw"> & { stock: Pick<StockLite, "code"> })[],
): { invest: number; net: number; skipped: number } {
  const priced = lines.filter((l) => l.investKrw != null);
  return {
    invest: priced.reduce((s, l) => s + (l.investKrw ?? 0), 0),
    net: priced.reduce((s, l) => s + l.netKrw, 0),
    // '종가가 없는 N종목' 이라 줄이 아니라 종목을 센다 — 같은 종목을 두 계좌에 나눠 담으면 두 줄이다.
    skipped: new Set(lines.filter((l) => l.investKrw == null && l.netKrw > 0).map((l) => l.stock.code)).size,
  };
}

/**
 * '분리과세' 알약을 붙이나 — 고배당기업(배당소득 분리과세 대상, 2026~2028)이고 지난 1년 배당에 과세되는 몫이 있을 때.
 * 전부 감액배당(비과세)이면 안 붙인다 — 배당소득이 아니라 분리과세를 고를 몫이 없다(메가스터디, 2026-09-17 지적).
 * /dividend 의 줄(Holdings)과 종목 페이지 배당 카드(DividendCard)가 같이 쓴다 — 카드만 이 조건이 빠져 두 화면이 달랐다.
 * 계좌에 따른 조건(일반 계좌 줄에만)은 줄 쪽이 따로 건다. highDiv 는 화면마다 꼴이 달라 있나 없나만 본다.
 */
export function showsSepTax(s: { highDiv: object | null; taxable: number | null; dps: number }): boolean {
  const fullyTaxFree = s.taxable != null && s.dps > 0 && s.taxable <= 0;
  return s.highDiv != null && !fullyTaxFree;
}

/* ── 검색 ─────────────────────────────────────────────────────────── */
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");

/**
 * 종목 검색 상자(Search.tsx)의 순위. 등급표는 MDD·⌘K 검색과 같은 줄 세움이다(lib/search-rank.ts 머리말).
 *
 *   0    코드·티커가 똑같다      "O" → 리얼티인컴, "005930" → 삼성전자
 *   1    이름 앞부분
 *   2    코드·티커 앞부분
 *   2.5  영문명 앞부분            "coca" → 코카콜라
 *   3    이름 안
 *   3.5  영문명 안
 *   ⚠️ 영문자·숫자 **한 글자**면 '안' 매치(3·3.5)를 안 본다 — 그건 티커를 치는 중이다. 한글 한 글자("배")는 이름 안도 본다.
 *
 * 같은 등급 안에서는 **큰 회사**부터, 그다음 이름이 짧은 것 — "삼성전" 은 삼성전자(1,600조)가 삼성전기우보다, "KB" 는
 * KB금융이 KBG 보다 앞에 선다(배당금 순으로 세웠더니 삼성전기우가, 이름 길이 순으로 세웠더니 KBG 가 맨 위였다).
 *
 * ⚠️ 예전엔 이름 앞 → 이름·영문명 안 → 코드 앞 순이라 서학개미가 가장 흔히 치는 **짧은 티커**가 묻혔다. "O" 를 치면 영문명에
 *    o 가 든 미국 종목 수백 개가 리얼티인컴(O)보다 앞섰고, 미장 칸은 넷만 보여 아예 안 보였다 — T(AT&T)·MO(알트리아)·V(비자)도
 *    같았다(2026-10-01 점검 dividend#8). 영문명 '안' 매치를 한 글자에 걸면 거의 모든 미국 종목이 걸린다.
 */
export function rankMatches<T extends Pick<StockLite, "code" | "name" | "alias" | "cap">>(stocks: T[], query: string, limit = 8): T[] {
  const q = norm(query);
  if (!q) return [];
  const qCode = q.toUpperCase();
  const tickerish = /^[a-z0-9]$/.test(q);
  const graded: { s: T; g: number }[] = [];
  for (const s of stocks) {
    const name = norm(s.name);
    const alias = s.alias ? norm(s.alias) : "";
    const code = s.code.toUpperCase();
    let g: number;
    if (code === qCode || name === q) g = 0;
    else if (name.startsWith(q)) g = 1;
    else if (code.startsWith(qCode)) g = 2;
    else if (alias.startsWith(q)) g = 2.5;
    else if (tickerish) continue;
    else if (name.includes(q)) g = 3;
    else if (alias.includes(q)) g = 3.5;
    else continue;
    graded.push({ s, g });
  }
  graded.sort((a, b) => a.g - b.g || b.s.cap - a.s.cap || a.s.name.length - b.s.name.length || a.s.name.localeCompare(b.s.name, "ko"));
  return graded.slice(0, limit).map((x) => x.s);
}
