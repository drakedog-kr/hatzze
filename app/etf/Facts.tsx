/**
 * 카드 요약 칸 줄 — 표 위에 서서 그 카드가 말하는 것을 먼저 세 칸으로 보인다(배당 바스켓 상세 카드의 기준 꼬리표 줄 · MDD 카드의 통계 칸과
 * 같은 자리). 칸 = 이름(12 · 흐린 글자) · 값(15 · 600) 두 줄 — 칸 키가 화면 어디서나 59 로 같다(곁말 줄은 2026-10-12 걷었다). 화면의 모든 아래 카드가 이 한 꼴을 쓴다.
 *
 * ⭐ 칸에는 표에서 셈해야 나오는 값만 넣는다(몫 · 개수 · 범위 · 차이) — 표의 한 칸을 그대로 옮기면 같은 숫자가 두 번 선다(2026-10-11 중복 걷기).
 * 훅이 없어 서버 · 클라이언트 부품 어디서나 쓴다.
 */
/** 왼쪽 목록 | 표 카드(.v2-etf-md)의 요약 줄 칸 틀 — 첫 칸이 목록 폭(히어로 첫 칸과 같은 calc(25% − 6px)). */
export const MD_COLS = "calc(25% - 6px) minmax(0, 1fr) minmax(0, 1fr)";
/** 표 | 오른쪽 칸 카드(.v2-etf-panes)의 요약 줄 칸 틀 — 마지막 칸이 오른쪽 칸 폭(398 · v2.css .v2-etf-panes 주석). */
export const PANES_COLS = "minmax(0, 1fr) minmax(0, 1fr) 398px";

export type Fact = { k: string; v: React.ReactNode; tone?: "up" | "down" };

/**
 * cols — 칸 틀(grid-template-columns). 요약 줄 아래가 두 칸(왼쪽 목록 | 표 · 표 | 400)이면 칸 경계를 그 경계에 맞춘다 — 같은 3등분이면
 * 요약 칸 세로선이 아래 칸 세로선과 어긋났다(2026-10-12 "줄의 오와 열이 안 맞는다"). 없으면 같은 폭 n 칸.
 */
export function Facts({ items, cols }: { items: Fact[]; cols?: string }) {
  return (
    <div className="v2-etf-facts" style={{ ["--n" as string]: items.length, ...(cols ? { gridTemplateColumns: cols } : {}) }}>
      {items.map((f) => (
        <span key={f.k} className="v2-etf-fact">
          <span className="v2-etf-fact-k">{f.k}</span>
          <b className={f.tone ? `is-${f.tone}` : undefined}>{f.v}</b>
        </span>
      ))}
    </div>
  );
}
