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

/**
 * $B 표기. **$10B 아래는 소수 한 자리**로 낸다.
 *
 * ⚠️ 정수로만 두면 신고자 목록의 작은 줄이 `$0B` 가 된다("그 밖 3곳 $0B"). 값이 0.1 인데
 * 0 으로 적으면 "왜 이 줄이 있나"가 남는다.
 */
const usdB = (v: number) =>
  `$${(v / 1e9).toLocaleString("ko-KR", { maximumFractionDigits: Math.abs(v) < 1e10 ? 1 : 0 })}B`;
const pct = (v: number, digits = 1) =>
  `${v >= 0 ? "+" : "−"}${Math.abs(v).toLocaleString("ko-KR", { maximumFractionDigits: digits })}%`;

/**
 * 이 층의 두 색. **기관은 잉크, 나머지는 파랑**이다.
 *
 * ⚠️ 기관이 `C.marker`(#c7d5e3)였다. 곡선으로 그리면 **이긴 쪽이 가장 안 보이는 색**이
 * 되어(누적 +25.1% 로 위에 있는 선인데 배경에 묻혔다) 그림이 서툴러 보였다. 잉크로
 * 바꾸면 파랑과 명암·색상이 둘 다 갈려서 두 선이 나란히 읽힌다 — 종류별 구성이 쓰는
 * `blue ↔ inkSoft` 와 같은 어법이다.
 *
 * ⛔ BUY/SELL 빨강·파랑을 안 쓴다. 이 페이지에서 그 짝은 사자·팔자 뜻이라, 기관과
 * 개인을 그 색으로 가르면 한 화면에서 색이 두 말을 한다.
 */
const INST = C.inkSoft;
const REST = C.blue;

/* ── ⑧ 기관 몫 ──────────────────────────────────────────────────
   막대 하나를 둘로 가르는 게 이 데이터의 생김새다. 다만 **비중이 거의 안 변한다는 것**
   자체가 사실이라(26.6~34.6%), 아래에 분기별 점을 얇게 깔아 "요즘 갑자기 기관이
   늘었다"는 식의 오해를 막는다.

   ## ⭐ '기관 9곳'이라고만 하고 누구인지는 안 알려주고 있었다

   신고자 목록을 아래에 붙인다. 이 장의 제목이 '누구의 돈인가'인데 정작 그 '누구'가
   화면에 없었다. 덤으로 카드 높이가 292 → 옆 카드와 비슷해져 두 장의 바닥이 맞는다.

   ⚠️ **아홉 곳이 늘 아홉은 아니다.** 지금까지 신고한 곳이 아홉이고 분기마다 일곱쯤
   낸다(2026-03 은 일곱, 한화·머스트가 최근 빠졌다). 그래서 줄 수는 자료가 정한다. */
