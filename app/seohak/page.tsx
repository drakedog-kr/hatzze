import type { Metadata } from "next";

import {
  getLatestSettlement,
  getNpsPortfolio,
  getPeers,
  getSeohakOverview,
  type Cohort,
  type NpsPortfolio,
  type Peer,
  type SeohakOverview,
} from "@/lib/seohak-data";
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

/**
 * 월별 순매수·평가변동 두 칸 막대.
 *
 * div 로 짜다가 SVG 로 바꿨다. **음수가 섞이는 차트라 0 축이 있어야 하는데**, div 를
 * flex-end 로 쌓으면 음수도 위로 자라서 색만 다른 같은 모양이 된다 — 각주에는 "아래로
 * 뻗는다"고 적어 놓고 화면은 안 뻗던 상태였다. SVG 는 0 을 y 좌표로 못박을 수 있다.
 */
function MonthlyBars({ rows }: { rows: SeohakOverview["breakdown"]["rows"] }) {
  const W = 1200;
  const H = 120;
  const PAD = { t: 8, b: 20 };
  const span = Math.max(...rows.map((r) => Math.max(Math.abs(r.netPurchase), Math.abs(r.valuation)))) || 1;
  const zero = PAD.t + (H - PAD.t - PAD.b) / 2;
  const scale = (H - PAD.t - PAD.b) / 2 / span;
  const slot = W / rows.length;
  const bw = Math.min(16, slot * 0.22);

  const bar = (v: number, cx: number, fill: string) => {
    const h = Math.max(1.5, Math.abs(v) * scale);
    return <rect x={cx - bw / 2} y={v >= 0 ? zero - h : zero} width={bw} height={h} rx={2} fill={fill} />;
  };

  return (
    <div style={{ padding: "6px 18px 8px" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="auto" role="img" aria-label="월별 순매수와 평가변동">
        <line x1={0} y1={zero} x2={W} y2={zero} stroke={C.marker} strokeWidth={1} />
        {rows.map((r, i) => {
          const cx = slot * (i + 0.5);
          return (
            <g key={r.month}>
              {bar(r.valuation, cx - bw * 0.65, r.valuation >= 0 ? C.blueTint : C.track)}
              {bar(r.netPurchase, cx + bw * 0.65, r.netPurchase >= 0 ? C.blue : C.marker)}
              <text x={cx} y={H - 5} textAnchor="middle" fontSize={11} fill={C.faint}>
                {r.month.slice(5)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** 가로 막대 한 줄. 코호트·비교국·국민연금이 같은 어법을 쓴다. */
function BarRow({
  label,
  value,
  ratio,
  right,
  strong,
}: {
  label: string;
  value: string;
  ratio: number;
  right?: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <li
      style={{
        display: "grid",
        // 이름 칸 108px 은 나라 이름엔 넉넉한데 13F 발행사명(영문 대문자)엔 좁아
        // "NVIDIA CORPOR…" 로 잘렸다. 두 표가 같은 줄 어법을 쓰므로 넓은 쪽에 맞춘다.
        gridTemplateColumns: right ? "168px 1fr 82px 58px" : "168px 1fr 82px",
        alignItems: "center",
        gap: 10,
        padding: "9px 18px",
        borderTop: `1px solid ${C.sheetRow}`,
      }}
    >
      <span
        style={{
          fontSize: 12.5,
          fontWeight: strong ? 700 : 500,
          color: strong ? C.ink : C.label,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
      <span style={{ height: 8, background: C.track, borderRadius: R.pill, overflow: "hidden" }}>
        <span
          style={{
            display: "block",
            width: `${Math.max(2, ratio * 100)}%`,
            height: "100%",
            background: strong ? C.blue : C.bar,
          }}
        />
      </span>
      <span style={{ fontSize: 12, color: strong ? C.ink : C.sub2, textAlign: "right" }}>{value}</span>
      {right}
    </li>
  );
}

/**
 * 국민연금 미국 포트폴리오.
 *
 * ⚠️ **개인이 아니라 기관이다.** 제목과 각주 양쪽에서 그걸 말한다 — "한국인이 엔비디아를
 * 6.8% 담았다" 로 읽히면 거짓이고, 종목별 개인 보유 비중은 어떤 공개 원천으로도 안 나온다.
 */
function NpsSheet({ nps }: { nps: NpsPortfolio }) {
  const max = nps.top[0]?.value ?? 1;
  return (
    <section className="hz-sheet">
      <SectionHead
        icon="account_balance"
        title="국민연금은 미국에서 무엇을 들고 있나"
        desc="개인이 아니라 기관입니다. 전 국민의 노후 자금이 미국 주식에 어떻게 들어가 있는지입니다."
        note={`${nps.reportDate} 기준`}
      />
      <div style={{ display: "flex", gap: 22, padding: "16px 18px 6px", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11.5, color: C.sub2, marginBottom: 3 }}>보유 종목</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: C.ink }}>{nps.positions.toLocaleString("ko-KR")}</div>
        </div>
        <div>
          <div style={{ fontSize: 11.5, color: C.sub2, marginBottom: 3 }}>평가액</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: C.ink }}>{usdB(nps.total / 1_000_000)}</div>
        </div>
        {nps.prevDate && (
          <div style={{ marginLeft: "auto", textAlign: "right" }}>
            <div style={{ fontSize: 11.5, color: C.sub2, marginBottom: 3 }}>직전 분기 대비</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>
              신규 {nps.added} · 처분 {nps.removed}
            </div>
          </div>
        )}
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {nps.top.map((h) => (
          <BarRow
            key={h.issuer}
            label={h.issuer}
            value={usdB(h.value / 1_000_000)}
            ratio={h.value / max}
            right={
              <span style={{ fontSize: 12, color: C.sub2, textAlign: "right" }}>{h.sharePct.toFixed(1)}%</span>
            }
          />
        ))}
      </ul>
      <div className="hz-sheet-foot">
        미 증권거래위원회(SEC) 13F 신고. 분기말 기준이고 제출이 최대 45일 늦습니다. 이 표의 비중은 국민연금
        포트폴리오 안에서의 비중이지, 한국인 전체가 그 종목을 그만큼 들었다는 뜻이 아닙니다.
      </div>
    </section>
  );
}

export default async function SeohakPage() {
  const ov = await getSeohakOverview();
  // 아래 셋은 서로 의존이 없다. 순서대로 await 하면 왕복이 앞뒤로 붙으므로 함께 띄운다.
  const [peers, nps, today] = await Promise.all([
    getPeers(ov.asOf),
    getNpsPortfolio(),
    getLatestSettlement(),
  ]);
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

      {/* ── 오늘의 서학개미 (매일 갱신) ─────────────────────────────── */}
      {today && (
        <section className="hz-sheet">
          <SectionHead
            icon="today"
            title="직전 거래일, 실제로 사고판 것"
            desc="예탁결제원 결제 기준입니다. 이 화면에서 유일하게 매일 바뀌는 칸입니다."
            note={`${today.date} 결제`}
          />
          <div style={{ display: "flex", gap: 22, padding: "16px 18px 6px", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 11.5, color: C.sub2, marginBottom: 3 }}>매수</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: C.ink, letterSpacing: "-.02em" }}>
                {usdB(today.usBuy / 1_000_000)}
              </div>
              <div style={{ fontSize: 11.5, color: C.sub2, marginTop: 2 }}>
                {today.usBuyCount.toLocaleString("ko-KR")}건
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11.5, color: C.sub2, marginBottom: 3 }}>매도</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: C.ink, letterSpacing: "-.02em" }}>
                {usdB(today.usSell / 1_000_000)}
              </div>
              <div style={{ fontSize: 11.5, color: C.sub2, marginTop: 2 }}>
                {today.usSellCount.toLocaleString("ko-KR")}건
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11.5, color: C.sub2, marginBottom: 3 }}>1건당 매수</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: C.ink, letterSpacing: "-.02em" }}>
                ${Math.round(today.usBuy / Math.max(1, today.usBuyCount)).toLocaleString("ko-KR")}
              </div>
            </div>
            <div style={{ marginLeft: "auto", textAlign: "right" }}>
              <div style={{ fontSize: 11.5, color: C.sub2, marginBottom: 3 }}>해외주식 매수 중 미국</div>
              <div style={{ fontSize: 30, fontWeight: 800, color: C.blue, letterSpacing: "-.02em" }}>
                {((today.usBuy / Math.max(1, today.allStockBuy)) * 100).toFixed(1)}%
              </div>
            </div>
          </div>
          <div className="hz-sheet-foot">
            결제일은 거래일보다 1영업일 늦습니다. 한국예탁결제원 국제거래 외화증권 예탁결제 통계이고, 예탁원을
            거치지 않는 기관 거래는 잡히지 않습니다.
          </div>
        </section>
      )}

      {/* ── 잔고가 늘어난 이유 ──────────────────────────────────────── */}
      <section className="hz-sheet">
        <SectionHead
          icon="call_split"
          title="더 사서 늘었나, 올라서 늘었나"
          desc="잔고만 보면 둘을 구분할 수 없습니다. 새로 넣은 돈과 평가액 변동을 갈라 놓습니다."
          note={`최근 ${ov.breakdown.months}개월`}
        />
        <div style={{ display: "flex", gap: 0, padding: "16px 18px 10px", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 150px" }}>
            <div style={{ fontSize: 11.5, color: C.sub2, marginBottom: 3 }}>새로 넣은 돈</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: C.ink, letterSpacing: "-.02em" }}>
              {usdB(ov.breakdown.netPurchase)}
            </div>
          </div>
          <div style={{ flex: "1 1 150px" }}>
            <div style={{ fontSize: 11.5, color: C.sub2, marginBottom: 3 }}>평가액 변동</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: C.blue, letterSpacing: "-.02em" }}>
              {usdB(ov.breakdown.valuation)}
            </div>
          </div>
          <div style={{ flex: "1 1 150px" }}>
            <div style={{ fontSize: 11.5, color: C.sub2, marginBottom: 3 }}>새로 넣은 돈의 몫</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: C.ink, letterSpacing: "-.02em" }}>
              {(
                (ov.breakdown.netPurchase / (ov.breakdown.netPurchase + ov.breakdown.valuation)) *
                100
              ).toFixed(0)}
              %
            </div>
          </div>
        </div>
        <MonthlyBars rows={ov.breakdown.rows} />
        <div className="hz-sheet-foot">
          진한 막대가 새로 넣은 돈, 옅은 막대가 평가액 변동입니다. 아래로 뻗은 달은 순매도이거나 평가손실입니다.
          두 값의 합이 잔고 증감과 정확히 일치하지는 않습니다. 원천이 잔차를 따로 두기 때문입니다.
        </div>
      </section>

      {/* ── 역전 ───────────────────────────────────────────────────── */}
      {ov.reversal.ratioNow !== null && (
        <section className="hz-sheet">
          <SectionHead
            icon="swap_horiz"
            title="격차가 사라지고 있습니다"
            desc="우리가 든 미국 주식과, 그들이 든 한국 주식을 견줍니다."
            note={`${ov.asOf} 기준`}
          />
          <div style={{ display: "flex", gap: 22, padding: "16px 18px 4px", flexWrap: "wrap", alignItems: "baseline" }}>
            <div>
              <div style={{ fontSize: 11.5, color: C.sub2, marginBottom: 3 }}>우리가 든 미국 주식</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: C.ink }}>{usdB(ov.reversal.ours)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11.5, color: C.sub2, marginBottom: 3 }}>그들이 든 한국 주식</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: C.ink }}>{usdB(ov.reversal.theirs)}</div>
            </div>
            <div style={{ marginLeft: "auto", textAlign: "right" }}>
              <div style={{ fontSize: 11.5, color: C.sub2, marginBottom: 3 }}>
                {ov.reversal.peakMonth} {ov.reversal.peakRatio.toFixed(2)}배 →
              </div>
              <div style={{ fontSize: 30, fontWeight: 800, color: C.blue, letterSpacing: "-.02em" }}>
                {ov.reversal.ratioNow.toFixed(2)}배
              </div>
            </div>
          </div>
          <div className="hz-sheet-foot">
            {ov.reversal.peakMonth}에 {ov.reversal.peakRatio.toFixed(2)}배였던 것이 지금{" "}
            {ov.reversal.ratioNow.toFixed(2)}배입니다.{" "}
            {ov.reversal.usNetSincePeak < 0 ? (
              <>
                그 사이 미국 투자자는 한국 주식을 오히려{" "}
                <b style={{ color: C.ink }}>{usdB(Math.abs(ov.reversal.usNetSincePeak))} 순매도</b>했습니다.
                {ov.reversal.theirsGrowth &&
                  ` 그런데도 그들이 든 몫은 ${ov.reversal.theirsGrowth.toFixed(1)}배가 됐습니다.`}{" "}
                격차가 좁혀진 건 그들이 사서가 아니라 한국 증시가 크게 올랐기 때문입니다.
              </>
            ) : (
              <>같은 기간 미국 투자자의 한국 주식 순매수는 {usdB(ov.reversal.usNetSincePeak)}였습니다.</>
            )}
          </div>
        </section>
      )}

      {/* ── 비교국 ─────────────────────────────────────────────────── */}
      <section className="hz-sheet">
        <SectionHead
          icon="public"
          title="다른 나라와 견주면"
          desc="같은 달, 나라별로 보유한 미국 주식입니다."
          note={`${ov.asOf} 기준`}
        />
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {peers.map((p) => (
            <BarRow
              key={p.code}
              label={p.name}
              value={usdB(p.holdings)}
              ratio={p.holdings / peers[0].holdings}
              strong={p.isHome}
            />
          ))}
        </ul>
        <div className="hz-sheet-foot">
          TIC 은 보관기관이 어디에 있는지로 집계합니다. 싱가포르·영국처럼 금융 중심지가 크게 잡히는 건 그
          나라 사람이 많이 사서가 아니라 제3국 돈이 거기를 거치기 때문이라, 인구로 나눠 견주면 안 됩니다.
        </div>
      </section>

      {/* ── 국민연금 ───────────────────────────────────────────────── */}
      {nps && <NpsSheet nps={nps} />}

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
          {/* 국민연금 시트가 붙으면서 "모든 수치가 TIC 하나에서 나온다"가 거짓이 됐다.
              원천은 둘이고, 어느 카드가 어느 쪽인지 여기서 못박는다. */}
          <div style={{ marginTop: 10, color: C.sub2, fontSize: 11.5 }}>
            원천은 둘입니다. 국민연금 시트만 미 증권거래위원회(SEC) 13F 이고, 나머지는 전부 미 재무부
            국제자본흐름(TIC) 통계입니다. 특정 종목을 사거나 팔라는 뜻이 아니며, 매수·매도 신호가 아닙니다.
          </div>
        </div>
      </section>
    </div>
  );
}
