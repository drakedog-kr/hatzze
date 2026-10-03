"use client";

// 원인 분해 시트와 회복 범위 선. MddExplorer.tsx 에서 옮겨 왔다(shared.ts 머리말 참고).
// v2(2026-10-03): 회복 · 성격 · Top 5 시트는 V2Sheets.tsx 의 사례 표 · 회복 칸으로, 테마 시트는 한 줄 막대(ThemeModule)로 옮겨 여기서 걷었다.

import { C, MONO } from "../ui";
import { SectionHead } from "../kadera/SectionHead";
import { fmtPct, benchName, fmtDur, DOWN, UP, DOWN_BAR, UP_BAR, UP_BAR_SOFT } from "./shared";
import type { AttributionData } from "./shared";
import { Sheet, MeterRow } from "./sheet";

/* ── 원인 분해 ─────────────────────────────────────────────────── */
export function Attribution({
  attr,
  stockName,
  themeName,
  themePeers,
  market,
}: {
  attr: AttributionData;
  stockName: string;
  themeName: string | null;
  themePeers: string[];
  market: string | null;
}) {
  const rows: { label: string; v: number; self: boolean; color: string; help?: string }[] = [];
  if (attr.market !== null) rows.push({ label: benchName(market), v: attr.market, self: false, color: DOWN_BAR[4] });
  if (attr.theme !== null)
    rows.push({
      label: `${themeName ?? "테마"} 업종`,
      v: attr.theme,
      self: false,
      color: DOWN_BAR[2],
      // "○○ 업종"이 어떤 종목인지 툴팁으로 밝힌다 — 이 종목은 뺀 나머지 대표 종목 평균이다.
      help: themePeers.length ? `${themePeers.join(" · ")}의 평균입니다(이 종목 제외).` : undefined,
    });
  rows.push({ label: stockName, v: attr.stock, self: true, color: DOWN_BAR[0] });
  const worst = Math.max(...rows.map((r) => Math.abs(r.v)), 1);

  /* 기준은 업종(없으면 시장). 종목이 기준보다 얼마나 더/덜 빠졌나.
     gap 이 음수면 종목이 더 빠진 것 = 설명되지 않는 초과낙폭.

     ⚠️ **gap 이 양수인 경우가 드물지 않다.** 업종보다 덜 빠진 종목이 절반쯤 되고
     (2026-08 실측: 삼성전자 −33.9% vs 반도체 −40.6%), 그때 '종목 탓 %'를 그대로 내면
     음수가 된다("종목 탓 −20%"). 비율 자체를 뒤집지 않고 **문장과 막대의 주인공을
     바꾼다** — 초과낙폭이 아니라 '덜 빠진 몫'을 말한다. */
  const bench = attr.theme ?? attr.market;
  const gap = bench !== null && attr.stock !== 0 ? attr.stock - bench : null;
  const excess = gap !== null && gap < 0;
  const benchLabel = attr.theme !== null ? "업종" : benchName(market);

  return (
    <Sheet>
      <SectionHead level={3} icon="call_split" title="시장 탓일까, 종목 탓일까" desc="지수·업종과 견줘 이 종목만의 낙폭이 얼마인지" note="같은 기간" />
      <div className="mdd-attr-body" style={{ flex: 1, padding: "20px 22px", display: "flex", flexDirection: "column", gap: 18 }}>
        {/* 큰 수치는 **아래 각주·히어로 해설과 같은 값·같은 단위**여야 한다(2026-08-04).
            예전엔 여기만 '몫'(|gap| ÷ 자기 낙폭 = 14%)이라, 한 시트 안에서 14% 와 4.9%p 가
            같은 것을 말하는 듯 다르게 적혔다. 게다가 그 14% 는 아래 막대 어디에도 안 보이는
            숫자였다 — 지금 값(gap)은 업종 막대와 종목 막대의 차이로 눈에 그대로 잡힌다.

            단위는 %p 로 둔다. 두 낙폭률의 **차이**라 % 로 적으면 틀린 말이 된다
            (−38.7% 대비 −33.8% 는 '4.9% 덜'이 아니라 '12.7% 덜'이다).

            색은 온도색을 안 쓴다. 이 값은 오르내림이 아니라 '견줘서 얼마나 벌어졌나'인데
            34px 짜리 빨강이 경보처럼 읽혔다. 방향은 낱말('종목 탓'/'덜 빠진 폭')이 지고,
            온도색은 아래 막대와 각주가 맡는다. */}
        {gap !== null && (
          <div style={{ display: "flex", alignItems: "baseline", gap: 9, flexWrap: "wrap" }}>
            <strong style={{ fontFamily: MONO, fontSize: "var(--fs-34)", fontWeight: 800, letterSpacing: "-.035em", lineHeight: 1, color: C.ink }}>
              <span style={{ fontSize: "var(--fs-17)", fontWeight: 700 }}>{excess ? "종목 탓 " : "덜 빠진 폭 "}</span>
              {Math.abs(gap).toFixed(1)}
              <span style={{ fontSize: "var(--fs-17)", fontWeight: 700 }}>%p</span>
            </strong>
            <span style={{ fontSize: "var(--fs-11-5)", color: C.sub2 }}>{benchLabel} 평균보다 {excess ? "깊은" : "얕은"} 하락</span>
          </div>
        )}
        {/* 옆 시트(이 하락의 성격)에 맞춰 늘어나는데 여긴 막대 셋뿐이라 가운데가 빈다.
            줄 간격을 벌려 채우지는 않는다 — 길이를 견주는 차트라 막대끼리 멀어지면
            비교가 어려워진다. 묶음을 붙여 둔 채 남는 공간을 위아래로 가른다. */}
        {/* v2(2026-10-03): 막대 셋을 가는 선으로 나눈 줄로 두고 남는 높이를 줄마다 나눠 받는다(v2.css .mdd-attr-rows) —
            위아래가 비면 v2 의 '빈 곳 금지'에 걸린다. 줄 사이가 벌어져도 선이 표로 묶어 견주기가 남는다. */}
        <div className="mdd-attr-rows" style={{ flex: 1, display: "flex", flexDirection: "column", gap: 11, justifyContent: "center" }}>
          {rows.map((r) => (
            // 고점 이후 수익률이라 시장·업종은 상승(+)일 수도 있다 — 그때만 빨강으로 가른다.
            <MeterRow
              key={r.label}
              label={r.label}
              pct={(Math.abs(r.v) / worst) * 100}
              value={fmtPct(r.v)}
              color={r.v >= 0 ? UP_BAR : r.color}
              ink={r.v >= 0 ? UP : DOWN}
              strong={r.self}
              help={r.help}
              labelWidth={82}
            />
          ))}
        </div>
        {/* 결론 상자("시장·업종으로 설명되지 않는 −4.8%p가 이 종목 고유의 낙폭입니다")가 여기 있었다.
            바로 위 큰 숫자("종목 탓 4.8%p")와 같은 말이었다(2026-09-23). 숫자와 막대가 결론을 말한다. */}
      </div>
    </Sheet>
  );
}

