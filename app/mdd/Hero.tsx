"use client";

// 히어로 — 낙폭 게이지·물속 차트·해설 문단. MddExplorer.tsx 에서 그대로 옮겨 왔다(shared.ts 머리말 참고).

import dynamic from "next/dynamic";
import { useLayoutEffect, useRef, useState } from "react";
import type { MddAnalysis } from "@/lib/mdd";
import { C, Icon } from "../ui";
import { SectionHead } from "../kadera/SectionHead";
import { Module } from "../kadera/V2Modules";
import { SummaryModule } from "./V2Sheets";
import { StockLogo } from "../StockLogo";
import {
  fmtPct,
  fmtPrice,
  fmtDur,
  fmtDay,
  fmtYm,
  fmtDot,
  benchName,
  marketName,
  periodInfo,
  cautionShort,
  DOWN,
  UP,
  DOWN_BAR,
} from "./shared";
import type { MddResult } from "./shared";
import { Sheet, Foot, StatCell } from "./sheet";

// 확대 판(Base UI Dialog, gzip 약 20KB)은 폰에서 확대 단추를 처음 누를 때 받는다(app/insider/ChartZoom.tsx 와 같다).
const ZoomDialog = dynamic(() => import("../ZoomDialog").then((m) => m.ZoomDialog), { ssr: false });

/* ── 히어로 ──────────────────────────────────────────────────────
   둘째 줄 모듈 셋 — 종목 | 지금 낙폭 | 낙폭 요약(V2Sheets.tsx SummaryModule). 카더라 · 시장 브리핑 둘째 줄과 같은
   v2 모듈 꼴이다(2026-10-03). 예전엔 다른 화면 히어로와 같은 3칸 틀(.hz-kd-hero)에 회색 타일 둘 + 흰 문장 칸('이 하락의
   맥락' 세 문단)이었다. 그 문단은 줄마다 이름표를 단 요약으로 다시 짰다. */

