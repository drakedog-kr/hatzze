"use client";

// 원인 분해·회복·하락 성격·테마·큰 하락 시트들. MddExplorer.tsx 에서 그대로 옮겨 왔다(shared.ts 머리말 참고).

import { CHARACTER_MIN_DD } from "@/lib/mdd";
import type { DepthBucket, DrawdownCharacter, Episode, MddAnalysis } from "@/lib/mdd";
import { C, Icon, MONO, R } from "../ui";
import { SectionHead } from "../kadera/SectionHead";
import { fmtPct, benchName, fmtDur, fmtDayCount, fmtYm, DOWN, UP, DOWN_BAR, UP_BAR, UP_BAR_SOFT } from "./shared";
import type { ThemeCmp, AttributionData } from "./shared";
import { Sheet, AbsentSheet, StatCell, MeterRow } from "./sheet";

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
      help: themePeers.length ? `${themePeers.join(" · ")}. 이 테마 대표 종목의 평균입니다 (이 종목 제외).` : undefined,
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
      <div style={{ flex: 1, padding: "20px 22px", display: "flex", flexDirection: "column", gap: 18 }}>
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
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 11, justifyContent: "center" }}>
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
            같은 문장이 히어로 '이 하락의 맥락'에 그대로 있고, 바로 위 큰 숫자("종목 탓 4.8%p")도
            같은 말이라 한 화면에 세 번이었다(2026-09-23). 숫자와 막대가 결론을 말한다. */}
      </div>
    </Sheet>
  );
}

/* ── 회복까지 걸린 기간 ─────────────────────────────────────────── */
/**
 * 위: 회복 기간의 중앙값과 범위. 아래: 낙폭 구간별로 몇 번 있었나.
 *
 * ⚠️ 두 그래픽은 **서로 다른 표본**을 센다. 위는 `recovery.samples`(지금보다 깊었던
 * 사건만)이고 아래는 `analysis.depthBuckets`(−20% 이상 전부)다. 낙폭이 깊은 종목일수록
 * 위쪽 표본이 급격히 줄어드는데(SK하이닉스 −46%면 13건 중 2건), 아래쪽 분포까지 같이
 * 줄면 "이 정도 하락이 얼마나 흔한가"를 아예 못 그린다. 그래서 아래는 서버가 따로
 * 세어 보낸다(lib/mdd.ts 의 depthHistogram 주석 참고). 창이 다른 것을 바닥 각주로 밝혔었는데, 바닥 각주는
 * 두 시트 다 걷었다(2026-09-24 지적 — 설명이 많아 복잡해 보인다). 남긴 한 줄은 '지금 낙폭이 어느 구간인가'뿐이고
 * 중앙값 바로 아래에 둔다.
 */
