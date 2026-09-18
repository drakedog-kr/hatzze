"use client";

// 담은 종목 표와 한 줄. DividendCalculator.tsx 에서 그대로 옮겨 왔다(store.ts 머리말 참고).

import { useState } from "react";
import { StockLogo } from "../StockLogo";
import { won, usd, money, pct } from "./format";
import { isSafeAsset, fitsAccount, ACCOUNTS, ACCOUNT_SHORT } from "./tax";
import type { Account, TaxMode } from "./tax";
import { HOT_YIELD_PCT, TODAY_KST, Badges, SPLIT_OPTION, nextAccountFor } from "./shared";
import type { Line } from "./shared";

/* ── 담은 종목 표 ─────────────────────────────────────────────────── */
export function HoldingsTable({
  lines,
  inputs,
  totalInvest,
  mode,
  onClear,
  onToggle,
  onAccount,
  onSplit,
  onShares,
  onCost,
  onRemove,
}: {
  lines: Line[];
  inputs: Map<string, HTMLInputElement>;
  /** 투자금 합(원). 줄마다 비중을 내는 분모. 계산에 든 줄만의 합이다. */
  totalInvest: number;
  /** 고른 계좌 — IRP 면 안전자산 줄에 알약을 붙인다. */
  mode: TaxMode;
  onClear: () => void;
  /** 줄을 계산에 넣고(true) 빼기(false). */
  onToggle: (id: string, on: boolean) => void;
  onAccount: (id: string, acct: Account) => void;
  onSplit: (id: string) => void;
  onShares: (id: string, shares: number) => void;
  onCost: (id: string, cost: number | null) => void;
  onRemove: (id: string) => void;
}) {
  // '담은 종목'은 종목 수다 — 한 종목을 두 계좌로 나눠 두 줄이어도 하나. 줄 수는 안 적는다(2026-09-16 지적).
  const distinct = new Set(lines.map((l) => l.stock.code)).size;
  // 체크를 푼 종목이 있으면 몇 개를 뺐는지도 — 합계가 표와 다른 까닭이 이 한 마디다. "계산에 4개"는 어색하다는 지적(2026-09-18).
  const excluded = distinct - new Set(lines.filter((l) => !l.off).map((l) => l.stock.code)).size;
  return (
    <div className="dv-table" role="table" aria-label="담은 종목">
      {/* 표 위 한 줄 — 몇 종목인지와 '모두 빼기'. 바스켓을 통째로 담아 본 뒤 하나씩 ×로 지우던 것(2026-09-16). */}
      <div className="dv-table-bar">
        <span className="dv-table-count">
          담은 종목 {distinct}개{excluded > 0 && <span className="dv-table-counted"> · {excluded}개 제외</span>}
        </span>
        <button type="button" className="dv-table-clear" onClick={onClear}>
          모두 빼기
        </button>
      </div>
      <div className="dv-trow dv-thead" role="row">
        <span role="columnheader">종목</span>
        <span role="columnheader">주수 · 평단</span>
        <span role="columnheader">1주당 1년 배당</span>
        <span role="columnheader">1년에 받는 배당</span>
        <span role="columnheader">배당수익률</span>
        <span role="columnheader">비중 · 투자금</span>
        <span role="columnheader" aria-label="빼기" />
      </div>
      {lines.map((l) => (
        <HoldingRow key={l.id} line={l} inputs={inputs} weightPct={!l.off && totalInvest > 0 && l.investKrw != null ? (l.investKrw / totalInvest) * 100 : null} mode={mode} onToggle={onToggle} onAccount={onAccount} onSplit={onSplit} onShares={onShares} onCost={onCost} onRemove={onRemove} />
      ))}
    </div>
  );
}

