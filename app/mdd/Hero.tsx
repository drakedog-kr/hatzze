"use client";

// 히어로 — 낙폭 게이지·물속 차트·해설 문단. MddExplorer.tsx 에서 그대로 옮겨 왔다(shared.ts 머리말 참고).

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MddAnalysis } from "@/lib/mdd";
import { C, Icon, MONO } from "../ui";
import { SectionHead } from "../kadera/SectionHead";
import { StockLogo } from "../StockLogo";
import { fmtPct, fmtPrice, benchName, benchParticle, benchVerb, fmtDur, fmtDayCount, DOWN, UP, DOWN_BAR } from "./shared";
import type { MddResult } from "./shared";
import { Sheet, Foot, StatCell, Pill } from "./sheet";

function Reading({ data, periodLabel }: { data: MddResult; periodLabel: string }) {
  const a = data.analysis;
  const p: React.CSSProperties = { margin: 0, fontSize: "var(--fs-14)", lineHeight: 1.7, color: C.inkSoft, wordBreak: "keep-all" };
  const b = (color?: string) => ({ fontWeight: 800, color: color ?? C.ink });
  const paras: React.ReactNode[] = [];

  // 1 — 얼마나 드문 깊이인가.
  //
  // ⚠️ 두 수는 모집단이 다르다. bigDrops 는 −20% 보다 깊은 사건만(depthHistogram), similarCount 는
  //    깊이와 상관없이 **지금보다 깊었던** 사건 전부(recoveryStats)다. 지금 낙폭이 −20% 보다
  //    얕으면 뒤가 앞보다 커진다(NVDA −2.3% 일 때 7 vs 64, 2026-09-09 실측). 그래서 뒤 문장을
  //    "그중" 으로 앞에 묶지 않고, 지금 낙폭을 적어 자기 모집단을 스스로 말하게 한다.
  const bigDrops = a.depthBuckets.reduce((s, d) => s + d.count, 0);
  if (bigDrops > 0) {
    paras.push(
      <p key="depth" style={p}>
        {periodLabel} 동안 <b style={b()}>−20%보다 깊이</b> 잠긴 구간은 {bigDrops}번이었고, 가장 깊었던 때는{" "}
        <b style={b()}>{fmtPct(a.mdd)}</b>였습니다.
        {a.recovery && a.recovery.similarCount > 0 && (
          <>
            {" "}
            지금({fmtPct(a.currentDd)})보다 깊이 잠긴 적은 같은 기간에 {a.recovery.similarCount}번입니다.
          </>
        )}
      </p>,
    );
  }

  // 2 — 시장·업종으로 설명되는 몫과 안 되는 몫.
  const attr = data.attribution;
  if (attr) {
    const bench = attr.theme ?? attr.market;
    const themeName = data.theme?.name;
    const gap = bench !== null ? attr.stock - bench : null;
    paras.push(
      <p key="attr" style={p}>
        {/* ⚠️ 기준 지수가 **올랐을 때**를 빼먹으면 안 된다. 국장은 이 문장이 쓰이는
            대부분의 날에 코스피도 같이 빠져 있어 "빠졌습니다"가 맞았는데, 미장을 들이자
            바로 드러났다 — "S&P500은 +3.4% 빠졌습니다"(실측). 부호로 동사를 가른다. */}
        같은 기간 {benchName(data.market)}
        {benchParticle(data.market)}{" "}
        {attr.market !== null ? fmtPct(attr.market) : "기록이 없고"}
        {attr.theme !== null && <>, {themeName ?? "테마"} 업종은 {fmtPct(attr.theme)}</>}{" "}
        {benchVerb(attr.market, attr.theme)}.
        {gap !== null &&
          (gap < 0 ? (
            <>
              {" "}
              시장·업종으로 설명되지 않는 <b style={b(DOWN)}>{fmtPct(gap)}p</b>가 이 종목 고유의 낙폭입니다.
            </>
          ) : (
            <>
              {" "}
              이 종목은 오히려 <b style={b(UP)}>{fmtPct(gap)}p</b> 덜 빠졌습니다.
            </>
          ))}
      </p>,
    );
  }

  // 3 — 과거엔 회복까지 얼마나 걸렸나.
  const r = a.recovery;
  if (r) {
    paras.push(
      <p key="rec" style={p}>
        {r.recoveredCount >= 2 ? (
          <>
            과거 {r.recoveredCount}번의 회복은 <b style={b()}>중앙값 {fmtDur(r.medianDays!)}</b>({fmtDur(r.minDays!)}~
            {fmtDur(r.maxDays!)})이 걸렸습니다.
          </>
        ) : r.recoveredCount === 1 ? (
          <>
            고점을 되찾은 전례는 <b style={b()}>{fmtDur(r.medianDays!)}</b> 걸린 한 번뿐이라, 기간은 범위로만 참고하십시오.
          </>
        ) : (
          <>
            이만큼 깊게 빠진 뒤 <b style={b()}>회복한 전례가 없습니다</b>. 지금이 이 종목의 역대 최대 낙폭입니다.
          </>
        )}
      </p>,
    );
  }

  // 정직성 경고 — 겹쳐 쌓지 않고 필요한 것만.
  const approxYears = (Date.parse(a.asOf) - Date.parse(a.firstDate)) / (365 * 86_400_000);
  const caution =
    data.years === "all"
      ? "전체 구간에는 합병·감자·액면병합이 섞여 있어, 아주 오래된 낙폭은 지금의 회사와 다를 수 있습니다."
      : approxYears < 2
        ? "표본이 짧아 더 오래된 종목과 같은 무게로 보지 마십시오."
        : null;

  return (
    <>
      {paras}
      {caution && (
        <p style={{ ...p, fontSize: "var(--fs-11)", color: C.muted, marginTop: "auto" }}>
          <Icon name="info" style={{ fontSize: "var(--fs-13)", verticalAlign: -2, marginRight: 4 }} />
          {caution}
        </p>
      )}
    </>
  );
}

