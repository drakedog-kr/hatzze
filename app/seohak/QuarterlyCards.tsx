import type { SeohakQuarterly } from "@/lib/seohak-quarterly";
import { C, MONO, R } from "../ui";
import { CARD_GRID, Card, Em, Verdict } from "./DailyCards";

/**
 * 분기 층 — 기관과 나머지.
 *
 * 이 층만 카드 둘이다. 하나는 **얼마나**(몫), 하나는 **얼마나 잘했나**(수익률)를 묻는다.
 *
 * ## 두 카드가 같은 각주를 쓴다
 *
 * 여기 '기관'은 SEC 에 13F 를 내는 한국 소재 **9곳**뿐이다. 보험사·중소 운용사·직접
 * 투자하는 법인은 안 잡히므로 기관 몫은 **하한**이고, 나머지는 '개인'이 아니라
 * '그 9곳이 아닌 전부'다. 각주에서 매번 밝힌다 — 이걸 흐리면 카드가 거짓말이 된다.
 */

const usdB = (v: number) => `$${(v / 1e9).toLocaleString("ko-KR", { maximumFractionDigits: 0 })}B`;
const pct = (v: number, digits = 1) =>
  `${v >= 0 ? "+" : "−"}${Math.abs(v).toLocaleString("ko-KR", { maximumFractionDigits: digits })}%`;

/* ── ⑧ 기관 몫 ──────────────────────────────────────────────────
   막대 하나를 둘로 가르는 게 이 데이터의 생김새다. 다만 **비중이 거의 안 변한다는 것**
   자체가 사실이라(26.6~34.6%), 아래에 분기별 점을 얇게 깔아 "요즘 갑자기 기관이
   늘었다"는 식의 오해를 막는다. */
