import type { EquityMix, SeohakEquityType } from "@/lib/seohak-equity-type";
import { SectionHead } from "../kadera/SectionHead";
import { C, MONO } from "../ui";

/**
 * 무엇을 들고 있나 — 보통주 · 펀드·ETF · 우선주·기타.
 *
 * ## ⚠️⚠️ 12칸 두 줄을 두 막대로 바꿨다
 *
 * 앞 판은 한국 12년 + 전 세계 12년을 3분할 기둥으로 세웠다. **칸이 24개, 조각이 72개**
 * 였고 셋 다 비슷한 파랑이라 무엇이 변했는지 한눈에 안 읽혔다("직관적이지 않고 복잡해
 * 보인다"). 정작 이 카드가 하려는 말은 하나다 — **11년 전과 지금이 이만큼 다르다.**
 *
 * 그래서 **두 시점만 나란히** 둔다. 조각이 72개에서 6개로 줄고, 칸마다 %를 안에 적어
 * 범례를 오가지 않아도 된다.
 *
 * ## ⭐ 주인공이 바뀌었다
 *
 * `mover` 는 가장 크게 움직인 칸을 고르는데 그게 보통주(−9.2%p)다. 하지만 읽는 사람에게
 * 뜻이 있는 쪽은 **늘어난 칸**이다 — 우선주·기타가 7.7% → 16.4% 로 두 배가 됐다.
 * 그리고 **펀드·ETF 는 20.2% → 20.6% 로 사실상 그대로다**(11년 동안 +0.4%p). "한국인이
 * ETF 로 옮겨 갔다"는 흔한 이야기가 이 자료에서는 안 보인다는 뜻이라 그걸 문장으로 낸다.
 *
 * ⚠️ 전 세계 기둥은 뺐지만 **한 줄로는 남긴다.** 한국의 '우선주·기타'가 2021년에
 * 10.4%→19.2% 로 뛴 게 조사 분류가 바뀐 탓이 아니라고 말할 수 있는 근거가 그것뿐이다
 * (같은 해 전 세계는 6.8→6.7 로 가만히 있었다).
 *
 * ## 색 셋은 검증기로 골랐다
 *
 * 처음엔 `blue → bar(#cfe6fc) → marker(#c7d5e3)` 로 잡았는데, dataviz 검증기가 인접 쌍
 * `#cfe6fc↔#c7d5e3` 을 **정상 시력 ΔE 5.0**(하한 15)으로 떨어뜨렸다 — 색약이 아니어도
 * 구분이 안 된다는 뜻이다. 지금 셋은 전 쌍 ΔE 24.2(색약) / 24.7(정상)로 통과한다.
 *
 *   node scripts/validate_palette.js "#3182f6,#c7d5e3,#3c5064" --mode light --pairs all
 *
 * ⚠️⚠️ **다크 작업 때 이 자리를 볼 것.** `inkSoft` 는 글자용 토큰이라 다크에서 밝아진다.
 * 그러면 '우선주·기타'와 '보통주'의 명암이 뒤집힌다 — 칸 안 글자색(`INK_ON`)도 같이
 * 갈리므로 둘을 한 번에 확인할 것.
 */
const FILL = {
  common: C.blue,
  funds: C.marker,
  other: C.inkSoft,
} as const;

/**
 * 칸 안에 얹는 글자색. 밝은 칸(펀드·ETF)만 잉크고 나머지는 흰색이다.
 *
 * ⚠️ 검증기가 `#c7d5e3` 의 배경 대비를 1.49 로 경고했던 그 칸이다. 흰 글자를 얹으면
 * 아예 안 읽힌다.
 */