export function HeroStrip({ data, periodLabel }: { data: MddResult; periodLabel: string }) {
  const a = data.analysis;
  const atHigh = a.currentDd > -1;
  const sincePeak = Math.round((Date.parse(a.asOf) - Date.parse(a.athDate)) / 86_400_000);
  const fromLow = a.low > 0 ? (a.price / a.low - 1) * 100 : 0;
  // 오늘이 신고가면 전고점 · 저점이 둘 다 오늘 종가다 — 현재가와 같은 값이 세 번 서고 '고점 이후 0일 · 저점 대비 0.0%'가 남았다(심텍, 2026-10-03).
  // 그날은 직전 큰 하락(15% 넘게 빠졌다 되찾은 마지막 것)의 고점 · 저점 · 되찾은 날을 대신 적는다.
  const drop = sincePeak === 0 ? a.lastDrop : null;
  // 등락 0.0%(반올림해 0)은 오르지도 내리지도 않았다 — 빨강으로 칠하지 않는다.
  const tone = (v: number) => (Math.abs(v) < 0.05 ? undefined : v > 0 ? "is-up" : "is-down");
  const period = periodInfo(data.years, a.firstDate, a.asOf);
  const caution = cautionShort(data.years, period.truncated, period.approxYears);

  return (
    /* v2(2026-10-03) — 회색 타일 셋을 모듈 셋으로. 카더라 · 시장 브리핑 둘째 줄과 같은 꼴이다(머리 띠 + 1px 테두리).
       세 모듈은 키가 같고(stretch) 아래 줄들은 바닥에 붙는다 — 칸 안 빈 곳은 줄 사이로 고르게 간다(v2.css .v2-md-band). */
    <div className="v2-md-band">
      {/* 1 — 종목. 머리 띠의 이름이 곧 이 화면의 주제다. */}
      <Module title={data.name} meta={`${data.code} · ${marketName(data.market)}`} className="v2-md-stock">
        <div className="v2-md-body">
          <div className="v2-md-price">
            <StockLogo code={data.code} name={data.name} market={data.market} size={32} />
            <span className="v2-card-val is-big">
              <b>{fmtPrice(a.price, data.market)}</b>
              {a.changePct !== null && <span className={["v2-md-chg", tone(a.changePct)].filter(Boolean).join(" ")}>{fmtPct(a.changePct)}</span>}
            </span>
          </div>
          <div className="v2-md-rows">
            {drop ? (
              <>
                <PriceRow label="직전 고점" date={fmtDay(drop.peakDate, a.asOf)} value={fmtPrice(drop.peak, data.market)} />
                <PriceRow label="직전 저점" date={fmtDay(drop.troughDate, a.asOf)} value={fmtPrice(drop.trough, data.market)} />
              </>
            ) : (
              <>
                <PriceRow label="전고점" date={fmtDay(a.athDate, a.asOf)} value={fmtPrice(a.ath, data.market)} />
                <PriceRow label="저점" date={fmtDay(a.lowDate, a.asOf)} value={fmtPrice(a.low, data.market)} />
              </>
            )}
          </div>
        </div>
      </Module>

      {/* 2 — 지금 낙폭. 기간이 상장 이력보다 길거나 '전체'면 주의를 머리 근거에 그대로 적는다 — 물음표에 숨기면 마우스를 올려야 읽혔다
          ("헬프 툴팁이 필요하면 심플하지 않다", 2026-10-04). */}
      <Module title="지금 낙폭" meta={caution ? `${periodLabel} · ${caution}` : periodLabel} className="v2-md-dd">
        <div className="v2-md-body">
          <span className="v2-card-val is-big">
            {/* 오늘 종가가 기간 최고가면 '신고가' — '부근'은 −1% 안쪽일 때만(2026-10-05 점검, 심텍). */}
            <b className={atHigh ? undefined : "is-down"}>{atHigh ? (a.currentDd === 0 ? "신고가" : "신고가 부근") : fmtPct(a.currentDd)}</b>
            {!atHigh && <span className="v2-md-aside">전고점 대비</span>}
          </span>
          {/* 신고가 부근에도 게이지를 둔다 — 핀이 0% 에 서고 '최대' 눈금이 이 기간 가장 깊었던 자리를 말한다. 빼면 칸 가운데가 비었다. */}
          <DrawdownGauge current={a.currentDd} mdd={a.mdd} periodLabel={periodLabel} />
          {/* 통계 셋 — 칸 바닥에 붙는다. 보조 줄에 기간 이름은 안 붙인다('전체' 조회에서 칸을 넘겼다). */}
          <div className="v2-md-stats">
            {/* '기간 최저점'은 게이지 끝 · 사례 표 첫 줄과 같은 값이라 뺐다(판정표 3) — 그 자리에 저점 대비. */}
            {/* 보조 줄('2,448일 중' · '6월 18일부터' · '7월 30일 저점')은 걷었다 — 띠의 거래일 수 · 옆 종목 칸의 전고점 · 저점 날짜와
                같은 말이었다(2026-10-03). */}
            {/* 신고가 당일엔 '이보다 깊었던 날 2,341일'이 뜻이 없다 — 직전 큰 하락의 고점보다 얼마나 올라섰나로 바꾼다(2026-10-04 점검, 심텍). */}
            {drop ? (
              <StatCell label="직전 고점 대비" value={fmtPct((a.price / drop.peak - 1) * 100)} tone={UP} />
            ) : (
              <StatCell label="이보다 깊었던 날" value={deeperLabel(a)} />
            )}
            {drop ? (
              <>
                <StatCell label="직전 하락" value={fmtPct(drop.depth)} tone={DOWN} />
                <StatCell label="되찾은 날" value={fmtDay(drop.recoveryDate, a.asOf)} />
              </>
            ) : (
              <>
                {/* 사람 단위(5.3년) — '1,927일'은 큰 날수라 안 읽혔고 표의 '3.4년'과 꼴이 갈렸다(2026-10-05 점검). */}
                <StatCell label="고점 이후" value={fmtDur(sincePeak)} />
                <StatCell label="저점 대비" value={fmtPct(fromLow)} tone={Math.abs(fromLow) < 0.05 ? undefined : fromLow > 0 ? UP : DOWN} />
              </>
            )}
          </div>
        </div>
      </Module>

      {/* 3 — 낙폭 요약. 이 종목 낙폭을 쉬운 말로 한 줄씩(깊이 · 회복 · 시장 · 업종). 잠깐 '채널이 말한 까닭'(카더라 언급)을
          세웠다가 걷었다(2026-10-03 "이 종목 mdd 를 쉽게 말해 주는 게 낫다"). */}
      <SummaryModule data={data} />
    </div>
  );
}