/* ── 회복 범위 선 — v2 회복 모듈(V2Sheets.tsx RecoveryModule)이 쓴다. 옛 회복 · 성격 · Top 5 시트는 v2 에서 사례 표와 회복 칸으로 합쳤다(2026-10-03). ── */
/** 최단~최장 범위 선 위에 중앙값 마커. 색은 회복이므로 빨강이다. */
export function RecoveryRange({ min, median, max }: { min: number; median: number; max: number }) {
  const at = ((median - min) / (max - min)) * 100;
  const dot: React.CSSProperties = {
    position: "absolute",
    top: 2,
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: C.card,
    border: `2px solid ${UP_BAR_SOFT}`,
    boxSizing: "border-box",
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      <div style={{ position: "relative", height: 12 }}>
        <span style={{ position: "absolute", left: 0, right: 0, top: 5, height: 2, borderRadius: 99, background: UP_BAR_SOFT }} />
        <span style={{ ...dot, left: 0 }} />
        <span style={{ ...dot, right: 0 }} />
        <span style={{ position: "absolute", left: `${at}%`, top: 0, width: 12, height: 12, marginLeft: -6, borderRadius: "50%", background: UP }} />
      </div>
      {/* 라벨은 양 끝을 안쪽으로 붙인다 — 중앙값이 끝에 가까우면 겹치지만, 셋 다 값이
          숫자로 적혀 있어 읽는 데 지장이 없다. */}
      <div style={{ position: "relative", height: 14 }}>
        <span style={{ position: "absolute", left: 0, top: 0, fontFamily: MONO, fontSize: "var(--fs-11)", fontWeight: 700, color: C.muted }}>{fmtDur(min)}</span>
        <span
          style={{
            position: "absolute",
            left: `${at}%`,
            top: 0,
            transform: "translateX(-50%)",
            fontFamily: MONO,
            fontSize: "var(--fs-11)",
            fontWeight: 800,
            color: UP,
            whiteSpace: "nowrap",
          }}
        >
          중앙값 {fmtDur(median)}
        </span>
        <span style={{ position: "absolute", right: 0, top: 0, fontFamily: MONO, fontSize: "var(--fs-11)", fontWeight: 700, color: C.muted }}>{fmtDur(max)}</span>
      </div>
    </div>
  );
}
