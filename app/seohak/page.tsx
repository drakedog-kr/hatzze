import type { Metadata } from "next";

import { getSeohakDaily } from "@/lib/seohak-daily";
import {
  getSeohakOverview,
  type Cohort,
  type SeohakOverview,
} from "@/lib/seohak-data";
import { getSeohakCalendar } from "@/lib/seohak-calendar";
import { getSeohakEquityType } from "@/lib/seohak-equity-type";
import { getSeohakEtf } from "@/lib/seohak-etf";
import { getSeohakQuarterly } from "@/lib/seohak-quarterly";
import { DailySection } from "./DailyCards";
import { CalendarHero } from "./CalendarHero";
import { EquityTypeSection } from "./EquityTypeSection";
import { EtfSection } from "./EtfCards";
import { QuarterlyCards } from "./QuarterlyCards";
import { SectionCaps } from "../kadera/parts";
import { SectionHead } from "../kadera/SectionHead";
import { pageMetadata } from "../seo";
import { C, R } from "../ui";

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata({
    title: "서학개미 해부도 | hatzze",
    description:
      "한국인이 미국 주식에 넣은 돈은 얼마이고, 언제 넣었고, 지금 얼마가 됐는지. 미 재무부 통계로 1985년부터 되짚습니다.",
    path: "/seohak",
  });
}

export const dynamic = "force-dynamic";

/** 백만 달러 단위 값을 "$1,234B" 로. 원천이 백만 달러라 나눗셈이 여기 한 곳에만 있다. */
function usdB(mn: number): string {
  return `$${(mn / 1000).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}B`;
}

/**
 * 부호가 붙는 금액. 음수 기호를 **통화 기호 앞**에 둔다 — usdB 를 그냥 쓰면 "$-0.4B"
 * 가 되는데, 기호와 숫자 사이에 낀 빼기는 한 박자 늦게 읽힌다.
 */
function usdSigned(mn: number): string {
  return `${mn < 0 ? "−" : ""}${usdB(Math.abs(mn))}`;
}

/** 음수는 U+2212(−)로 낸다. 본문에 손으로 적은 값과 부호 모양이 갈리면 안 된다. */
function pct(v: number, digits = 1): string {
  const n = Math.abs(v).toLocaleString("ko-KR", { maximumFractionDigits: digits });
  return `${v >= 0 ? "+" : "−"}${n}%`;
}

/**
 * 원금선과 평가선. 두 줄 사이의 벌어짐이 그대로 '평가손익'이라, 이 카드는 숫자를
 * 안 읽어도 뜻이 전달된다 — 그래서 축 눈금을 최소로 두고 두 선의 간격만 보이게 한다.
 *
 * 세로축을 **제곱근 눈금**으로 둔다. 40년간 잔고가 $0.1B → $815B 로 8,000배 커져서
 * 선형이면 2010년 이전이 전부 바닥에 눌리고, 로그면 초기 잡음이 과장돼 "1990년대에도
 * 뭔가 있었다"처럼 보인다. 제곱근은 그 사이라 최근 20년이 읽히면서 옛 구간도 안 죽는다.
 */