/** 종목 칸의 전고점 · 저점 두 줄 — 이름 · 날짜(12/500) · 값(13/700). 옛 인라인 눈금(11.5px · 굵기 800)을 v2 눈금으로(2026-10-03, v2.css .v2-md-pr). */
function PriceRow({ label, date, value }: { label: string; date: string; value: string }) {
  return (
    <div className="v2-md-pr">
      <span className="v2-md-pr-k">
        {label} <span>{date}</span>
      </span>
      <b className="v2-md-pr-v">{value}</b>
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
  // 거래일이라고 적는다 — 옆 칸 '고점 이후 106일'은 달력 날수라, 같은 'N일'이면 두 칸이 같은 것을 세는 줄 알았다(2026-10-04 점검).
  return `${Math.round(a.deeperThanNowDays).toLocaleString("ko-KR")}거래일`;
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
          style={{ position: "absolute", left: 0, top: 0, fontSize: "var(--fs-11)", fontWeight: 500, color: C.sub, visibility: fit.showStart ? "visible" : "hidden" }}
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
              fontWeight: 500,
              color: C.sub,
              whiteSpace: "nowrap",
            }}
          >
            {/* '최근 10년'은 칸 머리 근거 글자와 같은 말이라 뺐다(2026-10-03). */}
            최대 {fmtPct(mdd)}
          </span>
        )}
        <span
          ref={endRef}
          style={{ position: "absolute", right: 0, top: 0, fontSize: "var(--fs-11)", fontWeight: 500, color: C.sub, visibility: fit.showEnd ? "visible" : "hidden" }}
        >
          −100%
        </span>
      </div>
    </div>
  );
}

/* 고점 대비 낙폭 곡선(언더워터). dd 는 0 이하이고 아래로 갈수록 깊다. */

/**
 * 점들을 단조 3차 곡선(Fritsch–Carlson, d3 curveMonotoneX 와 같은 셈)으로 잇는 SVG path.
 * 점 사이 곡선이 이웃 두 점의 값을 넘지 않는다 — 부드럽게 그려도 최저점·0% 선을 넘어 그리지 않는다.
 */
