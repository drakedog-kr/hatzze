/**
 * 채널이 짚은 일정을 줄로 묶는다 — 국장(lib/kadera-why.ts) · 미장(lib/kadera-us-why.ts)이 같이 쓴다.
 * 순수 함수만 둔다(서버 전용 모듈은 테스트가 못 부른다 — tests/event-group.test.ts).
 *
 * 예전엔 (종목, 저장된 날짜, 정밀도)로만 묶어 두 가지가 어긋났다(2026-10-04 점검).
 *  ① 같은 날 다른 일정이 한 줄로 합쳐졌다 — 삼성전자 '10월 중 잠정실적발표 6곳'의 6곳에 특별배당 · 자사주를 말한 채널이 섞였다.
 *  ② 같은 일정이 여러 줄로 갈렸다 — 달 단위가 1일 · 15일 · 말일로 저장돼 '10월 중'이 두 줄, 정밀도만 다른 같은 실적이
 *     '10/8' · '10/9' · '10월 중' 세 줄, 이미 발표한 마이크론 실적이 한 채널 말로 '10/7 실적 발표'에 다시 섰다.
 * 그래서 (종목, 기간, 정밀도, 이야기 종류)로 묶고, 더 좁은 기간이 있으면 넓은 줄을 그리로 접고, 가까운 날의 한 채널 줄은 뺀다.
 */
import { periodEnd, type DatePrecision } from "./event-period.ts";

export type EventRowLike = { code: string; channel: string; date: string; precision: DatePrecision; event: string; postedAt: string };
export type GroupedEvent = { code: string; date: string; precision: DatePrecision; event: string; channels: number; firstSeen: string };

/** 정밀도의 너비 — 작을수록 좁다. */
const WIDTH: Record<DatePrecision, number> = { day: 0, month: 1, quarter: 2, half: 3, year: 4 };

/** 기간의 첫날. 달 단위가 1일 · 15일 · 말일로 갈려 저장돼도 같은 기간이면 같은 첫날이 된다. */
export function periodStart(date: string, precision: DatePrecision): string {
  if (precision === "day") return date;
  const y = date.slice(0, 4);
  const m = Number(date.slice(5, 7));
  if (precision === "year") return `${y}-01-01`;
  if (precision === "half") return `${y}-${m <= 6 ? "01" : "07"}-01`;
  const first = precision === "month" ? m : (Math.ceil(m / 3) - 1) * 3 + 1;
  return `${y}-${String(first).padStart(2, "0")}-01`;
}

/**
 * 같은 이야기인가를 가르는 열쇠. 공백 · 구두점을 걷고, 채널마다 표기가 갈리는 흔한 종류(실적 · 배당 · 자사주 …)는 그 낱말 하나로 묶는다
 * ('3분기 잠정 실적 발표' · '잠정실적발표' · '분기 실적 발표'). 종류 낱말이 없으면 걷은 글 그대로다.
 */
const KINDS: [string, RegExp][] = [
  // 매출은 실적보다 먼저 따로 — 'TSMC 9월 매출 실적 공개' · '9월 매출 발표'가 두 줄로 갈렸고(10/8), 3분기 실적과는 다른 이야기다(2026-10-05 점검).
  ["매출", /매출/],
  ["실적", /실적|어닝|earnings/i],
  ["배당", /배당/],
  ["자사주", /자사주|자기주식/],
  ["지분", /지분|주식거래|블록딜/],
  ["주총", /주총|주주총회/],
  ["상장", /상장/],
  ["승인", /승인|허가/],
  ["출시", /출시|발매/],
  ["공개", /공개|발표회|언팩|이벤트|keynote/i],
  ["청약", /청약|공모/],
  // '신주 배정일' · '신주 배정 기준일' · '유상증자 신주 배정 기준일'이 세 줄로 갈렸다(삼성바이오로직스 10/6, 2026-10-05 점검).
  // 상장이 먼저라 '신주 상장'은 상장으로 남는다.
  ["증자", /증자|신주/],
];