/* ── 히어로 스트립 ─────────────────────────────────────────────────
   시트 하나를 flex-wrap 으로 3분할한다. **고정 3열 그리드를 쓰면 안 된다** — 좁은 폭에서
   세 칸이 합쳐 컨테이너를 넘긴다. 셀마다 flex-basis 를 주고 알아서 접히게 둔다. */

export function HeroStrip({ data, periodLabel }: { data: MddResult; periodLabel: string }) {
  const a = data.analysis;
  const atHigh = a.currentDd > -1;
  const sincePeak = Math.round((Date.parse(a.asOf) - Date.parse(a.athDate)) / 86_400_000);
  const fromLow = a.low > 0 ? (a.price / a.low - 1) * 100 : 0;

  /* 셀 경계는 셀이 자기 **오른쪽·아래** 두 곳에 inset 으로 긋는다(globals.css 의
     .hz-cellgrid 와 같은 방식). 오른쪽만 그으면 좁은 폭에서 세 셀이 세로로 쌓일 때
     경계가 통째로 사라지고(실측 820px: 셀 셋이 각각 554px 전폭), 그 선은 시트
     오른쪽 테두리와 겹쳐 버린다.

     아래 감싸는 div 의 margin-bottom:-1px 이 짝이다 — 모든 셀이 아랫선을 그으면
     마지막 줄의 선이 시트 바닥 테두리와 겹쳐 2px 로 두꺼워지는데, 1px 짧게 잡아
     시트 밖으로 밀면 overflow:hidden 이 잘라 준다. 셀 개수를 안 세도 된다. */
  const cell: React.CSSProperties = {
    minWidth: 0,
    padding: "20px 22px",
    display: "flex",
    flexDirection: "column",
    gap: 14,
    boxShadow: `inset -1px 0 0 ${C.line}, inset 0 -1px 0 ${C.line}`,
  };

  return (
    <section className="hz-sheet">
      <div style={{ display: "flex", flexWrap: "wrap", marginBottom: -1 }}>
      {/* 1 — 분석 종목 */}
      <div style={{ ...cell, flex: "1 1 290px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <span style={{ fontSize: "var(--fs-14)", fontWeight: 700, letterSpacing: "-.01em", color: C.ink }}>분석 종목</span>
          {data.market && <Pill>{data.market}</Pill>}
        </div>
        {/* 로고는 글자 기준선이 아니라 가운데에 맞아야 한다 — baseline 이면 정사각형
            타일이 글자 밑선에 걸려 위로 떠 보인다. */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", minWidth: 0 }}>
          <StockLogo code={data.code} name={data.name} market={data.market} size={30} />
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
            <strong style={{ fontSize: "var(--fs-21)", fontWeight: 800, letterSpacing: "-.03em", color: C.ink }}>{data.name}</strong>
            <span style={{ fontFamily: MONO, fontSize: "var(--fs-11)", color: C.muted }}>{data.code}</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 9, flexWrap: "wrap" }}>
          <strong style={{ fontFamily: MONO, fontSize: "var(--fs-20)", fontWeight: 800, letterSpacing: "-.03em", color: C.ink }}>{fmtPrice(a.price, data.market)}</strong>
          {a.changePct !== null && (
            <span style={{ fontFamily: MONO, fontSize: "var(--fs-12)", fontWeight: 800, color: a.changePct >= 0 ? UP : DOWN }}>{fmtPct(a.changePct)}</span>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: "auto" }}>
          <PriceRow label="전고점" date={a.athDate} value={fmtPrice(a.ath, data.market)} />
          <PriceRow label="저점" date={a.lowDate} value={fmtPrice(a.low, data.market)} />
        </div>
      </div>

      {/* 2 — 지금 낙폭 */}
      <div style={{ ...cell, flex: "1.05 1 300px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: "var(--fs-14)", fontWeight: 700, letterSpacing: "-.01em", color: C.ink }}>지금 낙폭</span>
            <span
              className="hz-tip hz-tip-wide hz-tip-start"
              data-tip={`전고점(${fmtPrice(a.ath, data.market)}) 대비 현재가가 얼마나 내려와 있는지입니다`}
              style={{ display: "inline-flex", cursor: "help" }}
            >
              <Icon name="help" style={{ fontSize: "var(--fs-14)", color: C.muted }} />
            </span>
          </span>
          {/* 오른쪽 위에 있던 '상위 11%' 배지는 걷었다(2026-08-04). 바로 아래 타일이 같은
              것을 이미 말하는데다, '상위 N%' 자체가 무엇의 상위인지 한 번 더 생각하게 했다. */}
        </div>
        {/* 밑선 맞춤은 CSS 가 한다(.hz-figrow) — 히어로 셋과 같은 짝이다.
            ⚠️ 줄간이 0.78 이었다. 가운데 맞춤에서 숫자를 억지로 끌어올리던 값인데,
            밑선으로 맞추면 필요 없을 뿐 아니라 밑선 자체를 밀어 도로 어긋난다. */}
        <div className="hz-figrow">
          <strong
            style={{ fontFamily: MONO, fontSize: "var(--fs-40)", fontWeight: 800, lineHeight: 1, letterSpacing: "-.04em", color: atHigh ? C.ink : DOWN }}
          >
            {atHigh ? "신고가 부근" : fmtPct(a.currentDd)}
          </strong>
          {!atHigh && (
            <div className="hz-figrow-aside">
              <span style={{ fontSize: "var(--fs-11-5)", fontWeight: 600, color: C.sub }}>전고점 대비</span>
              <span style={{ fontSize: "var(--fs-11-5)", fontWeight: 700, color: C.sub }}>
                저점 대비 <b style={{ color: fromLow >= 0 ? UP : DOWN, fontWeight: 800 }}>{fmtPct(fromLow)}</b>
              </span>
            </div>
          )}
        </div>
        {!atHigh && <DrawdownGauge current={a.currentDd} mdd={a.mdd} periodLabel={periodLabel} />}
        {/* 위 여백이 14 가 아니라 18.5 인 것은 **옆 칸과 선을 맞추기 위해서**다. 이 블록과
            왼쪽 칸의 전고점·저점 두 줄은 둘 다 marginTop:auto 로 칸 바닥에 붙으므로, 두
            블록의 높이가 같아야 위 경계선이 한 줄에 선다. 왼쪽은 줄마다 1 + 10 + 글줄 19.5
            + 10 = 40.5, 두 줄이라 81 이다. 이 칸은 1 + 여백 + 통계칸 61.5 라 여백이 18.5.
            14 로 두면 4.5px 어긋나는데, 거의 맞아서 오히려 더 틀려 보인다.
            ⚠️ 글자 크기를 건드리면 이 숫자를 다시 재야 한다(둘 중 한쪽만 바뀌어도 어긋난다). */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 10, marginTop: "auto", paddingTop: 18.5, borderTop: `1px solid ${C.sheetRow}` }}>
          {/* 보조 줄에 조회 기간 이름("최근 10년")은 안 붙인다 — '전체' 조회에서
              "상장 이후·약 27년 6,646일 중"이 되어 칸을 넘겼다(실측 121 > 115px).
              옆 칸 '기간 최저점'도 기간을 안 적고, 기간은 바로 위 토글이 말한다. */}
          <StatCell label="이보다 깊었던 날" value={deeperLabel(a)} sub={`${fmtDayCount(a.tradingDays)} 중`} />
          <StatCell label="기간 최저점" value={fmtPct(a.mdd)} sub={a.mddDate} tone={DOWN} />
          <StatCell label="고점 이후" value={fmtDayCount(sincePeak)} sub={`${a.athDate}부터`} />
        </div>
      </div>

      {/* 3 — 이 하락의 맥락. LLM 을 쓰지 않는다(반짝 아이콘·AI 고지 없음). */}
      <div style={{ ...cell, flex: "1.3 1 300px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              background: C.blueTint,
              color: DOWN,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flex: "none",
            }}
          >
            <Icon name="insights" style={{ fontSize: "var(--fs-14)" }} />
          </span>
          <span style={{ fontSize: "var(--fs-14)", fontWeight: 700, letterSpacing: "-.01em", color: C.ink }}>이 하락의 맥락</span>
        </div>
        <Reading data={data} periodLabel={periodLabel} />
      </div>
      </div>
    </section>
  );
}

/** 히어로 1번 셀의 전고점·저점 두 줄. 위 칸부터 선을 그어 값이 표처럼 읽히게 한다. */
function PriceRow({ label, date, value }: { label: string; date: string; value: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, padding: "10px 0", borderTop: `1px solid ${C.sheetRow}` }}>
      <span style={{ fontSize: "var(--fs-11-5)", fontWeight: 600, color: C.sub, minWidth: 0 }}>
        {label} <span style={{ fontFamily: MONO, fontSize: "var(--fs-11)", color: C.muted }}>{date}</span>
      </span>
      <span style={{ fontFamily: MONO, fontSize: "var(--fs-13)", fontWeight: 800, color: C.ink, flex: "none" }}>{value}</span>
    </div>
  );
}