function InstitutionShare({ q }: { q: SeohakQuarterly }) {
  const lo = Math.min(...q.shareTrail.map((s) => s.share));
  const hi = Math.max(...q.shareTrail.map((s) => s.share));
  const span = Math.max(4, hi - lo);
  // 1% 아래는 한 줄로 접는다. 2026-03 기준 세 곳을 합쳐 0.1% 라, 각자 한 줄씩 주면
  // 막대가 안 보이는 줄만 셋이 된다.
  const big = q.filers.filter((f) => f.share >= 1);
  const small = q.filers.filter((f) => f.share < 1);
  const smallUsd = small.reduce((s, f) => s + f.usd, 0);
  const topShare = big[0]?.share ?? 0;

  return (
    <>
      <Verdict>
        미국 주식에 든 한국 돈의 <Em>{(100 - q.share).toFixed(0)}%</Em>는 기관 밖입니다
      </Verdict>

      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 9 }}>
        <div style={{ display: "flex", height: 30, borderRadius: 5, overflow: "hidden" }}>
          <span style={{ width: `${q.share}%`, background: INST }} />
          <span style={{ flex: 1, background: REST }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11.5 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, minWidth: 0 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: INST, flexShrink: 0 }} />
            <span style={{ color: C.sub }}>기관</span>
            <b style={{ fontFamily: MONO, color: C.ink }}>{usdB(q.institutionUsd)}</b>
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, minWidth: 0 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: REST, flexShrink: 0 }} />
            <span style={{ color: C.sub }}>나머지</span>
            <b style={{ fontFamily: MONO, color: C.ink }}>{usdB(q.restUsd)}</b>
          </span>
        </div>

        {/* 신고자 목록. 막대는 1위 대비라 1위가 칸을 꽉 채운다 — 전체 대비로 두면
            국민연금이 60% 라 나머지 넷이 전부 손톱만 해진다. */}
        {big.length > 0 && (
          <ul style={{ listStyle: "none", margin: 0, padding: "6px 0 0",
                       borderTop: `1px solid ${C.line}`, display: "flex",
                       flexDirection: "column" }}>
            {big.map((f, i) => (
              <li key={f.name}
                  title={`${f.name} · ${f.holdings.toLocaleString("ko-KR")}종목`}
                  style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 46px 54px 34px",
                           alignItems: "center", gap: 8, padding: "5px 0",
                           borderBottom: i < big.length - 1 || small.length
                             ? `1px solid ${C.sheetRow}` : undefined }}>
                <span style={{ fontSize: 11.5, color: C.sub, minWidth: 0, overflow: "hidden",
                               textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                <span className="hz-bar">
                  <span style={{ width: `${Math.max(4, (f.share / topShare) * 100)}%`,
                                 background: INST }} />
                </span>
                <span style={{ fontFamily: MONO, fontSize: 11.5, color: C.ink, fontWeight: 700,
                               textAlign: "right" }}>{usdB(f.usd)}</span>
                <span style={{ fontFamily: MONO, fontSize: 10.5, color: C.faint,
                               textAlign: "right" }}>{f.share.toFixed(0)}%</span>
              </li>
            ))}
            {small.length > 0 && (
              <li style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 46px 54px 34px",
                           alignItems: "center", gap: 8, padding: "5px 0" }}>
                <span style={{ fontSize: 11.5, color: C.faint }}>그 밖 {small.length}곳</span>
                <span />
                <span style={{ fontFamily: MONO, fontSize: 11.5, color: C.sub2,
                               textAlign: "right" }}>{usdB(smallUsd)}</span>
                <span style={{ fontFamily: MONO, fontSize: 10.5, color: C.faint,
                               textAlign: "right" }}>0%</span>
              </li>
            )}
          </ul>
        )}

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
                             background: i === q.shareTrail.length - 1 ? INST : C.track }} />
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
  // ⚠️⚠️ viewBox 가 300×84 였다. 카드가 495px 이 되면서 안쪽 451px 에 1.5배로 늘어났고,
  // `fontSize={9}` 가 **13.5px 로 그려졌다** — 카드에서 제일 큰 작은 글씨가 축 라벨이
  // 됐고 선도 2 → 3px 로 굵어졌다. 그림이 서툴러 보이던 가장 큰 이유다.
  // 450 이면 그 폭에서 배율이 1 이라 적은 값이 그대로 그려진다.
  const W = 450;
  // ⭐ 높이는 **옆 카드에 맞춘 값**이다. `width:100%·height:auto` 라 그려지는 높이가 곧
  // 이 값이고(카드 495px 일 때 안쪽이 451px 이라 배율 ≈1), 132 로 뒀을 때 두 장이
  // 398 대 448 로 50px 어긋났다. 185 면 451 대 448 이 되어 바닥이 맞는다.
  // ⚠️ 그래서 옆 카드의 줄 수가 바뀌면 이 값도 다시 잡아야 한다.
  const H = 185;
  const PAD = { t: 10, b: 18, l: 2, r: 2 };
  const all = q.race.flatMap((p) => [p.institution, p.rest]);
  // 위아래 12% 를 비운다. 안 비우면 100 선이 바닥에 딱 붙고 두 곡선이 왼쪽 아래
  // 모서리에서 시작해 그림이 눌린 것처럼 보인다.
  const rawLo = Math.min(100, ...all);
  const rawHi = Math.max(...all);
  const pad = (rawHi - rawLo || 1) * 0.12;
  const lo = rawLo - pad;
  const hi = rawHi + pad;
  const x = (i: number) => PAD.l + (i / (q.race.length - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => H - PAD.b - ((v - lo) / (hi - lo || 1)) * (H - PAD.t - PAD.b);
  const path = (key: "institution" | "rest") =>
    q.race.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join("");
  // 두 곡선 사이를 채운다. **이 면적이 곧 결론 문장의 '몇 %p 앞섰나'** 라, 숫자를
  // 안 읽어도 벌어지는 모양으로 전달된다.
  const band =
    path("institution") +
    q.race
      .slice()
      .reverse()
      .map((p, i) => `L${x(q.race.length - 1 - i).toFixed(1)},${y(p.rest).toFixed(1)}`)
      .join("") +
    "Z";

  const ahead = q.instTotal >= q.restTotal;
  const gap = Math.abs(q.instTotal - q.restTotal);
  const last = q.race[q.race.length - 1];

  return (
    <>
      <Verdict>
        {q.quarters}분기 동안 <Em>{ahead ? "기관" : "나머지"}가 {pct(gap).replace("+", "")}p 앞섰습니다</Em>
      </Verdict>

      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", gap: 8 }}>
          {[
            { label: "기관", v: q.instTotal, color: INST },
            { label: "나머지", v: q.restTotal, color: REST },
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
          {/* 벌어진 폭 = 결론 문장의 %p. 두 선보다 뒤에 앉게 먼저 그린다. */}
          <path d={band} fill={C.chip} />
          {/* 100 기준선. 원금 자리라 이게 없으면 두 곡선의 높낮이만 보인다.
              점선이라 데이터선과 안 헷갈리고, 라벨을 붙여 '무슨 선'인지 말한다. */}
          <line x1={PAD.l} x2={W - 22} y1={y(100)} y2={y(100)} stroke={C.marker}
                strokeWidth={1} strokeDasharray="3 3" />
          <text x={W - 19} y={y(100) + 3} fontSize={9} fill={C.faint}>원금</text>
          <path d={path("rest")} fill="none" stroke={REST} strokeWidth={1.6}
                strokeLinejoin="round" strokeLinecap="round" />
          <path d={path("institution")} fill="none" stroke={INST} strokeWidth={1.6}
                strokeLinejoin="round" strokeLinecap="round" />
          {/* 끝점. 곡선이 어디서 끝나는지가 이 그림의 결론이라 점을 찍어 못박는다.
              흰 테를 둘러 두 점이 겹쳐도 갈린다. */}
          {[
            { v: last.rest, fill: REST },
            { v: last.institution, fill: INST },
          ].map((d) => (
            <circle key={d.fill} cx={x(q.race.length - 1)} cy={y(d.v)} r={2.8}
                    fill={d.fill} stroke={C.card} strokeWidth={1.4} />
          ))}
          <text x={PAD.l} y={H - 4} fontSize={9} fill={C.faint}>{q.race[0].quarter.slice(0, 7)}</text>
          <text x={W - PAD.r} y={H - 4} fontSize={9} fill={C.faint} textAnchor="end">
            {last.quarter.slice(0, 7)}
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
