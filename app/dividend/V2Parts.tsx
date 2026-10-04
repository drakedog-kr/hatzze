"use client";

// v2 배당으로 살기의 부품(2026-10-03 "카더라 · MDD 에서 배운 규칙으로"). 계산은 그대로 두고 꼴과 배치만 v2 로 옮겼다.
//  - 첫 줄 띠 — 담을 수 있는 종목 수 · 달러 환율 · 종가 기준일(카더라 · MDD 와 같은 부품 .v2-cover).
//  - 둘째 줄 셋 — 1년에 받는 배당 | 달마다 들어오는 돈 | 다가오는 일정. 예전엔 한 시트 안에서 표 아래로 2,400px 를 내려가야 달력 · 일정이
//    보였다. 결과를 먼저 세운다. 담은 종목이 없으면 셋 다 안 선다(예시 미리보기는 2026-10-03 걷었다 — 고른 것처럼 읽혔다).

import { CoverMeta, Module } from "../kadera/V2Modules";
import { fmtCloseDay } from "../mdd/shared";
import { ACCOUNTS, ACCOUNT_SHORT } from "./tax";
import type { Account } from "./tax";
import { MonthCalendar, UpcomingRows, type UpcomingItem } from "./Calendar";
import { MONTHS } from "./shared";
import { pct, won, wonCal, wonShort } from "./format";

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
/**
 * 세후 버튼에 마우스를 올리면 떼는 세율이 뜬다(taxTip). 한때 칸 안 '떼는 세금' 줄로 늘 보였는데 "표시할 필요는 없다 — 세후 버튼에 호버하면
 * 뜨게"(2026-10-04). 그 전엔 큰 숫자 옆 물음표였다. 머리 오른쪽 끝이라 말풍선을 오른쪽 끝에 맞춘다(hz-tip-end).
 */
function TaxSeg({ afterTax, onChange, taxTip }: { afterTax: boolean; onChange: (v: boolean) => void; taxTip: string }) {
  return (
    <div className="hz-seg hz-seg-hover v2-dv-seg" role="group" aria-label="세금 반영">
      {[
        { on: true, label: "세후" },
        { on: false, label: "세전" },
      ].map((o) => (
        <button
          key={o.label}
          type="button"
          aria-pressed={afterTax === o.on}
          onClick={() => onChange(o.on)}
          className={o.on && taxTip ? "hz-tip hz-tip-end" : undefined}
          data-tip={o.on && taxTip ? taxTip : undefined}
        >
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
  taxTip,
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
  /** 세후 버튼 말풍선 — 떼는 세율('국내 15.4% · 미국 15%를 뗀 값'). */
  taxTip: string;
}) {
  // 머리 곁글은 '계좌별'일 때만 — '세후 (ISA)'는 바로 옆 세후 · 세전 버튼과 아래 계좌 버튼이 이미 말한다. 첫 칸이 여론 칸 폭(285 · 245 · 216)으로
  // 좁아지자 긴 계좌 이름이 말줄임으로 잘렸다(2026-10-04). 1,000 미만(216)은 그마저 안 들어 숨긴다(v2.css .v2-dv-sum).
  const meta = mixed ? "계좌별" : undefined;
  return (
    <Module title="1년에 받는 배당" meta={meta} aside={<TaxSeg afterTax={afterTax} onChange={onTax} taxTip={taxTip} />} className="v2-dv-sum">
      <div className="v2-md-body">
        <span className="v2-card-val is-big">
          <b>{won(total)}</b>
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
              <span className="v2-md-pr-k">{afterTax ? "세후 수익률" : "배당수익률"}</span>
              <b className="v2-md-pr-v">{pct(yieldPct)}</b>
            </div>
          )}
        </div>
        {afterTax && (
            <div className="v2-dv-acct">
              <span className="v2-dv-acct-k">계좌</span>
              <div className="hz-seg hz-seg-hover v2-dv-seg" role="group" aria-label="어느 계좌로 세나">
                {/* 짧은 이름(비과세저축) — 긴 이름이면 다섯 단추 가운데 하나만 둘째 줄에 혼자 섰다(2026-10-04 점검). 줄은 셋 · 둘로 칸을 꽉 채운다(v2.css). */}
                {ACCOUNTS.map((o) => (
                  <button key={o.key} type="button" aria-pressed={account === o.key} onClick={() => onAccount(o.key)}>
                    {ACCOUNT_SHORT[o.key]}
                  </button>
                ))}
              </div>
            </div>
        )}
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
  // '1년에 12달'은 '1년은 12달'로 읽혔다(2026-10-05 점검) — 빈 달 수로(빈 달 칸의 '0원'과 같은 말).
  const meta = [paid ? (paid === 12 ? "빈 달 없음" : `빈 달 ${12 - paid}`) : "지급 달 모름", "최근 12개월", noCalCount > 0 ? `${noCalCount}종목 제외` : null]
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
export function UpcomingModule({ items, sureKrw, expectedKrw }: { items: UpcomingItem[]; sureKrw: number; expectedKrw: number }) {
  // 짧게 — 폰에서 '석 달 안 · 세후 확정 1,173,566원 · 예상 4,242,…'가 말줄임으로 잘렸다(2026-10-05 점검). 세후 · 세전은 첫 칸 단추가 말한다.
  const sum = [sureKrw > 0 ? `확정 ${wonCal(sureKrw)}` : null, expectedKrw > 0 ? `예상 ${wonCal(expectedKrw)}` : null].filter(Boolean).join(" · ");
  const meta = [items.length ? `다음 ${items.length}건` : null, sum || null].filter(Boolean).join(" · ");
  return (
    <Module title="다가오는 일정" meta={meta} className="v2-dv-up">
      <div className="v2-md-body">{items.length ? <UpcomingRows items={items} /> : <p className="v2-empty">1년 안에 잡힌 일정이 없습니다.</p>}</div>
    </Module>
  );
}