function smoothPath(pts: [number, number][]): string {
  const n = pts.length;
  if (n === 0) return "";
  if (n < 3) return pts.map(([px, py], i) => `${i === 0 ? "M" : "L"}${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1][0] - pts[i][0]);
    slope.push(dx[i] === 0 ? 0 : (pts[i + 1][1] - pts[i][1]) / dx[i]);
  }
  // 점마다 접선 기울기. 양옆 기울기의 부호가 다르면(꼭짓점) 0 — 거기서 곡선이 넘어서지 않는다.
  const m: number[] = [slope[0]];
  for (let i = 1; i < n - 1; i++) {
    if (slope[i - 1] * slope[i] <= 0) m.push(0);
    else {
      const w1 = 2 * dx[i] + dx[i - 1];
      const w2 = dx[i] + 2 * dx[i - 1];
      m.push((w1 + w2) / (w1 / slope[i - 1] + w2 / slope[i]));
    }
  }
  m.push(slope[n - 2]);
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const h = dx[i] / 3;
    d += ` C${(x0 + h).toFixed(1)},${(y0 + m[i] * h).toFixed(1)} ${(x1 - h).toFixed(1)},${(y1 - m[i + 1] * h).toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
  }
  return d;
}

export function Underwater({
  a,
  periodLabel,
  market,
  focus,
  focusPeak,
  cases,
  onCase,
  benchSeries,
}: {
  a: MddAnalysis;
  periodLabel: string;
  market: string | null;
  /** 사례 표에서 고른 하락(고점 → 되찾은 날, 진행 중이면 끝까지) — 그 구간을 옅게 칠한다(판정표 9). */
  focus?: { from: string; to: string | null } | null;
  /** 고른 사례의 고점 날짜 — 표식 하나를 채운다. */
  focusPeak?: string | null;
  /** 역대 하락 사례(깊은 순) — 바닥 자리에 사례 표와 같은 번호를 찍는다(판정표 10). */
  cases?: { peakDate: string; troughDate: string }[];
  /** 번호 표식을 누르면 그 사례를 고른다(사례 표 줄을 누른 것과 같다). */
  onCase?: (peakDate: string) => void;
  /** 같은 기간 기준 지수의 낙폭(series 와 같은 길이) — '○○와 함께' 탭을 골랐을 때만 겹친다. 없으면 탭도 없다. */
  benchSeries?: (number | null)[] | null;
}) {
  const series = a.underwater;
  const mdd = a.mdd;
  const bench = benchName(market);
  // 시장 선은 고를 때만 — 늘 깔면 두 겹이 겹쳐 이중으로 보였다(09-27 면으로 깔았다가 걷음). 그래서 선택 탭으로 둔다(10-03).
  const [withMarket, setWithMarket] = useState(false);
  const overlay = withMarket && !!benchSeries && benchSeries.length === series.length;
  const benchVals = overlay ? benchSeries!.filter((v): v is number => v !== null) : [];
  const W = 720;
  const H = 176;
  // 축 글자(0%·−23%·연도)는 그림 **밖**의 HTML 칸에 선다(2026-09-27). 그림 안 <text> 는 그림이 폭에 맞춰 늘어나는 만큼
  // 같이 커져 PC 에서 15px 남짓으로 투박했다(지적). 밖에 두면 어느 폭에서든 11px 이다. 그래서 그림엔 왼쪽 여백이 없다.
  const PAD_L = 0;
  // 뷰박스 위아래 여유 — 0% 선과 호버 점·최저점 동그라미가 가장자리에서 잘리지 않을 만큼.
  const VB_PAD = 6;
  const VBH = H + VB_PAD * 2;
  const n = series.length;
  // 0 나눗셈·완전 평평 방지. 시장 선을 겹치면 시장이 더 깊었던 때까지 들어가게 바닥을 넓힌다.
  const floor = Math.min(mdd, -1, ...(benchVals.length ? [Math.min(...benchVals)] : []));
  const x = (i: number) => (n <= 1 ? PAD_L : PAD_L + (i / (n - 1)) * (W - PAD_L));
  const y = (dd: number) => (dd / floor) * H;

  // shadcn 영역 차트는 곡선이 부드럽다(Recharts type="natural"). 여기선 **단조 3차 곡선**으로 잇는다 —
  // natural 은 점 사이에서 값을 넘어서(0% 위로 튀거나 최저점보다 깊게) 그릴 수 있는데, 단조 곡선은 점 사이 값이
  // 늘 이웃 두 점 사이에 머문다. 최저점·0% 선이 곡선 때문에 거짓말하지 않는다.
  const line = smoothPath(series.map((p, i) => [x(i), y(p.dd)]));
  const area = `${line} L${x(n - 1).toFixed(1)},0 L${x(0).toFixed(1)},0 Z`;

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
  const LABEL_SLOT = 68; // 라벨 하나가 차지할 최소 폭(단위). 좁은 화면에선 CSS 가 하나씩 거른다(.hz-chart-x [data-minor]).
  const maxLabels = Math.max(2, Math.floor((W - PAD_L) / LABEL_SLOT));
  let yearStep = 1;
  for (const s of [1, 2, 5, 10]) {
    yearStep = s;
    if (yearMarks.filter((t) => t.year % s === 0).length <= maxLabels) break;
  }
  // 2년이 안 되면(1년 조회) 해 경계가 하나뿐이라 '2026' 하나만 섰다(2026-10-05 점검) — 두 달 간격 달 눈금으로(1월은 해).
  const spanDays = n > 1 ? (Date.parse(series[n - 1].date) - Date.parse(series[0].date)) / 86_400_000 : 0;
  const ticks: { x: number; key: string; label: string }[] = [];
  if (spanDays < 730) {
    for (let i = 1; i < n; i++) {
      const m = Number(series[i].date.slice(5, 7));
      if (series[i - 1].date.slice(0, 7) === series[i].date.slice(0, 7) || m % 2 === 0) continue;
      ticks.push({ x: x(i), key: series[i].date.slice(0, 7), label: m === 1 ? series[i].date.slice(0, 4) : `${m}월` });
    }
  } else {
    for (const t of yearMarks) if (t.year % yearStep === 0) ticks.push({ x: t.x, key: String(t.year), label: String(t.year) });
  }
  // 세로축 눈금은 떨어지는 값으로 — 바닥의 절반을 찍으면 '−23% · −45%'처럼 어정쩡했고, −23% 줄이 '지금 −23.9%'의 눈금처럼 읽혔다(2026-10-05 점검).
  // 간격은 바닥까지 눈금이 둘 이하인 가장 작은 값(45 → 20: 0 · −20 · −40, 66 → 25, 81 → 40). 폰의 낮은 그림에서 글자가 닿지 않게 셋까지.
  const absFloor = Math.abs(floor);
  const step = [1, 2, 5, 10, 20, 25, 40, 50].find((s) => Math.floor(absFloor / s) <= 2) ?? 50;
  const rows = [0, -step, -2 * step].filter((v) => v >= floor);
  // 격자는 눈금 줄 + 바닥선(글자 없음).
  const gridRows = rows.includes(floor) ? rows : [...rows, floor];
  // 사례 표에서 고른 구간 — 솎아 낸 점(250개 남짓)이라 날짜로 가장 가까운 점을 찾는다.
  let band: { x0: number; x1: number } | null = null;
  if (focus && n > 1) {
    let i0 = series.findIndex((p) => p.date >= focus.from);
    if (i0 < 0) i0 = 0;
    let i1 = n - 1;
    if (focus.to) for (let i = n - 1; i >= 0; i--) if (series[i].date <= focus.to) { i1 = i; break; }
    if (i1 > i0) band = { x0: x(i0), x1: x(i1) };
  }
  // 기간 최저점 — 곡선에서 가장 깊은 지점에 표시를 남긴다(사례 번호가 있으면 1번이 그 자리라 안 찍는다).
  let ti = 0;
  for (let i = 1; i < n; i++) if (series[i].dd < series[ti].dd) ti = i;

  // 시장 선 — 빈 날(그 전 지수 봉이 없는 첫머리)에서 끊는다.
  let benchLine = "";
  if (overlay) {
    const segs: [number, number][][] = [];
    let cur: [number, number][] = [];
    benchSeries!.forEach((v, i) => {
      if (v === null) {
        if (cur.length) segs.push(cur);
        cur = [];
      } else cur.push([x(i), y(v)]);
    });
    if (cur.length) segs.push(cur);
    benchLine = segs.filter((sg) => sg.length > 1).map((sg) => smoothPath(sg)).join(" ");
  }

  // 사례 번호 표식 — 바닥 날짜에 가장 가까운 물속 점(250개로 솎았지만 사례 바닥 날짜는 솎기에서 남긴다).
  const pointOf = (date: string) => {
    let k = series.findIndex((p) => p.date >= date);
    if (k < 0) return n - 1;
    if (k > 0 && series[k].date !== date && Date.parse(date) - Date.parse(series[k - 1].date) < Date.parse(series[k].date) - Date.parse(date)) k -= 1;
    return k;
  };
  const marks = (cases ?? []).map((c, i) => ({ no: i + 1, peak: c.peakDate, k: pointOf(c.troughDate) }));
  const at = (k: number) => ({ left: `${(x(k) / W) * 100}%`, top: `${((y(series[k].dd) + VB_PAD) / VBH) * 100}%` });
  // 선 끝 '지금' — 진행 중인 사례의 바닥이 곧 오늘이면(신저점) 그 번호 표식에 '지금'을 붙이고 점은 따로 안 찍는다.
  const nowOnMark = marks.some((m) => m.k === n - 1);

  /* 확대 보기. 폰에서 이 차트는 뷰박스 720 units 가 화면 폭(≈350)으로 눌려 **절반 축척**이
     된다 — 연도·퍼센트 라벨이 11 units 라 실제 5~6px 로 찍혀 안 읽힌다.
     오버레이에서 무대 폭을 100vh 로 잡고 90도 돌리면 화면의 긴 변을 쓰게 되어 폰에서
     2배 남짓 커진다(393×830 기준 350 → 830). 같은 SVG 를 그대로 다시 그리므로
     곡선·눈금·라벨이 갈릴 일이 없다. */
  const [zoom, setZoom] = useState(false);
  const [zoomUsed, setZoomUsed] = useState(false);

  /* 크로스헤어 띠 — 보이지 않는 세로 띠가 눌리면 기준선(hz-vline)과 툴팁(hz-tip)을 낸다.
     위치를 **뷰박스 비율(%)**로 잡는다. 예전엔 카드 padding(22/20/42 px)을 기준으로 잡아
     그 카드 안에서만 맞았는데, 확대 보기는 padding 이 달라서 그대로 두면 곡선과 어긋난다.
     뷰박스는 `0 -6 720 188` 이고 플롯은 y 0~176 · x 0~720 이므로 위아래로 6 씩 들어온다. */
  const crosshair = (extraClass: string) => (
    <div
      className={`mdd-crosshair${extraClass}`}
      style={{
        position: "absolute",
        top: `${(VB_PAD / VBH) * 100}%`,
        left: 0,
        right: 0,
        bottom: `${(VB_PAD / VBH) * 100}%`,
      }}
    >
      {series.map((p, i) => {
        const at = n <= 1 ? 0 : i / (n - 1);
        const edge = at < 0.25 ? " hz-tip-start" : at > 0.75 ? " hz-tip-end" : "";
        return (
          <div
            key={i}
            className={`hz-tip hz-vline${edge}`}
            data-tip={`${fmtDot(p.date)} · ${fmtPrice(p.close, market)} · 고점 대비 ${fmtPct(p.dd)}${
              overlay && benchSeries![i] !== null ? ` · ${bench} ${fmtPct(benchSeries![i]!)}` : ""
            }`}
            // 선·호버 점을 실제 점 자리(칸 폭의 i/(n−1))에 세운다(app/home/parts.tsx AreaChart 와 같은 셈).
            style={{ flex: 1, position: "relative", ["--hz-x" as string]: `${at * 100}%` }}
          >
            <span className="hz-vdot" style={{ top: `${(p.dd / floor) * 100}%`, background: DOWN_BAR[1] }} />
          </div>
        );
      })}
    </div>
  );

  const chartOnly = (
      <svg
      viewBox={`0 ${-VB_PAD} ${W} ${VBH}`}
      width="100%"
      // 폰에선 그림 키를 늘린다(v2.css .mdd-uw-body .mdd-uw-svg) — 너비에 맞춰 72px 로 눌려 표식이 서로 · 확대 단추와 겹쳤다(2026-10-05 점검).
      // 선은 non-scaling-stroke, 표식 · 십자선 · 축 글자는 % 자리라 함께 따라간다.
      preserveAspectRatio="none"
      className="mdd-uw-svg"
      style={{ overflow: "visible" }}
      role="img"
      aria-label={`고점 대비 낙폭 곡선. 현재 ${fmtPct(series[n - 1].dd)}, 기간 최저 ${fmtPct(mdd)}`}
    >
      {/* shadcn 영역 차트 꼴(Area Chart · Interactive, 2026-09-27) — 면은 그라데이션, 격자는 가로 실선만 옅게, 선은 1px.
          shadcn 은 선에서 진하고 바닥으로 옅어지는데, 이 차트는 0% 가 위이고 선이 아래라 **깊을수록 진하게** 뒤집었다.
          시장(코스피) 낙폭은 늘 깔지 않는다 — 면으로 한 겹 더 깔았더니 두 면이 겹쳐 이중으로 보였다(09-27 걷음).
          머리의 '○○와 함께' 탭을 고르면 면 없이 회색 선 하나로만 겹친다(10-03).
          이 그림은 확대 보기에서도 한 번 더 그려져 id 가 두 번 선다 — 모양이 같아 어느 쪽을 집어도 같다. */}
      <defs>
        <linearGradient id="mdd-uw-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={DOWN_BAR[1]} stopOpacity="0.04" />
          <stop offset="100%" stopColor={DOWN_BAR[1]} stopOpacity="0.4" />
        </linearGradient>
      </defs>
      {/* 선·격자는 화면에서 늘 1px — 그림이 가로 720 단위를 화면 폭에 맞춰 늘이고 줄여서, 그대로 두면 PC 에선 1.4px 로
          굵어지고 폰에선 0.4px 로 흐려진다(vectorEffect non-scaling-stroke). shadcn 차트처럼 선은 가늘게(09-27). */}
      {gridRows.map((dd, i) => (
        <line key={i} x1={PAD_L} y1={y(dd)} x2={W} y2={y(dd)} stroke="var(--c-line)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      ))}
      {/* 고른 사례 구간 — 면 뒤에 옅게, 양 끝은 점선. */}
      {band && (
        <g className="mdd-uw-band">
          <rect x={band.x0} y={-VB_PAD} width={band.x1 - band.x0} height={VBH} />
          <line x1={band.x0} y1={-VB_PAD} x2={band.x0} y2={H + VB_PAD} vectorEffect="non-scaling-stroke" />
          <line x1={band.x1} y1={-VB_PAD} x2={band.x1} y2={H + VB_PAD} vectorEffect="non-scaling-stroke" />
        </g>
      )}
      <path d={area} fill="url(#mdd-uw-fill)" />
      {benchLine && <path className="mdd-uw-bench" d={benchLine} vectorEffect="non-scaling-stroke" />}
      <path d={line} fill="none" stroke={DOWN_BAR[1]} strokeWidth="1" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      {/* 기간 최저점 — 빈 동그라미. 사례 번호를 찍으면 1번(가장 깊은 사례)이 그 자리라 안 찍는다. */}
      {marks.length === 0 && (
        <circle cx={x(ti)} cy={y(series[ti].dd)} r="3" fill={C.card} stroke={DOWN} strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
      )}
    </svg>
  );

  /* svg 와 띠를 한 상자에 묶는다 — 띠가 svg 박스 기준으로 앉아야 어디에 놓든 안 어긋난다.
     축 글자는 그 상자 왼쪽(퍼센트)·아래(연도) 칸에 HTML 로 — 늘 11px(shadcn 축 글자 text-xs · 옅은 색). */
  const pctLabel = (dd: number) => `${dd < -0.5 ? "−" : ""}${Math.abs(Math.round(dd))}%`;
  const chartWith = (extraClass: string) => (
    <div className="hz-chart-axes">
      <div className="hz-chart-y" aria-hidden>
        {rows.map((dd, i) => (
          <span key={i} style={{ top: `${((y(dd) + VB_PAD) / VBH) * 100}%` }}>
            {pctLabel(dd)}
          </span>
        ))}
      </div>
      <div style={{ position: "relative", minWidth: 0 }}>
        {chartOnly}
        {crosshair(extraClass)}
        {/* 표식은 HTML 로 얹는다 — 그림 안 글자는 그림 폭에 따라 커졌다 작아졌다 한다(축 글자를 밖으로 뺀 것과 같은 까닭).
            '지금'은 선 끝 점 + 후광. 예전(09)엔 값이 히어로에 있다고 뺐지만, 번호 표식과 같이 보면 지금이 어느 사례 뒤인지가 보인다. */}
        <div className="mdd-uw-marks">
          {/* 끝 점이 고점 바로 밑(−2% 안)이면 '지금' 글자를 점 왼쪽에 — 위에 두면 머리 띠 선을 넘었다(2026-10-04 점검, 신고가 심텍). */}
          {!nowOnMark && (
            <span className={`mdd-uw-now${series[n - 1].dd > -2 ? " is-top" : ""}`} style={at(n - 1)} aria-hidden>
              <em>지금</em>
            </span>
          )}
          {marks.map((m) => (
            <button
              key={m.peak}
              type="button"
              className={`mdd-uw-num${focusPeak === m.peak ? " is-on" : ""}${m.k === n - 1 && series[n - 1].dd > -2 ? " is-top" : ""}`}
              style={at(m.k)}
              aria-label={`${m.no}번 사례 구간을 차트에 표시`}
              aria-pressed={focusPeak === m.peak}
              onClick={() => onCase?.(m.peak)}
              data-ga="mdd_uw_case"
            >
              {m.no}
              {m.k === n - 1 && <em>지금</em>}
            </button>
          ))}
        </div>
      </div>
      <div className="hz-chart-x" aria-hidden>
        {ticks.map((t, i) => (
          // 둘째마다 표시 — 좁은 폭에선 CSS 가 이것들을 숨겨 연도가 겹치지 않는다.
          <span key={t.key} data-minor={i % 2 === 1 ? "" : undefined} style={{ left: `${(t.x / W) * 100}%` }}>
            {t.label}
          </span>
        ))}
      </div>
    </div>
  );

  return (
    <Sheet>
      <SectionHead level={3}
        icon="show_chart"
        title="낙폭 추이"
        desc="전고점을 0으로 두고 그 아래로 얼마나 잠겼는지"
        right={
          <div className="mdd-uw-head">
            <span className="hz-sheet-head-note">
              {focus ? `${periodLabel} · ${fmtYm(focus.from)} ~ ${focus.to ? fmtYm(focus.to) : "진행 중"}` : periodLabel}
            </span>
            {/* 시장 선 고르기(10-03 "옵션을 주자 선택 탭을 넣어서"). 지수를 못 받았으면 탭이 없다. */}
            {benchSeries && benchSeries.length === series.length && (
              <div className="hz-seg hz-seg-hover mdd-uw-seg" role="group" aria-label="차트에 시장 겹치기">
                <button type="button" aria-pressed={!withMarket} onClick={() => setWithMarket(false)}>
                  종목만
                </button>
                <button type="button" aria-pressed={withMarket} onClick={() => setWithMarket(true)} data-ga="mdd_uw_market">
                  {bench}
                  {market === "US" || market === "KOSDAQ" ? "과" : "와"} 함께
                </button>
              </div>
            )}
          </div>
        }
      />
      {/* 본문 여백은 다른 v2 칸과 같은 12 · 14(옛 시트 20 · 22 였다). */}
      <div className="mdd-uw-body" style={{ padding: "12px 14px 14px", position: "relative" }}>
      {/* overflow:visible — 최저점 표시가 하필 마지막 지점일 때(지금이 역대 최저인
          종목) 뷰박스 오른쪽 끝에 놓여 기본값(hidden)이면 반지름만큼 잘린다. 뷰박스를
          넓히는 대신 넘침만 허용한다 — 넓히면 아래 크로스헤어 띠(퍼센트로 잡은 위치)가
          곡선과 어긋난다. */}
      {chartWith("")}
      {/* 확대 버튼 — 차트 오른쪽 아래. 폰에서만 뜬다(CSS). */}
      <button
        type="button"
        className="hz-zoom-btn"
        aria-label="낙폭 추이 차트 확대해서 보기"
        onClick={() => {
          setZoomUsed(true);
          setZoom(true);
        }}
      >
        <Icon name="open_in_full" style={{ fontSize: "var(--fs-15)" }} />
      </button>
      </div>
      <Foot>0%가 전고점입니다. 아래로 갈수록 그 고점에서 멀어져 있다는 뜻이며, 선이 0에 닿은 날이 고점을 되찾은 날입니다.</Foot>
      {/* 판은 app/ZoomDialog.tsx(Base UI Dialog)가 그린다 — 여백을 누르거나 Esc 로 닫히고, 초점이 판 안에 갇혔다가
          닫으면 확대 단추로 돌아온다. 무대는 90도 돌려 화면의 긴 변을 쓴다. */}
      {zoomUsed && (
        <ZoomDialog open={zoom} onOpenChange={setZoom} label="낙폭 추이 차트 확대">
          {chartWith(" mdd-crosshair-zoom")}
        </ZoomDialog>
      )}
    </Sheet>
  );
}
