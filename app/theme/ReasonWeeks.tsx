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
function dow(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}
/** 줄의 날짜 칸 — "9/21". 달과 날만, 요일은 그 아래 따로. */
function fmtMd(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}`;
}

const clip: React.CSSProperties = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };

export function ReasonWeeks({ rows, latest, earliest }: { rows: ThemeReasonRow[]; latest: string; earliest: string }) {
  // 몇 주 전을 보고 있나. 0 = 기준일까지의 이레.
  const [back, setBack] = useState(0);
  const end = addDays(latest, -back * WEEK_DAYS);
  const start = addDays(end, -(WEEK_DAYS - 1));
  const canPrev = start > earliest;
  const canNext = back > 0;

  // 이 주의 줄. 최신 날이 먼저, 같은 날은 여러 채널이 말한 것이 먼저. 날짜별 머리 없이 **한 격자**에 세운다 — 날짜마다
  // 격자를 나누면 셋·다섯처럼 홀수인 날마다 마지막 줄이 반쪽이라 선이 층계처럼 끊겼다(2026-09-21 "구분선이 어색하다").
  // 날짜는 줄의 첫 칸이 말한다.
  const list = useMemo(
    () =>
      rows
        .filter((r) => r.date >= start && r.date <= end)
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.channelCount - a.channelCount)),
    [rows, start, end],
  );
  const total = list.length;
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
      {list.length === 0 ? (
        <p style={{ margin: 0, padding: "14px 22px 8px", fontSize: "var(--fs-12)", fontWeight: 500, color: C.sub, lineHeight: 1.7 }}>
          이 주에는 이 테마 종목에 붙은 까닭이 없습니다. 까닭은 등락이 큰 날에만 만듭니다.
        </p>
      ) : (
        /* 한 열 표 — 날짜 · 종목(로고·이름·등락 태그) · 까닭(남는 폭 전부) · 채널 수. 두 열로 눌러 담았더니 까닭이 좁은 칸에서
           접혀 읽기 어려웠다(2026-09-21 "가독성이 떨어졌다"). 종목 칸 폭을 못박아 까닭이 세로로 나란히 서고, 채널 수를
           오른쪽 끝에 두어 줄이 폭을 다 쓴다. 1149 아래는 까닭이 둘째 줄로(layout.css). */
        <div className="hz-reason-table">
          <div className="hz-thead hz-cols-theme-reason">
            <span>날짜</span>
            <span>종목</span>
            <span>채널이 말한 까닭</span>
            <span style={{ textAlign: "right" }}>채널</span>
          </div>
          {list.map((r) => (
            <div key={`${r.date}-${r.code}`} className="hz-trow hz-cols-theme-reason">
              <span style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
                <span style={{ fontFamily: MONO, fontSize: "var(--fs-12-5)", fontWeight: 800, letterSpacing: "-.01em", color: C.ink, whiteSpace: "nowrap" }}>{fmtMd(r.date)}</span>
                <span style={{ fontSize: "var(--fs-11)", color: C.sub2 }}>{WEEKDAY[dow(r.date)]}</span>
              </span>
              <Link href={`/stock/${r.code}`} style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0, textDecoration: "none" }}>
                <StockLogo code={r.code} name={r.name} market={r.market} size={26} />
                <span className="hz-theme-namerow">
                  <span className="hz-theme-name" style={{ ...clip, fontSize: "var(--fs-13-5)", fontWeight: 800, letterSpacing: "-.01em", color: C.ink }}>{r.name}</span>
                  {r.changeRate == null ? (
                    <span className="hz-theme-tag">{r.date === newestDate ? "종가 전" : "등락 없음"}</span>
                  ) : (
                    <span className={`hz-theme-tag ${r.changeRate > 0 ? "is-up-2" : r.changeRate < 0 ? "is-down-2" : ""}`}>
                      {r.changeRate > 0 ? "▲" : r.changeRate < 0 ? "▼" : ""}
                      {Math.abs(r.changeRate).toFixed(2)}%
                    </span>
                  )}
                </span>
              </Link>
              <span style={{ minWidth: 0, fontSize: "var(--fs-13)", lineHeight: 1.6, color: C.inkSoft, wordBreak: "keep-all", textWrap: "pretty" }}>{r.reason}</span>
              <span style={{ textAlign: "right", fontFamily: MONO, fontSize: "var(--fs-13)", fontWeight: 800, letterSpacing: "-.01em", color: C.ink, whiteSpace: "nowrap" }}>
                {r.channelCount}곳
              </span>
            </div>
          ))}
        </div>
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