const INK_ON = {
  common: C.card,
  funds: C.ink,
  other: C.card,
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

/**
 * 한 해의 3분할 막대. 칸 안에 %를 적는다.
 *
 * ⚠️ 좁은 칸에 글자를 넣으면 넘친다. **7% 미만이면 비운다.** 9% 로 뒀더니 2014년
 * 우선주·기타(7.7%)만 빈 칸이 되어 "왜 저기만 숫자가 없나"가 남았다. 이 시트는 폭을
 * 통째로 쓰므로 막대가 883px 이고 7.7% 가 68px 이라 "7.7%"(28px)가 넉넉히 들어간다.
 * ⚠️ 좁은 화면에서는 이 여유가 사라진다 — 모바일 작업 때 다시 볼 것. 넘치더라도
 * `overflow: hidden` 이 옆 칸을 덮는 것만은 막는다.
 */
function MixBar({ m, when }: { m: EquityMix; when: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
      <span style={{ flex: "0 0 62px", fontSize: 11.5, color: C.sub2, fontWeight: 700 }}>
        {when}
      </span>
      <div style={{ flex: 1, display: "flex", height: 30, gap: 2, minWidth: 0 }}>
        {PARTS.map((p) => (
          <span key={p.key}
                title={`${m.year} · ${p.label} ${m[`${p.key}Pct`].toFixed(1)}%`}
                style={{ width: `${m[`${p.key}Pct`]}%`, background: FILL[p.key], borderRadius: 3,
                         display: "flex", alignItems: "center", justifyContent: "center",
                         minWidth: 0, overflow: "hidden" }}>
            {m[`${p.key}Pct`] >= 7 && (
              <b style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: INK_ON[p.key],
                          letterSpacing: "-0.02em", whiteSpace: "nowrap" }}>
                {m[`${p.key}Pct`].toFixed(1)}%
              </b>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

export function EquityTypeSection({ e }: { e: SeohakEquityType }) {
  const { latest, first, worldLatest } = e;
  // 늘어난 칸이 이야기의 주인공이다. `mover`(가장 크게 움직인 칸)는 줄어든 쪽을 집는다.
  const grew = [...PARTS]
    .map((p) => ({ ...p, delta: latest[`${p.key}Pct`] - first[`${p.key}Pct`] }))
    .reduce((a, b) => (b.delta > a.delta ? b : a));
  const fundsDelta = latest.fundsPct - first.fundsPct;
  const worldOther = worldLatest.otherPct - e.world[0].otherPct;

  return (
    <section className="hz-sheet">
      <SectionHead
        icon="pie_chart"
        title="무엇을 들고 있나"
        desc="한국인이 든 미국 주식을 종류로 가른 것입니다."
        note={`${latest.year}-06 기준`}
      />

      <div style={{ padding: "16px 22px 4px", display: "flex", flexDirection: "column", gap: 8 }}>
        <MixBar m={first} when={`${first.year}년`} />
        <MixBar m={latest} when={`${latest.year}년`} />
      </div>

      <div style={{ padding: "12px 22px 4px" }}>
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
                  {usdB(latest[p.key])}
                </b>
                <span style={{ fontFamily: MONO, fontSize: 12, color: C.sub2, fontWeight: 700 }}>
                  {pp(latest[`${p.key}Pct`] - first[`${p.key}Pct`])}
                </span>
              </span>
              <span style={{ fontSize: 11, color: C.faint }}>{p.desc}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="hz-sheet-foot" style={{ fontSize: 12, color: C.sub }}>
        <span>
          {latest.year - first.year}년 동안{" "}
          <b style={{ color: C.ink }}>{grew.label}가 {pp(grew.delta)}</b> 늘었고{" "}
          <b style={{ color: C.ink }}>펀드·ETF 는 {pp(fundsDelta)} 로 그대로</b>입니다.
          같은 기간 전 세계의 우선주·기타는 {pp(worldOther)} 였으니 조사 분류가 바뀐 것은
          아닙니다. 미 재무부 연례 조사라 해마다 6월 말 기준으로 한 번 바뀌고,
          &apos;우선주·기타&apos;가 무엇인지는 원천이 더 쪼개지 않습니다.
        </span>
      </div>
    </section>
  );
}
