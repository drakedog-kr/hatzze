import type { EtfFlowRow, EtfPeriod } from "@/lib/etf-flow";

/**
 * 'ETF 자금 흐름' 표(app/etf/FlowCard.tsx)의 줄 세우기 — 서버가 표에 실을 줄을 고를 때(lib/etf-flow.ts)도 이 차례를 그대로 쓴다.
 * 서버는 판 · 기간 · 정렬 · 방향마다 앞 줄만 골라 보내므로, 둘의 차례가 어긋나면 앞에 서야 할 ETF 가 실리지 않아 표에서 빠진다.
 *
 * 칸은 넷이다: 순유입(f) · 수익률(r) · 순유입일(d — 하루는 그 자리에 선 연속 순유입) · 순자산(a).
 * 순유입일 · 연속 순유입은 같은 값이 많아(1달 20/20일 · 연속 0일) 순유입으로 한 번 더 가른다 — 같은 방향으로.
 * 값이 없는 줄(수익률 — 그 안에 상장 · 순유입일 — 못 읽음)은 방향과 상관없이 맨 아래다.
 */
export type EtfSortKey = "f" | "r" | "d" | "a";

type Sortable = Pick<EtfFlowRow, "streak" | "netAsset" | "p">;

function sortVal(r: Sortable, per: EtfPeriod, key: EtfSortKey): number | null {
  if (key === "a") return r.netAsset;
  if (key === "d") return per === "d" ? r.streak : (r.p[per]?.inDays ?? null);
  return r.p[per]?.[key] ?? null;
}

export function etfSortCmp(per: EtfPeriod, key: EtfSortKey, desc: boolean): (a: Sortable, b: Sortable) => number {
  const dir = desc ? 1 : -1;
  return (a, b) => {
    const va = sortVal(a, per, key);
    const vb = sortVal(b, per, key);
    if (va == null) return vb == null ? 0 : 1;
    if (vb == null) return -1;
    return dir * (vb - va) || dir * ((b.p[per]?.f ?? 0) - (a.p[per]?.f ?? 0));
  };
}