function HoldingRow({
  line,
  inputs,
  weightPct,
  mode,
  onToggle,
  onAccount,
  onSplit,
  onShares,
  onCost,
  onRemove,
}: {
  line: Line;
  inputs: Map<string, HTMLInputElement>;
  /** 투자금 가운데 이 줄의 몫(%). 종가가 없거나 계산에서 뺀 줄이면 null. */
  weightPct: number | null;
  mode: TaxMode;
  onToggle: (id: string, on: boolean) => void;
  onAccount: (id: string, acct: Account) => void;
  onSplit: (id: string) => void;
  onShares: (id: string, shares: number) => void;
  onCost: (id: string, cost: number | null) => void;
  onRemove: (id: string) => void;
}) {
  const { stock: s, shares } = line;
  const canSplit = nextAccountFor(s, line.outside ? "general" : line.account) != null;
  // 평단 칸은 값이 있거나 열어 둔 동안만 보인다 — 줄마다 빈 칸이 서 있으면 표가 무거워진다.
  const [costOpen, setCostOpen] = useState(false);
  const showCost = line.onCost || costOpen;

  /* 이름 아래 두 줄 — 사실 조각(짧은 알약, 뜻은 title 로)과 주의(짧은 문장). 문장을 '·' 로 이어 붙였더니 세 줄이
     됐다(2026-09-13 지적). 알약 하나에 사실 하나, 문장은 주의만. */
  /* 이름 아래 알약들. 사실(회색)과 주의(붉은 기)가 한 줄에 선다 — 주의를 문장 줄로 따로 두었더니 줄이 지저분했다(2026-09-17 지적).
     툴팁은 초보자도 읽는 한두 문장 — 숫자 하나, 뜻 하나. 원천·계산법·조항은 안 적는다(같은 날 지적). */
  const facts: { text: string; title: string; warn?: boolean }[] = [];
  const md = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;
  if (s.payout) {
    const [year, p] = s.payout;
    const when = year != null ? `${year}년` : "지난 1년";
    const pctText = `${Math.round(p).toLocaleString("ko-KR")}%`;
    if (p < 0) facts.push({ text: "적자 배당", title: `${when}엔 적자였는데도 배당을 줬습니다.`, warn: true });
    else if (p > 100) facts.push({ text: `배당성향 ${pctText}`, title: `${when} 번 돈보다 많이 줬습니다. 오래 가기 어렵습니다.`, warn: true });
    else facts.push({ text: `배당성향 ${pctText}`, title: `${when} 번 돈의 ${pctText}를 배당으로 줬습니다.` });
  }
  if ((s.growthYears ?? 0) >= 10) facts.push({ text: `${s.growthYears}년 연속 늘림`, title: `${s.growthYears}년째 해마다 배당을 늘렸습니다.` });
  // 5년 연평균 증가율. 늘린 회사만이 아니라 줄인 회사도 적는다.
  if (s.growth5 != null && s.streak >= 5) {
    const g = Math.round(s.growth5);
    if (g >= 1) facts.push({ text: `5년 연 +${g}%`, title: `최근 5년 동안 해마다 ${g}%씩 늘었습니다.` });
    else if (g <= -1) facts.push({ text: `5년 연 −${-g}%`, title: `최근 5년 동안 해마다 ${-g}%씩 줄었습니다.` });
  }
  if (mode !== "gross" && line.account === "irp" && !line.outside && isSafeAsset(s)) facts.push({ text: "안전자산", title: "IRP에서 안전자산(30% 몫)으로 칩니다." });
  // 세금이 붙는 몫 — 돈이 달라지는 줄에만(전액 과세면 안 붙는다). 국내 주식은 감액배당, 국내 ETF 는 운용사가 공시한 과표.
  if (s.taxable != null && s.dps > 0 && s.taxable < s.dps * 0.99) {
    const pct = Math.round((s.taxable / s.dps) * 100);
    if (s.kind === "stock") {
      facts.push({
        text: pct <= 0 ? "비과세" : `비과세 ${100 - pct}%`,
        title: pct <= 0
          ? "감액배당이라 세금이 없습니다. 회사가 쌓아 둔 자본을 돌려주는 배당이라 그렇습니다."
          : `배당 ${won(s.dps)} 중 ${won(s.dps - s.taxable)}은 감액배당이라 세금이 없습니다.`,
      });
    } else {
      facts.push({
        text: `과세 ${pct}%`,
        title: pct <= 0 ? `분배금 ${won(s.dps)}에 세금이 안 붙습니다.` : `분배금 ${won(s.dps)} 중 ${won(s.taxable)}에만 세금이 붙습니다.`,
      });
    }
  }
  // 고배당기업(배당소득 분리과세 대상). 일반 계좌로 세는 줄에만 — ISA·연금 계좌 소득은 금융소득에 안 합친다.
  // 지난 1년 배당이 전부 감액배당(비과세)이면 안 붙인다 — 배당소득이 아니라 분리과세를 고를 몫이 없다(메가스터디, 2026-09-17 지적).
  const fullyTaxFree = s.taxable != null && s.dps > 0 && s.taxable <= 0;
  if (s.highDiv && !fullyTaxFree && (mode === "gross" || line.account === "general" || line.outside)) facts.push({ text: "분리과세", title: "고배당기업입니다. 배당이 2,000만원을 넘어도 종합과세 대신 분리과세(14~30%)를 고를 수 있습니다." });
  // 지난 날짜는 안 붙인다 — 표가 며칠 낡으면 '다음' 기준일·지급일이 어제일 수 있다.
  const todayKst = TODAY_KST;
  if (s.nextRecord && s.nextRecord >= todayKst) facts.push({ text: `기준일 ${md(s.nextRecord)}`, title: `${s.nextRecord}에 주주면 다음 배당을 받습니다.` });
  if (s.nextPay && s.nextPay[0] && s.nextPay[0] >= todayKst) facts.push({ text: `${md(s.nextPay[0])} 지급 ${money(s.nextPay[1], s)}`, title: `${s.nextPay[0]}에 1주당 ${money(s.nextPay[1], s)}을 줍니다. 회사가 정해 공시한 값입니다.` });
  else if (s.nextPay && !s.nextPay[0] && s.nextRecord && s.nextRecord >= todayKst) facts.push({ text: `확정 ${money(s.nextPay[1], s)}`, title: `다음 배당은 1주당 ${money(s.nextPay[1], s)}으로 정해졌습니다. 지급일은 아직입니다.` });

  // ── 주의(붉은 기 알약)
  if (line.outside) facts.push({ text: "일반 계좌로 셈", title: s.currency === "USD" ? "해외 종목은 이 계좌에 못 담아 일반 계좌 세율로 셌습니다." : "개별 주식은 연금 계좌에 못 담아 일반 계좌 세율로 셌습니다.", warn: true });
  // 미국은 "없다"고 못 말한다 — 허쉬·디지털리얼티처럼 1주당 배당 태그를 안 다는 회사가 있다.
  if (s.dps === 0) facts.push({ text: "배당 없음", title: s.currency === "USD" ? "공시에서 배당을 못 읽었습니다. 안 주는 회사일 수 있습니다." : "최근 1년 현금배당이 없습니다.", warn: true });
  if (s.unusual) facts.push({ text: "특별배당 섞임", title: "지난 1년에 특별·청산배당이 섞였습니다. 내년에도 이만큼 준다고 보긴 어렵습니다.", warn: true });
  // 첫 배당 — 끝난 회계연도에 배당이 없었는데 지난 1년에 있다. 국내만: 미국 연속 연수는 늘린 햇수를 물려받는다.
  else if (s.currency === "KRW" && s.kind === "stock" && s.dps > 0 && s.streak === 0) facts.push({ text: "작년 무배당", title: "지난 회계연도엔 배당이 없었습니다. 이어질지는 알 수 없습니다.", warn: true });
  if (s.kind !== "etf" && s.estimated) facts.push({ text: "추정", title: "1년치 기록이 없어 마지막 배당으로 어림한 값입니다.", warn: true });
  // 일드맥스(TSLY·MSTY)류. 지난 1년 분배가 가격의 3할을 넘으면 원금을 돌려주는 상품이라 봐야 한다.
  if ((s.yieldPct ?? 0) > HOT_YIELD_PCT) facts.push({ text: "초고배당", title: "분배금이 달마다 크게 흔들립니다. 원금을 돌려주는 몫이 섞여 있습니다.", warn: true });
  if (s.close == null) facts.push({ text: "종가 없음", title: "종가가 없어 투자금과 수익률을 못 냅니다.", warn: true });
  if (s.dps > 0 && !s.pays.length) facts.push({ text: "달력엔 없음", title: "지급일 기록이 없어 아래 달력에는 안 들어갑니다.", warn: true });

  const fractional = s.currency === "USD";
  const [sharesTyped, setSharesTyped] = useState<string | null>(null);
  const step = (d: number) => {
    setSharesTyped(null);
    onShares(line.id, Math.max(0, Math.round((shares + d) * 1e6) / 1e6));
  };
  // 이 줄의 투자금(원). 종가도 평단도 없거나 0주면 안 적는다.
  const invest = line.investKrw != null && line.investKrw > 0 ? won(line.investKrw) : null;
  return (
    <div className={`dv-trow${line.off ? " dv-trow-off" : ""}`} role="row">
      <span className="dv-tcell dv-tname" role="cell">
        {/* 계산에 넣고 빼는 체크 — 종목 앞. 끄면 줄은 흐려지고 합계에서 빠진다. 주수·평단·계좌는 그대로라 켜면 바로 되돌아온다.
            로고까지 한 라벨에 넣어 로고를 눌러도 켜지고 꺼진다 — 폰에서 체크 22px 만으로는 과녁이 좁다. */}
        <label className="dv-tcheck">
          <input type="checkbox" checked={!line.off} onChange={(e) => onToggle(line.id, e.target.checked)} aria-label={`${s.name} 계산에 넣기`} />
          <StockLogo code={s.code} name={s.name} market={s.market} />
        </label>
        <span className="dv-tname-txt">
          <span className="dv-tname-main">
            {s.name}
            <Badges s={s} />
            {/* 줄의 계좌 — 시장 배지 옆 알약. 기본 계좌를 따르면 흐리게, 따로 골랐으면 진하게. 못 담는 계좌는 목록에서 흐리고 까닭을 적는다.
                주수 칸에 두었더니 스테퍼·평단과 겹쳐 복잡해 보였다(2026-09-16 지적). */}
            {mode !== "gross" && (
              <select
                className={`dv-tacct${line.ownAccount ? " dv-tacct-own" : ""}`}
                // 못 담는 줄은 실제로 일반 계좌로 세니 태그도 그렇게 보인다(아래 주의 문구와 같은 말).
                value={line.outside ? "general" : line.account}
                // 맨 아래 '＋ 계좌'를 고르면 계좌를 바꾸는 게 아니라 같은 종목을 다른 계좌에 한 줄 더 만든다. 값은 줄의 계좌로
                // 되돌아온다(controlled). 따로 단추를 두면 줄이 복잡해진다는 지적(2026-09-16)으로 목록 안에 넣었다.
                onChange={(e) => (e.target.value === SPLIT_OPTION ? onSplit(line.id) : onAccount(line.id, e.target.value as Account))}
                aria-label={`${s.name} 계좌 유형`}
                title={
                  (line.ownAccount ? "이 줄만 따로 고른 계좌입니다." : "위에서 고른 계좌를 따릅니다. 이 줄만 바꿀 수 있습니다.") +
                  (canSplit ? " 맨 아래 '＋ 계좌'로 같은 종목을 다른 계좌에도 담습니다." : "")
                }
              >
                {ACCOUNTS.map((a) => (
                  <option key={a.key} value={a.key} disabled={!fitsAccount(s, a.key)}>
                    {ACCOUNT_SHORT[a.key]}
                    {!fitsAccount(s, a.key) ? " (못 담음)" : ""}
                  </option>
                ))}
                {/* 같은 종목을 다른 계좌에도 — 담을 수 있는 계좌가 둘 이상일 때만(미국 주식은 일반 계좌뿐이라 없다). */}
                {canSplit && <option value={SPLIT_OPTION}>＋ 계좌 (같은 종목 다른 계좌)</option>}
              </select>
            )}
          </span>
          {facts.length > 0 && (
            <span className="dv-tfacts">
              {/* 브라우저 기본 title 은 1초 뒤에야 뜨고 폰에선 안 뜬다 — 이 화면의 말풍선(.hz-tip)으로. */}
              {facts.map((f) => (
                <span key={f.text} className={`dv-tfact${f.warn ? " dv-tfact-warn" : ""} hz-tip hz-tip-wide`} data-tip={f.title}>
                  {f.text}
                </span>
              ))}
            </span>
          )}
        </span>
      </span>
      <span className="dv-tcell dv-tshares" role="cell">
        <button type="button" className="dv-step" aria-label={`${s.name} 1주 빼기`} onClick={() => step(-1)} disabled={shares <= 0}>
          −
        </button>
        <input
          ref={(el) => {
            if (el) inputs.set(line.id, el);
            else inputs.delete(line.id);
          }}
          type="number"
          inputMode={fractional ? "decimal" : "numeric"}
          min={0}
          step={fractional ? 0.000001 : 1}
          value={sharesTyped ?? String(shares)}
          aria-label={`${s.name} 주수`}
          onChange={(e) => {
            // 미국 주식은 소수점 매매(증권사 소수 여섯 자리)라 소수를 받는다(2026-09-17 피드백). 치는 동안의 "0." 이 지워지지 않게
            // 문자열을 따로 들고, 칸을 떠나면 값에서 다시 그린다. 국내는 정수.
            setSharesTyped(e.target.value);
            const raw = Number(e.target.value);
            const v = fractional ? Math.round(raw * 1e6) / 1e6 : Math.floor(raw);
            onShares(line.id, Number.isFinite(v) && v > 0 ? v : 0);
          }}
          onBlur={() => setSharesTyped(null)}
          onFocus={(e) => e.target.select()}
        />
        <button type="button" className="dv-step" aria-label={`${s.name} 1주 더하기`} onClick={() => step(1)}>
          +
        </button>
        {/* 내 평단 — 넣으면 이 줄의 투자금·수익률이 종가 대신 평단으로 선다(YOC). 비우면 종가로 돌아간다. */}
        {showCost ? (
          <label className="dv-tcost">
            <span>평단</span>
            {/* 비제어 입력 — 저장값을 value 로 되돌려 주면 "45." 처럼 치는 중인 소수점이 지워진다. */}
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step={s.currency === "USD" ? 0.01 : 1}
              placeholder={s.close != null ? String(s.currency === "USD" ? s.close : Math.round(s.close)) : ""}
              defaultValue={line.cost ?? ""}
              onChange={(e) => {
                const v = Number(e.target.value);
                onCost(line.id, Number.isFinite(v) && v > 0 ? v : null);
              }}
              onBlur={(e) => {
                if (!(Number(e.target.value) > 0)) setCostOpen(false);
              }}
              aria-label={`${s.name} 평단(1주 매수가)`}
              autoFocus={costOpen && !line.onCost}
            />
            <span>{s.currency === "USD" ? "$" : "원"}</span>
          </label>
        ) : (
          <button type="button" className="dv-tcost-open" onClick={() => setCostOpen(true)}>
            평단 넣기
          </button>
        )}
      </span>
      <span className="dv-tcell dv-tnum" role="cell">
        {s.dps > 0 ? money(s.dps, s) : "없음"}
        {/* ETF 가 주는 돈은 분배금 — 배당인지 분배금인지 묻는 피드백(2026-09-17). 주식 줄은 배당이라 아무것도 안 적는다. */}
        {s.kind === "etf" && s.dps > 0 && <span className="dv-tsub">분배금</span>}
      </span>
      <span className="dv-tcell dv-tnum dv-tstrong" role="cell">
        {won(line.netKrw)}
        {s.currency === "USD" && s.dps > 0 && <span className="dv-tsub">{usd(line.net)}</span>}
        {/* 1,128px 아래에선 비중 칸이 접히므로 투자금을 여기 아래에. 넓은 화면에선 CSS 가 숨긴다. */}
        {invest && <span className="dv-tsub dv-tinvest-m">투자금 {invest}</span>}
      </span>
      <span className="dv-tcell dv-tnum" role="cell">
        {line.yieldPct != null ? pct(line.yieldPct) : "·"}
        {line.onCost && <span className="dv-tsub">내 평단 기준</span>}
      </span>
      {/* 비중 — 투자금 가운데 이 줄이 몇 %인지. 숫자 옆에 얇은 막대로 한 번 더. 그 아래 이 줄의 투자금(주수 × 평단, 없으면 종가) —
          "내가 이 종목에 얼마 넣었지"를 히어로까지 올라가 보지 않게(2026-09-17 피드백). 주수 칸에 두었더니 주수·평단·투자금 셋이
          한 칸에 몰려 복잡해 보였다(같은 날 지적). */}
      <span className="dv-tcell dv-tnum dv-tweight" role="cell">
        {weightPct != null ? (
          <>
            {weightPct.toFixed(0)}%
            <span className="dv-tweight-bar" aria-hidden="true">
              <span style={{ width: `${Math.min(100, weightPct)}%` }} />
            </span>
          </>
        ) : (
          "·"
        )}
        {invest && <span className="dv-tsub dv-tinvest">{invest}</span>}
      </span>
      <span className="dv-tcell" role="cell">
        <button type="button" className="dv-remove" aria-label={`${s.name} 빼기`} onClick={() => onRemove(line.id)}>
          ×
        </button>
      </span>
    </div>
  );
}
