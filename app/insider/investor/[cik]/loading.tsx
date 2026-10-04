import { InsiderSkeleton } from "../../InsiderSkeleton";

/** 상세는 브리핑이 없다 — 본 화면 골격(app/insider/loading.tsx)에서 브리핑 판만 뺀다. */
export default function Loading() {
  return <InsiderSkeleton brief={false} />;
}
