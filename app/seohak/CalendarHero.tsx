"use client";

import { useMemo, useState } from "react";

import type { CalendarDay, SeohakCalendar } from "@/lib/seohak-calendar";
import { CALENDAR_WINDOWS, REACTIONS, windowsInMonth } from "@/lib/seohak-windows";
import { SectionHead } from "../kadera/SectionHead";
import { BUY, SELL } from "./tone";
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
   ⚠️⚠️ **세 번째 판이다. 앞의 둘은 막대였고 둘 다 "무슨 말인지 모르겠다"를 받았다.**

   원인은 스타일이 아니라 형태였다. 이 데이터는 '다섯 개의 값'이 아니라 **"넷을
   의심해서 재 봤는데 아니었다"는 결과**다. 값이 거의 0인 것 넷을 막대로 그리면
   아무리 잘 그려도 안 읽힌다 — 없는 것을 막대로는 못 보여준다.

   게다가 "8% 달라짐"이 **무엇이** 달라졌다는 건지 화면에 없었다. 매매량인지 순매수인지
   매수인지 매도인지. 조건("나스닥 −2% 이하")도 조건인지 대상인지 모호했다.

   그래서 막대를 버리고 문장으로 쓴다. 가설 넷과 그 결과를 줄로 세우고, 마지막에
   "정작 달라지는 건 날짜"로 위 달력을 가리킨다. 이 층이 달력 안에 있는 이유가 그거다. */
