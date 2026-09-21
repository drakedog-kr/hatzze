"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { ThemeReasonRow } from "@/lib/theme-page";

import { Pill } from "../kadera/parts";
import { SectionHead } from "../kadera/SectionHead";
import { StockLogo } from "../StockLogo";
import { C, MONO } from "../ui";

/**
 * '등락의 이유'를 **7일씩** 넘겨 본다. 30일치를 한 번에 세우면 반도체는 1,830px 로 화면에서 가장 긴 카드였다
 * (2026-09-21 실측). 처음 보이는 창은 기준일까지의 이레이고, 아래 '이전 7일'·'다음 7일'로 옮긴다. 달력의 주(월~일)가
 * 아니다 — 월요일에 열면 이번 주가 하루뿐이라 비어 보인다. 단추 이름이 '지난주'였을 땐 달력 주로 읽혔다(2026-09-22 Hun).
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
function fmtKoWd(iso: string): string {
  return `${fmtKo(iso)} (${WEEKDAY[dow(iso)]})`;
}

const clip: React.CSSProperties = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };

export function ReasonWeeks({
  rows,
  latest,
  earliest,
  today,
  trendDays,
}: {
  rows: ThemeReasonRow[];
  latest: string;
  earliest: string;
  today: string;
  /** 도움말에 적는 "최근 n일". lib/theme-page.ts THEME_TREND_DAYS. */
  trendDays: number;
}) {
  // 몇 주 전을 보고 있나. 0 = 기준일까지의 이레.
  const [back, setBack] = useState(0);
  const end = addDays(latest, -back * WEEK_DAYS);
  const start = addDays(end, -(WEEK_DAYS - 1));
  const canPrev = start > earliest;
  const canNext = back > 0;

  // 이 주의 줄을 날짜로 묶는다(오래된 날이 위, 최신 날이 아래 — 달력 순서. 최신을 위에 두니 거꾸로 읽혀 헷갈렸다, 2026-09-22 Hun.
  // 같은 날은 여러 채널이 말한 것이 먼저). 기본 꼴은 **날짜 머리 하나 아래 그날 종목들**이다
  // (2026-09-21 Hun). 두 열 격자(선이 층계)와 날짜 칸을 둔 한 표(같은 날짜가 세 줄) 둘 다 이보다 못했다.
  const days = useMemo(() => {
    const m = new Map<string, ThemeReasonRow[]>();
    for (const r of rows) {
      if (r.date < start || r.date > end) continue;
      const g = m.get(r.date);
      if (g) g.push(r);
      else m.set(r.date, [r]);
    }
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, list]) => [date, list.sort((a, b) => b.channelCount - a.channelCount)] as const);
  }, [rows, start, end]);
  // 가장 최근 날의 등락률은 다음 날 낮에 채워진다(KRX 가 그날 종가를 이튿날 준다 — generate_move_reasons.fill_krx).
  // 빈칸으로 두면 "왜 없지"가 되니 그날 줄엔 '종가 전'이라고 적는다. 그보다 옛날의 빈칸은 시세가 없는 종목이라 "—".
  const newestDate = rows.reduce((m, r) => (r.date > m ? r.date : m), "");

  return (
    <div>
      {/* 머리(SectionHead)를 여기서 그린다 — 오른쪽 알약이 보고 있는 주의 날짜라 주를 넘길 때 같이 바뀌어야 한다
          (TrendingTabs 가 기간 탭 때문에 머리를 안에서 그리는 것과 같은 사정). 총 건수는 안 적는다(2026-09-21 Hun). */}
      <SectionHead
        icon="history"
        title="등락의 이유"
        note={`${fmtKo(start)} ~ ${fmtKo(end)}`}
        desc="이 테마 종목이 크게 움직인 날, 그날 채널이 말한 이유입니다."
        noteHelp={`기준일에서 거슬러 7일씩 봅니다(달력의 주가 아닙니다). 아래 단추로 7일씩 넘기고 최근 ${trendDays}일까지 거슬러 갑니다.`}
        level={2}
      />
      {days.length === 0 ? (
        <p style={{ margin: 0, padding: "14px 22px 8px", fontSize: "var(--fs-12)", fontWeight: 500, color: C.sub, lineHeight: 1.7 }}>
          이 주에는 이 테마 종목에 붙은 까닭이 없습니다. 까닭은 등락이 큰 날에만 만듭니다.
        </p>
      ) : (
        <div className="hz-reason-days">
          {days.map(([date, list]) => (
            /* 날짜 묶음 — 머리(날짜 · 오늘 알약 · 건수) 아래 그날 종목 줄. 줄은 종목(폭 고정) · 까닭(남는 폭) · 채널 수(오른쪽 끝).
               까닭이 줄마다 같은 자리에서 시작해 세로로 나란하고, 채널 수가 오른쪽 끝에 서서 줄이 폭을 끝까지 쓴다 —
               예전엔 "n곳이 언급"이 문장 꼬리에 붙어 오른쪽이 통째로 비어 보였다. 묶음 사이는 선이 아니라 머리의 위 여백이 가른다. */
            <section key={date} className="hz-reason-day" aria-label={fmtKoWd(date)}>
              <div className="hz-reason-day-head">
                <span style={{ fontSize: "var(--fs-13-5)", fontWeight: 800, color: C.ink, letterSpacing: "-.01em" }}>{fmtKoWd(date)}</span>
                {date === today && <Pill tone="blue">오늘</Pill>}
                <span style={{ flex: 1 }} />
                <span style={{ fontFamily: MONO, fontSize: "var(--fs-11-5)", fontWeight: 700, color: C.sub2 }}>{list.length}건</span>
              </div>
              {list.map((r) => (
                <div key={`${date}-${r.code}`} className="hz-trow hz-cols-theme-reason">
                  <Link href={`/stock/${r.code}`} style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0, textDecoration: "none" }}>
                    <StockLogo code={r.code} name={r.name} market={r.market} size={26} />
                    <span className="hz-theme-namerow">
                      <span className="hz-theme-name" style={{ ...clip, fontSize: "var(--fs-13-5)", fontWeight: 800, letterSpacing: "-.01em", color: C.ink }}>{r.name}</span>
                      {/* 등락은 태그가 아니라 보통의 등락 글자(온도 잉크, 종목·카더라 화면과 같은 꼴). 태그는 '주인공' 표의 언급 변화 몫이다. */}
                      {r.changeRate == null ? (
                        <span style={{ marginLeft: 8, fontSize: "var(--fs-11)", color: C.muted, whiteSpace: "nowrap" }}>{date === newestDate ? "종가 전" : "—"}</span>
                      ) : (
                        <span
                          style={{
                            marginLeft: 8,
                            fontFamily: MONO,
                            fontSize: "var(--fs-12-5)",
                            fontWeight: 700,
                            whiteSpace: "nowrap",
                            color: r.changeRate > 0 ? "var(--c-hot-ink)" : r.changeRate < 0 ? "var(--c-cold-ink)" : C.sub2,
                          }}
                        >
                          {r.changeRate > 0 ? "▲" : r.changeRate < 0 ? "▼" : ""}
                          {Math.abs(r.changeRate).toFixed(2)}%
                        </span>
                      )}
                    </span>
                  </Link>
                  <span style={{ minWidth: 0, fontSize: "var(--fs-13)", lineHeight: 1.6, color: C.inkSoft, wordBreak: "keep-all", textWrap: "pretty" }}>{r.reason}</span>
                  <span style={{ textAlign: "right", fontSize: "var(--fs-12)", fontWeight: 600, color: C.sub, whiteSpace: "nowrap" }}>
                    <strong style={{ fontFamily: MONO, fontSize: "var(--fs-13)", fontWeight: 800, color: C.ink }}>{r.channelCount}곳</strong> 언급
                  </span>
                </div>
              ))}
            </section>
          ))}
        </div>
      )}
      {/* 카더라 달력의 날짜 이동 단추와 같은 알약. 갈 데가 없는 쪽은 그리지 않는다 — 흐린 '다음 7일'이 남아 있으면
          없는 것이 있는 듯 읽힌다(2026-09-22 Hun). 사이의 빈 칸(flex:1)이 자리를 지켜 남은 단추는 제 쪽에 선다. */}
      <div className="hz-evday-nav hz-reason-nav" style={{ padding: "14px 22px 16px" }}>
        {canPrev && (
          <button type="button" onClick={() => setBack((b) => b + 1)}>
            ← 이전 7일
          </button>
        )}
        <span style={{ flex: 1 }} />
        {canNext && (
          <button type="button" onClick={() => setBack((b) => b - 1)}>
            다음 7일 →
          </button>
        )}
      </div>
    </div>
  );
}
