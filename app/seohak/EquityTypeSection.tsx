import type { EquityMix, SeohakEquityType } from "@/lib/seohak-equity-type";
import { SectionHead } from "../kadera/SectionHead";
import { C, MONO } from "../ui";

/**
 * 무엇을 들고 있나 — 보통주 · 펀드·ETF · 우선주·기타.
 *
 * ## 색 셋은 검증기로 골랐다
 *
 * 처음엔 `blue → bar(#cfe6fc) → marker(#c7d5e3)` 로 잡았는데, dataviz 검증기가
 * 인접 쌍 `#cfe6fc↔#c7d5e3` 을 **정상 시력 ΔE 5.0**(하한 15)으로 떨어뜨렸다 —
 * 색약이 아니어도 구분이 안 된다는 뜻이다([[project_seohak_anatomy_page]] 의
 * BLUE_SCALE 경고와 같은 결). 지금 셋은 전 쌍 ΔE 24.2(색약) / 24.7(정상)로 통과한다.
 *
 *   node scripts/validate_palette.js "#3182f6,#c7d5e3,#3c5064" --mode light --pairs all
 *
 * ⚠️ 검증기가 `#c7d5e3` 의 배경 대비를 1.49 로 경고한다. 그건 **눈에 보이는 라벨을
 * 달면 해소되는 종류**라, 세 칸 모두 이름과 값을 직접 붙였다(범례에만 두면 안 된다).
 *
 * ⚠️⚠️ **다크 작업 때 이 자리를 볼 것.** `inkSoft` 는 글자용 토큰이라 다크에서 밝아진다.
 * 그러면 '우선주·기타'와 '보통주'의 명암이 뒤집힌다 — 정체는 라벨이 지고 있으니
 * 안 깨지지만, 두 칸의 인상이 바뀐다.
 */
const FILL = {
  common: C.blue,
  funds: C.marker,
  other: C.inkSoft,
} as const;

const PARTS = [
  { key: "common", label: "보통주", desc: "개별 종목을 직접" },
  { key: "funds", label: "펀드·ETF", desc: "묶음으로" },
  { key: "other", label: "우선주·기타", desc: "원천이 더 안 쪼갭니다" },
] as const;

const usdB = (mn: number) =>
  `$${(mn / 1000).toLocaleString("ko-KR", { maximumFractionDigits: mn >= 100_000 ? 0 : 1 })}B`;
const pp = (v: number) =>
  `${v >= 0 ? "+" : "−"}${Math.abs(v).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}%p`;

/** 100% 기준 세로 기둥 하나. 12개가 모여 흐름이 된다. */
function Column({ m, dim, label }: { m: EquityMix; dim?: boolean; label?: string }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, minWidth: 0 }}>
      <div
        title={`${m.year} · 보통주 ${m.commonPct.toFixed(1)}% · 펀드·ETF ${m.fundsPct.toFixed(1)}% · 우선주·기타 ${m.otherPct.toFixed(1)}%`}
        style={{ width: "100%", height: 74, display: "flex", flexDirection: "column",
                 gap: 1.5, opacity: dim ? 0.5 : 1 }}
      >
        {PARTS.map((p) => (
          <span key={p.key} style={{ height: `${m[`${p.key}Pct`]}%`, background: FILL[p.key],
                                     borderRadius: 1.5 }} />
        ))}
      </div>
      {label !== undefined && (
        <span style={{ fontSize: 8.5, color: C.faint, letterSpacing: "-0.03em" }}>{label}</span>
      )}
    </div>
  );
}

export function EquityTypeSection({ e }: { e: SeohakEquityType }) {
  const { latest, mover, worldLatest } = e;
  const worldMover = worldLatest[`${mover.key}Pct`] - e.world[0][`${mover.key}Pct`];

  return (
    <section className="hz-sheet">
      <SectionHead
        icon="pie_chart"
        title="무엇을 들고 있나"
        desc="한국인이 든 미국 주식을 종류로 가른 것입니다."
        note={`${latest.year}-06 기준`}
      />

      <div style={{ padding: "14px 22px 4px", display: "flex", flexDirection: "column", gap: 16 }}>
        {/* ── 오늘의 3분할 ── */}
        {/* 칸 사이 2px 틈. 색이 갈려 있어도 경계가 있어야 '세 조각'으로 읽힌다(dataviz 규격). */}
        <div style={{ display: "flex", height: 34, gap: 2 }}>
          {PARTS.map((p) => (
            <span key={p.key} style={{ width: `${latest[`${p.key}Pct`]}%`, background: FILL[p.key],
                                       borderRadius: 3 }} />
          ))}
        </div>

        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid",
                     gridTemplateColumns: "repeat(auto-fit, minmax(min(190px, 100%), 1fr))", gap: 12 }}>
          {PARTS.map((p) => (
            <li key={p.key} style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12,
                             fontWeight: 700, color: C.label }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, background: FILL[p.key], flexShrink: 0 }} />
                {p.label}
              </span>
              <span style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
                <b style={{ fontFamily: MONO, fontSize: 21, fontWeight: 800, color: C.ink,
                            letterSpacing: "-0.02em" }}>
                  {latest[`${p.key}Pct`].toFixed(1)}%
                </b>
                <span style={{ fontFamily: MONO, fontSize: 12, color: C.sub2, fontWeight: 700 }}>
                  {usdB(latest[p.key])}
                </span>
              </span>
              <span style={{ fontSize: 11, color: C.faint }}>{p.desc}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* ── 열두 해의 흐름. 한국 옆에 전 세계를 나란히 둔다 ──
          한국만 보면 2021년 급증을 '조사 분류가 바뀌었나'로 읽게 된다. 같은 해 전 세계가
          가만히 있었다는 대조가 있어야 한국인의 실제 변화라고 말할 수 있다. */}
      <div style={{ padding: "6px 22px 4px", display: "grid", gap: 18,
                    gridTemplateColumns: "repeat(auto-fit, minmax(min(300px, 100%), 1fr))" }}>
        {[
          { title: "대한민국", rows: e.series, dim: false },
          { title: "전 세계", rows: e.world, dim: true },
        ].map((panel) => (
          <div key={panel.title} style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: panel.dim ? C.sub2 : C.ink }}>
              {panel.title}
            </span>
            <div style={{ display: "flex", gap: 3, alignItems: "flex-end" }}>
              {panel.rows.map((m, i) => (
                <Column key={m.year} m={m} dim={panel.dim}
                        label={m.year % 5 === 0 || i === panel.rows.length - 1 ? `${m.year}` : ""} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="hz-sheet-foot" style={{ fontSize: 12, color: C.sub }}>
        <span>
          열한 해 동안 한국은 <b style={{ color: C.ink }}>{mover.label}가 {pp(mover.deltaPp)}</b> 움직였는데
          같은 기간 전 세계는 {pp(worldMover)} 였습니다. 미 재무부 연례 조사라 해마다 6월 말 기준으로 한 번 바뀌고,
          &apos;우선주·기타&apos;가 무엇인지는 원천이 더 쪼개지 않습니다.
        </span>
      </div>
    </section>
  );
}
