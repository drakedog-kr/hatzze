import type { InsiderOverview } from "./insider-data";

/**
 * 내부자 리포트 둘째 줄(2026-10-04) — [매매 방향 | 오늘의 브리핑]. 화면이 이미 가진 공시 숫자로 만든다.
 * LLM 을 쓰지 않아 AI 표시를 안 붙인다(MDD 낙폭 요약 app/mdd/shared.ts mddSummary 와 같다).
 *
 * 숫자는 왼쪽 '매매 방향'(insiderLean) — 축마다 두 쪽을 한 막대에 가른다(임원은 판 금액 그 전 7일 · 최근 7일, 의원 · 거물은 산 쪽 · 판 쪽). 문장은 오른쪽 '오늘의 브리핑'(insiderBrief) —
 * 그 숫자를 되읽지 않고 **종목**을 적는다. 처음엔 브리핑 한 장에 합계까지 문장으로 넣었더니 숫자가 문장 속에 묻혀 글 덩어리로 읽혔다
 * ("엉성하다", 같은 날).
 *
 * ⛔ 아래 모듈의 1등을 되풀이하지 않는다 — 옛 히어로 '오늘의 브리핑' 넉 줄이 그래서 걷혔다(eb6650d, 아래 카드 넷의 첫 줄을
 *    끌어올린 것이었다). 브리핑의 종목은 모듈과 **다른 잣대**로 고른다 — 산 금액(모듈은 처분 · 매수 섞인 금액), 산 의원 수
 *    (모듈은 사고판 의원 수), 새로 담은 · 다 판 거물 수(모듈은 움직인 거물 수), 의원 · 거물이 함께 산 종목.
 * ⚠️ 라틴 티커 뒤에 조사를 붙이지 않는다 — 받침을 몰라(NVDA는 · AAPL은) 종목은 '…은 X입니다' 꼴로 문장 끝에 둔다.
 * ⚠️ 평가하는 말(눈여겨볼 · 신호 · 주목)을 쓰지 않는다 — 누가 무엇을 신고했는지만 적는다.
 */

type BriefInput = Pick<
  InsiderOverview,
  "windowDays" | "congressWindowDays" | "buys" | "execSold" | "congressTickers" | "managerAdds" | "managerTrims" | "compareQuarters" | "scale"
>;

/* ── 매매 방향 ──────────────────────────────────────────────────────── */

/** 한 축의 두 쪽 — 막대 왼쪽 · 오른쪽 토막과 그 아래 두 값. */
export type InsiderLeanRow = {
  key: "exec" | "congress" | "managers";
  label: string;
  /** 줄 머리 오른쪽 — 축의 기간('90일' · '2026 Q2'), 임원 줄은 무엇을 쟀는지까지('7일 판 금액'). */
  span: string;
  /** dir — 왼쪽 산 쪽(빨강) · 오른쪽 판 쪽(파랑). sell — 둘 다 판 쪽이라 왼쪽(그 전) 연한 파랑 · 오른쪽(최근) 진한 파랑. */
  tone: "dir" | "sell";
  leftLabel: string;
  rightLabel: string;
  left: number;
  right: number;
  unit: "usd" | "건" | "종목";
};

/** 분기 끝날('2026-06-30') → '2026 Q2'(모듈 머리 parts.tsx quarterLabel 과 같은 꼴). */
const quarterShort = (iso: string) => `${iso.slice(0, 4)} Q${Math.ceil(Number(iso.slice(5, 7)) / 3)}`;
/** 분기 끝날 → '2026년 2분기'. 문장은 한글로 읽힌다. */
const quarterKo = (iso: string) => `${iso.slice(0, 4)}년 ${Math.ceil(Number(iso.slice(5, 7)) / 3)}분기`;