function PrincipalVsValue({ series }: { series: SeohakOverview["series"] }) {
  // viewBox 비율이 곧 화면 높이다(width:100% · height:auto). 720×210 으로 두면 넓은
  // 화면(카드 폭 1,220px)에서 355px 까지 자라 히어로 숫자를 눌렀다. 가로를 1,200 으로
  // 넓혀 같은 높이 값이 더 낮게 렌더되게 한다(실측 213px).
  const W = 1200;
  const H = 210;
  // 아래 여백을 26 으로 둔다. 1990년대 잔고가 $0.1B 대라 선이 바닥에 붙어 있어서,
  // 18 로는 연도 라벨이 그 선에 닿는다(실측).
  const PAD = { t: 10, r: 8, b: 26, l: 8 };
  const max = Math.max(...series.map((s) => s.value));
  const sq = (v: number) => Math.sqrt(Math.max(0, v));
  const x = (i: number) => PAD.l + (i / (series.length - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => H - PAD.b - (sq(v) / sq(max)) * (H - PAD.t - PAD.b);
  const line = (key: "principal" | "value") =>
    series.map((s, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(s[key]).toFixed(1)}`).join("");
  const area =
    series.map((s, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(s.value).toFixed(1)}`).join("") +
    series
      .slice()
      .reverse()
      .map((s, i) => `L${x(series.length - 1 - i).toFixed(1)},${y(s.principal).toFixed(1)}`)
      .join("") +
    "Z";

  const ticks = [1995, 2005, 2015, 2025].map((yr) => {
    const i = series.findIndex((s) => s.month.startsWith(String(yr)));
    return i < 0 ? null : { yr, cx: x(i) };
  });

  return (
    <div style={{ padding: "14px 22px 6px" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label="원금과 평가액 추이">
        {/* 두 선 사이를 채워 손익을 면적으로 보인다. 파랑 tint 라 선보다 뒤로 앉는다. */}
        <path d={area} fill={C.blueTint} />
        <path d={line("value")} fill="none" stroke={C.blue} strokeWidth={2} strokeLinejoin="round" />
        {/* 원금은 '자'라서 데이터선보다 옅고 점선이다(축 눈금과 같은 어법). */}
        <path
          d={line("principal")}
          fill="none"
          stroke={C.marker}
          strokeWidth={1.5}
          strokeDasharray="4 3"
          strokeLinejoin="round"
        />
        {ticks.map(
          (t) =>
            t && (
              <text key={t.yr} x={t.cx} y={H - 4} textAnchor="middle" fontSize={10} fill={C.faint}>
                {t.yr}
              </text>
            ),
        )}
      </svg>
      <div style={{ display: "flex", gap: 16, padding: "2px 0 8px", fontSize: 11.5, color: C.sub2 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 14, height: 2, background: C.blue, borderRadius: 2 }} />
          평가액
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              width: 14,
              height: 0,
              borderTop: `1.5px dashed ${C.marker}`,
            }}
          />
          넣은 원금
        </span>
      </div>
    </div>
  );
}

/** 코호트 표의 칸 배치. 머리줄과 몸줄이 어긋나면 안 되므로 한 곳에서 낸다. */
const COHORT_COLS = "44px 1fr 76px 62px";

/**
 * 코호트 줄. 막대는 '그 해 들어온 돈의 크기', 오른쪽 숫자는 '지금 수익률'이다.
 * 둘을 한 줄에 두는 이유는, 돈이 가장 많이 들어온 해가 수익률이 가장 낮은 해라는
 * 사실이 그 두 값을 나란히 놓아야만 보이기 때문이다.
 *
 * ⚠️ 좌우 여백(22px)은 이 줄이 아니라 **바깥 열 컨테이너**가 준다. 표를 2열로 세우면서
 * 줄마다 여백을 두면 오른쪽 열의 왼쪽에도 22px 이 붙어 가운데만 벌어진다.
 */
function CohortRow({ c, maxInflow }: { c: Cohort; maxInflow: number }) {
  const w = Math.max(2, (c.inflow / maxInflow) * 100);
  return (
    <li
      style={{
        display: "grid",
        gridTemplateColumns: COHORT_COLS,
        alignItems: "center",
        gap: 10,
        padding: "9px 0",
        borderTop: `1px solid ${C.sheetRow}`,
      }}
    >
      <span style={{ fontSize: 12.5, fontWeight: 600, color: C.label }}>{c.year}</span>
      <span style={{ height: 8, background: C.track, borderRadius: R.pill, overflow: "hidden" }}>
        <span style={{ display: "block", width: `${w}%`, height: "100%", background: C.bar }} />
      </span>
      <span style={{ fontSize: 12, color: C.sub2, textAlign: "right" }}>{usdB(c.inflow)}</span>
      <span
        style={{
          fontSize: 13,
          fontWeight: 700,
          textAlign: "right",
          color: c.returnPct >= 100 ? C.blue : C.ink,
        }}
      >
        {pct(c.returnPct, 0)}
      </span>
    </li>
  );
}

/**
 * 코호트 표 한 열. **머리줄을 열마다 다시 낸다** — 12해를 한 줄로 세우면 표만 456px 이라
 * 카드가 900px 가까이 자란다. 반씩 나눠 나란히 두면 그 절반이고, 막대는 두 열이 같은
 * `maxInflow` 로 정규화되므로 열이 갈려도 길이를 견줄 수 있다.
 */
function CohortColumn({ rows, maxInflow }: { rows: Cohort[]; maxInflow: number }) {
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
      <li
        style={{
          display: "grid",
          gridTemplateColumns: COHORT_COLS,
          gap: 10,
          padding: "0 0 8px",
          fontSize: 11,
          color: C.faint,
        }}
      >
        <span>들어온 해</span>
        <span />
        <span style={{ textAlign: "right" }}>넣은 돈</span>
        <span style={{ textAlign: "right" }}>지금</span>
      </li>
      {rows.map((c) => (
        <CohortRow key={c.year} c={c} maxInflow={maxInflow} />
      ))}
    </ul>
  );
}

/** 잔고 증감 표의 칸 배치. 머리줄과 몸줄이 어긋나면 안 되므로 한 곳에서 낸다. */
const FLOW_COLS = "34px 1fr 58px 62px";

/** 머리줄 이름 앞에 붙는 색 견본. 범례 줄을 따로 두면 494px 칸에서 한 줄이 아깝다. */
function Swatch({ fill }: { fill: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: 2,
        background: fill,
        marginRight: 5,
      }}
    />
  );
}