export function Recovery({ a, periodLabel }: { a: MddAnalysis; periodLabel: string }) {
  const r = a.recovery!;
  /* 회복 표본이 하나면 중앙값 = 최단 = 최장이라 범위 선이 한 점으로 뭉갠다. 둘 이상일
     때만 선과 중앙값 마커를 둔다. 표본 하나는 곧 '회복한 전례가 한 번뿐'인 종목이다. */
  const hasRange = r.recoveredCount >= 2 && r.minDays !== null && r.maxDays !== null && r.maxDays > r.minDays;
  const sincePeak = Math.round((Date.parse(a.asOf) - Date.parse(a.athDate)) / 86_400_000);

  const buckets = a.depthBuckets;
  const maxCount = Math.max(...buckets.map((b) => b.count), 1);
  const inBucket = (b: DepthBucket) => a.currentDd <= b.from && (b.to === null || a.currentDd > b.to);
  const bucketLabel = (b: DepthBucket) => (b.to === null ? `${b.from}% 이하` : `${b.from} ~ ${b.to}%`);
  const here = buckets.find(inBucket);

  return (
    <Sheet>
      <SectionHead level={3}
        /* ⚠️ schedule(벽시계) 이었다. 짝으로 나란히 서는 왼쪽 시트('역대 낙폭 Top 5')가
           history 를 쓰는데 그것도 시계라, 한 줄에 시계 둘이 붙어 있었다. 이 시트가 답하는
           것은 시각이 아니라 **얼마나 걸렸나**이므로 스톱워치가 뜻에도 더 가깝다.
           ⚠️ 위 `AbsentSheet` 도 같이 바꿀 것 — 같은 자리에 번갈아 선다. */
        icon="timer"
        title="회복까지 걸린 기간"
        desc="과거 사례로 본 회복 소요 기간"
        note={r.recoveredCount > 0 ? `표본 ${r.recoveredCount}회` : "전례 없음"}
      />

      <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 16, borderBottom: `1px solid ${C.line}` }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 9, flexWrap: "wrap" }}>
            <strong style={{ fontFamily: MONO, fontSize: "var(--fs-34)", fontWeight: 800, letterSpacing: "-.035em", lineHeight: 1, color: r.recoveredCount > 0 ? C.ink : DOWN }}>
              {r.recoveredCount > 0 ? fmtDur(r.medianDays!) : fmtDayCount(sincePeak)}
            </strong>
            <span style={{ fontSize: "var(--fs-11-5)", color: C.sub2, wordBreak: "keep-all" }}>
              {r.recoveredCount === 0
                ? "째 회복 못 함 · 이만큼 깊게 빠진 뒤 되찾은 전례가 없습니다"
                : hasRange
                  ? "중앙값" // 범위(최소~최대)는 바로 아래 막대 양 끝이 적는다(2026-09-23 — 같은 말이 두 번이었다)
                  : "고점을 되찾은 전례는 이 한 번뿐입니다"}
            </span>
          </div>
          {/* 바닥 각주였던 한 줄을 여기로 올렸다(2026-09-24). 글꼴은 리스크 프로필 타일의 머리 문장
              ("큰 하락 5번 모두 코스피도 함께 빠졌습니다")과 같다 — 13px · inkSoft · 숫자만 굵게.
              문장은 "…1번이던 구간에 들어 있습니다"가 어색하다는 지적으로 후보 다섯 중에서 골랐다(2026-09-24).
              ⚠️ here.count 에는 진행 중인 하락도 **그 저점 깊이로** 들어간다(depthHistogram). 지금 낙폭과 저점이 같은
                 구간이면 그 '1번'이 지금 자신이다(알테오젠 −77.3% · 저점 −82.4% → −50% 이하 1번). */}
          {here && here.count > 0 && (
            <p style={{ margin: 0, fontSize: "var(--fs-13)", lineHeight: 1.7, color: C.inkSoft, wordBreak: "keep-all" }}>
              지금 낙폭(<b style={{ fontWeight: 800, color: C.ink }}>{fmtPct(a.currentDd)}</b>)은 {periodLabel}에{" "}
              <b style={{ fontWeight: 800, color: C.ink }}>{here.count}번</b> 나왔던 깊이입니다
            </p>
          )}
        </div>
        {hasRange && <RecoveryRange min={r.minDays!} median={r.medianDays!} max={r.maxDays!} />}
      </div>

      {/* flex:1 + 가운데 정렬 — 옆 시트(역대 낙폭 Top 5)가 다섯 줄이라 이 시트가 그 높이로
          늘어나는데 여긴 네 줄뿐이다. 줄 간격을 벌려 채우지는 않는다(길이를 견주는 막대라
          서로 멀어지면 비교가 어려워진다). 묶음을 붙여 둔 채 남는 공간을 위아래로 가른다. */}
      <div style={{ flex: 1, padding: "18px 22px", display: "flex", flexDirection: "column", gap: 12, justifyContent: "center" }}>
        <span style={{ fontSize: "var(--fs-11)", fontWeight: 700, letterSpacing: ".06em", color: C.sub }}>낙폭 구간별 발생 횟수 · {periodLabel}</span>
        {buckets.map((b) => {
          const on = inBucket(b);
          return (
            <MeterRow
              key={b.from}
              label={bucketLabel(b)}
              pct={(b.count / maxCount) * 100}
              value={`${b.count}회`}
              color={on ? DOWN_BAR[0] : DOWN_BAR[3]}
              ink={DOWN}
              strong={on}
              labelWidth={74}
              valueWidth={26}
            />
          );
        })}
      </div>
    </Sheet>
  );
}

