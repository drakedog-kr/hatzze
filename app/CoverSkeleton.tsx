import { Icon } from "./ui";

/**
 * 로딩 자리표시자의 첫 줄 띠(.v2-cover). 실물 띠와 같은 태그 · 클래스에 비슷한 길이 글자를 visibility:hidden 으로 세운다 —
 * 테두리만 보이는 빈 띠인데, 폭마다 실물과 같은 규칙으로 접혀 키가 맞는다(MDD 의 CoverPlaceholder 와 같은 방식 · app/mdd/sheet.tsx).
 *
 * 높이 41 고정이던 때는 폰(390)에서 실물(카더라 166 · 미장 카더라 156 · 내부자 92 · 내부자 종목 208 · 배당 112)로 바뀌는 순간
 * 아래 판 전체가 33~167px 내려갔다(2026-10-14). 칸 구성은 화면마다 흔한 꼴을 넘긴다 — 글자는 보이지 않으니 뜻은 없다.
 */
export type CoverCell =
  /** 지수 칸 — 머리 한 줄 + [이름 · 값 · 곁값] 여럿(카더라 코스피 · 코스닥, 배당 종목 수) */
  | { kind: "idx"; k: string; v: [string, string, string?][] }
  /** 링크 칸(<a>) — 폰 규칙 `a.v2-cover-go:last-of-type` 이 실물과 똑같이 걸리게 같은 태그 */
  | { kind: "go"; k: string; v: string; chg?: string }
  /** 값 칸 — 머리 + 값(+ 곁값) */
  | { kind: "cell"; k: string; v: string; chg?: string; price?: boolean }
  /** 이름 칸 — 종목 로고(20) + 이름, 또는 사람 이름 + 곁줄 */
  | { kind: "id"; title: string; sub?: string; logo?: boolean }
  /** 통화 스위치 칸(폰에선 탑바로 가 0) */
  | { kind: "cur" }
  /** 기준일 칸 */
  | { kind: "meta"; text: string };

const hidden = { visibility: "hidden" } as const;

export function CoverSkeleton({ cells }: { cells: CoverCell[] }) {
  return (
    <div className="v2-cover" aria-hidden>
      {cells.map((c, i) => {
        switch (c.kind) {
          case "idx":
            return (
              <div key={i} className="v2-cover-cell v2-cover-idx" style={hidden}>
                <span className="v2-cover-k">{c.k}</span>
                {c.v.map(([em, b, chg], j) => (
                  <span key={j} className="v2-cover-v">
                    <em>{em}</em>
                    <b>{b}</b>
                    {chg && <span className="v2-cover-chg">{chg}</span>}
                  </span>
                ))}
              </div>
            );
          case "go":
            return (
              // href 없는 <a> — 누를 수도 포커스될 수도 없다.
              <a key={i} className="v2-cover-cell v2-cover-go" style={hidden}>
                <span className="v2-cover-k">{c.k}</span>
                <span className="v2-cover-v">
                  <b>{c.v}</b>
                  {c.chg && <span className="v2-cover-chg">{c.chg}</span>}
                </span>
                <Icon name="chevron_right" />
              </a>
            );
          case "cell":
            return (
              <div key={i} className={`v2-cover-cell${c.price ? " v2-cover-price" : ""}`} style={hidden}>
                <span className="v2-cover-k">{c.k}</span>
                <span className="v2-cover-v">
                  <b>{c.v}</b>
                  {c.chg && <span className="v2-cover-chg">{c.chg}</span>}
                </span>
              </div>
            );
          case "id":
            return (
              <div key={i} className="v2-cover-cell v2-sk-id" style={hidden}>
                {c.logo && <span className="hz-stock-logo" style={{ display: "inline-block", width: 20, height: 20 }} />}
                {/* 실물은 h1(.v2-sk-id h1 — 13 · 700 · 20) — 자리표시자에 h1 을 또 두지 않고 같은 글자 꼴만. */}
                <span style={{ fontSize: 13, fontWeight: 700, lineHeight: "20px", whiteSpace: "nowrap" }}>
                  {c.title}
                  {c.sub && <span className="v2-cover-k"> {c.sub}</span>}
                </span>
              </div>
            );
          case "cur":
            return (
              <div key={i} className="v2-cover-cell v2-in-cur" style={hidden}>
                <span className="v2-cover-k">통화</span>
                <span className="hz-cur-switch">
                  <button type="button" tabIndex={-1}>₩</button>
                  <button type="button" tabIndex={-1}>$</button>
                </span>
              </div>
            );
          case "meta":
            return (
              <div key={i} className="v2-cover-cell v2-cover-meta" style={hidden}>
                <span className="v2-cover-k">
                  <i className="v2-dot" />
                  {c.text}
                </span>
              </div>
            );
        }
      })}
    </div>
  );
}
