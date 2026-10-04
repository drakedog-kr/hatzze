"use client";

// v2 배당으로 살기의 부품(2026-10-03 "카더라 · MDD 에서 배운 규칙으로"). 계산은 그대로 두고 꼴과 배치만 v2 로 옮겼다.
//  - 첫 줄 띠 — 담을 수 있는 종목 수 · 달러 환율 · 종가 기준일(카더라 · MDD 와 같은 부품 .v2-cover).
//  - 둘째 줄 셋 — 1년에 받는 배당 | 달마다 들어오는 돈 | 다가오는 일정. 예전엔 한 시트 안에서 표 아래로 2,400px 를 내려가야 달력 · 일정이
//    보였다. 결과를 먼저 세운다. 담은 종목이 없으면 셋 다 안 선다(예시 미리보기는 2026-10-03 걷었다 — 고른 것처럼 읽혔다).

import { Icon } from "../ui";
import { CoverMeta, Module } from "../kadera/V2Modules";
import { fmtCloseDay } from "../mdd/shared";
import { ACCOUNTS } from "./tax";
import type { Account } from "./tax";
import { MonthCalendar, UpcomingRows, type UpcomingItem } from "./Calendar";
import { MONTHS } from "./shared";
import { pct, won, wonShort } from "./format";

const md = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;

/* ── 첫 줄 띠 ─────────────────────────────────────────────────────── */
/**
 * 이 화면 어디에도 숫자로 없던 것 — 담을 수 있는 종목이 몇이나 되나(검색 결과 없을 때 문장에만 있었다), 미국 종목을 원화로
 * 바꾼 환율, 종가가 어느 날 것인가. ⛔ 계산 결과는 싣지 않는다 — 바로 아래 칸이 크게 말한다.
 */