/**
 * 지금 낙폭이 이 기간에서 얼마나 드문 깊이인가 — **날수로** 적는다.
 *
 * 예전엔 "상위 11%" 였는데(2026-08-04 교체), 무엇의 상위인지 한 번 더 생각해야 했다.
 * 백분위는 아래 보조 줄(`2,445일 중`)이 분모를 대면서 저절로 나온다. 날수는 곧바로
 * 손에 잡히고("280일이면 1년 남짓"), 같은 창을 쓰는 다른 시트와 단위도 맞는다.
 */
function deeperLabel(a: MddAnalysis): string {
  if (a.deeperThanNowDays === 0) return "없음";
  return fmtDayCount(a.deeperThanNowDays);
}

/** 눈금 줄 라벨 배치 결과. left 는 마커 라벨의 중심(px), null 이면 아직 안 쟀다. */
type TickFit = { left: number | null; showStart: boolean; showEnd: boolean };

const TICK_FIT_INIT: TickFit = { left: null, showStart: true, showEnd: true };

/** 라벨끼리 최소로 띄울 간격(px). 이보다 가까우면 붙어 보여서 겹친 것과 다름없다. */
const TICK_GAP = 6;

/**
 * 0 ~ −100% 게이지. 현재 위치에 마커를, 기간 최대 낙폭에 기준선을 세운다.
 * 두 눈금이 겹칠 만큼 가까우면(지금이 곧 역대 최저) 기준선을 접는다 — 같은 자리에
 * 선 두 개가 겹쳐 마커가 두꺼워 보일 뿐이다.
 */
