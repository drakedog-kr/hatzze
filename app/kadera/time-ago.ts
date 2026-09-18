/**
 * 글이 올라온 지 얼마나 됐는지("3분 전"). 국장·미장 카더라의 글 목록이 같은 꼴을 쓴다.
 *
 * `now` 를 받는 이유: 서버가 사본을 만들 때의 시각과 브라우저가 다시 셀 때의 시각이
 * 다르다. 그리는 쪽은 TimeAgo.tsx — 서버 값을 먼저 보이고 브라우저가 자기 시계로 고친다.
 */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const diff = now - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 60) return `${Math.max(1, min)}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  return `${Math.floor(hr / 24)}일 전`;
}
