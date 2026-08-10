import type { Metadata } from "next";

import { getSeohakOverview, type Cohort, type SeohakOverview } from "@/lib/seohak-data";
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
    <div style={{ padding: "14px 18px 6px" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="auto" role="img" aria-label="원금과 평가액 추이">
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

/**
 * 코호트 줄. 막대는 '그 해 들어온 돈의 크기', 오른쪽 숫자는 '지금 수익률'이다.
 * 둘을 한 줄에 두는 이유는, 돈이 가장 많이 들어온 해가 수익률이 가장 낮은 해라는
 * 사실이 그 두 값을 나란히 놓아야만 보이기 때문이다.
 */
function CohortRow({ c, maxInflow }: { c: Cohort; maxInflow: number }) {
  const w = Math.max(2, (c.inflow / maxInflow) * 100);
  return (
    <li
      style={{
        display: "grid",
        gridTemplateColumns: "44px 1fr 76px 62px",
        alignItems: "center",
        gap: 10,
        padding: "9px 18px",
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

export default async function SeohakPage() {
  const ov = await getSeohakOverview();
  const maxInflow = Math.max(...ov.cohorts.map((c) => c.inflow));
  const recent = ov.cohorts.filter((c) => c.year >= 2025).reduce((s, c) => s + c.inflow, 0);
  const recentShare = (recent / ov.principal) * 100;

  return (
    // hz-cards 를 쓰지 않는다. 그건 브리핑의 4열 셀 격자라 자식마다 min-height 274px 가
    // 걸려 있어서, 짧은 시트 아래에 200px 짜리 빈 바닥이 생긴다(실측). 카더라와 같은
    // 맨 세로 흐름으로 둔다.
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* ── 히어로 ─────────────────────────────────────────────────── */}
      <section className="hz-sheet">
        <SectionHead
          icon="savings"
          title="넣은 돈과 그 결과"
          desc="한국인이 미국 주식에 실제로 넣은 원금과, 그 돈이 지금 얼마가 됐는지입니다."
          note={`${ov.asOf} 기준`}
        />
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 22,
            alignItems: "baseline",
            padding: "16px 18px 4px",
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
        <div className="hz-sheet-foot">
          미 재무부 국제자본흐름(TIC) 통계. 원금은 1985년부터의 누적 순매수이고, 평가액은 그달 말 잔고입니다.
          기관과 개인이 함께 들어 있습니다.
        </div>
      </section>

      {/* ── 코호트 ─────────────────────────────────────────────────── */}
      <section className="hz-sheet">
        <SectionHead
          icon="calendar_month"
          title="언제 시작했느냐가 전부입니다"
          desc="들어온 해별로 나눠, 그 해에 넣은 돈이 지금 얼마가 됐는지 봅니다."
          note="연도별"
        />
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          <li
            style={{
              display: "grid",
              gridTemplateColumns: "44px 1fr 76px 62px",
              gap: 10,
              padding: "4px 18px 8px",
              fontSize: 11,
              color: C.faint,
            }}
          >
            <span>들어온 해</span>
            <span />
            <span style={{ textAlign: "right" }}>넣은 돈</span>
            <span style={{ textAlign: "right" }}>지금</span>
          </li>
          {ov.cohorts.map((c) => (
            <CohortRow key={c.year} c={c} maxInflow={maxInflow} />
          ))}
        </ul>
        {/* JSX 는 태그 사이 줄바꿈의 공백을 지운다. `원금의 <b>…</b> 가` 처럼 써 두면
            "원금의33%가" 로 붙어 버리므로, 조사는 {" "} 로 공백을 명시한다. */}
        <div className="hz-sheet-foot">
          원금의{" "}
          <b style={{ color: C.ink }}>{recentShare.toFixed(0)}%가</b> 2025년 이후에 들어왔습니다. 전체 손익{" "}
          {pct(ov.returnPct, 0)}는 오래 보유한 쪽이 만든 숫자라, 대부분의 계좌는 이 표 아래쪽에 있습니다.
        </div>
      </section>

      {/* ── 방법 ───────────────────────────────────────────────────── */}
      <section className="hz-sheet">
        <SectionHead
          icon="function"
          title="어떻게 계산했나"
          desc="연도별 수익률은 계산 방법에 따라 크게 갈립니다. 그래서 방법을 적어 둡니다."
        />
        <div style={{ padding: "14px 18px", fontSize: 12.5, lineHeight: 1.7, color: C.inkSoft }}>
          연도별 수익률은 <b style={{ color: C.ink }}>잔고에서 순매수를 뺀 나머지를 수익으로 보는</b> 방식으로
          냈습니다. 잔고는 실측이고 순매수만 추정이라, 이 방식이라야 연도별 합계가 실제 잔고와 맞아떨어집니다.
          지금 어긋남은 <b style={{ color: C.ink }}>{pct(ov.closureErrorPct)}</b> 입니다. 원천이 제공하는
          평가변동 값을 그대로 쓰면 −14.8%, 미국 주가지수로 갈음하면 +21.1% 까지 벌어집니다.
          <div style={{ marginTop: 10, color: C.sub2, fontSize: 11.5 }}>
            이 화면의 모든 수치는 미 재무부 TIC 통계 하나에서 나옵니다. 특정 종목을 사거나 팔라는 뜻이 아니며,
            매수·매도 신호가 아닙니다.
          </div>
        </div>
      </section>
    </div>
  );
}
