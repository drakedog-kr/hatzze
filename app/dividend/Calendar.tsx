"use client";

// 월 배당 달력과 다가오는 일정. DividendCalculator.tsx 에서 그대로 옮겨 왔다(store.ts 머리말 참고).

import { useMemo } from "react";
import { Icon } from "../ui";
import { type StockLite } from "./types";
import type { Holding } from "./store";
import { won, wonCal, usd, money } from "./format";
import { isPensionLike, fitsAccount, taxRate, taxableShare } from "./tax";
import type { TaxMode } from "./tax";
import { ROW_CHIPS, UPCOMING_MAX, UPCOMING_DAYS, MONTHS, SCOPES } from "./shared";
import type { Scope, Line } from "./shared";
import { QuickChips } from "./Search";

/* ── 달마다 얼마 ─────────────────────────────────────────────────── */
export function MonthCalendar({
  monthly,
  noCalCount,
  selected,
  onPick,
}: {
  monthly: number[];
  noCalCount: number;
  selected: number | null;
  onPick: (m: number) => void;
}) {
  const max = Math.max(...MONTHS.map((m) => monthly[m]));
  const paidMonths = MONTHS.filter((m) => monthly[m] > 0).length;
  return (
    <div className="dv-cal">
      <div className="dv-cal-head dv-cal-head-col">
        <span className="dv-cal-title">
          달마다 얼마 들어오나
          {/* 누르는 법은 부제에서 빼 툴팁으로 — 모바일에서 두 줄이 됐다(2026-09-15). */}
          <span
            className="hz-tip hz-tip-wide dv-help"
            data-tip="최근 12개월에 실제로 지급된 달로 셉니다. 달을 누르면 그 달에 주는 종목이 뜹니다(빈 달은 +)."
            style={{ cursor: "help" }}
            aria-label="달력 설명"
          >
            <Icon name="help" style={{ fontSize: 14 }} />
          </span>
        </span>
        <span className="dv-cal-sub">
          {paidMonths ? `1년에 ${paidMonths}달 들어옵니다` : "지급 달을 아는 종목이 없습니다"} · 최근 12개월 기준
          {noCalCount > 0 && ` · ${noCalCount}종목은 지급 달을 몰라 뺐습니다`}
        </span>
      </div>
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
              <span className="dv-cal-bar" style={{ height: max > 0 ? `${Math.max(v > 0 ? 6 : 0, (v / max) * 100)}%` : 0 }} aria-hidden="true" />
              <span className="dv-cal-month">{m}월</span>
              {/* 빈 달은 금액 자리에 + 동그라미 — "여기 눌러 채우라"는 표시(시장 브리핑의 '새로운 지표 제보하기'와 같은 아이콘).
                  같은 아이콘이 여러 칸에 서지만 뜻이 하나(이 달을 채운다)라 한 화면 한 아이콘 규칙의 예외로 둔다. */}
              {v > 0 ? (
                <span className="dv-cal-amt">{wonCal(v)}</span>
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

type UpcomingItem = { key: string; when: string; sortKey: string; name: string; what: string; amount: string | null; amountKrw: number; tag: "확정" | "예상" | null };

function upcomingOf(lines: Line[], fx: number, mode: TaxMode): { items: UpcomingItem[]; sureKrw: number; expectedKrw: number } {
  // 날짜는 KST 로 — toISOString 은 UTC 라 한국 새벽 0~9시엔 어제가 '오늘'이 돼 지난 일정이 다가오는 일정에 남는다.
  const today = new Date(Date.now() + 9 * 3600e3);
  const iso = today.toISOString().slice(0, 10);
  const horizon = new Date(today.getTime() + UPCOMING_DAYS * 86400e3).toISOString().slice(0, 10);
  const year = Number(iso.slice(0, 4));
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
    return [s.currency === "USD" ? `${usd(v)} · ${won(krw)}` : won(krw), krw];
  };
  for (const ls of groups.values()) {
    const s = ls[0].stock;
    const unit = s.kind === "etf" ? "분배금" : "배당금";
    // 공시된 확정값 — 지급일까지 있으면 그날, 지급일이 없으면(국내 결산배당 공시) 기준일 줄에 금액을 적는다.
    const sure = s.nextPay && (s.nextPay[0] ? s.nextPay[0] >= iso : !!s.nextRecord && s.nextRecord >= iso) ? s.nextPay : null;
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
      continue;
    }
    if (sure) continue;
    // 날짜를 모르면 지난 1년 지급일을 올해(지났으면 내년)로 옮겨 가장 가까운 것 하나.
    const expected = s.pays
      .map(([m, v, d]) => {
        const md = `${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        return { date: `${year}-${md}` >= iso ? `${year}-${md}` : `${year + 1}-${md}`, v };
      })
      .filter((e) => e.date <= horizon)
      .sort((a, b) => a.date.localeCompare(b.date))[0];
    if (expected) {
      const a = net(ls, expected.v);
      out.push({
        key: `${s.code}-e`,
        when: `${dateLabel(expected.date)}쯤`,
        sortKey: expected.date,
        name: s.name,
        what: `${unit} 1주에 ${money(expected.v, s)} · 지난해 이날`,
        amount: a[0],
        amountKrw: a[1],
        tag: "예상",
      });
    }
  }
  out.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  // 합은 자르기 전 전부(석 달 안). 표에 못 든 줄도 합엔 든다.
  const sureKrw = out.filter((i) => i.tag === "확정").reduce((t, i) => t + i.amountKrw, 0);
  const expectedKrw = out.filter((i) => i.tag === "예상").reduce((t, i) => t + i.amountKrw, 0);
  return { items: out.slice(0, UPCOMING_MAX), sureKrw, expectedKrw };
}

export function Upcoming({ lines, fx, mode }: { lines: Line[]; fx: number; mode: TaxMode }) {
  const { items, sureKrw, expectedKrw } = upcomingOf(lines, fx, mode);
  if (!items.length) return null;
  const after = mode === "gross" ? "세전" : "세후";
  return (
    <div className="dv-upcoming">
      <div className="dv-cal-head dv-cal-head-col">
        <span className="dv-cal-title">
          다가오는 일정
          <span
            className="hz-tip hz-tip-wide dv-help"
            data-tip="확정은 회사가 정해 공시한 다음 배당이고, 예상은 지난해 같은 날에 준 만큼으로 어림한 값입니다. 석 달 안만 보입니다."
            style={{ cursor: "help" }}
            aria-label="다가오는 일정 설명"
          >
            <Icon name="help" style={{ fontSize: 14 }} />
          </span>
        </span>
        {/* 확정·예상 합 — 표에 못 든 줄까지 석 달 안 전부. 둘 다 0 이면(기준일만 있을 때) 안 적는다. */}
        {sureKrw + expectedKrw > 0 && (
          <span className="dv-cal-sub">
            석 달 안 {after} {sureKrw > 0 ? `확정 ${won(sureKrw)}` : ""}
            {sureKrw > 0 && expectedKrw > 0 ? " · " : ""}
            {expectedKrw > 0 ? `예상 ${won(expectedKrw)}` : ""}
          </span>
        )}
      </div>
      <ul className="dv-upcoming-list">
        {items.map((it) => (
          <li key={it.key} className="dv-upcoming-row">
            <span className="dv-upcoming-when">{it.when}</span>
            <span className="dv-upcoming-name">{it.name}</span>
            {it.tag && <span className={`dv-upcoming-tag${it.tag === "확정" ? " dv-upcoming-tag-sure" : ""}`}>{it.tag}</span>}
            <span className="dv-upcoming-what">{it.what}</span>
            {it.amount && <span className="dv-upcoming-amt">{it.amount}</span>}
          </li>
        ))}
      </ul>
    </div>
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
  return (
    <div className="dv-more" role="region" aria-label={`${month}월에 주는 종목`}>
      <div className="dv-more-head">
        <span className="dv-more-title">{month}월에 주는 종목</span>
        <button type="button" className="dv-more-toggle" onClick={onClose}>
          접기
        </button>
      </div>
      {rows.length ? (
        rows.map((r) => (
          <div key={r.label} className="dv-more-row">
            <span className="dv-more-label">{r.label}</span>
            <QuickChips codes={r.codes} byCode={byCode} holdings={holdings} onPick={onPick} />
          </div>
        ))
      ) : (
        <p className="dv-more-foot">{month}월에 주는 종목이 후보에 없습니다. 위 검색창에서 찾아 보세요.</p>
      )}
      <p className="dv-more-foot">지난 1년 지급일 기준입니다. 담으면 위 달력이 바로 바뀝니다.</p>
    </div>
  );
}

/* ── 바스켓 투자금 ────────────────────────────────────────────────── */
/* ── 목표까지 — 월 얼마를 받으려면 얼마가 있어야 하고, 매달 얼마씩 넣으면 언제 닿나 ─────────
   지금 담은 종목의 비율(세후 수익률 = 1년 세후 배당 ÷ 투자금)이 그대로 간다고 치고 센다. 배당은
   받는 족족 같은 비율로 다시 담고(재투자), 주가와 배당은 지금과 같다고 본다 — 그 셋을 글자로 적는다.
   달 수는 한 달씩 굴려서 센다(닫힌 식보다 읽기 쉽고 600달이면 즉시다). */