/**
 * 색 세 가지. **금액의 부호가 아니라 '무엇인가'로 먼저 가르고, 그다음에 부호로 가른다.**
 * 새 돈은 이 창(2015~)에서 한 해도 음수인 적이 없지만, 코드는 두 쪽 다 처리한다.
 *
 * 평가 마이너스에 회색을 주면 안 된다. 2022년 −$80.8B 가 이 표에서 가장 중요한 줄인데
 * 가장 옅은 색이 되어 눈에 안 걸린다. 진한 슬레이트(`inkSoft`)로 두면 파랑 계열 둘과
 * 계통이 갈려서 "이 해만 반대쪽"이 한눈에 잡힌다.
 *
 * ⛔ 빨강·초록을 쓰지 않는다. 이 페이지에서 빨강은 사자, 파랑은 팔자 뜻으로 이미
 * 쓰이고 있어서(ETF 두 장) 손익 뜻으로 겹쳐 쓰면 같은 화면에서 색이 두 말을 한다.
 */
const FLOW_FILL = {
  /** 새로 넣은 돈. 이 카드의 주인공이라 강조색. */
  cash: C.blue,
  /** 평가액이 는 몫. 같은 계열의 옅은 채움(트랙과 다른 값이어야 한다). */
  gain: C.bar,
  /** 평가액이 준 몫. */
  loss: C.inkSoft,
} as const;

/**
 * 한 해 줄. 0 을 세로선으로 못박고 **양쪽으로 뻗는** 누적 막대다.
 *
 * 0 의 위치는 가운데가 아니라 `zeroPct` 다. 왼쪽으로 가장 멀리 가는 해(2022년 $80.8B)와
 * 오른쪽으로 가장 멀리 가는 해(2025년 $148.8B)의 비로 잡는다 — 가운데에 두면 오른쪽
 * 절반에 148.8 을 욱여넣느라 눈금이 좌우로 갈려서 길이를 못 견준다.
 *
 * 새 돈을 **0 에 붙여** 먼저 그린다. 그래야 파란 칸의 길이가 해마다 바로 견줘진다.
 */
