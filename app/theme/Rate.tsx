import { C, MONO } from "../ui";

/** 등락률 한 조각 — ▲4.02% · ▼0.67%. 테마 화면(서버)과 까닭 이력 주간 목록(클라이언트)이 같이 쓴다. */
export function Rate({ rate }: { rate: number | null }) {
  if (rate == null) return null;
  return (
    <span
      style={{
        fontFamily: MONO,
        fontWeight: 700,
        whiteSpace: "nowrap",
        color: rate > 0 ? "var(--c-hot-ink)" : rate < 0 ? "var(--c-cold-ink)" : C.sub2,
      }}
    >
      {rate > 0 ? "▲" : rate < 0 ? "▼" : ""}
      {Math.abs(rate).toFixed(2)}%
    </span>
  );
}
