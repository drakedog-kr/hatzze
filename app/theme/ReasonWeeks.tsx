"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { ThemeReasonRow } from "@/lib/theme-page";

import { StockLogo } from "../StockLogo";
import { C, MONO } from "../ui";

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
  // 가장 최근 날의 등락률은 다음 날 낮에 채워진다(KRX 가 그날 종가를 이튿날 준다 — generate_move_reasons.fill_krx).
  // 빈칸으로 두면 "왜 없지"가 되니 그날 줄엔 '종가 전'이라고 적는다. 그보다 옛날의 빈칸은 시세가 없는 종목이라 "—".
  const newestDate = rows.reduce((m, r) => (r.date > m ? r.date : m), "");

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
              <span style={{ flex: 1 }} />
              <span style={{ fontFamily: MONO, fontSize: "var(--fs-11-5)", fontWeight: 700, color: C.sub2 }}>{list.length}건</span>
            </div>
            {/* 하루의 줄을 두 열로. 까닭이 짧아 오른쪽 반이 비었다(2026-09-21 지적). 1149 아래는 한 열(layout.css). */}
            <div className="hz-reason-grid">
            {list.map((r) => (
              /* '이 테마의 주인공' 표와 같은 얼개 — 로고 · [이름 + 등락 태그] 위, 까닭 아래 · 오른쪽에 채널 수 세로 두 줄.
                 등락은 이름 옆 태그로(색은 오른·내린 틴트). 예전엔 이름·등락·까닭이 한 줄에 세 칸이라 반쪽 폭에서
                 까닭이 두 줄로 접히고 "n곳이 언급"이 문장 끝에 매달려 대충 놓인 듯 보였다(2026-09-21). */
              <div key={`${date}-${r.code}`} className="hz-trow hz-cols-theme-reason">
                <Link href={`/stock/${r.code}`} style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, textDecoration: "none" }}>
                  <StockLogo code={r.code} name={r.name} market={r.market} size={28} />
                  <span style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                    <span className="hz-theme-namerow">
                      <span className="hz-theme-name" style={{ ...clip, fontSize: "var(--fs-13-5)", fontWeight: 800, letterSpacing: "-.01em", color: C.ink }}>{r.name}</span>
                      {r.changeRate == null ? (
                        <span className="hz-theme-tag">{date === newestDate ? "종가 전" : "등락 없음"}</span>
                      ) : (
                        <span className={`hz-theme-tag ${r.changeRate > 0 ? "is-up-2" : r.changeRate < 0 ? "is-down-2" : ""}`}>
                          {r.changeRate > 0 ? "▲" : r.changeRate < 0 ? "▼" : ""}
                          {Math.abs(r.changeRate).toFixed(2)}%
                        </span>
                      )}
                    </span>
                    <span style={{ fontSize: "var(--fs-12)", lineHeight: 1.55, color: C.inkSoft, wordBreak: "keep-all", textWrap: "pretty" }}>{r.reason}</span>
                  </span>
                </Link>
                <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, flexShrink: 0 }}>
                  <span style={{ fontFamily: MONO, fontSize: "var(--fs-14)", fontWeight: 800, letterSpacing: "-.02em", color: C.ink, whiteSpace: "nowrap" }}>
                    {r.channelCount}곳
                  </span>
                  <span style={{ fontSize: "var(--fs-11)", fontWeight: 600, color: C.sub2, whiteSpace: "nowrap" }}>언급</span>
                </span>
              </div>
            ))}
            </div>
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
