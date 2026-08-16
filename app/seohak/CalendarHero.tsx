"use client";

import { useMemo, useState } from "react";

import type { CalendarDay, SeohakCalendar } from "@/lib/seohak-calendar";
import { CALENDAR_WINDOWS, nextWindow, windowsInMonth } from "@/lib/seohak-windows";
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

/**
 * 이 카드의 **자**. 값을 손으로 적지 말고 여기서 고른다.
 *
 * ⚠️ 자가 없을 때 글자 크기가 **11가지**(9.5·10·10.5·11·11.5·12·12.5·13.5·14·16·20),
 * 간격이 9가지, 안쪽 여백이 5가지로 흩어져 있었다. 값 하나하나는 그럴듯한데 모아 놓으면
 * 규칙이 안 보여서 화면이 지저분해진다.
 *
 *   big  20   금액 큰 숫자
 *   head 13.5 소제목·강조 문장
 *   body 12   라벨·값·목록
 *   sub  11   보조 설명
 *   tiny 10   달력 날짜·요일·축·범례
 */
const T = { big: 20, head: 13.5, body: 12, sub: 11, tiny: 10 } as const;

/** "M/D" — 달력 안이라 연도는 군더더기다. */
const dayLabel = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8))}`;
/** 간격도 4의 배수 넷으로만. */
const S = { xs: 4, sm: 8, md: 12, lg: 16 } as const;
/** 모서리 셋 — 마크 2 · 달력 칸 4 · 상자 R.control. 그 밖의 값은 쓰지 않는다. */

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
   ⚠️⚠️ **네 판째다.** 막대 → 막대 → 문장 목록 → 지금. 앞의 셋이 전부 "뭔지 모르겠다"를
   받았다.

   ⭐ 이번에 안 것: 이 블록은 **부정 결과**였다. "넷을 재 봤는데 셋은 아무 차이가
   없었습니다" + 그대로 · 그대로 · 그대로. 부정 결과는 만든 사람에게나 흥미롭지
   **읽는 사람이 가져갈 게 없다.** 게다가 "재 봤는데"는 우리 얘기지 독자 얘기가 아니다.

   알맹이는 문장 하나뿐이었다 — "사건엔 안 움직이는데 연말엔 움직인다". 네 줄은 실험
   노트라 지운다. 근거 수치는 코드에 남아 있고(REACTIONS), 화면엔 결론만 낸다. */
function EventsVsDates({ onJump }: { onJump?: () => void }) {
  const yearend = CALENDAR_WINDOWS.find((w) => w.key === "yearend")!;
  const yearendPct = Math.round(Math.abs(yearend.sell - 1) * 100);

  return (
    <p style={{ margin: 0, paddingTop: S.md, borderTop: `1px solid ${C.line}`,
                fontSize: T.body, lineHeight: 1.6, color: C.sub, wordBreak: "keep-all" }}>
      나스닥이 급락해도, 환율이 뛰어도, 월급날이 와도{" "}
      <b style={{ color: C.ink }}>사고파는 양은 그대로</b>입니다. 정작 달라지는 건 날짜라,
      연말 마지막 주에는 파는 양이 <b style={{ color: C.ink }}>{yearendPct}%</b> 늘어납니다.{" "}
      {onJump && (
        <button type="button" onClick={onJump}
                style={{ border: "none", background: "none", padding: 0, cursor: "pointer",
                         font: "inherit", color: C.blue, fontWeight: 700,
                         textDecoration: "underline", textUnderlineOffset: 2 }}>
          그 달 보기
        </button>
      )}
    </p>
  );
}

/**
 * 이 카드의 **유일한 줄 꼴** — 라벨 · 보조 · 값.
 *
 * 누를 수 있는 줄(가장 많이 산 날)과 아닌 줄(산 금액)이 같은 모양이라야 눈이 규칙을
 * 잡는다. 누를 수 있으면 값에 밑줄만 들어간다.
 */
function Row({ k, n, v, on }: { k: string; n: string; v: string; on?: () => void }) {
  const body = (
    <>
      <span style={{ fontSize: T.body, color: C.sub }}>{k}</span>
      <span style={{ marginLeft: "auto", fontSize: T.tiny, color: C.faint }}>{n}</span>
      <b style={{ fontFamily: MONO, fontSize: T.body, color: C.ink, minWidth: 62,
                  textAlign: "right", textDecoration: on ? "underline" : "none",
                  textUnderlineOffset: 2 }}>{v}</b>
    </>
  );
  const style: React.CSSProperties = {
    display: "flex", alignItems: "baseline", gap: S.sm, width: "100%",
  };
  return on ? (
    <button type="button" onClick={on}
            style={{ ...style, border: "none", background: "none", padding: 0,
                     cursor: "pointer", font: "inherit" }}>
      {body}
    </button>
  ) : (
    <span style={style}>{body}</span>
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

  // 달을 바꾸면 그 달의 거래일 중 가장 크게 움직인 날로 선택을 옮긴다. 마지막 날을
  // 고르면 휴장 여파로 결제가 $1 뿐인 날에 착지하는 수가 있다(12-26 에서 실제로 그랬다).
  const jumpTo = (next: string) => {
    setMonth(next);
    const inNext = c.days.filter((d) => d.date.startsWith(next));
    // ⚠️ 구간이 있는 달로 갔으면 **구간 안에서** 고른다. 달 전체의 최대일을 집으면
    // 블프를 보러 갔는데 11/3 에 착지한다 — 정작 구간 밖이다.
    const wins = windowsInMonth(Number(next.slice(5)));
    const inWin = inNext.filter((d) => {
      const day = Number(d.date.slice(8));
      return wins.some((w) => day >= w.fromDay && day <= w.toDay);
    });
    const pick = (inWin.length ? inWin : inNext).reduce<CalendarDay | null>(
      (a, d) => (!a || Math.abs(d.net) > Math.abs(a.net) ? d : a),
      null,
    );
    if (pick) setPicked(pick.date);
  };
  const goMonth = (by: number) => {
    const next = shiftMonth(month, by);
    setMonth(next);
    const inNext = c.days.filter((d) => d.date.startsWith(next));
    if (inNext.length) setPicked(inNext[inNext.length - 1].date);
  };
  // 오늘 다음에 오는 구간. 구간 없는 달에서 이 화면의 값진 것을 지킨다.
  const ahead = useMemo(() => nextWindow(new Date(`${c.asOf}T00:00:00Z`)), [c.asOf]);
  /**
   * 그 구간을 **볼 수 있는** 달. 다음 블랙프라이데이는 2026-11 인데 그 달은 아직
   * 자료가 없어서, 눌러서 가면 달력이 텅 빈다. 받아 둔 구간 안에서 같은 달 중
   * 가장 최근 것으로 데려간다(지난해 11월).
   */
  const aheadSample = useMemo(() => {
    if (!ahead) return undefined;
    const mm = String(ahead.window.from[0]).padStart(2, "0");
    return [...new Set(c.days.map((d) => d.date.slice(0, 7)))]
      .filter((m) => m.endsWith(`-${mm}`))
      .sort()
      .pop();
  }, [ahead, c.days]);

  const cells: (number | null)[] = [
    ...Array.from({ length: meta.firstWeekday }, () => null),
    ...Array.from({ length: meta.length }, (_, i) => i + 1),
  ];
  while (cells.length % 7) cells.push(null);

  // ── 이 달의 이야기. 고른 날만 말하면 정작 '이 달이 어떤 달인가'가 화면에 없다.
  const monthDays = c.days.filter((d) => d.date.startsWith(month));
  const monthNet = monthDays.reduce((s, d) => s + d.net, 0);
  const monthBuy = monthDays.reduce((s, d) => s + d.buy, 0);
  const monthSell = monthDays.reduce((s, d) => s + d.sell, 0);
  const topBuy = monthDays.reduce<CalendarDay | null>((a, d) => (!a || d.net > a.net ? d : a), null);
  const topSell = monthDays.reduce<CalendarDay | null>((a, d) => (!a || d.net < a.net ? d : a), null);
  /** 받아 둔 구간 안에서 가장 최근 12월. '연말 보기'가 여기로 간다. */
  const decemberMonth = useMemo(() => {
    const months = [...new Set(c.days.map((d) => d.date.slice(0, 7)))].sort().reverse();
    return months.find((m) => m.endsWith("-12"));
  }, [c.days]);
  const jumpToDecember = () => {
    if (!decemberMonth) return;
    setMonth(decemberMonth);
    const inDec = c.days.filter((d) => d.date.startsWith(decemberMonth));
    // ⚠️ 구간의 **첫** 거래일을 고르면 안 된다. 12-26 은 성탄 휴장 여파로 결제가 $1
    // 뿐인 해가 있어서, 눌러 놓고 "$1 더 팔았습니다"가 뜬다. 구간 안에서 **가장 크게
    // 움직인 날**로 데려가야 오른쪽 칸이 그 구간의 이야기를 한다.
    const inWindow = inDec.filter((d) => Number(d.date.slice(8)) >= 26);
    const pick = (inWindow.length ? inWindow : inDec).reduce<CalendarDay | null>(
      (a, d) => (!a || Math.abs(d.net) > Math.abs(a.net) ? d : a),
      null,
    );
    if (pick) setPicked(pick.date);
  };

  return (
    <section className="hz-sheet">
      <SectionHead
        icon="calendar_month"
        title="해마다 되풀이되는 날들"
        desc="해마다 같은 때가 오면 더 사거나 더 팝니다. 칸은 그날 실제 매매입니다."
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
      <div style={{ display: "flex", flexWrap: "wrap", padding: "12px 18px 0", gap: S.lg }}>
        {/* ── 왼쪽 한 칸: 달력 ── */}
        <div style={{ flex: "1 1 290px", minWidth: 0, display: "flex",
                      flexDirection: "column", gap: S.sm }}>
          <div style={{ display: "flex", alignItems: "center", gap: S.xs }}>
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
                  <Icon name={by < 0 ? "chevron_left" : "chevron_right"} style={{ fontSize: T.big }} />
                </button>
              );
            })}
            <span style={{ fontSize: T.body, fontWeight: 800, color: C.ink, marginLeft: 2 }}>
              {meta.year}년 {meta.month}월
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: S.xs }}>
            {WEEKDAYS.map((w, i) => (
              <span key={w} style={{ fontSize: T.tiny, fontWeight: 700, textAlign: "center",
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
                  <span style={{ fontSize: T.tiny, fontWeight: 700, padding: "3px 4px",
                                 // 칸이 진해지면 흰 글자로 뒤집는다. 아니면 숫자가 묻힌다.
                                 color: strength > 0.45 ? C.card : row ? C.ink : C.disabled }}>
                    {d}
                  </span>
                  {/* 구간에 든 날. 4px 점은 너무 약해서 이 화면의 가장 값진 정보가
                      안 보였다 — 칸 아래에 굵은 밑줄로 바꾼다. 색은 잉크다(파랑을 쓰면
                      빨간 칸 위에서 "이 날은 판 날"로 읽힌다). */}
                  {inWindow && (
                    <span aria-hidden style={{ position: "absolute", left: 3, right: 3, bottom: 2,
                                               height: 2.5, borderRadius: 2,
                                               background: strength > 0.4 ? C.card : C.ink }} />
                  )}
                </button>
              );
            })}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: S.sm, fontSize: T.tiny,
                        color: C.faint, flexWrap: "wrap" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: S.xs }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: BUY }} /> 더 샀다
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: S.xs }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: SELL }} /> 더 팔았다
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: S.xs }}>
              <span style={{ width: 10, height: 2.5, borderRadius: 2, background: C.ink }} /> 해마다 오는 날
            </span>
            <span style={{ marginLeft: "auto", color: C.faint }}>국내 증권사를 거친 결제</span>
          </div>
        </div>

        {/* ── 오른쪽 두 칸: 고른 날 + 매매를 바꾸는 것들 ── */}
        <div style={{ flex: "2 1 580px", minWidth: 0, display: "flex",
                      flexDirection: "column", gap: S.md }}>
          {/* 그달에 걸치는 구간 띠. 구글 캘린더의 종일 일정 자리다.
              ⭐ 구간이 없는 달(1년 중 아홉 달)에는 **다음 구간까지 며칠**을 대신 띄운다.
              이 화면에서 다른 데서 못 얻는 유일한 정보가 구간인데, 그게 아홉 달 동안
              통째로 안 보이면 처음 온 사람은 값진 걸 못 보고 지나간다. */}
          {windows.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: S.xs }}>
              {windows.map((w) => (
                <div key={w.key}
                     style={{ display: "flex", alignItems: "center", gap: S.sm, fontSize: T.body,
                              background: C.blueTint, borderRadius: R.control, padding: "8px 12px",
                              wordBreak: "keep-all", flexWrap: "wrap" }}>
                  <Icon name="event_repeat" style={{ fontSize: T.head, color: C.blue }} />
                  <b style={{ color: C.ink }}>{w.label}</b>
                  <span style={{ color: C.sub2 }}>{w.fromDay}일~{w.toDay}일 · {w.note}</span>
                  <span style={{ marginLeft: "auto", color: C.faint, flexShrink: 0 }}>표본 {w.days}일</span>
                </div>
              ))}
            </div>
          ) : (
            ahead && (
              <button type="button" onClick={() => aheadSample && jumpTo(aheadSample)}
                      disabled={!aheadSample}
                      style={{ display: "flex", alignItems: "center", gap: S.sm, width: "100%",
                               fontSize: T.body, background: C.blueTint, borderRadius: R.control,
                               padding: "8px 12px", wordBreak: "keep-all",
                               flexWrap: "wrap", border: "none", cursor: "pointer",
                               font: "inherit", textAlign: "left" }}>
                <Icon name="event_upcoming" style={{ fontSize: T.head, color: C.blue, flexShrink: 0 }} />
                <b style={{ color: C.ink }}>{ahead.window.label}</b>
                <span style={{ color: C.sub2 }}>· {ahead.window.note}</span>
                <span style={{ marginLeft: "auto", flexShrink: 0, display: "inline-flex",
                               alignItems: "baseline", gap: S.sm }}>
                  <b style={{ color: C.blue }}>{ahead.days}일 뒤</b>
                  {aheadSample && (
                    <span style={{ color: C.sub2 }}>
                      {aheadSample.slice(0, 4)}년 보기 →
                    </span>
                  )}
                </span>
              </button>
            )
          )}

          {/* 이 달 · 고른 날 — 두 칸.
              ⚠️ 두 상자가 **줄 꼴이 서로 달랐다.** 어떤 줄은 '라벨·값', 어떤 줄은
              '라벨·날짜·값', 어떤 줄은 각주였다. 값 하나하나는 그럴듯한데 나란히 두면
              규칙이 안 보여 지저분해진다. 지금은 **한 가지 줄 꼴**(라벨 · 보조 · 값)만
              쓰고, 그 줄을 만드는 자리도 `Row` 하나뿐이다. */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: S.sm }}>
            {[
              {
                head: `이 달 · ${monthDays.length}거래일`,
                amount: monthNet,
                rows: [
                  { k: "산 금액", n: "", v: usd(monthBuy) },
                  { k: "판 금액", n: "", v: usd(monthSell) },
                  // ⚠️ 위 두 줄은 **총액**이고 이 두 줄은 **차액**이다. 같은 칸에 부호
                  // 없이 나란히 두면 같은 종류로 읽혀서 $739M 을 $10.16B 와 견주게 된다.
                  // 부호를 붙여 "차이"임을 형태로 알린다.
                  topBuy && {
                    k: "가장 많이 산 날", n: dayLabel(topBuy.date), v: `+${usd(Math.abs(topBuy.net))}`,
                    on: () => setPicked(topBuy.date),
                  },
                  topSell && {
                    k: "가장 많이 판 날", n: dayLabel(topSell.date), v: `−${usd(Math.abs(topSell.net))}`,
                    on: () => setPicked(topSell.date),
                  },
                ],
              },
              day && {
                head: `고른 날 · ${day.date}${pickedWindow ? ` · ${pickedWindow.label}` : ""}`,
                amount: day.net,
                rows: [
                  { k: "산 금액", n: `${cnt(day.buyCount)}번`, v: usd(day.buy) },
                  { k: "판 금액", n: `${cnt(day.sellCount)}번`, v: usd(day.sell) },
                  { k: "한 번 살 때", n: "평균",
                    v: day.buyCount ? usd(day.buy / day.buyCount) : "—" },
                ],
              },
            ]
              .filter(Boolean)
              .map((box) => {
                const b = box as {
                  head: string; amount: number;
                  rows: ({ k: string; n: string; v: string; on?: () => void } | null | undefined)[];
                };
                return (
                  <div key={b.head} style={{ flex: "1 1 min(240px, 100%)", minWidth: 0,
                                             background: C.soft, borderRadius: R.control,
                                             padding: "12px 12px", display: "flex",
                                             flexDirection: "column", gap: S.sm }}>
                    <span style={{ fontSize: T.body, color: C.sub2, fontWeight: 600 }}>{b.head}</span>
                    <span style={{ display: "flex", alignItems: "baseline", gap: S.sm, flexWrap: "wrap" }}>
                      <b style={{ fontFamily: MONO, fontSize: T.big, fontWeight: 800,
                                  color: b.amount >= 0 ? BUY : SELL, letterSpacing: "-0.02em" }}>
                        {usd(Math.abs(b.amount))}
                      </b>
                      <span style={{ fontSize: T.body, color: C.sub }}>
                        더 {b.amount >= 0 ? "샀습니다" : "팔았습니다"}
                      </span>
                    </span>
                    <ul style={{ listStyle: "none", margin: 0, padding: "8px 0 0", display: "flex",
                                 flexDirection: "column", gap: S.xs,
                                 borderTop: `1px solid ${C.line}` }}>
                      {b.rows.filter(Boolean).map((r) => (
                        <li key={r!.k}>
                          <Row {...r!} />
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
          </div>

          <EventsVsDates onJump={decemberMonth ? jumpToDecember : undefined} />
        </div>
      </div>

    </section>
  );
}