const sum = (xs: number[]) => xs.reduce((s, v) => s + v, 0);
/** 늘린 쪽 · 줄인 쪽이 **더 많은** 종목만 — 늘린 거물과 줄인 거물이 같으면 어느 쪽에도 안 든다. */
const netAdds = (ov: BriefInput) => ov.managerAdds.filter((m) => m.movers > m.against);
const netTrims = (ov: BriefInput) => ov.managerTrims.filter((m) => m.movers > m.against);
const hasQuarters = (ov: BriefInput) => ov.compareQuarters.length === 2 && (netAdds(ov).length > 0 || netTrims(ov).length > 0);

/**
 * 축 셋의 두 쪽.
 *  - 임원: 장내에서 판 금액, 그 전 7일 · 최근 7일. 매도가 늘었나 줄었나가 설명 없이 읽힌다.
 *    ⛔ 장내 매수 · 처분 금액으로 두지 말 것 — 장내 매수가 한 주에 한두 종목이라($3.5M · $540.8M, 10-04 주) 막대가 늘 파랑 한 토막이었다
 *       ("임원은 매수가 너무 적으니까 다른 걸로", 2026-10-04). 장내에서 산 종목은 브리핑 임원 줄이 적는다.
 *    ⛔ '가진 주식 대비 조금 판 · 많이 판'(판 몫 10% 기준)도 걷었다 — 물음표 설명이 있어야 읽혔다
 *       ("헬프 툴팁이 필요하면 심플하지 않다 · 한번에 이해하기 어려운 건 우리 사이트에 있으면 안 된다", 같은 날).
 *  - 의원: 매수 · 매도 건수.
 *  - 거물: 늘린 쪽 · 줄인 쪽이 더 많은 종목 수(13F 금액은 주가에 오염돼 사람 수로 센다 — ManagerMove 주석). 견줄 분기가 없으면 빠진다.
 */
export function insiderLean(ov: BriefInput): InsiderLeanRow[] {
  const rows: InsiderLeanRow[] = [
    {
      key: "exec",
      label: "임원",
      // ⚠️ 216 칸(판 1,000 미만)에 두 값이 한 줄로 들어야 한다 — '그 전 7일 1.9조원 · 최근 7일 7,037억원'은 넘쳤다. '7일'은 머리로.
      span: `${ov.windowDays}일 판 금액`,
      tone: "sell",
      leftLabel: "그 전",
      rightLabel: "최근",
      left: ov.execSold.prev,
      right: ov.execSold.now,
      unit: "usd",
    },
    {
      key: "congress",
      label: "의원",
      span: `${ov.congressWindowDays}일`,
      tone: "dir",
      leftLabel: "매수",
      rightLabel: "매도",
      left: sum(ov.congressTickers.map((c) => c.buys)),
      right: sum(ov.congressTickers.map((c) => c.sells)),
      unit: "건",
    },
  ];
  if (hasQuarters(ov)) {
    rows.push({
      key: "managers",
      label: "거물",
      span: quarterShort(ov.compareQuarters[1]),
      tone: "dir",
      leftLabel: "늘림",
      rightLabel: "줄임",
      left: netAdds(ov).length,
      right: netTrims(ov).length,
      unit: "종목",
    });
  }
  return rows;
}

/* ── 오늘의 브리핑 ──────────────────────────────────────────────────── */

/** 문장 한 조각 — 글자 그대로, 또는 종목(종목 화면 링크). */
export type InsiderBriefPart = string | { ticker: string; name: string };
export type InsiderBriefRow = { key: "exec" | "congress" | "managers" | "overlap"; label: string; parts: InsiderBriefPart[] };

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
/** '가장 많은 의원이 산 · 새로 담은 · 다 판 거물이 가장 많은' 종목으로 세울 최소 사람 수 — 한 명이면 '가장 많은'이라 부를 게 없다. */
const MOST_MIN = 2;
/** 문장에 적는 문턱 — 숫자를 바꾸면 같이 바꾼다. */
const CONGRESS_MIN_KO = "둘";
const MANAGER_MIN_KO = "셋";
const MOST_MIN_KO = "둘";