/** 최단~최장 범위 선 위에 중앙값 마커. 색은 회복이므로 빨강이다. */
function RecoveryRange({ min, median, max }: { min: number; median: number; max: number }) {
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

/* ── 이 하락의 성격 ─────────────────────────────────────────────── */
/* ch 가 null 이어도 카드를 지우지 않고 "왜 못 따지는지"를 남긴다.
   예전엔 통째로 숨겼는데, 문턱(−8%)이 절벽이라 카드가 깜빡였다 — KB금융은 −7.9% 라
   0.1%p 차이로 사라져서, 하루 사이 생겼다 없어졌다 하면 "어제 있던 게 왜 없지"가 된다.
   2열 그리드에서 짝이 어긋나 옆 카드 가운데가 텅 비던 것도 같이 사라진다. */

export function Character({ ch, currentDd }: { ch: DrawdownCharacter | null; currentDd: number }) {
  if (!ch) return <CharacterAbsent currentDd={currentDd} />;
  const isFast = ch.currentClass === "fast";
  const curLabel = isFast ? "급락형" : "완만형";
  const hasBuckets = Boolean(ch.fast || ch.slow);
  const compare =
    ch.fast && ch.slow
      ? `과거 하락은 급락형이 완만형보다 회복이 ${ch.fast.medianRecovery < ch.slow.medianRecovery ? "빨랐" : "느렸"}습니다.`
      : null;
  const tiles: { label: string; sub: string; b: { count: number; medianRecovery: number } | null; on: boolean }[] = [
    { label: "급락형", sub: "빠르게 빠진 하락", b: ch.fast, on: isFast },
    { label: "완만형", sub: "오래 흘러내린 하락", b: ch.slow, on: !isFast },
  ];
  // 하루 평균 낙폭 — "201일에 걸쳐 −42.5%"가 하루치로는 얼마인지.
  const perDay = ch.currentTroughDays > 0 ? ch.currentTroughDepth / ch.currentTroughDays : null;

  return (
    <Sheet>
      <SectionHead level={3}
        icon="bolt"
        title="이 하락의 성격"
        desc="같은 깊이라도 빨리 빠진 하락과 오래 흘러내린 하락은 회복 양상이 다릅니다"
        note={curLabel}
      />
      <div style={{ flex: 1, padding: "20px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
        {hasBuckets ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(150px, 100%), 1fr))", gap: 10 }}>
            {tiles.map((t) =>
              t.b ? (
                /* 선택된 유형만 파란 틴트 + inset 링. 테두리 대신 inset box-shadow 를 쓰는
                   이유는 1.5px 링이 칸 크기를 바꾸지 않아 두 칸의 밑선이 어긋나지 않기
                   때문이다(테두리면 선택된 칸만 3px 커진다). */
                <div
                  key={t.label}
                  style={{
                    background: t.on ? C.blueTint : C.soft,
                    boxShadow: t.on ? `inset 0 0 0 1.5px ${DOWN_BAR[1]}` : "none",
                    borderRadius: R.control,
                    padding: "13px 14px",
                    minWidth: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                    {/* 틴트 위에는 강조색(--c-blue)을 쓰지 않는다 — 명암비 2.2 라 안 읽힌다. */}
                    <span style={{ fontSize: "var(--fs-12-5)", fontWeight: 800, color: t.on ? DOWN : C.ink }}>{t.label}</span>
                    <span style={{ fontSize: "var(--fs-11)", color: t.on ? C.sub : C.muted }}>· {t.b.count}회</span>
                  </div>
                  <span style={{ fontSize: "var(--fs-11)", color: t.on ? C.sub : C.sub2 }}>{t.sub}</span>
                  <strong style={{ fontFamily: MONO, fontSize: "var(--fs-21)", fontWeight: 800, letterSpacing: "-.03em", color: C.ink, marginTop: 2 }}>
                    {fmtDur(t.b.medianRecovery)}
                  </strong>
                  <span style={{ fontSize: "var(--fs-11)", color: t.on ? C.sub : C.sub2 }}>회복 중앙값</span>
                </div>
              ) : null,
            )}
          </div>
        ) : (
          <p style={{ margin: 0, color: C.muted, fontSize: "var(--fs-11-5)", lineHeight: 1.6, wordBreak: "keep-all" }}>
            <Icon name="info" style={{ fontSize: "var(--fs-14)", verticalAlign: -2, marginRight: 4 }} />
            이 기간엔 비교할 과거 하락이 부족합니다. 기간을 넓히면 급락형·완만형 회복을 비교할 수 있습니다.
          </p>
        )}
        {/* 문장은 유형과 비교만 말한다. 기간·깊이 숫자는 바로 아래 통계 칸이 적는다 — 예전엔 문장이
            "33일에 걸쳐 −21.2%"를 적고 칸이 같은 두 값을 또 적었다(2026-09-23). */}
        <span style={{ fontSize: "var(--fs-11-5)", color: C.inkSoft, lineHeight: 1.7, wordBreak: "keep-all" }}>
          지금은 <b style={{ fontWeight: 800, color: DOWN }}>{curLabel}</b>입니다.
          {compare && ` ${compare}`}
        </span>
        <div style={{ marginTop: "auto", display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 10, paddingTop: 14, borderTop: `1px solid ${C.sheetRow}` }}>
          <StatCell label="하락 기간" value={fmtDayCount(ch.currentTroughDays)} sub="고점에서 저점까지" />
          <StatCell
            label="하락일 비중"
            value={ch.currentDownDayRatio !== null ? `${Math.round(ch.currentDownDayRatio)}%` : "—"}
            sub={ch.currentDownDayRatio !== null ? `10일 중 ${(ch.currentDownDayRatio / 10).toFixed(1)}일` : "표본 부족"}
          />
          <StatCell label="저점 깊이" value={fmtPct(ch.currentTroughDepth)} sub={perDay !== null ? `하루 평균 ${fmtPct(perDay)}` : "고점 대비"} tone={DOWN} />
        </div>
      </div>
      {/* 셈법 각주("고점→저점이 N일 이하면 급락형 …")는 걷었다(2026-09-23 지적). 기준 일수는 lib/mdd.ts 의 CHARACTER_SPLIT_DAYS. */}
    </Sheet>
  );
}

/** 성격을 못 따지는 경우의 같은 자리 시트. 문턱을 넘겼는지에 따라 이유가 다르다. */
function CharacterAbsent({ currentDd }: { currentDd: number }) {
  return (
    <AbsentSheet
      icon="bolt"
      title="이 하락의 성격"
      sub="같은 깊이라도 빨리 빠진 하락과 오래 흘러내린 하락은 회복 양상이 다릅니다"
      body={
        currentDd > -1
          ? "지금은 고점 부근이라 성격을 따질 하락이 없습니다."
          : `지금 하락은 ${fmtPct(currentDd)}입니다. 고점 대비 ${Math.abs(CHARACTER_MIN_DD)}% 이상 빠졌을 때부터 급락형과 완만형을 나눕니다. 이보다 얕은 눌림은 속도로 성격을 가리기 어렵습니다.`
      }
    />
  );
}

/* ── 테마 비교 ─────────────────────────────────────────────────── */
export function Theme({ theme }: { theme: ThemeCmp }) {
  const worst = Math.max(...theme.peers.map((p) => Math.abs(p.dd)), 1);
  const self = theme.peers.find((p) => p.isSelf)!;
  // 깊게 빠진 순 등수 — dd 가 더 음수(깊음)인 종목 수 +1. 1위 = 가장 깊게 빠짐.
  const rank = theme.peers.filter((p) => p.dd < self.dd).length + 1;
  const lead =
    rank === 1
      ? "테마에서 가장 깊게 빠졌습니다."
      : rank === theme.peers.length
        ? "테마에서 가장 덜 빠졌습니다."
        : `테마 ${theme.peers.length}종목 중 낙폭 ${rank}위입니다.`;
  return (
    <Sheet>
      <SectionHead level={3}
        icon="hub"
        title={`${theme.name} 대표 ${theme.peers.length}종목 안에서`}
        desc={`${self.name}, ${lead}`}
        note={`평균 ${fmtPct(theme.avgDd)}`}
      />
      <div style={{ padding: "18px 22px 20px", display: "flex", flexDirection: "column", gap: 9 }}>
        {theme.peers.map((p) => (
          // 이 종목만 진한 파랑, 나머지는 옅은 파랑 — 전부 낙폭이라 빨강은 쓰지 않는다.
          <MeterRow
            key={p.code || p.name}
            label={p.name}
            pct={(Math.abs(p.dd) / worst) * 100}
            value={`${Math.round(p.dd)}%`}
            color={p.isSelf ? DOWN_BAR[0] : DOWN_BAR[4]}
            ink={DOWN}
            strong={p.isSelf}
            valueWidth={46}
          />
        ))}
      </div>
    </Sheet>
  );
}

/* ── 역대 낙폭 Top 5 ─────────────────────────────────────────────
   표다. **낙폭 깊은 순**으로 세우고(이미 그렇게 정렬돼 온다), 진행 중인 구간은 순서상
   제자리에 두되 파랑으로 강조한다 — 맨 위로 끌어올리면 '가장 깊은 하락'이라는 순위의
   뜻이 깨진다. */

export function TopDrawdowns({ eps }: { eps: Episode[] }) {
  const worst = Math.max(...eps.map((e) => Math.abs(e.depth)), 1);
  /* 열 폭은 .mdd-top-row(globals.css)가 잡는다. 인라인으로 두면 좁은 폭의 미디어쿼리를
     이겨서 열이 안 줄어든다. */
  return (
    <Sheet>
      <SectionHead level={3} icon="history" title="역대 낙폭 Top 5" desc="이만큼 빠졌던 구간과 회복까지 걸린 기간" note="−20% 이상" />
      <div className="hz-thead mdd-top-row">
        <span>구간</span>
        <span>낙폭</span>
        {/* '회복까지' — 이 열이 고점에서 되찾기까지 걸린 날수라는 걸 머리가 말한다. 그 말을 하던 바닥 각주는 걷었다(2026-09-24). */}
        <span style={{ textAlign: "right" }}>회복까지</span>
        <span className="mdd-top-status" style={{ textAlign: "right" }}>
          상태
        </span>
      </div>
      {eps.map((e, i) => (
        <div key={i} className="hz-trow mdd-top-row" style={{ padding: "11px 22px", background: e.recovered ? undefined : C.soft }}>
          <span style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
            <span style={{ fontSize: "var(--fs-12)", fontWeight: e.recovered ? 700 : 800, color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {fmtYm(e.peakDate)} ~ {e.recovered ? fmtYm(e.recoveryDate!) : "진행 중"}
            </span>
            {/* 이 줄도 말줄임을 걸어야 한다 — 안 걸면 "저점 2026-07-30"이 열보다 넓어
                부모를 밀어낸다(위 형제만 자르면 소용없다). */}
            <span style={{ fontFamily: MONO, fontSize: "var(--fs-11)", color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              저점 {e.troughDate}
            </span>
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            {/* shadcn 가로 막대 꼴 — 트랙 없이 두툼한 둥근 막대(hz-bar, shadcn.css). */}
            <span
              className="hz-tip hz-bar-hit"
              data-tip={`${fmtPct(e.depth)} · ${fmtYm(e.peakDate)} ~ ${e.recovered ? fmtYm(e.recoveryDate!) : "진행 중"}`}
              style={{ flex: 1, minWidth: 20, height: 14, display: "flex", alignItems: "center" }}
            >
              <span className="hz-bar" style={{ width: `${(Math.abs(e.depth) / worst) * 100}%`, background: e.recovered ? DOWN_BAR[2] : DOWN_BAR[0] }} />
            </span>
            <span style={{ width: "var(--mdd-top-depth, 44px)", flex: "none", fontFamily: MONO, fontSize: "var(--fs-11-5)", fontWeight: 800, color: e.recovered ? C.ink : DOWN }}>
              {fmtPct(e.depth)}
            </span>
          </span>
          <span style={{ fontFamily: MONO, fontSize: "var(--fs-11-5)", fontWeight: 700, color: e.recovered ? C.sub : C.muted, textAlign: "right" }}>
            {e.recovered ? fmtDayCount(e.days) : "—"}
          </span>
          <span className="mdd-top-status" style={{ fontSize: "var(--fs-11)", fontWeight: e.recovered ? 700 : 800, color: e.recovered ? C.sub : DOWN, textAlign: "right" }}>
            {e.recovered ? "회복" : "진행 중"}
          </span>
        </div>
      ))}
    </Sheet>
  );
}