export function DvCover({
  counts,
  usdkrw,
  priceDate,
  usPriceDate,
}: {
  counts: { kr: number; us: number; etf: number };
  usdkrw: { rate: number; date: string | null } | null;
  priceDate: string | null;
  usPriceDate: string | null;
}) {
  const n = (v: number) => v.toLocaleString("ko-KR");
  const meta = priceDate
    ? `${fmtCloseDay(priceDate)} 종가 기준${usPriceDate && usPriceDate !== priceDate ? ` · 미국 ${md(usPriceDate)}` : ""}`
    : "종가 기준일 없음";
  return (
    <div className="v2-cover">
      <div className="v2-cover-cell v2-cover-idx">
        <span className="v2-cover-k">담을 수 있는 종목</span>
        <span className="v2-cover-v">
          <em>국내</em>
          <b>{n(counts.kr)}</b>
        </span>
        <span className="v2-cover-v">
          <em>미국</em>
          <b>{n(counts.us)}</b>
        </span>
        <span className="v2-cover-v">
          <em>ETF</em>
          <b>{n(counts.etf)}</b>
        </span>
      </div>
      {usdkrw && (
        <div className="v2-cover-cell">
          <span className="v2-cover-k">달러 환율</span>
          <span className="v2-cover-v">
            <b>{usdkrw.rate.toLocaleString("ko-KR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}원</b>
            {usdkrw.date && <span className="v2-cover-chg">{md(usdkrw.date)}</span>}
          </span>
        </div>
      )}
      <CoverMeta updated={meta} />
    </div>
  );
}

/* ── 세후 · 세전 ──────────────────────────────────────────────────── */
function TaxSeg({ afterTax, onChange }: { afterTax: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="hz-seg hz-seg-hover v2-dv-seg" role="group" aria-label="세금 반영">
      {[
        { on: true, label: "세후" },
        { on: false, label: "세전" },
      ].map((o) => (
        <button key={o.label} type="button" aria-pressed={afterTax === o.on} onClick={() => onChange(o.on)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ── 1년에 받는 배당 ──────────────────────────────────────────────── */
/**
 * 큰 숫자 하나 + 줄 셋(한 달 평균 · 투자금 · 배당수익률) + 계좌 고르기. 옛 히어로의 회색 타일 셋을 가는 선으로 나눈 줄로 바꿨다(MDD 종목 칸과 같은 줄 꼴).
 */
export function YearlyModule({
  total,
  invest,
  yieldPct,
  onCostNote,
  afterTax,
  onTax,
  account,
  onAccount,
  mixed,
  help,
  note,
}: {
  total: number;
  invest: number;
  yieldPct: number | null;
  /** 평단을 넣은 줄이 있으면 투자금 줄 이름에 붙인다. */
  onCostNote: boolean;
  afterTax: boolean;
  onTax: (v: boolean) => void;
  account: Account;
  onAccount: (a: Account) => void;
  /** 종목마다 계좌가 다르게 담겼나(세후일 때만 참). */
  mixed: boolean;
  help: string;
  note: string | null;
}) {
  // 머리 곁글은 '계좌별'일 때만 — '세후 (ISA)'는 바로 옆 세후 · 세전 버튼과 아래 계좌 버튼이 이미 말한다. 첫 칸이 여론 칸 폭(285 · 245 · 216)으로
  // 좁아지자 긴 계좌 이름이 말줄임으로 잘렸다(2026-10-04). 1,000 미만(216)은 그마저 안 들어 숨긴다(v2.css .v2-dv-sum).
  const meta = mixed ? "계좌별" : undefined;
  return (
    <Module title="1년에 받는 배당" meta={meta} aside={<TaxSeg afterTax={afterTax} onChange={onTax} />} className="v2-dv-sum">
      <div className="v2-md-body">
        <span className="v2-card-val is-big">
          <b>{won(total)}</b>
          {/* 세금을 어떻게 뗐나 — 한 문장(2026-09-30 "너무 복잡해"로 줄인 것). 데이터 툴팁이라 15자 규칙 밖. */}
          <span className="hz-tip hz-tip-wide v2-dv-help" data-tip={help} aria-label="세금 설명">
            <Icon name="help" style={{ fontSize: 14 }} />
          </span>
        </span>
        <div className="v2-md-rows">
          <div className="v2-md-pr">
            <span className="v2-md-pr-k">한 달 평균</span>
            <b className="v2-md-pr-v">{won(total / 12)}</b>
          </div>
          {invest > 0 && (
            <div className="v2-md-pr">
              <span className="v2-md-pr-k">
                투자금{onCostNote && <span>평단 넣은 종목은 평단</span>}
              </span>
              <b className="v2-md-pr-v">{wonShort(Math.round(invest / 1e4) * 1e4)}</b>
            </div>
          )}
          {yieldPct != null && (
            <div className="v2-md-pr">
              <span className="v2-md-pr-k">배당수익률</span>
              <b className="v2-md-pr-v">{pct(yieldPct)}</b>
            </div>
          )}
        </div>
        {afterTax && (
            <div className="v2-dv-acct">
              <span className="v2-dv-acct-k">계좌</span>
              <div className="hz-seg hz-seg-hover v2-dv-seg" role="group" aria-label="어느 계좌로 세나">
                {ACCOUNTS.map((o) => (
                  <button key={o.key} type="button" aria-pressed={account === o.key} onClick={() => onAccount(o.key)}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
        )}
        {note && <p className="v2-dv-note">{note}</p>}
      </div>
    </Module>
  );
}

/* ── 달마다 들어오는 돈 ────────────────────────────────────────────── */
export function CalendarModule({
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
  const paid = MONTHS.filter((m) => monthly[m] > 0).length;
  const meta = [paid ? `1년에 ${paid}달` : "지급 달 모름", "최근 12개월", noCalCount > 0 ? `${noCalCount}종목 제외` : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <Module title="달마다 들어오는 돈" meta={meta} className="v2-dv-cal">
      <div className="v2-md-body">
        <MonthCalendar monthly={monthly} noCalCount={noCalCount} selected={selected} onPick={onPick} bare />
      </div>
    </Module>
  );
}

/* ── 다가오는 일정 ────────────────────────────────────────────────── */
export function UpcomingModule({
  items,
  sureKrw,
  expectedKrw,
  afterTax,
}: {
  items: UpcomingItem[];
  sureKrw: number;
  expectedKrw: number;
  afterTax: boolean;
}) {
  const sum = [sureKrw > 0 ? `확정 ${won(sureKrw)}` : null, expectedKrw > 0 ? `예상 ${won(expectedKrw)}` : null].filter(Boolean).join(" · ");
  const meta = ["석 달 안", sum ? `${afterTax ? "세후" : "세전"} ${sum}` : null].filter(Boolean).join(" · ");
  return (
    <Module title="다가오는 일정" meta={meta} className="v2-dv-up">
      <div className="v2-md-body">{items.length ? <UpcomingRows items={items} /> : <p className="v2-empty">석 달 안에 잡힌 일정이 없습니다.</p>}</div>
    </Module>
  );
}
