"use client";

import { useMemo, useState } from "react";

import type { CalendarDay, SeohakCalendar } from "@/lib/seohak-calendar";
import { CALENDAR_WINDOWS, CHANCE_BASELINE, windowDates, windowsInMonth } from "@/lib/seohak-windows";
import { SectionHead } from "../kadera/SectionHead";
import { BUY, SELL, signInk } from "./tone";
import { S, T } from "./scale";
import { type Fx, Money, both } from "./money";
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
 * ⭐ 이 카드가 혼자 들고 있던 자(`T`·`S`)를 **페이지 자**(`./scale`)로 옮겼다.
 *
 * 여기서 먼저 배운 것이라(글자 11가지 → 3가지) 다른 카드들은 그대로 흩어져 있었다.
 * 이제 다섯 파일이 같은 다섯 단을 쓴다. 근거는 `scale.ts` 머리말.
 *
 * ⚠️ 옮기면서 `big` 이 20 → 22 가 됐다. 아래 화살표 아이콘만 그 자를 안 쓴다 —
 * 글자가 아니라 그림이고, 24px 단추 안에 22 를 넣으면 꽉 찬다.
 */

/** "M/D" — 달력 안이라 연도는 군더더기다. */
const dayLabel = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8))}`;
/** "YYYY/M/D" — 32년을 오가는 줄에는 연도가 있어야 한다. 구분자는 `dayLabel` 과 맞춘다. */
const fullLabel = (date: string) => `${date.slice(0, 4)}/${dayLabel(date)}`;
/** 모서리 넷 — 마크 2 · 달력 칸 4 · 상자 R.control · 알약 R.pill. 그 밖의 값은 쓰지 않는다. */

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

const cnt = (v: number) => v.toLocaleString("ko-KR");
/** 결제일 → 그 달. 금액을 **그 돈이 오간 달의 환율**로 옮기는 데 쓴다(money.tsx 머리말). */
const monthOf = (date: string) => date.slice(0, 7);

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
function Row({ k, n, v, sign, on }: {
  k: string; n: string; v: React.ReactNode;
  /** 값의 방향. 주면 색이 따라간다. 안 주면 잉크 그대로다. */
  sign?: number;
  on?: () => void;
}) {
  /* ⭐ 부호가 붙은 값은 색으로도 방향을 말한다 — 오르면 빨강, 내리면 파랑(국내 관행).
     `+$1.18B` 와 `−$1.00B` 가 둘 다 검정이라 굵기 말고는 구분이 없었다.
     ⚠️ 예전엔 값 **문자열**의 첫 글자로 읽었는데, 통화 스위치가 붙으면서 값이 두 벌
     짜리 노드가 되어 못 읽는다. 부르는 쪽이 숫자로 넘긴다. */
  const ink = sign === undefined ? C.ink : signInk(sign);
  const body = (
    <>
      <span style={{ fontSize: T.body, color: C.sub }}>{k}</span>
      <span style={{ marginLeft: "auto", fontSize: T.tiny, color: C.faint }}>{n}</span>
      <b style={{ fontFamily: MONO, fontSize: T.body, color: ink, minWidth: 62,
                  textAlign: "right", textDecoration: on ? "underline" : "none",
                  textUnderlineOffset: 2 }}>{v}</b>
    </>
  );
  const style: React.CSSProperties = {
    display: "flex", alignItems: "baseline", gap: S.sm, width: "100%",
  };
  return on ? (
    /* ⚠️⚠️ `.hz-jump` 의 **좌우** 음수 마진(-6px)을 되돌린다. 그건 맨 글자 링크의 호버
       영역을 넓히려는 값인데, `width:100%` 인 버튼에 걸리면 왼쪽으로만 6px 밀려 나가고
       오른쪽은 그만큼 짧아진다 — 누를 수 있는 줄의 값만 위 두 줄보다 **12px 왼쪽**에
       서서 오른쪽 끝이 안 맞았다(872 대 884, 실측).
       세로(-3px)는 그대로 둔다. 같이 없애면 줄 간격이 벌어진다.
       ⭐ 같은 함정을 `.hz-row-link.hz-pick` 과 달력의 '오늘' 알약이 먼저 겪었다. */
    <button type="button" onClick={on} className="hz-jump"
            style={{ ...style, border: "none", cursor: "pointer", font: "inherit",
                     margin: "-3px 0", padding: "3px 0" }}>
      {body}
    </button>
  ) : (
    <span style={style}>{body}</span>
  );
}

type RowSpec = { k: string; n: string; v: React.ReactNode; sign?: number; on?: () => void };

/**
 * 되풀이되는 때 한 줄 — 이름 · 문장 · 몇 번 중 몇 번.
 *
 * ⭐ 값을 `−19%` 가 아니라 **"평소보다 19% 덜 삽니다"** 로 낸다. 부호를 말로 풀면
 * 방향을 되짚을 일이 없다. 그리고 진짜 값은 % 가 아니라 **횟수**다 — 17번 중 16번과
 * 12번은 같은 −33% 라도 전혀 다른 이야기다.
 *
 * ⛔ **해마다의 성패를 17칸으로 그려 봤다가 즉시 뺐다.** 폭 546px 에 17칸이면 한 칸이
 * 28px 이라, 여섯 줄이 모이니 줄무늬 밭이 된다("눈 아프다"). 정보는 맞았지만 이 카드가
 * 낼 잉크의 양이 아니었다. 근거는 상수 머리말에 글자로 남겼다.
 */
function WindowRow({ w, onJump }: { w: (typeof CALENDAR_WINDOWS)[number]; onJump: () => void }) {
  // 우연 기준선(17번 중 11번)을 넘어야 잉크를 준다. 아래면 흐리게 둬서 눈이 안 멈춘다.
  const strong = w.hit / w.of >= 0.85;
  return (
    // ⚠️ 좌우 음수 마진을 되돌리는 까닭은 `Row` 와 같다. 오른쪽 '17번 중 17번' 이 밀린다.
    <button type="button" onClick={onJump} className="hz-jump"
            style={{ display: "flex", flexDirection: "column", gap: S.xs, width: "100%",
                     border: "none", cursor: "pointer", font: "inherit", textAlign: "left",
                     margin: "-3px 0", padding: "3px 0" }}>
      <span style={{ display: "flex", alignItems: "baseline", gap: S.sm, width: "100%",
                     flexWrap: "wrap" }}>
        <b style={{ fontSize: T.body, color: C.ink }}>{w.label}</b>
        <span style={{ fontSize: T.body, color: C.sub }}>{w.phrase}</span>
        <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: T.tiny,
                       color: C.faint, flexShrink: 0 }}>
          {w.of}번 중 <b style={{ color: strong ? C.ink : C.sub2 }}>{w.hit}번</b>
        </span>
      </span>
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
function Box({ head, amount, at, fx, rows }: {
  head: string; amount: number;
  /** 이 상자의 달. 금액을 그 달 환율로 옮긴다. */
  at: string;
  fx: Fx | null;
  rows: (RowSpec | null | undefined | false)[];
}) {
  return (
    <Card>
      <div style={{ display: "flex", flexDirection: "column", gap: S.sm }}>
        <span style={{ fontSize: T.body, color: C.sub2, fontWeight: 600 }}>{head}</span>
        <span style={{ display: "flex", alignItems: "baseline", gap: S.sm, flexWrap: "wrap" }}>
          {/* ⚠️ 면 색(BUY/SELL)이 아니라 글자 색이다. 파랑 원색은 흰 상자 위 명암비가
              3.71 이라 이 크기여도 4.5 에 못 미친다. */}
          <b style={{ fontFamily: MONO, fontSize: T.big, fontWeight: 800,
                      color: signInk(amount), letterSpacing: "-0.02em" }}>
            <Money usd={Math.abs(amount)} at={at} fx={fx} />
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

export function CalendarHero({ c, fx }: { c: SeohakCalendar; fx: Fx | null }) {
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

  /** 그 달로 옮기고, 그 달에서 가장 크게 움직인 날을 고른다. */
  const jumpToMonth = (next: string) => {
    setMonth(next);
    const inNext = c.days.filter((d) => d.date.startsWith(next));
    const pick = inNext.reduce<CalendarDay | null>(
      (a, d) => (!a || Math.abs(d.net) > Math.abs(a.net) ? d : a), null);
    if (pick) setPicked(pick.date);
  };

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
   * 그냥 글로 남는다(밑줄이 없어져서 눌러도 되는지 손이 먼저 안다).
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
  /**
   * 달력 아래 최근 열두 달. 화살표만으로는 한 해를 훑는 데 열두 번 눌러야 하고, 정작
   * 달력 칸 아래가 90px 비어 있었다.
   *
   * ⭐ 채우는 김에 이 페이지의 바탕 사실이 보인다 — **거의 매달 빨갛다.** 1999년부터
   * 330개월 중 222개월이 순매수로 끝났다. 막대가 아니라 색 칸이라 눈이 안 피로하다.
   */
  const recentMonths = useMemo(() => {
    const byMonth = new Map<string, number>();
    for (const d of c.days) byMonth.set(d.date.slice(0, 7), (byMonth.get(d.date.slice(0, 7)) ?? 0) + d.net);
    const keys = [...byMonth.keys()].sort().slice(-12);
    const scale = Math.max(...keys.map((k) => Math.abs(byMonth.get(k)!)), 1);
    return keys.map((k) => ({ key: k, net: byMonth.get(k)!, scale }));
  }, [c.days]);

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
        /* ⭐ '되풀이되는 때'였다. **카드의 4분의 1만 가리키는 이름**이었다 — 달력·이 달·
           고른 날·역대 기록을 두고 오른쪽 한 칸의 제목을 그대로 썼다. 게다가 그 칸 안에
           '해마다 되풀이되는 때'가 또 있어서 같은 말이 한 카드에 두 번 나왔다.
           부제는 '서학개미들의'로 시작했는데 제목이 그 말을 가져갔으므로 겹치지 않게 고쳤다.
           ⚠️ 여는 태그 안에서는 주석에 중괄호를 두르면 안 된다. 스프레드 자리로 파싱돼
           TS1005 로 죽는다. 맨 블록 주석만 쓴다(방금 둘 다 겪었다). */
        title="서학개미의 1년"
        /* ⚠️ 부제는 **명사구**로 끝낸다. 다른 화면(카더라·MDD)의 부제가 전부 그런데
           이 페이지만 '~입니다' 로 문장을 쓰고 있었다. 두 문장이던 것도 한 줄로 줄인다. */
        desc="하루 단위로 본 행동 패턴 · 사고파는 건수는 늘 그대로고 달라지는 건 한 번에 넣는 금액"
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
      <div style={{ display: "flex", flexWrap: "wrap", padding: "18px 22px", gap: S.md }}>
        {/* ── 왼쪽 한 칸: 달력 ── */}
        <div style={{ flex: "1 1 220px", maxWidth: 380, minWidth: 0, display: "flex",
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
                  {/* 글자가 아니라 그림이라 자 밖이다. 24px 단추에 맞춘 광학 크기. */}
                  <Icon name={by < 0 ? "chevron_left" : "chevron_right"} style={{ fontSize: 20 }} />
                </button>
              );
            })}
            {/* ⚠️⚠️ 남는 폭을 **이 칸이 먹는다.** 예전엔 '오늘' 쪽에 `marginLeft:auto` 로
                밀어 뒀는데, 그러면 버튼이 격자보다 **6px 밖에** 앉는다(격자 오른쪽 461,
                버튼 467). 폭을 237·280·311·360 으로 바꿔 가며 재도 늘 6px 이었다 —
                자유 폭을 셀 때 쓰는 이 글자의 폭(58)과 실제로 그려지는 폭(64)이 갈려서,
                그 차이가 그대로 뒤로 밀린다. 굵기 800 의 글꼴 지표 문제라 글자를 바꾸면
                값도 바뀐다. 남는 폭을 auto 마진이 아니라 이 칸이 먹게 두면 안 생긴다. */}
            <span style={{ fontSize: T.body, fontWeight: 800, color: C.ink, marginLeft: 2,
                           flex: 1, minWidth: 0 }}>
              {meta.year}년 {meta.month}월
            </span>
            {/* 달을 몇 번 넘기고 나면 돌아올 길이 화살표뿐이다. '오늘'은 자료의 마지막
                결제일이다(시트 머리의 기준일과 같은 날). */}
            <button type="button" onClick={() => { setMonth(c.asOfMonth); setPicked(c.asOf); }}
                    className="hz-jump"
                    /* ⚠️ `margin: 0` 이 있어야 한다. `.hz-jump` 는 `margin: -3px -6px` 로
                       호버 영역을 글자 밖까지 넓히는데, 그건 **맨 글자 링크**용 값이다.
                       이건 테두리 있는 알약이라 그 음수 마진이 그대로 밖으로 나가서
                       버튼이 달력 격자보다 6px 오른쪽에 앉았다(격자 461 · 버튼 467). */
                    style={{ flexShrink: 0, margin: 0, fontSize: T.tiny, fontFamily: "inherit",
                             padding: "3px 8px", borderRadius: R.pill,
                             border: `1px solid ${C.line}`, color: C.sub, cursor: "pointer" }}>
              오늘
            </button>
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

          {/* ## ⭐ 요일 줄과 날짜 격자를 **둘로 갈랐다**
              한 격자였을 때 날짜 칸이 34px 로 못 박혀 있어서, 오른쪽 칸이 길어지는 폭
              (1,060px 에서 줄이 두 줄로 접힌다)에서는 달력 아래가 **94px 비었다.**
              칸 격자만 `flex:1` 로 두면 그 폭을 칸 높이가 나눠 먹는다.
              ⚠️ 갈라야 하는 이유: `gridAutoRows` 는 요일 줄에도 걸린다. 한 격자에 두면
              '일 월 화…' 한 줄이 34px 짜리 띠가 된다. */}
          <div style={{ display: "flex", flexDirection: "column", gap: S.xs, flex: 1, minHeight: 0 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: S.xs }}>
            {WEEKDAYS.map((w, i) => (
              <span key={w} style={{ fontSize: T.tiny, fontWeight: 700, textAlign: "center",
                                     color: i === 0 || i === 6 ? C.faint : C.sub2 }}>{w}</span>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: S.xs,
                        flex: 1, minHeight: 0, gridAutoRows: "minmax(34px, 1fr)" }}>
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
                  /* ⚠️ 속성이라 통화 하나를 CSS 로 숨길 수가 없다. 둘 다 적는다. */
                  title={row ? `${date} · 순매수 ${both(row.net, fx, month)}` : `${date} · 결제 없음`}
                  style={{
                    // 높이는 위 격자의 `gridAutoRows` 가 정한다(바닥값 34).
                    position: "relative",
                    /* ⚠️ 한때 `aspectRatio: 1.35 + minHeight: 34` 로 뒀는데 못 쓴다.
                       격자 칸이 1fr 이라 폭이 36 이면 비율상 높이가 26.7 인데, minHeight 가
                       34 로 올리면 aspect-ratio 가 **그 높이에 맞춰 폭을 46 으로 되민다**.
                       7칸이면 322+간격 = 346 이라 격자(276)를 넘친다. minWidth:0 으로도
                       안 막힌다 — 높이가 확정되면 폭이 따라오는 게 aspect-ratio 의 규칙이다.
                       1:1:2 에서 칸이 36 폭이라 34 면 거의 정사각이고, 줄바꿈될 때는 왼쪽
                       칸의 maxWidth 가 납작해지는 걸 막는다. */
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

          {/* marginTop:auto — 칸 셋의 바닥을 맞춘다. 달력은 6줄일 때와 5줄일 때 높이가
              달라서, 붙여 두면 달마다 아래가 들쭉날쭉해진다. */}
          <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: S.xs }}>
            <span style={{ fontSize: T.tiny, color: C.sub2, fontWeight: 600 }}>최근 열두 달</span>
            <div style={{ display: "flex", gap: 2 }}>
              {recentMonths.map((m) => {
                const strength = Math.min(1, Math.abs(m.net) / m.scale);
                return (
                  <button key={m.key} type="button" onClick={() => jumpToMonth(m.key)}
                          title={`${m.key} · 순매수 ${both(m.net, fx, m.key)}`}
                          style={{ flex: 1, minWidth: 0, height: 22, borderRadius: 3, padding: 0,
                                   cursor: "pointer",
                                   border: m.key === month ? `2px solid ${C.ink}` : "2px solid transparent",
                                   background: `color-mix(in srgb, ${m.net >= 0 ? BUY : SELL} ${16 + strength * 74}%, ${C.card})` }} />
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 2, fontSize: T.tiny, color: C.faint }}>
              {recentMonths.map((m) => (
                <span key={m.key} style={{ flex: 1, minWidth: 0, textAlign: "center" }}>
                  {Number(m.key.slice(5))}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* ── 오른쪽 두 칸: 고른 날 + 매매를 바꾸는 것들 ──
            ⭐ 1:2 였다가 **1:1:1** 로 바꿨다(달력 : 이 달·고른 날 : 되풀이되는 때).
            바탕값이 곧 비율이라 여기 452 = 210×2 + 칸 사이 12 다. 셋을 정확히 삼등분
            하려면 바깥 바탕값(220)과 이 값이 1:2 여야 한다 — flex 비율은 **남는 폭만**
            나누므로, 바탕이 어긋나 있으면 비율을 1:2 로 적어도 결과는 1:2 가 아니다. */}
        <div style={{ flex: "2 1 452px", minWidth: 0, display: "flex",
                      flexDirection: "column", gap: S.md }}>
          {/* 이 달 · 고른 날 — 두 칸.
              ⚠️ 두 상자가 **줄 꼴이 서로 달랐다.** 어떤 줄은 '라벨·값', 어떤 줄은
              '라벨·날짜·값', 어떤 줄은 각주였다. 값 하나하나는 그럴듯한데 나란히 두면
              규칙이 안 보여 지저분해진다. 지금은 **한 가지 줄 꼴**(라벨 · 보조 · 값)만
              쓰고, 그 줄을 만드는 자리도 `Row` 하나뿐이다. */}
          {/* ⚠️ 한때 alignItems:flex-start 였다. 그때는 역대 카드가 제일 짧아서(274 vs 356)
                늘리면 카드 안이 82px 비었기 때문이다. 지금은 역대가 제일 기니 늘려도 구멍이
                안 생기고, 대신 가운데 칸 두 카드가 남는 29px 를 나눠 가져 세 칸 바닥이 맞는다. */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: S.md }}>
            {/* 왼쪽 칸 — 이 달 위, 고른 날 아래. 둘은 '지금 보고 있는 것'이라 한 묶음이다. */}
            <div style={{ flex: "1 1 min(210px, 100%)", minWidth: 0, display: "flex",
                          flexDirection: "column", gap: S.md }}>
              <Box
                head={`이 달 · ${monthDays.length}거래일`}
                amount={monthNet}
                at={month}
                fx={fx}
                rows={[
                  { k: "산 금액", n: "", v: <Money usd={monthBuy} at={month} fx={fx} /> },
                  { k: "판 금액", n: "", v: <Money usd={monthSell} at={month} fx={fx} /> },
                  // ⚠️ 위 두 줄은 **총액**이고 이 두 줄은 **차액**이다. 같은 칸에 부호
                  // 없이 나란히 두면 같은 종류로 읽혀서 $739M 을 $10.16B 와 견주게 된다.
                  // 부호를 붙여 "차이"임을 형태로 알린다.
                  topBuy && {
                    k: "가장 많이 산 날", n: dayLabel(topBuy.date), sign: 1,
                    v: <>+<Money usd={Math.abs(topBuy.net)} at={monthOf(topBuy.date)} fx={fx} /></>,
                    on: () => setPicked(topBuy.date),
                  },
                  topSell && {
                    k: "가장 많이 판 날", n: dayLabel(topSell.date), sign: -1,
                    v: <>−<Money usd={Math.abs(topSell.net)} at={monthOf(topSell.date)} fx={fx} /></>,
                    on: () => setPicked(topSell.date),
                  },
                ]}
              />
              {day && (
                <Box
                  head={`고른 날 · ${day.date}${pickedWindow ? ` · ${pickedWindow.label}` : ""}`}
                  amount={day.net}
                  at={monthOf(day.date)}
                  fx={fx}
                  rows={[
                    { k: "산 금액", n: `${cnt(day.buyCount)}번`,
                      v: <Money usd={day.buy} at={monthOf(day.date)} fx={fx} /> },
                    { k: "판 금액", n: `${cnt(day.sellCount)}번`,
                      v: <Money usd={day.sell} at={monthOf(day.date)} fx={fx} /> },
                    { k: "한 번 살 때", n: "평균",
                      v: day.buyCount
                        ? <Money usd={day.buy / day.buyCount} at={monthOf(day.date)} fx={fx} />
                        : "—" },
                  ]}
                />
              )}
            </div>

            {/* 오른쪽 칸 — 되풀이되는 때가 먼저, 역대 기록이 아래.
                ⭐ 순서가 뜻이다. 이 시트의 주장은 '되풀이'고, 역대 기록은 그 아래 붙는
                참고다. 위에 뒀을 때는 카드를 열자마자 최대·최소가 먼저 눈에 들어와
                주장이 뒤로 밀렸다. */}
            <div style={{ flex: "1 1 min(210px, 100%)", minWidth: 0, display: "flex" }}>
                {/* ## ⚠️⚠️ 남는 폭은 **묶음 사이**로 간다, 줄 사이가 아니라
                    앞 판은 아래 `<ul>` 이 `flex:1 + space-between` 이라 남는 50px 를 줄
                    사이로 흩뿌렸다. 그러면 줄 간격이 34px 인데 '해마다 되풀이되는 때' 와
                    '역대 기록' 사이는 12px 가 되어, **위계가 거꾸로 선다** — 다른 묶음
                    사이가 같은 묶음 안보다 좁다("완전 다른건데 스페이싱 간격이 똑같아").
                    지금은 줄이 8px 로 붙고 남는 폭이 통째로 묶음 사이 틈이 된다. */}
                <Card>
                  <div style={{ display: "flex", flexDirection: "column", gap: S.sm }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: S.xs,
                                   fontSize: T.body, color: C.sub2, fontWeight: 600 }}>
                      해마다 되풀이되는 때
                      {/* 기준선은 이 표를 읽는 데 꼭 필요한데, 각주로 깔아 두면 여섯 줄
                          아래 잉크만 한 겹 더 얹는 꼴이었다. 찾을 때만 열리게 옮긴다. */}
                      <span className="hz-tip hz-tip-wide" data-tip={`2010~2026년, 해마다 같은 방향이었는지를 셉니다. 우연이라도 ${CHANCE_BASELINE.of}번 중 ${CHANCE_BASELINE.hit}번쯤은 같은 방향이라, 12번은 동전 던지기에 가깝고 17번은 분명히 다릅니다.`}
                            style={{ display: "inline-flex", cursor: "help" }}>
                        <Icon name="help" style={{ fontSize: 12, color: C.hint }} />
                      </span>
                    </span>
                    <ul style={{ listStyle: "none", margin: 0, padding: "10px 0 0",
                                 display: "flex", flexDirection: "column", gap: S.sm,
                                 borderTop: `1px solid ${C.line}` }}>
                      {CALENDAR_WINDOWS.map((w) => (
                        <li key={w.key}>
                          <WindowRow w={w} onJump={() => jumpToWindow(w.key)} />
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* `marginTop:auto` — 역대 기록은 늘 카드 바닥이다. 위 묶음이 몇 줄이든
                      셋 칸의 바닥이 맞는다.
                      ⚠️ `paddingTop` 을 함께 준다. 남는 폭에만 기대면 **카드가 딱 맞게 찰 때
                      틈이 0 이 되어** 묶음 사이가 줄 사이(8)보다 좁아진다 — 1,060px 에서
                      실제로 그랬다(줄이 두 줄로 접혀 카드를 꽉 채운다). 이 값이 바닥이다. */}
                  {c.records && (
                    <div style={{ marginTop: "auto", paddingTop: S.md }}>
                    <Group
                      head="역대 기록"
                      rows={[
                        {
                          k: "가장 많이 산 날", n: fullLabel(c.records.topBuy.date),
                          sign: 1,
                          v: <>+<Money usd={Math.abs(c.records.topBuy.value)}
                                       at={monthOf(c.records.topBuy.date)} fx={fx} /></>,
                          on: jumpable(c.records.topBuy.date),
                        },
                        {
                          k: "가장 많이 판 날", n: fullLabel(c.records.topSell.date),
                          sign: -1,
                          v: <>−<Money usd={Math.abs(c.records.topSell.value)}
                                       at={monthOf(c.records.topSell.date)} fx={fx} /></>,
                          on: jumpable(c.records.topSell.date),
                        },
                        // ⚠️ 이 줄만 값이 금액이 아니라 횟수다. 단위(번)가 달라 금액과
                        // 섞여 읽힐 일이 없어서 예외로 둔다.
                        {
                          k: "가장 바빴던 날", n: fullLabel(c.records.busiest.date),
                          v: `${cnt(c.records.busiest.value)}번`,
                          on: jumpable(c.records.busiest.date),
                        },
                      ]}
                    />
                    </div>
                  )}
                </Card>
            </div>
          </div>
        </div>
      </div>

    </section>
  );
}
