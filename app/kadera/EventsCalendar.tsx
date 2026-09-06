"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { C, MONO } from "../ui";
import { StockLogo } from "../StockLogo";
import { Pill } from "./parts";

/**
 * '다가오는 일정' — 왼쪽 3분의 1은 달력, 오른쪽 3분의 2는 **고른 날**의 일정.
 *
 * 2026-09-06 에 정한 방향이다. 그전 두 판(표 · 날짜별 아젠다)은 줄이 길고 오른쪽이
 * 비어 투박했다. 달력은 누구나 2초 안에 읽는 인코딩이고([[feedback_avoid_commodity_favor_moat]]
 * 의 "친숙한 인코딩만"), 날짜를 누르면 그날 일정이 옆에 서므로 "며칠 뒤에 뭐 있지"를
 * 바로 답한다. 이 화면에서 유일한 클라이언트 컴포넌트다 — 고른 날짜 하나만 상태로 갖는다.
 *
 * 달력 칸은 **오늘이 든 주의 일요일**부터 다섯 주다(서학개미 장부의 달력과 같은 요일 차례). 달을 통째로 보여주면 지나간 날이 반이고,
 * 이달 말에 열면 다음 달 초 일정이 안 보인다. 다른 달의 날은 옅게 두고 1일에만 "10/1" 로 달을 적는다.
 *
 * ⚠️ 이 파일은 lib/kadera-why.ts 를 import 하지 않는다(그쪽은 server-only). 자료 모양은
 *    아래 CalEvent 로 따로 적고, 서버 쪽(page.tsx)이 그 모양으로 넘긴다.
 */
export type CalEvent = {
  code: string;
  name: string;
  market: string | null;
  date: string;
  event: string;
  channels: number;
};

/**
 * 종목 주소. **미국 종목엔 아직 실주소가 없다**(project_stock_canonical_urls) — MDD 로 보낸다.
 * 함수를 프롭으로 못 받는다(서버 → 클라이언트 컴포넌트라 함수 전달이 막혀 있다). 그래서
 * 줄마다 실린 market 으로 여기서 가른다.
 */
function stockHrefOf(e: CalEvent): string {
  return e.market === "US" ? `/mdd?code=${e.code}&market=US` : `/stock/${e.code}`;
}

/** 요일 이름. **일요일이 첫 칸이다** — 서학개미 장부(app/seohak/CalendarHero.tsx)와 같은 차례라
 *  두 화면의 달력을 같은 눈으로 읽는다. 날짜 이름과 머리글이 같은 배열을 쓴다. */