function DrawdownGauge({ current, mdd, periodLabel }: { current: number; mdd: number; periodLabel: string }) {
  const at = Math.min(100, Math.abs(current));
  const worst = Math.min(100, Math.abs(mdd));
  const showWorst = Math.abs(worst - at) > 3;
  const [fit, setFit] = useState<TickFit>(TICK_FIT_INIT);
  const rowRef = useRef<HTMLDivElement>(null);
  const worstRef = useRef<HTMLSpanElement>(null);
  const startRef = useRef<HTMLSpanElement>(null);
  const endRef = useRef<HTMLSpanElement>(null);

  /* 눈금 줄 세 라벨의 자리를 **그린 뒤에 재서** 정한다. 왜 상수로 못 박지 않는지는
     아래 눈금 줄 주석에. 라벨을 클램프해도 폭·마커 위치는 안 변하니 한 번에 끝난다. */
  useLayoutEffect(() => {
    const row = rowRef.current;
    const label = worstRef.current;
    if (!showWorst || !row || !label) {
      setFit((prev) => (prev.left === null && prev.showStart && prev.showEnd ? prev : TICK_FIT_INIT));
      return;
    }
    const fitLabels = () => {
      const track = row.clientWidth;
      const half = label.getBoundingClientRect().width / 2;
      // 라벨을 트랙 안으로 민다. 라벨이 트랙보다 넓으면 클램프 구간이 뒤집히므로 가운데.
      const lo = Math.min(half, track / 2);
      const hi = Math.max(track - half, track / 2);
      const left = Math.min(Math.max((worst / 100) * track, lo), hi);
      const startW = startRef.current?.getBoundingClientRect().width ?? 0;
      const endW = endRef.current?.getBoundingClientRect().width ?? 0;
      const showStart = left - half >= startW + TICK_GAP;
      const showEnd = left + half <= track - endW - TICK_GAP;
      setFit((prev) =>
        prev.left === left && prev.showStart === showStart && prev.showEnd === showEnd ? prev : { left, showStart, showEnd },
      );
    };
    fitLabels();
    // 폭이 바뀌면(창 크기, 글꼴 늦게 도착) 다시 잰다. 우리가 바꾸는 건 left 뿐이라
    // 관찰 대상의 크기를 건드리지 않는다 — 되먹임이 없다.
    const ro = new ResizeObserver(fitLabels);
    ro.observe(row);
    ro.observe(label);
    return () => ro.disconnect();
  }, [showWorst, worst, mdd, periodLabel]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* 마커 위에 있던 값 라벨("−33.8%")은 걷었다(2026-08-04). 바로 위에 같은 값이 40px 로
          서 있어서 한 셀에서 같은 숫자를 두 번 읽게 했다. 대신 짝대기 머리에 **빈 동그라미**를
          얹어 핀 모양으로 만든다 — 시장 브리핑 히어로 게이지와 같은 장치이고, 라벨 없이도
          "여기를 가리킨다"가 남는다. paddingTop 도 라벨 자리(16)에서 동그라미 자리(12)로 줄인다. */}
      <div style={{ position: "relative", paddingTop: 12 }}>
        <div style={{ height: 9, borderRadius: 3, background: `linear-gradient(90deg, ${C.track}, ${DOWN_BAR[2]} 60%, ${DOWN_BAR[0]})` }} />
        {/* 짝대기 — 띠 위아래로 4px 씩 삐져나온다. 흰 링(box-shadow) 이 있어야 어느 색 위에
            서든 띠와 안 섞인다. */}
        <span
          style={{
            position: "absolute",
            left: `${at}%`,
            top: 8,
            transform: "translateX(-50%)",
            width: 2,
            height: 17,
            borderRadius: 1,
            background: C.ink,
            boxShadow: `0 0 0 2px ${C.card}`,
          }}
        />
        {/* 핀 머리. 속을 카드색으로 채워 **비어 보이게** 한다 — 꽉 찬 점은 띠 위의 데이터
            점처럼 읽히는데, 이건 값이 아니라 '가리키는 자리'다. 짝대기(top 8)의 첫 1px 을
            이 원이 덮어 이음매가 안 보인다. */}
        <span
          style={{
            position: "absolute",
            left: `${at}%`,
            top: 0,
            transform: "translateX(-50%)",
            width: 9,
            height: 9,
            borderRadius: "50%",
            border: `2px solid ${C.ink}`,
            background: C.card,
            boxSizing: "border-box",
          }}
        />
        {showWorst && (
          <span style={{ position: "absolute", left: `${worst}%`, top: 8, transform: "translateX(-50%)", width: 1, height: 13, background: C.muted }} />
        )}
      </div>
      {/* 눈금 줄. 가운데 라벨은 마커 위에 얹혀 있어서, 마커가 띠 끝에 설수록 끝 라벨을
          덮는다. 모더나(지금 −64.0% · 최대 −95.4%)에서 처음 닿았다 — 라벨이 "−100%" 를
          통째로 가린 채 트랙을 55.6px 넘어 **옆 칸까지** 나갔다. 국내 종목에는 이만큼
          깊게 빠졌다가 얕게 회복한 예가 드물어 여태 안 보였다.

          문턱을 "worst > NN 이면" 식으로 못 박지 않고 재는 이유: 이 라벨은 조회 기간
          이름을 달고 있어 폭이 96.8px("최근 1년 최대 −9.9%")에서 145.1px("상장 이후·약
          27년 최대 −99.9%")까지 오간다(11px/600 실측). 넓을 때는 **트랙 폭 287px 의
          절반**이라, 어떤 문턱을 골라도 기간 이름이나 글꼴이 조금만 바뀌면 깨진다.

          재서 두 가지를 정한다.
           1. 라벨을 트랙 안으로 민다. 끝에 서면 중앙 정렬을 포기하고 트랙 끝에 맞춘다.
           2. 그러고도 끝 라벨을 밟으면 **끝 라벨을 접는다**. 0% · −100% 는 양 끝이
              어디인지 알려 줄 뿐이고, 밟힌 쪽은 마커 라벨이 자기 값으로 이미 말한다.
          접을 때 visibility 를 쓰는 건 폭을 계속 잴 수 있어야 해서다 — 자리를 아예
          비우면 다음 측정이 "접었으니 이제 안 겹치네" 로 되짚어 깜빡인다. */}
      <div ref={rowRef} style={{ position: "relative", height: 13 }}>
        <span
          ref={startRef}
          style={{ position: "absolute", left: 0, top: 0, fontSize: "var(--fs-11)", fontWeight: 600, color: C.sub, visibility: fit.showStart ? "visible" : "hidden" }}
        >
          0%
        </span>
        {showWorst && (
          <span
            ref={worstRef}
            style={{
              position: "absolute",
              left: fit.left ?? `${worst}%`,
              top: 0,
              transform: "translateX(-50%)",
              fontSize: "var(--fs-11)",
              fontWeight: 600,
              color: C.sub,
              whiteSpace: "nowrap",
            }}
          >
            {periodLabel} 최대 {fmtPct(mdd)}
          </span>
        )}
        <span
          ref={endRef}
          style={{ position: "absolute", right: 0, top: 0, fontSize: "var(--fs-11)", fontWeight: 600, color: C.sub, visibility: fit.showEnd ? "visible" : "hidden" }}
        >
          −100%
        </span>
      </div>
    </div>
  );
}

