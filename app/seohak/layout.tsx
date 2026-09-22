import { notFound } from "next/navigation";

import { SEOHAK_PUBLIC } from "../screen-flags";

/**
 * 꺼 둔 동안(app/screen-flags.ts SEOHAK_PUBLIC) 배포에서 **진짜 404** 를 내는 자리.
 *
 * ⚠️ page.tsx 에서 notFound() 를 부르면 늦다. 이 구간에는 loading.tsx 가 있어 응답이 스켈레톤과 함께 **200 으로 먼저
 *    나가고**, 그 뒤에 도는 notFound() 는 상태 코드를 못 바꾼다 — Next 가 `<meta name="robots" content="noindex">` 만
 *    끼워 넣는다. 2026-09-23 프로덕션이 그랬다('찾을 수 없는 주소' 화면이 200 으로 나가는 소프트 404).
 *    레이아웃은 loading 경계 **바깥**이라 여기서 부르면 첫 바이트가 나가기 전에 404 가 정해진다
 *    (node_modules/next/dist/docs/01-app/02-guides/streaming.md 의 "When does streaming start?").
 * ⭐ 같은 함정이 loading.tsx 가 있는 화면 전부에 있다(카더라·배당·내부자). 그 화면을 플래그로 닫을 일이 생기면
 *    이 파일처럼 레이아웃에서 막을 것.
 */
const DEPLOYED = Boolean(process.env.VERCEL_ENV);

export default function SeohakLayout({ children }: { children: React.ReactNode }) {
  if (!SEOHAK_PUBLIC && DEPLOYED) notFound();
  return children;
}