/** 사람 수가 가장 많은 하나(같으면 티커 순). 문턱 밑이면 없다. */
function most<T extends { ticker: string }>(xs: T[], count: (x: T) => number): T | null {
  const best = xs.filter((x) => count(x) >= MOST_MIN).sort((a, b) => count(b) - count(a) || a.ticker.localeCompare(b.ticker))[0];
  return best ?? null;
}

export function insiderBrief(ov: BriefInput): InsiderBriefRow[] {
  const rows: InsiderBriefRow[] = [];

  // 임원 — 장내에서 산 종목. 모듈은 처분 · 매수가 섞인 금액 순이라 큰 처분이 위를 다 차지한다.
  const bought = ov.buys.filter((b) => b.buyCount > 0).sort((a, b) => b.boughtValue - a.boughtValue || a.ticker.localeCompare(b.ticker));
  const head = `최근 ${ov.windowDays}일 신고가 들어온 ${n(ov.buys.length)}개 종목 가운데 장내에서 산 종목은 `;
  rows.push({
    key: "exec",
    label: "임원",
    parts:
      ov.buys.length === 0
        ? [`최근 ${ov.windowDays}일에는 임원 신고가 없습니다.`]
        : bought.length === 0
          ? [`${head}없습니다.`]
          : bought.length === 1
            ? [head, stock(bought[0].ticker, bought[0].name), " 하나입니다."]
            : [`${head}${n(bought.length)}개이고, 가장 크게 산 종목은 `, stock(bought[0].ticker, bought[0].name), "입니다."],
  });

  // 의원 — 몇 명이 몇 종목을, 그리고 산 의원이 가장 많은 종목(모듈은 사고판 의원 수 순이다).
  const ct = ov.congressTickers;
  const topBuy = most(ct, (c) => c.buyMembers.length);
  rows.push({
    key: "congress",
    label: "의원",
    parts:
      ct.length === 0
        ? [`최근 ${ov.congressWindowDays}일에는 의원 신고가 없습니다.`]
        : [
            `최근 ${ov.congressWindowDays}일 의원 ${n(ov.scale.members)}명이 ${n(ct.length)}개 종목을 신고했습니다.`,
            ...(topBuy ? [" 가장 많은 의원이 산 종목은 ", stock(topBuy.ticker, topBuy.name), "입니다."] : []),
          ],
  });

  // 거물 — 새로 담은 거물 · 다 판 거물이 가장 많은 종목(모듈은 움직인 거물 수 순이다).
  const quarter = ov.compareQuarters.length === 2 ? quarterKo(ov.compareQuarters[1]) : "";
  const fresh = most(ov.managerAdds, (m) => m.mark);
  const gone = most(ov.managerTrims, (m) => m.mark);
  const managerParts: InsiderBriefPart[] = [];
  if (fresh) managerParts.push(`${quarter}에 새로 담은 거물이 가장 많은 종목은 `, stock(fresh.ticker, fresh.name), "입니다.");
  if (gone) managerParts.push(fresh ? " 다 판 거물이 가장 많은 종목은 " : `${quarter}에 다 판 거물이 가장 많은 종목은 `, stock(gone.ticker, gone.name), "입니다.");
  rows.push({
    key: "managers",
    label: "거물",
    parts: !hasQuarters(ov)
      ? ["견줄 직전 분기가 아직 없습니다."]
      : managerParts.length
        ? managerParts
        : [`${quarter}에 거물 ${MOST_MIN_KO} 이상이 새로 담거나 다 판 종목은 없습니다.`],
  });

  // 겹친 곳 — 의원 여럿이 사고 거물 여럿이 늘린 종목. 의원 표(의원 수 순)와 거물 표(움직인 거물 수 순) 어느 하나로는 못 내는 말이다.
  // ⛔ 임원 장내 매수는 넣지 않는다 — 한 주에 한두 종목이라(10-04 주 오라클 하나) 넣으면 늘 바로 위 임원 줄의 종목을 되풀이했다.
  const congressBuy = new Map(ct.filter((c) => c.buys > c.sells).map((c) => [c.ticker, c]));
  const managerAdd = new Map(netAdds(ov).map((m) => [m.ticker, m]));
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