function InstitutionShare({ q }: { q: SeohakQuarterly }) {
  const lo = Math.min(...q.shareTrail.map((s) => s.share));
  const hi = Math.max(...q.shareTrail.map((s) => s.share));
  const span = Math.max(4, hi - lo);

  return (
    <>
      <Verdict>
        미국 주식에 든 한국 돈의 <Em>{(100 - q.share).toFixed(0)}%</Em>는 기관 밖입니다
      </Verdict>

      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 9 }}>
        <div style={{ display: "flex", height: 30, borderRadius: 5, overflow: "hidden" }}>
          <span style={{ width: `${q.share}%`, background: C.marker }} />
          <span style={{ flex: 1, background: C.blue }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11.5 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, minWidth: 0 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: C.marker, flexShrink: 0 }} />
            <span style={{ color: C.sub }}>기관 9곳</span>
            <b style={{ fontFamily: MONO, color: C.ink }}>{usdB(q.institutionUsd)}</b>
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, minWidth: 0 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: C.blue, flexShrink: 0 }} />
            <span style={{ color: C.sub }}>나머지</span>
            <b style={{ fontFamily: MONO, color: C.ink }}>{usdB(q.restUsd)}</b>
          </span>
        </div>

        {/* 비중 추이. 값이 안 움직인다는 걸 보여주는 게 목적이라 세로 폭을 좁게 둔다. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 3, paddingTop: 4,
                      borderTop: `1px solid ${C.line}` }}>
          <span style={{ fontSize: 10.5, color: C.sub2, fontWeight: 600 }}>
            기관 몫은 {q.quarters + 1}분기 내내 {lo.toFixed(0)}~{hi.toFixed(0)}% 였습니다
          </span>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 22 }}>
            {q.shareTrail.map((s, i) => (
              <span key={s.quarter} title={`${s.quarter} · ${s.share.toFixed(1)}%`}
                    style={{ flex: 1, borderRadius: 1,
                             height: `${20 + ((s.share - lo) / span) * 80}%`,
                             background: i === q.shareTrail.length - 1 ? C.blue : C.track }} />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

/* ── ⑨ 기관과 나머지, 누가 잘했나 ───────────────────────────────────────
   ⚠️⚠️ **분기 하나를 막대로 그리면 안 된다.** TIC 순매수가 연준 추정 분해값이라
   분기 단위 오차가 크다(2025Q2 나스닥 +17.8% 인데 폐합식은 +7.15%). 오차는 방향이
   랜덤이라 누적에서 상쇄되므로 — 7분기 복리 +20.89% vs 한 번에 닫으면 +22.21% —
   **누적 곡선 두 줄**로 그린다. 이 그림은 마디 하나가 틀려도 결론이 안 뒤집힌다. */
function WhoDidBetter({ q }: { q: SeohakQuarterly }) {
  const W = 300;
  const H = 84;
  const PAD = { t: 6, b: 16 };
  const all = q.race.flatMap((p) => [p.institution, p.rest]);
  const lo = Math.min(100, ...all);
  const hi = Math.max(...all);
  // 선 굵기가 2 라 양 끝이 viewBox 밖으로 반 픽셀 나간다. 안쪽으로 2 씩 물린다.
  const x = (i: number) => 2 + (i / (q.race.length - 1)) * (W - 4);
  const y = (v: number) => H - PAD.b - ((v - lo) / (hi - lo || 1)) * (H - PAD.t - PAD.b);
  const path = (key: "institution" | "rest") =>
    q.race.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join("");

  const ahead = q.instTotal >= q.restTotal;
  const gap = Math.abs(q.instTotal - q.restTotal);

  return (
    <>
      <Verdict>
        {q.quarters}분기 동안 <Em>{ahead ? "기관" : "나머지"}가 {pct(gap).replace("+", "")}p 앞섰습니다</Em>
      </Verdict>

      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", gap: 8 }}>
          {[
            { label: "기관 9곳", v: q.instTotal, color: C.marker },
            { label: "나머지", v: q.restTotal, color: C.blue },
          ].map((s) => (
            <div key={s.label} style={{ flex: 1, background: C.soft, borderRadius: R.control,
                                        padding: "8px 10px", display: "flex", flexDirection: "column", gap: 1 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5,
                             fontSize: 10.5, color: C.sub2, fontWeight: 600 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color }} />
                {s.label}
              </span>
              <span style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800, color: C.ink,
                             letterSpacing: "-0.02em" }}>{pct(s.v)}</span>
            </div>
          ))}
        </div>

        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}
             role="img" aria-label="기관과 나머지의 누적 수익 곡선">
          {/* 100 기준선. 원금 자리라 이게 없으면 두 곡선의 높낮이만 보인다. */}
          <line x1={0} x2={W} y1={y(100)} y2={y(100)} stroke={C.line} strokeWidth={1} />
          <path d={path("rest")} fill="none" stroke={C.blue} strokeWidth={2}
                strokeLinejoin="round" strokeLinecap="round" />
          <path d={path("institution")} fill="none" stroke={C.marker} strokeWidth={2}
                strokeLinejoin="round" strokeLinecap="round" />
          <text x={0} y={H - 3} fontSize={9} fill={C.faint}>{q.race[0].quarter.slice(0, 7)}</text>
          <text x={W} y={H - 3} fontSize={9} fill={C.faint} textAnchor="end">
            {q.race[q.race.length - 1].quarter.slice(0, 7)}
          </text>
        </svg>
      </div>
    </>
  );
}

export function QuarterlyCards({ q }: { q: SeohakQuarterly }) {
  return (
    <div style={CARD_GRID}>
      <Card icon="account_balance" title="기관 몫"
            desc="미국 주식에 든 한국 돈 중 기관이 아닌 몫입니다."
            note={`${q.asOf.slice(0, 7)} 기준`}
            foot="SEC 에 13F 를 내는 한국 기관 9곳만 셉니다. 실제 기관 몫은 이보다 큽니다.">
        <InstitutionShare q={q} />
      </Card>

      <Card icon="emoji_events" title="보유분 수익률"
            desc="산 것과 판 것을 걷어내고 들고 있던 것만의 수익률입니다."
            note={`${q.quarters}분기 누적`}
            foot="분기 하나는 추정 오차가 커서 누적으로만 봅니다. '나머지'는 개인이 아니라 그 9곳이 아닌 전부입니다.">
        <WhoDidBetter q={q} />
      </Card>
    </div>
  );
}
