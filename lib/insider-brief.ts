import type { InsiderOverview } from "./insider-data";

/**
 * 내부자 리포트 '오늘의 브리핑'(2026-10-04) — 화면이 이미 가진 공시 숫자를 줄 넷으로 옮긴다.
 * LLM 을 쓰지 않아 AI 표시를 안 붙인다(MDD 낙폭 요약 app/mdd/shared.ts mddSummary 와 같다).
 *
 * ⛔ 아래 모듈의 1등을 되풀이하지 않는다 — 옛 히어로 '오늘의 브리핑' 넉 줄이 바로 그래서 걷혔다(eb6650d, 아래 카드 넷의 첫 줄을
 *    끌어올린 것이었다). 모듈은 많은 순 다섯 줄만 보이니 여기는 그 표들이 못 하는 말만 한다 — 전체 합계(몇 종목 · 몇 건 · 얼마)와
 *    다른 순서로 고른 한 종목(가장 크게 산 · 새로 담은 거물이 가장 많은), 의원과 거물이 함께 산 종목.
 * ⚠️ 라틴 티커 뒤에 조사를 붙이지 않는다 — 받침을 몰라(NVDA는 · AAPL은) 종목은 '…은 X입니다' 꼴로 문장 끝에 둔다.
 * ⚠️ 평가하는 말(눈여겨볼 · 신호 · 주목)을 쓰지 않는다 — 누가 무엇을 신고했는지만 적는다.
 */

/** 문장 한 조각 — 글자 그대로, 종목(종목 화면 링크), 달러 금액(화면이 통화 스위치대로 그린다). */
export type InsiderBriefPart = string | { ticker: string; name: string } | { usd: number };
export type InsiderBriefRow = { key: "exec" | "congress" | "managers" | "overlap"; label: string; parts: InsiderBriefPart[] };

type BriefInput = Pick<
  InsiderOverview,
  "windowDays" | "congressWindowDays" | "buys" | "congressTickers" | "managerAdds" | "managerTrims" | "compareQuarters" | "scale"
>;

/** 화면에 적을 이름 — 한글 이름이 있으면 그것, 없으면 티커(의원 쪽은 사전에 없으면 빈 이름이 온다). */
const label = (ticker: string, name: string) => (name && name.toUpperCase() !== ticker.toUpperCase() ? name : ticker);
const stock = (ticker: string, name: string) => ({ ticker, name: label(ticker, name) });
const n = (v: number) => v.toLocaleString("ko-KR");

/** 겹친 곳에 적는 종목 수. 넘치면 '외 N곳'. */
const OVERLAP_SHOW = 3;
/**
 * 겹친 곳의 문턱 — 의원은 산 사람 둘 이상(매수 건이 매도보다 많은 종목), 거물은 늘린 사람 셋 이상(늘린 쪽이 많은 종목).
 * 한 명씩이면 90일 · 한 분기 창이 넓어 겹치는 종목이 62곳이었다(2026-10-04 실측 — 의원 매수 107종목 × 거물 늘림 618종목).
 * 이 문턱이면 5곳(문턱 표: 의원 1·2·3명 × 거물 1·3·5·8명을 같은 날 재서 골랐다 — 2명 · 3명이 5곳, 3명 · 3명은 1곳).
 */
const CONGRESS_MIN = 2;
const MANAGER_MIN = 3;
/** 문장에 적는 문턱 — 숫자를 바꾸면 같이 바꾼다. */
const CONGRESS_MIN_KO = "둘";
const MANAGER_MIN_KO = "셋";
/** '새로 담은 거물이 가장 많은 종목'으로 세울 최소 거물 수 — 한 명이면 '가장 많은'이라 부를 게 없다. */
const NEW_MIN = 2;

/** 분기 끝날('2026-06-30') → '2026년 2분기'. 모듈 머리는 짧은 'Q2' 꼴(parts.tsx quarterLabel)이지만 문장은 한글로 읽힌다. */
const quarterKo = (iso: string) => `${iso.slice(0, 4)}년 ${Math.ceil(Number(iso.slice(5, 7)) / 3)}분기`;

