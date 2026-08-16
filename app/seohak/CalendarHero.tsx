"use client";

import { useMemo, useState } from "react";

import type { CalendarDay, SeohakCalendar } from "@/lib/seohak-calendar";
import { CALENDAR_WINDOWS, CHANCE_BASELINE, windowDates, windowsInMonth } from "@/lib/seohak-windows";
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
 *   body 12   라벨·값·목록
 *   tiny 10   달력 날짜·요일·구간 띠·보조·범례
 *
 * ⭐ 처음엔 다섯이었다(13.5 소제목 · 11 보조를 더 뒀다). 조판을 정리하고 나니 그 둘을
 * 쓰는 자리가 하나도 안 남았다 — **자에 눈금이 있으면 언젠가 누가 쓴다.** 안 쓰는 눈금은
 * 지운다. 시트 머리(18·14·12.5)는 `SectionHead` 것이라 여기 자가 아니다.
 */
const T = { big: 20, body: 12, tiny: 10 } as const;

/** "M/D" — 달력 안이라 연도는 군더더기다. */
const dayLabel = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8))}`;
/** "YYYY/M/D" — 32년을 오가는 줄에는 연도가 있어야 한다. 구분자는 `dayLabel` 과 맞춘다. */
const fullLabel = (date: string) => `${date.slice(0, 4)}/${dayLabel(date)}`;
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
    <button type="button" onClick={on} className="hz-jump"
            style={{ ...style, border: "none", cursor: "pointer", font: "inherit" }}>
      {body}
    </button>
  ) : (
    <span style={style}>{body}</span>
  );
}

type RowSpec = { k: string; n: string; v: string; on?: () => void };

/**
 * 되풀이되는 때 한 줄 — 이름 · 문장 · 몇 번 중 몇 번.
 *
 * ⭐ 값을 `−19%` 가 아니라 **"평소보다 19% 덜 삽니다"** 로 낸다. 부호를 말로 풀면
 * 방향을 되짚을 일이 없다. 그리고 진짜 값은 % 가 아니라 **횟수**다 — 17번 중 16번과
 * 17번 중 12번은 같은 −33% 라도 전혀 다른 이야기다. 그래서 횟수를 크게 둔다.
 */
function WindowRow({ w, onJump }: { w: (typeof CALENDAR_WINDOWS)[number]; onJump: () => void }) {
  // 우연 기준선(17번 중 11번)을 넘어야 잉크를 준다. 아래면 흐리게 둬서 눈이 안 멈춘다.
  const strong = w.hit / w.of >= 0.85;
  return (
    <button type="button" onClick={onJump} className="hz-jump"
            style={{ display: "flex", flexDirection: "column", gap: 2, width: "100%",
                     border: "none", cursor: "pointer", font: "inherit", textAlign: "left" }}>
      <span style={{ display: "flex", alignItems: "baseline", gap: S.sm, width: "100%" }}>
        <b style={{ fontSize: T.body, color: C.ink }}>{w.label}</b>
        <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: T.tiny,
                       color: C.faint, flexShrink: 0 }}>
          {w.of}번 중 <b style={{ color: strong ? C.ink : C.sub2 }}>{w.hit}번</b>
        </span>
      </span>
      <span style={{ fontSize: T.body, color: C.sub }}>{w.phrase}</span>
    </button>
  );
}

/** 제목 한 줄 + 그 아래 줄 목록. 이 카드에서 줄이 모이는 자리는 전부 이 꼴이다. */
function Group({ head, rows }: { head?: string; rows: (RowSpec | null | undefined | false)[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S.sm }}>
      {head && <span style={{ fontSize: T.body, color: C.sub2, fontWeight: 600 }}>{head}</span>}
      <ul style={{ listStyle: "none", margin: 0, padding: "8px 0 0", display: "flex",
                   flexDirection: "column", gap: S.xs, borderTop: `1px solid ${C.line}` }}>
        {rows.filter(Boolean).map((r) => (
          <li key={(r as RowSpec).k}>
            <Row {...(r as RowSpec)} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 세 상자가 공유하는 껍데기. 옅은 바닥과 여백이 여기 한 곳에만 적혀 있다. */
function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ flex: 1, minWidth: 0, background: C.soft, borderRadius: R.control, padding: 12,
                  display: "flex", flexDirection: "column", gap: S.md }}>
      {children}
    </div>
  );
}

/**
 * '얼마' 상자 — 제목 · 큰 금액 · 줄 목록. 이 달과 고른 날이 이 꼴을 쓴다.
 *
 * ⚠️ 오른쪽 역대 카드는 **일부러 이 꼴이 아니다.** 저건 재는 값이 아니라 찾아보는
 * 목록이라 큰 숫자가 없다. 앞서 들은 지적("크기도 제각각")은 **뜻 없는 차이**에 대한
 * 것이었다 — 종류가 다르면 달라야 하고, 종류가 같으면(이 달·고른 날) 같아야 한다.
 */
function Box({ head, amount, rows }: {
  head: string; amount: number; rows: (RowSpec | null | undefined | false)[];
}) {
  return (
    <Card>
      <div style={{ display: "flex", flexDirection: "column", gap: S.sm }}>
        <span style={{ fontSize: T.body, color: C.sub2, fontWeight: 600 }}>{head}</span>
        <span style={{ display: "flex", alignItems: "baseline", gap: S.sm, flexWrap: "wrap" }}>
          <b style={{ fontFamily: MONO, fontSize: T.big, fontWeight: 800,
                      color: amount >= 0 ? BUY : SELL, letterSpacing: "-0.02em" }}>
            {usd(Math.abs(amount))}
          </b>
          <span style={{ fontSize: T.body, color: C.sub }}>
            더 {amount >= 0 ? "샀습니다" : "팔았습니다"}
          </span>
        </span>
      </div>
      <Group rows={rows} />
    </Card>
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

  /**
   * 창이 걸치는 실제 결제일. **고정 날짜가 아니라 결제일 순서로** 잡는다 — 블랙프라이데이는
   * 해마다 11/23~29 를 오가고, 연말·새해 직후는 휴장이 며칠이냐에 따라 밀린다.
   */
  const marks = useMemo(() => windowDates(c.days.map((d) => d.date)), [c.days]);
  const markedDays = useMemo(
    () => new Set([...marks.values()].flatMap((s) => [...s])),
    [marks],
  );

  const meta = monthMeta(month);
  const windows = windowsInMonth(month, marks);
  const day = byDate.get(picked);
  // 선택한 날이 어느 구간에 드는지. 오른쪽 칸이 "이 날은 ~에 듭니다"로 쓴다.
  const pickedWindow = CALENDAR_WINDOWS.find((w) => marks.get(w.key)!.has(picked));

  /**
   * 그 창이 가장 최근에 있었던 자리로 간다.
   *
   * ⚠️ **마지막 날이 아니라 첫날의 달**로 가야 한다. 블랙프라이데이 직후 사흘은 11월 말에
   * 시작해 12월 초로 넘어가는 해가 있어서, 마지막 날을 집으면 블프를 보러 갔는데 달력이
   * 12월을 편다.
   */
  const jumpToWindow = (key: string) => {
    const days = [...marks.get(key)!].sort();
    if (!days.length) return;
    const year = days.at(-1)!.slice(0, 4);
    const last = days.filter((d) => d.slice(0, 4) === year);
    const month = last[0].slice(0, 7);
    setMonth(month);
    // 그 창 안에서 가장 크게 움직인 날. 첫날을 집으면 휴장 여파로 $1 짜리에 앉는 수가 있다.
    const inWin = c.days.filter((d) => last.includes(d.date));
    const pick = inWin.reduce<CalendarDay | null>(
      (a, d) => (!a || Math.abs(d.net) > Math.abs(a.net) ? d : a), null);
    setPicked(pick ? pick.date : last[0]);
  };

  /**
   * 기록 줄을 눌렀을 때 달력을 그 날로 옮기는 손잡이. **받아 둔 24개월 안일 때만** 준다.
   *
   * 32년 기록이라 1994년처럼 달력이 못 가는 날이 섞인다. 그런 줄은 버튼이 아니라
   * 그냥 글로 남는다(밑줄이 없어져서 눌러도 되는지 손이 먼저 안다). 32년치를 다 실어
   * 어디든 가게도 해 봤는데, 열 배열로 눌러도 브로틀리 82KB 라(지금 16.5KB) 접었다.
   */
  const jumpable = (date: string) =>
    byDate.has(date)
      ? () => {
          setMonth(date.slice(0, 7));
          setPicked(date);
        }
      : undefined;

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

  // ── 이 달의 이야기. 고른 날만 말하면 정작 '이 달이 어떤 달인가'가 화면에 없다.
  const monthDays = c.days.filter((d) => d.date.startsWith(month));
  const monthNet = monthDays.reduce((s, d) => s + d.net, 0);
  const monthBuy = monthDays.reduce((s, d) => s + d.buy, 0);
  const monthSell = monthDays.reduce((s, d) => s + d.sell, 0);
  const topBuy = monthDays.reduce<CalendarDay | null>((a, d) => (!a || d.net > a.net ? d : a), null);
  const topSell = monthDays.reduce<CalendarDay | null>((a, d) => (!a || d.net < a.net ? d : a), null);
  return (
    <section className="hz-sheet">
      <SectionHead
        icon="calendar_month"
        title="역사는 반복된다"
        desc="서학개미들의 행동패턴입니다. 사고파는 건수는 늘 그대로고, 해마다 같은 때가 오면 한 번에 넣는 금액이 달라집니다."
        note={`${c.asOf} 기준`}
        /* 원래 시트 바닥에 네 줄짜리 각주였고, 그다음엔 여기 툴팁에 세 문장이 들어갔다.
           둘 다 길어서 안 읽힌다. 툴팁은 **한 문장이 넘으면 툴팁이 아니다** — 열어 놓고
           읽어야 하는 순간 각주로 돌아간 것이다.
           ⭐ 세 문장 중 남길 건 하나뿐이었다. 결제일 하루 지연과 구간 표본 기간은
           화면에 이미 있거나(달력 날짜 · 카드) 읽는 데 걸림돌이 아니다. 대형 기관이
           빠진다는 것만 숫자를 바꿔 읽게 만든다. */
        noteHelp="국내 증권사를 거친 결제만 잡혀서, 수탁은행을 직접 쓰는 대형 기관은 빠져 있습니다."
      />

      {/* 달력 1칸 · 설명 2칸.
          처음엔 반대(달력 2칸)로 뒀는데 달력만 커 보였다. 달력은 '어느 날을 고를까'를
          묻는 손잡이라 작아도 되고, 정작 읽을 것은 고른 날의 내용이다. 반응 스트립도
          아래 별도 줄에서 오른쪽으로 들여 세로를 줄였다. */}
      <div style={{ display: "flex", flexWrap: "wrap", padding: "12px 22px 18px", gap: S.lg }}>
        {/* ── 왼쪽 한 칸: 달력 ── */}
        <div style={{ flex: "1 1 250px", minWidth: 0, display: "flex",
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

          {/* 그달에 걸치는 구간. 구글 캘린더의 종일 일정처럼 격자 **바로 위**에 둔다.
              ⭐ 앞서 오른쪽 칸에 파란 띠로 크게 뒀는데, 이제 오른쪽 카드가 구간 넷을
              항상 다 보여 준다. 여기 남길 몫은 "이 달 어느 날에 밑줄이 그어졌나"뿐이라
              칸 안의 밑줄 마크를 그대로 앞에 달아 말없이 잇는다 — 범례가 따로 필요 없다. */}
          {windows.map((w) => (
            <span key={w.key}
                  style={{ display: "flex", alignItems: "center", gap: S.xs,
                           fontSize: T.tiny, color: C.sub2, minWidth: 0 }}>
              <span aria-hidden style={{ width: 10, height: 2.5, borderRadius: 2,
                                         background: C.ink, flexShrink: 0 }} />
              <b style={{ color: C.ink, fontWeight: 700 }}>{w.label}</b>
              {/* 어느 칸에 밑줄이 그어졌는지. 창이 결제일로 잡혀 있어 달을 넘나드는 해가
                  있다(2025년 블프 직후 사흘은 12/1~3 이다 — 11/28 에 결제가 없다).
                  날짜를 안 적으면 "블랙프라이데이인데 왜 12월?"이 남는다. */}
              <span style={{ color: C.faint }}>
                {Number(w.days[0].slice(8))}
                {w.days.length > 1 && `~${Number(w.days.at(-1)!.slice(8))}`}일
              </span>
            </span>
          ))}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: S.xs }}>
            {WEEKDAYS.map((w, i) => (
              <span key={w} style={{ fontSize: T.tiny, fontWeight: 700, textAlign: "center",
                                     color: i === 0 || i === 6 ? C.faint : C.sub2 }}>{w}</span>
            ))}
            {cells.map((d, i) => {
              if (d === null) return <span key={`b${i}`} />;
              const date = `${month}-${String(d).padStart(2, "0")}`;
              const row = byDate.get(date);
              const inWindow = markedDays.has(date);
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
                    position: "relative",
                    /* ⚠️ 높이를 못박으면 폭이 바뀔 때 칸이 납작해진다. 1,180px 아래에서는
                       세 칸이 줄바꿈돼 달력이 시트 폭 전체를 쓰는데, 그때 칸이 80×40
                       (2:1)이 되어 달력이 아니라 막대밭으로 보였다. 비율로 두고 위아래만
                       막는다 — 세 칸일 때 49×36, 줄바꿈됐을 때 75×46 이다. */
                    aspectRatio: "1.35", minHeight: 34, maxHeight: 46,
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
          </div>
        </div>

        {/* ── 오른쪽 두 칸: 고른 날 + 매매를 바꾸는 것들 ── */}
        <div style={{ flex: "2 1 500px", minWidth: 0, display: "flex",
                      flexDirection: "column", gap: S.md }}>
          {/* 이 달 · 고른 날 — 두 칸.
              ⚠️ 두 상자가 **줄 꼴이 서로 달랐다.** 어떤 줄은 '라벨·값', 어떤 줄은
              '라벨·날짜·값', 어떤 줄은 각주였다. 값 하나하나는 그럴듯한데 나란히 두면
              규칙이 안 보여 지저분해진다. 지금은 **한 가지 줄 꼴**(라벨 · 보조 · 값)만
              쓰고, 그 줄을 만드는 자리도 `Row` 하나뿐이다. */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: S.sm, alignItems: "flex-start" }}>
            {/* 왼쪽 칸 — 이 달 위, 고른 날 아래. 둘은 '지금 보고 있는 것'이라 한 묶음이다. */}
            <div style={{ flex: "1 1 min(240px, 100%)", minWidth: 0, display: "flex",
                          flexDirection: "column", gap: S.sm }}>
              <Box
                head={`이 달 · ${monthDays.length}거래일`}
                amount={monthNet}
                rows={[
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
                ]}
              />
              {day && (
                <Box
                  head={`고른 날 · ${day.date}${pickedWindow ? ` · ${pickedWindow.label}` : ""}`}
                  amount={day.net}
                  rows={[
                    { k: "산 금액", n: `${cnt(day.buyCount)}번`, v: usd(day.buy) },
                    { k: "판 금액", n: `${cnt(day.sellCount)}번`, v: usd(day.sell) },
                    { k: "한 번 살 때", n: "평균",
                      v: day.buyCount ? usd(day.buy / day.buyCount) : "—" },
                  ]}
                />
              )}
            </div>

            {/* 오른쪽 칸 — 32년 기록.
                ⭐ 왼쪽 두 상자와 **줄 라벨을 일부러 겹쳐 뒀다**('가장 많이 산 날'·'가장
                많이 판 날'). 같은 말이 이 달과 32년에 나란히 있어야 지금이 어느 만큼인지
                한눈에 잡힌다. 그래서 이 칸도 왼쪽과 같은 순매수를 쓴다 — 여기만 총액으로
                재면 같은 라벨이 다른 뜻이 된다.
                ⚠️ '가장 바빴던 날'의 값만 금액이 아니라 횟수다. 단위(번)가 달라 금액과
                섞여 읽힐 일이 없어서 이 줄만 예외로 둔다. */}
            {c.records && (
              <div style={{ flex: "1 1 min(240px, 100%)", minWidth: 0, display: "flex" }}>
                <Card>
                  <Group
                    head="역대 기록"
                    rows={[
                      {
                        k: "가장 많이 산 날", n: fullLabel(c.records.topBuy.date),
                        v: `+${usd(Math.abs(c.records.topBuy.value))}`,
                        on: jumpable(c.records.topBuy.date),
                      },
                      {
                        k: "가장 많이 판 날", n: fullLabel(c.records.topSell.date),
                        v: `−${usd(Math.abs(c.records.topSell.value))}`,
                        on: jumpable(c.records.topSell.date),
                      },
                      {
                        k: "가장 바빴던 날", n: fullLabel(c.records.busiest.date),
                        v: `${cnt(c.records.busiest.value)}번`,
                        on: jumpable(c.records.busiest.date),
                      },
                      // 1994-10-21. 매수 딱 한 건으로 표가 시작한다. 위 세 줄이 전부
                      // 최근인 것과 나란히 놓이면 32년이 한눈에 들어온다.
                      {
                        k: "기록의 첫 날", n: fullLabel(c.records.first.date),
                        v: `+${usd(Math.abs(c.records.first.value))}`,
                        on: jumpable(c.records.first.date),
                      },
                    ]}
                  />
                  <div style={{ display: "flex", flexDirection: "column", gap: S.sm }}>
                    <span style={{ fontSize: T.body, color: C.sub2, fontWeight: 600 }}>
                      해마다 되풀이되는 때
                    </span>
                    <ul style={{ listStyle: "none", margin: 0, padding: "8px 0 0", display: "flex",
                                 flexDirection: "column", gap: S.sm,
                                 borderTop: `1px solid ${C.line}` }}>
                      {CALENDAR_WINDOWS.map((w) => (
                        <li key={w.key}>
                          <WindowRow w={w} onJump={() => jumpToWindow(w.key)} />
                        </li>
                      ))}
                    </ul>
                    {/* ⚠️ 이 줄이 표를 정직하게 만든다. 없으면 "17번 중 12번"과
                        "17번 중 16번"이 똑같아 보인다. 우연의 기준선을 밝혀야 독자가
                        각 줄을 스스로 잰다. 실측값이다(80칸 전체의 중앙값이 63%). */}
                    <span style={{ fontSize: T.tiny, color: C.faint, lineHeight: 1.5,
                                   wordBreak: "keep-all" }}>
                      2010~2026년 · 우연이라도 {CHANCE_BASELINE.of}번 중{" "}
                      {CHANCE_BASELINE.hit}번쯤은 같은 방향입니다
                    </span>
                  </div>
                </Card>
              </div>
            )}
          </div>
        </div>
      </div>

    </section>
  );
}
