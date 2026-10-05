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
  "windowDays" | "congressWindowDays" | "buys" | "targetMoves" | "congressTickers" | "managerAdds" | "managerTrims" | "managerMoveTotals" | "compareQuarters" | "scale"
>;

/* ── 증권가 목표가 ──────────────────────────────────────────────────── */

/** 목표가를 올린 · 내린 건수를 세는 기간(일). 마지막 의견 날부터 거꾸로 센다. */
export const TARGET_DAYS = 7;

/**
 * 증권가 목표가 올림 · 내림 건수 — 의견 하나(증권사 · 애널리스트 · 날)가 한 건. 목표가가 그대로거나 직전 값이 없으면(신규 개시) 안 센다.
 * 기간 끝은 받은 줄의 마지막 의견 날이다(원천이 주말에도 의견을 싣는다 — 10-03 토요일 NKE).
 * 매주 고르게 갈린다(2026-09 셋째 주부터 세 주 실측 — 올림 70 · 69 · 66건, 내림 55 · 47 · 59건).
 */
export function targetMoves(rows: { action_date: string; target_now: number | null; target_old: number | null }[]): { up: number; down: number; end: string | null } {
  const end = rows.reduce<string | null>((m, r) => (m && m >= r.action_date ? m : r.action_date), null);
  if (!end) return { up: 0, down: 0, end: null };
  const d = new Date(`${end}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - (TARGET_DAYS - 1));
  const from = d.toISOString().slice(0, 10);
  let up = 0;
  let down = 0;
  for (const r of rows) {
    if (r.action_date < from || r.target_now == null || r.target_old == null) continue;
    if (r.target_now > r.target_old) up += 1;
    else if (r.target_now < r.target_old) down += 1;
  }
  return { up, down, end };
}

/* ── 매매 방향 ──────────────────────────────────────────────────────── */

/** 한 축의 두 쪽 — 막대 왼쪽 · 오른쪽 토막과 그 아래 두 값. */
export type InsiderLeanRow = {
  key: "congress" | "managers" | "analyst";
  label: string;
  /** 줄 머리 오른쪽 — 축의 기간('90일' · '2026 Q2'), 증권가 줄은 무엇을 쟀는지까지('목표가 · 7일'). */
  span: string;
  /** 왼쪽은 오르는 쪽(산 · 늘린 · 올린, 빨강), 오른쪽은 내리는 쪽(판 · 줄인 · 내린, 파랑). */
  leftLabel: string;
  rightLabel: string;
  left: number;
  right: number;
  unit: "건";
};

/** 분기 끝날('2026-06-30') → '2026 Q2'(모듈 머리 parts.tsx quarterLabel 과 같은 꼴). */
const quarterShort = (iso: string) => `${iso.slice(0, 4)} Q${Math.ceil(Number(iso.slice(5, 7)) / 3)}`;
/** 분기 끝날 → '2026년 2분기'. 문장은 한글로 읽힌다. */
const quarterKo = (iso: string) => `${iso.slice(0, 4)}년 ${Math.ceil(Number(iso.slice(5, 7)) / 3)}분기`;

const sum = (xs: number[]) => xs.reduce((s, v) => s + v, 0);
/** 늘린 거물이 줄인 거물보다 **많은** 종목만(브리핑 겹친 곳이 쓴다) — 같으면 안 든다. */
const netAdds = (ov: BriefInput) => ov.managerAdds.filter((m) => m.movers > m.against);
const hasQuarters = (ov: BriefInput) => ov.compareQuarters.length === 2 && (ov.managerAdds.length > 0 || ov.managerTrims.length > 0);

/**
 * 줄 셋의 두 쪽 — 의원(매수 · 매도 건수), 거물(종목을 늘린 · 줄인 건수 — 거물 한 명이 한 종목을 늘리면 한 건. 13F 금액은 주가에
 * 오염돼 사람 수로 센다 — ManagerMove 주석. 견줄 분기가 없으면 빠진다), 증권가(최근 7일 목표가 올림 · 내림 건수).
 * ⛔ 거물 줄을 '늘린 거물이 더 많은 종목 수'(618 · 588종목)로 두지 말 것 — 글자로는 '늘린 종목'으로 읽혀 뜻이 어긋났다
 *    ("한번에 이해되게", 2026-10-04). 건수면 '늘림 N건'이 글자 그대로의 뜻이다.
 *
 * 셋째 줄은 처음에 임원이었다. ⛔ 다시 임원으로 두려면 아래를 먼저 볼 것(2026-10-04 하루에 셋을 걷었다):
 *  - 장내 매수 · 처분 금액 — 매수가 한 주에 한두 종목이라($3.5M · $540.8M) 막대가 늘 파랑 한 토막("매수가 너무 적다").
 *  - 가진 주식 대비 조금 판 · 많이 판(판 몫 10% 기준) — 물음표 설명이 있어야 읽혔다("한번에 이해하기 어려운 건 우리 사이트에 있으면 안 된다").
 *  - 판 금액 그 전 7일 · 최근 7일 — "별로". 장내에서 산 종목은 브리핑 임원 줄이 적는다.
 */
export function insiderLean(ov: BriefInput): InsiderLeanRow[] {
  const rows: InsiderLeanRow[] = [
    {
      key: "congress",
      label: "의원",
      span: `${ov.congressWindowDays}일`,
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
      leftLabel: "늘림",
      rightLabel: "줄임",
      // 전체 건수 — 순증감으로 가른 두 목록의 movers 를 더하면 순으로 반대쪽인 종목의 건이 빠진다(InsiderOverview.managerMoveTotals).
      left: ov.managerMoveTotals.up,
      right: ov.managerMoveTotals.down,
      unit: "건",
    });
  }
  // 줄 순서는 의원 → 거물 → 증권가(2026-10-04 "의원을 첫째로, 거물을 둘째로, 셋째 칸은 다시 생각"→ 증권가 목표가).
  rows.push({
    key: "analyst",
    label: "증권가",
    // '7일 목표가'는 7일짜리 목표가로도 읽혔다 — 무엇 · 기간 순(2026-10-04 점검).
    span: `목표가 · ${TARGET_DAYS}일`,
    leftLabel: "올림",
    rightLabel: "내림",
    left: ov.targetMoves.up,
    right: ov.targetMoves.down,
    unit: "건",
  });
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
  // 모집단은 전체보기 카드(산 · 처분한 종목)와 같게 금액이 있는 종목만 — 무상 취득 · 옵션 행사 취득만 있는 종목까지 세면
  // '63개 종목'인데 전체보기엔 1 + 47개뿐이었다(2026-10-04 점검).
  const traded = ov.buys.filter((b) => b.boughtValue > 0 || b.disposedValue > 0);
  const bought = ov.buys.filter((b) => b.buyCount > 0).sort((a, b) => b.boughtValue - a.boughtValue || a.ticker.localeCompare(b.ticker));
  const head = `최근 ${ov.windowDays}일 임원 매매가 신고된 ${n(traded.length)}개 종목 가운데 장내에서 산 종목은 `;
  rows.push({
    key: "exec",
    label: "임원",
    parts:
      traded.length === 0
        ? [`최근 ${ov.windowDays}일에는 임원 매매 신고가 없습니다.`]
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
    // 종목은 '종목'으로 센다('외 2곳'이었다, 2026-10-04 점검).
    parts.push(both.length > OVERLAP_SHOW ? ` 외 ${n(both.length - OVERLAP_SHOW)}종목입니다.` : "입니다.");
  }
  rows.push({ key: "overlap", label: "겹친 곳", parts });

  return rows;
}