function FlowRow({
  y,
  unit,
  zeroPct,
}: {
  y: SeohakOverview["breakdown"]["years"][number];
  /** 금액 1 당 몇 %. 두 방향이 같은 눈금을 쓰게 한 곳에서 받는다. */
  unit: number;
  zeroPct: number;
}) {
  // 0 에 붙는 순서대로. 같은 방향이면 뒤엣것이 앞엣것 바깥에 쌓인다.
  const segs = [
    { v: y.netPurchase, fill: FLOW_FILL.cash },
    { v: y.valuation, fill: y.valuation >= 0 ? FLOW_FILL.gain : FLOW_FILL.loss },
  ];
  let right = 0;
  let left = 0;
  const drawn = segs.map((s, i) => {
    const w = Math.abs(s.v) * unit;
    const start = s.v >= 0 ? zeroPct + right : zeroPct - left - w;
    if (s.v >= 0) right += w;
    else left += w;
    return { key: i, fill: s.fill, start, w };
  });

  return (
    <li
      style={{
        display: "grid",
        gridTemplateColumns: FLOW_COLS,
        alignItems: "center",
        gap: 10,
        padding: "7px 0",
        borderTop: `1px solid ${C.sheetRow}`,
      }}
    >
      <span style={{ fontSize: 12.5, fontWeight: 600, color: C.label }}>{y.year}</span>
      <span style={{ position: "relative", display: "block", height: 12 }}>
        {/* 0 선. 막대 아래 깔면 폭 0 인 해에서 사라지므로 위에 얹는다. */}
        <span
          style={{
            position: "absolute",
            left: `${zeroPct}%`,
            top: -2,
            bottom: -2,
            width: 1,
            background: C.marker,
          }}
        />
        {drawn.map((d) => (
          <span
            key={d.key}
            style={{
              position: "absolute",
              left: `${d.start}%`,
              width: `${d.w}%`,
              top: 0,
              height: 12,
              background: d.fill,
              borderRadius: 2,
            }}
          />
        ))}
      </span>
      <span style={{ fontSize: 12, color: C.sub2, textAlign: "right" }}>
        {usdSigned(y.netPurchase)}
      </span>
      <span
        style={{
          fontSize: 12,
          fontWeight: y.valuation < 0 ? 700 : 400,
          color: y.valuation < 0 ? C.ink : C.sub2,
          textAlign: "right",
        }}
      >
        {usdSigned(y.valuation)}
      </span>
    </li>
  );
}
export default async function SeohakPage() {
  const ov = await getSeohakOverview();
  // 아래 셋은 서로 의존이 없다. 순서대로 await 하면 왕복이 앞뒤로 붙으므로 함께 띄운다.
  // ⚠️ 분기·ETF 두 층은 표가 아직 없을 수 있어 null 을 돌려준다(마이그레이션 043·042).
  // 그 경우 그 섹션만 접고 나머지는 그대로 뜬다.
  const [daily, quarterly, etf, equityType, calendar] = await Promise.all([
    getSeohakDaily(),
    getSeohakQuarterly(),
    getSeohakEtf(),
    getSeohakEquityType(),
    getSeohakCalendar(),
  ]);
  const maxInflow = Math.max(...ov.cohorts.map((c) => c.inflow));
  // 코호트 표를 두 열로 나눈다. 홀수면 앞 열이 한 줄 길다 — 뒤 열이 길면 오른쪽만
  // 아래로 삐져나와 카드 바닥이 어긋난다.
  const cohortHalf = Math.ceil(ov.cohorts.length / 2);
  const cohortCols = [ov.cohorts.slice(0, cohortHalf), ov.cohorts.slice(cohortHalf)].filter(
    (col) => col.length,
  );
  // '최근'은 마지막 두 해다. 연도를 손으로 박으면 해가 바뀐 날 "2025년 이후"가 세 해가
  // 되면서 각주만 조용히 거짓이 된다. 개월 수도 같은 기준에서 낸다(2026-05 이면 17개월).
  const latestYear = ov.cohorts[ov.cohorts.length - 1].year;
  const recentFrom = latestYear - 1;
  const recentMonths = (latestYear - recentFrom) * 12 + Number(ov.asOf.slice(5, 7));
  const recent = ov.cohorts.filter((c) => c.year >= recentFrom).reduce((s, c) => s + c.inflow, 0);
  const recentShare = (recent / ov.principal) * 100;

  // ── 잔고가 변한 이유 ─────────────────────────────────────────────────
  // 좌우 눈금을 한 곳에서 낸다. 0 을 가운데 두면 왼쪽으로 가장 멀리 가는 해(2022년
  // $80.8B)와 오른쪽으로 가장 멀리 가는 해(2025년 $148.7B)가 서로 다른 눈금을 쓰게 되어
  // 길이를 견줄 수 없다. 0 을 35% 지점에 두면 양쪽이 같은 눈금이 된다.
  const flowSpan = (keep: (v: number) => boolean) =>
    Math.max(
      ...ov.breakdown.years.map(
        (y) =>
          (keep(y.netPurchase) ? Math.abs(y.netPurchase) : 0) +
          (keep(y.valuation) ? Math.abs(y.valuation) : 0),
      ),
    );
  const flowRight = flowSpan((v) => v >= 0);
  const flowLeft = flowSpan((v) => v < 0);
  const flowZeroPct = (flowLeft / (flowLeft + flowRight)) * 100;
  const flowUnit = 100 / (flowLeft + flowRight);
  const flowTotal = ov.breakdown.netPurchase + ov.breakdown.valuation;
  const flowCashShare = (ov.breakdown.netPurchase / flowTotal) * 100;
  // 평가액이 가장 크게 빠진 해. 각주가 그 줄을 손으로 가리킨다 — 자료가 자라도 문장이
  // 거짓이 되지 않게 값에서 뽑는다.
  const worstYear = ov.breakdown.years.reduce<SeohakOverview["breakdown"]["years"][number] | null>(
    (a, b) => (b.valuation < 0 && b.valuation < (a?.valuation ?? 0) ? b : a),
    null,
  );

  return (
    // hz-cards 를 쓰지 않는다. 그건 브리핑의 4열 셀 격자라 자식마다 min-height 274px 가
    // 걸려 있어서, 짧은 시트 아래에 200px 짜리 빈 바닥이 생긴다(실측). 카더라와 같은
    // 맨 세로 흐름으로 둔다.
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* ── ② 오늘 · 일별 층 ──────────────────────────────────────────
          예탁원 결제 통계 하나에서 나오는 일곱 장. 브리핑과 같은 4열 셀 격자(.hz-cards)를
          써서 "카드 하나가 한 행을 통째로 먹는" 모양을 피한다 — 칸 합이 12라 3줄이 찬다.
          ⚠️ 이 격자는 아래 2열 래퍼 **바깥**에 있어야 한다. 안에 넣으면 380px 한 칸에
          갇혀 4열이 1열로 접힌다(실제로 그렇게 깨졌다). */}
      {/* 히어로 = 달력. 이 화면에서 가장 눈에 붙는 그림이고, 나머지 층이 그 아래에서
          '왜 그런가'를 답한다. */}
      {calendar && <CalendarHero c={calendar} />}

      {/* ── 구간 나누기 ───────────────────────────────────────────────
          카더라·브리핑·MDD 가 쓰는 것과 같은 머리 배지(SectionCaps)로 장을 가른다.
          히어로(달력)는 어느 장에도 안 넣는다 — 카더라도 히어로를 첫 배지 위에 둔다.

          기준은 **갱신 주기가 아니라 질문**이다. 주기로 나누면 "매일/매월/분기"가
          되는데, 그건 우리 파이프라인 사정이지 읽는 사람의 관심이 아니다. */}
      <SectionCaps label="어떻게 사고파나" count={1} />
      <DailySection d={daily} />

      {/* ── 분기 층 ───────────────────────────────────────────────────
          ⭐ 맨 아래였다. 13F 마감이 분기말 +45일이라 **갱신이 가장 느리다**는 이유로
          내려놓았는데, 그건 위 주석이 경계한 바로 그 기준이다 — 우리 파이프라인 사정이지
          읽는 사람의 관심이 아니다. 질문으로 보면 '누가'는 '어떻게'와 한 짝이라 바로
          뒤가 제자리다. 아래 두 장은 그릇('무엇에')과 잔고('얼마가')를 묻는 딴 갈래다. */}
      {quarterly && (
        <>
          <SectionCaps label="누구의 돈인가" count={2} />
          <QuarterlyCards q={quarterly} />
        </>
      )}

      {/* ⭐ '무엇에 담았나'였다. 그 이름일 때는 종류별 구성(SHL 연례)까지 여기 있었는데,
          그걸 아래로 내리고 나니 남은 둘이 전부 **국내 상장 ETF** 이야기다. 미국에 직접
          상장된 QQQ 같은 건 안 들어오는 딴 그릇이라, 이름으로 그 경계를 밝힌다. */}
      <SectionCaps label="국내 상장 ETF" count={etf ? 2 : 0} />
      {etf && <EtfSection e={etf} />}

      {/* ⭐ '종류별 구성'은 여기 있었는데 아래로 내렸다. 섹션 질문("무엇에 담았나")에
          직접 답하는 유일한 카드였지만 **1년에 한 번 바뀌는 자료**라(미 재무부 연례 조사)
          매일 갱신되는 ETF 석 장과 결이 달랐다. 잔고를 다루는 아래 장이 제 자리다. */}
      <SectionCaps label="얼마가 쌓였나" count={equityType ? 3 : 2} />

{/* ── 넣은 돈과 그 결과 ────────────────────────────────────────
          맨 위에 있었는데 내렸다. 40년 곡선은 배경이지 주인공이 아니다 — 이 페이지가
          매일 답해야 하는 건 '오늘'이다.

          ## ⭐ '원금과 평가액'과 '시작 연도별 성과'를 한 장으로 합쳤다

          둘은 같은 산수였다. 앞 카드의 `+156.9%` 는 뒤 카드 열두 해를 합친 값이라,
          **앞 장이 뒤 장의 합계**였는데 이름이 달라 딴 이야기처럼 보였다. 지금은
          위가 전체, 아래가 그 전체를 들어온 해로 쪼갠 것이다.

          ⚠️ 표를 **2열**로 세운다. 12해를 한 줄로 늘이면 표만 456px 이라 카드가
          900px 가까이 자란다(합치기 전 두 장 합이 417+607=1,024px 였다). */}
      <section className="hz-sheet">
        <SectionHead
          icon="savings"
          title="시작 연도별 성과"
          desc="한국인이 미국 주식에 넣은 원금이 지금 얼마가 됐는지, 들어온 해별로도 나눠 봅니다."
          note={`${ov.asOf} 기준`}
        />
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 22,
            alignItems: "baseline",
            padding: "16px 22px 4px",
          }}
        >
          <div>
            <div style={{ fontSize: 11.5, color: C.sub2, marginBottom: 3 }}>넣은 원금</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: C.sub, letterSpacing: "-.02em" }}>
              {usdB(ov.principal)}
            </div>
          </div>
          <div style={{ fontSize: 18, color: C.hint, alignSelf: "center" }}>→</div>
          <div>
            <div style={{ fontSize: 11.5, color: C.sub2, marginBottom: 3 }}>지금 평가액</div>
            <div style={{ fontSize: 30, fontWeight: 800, color: C.ink, letterSpacing: "-.02em" }}>
              {usdB(ov.marketValue)}
            </div>
          </div>
          <div style={{ marginLeft: "auto", textAlign: "right" }}>
            <div style={{ fontSize: 11.5, color: C.sub2, marginBottom: 3 }}>전체 손익</div>
            <div style={{ fontSize: 30, fontWeight: 800, color: C.blue, letterSpacing: "-.02em" }}>
              {pct(ov.returnPct)}
            </div>
          </div>
        </div>
        <PrincipalVsValue series={ov.series} />
        {/* 좌우 22px 은 여기서 준다(줄이 아니라). 열 사이 간격은 28px 로 두 열의 마지막
            칸('지금')과 다음 열의 첫 칸('들어온 해')이 붙어 보이지 않게 한다. */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(330px, 100%), 1fr))",
            columnGap: 28,
            padding: "8px 22px 0",
            alignItems: "start",
          }}
        >
          {cohortCols.map((rows) => (
            <CohortColumn key={rows[0].year} rows={rows} maxInflow={maxInflow} />
          ))}
        </div>
        {/* ⚠️ `.hz-sheet-foot` 은 **display:flex** 다. 안에 <b> 를 직접 두면 맨 텍스트와
            <b> 가 각각 flex 항목이 되어, 칸이 좁아지는 순간 "원/금/의" 처럼 낱글자로
            눌린다(2열 격자로 바꾸자마자 실제로 깨졌다). 통째로 <span> 하나에 담는다.
            JSX 는 태그 사이 줄바꿈의 공백을 지우므로 조사 공백은 {" "} 로 명시한다. */}
        <div className="hz-sheet-foot" style={{ fontSize: 12, color: C.sub }}>
          {/* ⚠️ 앞 판은 "원금의 33%가 2025년 이후에 들어왔습니다"로 시작했다. **그 자리의
              '원금'이 무엇인지 문장 안에 없어서** 33% 의 분모를 알 수 없었다. 정의를 먼저
              놓고 발견을 뒤에 붙인다. */}
          <span>
            넣은 원금 {usdB(ov.principal)}는 1985년부터 쌓인 누적 순매수인데, 그중{" "}
            <b style={{ color: C.ink }}>
              {recentShare.toFixed(0)}%가 최근 {recentMonths}개월에
            </b>{" "}
            들어왔습니다. 평가액은 그달 말 잔고입니다. 해별 &apos;지금&apos;은 그 해에 들어온
            돈이 이후 시세를 그대로 따라갔다고 볼 때의 값입니다.
          </span>
        </div>
      </section>

            {/* 2열 격자. 미디어쿼리 대신 auto-fit + minmax 로 접는다 — globals.css 를 건드리지
          않고도 폭에 따라 스스로 1열이 된다. 하한 380px 은 종류별 구성의 막대에서 온다:
          가장 좁은 조각이 14.1% 라 안쪽 폭 344px 에서 48px 이고, 거기 "14.1%"(28px)가
          겨우 들어간다.
          ⚠️ 국민연금은 여기 안 넣는다 — 줄이 네 칸(168+82+58)이라 한 칸 522px 에서 막대가
          60px 로 죽는다. 전폭으로 둔다. */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(380px, 100%), 1fr))", gap: 16, alignItems: "start" }}>
  {/* ── 종류별 구성 ────────────────────────────────────────────────
      전폭 시트였는데 격자 안 한 칸으로 내렸다. 창이 최근 다섯 해라 가장 좁은 조각이
      14.1% 이고, 494px 칸에서도 53px 이라 칸 안 % 가 그대로 들어간다(2014년 7.7% 를
      함께 그리던 시절에는 안 들어갔다). */}
        {equityType && <EquityTypeSection e={equityType} />}

    {/* ── 잔고가 변한 이유 ────────────────────────────────────────────
        ⭐ 제목이 '순매수와 평가차익'이었다. **'평가차익'은 이익이라는 뜻인데 이 값은
        마이너스가 된다**(2022년 −$80.8B). 게다가 제목만 '평가차익'이고 설명·라벨·각주는
        전부 '평가액 변동'이라 한 카드 안에서 말이 두 개였다. */}
          <section className="hz-sheet">
            <SectionHead
              icon="call_split"
              title="잔고가 변한 이유"
              desc="잔고 증감을 새로 넣은 돈과 평가액 변동으로 가릅니다."
              note={`${ov.breakdown.from}년부터`}
            />
            <div style={{ padding: "10px 22px 0" }}>
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {/* 머리줄이 곧 범례다. 색 견본을 이름 옆에 붙이면 따로 범례를 둘 자리를
                    안 쓴다 — 494px 칸에서 그 한 줄이 아깝다. */}
                <li
                  style={{
                    display: "grid",
                    gridTemplateColumns: FLOW_COLS,
                    gap: 10,
                    padding: "0 0 8px",
                    fontSize: 11,
                    color: C.faint,
                  }}
                >
                  <span>해</span>
                  <span />
                  <span style={{ textAlign: "right" }}>
                    <Swatch fill={FLOW_FILL.cash} />새 돈
                  </span>
                  <span style={{ textAlign: "right" }}>
                    <Swatch fill={FLOW_FILL.gain} />평가액
                  </span>
                </li>
                {ov.breakdown.years.map((y) => (
                  <FlowRow key={y.year} y={y} unit={flowUnit} zeroPct={flowZeroPct} />
                ))}
              </ul>
            </div>
            <div className="hz-sheet-foot" style={{ fontSize: 12, color: C.sub }}>
              <span>
                {ov.breakdown.from}년부터 잔고는 {usdSigned(flowTotal)} 늘었고 그중{" "}
                <b style={{ color: C.ink }}>{flowCashShare.toFixed(0)}%가 새로 넣은 돈</b>
                입니다. {worstYear ? (
                  <>
                    {/* 머리줄 견본은 파랑 둘뿐이라 **진한 슬레이트가 무엇인지 설명이 없다.**
                        범례 칸을 하나 더 두는 대신 이 문장이 색과 방향을 같이 말한다.
                        조사는 '를'로 고정한다 — 이 값은 "…달러"로 읽히고 '러'가 모음으로
                        끝나므로 금액이 얼마든 '을'이 되지 않는다. */}
                    {worstYear.year}년처럼 평가액이 빠진 해는 진한 색으로 왼쪽으로 뻗습니다. 그
                    해에는 {usdB(worstYear.netPurchase)}를 새로 넣고도 평가액이{" "}
                    <b style={{ color: C.ink }}>{usdB(Math.abs(worstYear.valuation))}</b> 빠져
                    잔고가 줄었습니다.{" "}
                  </>
                ) : null}
                두 값의 합이 잔고 증감과 정확히 일치하지는 않습니다. 원천이 잔차를 따로 두기
                때문입니다.
              </span>
            </div>
          </section>
      </div>

    </div>
  );
}
