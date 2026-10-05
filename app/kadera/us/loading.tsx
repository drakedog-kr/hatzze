import { KaderaSkeleton } from "../KaderaSkeleton";

/**
 * `/kadera/us` 의 자리표시자. 국장과 같은 골격(KaderaSkeleton)에 글만 다르다.
 *
 * 따로 두는 까닭 — Next 는 가장 가까운 경계를 쓰므로, 이 파일이 없으면 미장을 눌러도 국장의 문구
 * ("카더라 리포트를 불러오는 중")가 뜬다. 골격은 2026-10-03 v2 부터 두 화면이 한 벌이다.
 *
 * 자세한 배경(왜 loading.tsx 가 필요한지, 프리페치 경계 이야기)은 ../loading.tsx 주석에.
 */
export default function Loading() {
  return <KaderaSkeleton badge="미장 종목 얘기를 모으는 중" label="미장 카더라를 불러오는 중입니다." />;
}
