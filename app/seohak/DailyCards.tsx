import type { SeohakYear } from "@/lib/seohak-yearly";
import { BUY, SELL } from "./tone";
import { C, Icon, MONO, R } from "../ui";

/**
 * '어떻게 사고파나' 층 — **산 것과 판 것, 두 막대뿐.**
 *
 * ## 여덟 판을 갈아엎고 남은 규칙 하나
 *
 * 이 섹션은 카드 셋을 각각 대여섯 번씩 다시 썼고 전부 "무슨 말인지 모르겠다"를 받았다.
 * 낱말도 바꿔 보고 그림도 바꿔 보고 잉크도 줄여 봤는데 계속 실패했다.
 *
 * ⭐⭐⭐ 공통점은 **전부 파생된 개념을 보여줬다**는 것이다.
 *
 *   '평소의 몇 %'  → '평소'가 뭔지 정의해야 한다(2년 중앙값)
 *   '한 번에 얼마'  → 결제 건수가 사람 수가 아니라고 해명해야 한다
 *   '순매수'       → 수익이 아니라고 해명해야 한다
 *   '늘어난 것'     → 잔고가 불었다는 뜻이 아니라고 해명해야 한다
 *
 * 그리고 그 해명을 각주로 떠받쳤다. **각주가 필요하다는 것 자체가 안 직관적이라는
 * 증거였다**(Hun 지적). 설명이 늘수록 카드는 더 안 읽힌다.
 *
 * 그래서 파생을 전부 버렸다. 남은 건 원자료 둘 — **산 금액과 판 금액**. 나란히 놓으면
 * 어느 쪽이 긴지가 곧 답이고, 2023년에 파란 막대가 더 긴 것도 그냥 보인다.
 * ⭐ 이 파일에는 '순매수'도 '평소'도 안 나온다.
 */

