import { C } from "../ui";

/**
 * 테마 안에서 말이 어디 몰렸나 — **막대 하나**(2026-09-23).
 *
 * 이 자리에 종목 지도(트리맵)가 있었다. 바로 아래 표가 같은 열 종목을 이름·언급 수·평소 대비와 함께
 * 다시 보여줘, 한 시트(약 1,000px)가 같은 목록을 두 번 그렸다. 게다가 폰(375px)에서는 지도 50칸 중
 * 45칸에 이름이 안 들어가 색 조각만 남았다. 지도가 혼자 하던 일은 "몇 종목에 쏠렸나" 하나라, 그것만
 * 막대 한 줄로 남긴다 — 앞 다섯 종목의 몫과 나머지.
 *
 * 색은 순서를 명도로 말하는 파랑 램프(--c-blue-1~5)다. 오르내림이 아니라 순서라 온도색을 안 쓴다.
 */
const TOP = 5;
const RAMP = ["var(--c-blue-1)", "var(--c-blue-2)", "var(--c-blue-3)", "var(--c-blue-4)", "var(--c-blue-5)"];

export function ShareBar({ stocks, ariaLabel }: { stocks: { code: string; name: string; mentions: number }[]; ariaLabel: string }) {
  const total = stocks.reduce((s, x) => s + x.mentions, 0);
  if (total <= 0) return null;
  const top = [...stocks].sort((a, b) => b.mentions - a.mentions).slice(0, TOP);
  const topSum = top.reduce((s, x) => s + x.mentions, 0);
  const restCount = stocks.length - top.length;
  const rest = total - topSum;
  const pct = (n: number) => (n / total) * 100;
  const label = (n: number) => `${Math.round(pct(n))}%`;
  const segs = [...top.map((s, i) => ({ key: s.code, name: s.name, n: s.mentions, color: RAMP[i] })), ...(rest > 0 ? [{ key: "rest", name: `나머지 ${restCount}종목`, n: rest, color: "var(--c-bar-mute)" }] : [])];
  return (
    <div role="img" aria-label={ariaLabel} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", height: 12, borderRadius: 6, overflow: "hidden", gap: 2 }}>
        {segs.map((s) => (
          <span key={s.key} className="hz-tip" data-tip={`${s.name} · ${label(s.n)}`} style={{ width: `${pct(s.n)}%`, minWidth: 3, background: s.color }} />
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px" }}>
        {segs.map((s) => (
          <span key={s.key} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: "var(--fs-12)", color: C.sub, whiteSpace: "nowrap" }}>
            <span aria-hidden style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flex: "none" }} />
            <span style={{ color: s.key === "rest" ? C.sub : C.ink, fontWeight: s.key === "rest" ? 600 : 700 }}>{s.name}</span>
            <span style={{ fontFamily: "inherit" }}>{label(s.n)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