const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function dow(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}
function label(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${m}월 ${d}일 (${WEEKDAY[dow(iso)]})`;
}
function rel(today: string, iso: string): string {
  const diff = Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (diff <= 0) return "오늘";
  if (diff === 1) return "내일";
  return `${diff}일 뒤`;
}

export function EventsCalendar({ events, today, weeks = 5 }: { events: CalEvent[]; today: string; weeks?: number }) {
  const byDate = useMemo(() => {
    const m = new Map<string, CalEvent[]>();
    for (const e of events) {
      const g = m.get(e.date);
      if (g) g.push(e);
      else m.set(e.date, [e]);
    }
    return m;
  }, [events]);
  const dates = useMemo(() => [...byDate.keys()].sort(), [byDate]);
  // 처음 고른 날 = 오늘 이후 일정이 있는 첫날. 없으면 오늘.
  const [sel, setSel] = useState<string>(() => dates.find((d) => d >= today) ?? today);
  // 고른 날의 줄은 SHOW 개까지만 펴 둔다. 열한 건짜리 날이 판을 세 배로 늘리던 것을 막는다(2026-09-06).
  // 펼침은 날짜에 묶어 둔다 — 다른 날로 옮기면 저절로 접힌다.
  const SHOW = 4;
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  const expanded = openedFor === sel;
  // 날짜를 한 번이라도 고르면 '처음 화면' 규칙에서 벗어난다(아래 INITIAL_ROWS 주석).
  const [touched, setTouched] = useState(false);
  const pick = (d: string) => {
    setSel(d);
    setTouched(true);
  };

  // 오늘이 든 주의 일요일부터 weeks 주.
  const start = addDays(today, -dow(today));
  const cells = Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i));
  // 달 이름은 오늘부터의 칸에서만 뽑는다 — 첫 줄에 지난달 말일이 끼어도 "8월"이라 적을 이유가 없다.
  const months = [...new Set(cells.filter((d) => d >= today).map((d) => Number(d.slice(5, 7))))];
  const thisMonth = today.slice(0, 7);

  const items = byDate.get(sel) ?? [];
  const nextDate = dates.find((d) => d > sel);
  const prevDate = [...dates].reverse().find((d) => d < sel && d >= today);
  // 고른 날 아래에 **다음으로 짚인 날**을 몇 줄 미리 보인다. 하루에 한두 건인 날이 많아 오른쪽
  // 판이 비는데, 그 자리에 다음 날을 세우면 빈 데가 없고 "그다음엔 뭐 있지"까지 답한다.
  const PREVIEW = 3;
  const nextAll = nextDate ? (byDate.get(nextDate) ?? []) : [];
  // ⭐ **처음 화면은 두 블록을 합쳐 넉 줄이다**(2026-09-06). 블록마다 따로 자르면 첫인상이
  //    일곱 줄(4+3)이 되어 카드가 길어진다. 다음 날에 한 줄은 남기고 나머지를 고른 날이 갖는다:
  //      오늘 5 · 다음 2 → 3+1   오늘 4 · 다음 1 → 3+1   오늘 1 · 다음 5 → 1+3   다음 날 없음 → 4+0
  //    날짜를 한 번이라도 고르면(touched) 블록마다 SHOW·PREVIEW 로 돌아간다 — 그때는 그 날을
  //    보러 온 것이라 판이 길어도 된다. 넘치는 줄은 사라지지 않고 '나머지 N건 보기'로 남는다.
  const INITIAL_ROWS = 4;
  const nextSlots = touched
    ? PREVIEW
    : nextAll.length === 0
      ? 0
      : Math.min(nextAll.length, Math.max(1, INITIAL_ROWS - items.length));
  const daySlots = touched ? SHOW : Math.max(1, INITIAL_ROWS - nextSlots);
  const nextItems = nextAll.slice(0, nextSlots);
  const nextMore = Math.max(0, nextAll.length - nextSlots);

  return (
    <div className="hz-evsplit">
      <div className="hz-evcal">
        <div className="hz-evcal-month">
          {months.map((m) => `${m}월`).join(" · ")}
          <span style={{ fontWeight: 600, color: C.sub2, marginLeft: 8, fontSize: 11.5 }}>
            {label(today).slice(0, -4)}부터 {weeks}주
          </span>
          <span style={{ flex: 1 }} />
          {/* 오늘로 돌아오는 단추. 몇 주 뒤를 보다가 한 번에 돌아온다. */}
          <button type="button" className="hz-evcal-today" onClick={() => pick(today)} disabled={sel === today}>
            오늘
          </button>
        </div>
        <div className="hz-evcal-grid" role="grid" aria-label="일정 달력">
          {WEEKDAY.map((w, i) => (
            /* 주말 머리글은 흐리게 — 서학개미 달력과 같은 규칙이다(i 0·6). */
            <span key={w} className={i === 0 || i === 6 ? "hz-evcal-wd wknd" : "hz-evcal-wd"}>
              {w}
            </span>
          ))}
          {cells.map((d) => {
            const n = byDate.get(d)?.length ?? 0;
            const past = d < today;
            const other = d.slice(0, 7) !== thisMonth;
            const cls = [
              "hz-evcal-day",
              n > 0 ? "has" : "",
              d === sel ? "sel" : "",
              d === today ? "today" : "",
              past ? "past" : "",
              other ? "other" : "",
            ]
              .filter(Boolean)
              .join(" ");
            const num = d.slice(8) === "01" ? `${Number(d.slice(5, 7))}/1` : String(Number(d.slice(8)));
            return (
              <button
                key={d}
                type="button"
                className={cls}
                disabled={past}
                aria-pressed={d === sel}
                aria-label={`${label(d)}${n ? ` · 일정 ${n}건` : ""}`}
                onClick={() => pick(d)}
              >
                <span className="num">{num}</span>
                {/* 일정이 있는 날만 건수를 단다. 없는 날에 0 을 찍으면 달력이 숫자로 덮인다. */}
                {n > 0 && <span className="cnt">{n}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="hz-evday">
        <div className="hz-evday-head">
          <span style={{ fontSize: 15, fontWeight: 800, color: C.ink, letterSpacing: "-.01em" }}>{label(sel)}</span>
          <Pill tone={rel(today, sel) === "오늘" || rel(today, sel) === "내일" ? "blue" : "plain"}>{rel(today, sel)}</Pill>
          <span style={{ flex: 1 }} />
          <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.sub }}>
            {items.length ? `${items.length}건` : ""}
          </span>
        </div>
        {items.length === 0 ? (
          <p style={{ margin: 0, padding: "18px 0", fontSize: 13, color: C.sub, lineHeight: 1.6 }}>
            이날 커뮤니티가 짚은 일정이 없습니다.
            {nextDate && (
              <>
                {" "}
                가장 가까운 일정은 {label(nextDate)}입니다.
              </>
            )}
          </p>
        ) : (
          <div>
            {(expanded ? items : items.slice(0, daySlots)).map((e) => (
              <div key={`${e.code}-${e.event}`} className="hz-evday-row">
                <StockLogo code={e.code} name={e.name} market={e.market} size={28} />
                <span
                  style={{ minWidth: 0, fontSize: 13.5, lineHeight: 1.6, color: "var(--c-ink-soft)", wordBreak: "keep-all", textWrap: "pretty" }}
                >
                  <Link
                    href={stockHrefOf(e)}
                    className="hz-stock-link"
                    style={{ fontSize: 14, fontWeight: 700, letterSpacing: "-.01em", marginRight: 7 }}
                  >
                    {e.name}
                  </Link>
                  {e.event}
                </span>
                {/* 여럿이 말한 것만 알린다. 한 곳뿐인 줄에 "1곳"을 찍으면 그 숫자가 목록을 덮는다. */}
                {e.channels >= 2 ? <Pill tone="blue">{e.channels}곳이 말함</Pill> : <span />}
              </div>
            ))}
            {items.length > daySlots && (
              <button type="button" className="hz-evday-more" onClick={() => setOpenedFor(expanded ? null : sel)}>
                {expanded ? "접기 ↑" : `나머지 ${items.length - daySlots}건 보기 ↓`}
              </button>
            )}
          </div>
        )}
        {nextDate && nextItems.length > 0 && (
          <div className="hz-evday-next">
            <div className="hz-evday-head hz-evday-head-next">
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", color: C.sub }}>다음으로 짚인 날</span>
              <span style={{ fontSize: 13.5, fontWeight: 800, color: C.ink, letterSpacing: "-.01em" }}>{label(nextDate)}</span>
              <Pill tone={rel(today, nextDate) === "내일" ? "blue" : "plain"}>{rel(today, nextDate)}</Pill>
              <span style={{ flex: 1 }} />
              {/* 그날 전체 건수. 미리보기는 세 줄뿐이라 여기 안 적으면 몇 건인지 알 길이 없다. */}
              <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.sub }}>
                {byDate.get(nextDate)?.length ?? 0}건
              </span>
            </div>
            {nextItems.map((e) => (
              <div key={`${e.code}-${e.event}`} className="hz-evday-row">
                <StockLogo code={e.code} name={e.name} market={e.market} size={28} />
                <span
                  style={{ minWidth: 0, fontSize: 13.5, lineHeight: 1.6, color: "var(--c-ink-soft)", wordBreak: "keep-all", textWrap: "pretty" }}
                >
                  <Link
                    href={stockHrefOf(e)}
                    className="hz-stock-link"
                    style={{ fontSize: 14, fontWeight: 700, letterSpacing: "-.01em", marginRight: 7 }}
                  >
                    {e.name}
                  </Link>
                  {e.event}
                </span>
                {e.channels >= 2 ? <Pill tone="blue">{e.channels}곳이 말함</Pill> : <span />}
              </div>
            ))}
            {nextMore > 0 && (
              <button type="button" className="hz-evday-more" onClick={() => pick(nextDate)}>
                {nextMore}건 더 있습니다 · 그날로 가기 →
              </button>
            )}
          </div>
        )}
        <div className="hz-evday-nav">
          {prevDate && (
            <button type="button" onClick={() => pick(prevDate)}>
              ← {label(prevDate)}
            </button>
          )}
          <span style={{ flex: 1 }} />
          {nextDate && (
            <button type="button" onClick={() => pick(nextDate)}>
              다음 일정 · {label(nextDate)} →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