/* 고점 대비 낙폭 곡선(언더워터). dd 는 0 이하이고 아래로 갈수록 깊다. */
export function Underwater({ a, periodLabel, market }: { a: MddAnalysis; periodLabel: string; market: string | null }) {
  const series = a.underwater;
  const mdd = a.mdd;
  const W = 720;
  const H = 176;
  // 왼쪽 여백 — y축 라벨(0%·−23%·−45%)을 이 안에 두어 곡선과 겹치지 않게 한다.
  // 예전엔 라벨을 플롯 안(x=3)에 그려 0% 가 곡선과 겹쳐 읽기 어려웠다.
  //
  // 폭은 '라벨 최대 폭(4글자 −99% 기준 실측 27.8) + 라벨↔플롯 간격 8' 로 잡는다.
  // 이러면 가장 넓은 라벨의 왼쪽 끝이 x≈0 에 딱 붙어, 오른쪽(플롯이 x=W 까지라 여백 0)과
  // 좌우 여백이 같아진다. 예전 48 은 왼쪽만 12 units 남아 오른쪽보다 넓어 보였다.
  const LABEL_GAP = 8;
  const PAD_L = 36;
  const floor = Math.min(mdd, -1); // 0 나눗셈·완전 평평 방지
  const n = series.length;
  const x = (i: number) => (n <= 1 ? PAD_L : PAD_L + (i / (n - 1)) * (W - PAD_L));
  const y = (dd: number) => (dd / floor) * H;

  const line = series.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.dd).toFixed(1)}`).join(" ");
  const area = `${line} L${W},0 Z`;

  // 연도 경계(1월로 처음 넘어가는 지점)를 눈금으로. 첫 데이터 지점은 연중(예: 2016-07)에
  // 시작해 완전한 연도가 아니고, x=0 이라 라벨이 왼쪽으로 잘린다("2016"→"16"). 그래서
  // i=0 은 건너뛰고 실제 1월 경계부터만 찍는다.
  const yearMarks: { x: number; year: number }[] = [];
  for (let i = 1; i < n; i++) {
    const yr = Number(series[i].date.slice(0, 4));
    if (Number(series[i - 1].date.slice(0, 4)) !== yr) yearMarks.push({ x: x(i), year: yr });
  }
  // 기간이 길면(전체 = 27년 등) 해마다 찍을 때 라벨이 서로 겹쳐 붙어 버린다
  // ("2001200220032004…"). 들어갈 수 있는 라벨 수를 세어 1·2·5·10년 중 가장 촘촘한
  // 간격을 고르고, 그 배수 해에만 라벨을 둔다(2005·2010·2015… 처럼 떨어지는 해로).
  const LABEL_SLOT = 68; // 라벨 하나가 차지할 최소 폭(연도 라벨 실측 ~28 + 여유)
  const maxLabels = Math.max(2, Math.floor((W - PAD_L) / LABEL_SLOT));
  let yearStep = 1;
  for (const s of [1, 2, 5, 10]) {
    yearStep = s;
    if (yearMarks.filter((t) => t.year % s === 0).length <= maxLabels) break;
  }
  const ticks = yearMarks.filter((t) => t.year % yearStep === 0);
  // 그리드 라인(0/절반/바닥) 라벨.
  const rows = [0, floor / 2, floor];
  // 기간 최저점 — 곡선에서 가장 깊은 지점에 표시를 남긴다.
  let ti = 0;
  for (let i = 1; i < n; i++) if (series[i].dd < series[ti].dd) ti = i;

  /* 확대 보기. 폰에서 이 차트는 뷰박스 720 units 가 화면 폭(≈350)으로 눌려 **절반 축척**이
     된다 — 연도·퍼센트 라벨이 11 units 라 실제 5~6px 로 찍혀 안 읽힌다.
     오버레이에서 무대 폭을 100vh 로 잡고 90도 돌리면 화면의 긴 변을 쓰게 되어 폰에서
     2배 남짓 커진다(393×830 기준 350 → 830). 같은 SVG 를 그대로 다시 그리므로
     곡선·눈금·라벨이 갈릴 일이 없다. */
  const [zoom, setZoom] = useState(false);
  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setZoom(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [zoom]);

  /* 크로스헤어 띠 — 보이지 않는 세로 띠가 눌리면 기준선(hz-vline)과 툴팁(hz-tip)을 낸다.
     위치를 **뷰박스 비율(%)**로 잡는다. 예전엔 카드 padding(22/20/42 px)을 기준으로 잡아
     그 카드 안에서만 맞았는데, 확대 보기는 padding 이 달라서 그대로 두면 곡선과 어긋난다.
     뷰박스는 `0 -6 720 202` 이고 플롯은 y 0~176 · x 36~720 이므로 비율은 이렇게 떨어진다. */
  const crosshair = (extraClass: string) => (
    <div
      className={`mdd-crosshair${extraClass}`}
      style={{
        position: "absolute",
        top: `${(6 / (H + 26)) * 100}%`,
        left: `${(PAD_L / W) * 100}%`,
        right: 0,
        bottom: `${(20 / (H + 26)) * 100}%`,
      }}
    >
      {series.map((p, i) => {
        const at = n <= 1 ? 0 : i / (n - 1);
        const edge = at < 0.25 ? " hz-tip-start" : at > 0.75 ? " hz-tip-end" : "";
        return (
          <div
            key={i}
            className={`hz-tip hz-vline${edge}`}
            data-tip={`${p.date} · ${fmtPrice(p.close, market)} · 고점 대비 ${fmtPct(p.dd)}`}
            style={{ flex: 1, position: "relative" }}
          />
        );
      })}
    </div>
  );

  const chartOnly = (
      <svg
      viewBox={`0 -6 ${W} ${H + 26}`}
      width="100%"
      style={{ overflow: "visible" }}
      role="img"
      aria-label={`고점 대비 낙폭 곡선. 현재 ${fmtPct(series[n - 1].dd)}, 기간 최저 ${fmtPct(mdd)}`}
    >
      <line x1={PAD_L} y1="0" x2={W} y2="0" stroke={C.line} strokeWidth="1" />
      {rows.slice(1).map((dd, i) => (
        <line key={i} x1={PAD_L} y1={y(dd)} x2={W} y2={y(dd)} stroke={C.line} strokeWidth="1" strokeDasharray="2 5" />
      ))}
      <path d={area} fill={DOWN_BAR[1]} fillOpacity="0.14" />
      <path d={line} fill="none" stroke={DOWN_BAR[1]} strokeWidth="1.6" strokeLinejoin="round" />
      {/* 기간 최저점 표시 — **빈 동그라미만**. 현재 지점에도 속 찬 점을 찍었었는데 뺐다:
          선이 끝나는 자리가 곧 현재이고, 그 값은 히어로가 이미 크게 말한다. */}
      <circle cx={x(ti)} cy={y(series[ti].dd)} r="3.5" fill={C.card} stroke={DOWN} strokeWidth="1.6" />
      {rows.map((dd, i) => (
        <text key={i} x={PAD_L - LABEL_GAP} y={y(dd) + 4} fontSize="11" fill={C.muted} textAnchor="end">
          {Math.round(dd)}%
        </text>
      ))}
      {ticks.map((t, i) => (
        <text key={i} x={t.x} y={H + 16} fontSize="11" fill={C.muted} textAnchor="middle">
          {t.year}
        </text>
      ))}
    </svg>
  );

  /* svg 와 띠를 한 상자에 묶는다 — 띠가 svg 박스 기준으로 앉아야 어디에 놓든 안 어긋난다. */
  const chartWith = (extraClass: string) => (
    <div style={{ position: "relative" }}>
      {chartOnly}
      {crosshair(extraClass)}
    </div>
  );

  return (
    <Sheet>
      <SectionHead level={2}
        icon="show_chart"
        title="언더워터 차트"
        desc="전고점을 0으로 두고 그 아래로 얼마나 잠겼는지"
        note={periodLabel}
      />
      <div style={{ padding: "20px 22px 16px", position: "relative" }}>
      {/* overflow:visible — 최저점 표시가 하필 마지막 지점일 때(지금이 역대 최저인
          종목) 뷰박스 오른쪽 끝에 놓여 기본값(hidden)이면 반지름만큼 잘린다. 뷰박스를
          넓히는 대신 넘침만 허용한다 — 넓히면 아래 크로스헤어 띠(퍼센트로 잡은 위치)가
          곡선과 어긋난다. */}
      {chartWith("")}
      {/* 확대 버튼 — 차트 오른쪽 아래. 리스크 프로필의 '전체보기'(.hz-yrpop-btn)와 같은
          아이콘·같은 자리 어법이라 새 언어를 안 만든다. 폰에서만 뜬다(CSS). */}
      <button
        type="button"
        className="hz-zoom-btn"
        aria-label="언더워터 차트 확대해서 보기"
        onClick={() => setZoom(true)}
      >
        <Icon name="open_in_full" style={{ fontSize: "var(--fs-15)" }} />
      </button>
      </div>
      <Foot>0%가 전고점입니다. 아래로 갈수록 그 고점에서 멀어져 있다는 뜻이며, 선이 0에 닿은 날이 고점을 되찾은 날입니다.</Foot>
      {zoom && (
        /* 스크림을 눌러도 닫힌다. 무대는 90도 돌려 화면의 긴 변을 쓴다. */
        /* ⚠️ 닫기 판정은 target 으로 한다. 무대에 stopPropagation 을 걸면 편하지만, 그러면
           document 에 걸린 툴팁 탭 리스너(app/TipTap.tsx)까지 막혀서 곡선을 짚어도
           설명이 안 뜬다 — 확대해 놓고 정작 값을 못 보는 꼴이 된다. */
        <div className="hz-zoom-scrim" role="dialog" aria-modal="true" aria-label="언더워터 차트 확대" onClick={(e) => { if (e.target === e.currentTarget) setZoom(false); }}>
          <button type="button" className="hz-zoom-close" aria-label="닫기" onClick={() => setZoom(false)}>
            <Icon name="close" style={{ fontSize: "var(--fs-20)" }} />
          </button>
          <div className="hz-zoom-stage">
            {chartWith(" mdd-crosshair-zoom")}
          </div>
        </div>
      )}
    </Sheet>
  );
}

/* ── 리스크 프로필 ─────────────────────────────────────────────────
   세 타일이 완전히 같은 문법을 쓴다: [범례] → [연도 + 막대 2줄 + 값 2개] × 최대 4줄 →
   [요약 한 줄]. 타일마다 구조가 다르면 종목을 바꿀 때마다 길이가 들쭉날쭉해진다.
   요약 한 줄은 줄 수가 모자라도 타일 맨 아래에 붙는다 — 표본이 얇은 종목(네이버 등)에서
   요약이 막대를 따라 위로 딸려 올라가면 세 타일의 밑단이 어긋나 보인다. */