function EventsVsDates() {
  const yearend = CALENDAR_WINDOWS.find((w) => w.key === "yearend")!;
  /** 이 밖으로 나가야 '달라졌다'고 본다. 20영업일 창의 날짜별 흔들림이 이 폭이다. */
  const NOISE = 5;

  const rows = REACTIONS.map((r) => {
    // 매수·매도 중 더 크게 움직인 쪽만 말한다. 순매수로 뭉치면 둘이 서로 상쇄해
    // "떨어질 때 산다"는 없는 결론이 나온다.
    const sides: { side: "사는" | "파는"; v: number }[] = [];
    if (r.buy !== null) sides.push({ side: "사는", v: r.buy });
    if (r.sell !== null) sides.push({ side: "파는", v: r.sell });
    const top = sides.length
      ? sides.reduce((a, b) => (Math.abs(b.v - 1) > Math.abs(a.v - 1) ? b : a))
      : null;
    const pct = top ? Math.round(Math.abs(top.v - 1) * 100) : 0;
    return {
      label: r.label,
      changed: pct > NOISE,
      // 무엇이 얼마나 달라졌는지를 문장 그대로 쓴다. 숫자만 두면 "8% 달라짐"이 된다.
      // 다른 것을 재는 줄은 자기 결론(verdict)을 들고 있다.
      result:
        "verdict" in r && r.verdict
          ? r.verdict
          : top && pct > NOISE
            ? `${top.side} 양만 ${pct}% ${top.v > 1 ? "늘어납니다" : "줄어듭니다"}`
            : "사고파는 양 그대로",
    };
  });
  // 읽는 사람이 "다 그대로네"를 먼저 보게 안 달라진 것부터 세운다.
  rows.sort((a, b) => Number(a.changed) - Number(b.changed));
  const quiet = rows.filter((r) => !r.changed).length;
  // "넷을 재 봤는데 3개는" 처럼 세는 말이 섞이면 읽다가 걸린다. 작은 수는 우리말로.
  const KO = ["", "하나", "둘", "셋", "넷", "다섯"];
  const koCount = (n: number) => KO[n] ?? String(n);
  const yearendPct = Math.round(Math.abs(yearend.sell - 1) * 100);

  return (
    <div style={{ paddingTop: 12, borderTop: `1px solid ${C.line}` }}>
      <p style={{ margin: 0, fontSize: 13.5, fontWeight: 800, color: C.ink, lineHeight: 1.45,
                  wordBreak: "keep-all" }}>
        매매를 바꾸는 게 뭔지 {koCount(rows.length)}을 재 봤는데,{" "}
        {quiet === rows.length ? "전부" : `${koCount(quiet)}은`}{" "}
        <span style={{ color: C.blue }}>아무 차이가 없었습니다</span>
      </p>

      <ul style={{ listStyle: "none", margin: "9px 0 0", padding: 0, display: "flex",
                   flexDirection: "column", gap: 6 }}>
        {rows.map((r) => (
          <li key={r.label}
              style={{ display: "flex", alignItems: "baseline", gap: 10, fontSize: 12,
                       paddingBottom: 6, borderBottom: `1px solid ${C.sheetRow}` }}>
            <span style={{ color: C.label, minWidth: 0, flex: 1 }}>{r.label}</span>
            <span style={{ flexShrink: 0, fontWeight: r.changed ? 800 : 600,
                           color: r.changed ? C.ink : C.faint }}>
              {r.result}
            </span>
          </li>
        ))}
      </ul>

      <p style={{ margin: "10px 0 0", fontSize: 12.5, lineHeight: 1.55, color: C.sub,
                  wordBreak: "keep-all" }}>
        정작 크게 달라지는 건 사건이 아니라 <b style={{ color: C.ink }}>날짜</b>입니다 — 연말
        마지막 주에는 파는 양이 <b style={{ color: C.ink }}>{yearendPct}%</b> 늘어납니다.
        위 달력에서 12월로 넘겨 보세요.
      </p>
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
        desc="국내 증권사를 거쳐 그날 결제된 순매수입니다. 오른쪽은 고른 날과, 매매를 바꾸는 것들입니다."
        note={`${meta.year}년 ${meta.month}월`}
        /* 원래 시트 바닥에 네 줄짜리 각주로 있었다. 중요한 단서인데 그 길이로 깔려
           있으니 시트 전체의 가독성을 깎았다 — 읽는 사람은 매번 넘기고, 정작 필요할
           때는 못 찾는다. 제목 옆 물음표로 옮겨 **찾을 때만 열리게** 한다.
           ⚠️ 핵심 한정("국내 증권사를 거쳐")은 툴팁에 숨기지 않고 위 desc 에 남긴다 —
           툴팁은 hover 라 모바일에서 안 열린다. */
        noteHelp="예탁결제원을 거친 매매만 잡힙니다. 글로벌 수탁은행을 직접 쓰는 대형 기관이 빠져서, 미 재무부가 집계한 한국의 순매수보다 늘 작습니다(연간 20~71%). 결제일 기준이라 거래일보다 하루 늦고, 아래 구간은 2015~2026 을 모아 잰 값입니다."
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
              // 빨강이 사는 쪽, 파랑이 파는 쪽 — 국내 관행이다(app/seohak/tone.ts).
              // 두 색을 같은 식으로 섞는다. 앞서 회색 쪽만 62%로 눌러 뒀는데, 색이
              // 갈리는 지금은 한쪽만 약하면 '판 날이 늘 조용한' 것처럼 보인다.
              const bg = !row
                ? C.soft
                : `color-mix(in srgb, ${row.net >= 0 ? BUY : SELL} ${16 + strength * 74}%, ${C.card})`;
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
                  {/* 구간 점. 이제 파랑이 '판다'는 뜻을 가지므로 점은 잉크색으로 뺀다 —
                      파랑 점을 빨간 칸에 찍으면 "이 날은 판 날"로 읽힌다. */}
                  {inWindow && (
                    <span aria-hidden style={{ position: "absolute", left: 3, bottom: 3,
                                               width: 4, height: 4, borderRadius: "50%",
                                               background: strength > 0.4 ? C.card : C.ink }} />
                  )}
                </button>
              );
            })}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 9.5,
                        color: C.faint, flexWrap: "wrap" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: BUY }} /> 더 샀다
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: SELL }} /> 더 팔았다
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 4, height: 4, borderRadius: "50%", background: C.ink }} /> 구간
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
                    <span style={{ color: day.net >= 0 ? BUY : SELL }}>{usd(Math.abs(day.net))}</span>
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

    </section>
  );
}
