// 배당으로 살기의 셈 가운데 React·계좌 세율표(tax.tsx) 없이 도는 조각. 한 화면의 여러 칸이 같은 담은 종목을 세므로, 칸마다 식을 따로 두면
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
 * JEPI 같은 월배당이 석 달 치의 3분의 1로 적혔다. 표에도 전부 선다(줄 합이 머리 합과 맞게, 2026-10-04).
 *
 * 공시된 확정 건(sure)이 있으면 그 건의 짝(지난해의 같은 차례)을 빼야 두 번 안 센다.
 *   지급일이 있으면 — 짝은 지난해 지급일 가운데 해를 떼고 그날에 가장 가까운 것(달로 가르면 9/30 확정과 지난해 10/1 이
 *     다른 건이 된다). 짝이 오늘 앞이라 내년으로 밀려 창 밖이면 뺄 게 없다. 확정 건보다 앞선 예상도 뺀다 — 다음 지급이
 *     확정 건이니 그 앞에 들어올 건 없다.
 *   지급일 없이 기준일만 있으면(국내 결산배당 공시) — 지급은 기준일 뒤라 기준일 뒤 첫 예상이 짝이다.
 *
 * latest 면 금액은 지난해 같은 차례가 아니라 **가장 최근 지급 건**의 금액 — 미국 종목은 회차마다 같은 금액을 주다가 올리므로,
 * 같은 차례 금액이면 그 뒤에 올린 배당이 안 들었다(IBM 12월 예상 $1.68, 최근은 $1.69 · 2026-10-04 점검). 결산 · 중간 금액이
 * 다른 국내 종목은 같은 차례 금액이 맞아 쓰지 않는다.
 * 최근 금액은 공시된 확정 건(sure.amount)이 있으면 그것이고, 같은 차례 금액과 ±25% 안일 때만 바꿔 쓴다 — 그 밖은 인상이 아니라
 * 특별배당이나 반기마다 금액이 다른 배당이다. 한 건으로 다 바꾸면 HST 정기 $0.20 차례가 특별배당 $0.92 로, AZN 3월 $2.17 이
 * $1.06 으로 적혔다(2026-10-05 머지 전 점검).
 */
