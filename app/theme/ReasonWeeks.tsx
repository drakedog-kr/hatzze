"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { ThemeReasonRow } from "@/lib/theme-page";

import { StockLogo } from "../StockLogo";
import { C, MONO } from "../ui";
import { Rate } from "./Rate";

/**
 * '까닭 이력'을 **한 주씩** 넘겨 본다. 30일치를 한 번에 세우면 반도체는 1,830px 로 화면에서 가장 긴 카드였다
 * (2026-09-21 실측). 처음 보이는 주는 기준일까지의 이레이고, 아래 '지난주'·'다음주'로 옮긴다.
 *
 * 자료는 서버가 30일치를 다 넘긴다(lib/theme-page.ts reasons). 여기서는 어느 주를 보일지만 상태로 갖는다 —
 * 카더라 달력(EventsCalendar)과 같은 원칙이다.

 */
const WEEK_DAYS = 7;
const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function fmtKo(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(m)}월 ${Number(d)}일`;
}
function fmtKoWd(iso: string): string {
  return `${fmtKo(iso)} (${WEEKDAY[new Date(`${iso}T00:00:00Z`).getUTCDay()]})`;
}

const clip: React.CSSProperties = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };

export function ReasonWeeks({ rows, latest, earliest }: { rows: ThemeReasonRow[]; latest: string; earliest: string }) {
  // 몇 주 전을 보고 있나. 0 = 기준일까지의 이레.
  const [back, setBack] = useState(0);
  const end = addDays(latest, -back * WEEK_DAYS);
  const start = addDays(end, -(WEEK_DAYS - 1));
  const canPrev = start > earliest;
  const canNext = back > 0;

  const days = useMemo(() => {
    const m = new Map<string, ThemeReasonRow[]>();
    for (const r of rows) {
      if (r.date < start || r.date > end) continue;
      const g = m.get(r.date);
      if (g) g.push(r);
      else m.set(r.date, [r]);
    }
    // 최신 날이 위, 같은 날은 여러 채널이 말한 것이 먼저.
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([date, list]) => [date, list.sort((a, b) => b.channelCount - a.channelCount)] as const);
  }, [rows, start, end]);
  const total = days.reduce((n, [, list]) => n + list.length, 0);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "14px 22px 0" }}>
        <span style={{ fontSize: "var(--fs-12-5)", fontWeight: 700, color: C.sub }}>
          {fmtKo(start)} ~ {fmtKo(end)}
        </span>
        {back === 0 && <span style={{ fontSize: "var(--fs-11)", color: C.muted }}>이번 주</span>}
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: MONO, fontSize: "var(--fs-12)", fontWeight: 700, color: C.sub }}>{total ? `${total}건` : ""}</span>
      </div>
      {days.length === 0 ? (
        <p style={{ margin: 0, padding: "14px 22px 8px", fontSize: "var(--fs-12)", fontWeight: 500, color: C.sub, lineHeight: 1.7 }}>
          이 주에는 이 테마 종목에 붙은 까닭이 없습니다. 까닭은 등락이 큰 날에만 만듭니다.
        </p>
      ) : (
        days.map(([date, list]) => (
          <div key={date}>
            <div className="hz-agenda-day">
              <span style={{ fontSize: "var(--fs-13-5)", fontWeight: 800, color: C.ink, letterSpacing: "-.01em" }}>{fmtKoWd(date)}</span>
            </div>
            {list.map((r) => (
              <div key={`${date}-${r.code}`} className="hz-trow hz-cols-theme-reason">
                <Link href={`/stock/${r.code}`} style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, textDecoration: "none" }}>
                  <StockLogo code={r.code} name={r.name} market={r.market} size={22} />
                  <span style={{ ...clip, fontSize: "var(--fs-12-5)", fontWeight: 700, color: C.ink }}>{r.name}</span>
                </Link>
                <span style={{ fontSize: "var(--fs-12)", textAlign: "right" }}>
                  <Rate rate={r.changeRate} />
                </span>
                <span style={{ minWidth: 0, fontSize: "var(--fs-13)", lineHeight: 1.6, color: C.inkSoft, wordBreak: "keep-all", textWrap: "pretty" }}>
                  {r.reason}
                  {r.channelCount >= 2 && <span style={{ color: C.muted, marginLeft: 6, whiteSpace: "nowrap", fontSize: "var(--fs-11)" }}>{r.channelCount}곳이 말함</span>}
                </span>
              </div>
            ))}
          </div>
        ))
      )}
      {/* 카더라 달력의 날짜 이동 단추와 같은 알약. 끝에 닿은 쪽은 흐리게 두되 자리는 남긴다 — 사라지면 다른 쪽이 옮겨 앉는다. */}
      <div className="hz-evday-nav hz-reason-nav" style={{ padding: "14px 22px 16px" }}>
        <button type="button" disabled={!canPrev} onClick={() => setBack((b) => b + 1)}>
          ← 지난주
        </button>
        <span style={{ flex: 1 }} />
        <button type="button" disabled={!canNext} onClick={() => setBack((b) => b - 1)}>
          다음주 →
        </button>
      </div>
    </div>
  );
}
