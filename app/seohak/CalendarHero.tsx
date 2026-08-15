"use client";

import { useMemo, useState } from "react";

import type { CalendarDay, SeohakCalendar } from "@/lib/seohak-calendar";
import { windowsInMonth } from "@/lib/seohak-windows";
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
        desc="날짜 칸은 그날 실제 결제된 순매수입니다. 위 띠는 해마다 되풀이되는 구간입니다."
        note={`${meta.year}년 ${meta.month}월`}
      />

      <div style={{ padding: "12px 18px 0", display: "flex", alignItems: "center",
                    justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
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
                  width: 28, height: 28, borderRadius: R.control, border: `1px solid ${C.line}`,
                  background: C.card, color: disabled ? C.disabled : C.sub,
                  cursor: disabled ? "default" : "pointer",
                }}
              >
                <Icon name={by < 0 ? "chevron_left" : "chevron_right"} style={{ fontSize: 18 }} />
              </button>
            );
          })}
          <span style={{ fontSize: 13, fontWeight: 800, color: C.ink, marginLeft: 2 }}>
            {meta.year}년 {meta.month}월
          </span>
        </div>
        <span style={{ fontSize: 12, color: C.sub }}>
          이 달 순매수{" "}
          <b style={{ fontFamily: MONO, color: monthNet >= 0 ? C.blue : C.ink }}>{usd(monthNet)}</b>
        </span>
      </div>

      {/* ── 종일 일정 자리: 그달에 걸치는 구간 띠 ── */}
      {windows.length > 0 && (
        <div style={{ padding: "10px 18px 0", display: "flex", flexDirection: "column", gap: 4 }}>
          {windows.map((w) => (
            <div key={w.key}
                 style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5,
                          background: C.blueTint, borderRadius: R.control, padding: "5px 9px" }}>
              <Icon name="event_repeat" style={{ fontSize: 14, color: C.blue }} />
              <b style={{ color: C.ink }}>{w.label}</b>
              <span style={{ color: C.sub2 }}>
                {w.fromDay}일~{w.toDay}일 · {w.note}
              </span>
              <span style={{ marginLeft: "auto", color: C.faint, flexShrink: 0 }}>
                표본 {w.days}일
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── 날짜 격자 ── */}
      <div style={{ padding: "12px 18px 0" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
          {WEEKDAYS.map((w, i) => (
            <span key={w} style={{ fontSize: 10.5, fontWeight: 700, textAlign: "center",
                                   paddingBottom: 2,
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
                  position: "relative", aspectRatio: "1 / 0.78", minHeight: 34,
                  // 빈 칸에 테두리를 두면 달의 절반이 '빈 상자밭'이 된다(결제는 T+1 이라
                  // 이 달의 남은 날은 아직 자료가 없다). 아주 옅은 바탕으로만 자리를 표시한다.
                  border: isPicked ? `2px solid ${C.ink}` : "2px solid transparent",
                  borderRadius: R.control, background: bg, padding: 0,
                  cursor: row ? "pointer" : "default",
                  display: "flex", alignItems: "flex-start", justifyContent: "flex-end",
                }}
              >
                <span style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 5px",
                               // 칸이 진해지면 흰 글자로 뒤집는다. 아니면 숫자가 묻힌다.
                               color: strength > 0.45 ? C.card : row ? C.ink : C.disabled }}>
                  {d}
                </span>
                {inWindow && (
                  <span aria-hidden style={{ position: "absolute", left: 4, bottom: 4,
                                             width: 5, height: 5, borderRadius: "50%",
                                             background: strength > 0.45 ? C.card : C.blue }} />
                )}
              </button>
            );
          })}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, paddingTop: 8,
                      fontSize: 10.5, color: C.faint, flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: C.blue }} /> 더 샀다
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: C.inkSoft }} /> 더 팔았다
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: C.blue }} /> 되풀이되는 구간
          </span>
          <span style={{ marginLeft: "auto" }}>진할수록 금액이 큽니다 · 빈 칸은 휴장</span>
        </div>
      </div>

      {/* ── 클릭한 날 ── */}
      <div style={{ margin: "14px 18px 0", padding: "12px 14px", background: C.soft,
                    borderRadius: R.control }}>
        {day ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "baseline" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11.5, color: C.sub2, fontWeight: 600 }}>{day.date} 결제</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: C.ink, wordBreak: "keep-all" }}>
                {day.net >= 0 ? (
                  <>
                    <span style={{ color: C.blue }}>{usd(day.net)}</span>어치를 더 샀습니다
                  </>
                ) : (
                  <>
                    <span style={{ color: C.ink }}>{usd(-day.net)}</span>어치를 더 팔았습니다
                  </>
                )}
              </div>
            </div>
            <div style={{ display: "flex", gap: 16, marginLeft: "auto", flexWrap: "wrap" }}>
              {[
                { k: "산 금액", v: usd(day.buy), n: `${cnt(day.buyCount)}번` },
                { k: "판 금액", v: usd(day.sell), n: `${cnt(day.sellCount)}번` },
                {
                  k: "한 번 살 때",
                  v: day.buyCount ? usd(day.buy / day.buyCount) : "—",
                  n: "평균",
                },
              ].map((s) => (
                <div key={s.k} style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  <span style={{ fontSize: 10.5, color: C.sub2, fontWeight: 600 }}>{s.k}</span>
                  <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 800, color: C.ink }}>
                    {s.v}
                  </span>
                  <span style={{ fontSize: 10, color: C.faint }}>{s.n}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <span style={{ fontSize: 12.5, color: C.sub }}>날짜를 누르면 그날 매매를 봅니다.</span>
        )}
      </div>

      <div className="hz-sheet-foot" style={{ fontSize: 12, color: C.sub }}>
        <span>
          결제일 기준이라 거래일보다 하루 늦습니다. 띠의 구간은 2015~2026 을 모아 잰 값이고,
          날짜 하나하나의 성향은 표본이 부족해 재지 않습니다.
        </span>
      </div>
    </section>
  );
}