export function eventKind(text: string): string {
  const t = text.replace(/[\s·,.()'"‘’“”\-–]/g, "").toLowerCase();
  for (const [kind, re] of KINDS) if (re.test(t)) return kind;
  return t;
}

const DAY_MS = 86_400_000;
const dayDiff = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY_MS;

/** 이 날짜 안팎(±일)의 같은 이야기는 한 줄로 본다 — '10/8' · '10/9' 처럼 하루 어긋나게 적힌 같은 발표. */
const NEAR_DAYS = 3;

type Acc = { code: string; date: string; precision: DatePrecision; kind: string; texts: Map<string, { text: string; n: number }>; channels: Set<string>; firstSeen: string };

function groupRaw(rows: EventRowLike[]): Acc[] {
  const groups = new Map<string, Acc>();
  for (const r of rows) {
    const start = periodStart(r.date, r.precision);
    const kind = eventKind(r.event);
    const k = `${r.code}|${start}|${r.precision}|${kind}`;
    let g = groups.get(k);
    if (!g) {
      g = { code: r.code, date: start, precision: r.precision, kind, texts: new Map(), channels: new Set(), firstSeen: r.postedAt };
      groups.set(k, g);
    }
    const tk = r.event.replace(/[\s·,.()]/g, "");
    const cur = g.texts.get(tk);
    if (cur) cur.n += 1;
    else g.texts.set(tk, { text: r.event, n: 1 });
    g.channels.add(r.channel);
    if (r.postedAt < g.firstSeen) g.firstSeen = r.postedAt;
  }
  return [...groups.values()];
}

/** 일정 행 → 줄. 넓은 기간 줄은 같은 이야기의 더 좁은 줄로 접고(채널은 합친다), 가까운 날의 한 채널 줄은 뺀다. */
export function groupEventRows(rows: EventRowLike[]): GroupedEvent[] {
  const accs = groupRaw(rows);
  const alive = new Set(accs);

  // ① 넓은 기간 줄 → 그 안에 든 더 좁은 같은 이야기 줄로 접는다(가장 좁은 것부터 넓은 쪽으로). '10월 중 실적' → '10/8 실적'.
  const byWidth = [...accs].sort((a, b) => WIDTH[a.precision] - WIDTH[b.precision]);
  for (const wide of byWidth) {
    if (wide.precision === "day") continue;
    const end = periodEnd(wide.date, wide.precision);
    const inner = byWidth.find(
      (n) => alive.has(n) && n !== wide && n.code === wide.code && n.kind === wide.kind && WIDTH[n.precision] < WIDTH[wide.precision] && n.date >= wide.date && n.date <= end,
    );
    if (!inner) continue;
    for (const c of wide.channels) inner.channels.add(c);
    if (wide.firstSeen < inner.firstSeen) inner.firstSeen = wide.firstSeen;
    alive.delete(wide);
  }

  // ② 가까운 날(±NEAR_DAYS)의 같은 이야기 — 채널 둘 이상인 줄이 있으면 한 채널 줄은 뺀다(다른 날을 말한 채널이라 합치지 않는다).
  const days = [...alive].filter((a) => a.precision === "day");
  for (const one of days) {
    if (one.channels.size !== 1) continue;
    const better = days.some((o) => o !== one && alive.has(o) && o.code === one.code && o.kind === one.kind && o.channels.size >= 2 && dayDiff(o.date, one.date) <= NEAR_DAYS);
    if (better) alive.delete(one);
  }

  return [...alive].map((a) => ({
    code: a.code,
    date: a.date,
    precision: a.precision,
    event: [...a.texts.values()].sort((x, y) => y.n - x.n)[0].text,
    channels: a.channels.size,
    firstSeen: a.firstSeen,
  }));
}

/**
 * 이미 지나간 같은 이야기 — 지난 며칠 안에 채널 둘 이상이 짚은 같은 종목 · 같은 종류 일정이 있으면, 앞으로의 한 채널 줄은 뺀다.
 * 마이크론 실적(10/1, 여러 채널)을 한 채널이 '10/7 실적 발표'로 다시 적어 이미 발표한 실적이 다가오는 일정에 섰다(2026-10-04 점검).
 */
export function dropAlreadyHappened<T extends { code: string; event: string; channels: number }>(future: T[], past: GroupedEvent[]): T[] {
  const done = new Set(past.filter((p) => p.channels >= 2).map((p) => `${p.code}|${eventKind(p.event)}`));
  return future.filter((f) => f.channels >= 2 || !done.has(`${f.code}|${eventKind(f.event)}`));
}