export function expectedPays(
  pays: [number, number, number][],
  iso: string,
  horizon: string,
  sure: { pay: string | null; record: string | null; amount?: number | null } | null,
  latest = false,
): { date: string; v: number }[] {
  const year = Number(iso.slice(0, 4));
  // 가장 최근 지급 건 — 해를 뗀 날이 오늘 앞이면 올해, 아니면 지난해에 준 것으로 보고 가장 늦은 날.
  let lastV: number | null = null;
  if (latest && sure?.amount) lastV = sure.amount;
  else if (latest && pays.length) {
    const past = pays.map(([m, v, d]) => {
      const md = `${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      return { date: `${year}-${md}` < iso ? `${year}-${md}` : `${year - 1}-${md}`, v };
    });
    lastV = past.reduce((a, b) => (b.date > a.date ? b : a)).v;
  }
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
    // 짝은 보름 안에 있을 때만 — 지난해 같은 차례가 기록에 없으면(1년 합이 끝점에 걸린 JEPI) 31일 떨어진 다음 달 건이 짝으로 지워져
    // 석 달에 세 번 받는 월분배가 두 번으로 적혔다(2026-10-04 점검). 15일은 월분배 주기의 절반이다.
    if (twin >= 0 && gap(pays[twin]) > 15) twin = -1;
  } else if (sure?.record) {
    const record = sure.record;
    twin = all.find((e) => e.date >= record)?.i ?? -1;
  }
  const after = sure?.pay ?? "";
  const near = (v: number) => lastV != null && Math.abs(lastV - v) <= v * 0.25;
  return all.filter((e) => e.i !== twin && e.date > after).map(({ date, v }) => ({ date, v: near(v) ? lastV! : v }));
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

/* ── 세율 ─────────────────────────────────────────────────────────── */
/** 국내 배당소득세율. 해외 배당에서 본국이 이보다 덜 떼면 모자란 만큼을 국내 증권사가 뗀다(소득세법 제129조 ④). */
const KR_INCOME_TAX = 0.14;
/** 지방소득세 — 국내에서 떼는 소득세의 10%. */
const KR_LOCAL_SURTAX = 0.1;
/** 미국 회사의 배당은 미국이 15% 를 떼고(한미 조세조약) 국내에서 더 떼지 않는다(금융소득 2천만원 아래). 아래 표에 없는 달러 종목은 이 값이다. */
const US_SOURCE_TAX = 0.15;

/** 영국 묶음의 이름 — 테스트가 이 묶음을 수집 목록(UK_DIVIDEND)과 맞댄다. */
export const HOME_UK = "영국";

/**
 * 달러 주식 가운데 미국 15% 가 아닌 줄 — [본국, 본국이 배당에서 떼는 세율, 티커들]. 맨 아래 한 묶음만 외국 회사가 아니라
 * 미국 상장 파트너십이다(같은 자리에서 같은 식으로 틀려서 같이 둔다).
 *
 * 해외 배당의 세율은 상장한 시장이 아니라 회사의 국적(세무 거주지)을 따른다. 미국에 상장돼 있어도 주식예탁증서(ADR)와 외국 법인
 * 주식은 본국 세율로 떼인 채 들어온다. 조세조약의 낮은 세율은 배당을 받은 뒤 환급을 신청해야 받는다(건마다 수수료 · 2~4년) — 그래서
 * 조약 세율이 아니라 **지급 때 실제로 떼는 세율**을 적는다(증권사 해외주식 배당소득 원천징수 세율 안내 · 2026-11-23 확인).
 *
 * ⭐ 나라가 아니라 티커로 간다. 설립지만 보면 틀린다 — 아일랜드에 세운 회사 열다섯 가운데 셋은 세무 거주지가 영국 · 싱가포르라
 *    아일랜드 25% 가 안 붙고, 스위스 회사 넷 가운데 셋은 자본준비금에서 배당해 스위스 35% 가 안 붙는다. 운영 표(us_dividend_stock)의
 *    배당 있는 외국 법인 줄마다 회사 연차보고서(10-K · 20-F)에서 세무 거주지와 원천징수 문장을 확인한 것만 넣었다.
 * ⚠️ 여기 없는 달러 주식은 미국 15% 로 센다. 확인을 못 해 뺀 줄 — 노키아(NOK · 핀란드: 회사 공시는 35%, 증권사 안내는 50%) ·
 *    카메코(CCJ · 캐나다: 조약 15% 가 바로 적용되면 기본값과 같고 아니면 25%). 네덜란드(ASML · NXPI)는 15% 라 기본값과 같다.
 * ⚠️ 대만은 21% 로 적었다. 한-대만 조세약정(2024)의 제한세율이 10% 라, 외국에서 낸 세금을 제한세율까지만 쳐 주면(소득세법 시행령
 *    제117조 ①) 국내에서 4.4% 를 더 뗄 수 있다 — 증권사가 실제로 그렇게 떼는지는 확인하지 못했다.
 * ⚠️ 영국 묶음은 data-pipeline/config/us_dividend_universe.py 의 UK_DIVIDEND + 카더라 사전으로 들어오는 아스트라제네카(AZN)다.
 *    한쪽만 고치면 새로 넣은 영국 회사가 미국 15% 로 세어진다 — tests/dividend-calc.test.ts 가 둘을 맞댄다.
 * ⚠️ 회사가 본사를 옮기거나 배당 재원을 바꾸면 값이 바뀐다(TE 커넥티비티는 2024년 스위스 → 아일랜드, 처브는 자본준비금이
 *    2032~2036년에 바닥난다고 적는다). S&P500 목록을 다시 옮길 때 같이 본다.
 */
export const SOURCE_TAX_GROUPS: readonly (readonly [home: string, rate: number, codes: readonly string[]])[] = [
  // ── 본국이 배당에 세금을 안 뗀다 → 국내 증권사가 14% + 1.4% ──
  [HOME_UK, 0, ["AZN", "BP", "BTI", "DEO", "GSK", "HSBC", "NGG", "RIO", "SHEL", "UL", "VOD"]],
  // 설립은 아일랜드(린데 · 펜테어) · 네덜란드(리온델바젤) · 저지(암코)인데 세무 거주지가 영국이다.
  ["영국(세무 거주)", 0, ["AMCR", "LIN", "LYB", "PNR"]],
  // 시게이트 — 설립은 아일랜드, 세무 거주지는 싱가포르(배당에 원천징수가 없다).
  ["싱가포르(세무 거주)", 0, ["STX"]],
  // 번지 · 처브 · 가민 — 주총이 자본준비금에서 주는 배당을 승인한다. 이익에서 주면 스위스 35% 가 붙는다.
  ["스위스(자본준비금 배당)", 0, ["BG", "CB", "GRMN"]],
  ["버뮤다", 0, ["CCL", "EG", "IVZ"]],
  // 알리바바 · 징둥은 중국 거주 기업으로 분류되면 10% 를 뗄 수 있다고 적지만 지금은 안 뗀다(떼면 14.4%).
  ["케이맨", 0, ["BABA", "GFS", "JD"]],
  ["라이베리아", 0, ["RCL"]],
  ["퀴라소", 0, ["SLB"]],
  // ── 본국이 14% 넘게 뗀다 → 그 세율 그대로(국내에서 더 떼지 않고, 넘는 몫을 돌려주지도 않는다) ──
  ["일본", 0.15315, ["HMC"]],
  ["대만", 0.21, ["TSM"]],
  // 조약국 거주자는 면제지만 서류를 미리 내야 하고, 안 내면 25% 를 뗀 뒤 환급을 신청해야 한다.
  ["아일랜드", 0.25, ["ACN", "ALLE", "AON", "CRH", "ETN", "JCI", "MDT", "STE", "SW", "TEL", "TT", "WTW"]],
  ["덴마크", 0.27, ["NVO"]],
  ["스위스", 0.35, ["NVS"]],
  // ── 외국 회사가 아니라 미국 상장 파트너십(MLP) — 배당이 아니라 분배금이고, 비거주자에게는 두 가지를 뗀다 ──
  // 미국 사업 소득으로 보는 몫에 최고세율 37%(미국 세법 1446(a)), 누적 순이익을 넘는 분배로 보는 몫에 10%(1446(f)).
  // 세 곳 모두 분배 공지로 분배금 전부를 두 몫 다로 보게 해 합쳐 47% 다(각 10-K 2026-02 · MPLX 2026-10-27 공지).
  // 팔 때 매도 금액의 10% 를 떼는 것(2023~)은 이 셈에 없다. 여기에 파트너십을 더하면 수집 손목록에도 표시를 남긴다.
  ["미국(상장 파트너십)", 0.47, ["EPD", "ET", "MPLX"]],
];

/** 티커 → 본국과 그 세율. 위 묶음을 편 것. */
export const SOURCE_TAX: ReadonlyMap<string, { home: string; rate: number }> = new Map(
  SOURCE_TAX_GROUPS.flatMap(([home, rate, codes]) => codes.map((code) => [code, { home, rate }] as const)),
);

/** 달러 주식이 본국에서 떼이는 세금 — 표에 있으면 그 줄, 없으면 null(미국 회사). ETF 와 원화 종목은 티커가 같아도 아니다. */
export function sourceTax(s: Pick<StockLite, "code" | "kind" | "currency">): { home: string; rate: number } | null {
  return s.currency === "USD" && s.kind === "stock" ? (SOURCE_TAX.get(s.code) ?? null) : null;
}

/**
 * 본국 세율에 국내에서 더 떼는 몫을 얹은 합계 세율. 본국이 14% 이상 떼면 그대로고, 덜 떼면 모자란 소득세와 그 10%(지방소득세)를
 * 국내 증권사가 더 뗀다 — 0% → 15.4% · 10% → 14.4% · 15% → 15% · 25% → 25%.
 * (더 떼는 소득세가 1,000원 미만이면 안 떼는 소액부징수는 셈에 안 넣는다 — 지급 건마다 갈려서다.)
 */
export function withDomesticTopUp(sourceRate: number): number {
  if (sourceRate >= KR_INCOME_TAX) return sourceRate;
  // 0.14 × 1.1 이 0.15400000000000003 으로 나와 국내 세율(0.154)과 어긋나지 않게 백만분의 일에서 끊는다.
  return Math.round((sourceRate + (KR_INCOME_TAX - sourceRate) * (1 + KR_LOCAL_SURTAX)) * 1e6) / 1e6;
}

/** 달러 종목 한 줄에서 떼이는 세율(일반 계좌) — 표에 있으면 본국 세율, 없으면 미국 15%. */
export const usdTaxRate = (s: Pick<StockLite, "code" | "kind" | "currency">): number => withDomesticTopUp(sourceTax(s)?.rate ?? US_SOURCE_TAX);

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
