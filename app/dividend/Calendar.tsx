"use client";

// 월 배당 달력과 다가오는 일정. DividendCalculator.tsx 에서 그대로 옮겨 왔다(store.ts 머리말 참고).

import { useMemo } from "react";
import { type StockLite } from "./types";
import type { Holding } from "./store";
import { won, wonCal, money } from "./format";
import { isPensionLike, fitsAccount, taxRate, taxableShare } from "./tax";
import type { TaxMode } from "./tax";
import { ROW_CHIPS, UPCOMING_MAX, MONTHS, SCOPES } from "./shared";
import type { Scope, Line } from "./shared";
import { expectedPays } from "./calc";
import { QuickChips } from "./Search";
import { Module } from "../kadera/V2Modules";
import { Icon } from "../ui";

/* ── 달마다 얼마 ─────────────────────────────────────────────────── */
export function MonthCalendar({
  monthly,
  noCalCount,
  selected,
  onPick,
  bare,
}: {
  monthly: number[];
  noCalCount: number;
  selected: number | null;
  onPick: (m: number) => void;
  /** v2 모듈 안에 넣을 때 — 제목 · 부제 줄은 모듈 머리가 말한다(app/dividend/V2Parts.tsx). */
  bare?: boolean;
}) {
  const max = Math.max(...MONTHS.map((m) => monthly[m]));
  const paidMonths = MONTHS.filter((m) => monthly[m] > 0).length;
  // 판 하나에 단위 하나 — 칸마다 100만 문턱을 따로 재면 '870,676원'이 '108만원'보다 길어 더 커 보였다(2026-10-05 점검).
  // 단위로 반올림해 0 이 되는 작은 달은 한 단계 아래로 — '0만원'이면 지급이 있는데 점선 '0원' 칸(빈 달)과 섞여 머리의 '빈 달 N'과
  // 안 맞았다(2026-10-05 머지 전 점검).
  const amt = (v: number) =>
    max >= 1e8 && v >= 5e6 ? `${(v / 1e8).toFixed(1)}억원` : max >= 1e6 && v >= 5e3 ? `${Math.round(v / 1e4).toLocaleString("ko-KR")}만원` : won(v);
  return (
    <div className="dv-cal">
      {!bare && (
      <div className="dv-cal-head dv-cal-head-col">
        <span className="dv-cal-title">
          달마다 얼마 들어오나
        </span>
        <span className="dv-cal-sub">
          {paidMonths ? `1년에 ${paidMonths}달 들어옵니다` : "지급 달을 아는 종목이 없습니다"} · 최근 12개월 기준
          {noCalCount > 0 && ` · ${noCalCount}종목은 지급 달을 몰라 뺐습니다`}
        </span>
      </div>
      )}
      <div className="dv-cal-grid">
        {MONTHS.map((m) => {
          const v = monthly[m];
          return (
            <button
              key={m}
              type="button"
              className={`dv-cal-cell${v > 0 ? " dv-cal-on" : ""}`}
              aria-pressed={selected === m}
              onClick={() => onPick(m)}
              title={v > 0 ? `${m}월에 주는 종목 보기` : `${m}월은 비어 있습니다 · 이 달에 주는 종목 보기`}
            >
              {/* 키는 비율(--r)만 넘기고 CSS 가 막대 자리(칸 − 글자 두 줄)에 곱한다. 칸 전체의 퍼센트로 주면 글자 몫까지 합쳐 칸을 넘는
                  막대가 줄어들어(flex-shrink) 큰 달들이 다 같은 키였다 — 폰에선 열한 달이 22px 로 같았다(2026-10-04 점검). */}
              <span className="dv-cal-bar" style={{ "--r": max > 0 && v > 0 ? Math.max(0.06, v / max) : 0 } as React.CSSProperties} aria-hidden="true" />
              <span className="dv-cal-month">{m}월</span>
              {/* 빈 달은 점선 칸 + 동그라미 + — "눌러서 이 달을 채운다"(누르면 그 달에 주는 종목 판). 한때 '0원'으로 바꿨다가(칸마다 같은
                  아이콘이 다섯 번 선다는 이유) 운영자 지시로 되살렸다(2026-10-05) — 뜻이 하나(이 달을 채운다)라 한 화면 한 아이콘 규칙의 예외다. */}
              {v > 0 ? (
                <span className="dv-cal-amt">{amt(v)}</span>
              ) : (
                <span className="dv-cal-amt dv-cal-add" aria-hidden="true">
                  <Icon name="add_circle" style={{ fontSize: 18 }} />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── 다가오는 일정 — 담은 종목의 다음 기준일·지급일 ─────────────────────────────────
   아는 날짜가 먼저다: 국내 주식은 예탁결제원에 올라온 다음 배당기준일, 미국 주식·ETF 는 선언됐지만 아직
   안 지급된 다음 건(지급일·1주당 금액). 날짜를 모르는 종목은 지난 1년 지급일을 올해로 옮겨 "이날쯤 지급 예상"을
   적는다 — 이미 지난 날은 건너뛰고(이달 2일에 준 월배당 ETF 를 '이달 예상'이라 하지 않게), 석 달 안의 것만.
   여섯 줄까지.
   ⚠️ 서버 렌더에는 없다 — 담은 종목이 브라우저 저장소에서 오므로 hydration 뒤에만 그려져 오늘 날짜를 써도 안전하다. */

export type UpcomingItem = { key: string; when: string; sortKey: string; name: string; what: string; amount: string | null; amountKrw: number; tag: "확정" | "예상" | null };

export function upcomingOf(lines: Line[], fx: number, mode: TaxMode): { items: UpcomingItem[]; sureKrw: number; expectedKrw: number } {
  // 날짜는 KST 로 — toISOString 은 UTC 라 한국 새벽 0~9시엔 어제가 '오늘'이 돼 지난 일정이 다가오는 일정에 남는다.
  const today = new Date(Date.now() + 9 * 3600e3);
  const iso = today.toISOString().slice(0, 10);
  // 석 달이 아니라 '가까운 여섯 건' — 석 달 안이 한 건뿐이면 그 줄이 칸 가운데에 떠 위아래가 90px 씩 비었다(2026-10-05 점검).
  // 어림은 1년 앞까지 보고, 머리의 합은 줄에 선 건만 더한다(줄을 더하면 머리 합이 된다).
  const horizon = new Date(today.getTime() + 365 * 86400e3).toISOString().slice(0, 10);
  const out: UpcomingItem[] = [];
  const dateLabel = (d: string) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일`;
  // 같은 종목이 두 줄(ISA·일반 계좌)이면 일정은 하나로 — 세후 금액은 줄마다 세율이 달라 줄별로 떼어 더한다.
  const groups = new Map<string, Line[]>();
  for (const l of lines) groups.set(l.stock.code, [...(groups.get(l.stock.code) ?? []), l]);
  const net = (ls: Line[], perShare: number): [string, number] => {
    const s = ls[0].stock;
    // 줄마다 세율이 다르고, 세금은 과세되는 몫에만(과표·감액배당) — 표의 세후와 같은 식.
    const v = ls.reduce((sum, l) => {
      const m: TaxMode = mode === "gross" ? "gross" : l.account;
      const share = isPensionLike(m) && fitsAccount(s, m) ? 1 : taxableShare(s);
      return sum + perShare * l.shares * (1 - taxRate(s, m) * share);
    }, 0);
    const krw = v * (s.currency === "USD" ? fx : 1);
    // 금액 칸은 원화 하나 — 1주 달러 금액은 아랫줄('분배금 1주에 $0.37')이 말한다. '$63.14 · 85,132원'이면 칸이 111px 라
    // 종목 이름이 두 줄로 꺾여 줄마다 키가 69px 였다(지급 건마다 줄을 세우며 여섯 줄이 되자 둘째 줄 키가 484px, 2026-10-04).
    // 100만원부터는 만원 단위(달력 칸과 같은 문턱) — 7자리 금액이면 이름이 두 줄로 꺾였다(2026-10-05 점검).
    return [wonCal(krw), krw];
  };
  for (const ls of groups.values()) {
    const s = ls[0].stock;
    const unit = s.kind === "etf" ? "분배금" : "배당금";
    // 공시된 확정값 — 지급일까지 있으면 그날, 지급일이 없으면(국내 결산배당 공시) 기준일 줄에 금액을 적는다.
    const sure = s.nextPay && (s.nextPay[0] ? s.nextPay[0] >= iso : !!s.nextRecord && s.nextRecord >= iso) ? s.nextPay : null;
    // 지난 1년 지급일로 어림한 석 달 안의 건 — 확정 건의 짝은 빠져 있다. 합에는 전부, 표에는 확정 건이 없을 때 첫 건만.
    const expected = expectedPays(s.pays, iso, horizon, sure && { pay: sure[0], record: s.nextRecord, amount: sure[1] }, s.currency === "USD");
    if (s.nextRecord && s.nextRecord >= iso) {
      const a = sure && !sure[0] ? net(ls, sure[1]) : null;
      out.push({
        key: `${s.code}-r`, when: dateLabel(s.nextRecord), sortKey: s.nextRecord, name: s.name,
        what: a ? `배당기준일 · 1주에 ${money(sure![1], s)} · 지급일은 아직` : "배당기준일",
        amount: a ? a[0] : null, amountKrw: a ? a[1] : 0, tag: a ? "확정" : null,
      });
    }
    if (sure && sure[0]) {
      const a = net(ls, sure[1]);
      out.push({ key: `${s.code}-p`, when: dateLabel(sure[0]), sortKey: sure[0], name: s.name, what: `${unit} 1주에 ${money(sure[1], s)}`, amount: a[0], amountKrw: a[1], tag: "확정" });
    }
    // 지난 1년 지급일을 올해(지났으면 내년)로 옮긴 석 달 안의 건 — **전부** 줄로 선다(월분배의 둘째 · 셋째 달까지, 확정 건의 짝은 빠졌다).
    // 종목마다 한 건만 세웠더니 머리의 예상 합에 든 JEPI 12/3 건이 줄에 없어 머리 금액을 줄에서 맞춰 볼 수 없었다(2026-10-04 점검).
    expected.forEach((e, i) => {
      const a = net(ls, e.v);
      out.push({
        key: `${s.code}-e${i}`,
        when: `${dateLabel(e.date)}쯤`,
        sortKey: e.date,
        name: s.name,
        // '작년 지급일 기준'은 뗐다 — '쯤'과 '예상' 꼬리표가 이미 말해 세 겹이었다(2026-10-05 점검).
        what: `${unit} 1주에 ${money(e.v, s)}`,
        amount: a[0],
        amountKrw: a[1],
        tag: "예상",
      });
    });
  }
  out.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  const items = out.slice(0, UPCOMING_MAX);
  const sum = (tag: UpcomingItem["tag"]) => items.filter((i) => i.tag === tag).reduce((t, i) => t + i.amountKrw, 0);
  return { items, sureKrw: sum("확정"), expectedKrw: sum("예상") };
}

/** 일정 줄만 — v2 모듈 안에서 쓴다(머리의 합은 모듈 근거 글자가 말한다). */
export function UpcomingRows({ items }: { items: UpcomingItem[] }) {
  return (
    <ul className="dv-upcoming-list">
      {items.map((it) => (
        <li key={it.key} className="dv-upcoming-row">
          <span className="dv-upcoming-when">{it.when}</span>
          <span className="dv-upcoming-name">{it.name}</span>
          {it.tag && <span className={`dv-upcoming-tag${it.tag === "확정" ? " dv-upcoming-tag-sure" : ""}`}>{it.tag}</span>}
          {it.what && <span className="dv-upcoming-what">{it.what}</span>}
          {it.amount && <span className="dv-upcoming-amt">{it.amount}</span>}
        </li>
      ))}
    </ul>
  );
}

/* ── 빈 달 채우기 — 누른 달에 지급하는 종목을 국장·미장·ETF 줄로 ──────────────────
   후보 순서는 fillOrder(칩·더 보기 묶음 먼저, 그다음 큰 회사·수익률 순). 줄마다 여덟. 담긴 건 QuickChips 가 뺀다.
   국내 주식은 대개 4월(결산)·한두 달이라 국장 줄은 빈 달이 많다 — 그때는 그 줄을 안 세운다. */

export function MonthFill({
  month,
  order,
  holdings,
  onPick,
  onClose,
}: {
  month: number;
  order: Record<Scope, StockLite[]>;
  holdings: Holding[];
  onPick: (code: string) => void;
  onClose: () => void;
}) {
  const held = new Set(holdings.map((h) => h.code));
  const rows = SCOPES.map((o) => ({
    label: o.label,
    codes: order[o.key].filter((s) => !held.has(s.code) && s.pays.some(([m]) => m === month)).slice(0, ROW_CHIPS).map((s) => s.code),
  })).filter((r) => r.codes.length);
  const byCode = useMemo(() => new Map(Object.values(order).flat().map((s) => [s.code, s])), [order]);
  // 다른 칸과 같은 v2 모듈(머리 띠 · 제목 h2) — 이 판만 머리 띠가 없고 '접기'가 파란 600 이었다(2026-10-05 점검). '접기'는 '모두 빼기'와 같은 꼴.
  return (
    <Module
      title={`${month}월에 주는 종목`}
      meta="지난 1년 지급일"
      aside={
        <button type="button" className="dv-table-clear" onClick={onClose}>
          접기
        </button>
      }
      className="v2-dv-fill"
    >
      <div className="v2-md-body">
        {rows.length ? (
          rows.map((r) => (
            <div key={r.label} className="dv-more-row">
              <span className="dv-more-label">{r.label}</span>
              <QuickChips codes={r.codes} byCode={byCode} holdings={holdings} onPick={onPick} />
            </div>
          ))
        ) : (
          // 이 판은 둘째 줄 바로 아래, 검색창보다 위에 선다 — '위 검색창'은 방향이 틀렸고 해요체였다(2026-10-04 점검).
          <p className="dv-more-foot">{month}월에 주는 종목이 후보에 없습니다.</p>
        )}
      </div>
    </Module>
  );
}

/* ── 바스켓 투자금 ────────────────────────────────────────────────── */
/* ── 목표까지 — 월 얼마를 받으려면 얼마가 있어야 하고, 매달 얼마씩 넣으면 언제 닿나 ─────────
   지금 담은 종목의 비율(세후 수익률 = 1년 세후 배당 ÷ 투자금)이 그대로 간다고 치고 센다. 배당은
   받는 족족 같은 비율로 다시 담고(재투자), 주가와 배당은 지금과 같다고 본다 — 그 셋을 글자로 적는다.
   달 수는 한 달씩 굴려서 센다(닫힌 식보다 읽기 쉽고 600달이면 즉시다). */