export const usd = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${Math.round(v).toLocaleString("ko-KR")}`;
};
export const cnt = (v: number) => v.toLocaleString("ko-KR");

export function Card({
  icon,
  title,
  desc,
  note,
  foot,
  children,
}: {
  icon: string;
  title: string;
  /** 제목 아래 한 줄. 이 카드가 무엇을 재는지 여기서 끝내야 한다. */
  desc: string;
  note?: string;
  /** 없으면 안 그린다 — 각주가 없어도 되는 카드가 제일 좋은 카드다. */
  foot?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="hz-sheet" style={{ padding: "var(--hz-card-pad)", display: "flex",
                                           flexDirection: "column", gap: 14, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <Icon name={icon} style={{ fontSize: 18, color: C.muted, marginTop: 1, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
          <h3 style={{ margin: 0, fontSize: 13.5, fontWeight: 800, color: C.ink,
                       lineHeight: 1.3, letterSpacing: "-.01em", wordBreak: "keep-all" }}>{title}</h3>
          <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.45, color: C.sub2,
                      wordBreak: "keep-all" }}>{desc}</p>
        </div>
        {note && (
          <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, color: C.sub,
                         background: C.chip, borderRadius: R.pill, padding: "3px 8px" }}>{note}</span>
        )}
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>{children}</div>
      {foot && (
        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.45, color: C.sub2,
                    wordBreak: "keep-all" }}>{foot}</p>
      )}
    </section>
  );
}

/** 결론 문장. 카드마다 같은 자리에서 같은 크기로 나온다. */
export function Verdict({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ margin: 0, fontSize: 15, lineHeight: 1.45, fontWeight: 700, color: C.ink,
                wordBreak: "keep-all" }}>
      {children}
    </p>
  );
}

export const Em = ({ children }: { children: React.ReactNode }) => (
  <span style={{ color: C.blue }}>{children}</span>
);

/** 카드 격자. 세 층(일별·분기·ETF)이 같은 자를 쓴다.
 *  ⚠️ auto-**fill** 이다. auto-fit 은 빈 트랙을 접어서 마지막 줄에 혼자 남은 카드를
 *  행 전체로 늘려 버린다 — "카드 하나가 가로로 쭉 길어지는" 그 모양이다. */
export const CARD_GRID: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(min(300px, 100%), 1fr))",
  gap: 14,
};

/** 산 것·판 것 두 막대. 이 섹션의 유일한 그림이라 한 곳에서만 만든다. */
function Pair({
  label, buy, sell, max, dim, strong,
}: {
  label: string; buy: number; sell: number; max: number; dim?: boolean; strong?: boolean;
}) {
  const w = (v: number) => `${Math.max(1.5, (v / max) * 100)}%`;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, opacity: dim ? 0.5 : 1 }}>
      <span style={{ flex: "0 0 32px", fontSize: 11.5, color: strong ? C.ink : C.sub,
                     fontWeight: strong ? 800 : 600 }}>{label}</span>
      <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
        <span style={{ height: 9, borderRadius: 2, width: w(buy), background: BUY }} />
        <span style={{ height: 9, borderRadius: 2, width: w(sell), background: SELL }} />
      </span>
      <span style={{ flex: "0 0 58px", display: "flex", flexDirection: "column", gap: 3,
                     textAlign: "right", fontFamily: MONO, fontSize: 11, fontWeight: 700 }}>
        <span style={{ color: C.ink }}>{usd(buy)}</span>
        <span style={{ color: C.sub2 }}>{usd(sell)}</span>
      </span>
    </div>
  );
}

function Legend() {
  return (
    <div style={{ display: "flex", gap: 12, fontSize: 11, color: C.sub }}>
      {[{ c: BUY, t: "산 것" }, { c: SELL, t: "판 것" }].map((l) => (
        <span key={l.t} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 9, height: 9, borderRadius: 2, background: l.c }} />
          {l.t}
        </span>
      ))}
    </div>
  );
}

type Month = { month: string; buy: number; sell: number };

/* ── ① 달마다 ────────────────────────────────────────────────────────── */
function ByMonth({ months }: { months: Month[] }) {
  const rows = months.slice(-12);
  const max = Math.max(...rows.flatMap((m) => [m.buy, m.sell])) || 1;
  const last = rows[rows.length - 1];

  return (
    <>
      <Verdict>
        이번 달은 <Em>{last.buy >= last.sell ? "산 것" : "판 것"}이 더 많습니다</Em>
      </Verdict>
      <Legend />
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: "auto" }}>
        {/* 이번 달은 아직 안 끝났으니 옅게. 연도 카드의 진행 중인 해와 같은 어법이라
            따로 설명하지 않는다 — 달 이름만 봐도 진행 중인 걸 안다. */}
        {rows.map((m, i) => (
          <Pair key={m.month} label={`${Number(m.month.slice(5))}월`} buy={m.buy} sell={m.sell}
                max={max} dim={i === rows.length - 1} strong={i === rows.length - 1} />
        ))}
      </div>
    </>
  );
}

/* ── ② 해마다 ────────────────────────────────────────────────────────── */
function ByYear({ years }: { years: SeohakYear[] }) {
  const max = Math.max(...years.flatMap((y) => [y.buy, y.sell])) || 1;
  // 판 것이 더 길었던 해. 이 그림에서 눈에 걸리는 유일한 자리라 결론 문장이 그걸 짚는다.
  const flipped = years.filter((y) => y.sell > y.buy);

  return (
    <>
      <Verdict>
        {flipped.length > 0 ? (
          <><Em>{flipped.map((y) => `${y.year}년`).join("·")}</Em>만 판 것이 더 많았습니다</>
        ) : (
          <>해마다 <Em>산 것이 더 많았습니다</Em></>
        )}
      </Verdict>
      <Legend />
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: "auto" }}>
        {years.map((y) => (
          <Pair key={y.year} label={`'${String(y.year).slice(2)}`} buy={y.buy} sell={y.sell}
                max={max} dim={y.partial} strong={y.sell > y.buy} />
        ))}
      </div>
    </>
  );
}

export function DailySection({
  months,
  years,
}: {
  months: Month[] | null;
  years: SeohakYear[] | null;
}) {
  return (
    <div style={{ display: "grid", gap: 14,
                  gridTemplateColumns: "repeat(auto-fit, minmax(min(320px, 100%), 1fr))" }}>
      {months && months.length > 1 && (
        <Card icon="calendar_view_month" title="달마다 얼마나 사고팔았나"
              desc="한 달에 산 금액과 판 금액입니다."
              note="최근 12개월">
          <ByMonth months={months} />
        </Card>
      )}
      {years && (
        <Card icon="bar_chart" title="해마다 얼마나 사고팔았나"
              desc="한 해에 산 금액과 판 금액입니다."
              note={`${years[0].year}~`}>
          <ByYear years={years} />
        </Card>
      )}
    </div>
  );
}
