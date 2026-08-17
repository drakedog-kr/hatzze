import type { EquityMix, SeohakEquityType } from "@/lib/seohak-equity-type";
import { SectionHead } from "../kadera/SectionHead";
import { C, MONO } from "../ui";

/**
 * 종류별 구성 — 보통주 · 펀드·ETF · 우선주·기타.
 *
 * ## ⚠️⚠️ 12칸 두 줄을 다섯 막대로 바꿨다
 *
 * 앞 판은 한국 12년 + 전 세계 12년을 3분할 기둥으로 세웠다. **칸이 24개, 조각이 72개**
 * 였고 셋 다 비슷한 파랑이라 무엇이 변했는지 한눈에 안 읽혔다("직관적이지 않고 복잡해
 * 보인다"). 지금은 **최근 다섯 해만** 가로 막대로 눕히고 칸마다 %를 안에 적는다 —
 * 조각 15개, 범례를 오가지 않아도 된다.
 *
 * ## ⚠️⚠️⚠️ 창을 바꾸면 결론이 **뒤집힌다.** 둘 다 적을 것
 *
 *   11년(2014→2025)  보통주 −9.2%p · 펀드·ETF **+0.5%p** · 우선주·기타 +8.7%p
 *   5년(2021→2025)   보통주 −3.8%p · 펀드·ETF **+6.5%p** · 우선주·기타 −2.8%p
 *
 * 11년으로 보면 "펀드·ETF 는 제자리"고 5년으로 보면 "펀드·ETF 가 늘고 있다"다. **정반대
 * 다.** 갈림의 정체는 2021~2022년 우선주·기타의 스파이크(10.4 → 19.2 → **24.9%**)이고,
 * 그게 지금 되돌아오는 중이라 5년 창의 시작점이 유난히 높다.
 *
 * ⛔ 그래서 5년 막대만 그려 놓고 "ETF 로 옮겨 간다"고 쓰면 창을 골라 이야기를 만든
 * 것이 된다. 각주가 **두 창을 같이** 말한다.
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
  const { latest, first } = e;
  /** 화면에 그리는 다섯 해. 자료가 다섯 해보다 짧으면 있는 만큼만 나온다. */
  const recent = e.series.slice(-5);
  const since = recent[0];
  /** 그린 창(5년)에서 가장 크게 늘어난 칸. 이게 그림이 말하는 것이다. */
  const grew = [...PARTS]
    .map((p) => ({ ...p, delta: latest[`${p.key}Pct`] - since[`${p.key}Pct`] }))
    .reduce((a, b) => (b.delta > a.delta ? b : a));
  /** ⚠️ 같은 칸을 **전 구간**으로도 재 둔다. 두 창의 부호가 갈리는 일이 실제로 있다. */
  const grewLong = latest[`${grew.key}Pct`] - first[`${grew.key}Pct`];
  /** 창이 갈리는 까닭 — 우선주·기타가 언제 얼마까지 튀었나. */
  const spike = e.series.reduce((a, b) => (b.otherPct > a.otherPct ? b : a));
  /**
   * 전 세계 '우선주·기타'가 머문 띠. **한 시점의 차이(%p)를 적으면 안 된다** — 앞 판은
   * 전 구간 변화(−0.4%p)를 "그해"라고 적어 기간이 어긋나 있었다. 띠로 말하면 어느 창을
   * 봐도 참이다.
   */
  const worldBand = e.world.map((w) => w.otherPct);
  const worldLo = Math.min(...worldBand);
  const worldHi = Math.max(...worldBand);
  /* ⚠️⚠️ **이 페이지에서 모집단이 다른 유일한 카드다.** 나머지는 예탁원 결제(국내 증권사를
     거친 개인 채널)로 재는데, 이건 미 재무부 SHL 연례 조사라 **국민연금까지 포함한 전
     국민**이다. 원천이 부문을 안 나눠서 개인만 뗄 방법이 없다. 그래서 제목 옆 배지와 설명
     양쪽에 '전 국민'을 박는다 — 한쪽에만 적으면 다른 쪽을 보고 개인 것으로 읽는다. */

  return (
    <section className="hz-sheet">
      <SectionHead
        icon="pie_chart"
        title="종류별 구성"
        desc="한국인이 든 미국 주식을 종류로 가른 것입니다. 이 카드만 개인이 아니라 전 국민 기준입니다."
        note={`${latest.year}-06 · 전 국민`}
      />

      <div style={{ padding: "16px 22px 4px", display: "flex", flexDirection: "column", gap: 6 }}>
        {recent.map((m) => <MixBar key={m.year} m={m} when={`${m.year}년`} />)}
      </div>

      <div style={{ padding: "12px 22px 4px", display: "flex", flexDirection: "column", gap: 8 }}>
        {/* ⚠️ 이 줄이 없으면 범례의 %p 가 어느 창인지 모른다. 앞 판은 막대가 5년인데
            %p 는 11년 값이라 **막대에서 줄어드는 칸이 범례에서는 +8.7%p** 였다. */}
        <span style={{ fontSize: 11, color: C.faint }}>
          지금 금액 · {since.year}년 대비 변화
        </span>
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
                  {pp(latest[`${p.key}Pct`] - since[`${p.key}Pct`])}
                </span>
              </span>
              <span style={{ fontSize: 11, color: C.faint }}>{p.desc}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="hz-sheet-foot" style={{ fontSize: 12, color: C.sub }}>
        <span>
          {since.year}년부터 <b style={{ color: C.ink }}>{grew.label}가 {pp(grew.delta)}</b>{" "}
          늘었습니다. 다만{" "}
          <b style={{ color: C.ink }}>{first.year}년까지 늘이면 {pp(grewLong)}</b>
          라, 어디서 끊느냐에 따라 이야기가 갈립니다 — {spike.year}년에 우선주·기타가{" "}
          {spike.otherPct.toFixed(1)}% 까지 튀었다가 돌아오는 중이어서입니다. 같은 기간 전
          세계의 우선주·기타는 {worldLo.toFixed(1)}~{worldHi.toFixed(1)}% 에 머물러 있었으니
          조사 분류가 바뀐 것은 아닙니다. 미 재무부 연례 조사라 해마다 6월 말 기준으로 한 번
          바뀌고, &apos;우선주·기타&apos;가 무엇인지는 원천이 더 쪼개지 않습니다.
        </span>
      </div>
    </section>
  );
}
