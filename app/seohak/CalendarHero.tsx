"use client";

import { useMemo, useState } from "react";

import type { CalendarDay, SeohakCalendar } from "@/lib/seohak-calendar";
import { CALENDAR_WINDOWS, REACTIONS, windowsInMonth } from "@/lib/seohak-windows";
import { SectionHead } from "../kadera/SectionHead";
import { C, Icon, MONO, R } from "../ui";

/**
 * 달력 히어로.
 *
 * ## 칸과 띠의 역할이 다르다
 *
 * - **날짜 칸** = 그날의 실제 결제(순매수). 32년치 실측이라 추정이 없다.
 * - **가로 띠** = 다년 집계로 잰 구간(`CALENDAR_WINDOWS`). 구글 캘린더의 종일 일정 자리다.
 *
 * ⚠️⚠️ 처음엔 칸마다 그 날짜의 역대 성향을 칠하려 했는데 **날짜별 표본이 중앙값 8개**라
 * 잡음이었고, 가장 세게 나온 날짜 셋이 전부 휴장 자국이었다(`lib/seohak-calendar.ts`
 * 머리말에 실측). 그래서 둘의 역할을 갈랐다 — 섞으면 잡음이 사실인 척한다.
 *
 * ## 왜 클라이언트 컴포넌트인가
 *
 * 달 넘기기와 날짜 클릭 둘 다 상태다. 24개월치를 서버에서 한 번에 받아 넘겨주므로
 * 달을 넘길 때 왕복이 없다.
 */

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