export function insiderBrief(ov: BriefInput): InsiderBriefRow[] {
  const rows: InsiderBriefRow[] = [];

  // 임원 — 신고가 들어온 종목 가운데 장내 매수 · 처분이 몇 종목 · 얼마인가. 모듈은 금액 순이라 처분이 위를 다 차지한다.
  const bought = ov.buys.filter((b) => b.buyCount > 0).sort((a, b) => b.boughtValue - a.boughtValue);
  const disposed = ov.buys.filter((b) => b.disposedValue > 0);
  const sum = (xs: number[]) => xs.reduce((s, v) => s + v, 0);
  const head = `최근 ${ov.windowDays}일 임원 신고가 들어온 ${n(ov.buys.length)}개 종목 가운데 `;
  rows.push({
    key: "exec",
    label: "임원",
    parts:
      ov.buys.length === 0
        ? [`최근 ${ov.windowDays}일에는 임원 신고가 없습니다.`]
        : bought.length === 0
          ? [head, `장내 매수는 없고, 처분은 ${n(disposed.length)}개 종목 `, { usd: sum(disposed.map((b) => b.disposedValue)) }, "입니다."]
          : [
              head,
              `장내 매수는 ${n(bought.length)}개 종목 `,
              { usd: sum(bought.map((b) => b.boughtValue)) },
              `, 처분은 ${n(disposed.length)}개 종목 `,
              { usd: sum(disposed.map((b) => b.disposedValue)) },
              // 한 종목뿐이면 '가장 크게'라 부를 게 없다.
              bought.length === 1 ? "입니다. 장내에서 산 종목은 " : "입니다. 가장 크게 산 종목은 ",
              stock(bought[0].ticker, bought[0].name),
              bought.length === 1 ? " 하나입니다." : "입니다.",
            ],
  });

  // 의원 — 몇 명이 몇 종목을, 매수 · 매도 몇 건. 모듈은 의원 수 순 다섯 종목뿐이다.
  const ct = ov.congressTickers;
  rows.push({
    key: "congress",
    label: "의원",
    parts:
      ct.length === 0
        ? [`최근 ${ov.congressWindowDays}일에는 의원 신고가 없습니다.`]
        : [
            `최근 ${ov.congressWindowDays}일 의원 ${n(ov.scale.members)}명이 ${n(ct.length)}개 종목을 신고했습니다. 매수 ${n(sum(ct.map((c) => c.buys)))}건 · 매도 ${n(sum(ct.map((c) => c.sells)))}건입니다.`,
          ],
  });

  // 거물 — 늘린 쪽이 많은 종목 · 줄인 쪽이 많은 종목이 각각 몇 개, 새로 담은 거물이 가장 많은 종목(모듈은 움직인 거물 수 순이다).
  const adds = ov.managerAdds.filter((m) => m.movers > m.against);
  const trims = ov.managerTrims.filter((m) => m.movers > m.against);
  const fresh = ov.managerAdds.filter((m) => m.mark >= NEW_MIN).sort((a, b) => b.mark - a.mark || b.movers - a.movers)[0];
  rows.push({
    key: "managers",
    label: "거물",
    parts:
      ov.compareQuarters.length < 2 || (adds.length === 0 && trims.length === 0)
        ? ["견줄 직전 분기가 아직 없습니다."]
        : [
            `${quarterKo(ov.compareQuarters[1])}에 직전 분기보다 늘린 거물이 더 많은 종목은 ${n(adds.length)}개, 줄인 거물이 더 많은 종목은 ${n(trims.length)}개입니다.`,
            ...(fresh ? [" 새로 담은 거물이 가장 많은 종목은 ", stock(fresh.ticker, fresh.name), "입니다."] : []),
          ],
  });

  // 겹친 곳 — 의원 여럿이 사고 거물 여럿이 늘린 종목. 의원 표(의원 수 순)와 거물 표(움직인 거물 수 순) 어느 하나로는 못 내는 말이다.
  // ⛔ 임원 장내 매수는 넣지 않는다 — 한 주에 한두 종목이라(10-04 주 오라클 하나) 넣으면 늘 바로 위 임원 줄의 종목을 되풀이했다.
  const congressBuy = new Map(ct.filter((c) => c.buys > c.sells).map((c) => [c.ticker, c]));
  const managerAdd = new Map(adds.map((m) => [m.ticker, m]));
  const both = [...congressBuy.values()]
    .filter((c) => c.buyMembers.length >= CONGRESS_MIN && (managerAdd.get(c.ticker)?.movers ?? 0) >= MANAGER_MIN)
    // 산 의원 + 늘린 거물이 많은 순, 같으면 티커(같은 입력이면 같은 문장).
    .map((c) => ({ c, w: c.buyMembers.length + (managerAdd.get(c.ticker)?.movers ?? 0) }))
    .sort((a, b) => b.w - a.w || a.c.ticker.localeCompare(b.c.ticker))
    .map(({ c }) => stock(c.ticker, c.name || managerAdd.get(c.ticker)?.name || ""));
  const parts: InsiderBriefPart[] = [];
  const who = `의원 ${CONGRESS_MIN_KO} 이상이 사고 거물 ${MANAGER_MIN_KO} 이상이 늘린 종목`;
  if (both.length === 0) {
    parts.push(`${who}은 없습니다.`);
  } else {
    parts.push(`${who}은 `);
    both.slice(0, OVERLAP_SHOW).forEach((x, i) => parts.push(...(i > 0 ? [" · "] : []), x));
    parts.push(both.length > OVERLAP_SHOW ? ` 외 ${n(both.length - OVERLAP_SHOW)}곳입니다.` : "입니다.");
  }
  rows.push({ key: "overlap", label: "겹친 곳", parts });

  return rows;
}