const usd = (v: number) => {
  const a = Math.abs(v);
  const sign = v < 0 ? "−" : "";
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(0)}M`;
  return `${sign}$${Math.round(a).toLocaleString("ko-KR")}`;
};
const cnt = (v: number) => v.toLocaleString("ko-KR");

/** "2026-08" → 그달 1일의 요일과 날 수. UTC 로만 다뤄 시간대 밀림을 막는다. */
function monthMeta(month: string) {
  const [y, m] = month.split("-").map(Number);
  return {
    year: y,
    month: m,
    firstWeekday: new Date(Date.UTC(y, m - 1, 1)).getUTCDay(),
    length: new Date(Date.UTC(y, m, 0)).getUTCDate(),
  };
}

function shiftMonth(month: string, by: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}


/* ── 사건 대 날짜 ────────────────────────────────────────────────────
   원래 별도 카드('무엇에 반응하나')였는데 달력 안으로 들였다. 이 카드가 하는 말이
   **"매매를 바꾸는 건 사건이 아니라 날짜다"** 라서, 날짜를 그리는 화면의 결론으로
   붙어야 제자리다. 따로 두면 독자가 두 화면을 머릿속에서 이어 붙여야 한다.

   시트 전체 폭을 쓰니 좁은 카드에서보다 띠가 길어져 '무반응'이 더 또렷하다. */
function EventsVsDates() {
  const yearend = CALENDAR_WINDOWS.find((w) => w.key === "yearend")!;
  const rows = [
    ...REACTIONS.map((r) => {
      const c: number[] = [];
      if (r.buy !== null) c.push(r.buy);
      if (r.sell !== null) c.push(r.sell);
      // 매수·매도 중 더 크게 움직인 쪽. 순매수로 뭉치면 둘이 서로 상쇄한다.
      const dev = c.length ? c.reduce((a, b) => (Math.abs(b - 1) > Math.abs(a - 1) ? b : a)) : 1;
      return { label: r.label, diff: Math.round(Math.abs(dev - 1) * 100), strong: false };
    }),
    { label: "연말 마지막 주가 오면", diff: Math.round(Math.abs(yearend.sell - 1) * 100), strong: true },
  ];
  /** 축 오른쪽 끝(%). 가장 큰 값보다 넉넉히 잡아 막대가 벽에 닿지 않게 한다. */
  const AXIS = 20;
  /** 이 밖으로 나가야 '달라졌다'고 본다. 20영업일 창의 날짜별 흔들림이 이 폭이다. */
  const NOISE = 5;

  return (
    <div style={{ paddingTop: 12, borderTop: `1px solid ${C.line}` }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap",
                    marginBottom: 10 }}>
        <b style={{ fontSize: 14, fontWeight: 800, color: C.ink }}>
          사건보다 <span style={{ color: C.blue }}>날짜에 더 반응</span>합니다
        </b>
        <span style={{ fontSize: 11.5, color: C.sub2 }}>
          이런 일이 있던 다음 날, 매매가 얼마나 달라졌는지입니다
        </span>
      </div>

      <div style={{ position: "relative", display: "grid", gap: "9px 22px",
                    gridTemplateColumns: "repeat(auto-fit, minmax(min(215px, 100%), 1fr))" }}>
        {rows.map((r) => (
          <div key={r.label} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11.5 }}>
              <span style={{ fontWeight: r.strong ? 800 : 600, color: r.strong ? C.ink : C.label,
                             minWidth: 0, overflow: "hidden", textOverflow: "ellipsis",
                             whiteSpace: "nowrap" }}>{r.label}</span>
              <span style={{ flexShrink: 0, fontWeight: 700, color: r.strong ? C.blue : C.sub2 }}>
                {r.diff <= NOISE ? "그대로" : `${r.diff}% 달라짐`}
              </span>
            </span>
            {/* 줄마다 '차이 없음' 구역을 깔아 짧은 막대가 '작은 반응'이 아니라
                '무반응'으로 읽히게 한다. */}
            <span style={{ position: "relative", height: 7, borderRadius: 4, background: C.soft }}>
              <span aria-hidden style={{ position: "absolute", left: 0, top: 0, bottom: 0,
                                         width: `${(NOISE / AXIS) * 100}%`, background: C.chip,
                                         borderRight: `1px dashed ${C.line}`,
                                         borderRadius: "4px 0 0 4px" }} />
              <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 4,
                             width: `${Math.max(2, Math.min(100, (r.diff / AXIS) * 100))}%`,
                             background: r.strong ? C.blue : C.bar }} />
            </span>
          </div>
        ))}
      </div>
      <span style={{ display: "block", fontSize: 10.5, color: C.faint, marginTop: 8 }}>
        회색 구역 안({NOISE}% 이내)은 평소 흔들림과 구별되지 않습니다 · 맨 아래 연말은 견주기용입니다
      </span>
    </div>
  );
}

export function CalendarHero({ c }: { c: SeohakCalendar }) {
  const [month, setMonth] = useState(c.asOfMonth);
  const [picked, setPicked] = useState<string>(c.asOf);

  const byDate = useMemo(() => {
    const m = new Map<string, CalendarDay>();
    for (const d of c.days) m.set(d.date, d);
    return m;
  }, [c.days]);

  const meta = monthMeta(month);
  const windows = windowsInMonth(meta.month);
  const day = byDate.get(picked);
  // 선택한 날이 어느 구간에 드는지. 오른쪽 칸이 "이 날은 ~에 듭니다"로 쓴다.
  const pickedDay = Number(picked.slice(8));
  const pickedWindow = picked.startsWith(month)
    ? windows.find((w) => pickedDay >= w.fromDay && pickedDay <= w.toDay)
    : undefined;

  // 달을 바꾸면 그 달의 마지막 거래일로 선택을 옮긴다. 안 그러면 다른 달의 날짜가
  // 선택된 채로 남아 아래 패널이 화면과 어긋난다.
  const goMonth = (by: number) => {
    const next = shiftMonth(month, by);
    setMonth(next);
    const inNext = c.days.filter((d) => d.date.startsWith(next));
    if (inNext.length) setPicked(inNext[inNext.length - 1].date);
  };

  const cells: (number | null)[] = [
    ...Array.from({ length: meta.firstWeekday }, () => null),
    ...Array.from({ length: meta.length }, (_, i) => i + 1),
  ];
  while (cells.length % 7) cells.push(null);

  const monthDays = c.days.filter((d) => d.date.startsWith(month));
  const monthNet = monthDays.reduce((s, d) => s + d.net, 0);

  return (
    <section className="hz-sheet">
      <SectionHead
        icon="calendar_month"
        title="언제 사고 언제 파나"
        desc="날짜 칸은 그날 실제 결제된 순매수입니다. 오른쪽은 고른 날과, 매매를 바꾸는 것들입니다."
        note={`${meta.year}년 ${meta.month}월`}
      />

      {/* 달력 1칸 · 설명 2칸.
          처음엔 반대(달력 2칸)로 뒀는데 달력만 커 보였다. 달력은 '어느 날을 고를까'를
          묻는 손잡이라 작아도 되고, 정작 읽을 것은 고른 날의 내용이다. 반응 스트립도
          아래 별도 줄에서 오른쪽으로 들여 세로를 줄였다. */}
      <div style={{ display: "flex", flexWrap: "wrap", padding: "12px 18px 0", gap: 18 }}>
        {/* ── 왼쪽 한 칸: 달력 ── */}
        <div style={{ flex: "1 1 290px", minWidth: 0, display: "flex",
                      flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            {[-1, 1].map((by) => {
              const target = shiftMonth(month, by);
              const disabled = target < c.firstMonth || target > c.lastMonth;
              return (
                <button
                  key={by}
                  type="button"
                  onClick={() => goMonth(by)}
                  disabled={disabled}
                  aria-label={by < 0 ? "이전 달" : "다음 달"}
                  style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    width: 24, height: 24, borderRadius: R.control, border: `1px solid ${C.line}`,
                    background: C.card, color: disabled ? C.disabled : C.sub,
                    cursor: disabled ? "default" : "pointer", padding: 0,
                  }}
                >
                  <Icon name={by < 0 ? "chevron_left" : "chevron_right"} style={{ fontSize: 16 }} />
                </button>
              );
            })}
            <span style={{ fontSize: 12.5, fontWeight: 800, color: C.ink, marginLeft: 2 }}>
              {meta.year}년 {meta.month}월
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 }}>
            {WEEKDAYS.map((w, i) => (
              <span key={w} style={{ fontSize: 9.5, fontWeight: 700, textAlign: "center",
                                     color: i === 0 || i === 6 ? C.faint : C.sub2 }}>{w}</span>
            ))}
            {cells.map((d, i) => {
              if (d === null) return <span key={`b${i}`} />;
              const date = `${month}-${String(d).padStart(2, "0")}`;
              const row = byDate.get(date);
              const inWindow = windows.find((w) => d >= w.fromDay && d <= w.toDay);
              const isPicked = date === picked;
              // 색 진하기는 순매수 크기. 파랑이면 더 샀고 회색이면 더 팔았다.
              const strength = row ? Math.min(1, Math.abs(row.net) / c.scale) : 0;
              const bg = !row
                ? C.soft
                : row.net >= 0
                  ? `color-mix(in srgb, ${C.blue} ${18 + strength * 72}%, ${C.card})`
                  : `color-mix(in srgb, ${C.inkSoft} ${18 + strength * 62}%, ${C.card})`;
              return (
                <button
                  key={date}
                  type="button"
                  onClick={() => row && setPicked(date)}
                  disabled={!row}
                  title={row ? `${date} · 순매수 ${usd(row.net)}` : `${date} · 결제 없음`}
                  style={{
                    position: "relative", height: 32,
                    // 빈 칸에 테두리를 두면 달의 절반이 '빈 상자밭'이 된다(결제는 T+1 이라
                    // 이 달의 남은 날은 아직 자료가 없다).
                    border: isPicked ? `2px solid ${C.ink}` : "2px solid transparent",
                    borderRadius: 4, background: bg, padding: 0,
                    cursor: row ? "pointer" : "default",
                    display: "flex", alignItems: "flex-start", justifyContent: "flex-end",
                  }}
                >
                  <span style={{ fontSize: 9.5, fontWeight: 700, padding: "2px 4px",
                                 // 칸이 진해지면 흰 글자로 뒤집는다. 아니면 숫자가 묻힌다.
                                 color: strength > 0.45 ? C.card : row ? C.ink : C.disabled }}>
                    {d}
                  </span>
                  {inWindow && (
                    <span aria-hidden style={{ position: "absolute", left: 3, bottom: 3,
                                               width: 4, height: 4, borderRadius: "50%",
                                               background: strength > 0.45 ? C.card : C.blue }} />
                  )}
                </button>
              );
            })}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 9.5,
                        color: C.faint, flexWrap: "wrap" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: C.blue }} /> 더 샀다
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: C.inkSoft }} /> 더 팔았다
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 4, height: 4, borderRadius: "50%", background: C.blue }} /> 구간
            </span>
          </div>
        </div>

        {/* ── 오른쪽 두 칸: 고른 날 + 매매를 바꾸는 것들 ── */}
        <div style={{ flex: "2 1 580px", minWidth: 0, display: "flex",
                      flexDirection: "column", gap: 12 }}>
          {/* 그달에 걸치는 구간 띠. 구글 캘린더의 종일 일정 자리다. */}
          {windows.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {windows.map((w) => (
                <div key={w.key}
                     style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5,
                              background: C.blueTint, borderRadius: R.control, padding: "5px 9px" }}>
                  <Icon name="event_repeat" style={{ fontSize: 14, color: C.blue }} />
                  <b style={{ color: C.ink }}>{w.label}</b>
                  <span style={{ color: C.sub2 }}>{w.fromDay}일~{w.toDay}일 · {w.note}</span>
                  <span style={{ marginLeft: "auto", color: C.faint, flexShrink: 0 }}>표본 {w.days}일</span>
                </div>
              ))}
            </div>
          )}

          {/* 고른 날 */}
          <div style={{ background: C.soft, borderRadius: R.control, padding: "12px 14px",
                        display: "flex", flexWrap: "wrap", gap: 14, alignItems: "baseline" }}>
            {day ? (
              <>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11.5, color: C.sub2, fontWeight: 600 }}>
                    {day.date} 결제{pickedWindow && <> · {pickedWindow.label}</>}
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: C.ink, lineHeight: 1.35,
                                wordBreak: "keep-all", marginTop: 2 }}>
                    <span style={{ color: day.net >= 0 ? C.blue : C.ink }}>{usd(Math.abs(day.net))}</span>
                    어치를 더 {day.net >= 0 ? "샀습니다" : "팔았습니다"}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 16, marginLeft: "auto", flexWrap: "wrap" }}>
                  {[
                    { k: "산 금액", v: usd(day.buy), n: `${cnt(day.buyCount)}번` },
                    { k: "판 금액", v: usd(day.sell), n: `${cnt(day.sellCount)}번` },
                    { k: "한 번 살 때", v: day.buyCount ? usd(day.buy / day.buyCount) : "—", n: "평균" },
                    { k: "이 달 순매수", v: usd(monthNet), n: `${monthDays.length}거래일` },
                  ].map((s) => (
                    <div key={s.k} style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                      <span style={{ fontSize: 10.5, color: C.sub2, fontWeight: 600 }}>{s.k}</span>
                      <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 800, color: C.ink }}>{s.v}</span>
                      <span style={{ fontSize: 10, color: C.faint }}>{s.n}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <span style={{ fontSize: 12.5, color: C.sub }}>날짜를 누르면 그날 매매를 봅니다.</span>
            )}
          </div>

          <EventsVsDates />
        </div>
      </div>

      <div className="hz-sheet-foot" style={{ fontSize: 12, color: C.sub }}>
        <span>
          결제일 기준이라 거래일보다 하루 늦습니다. 구간은 2015~2026 을 모아 잰 값이고,
          날짜 하나하나의 성향은 표본이 부족해 재지 않습니다.
        </span>
      </div>
    </section>
  );
}
