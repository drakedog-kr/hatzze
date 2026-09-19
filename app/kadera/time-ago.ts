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

/** 시각을 정시로 내린다(15:23 → 15:00). 서버 사본의 기준 시각. */
export function hourFloor(now: number = Date.now()): number {
  return Math.floor(now / 3_600_000) * 3_600_000;
}

/**
 * 서버가 사본에 박는 첫 글자. **정시 기준**으로 센다.
 *
 * 왜 지금 시각이 아니라 정시인가: 페이지 사본(ISR)은 내용이 이전과 한 글자라도 다르면 통째로
 * 다시 저장된다(Vercel 은 8KB 단위로 쓰기를 센다). 카더라 한 페이지에 이 글자가 108개 있고
 * 게시 '분'이 한 시간의 5분 칸 12개 중 11개를 덮어서, 지금 시각으로 세면 다시 그릴 때마다
 * 어느 하나가 "11시간 전"→"12시간 전"으로 넘어가 1.3MB 페이지가 매번 새로 저장됐다
 * (2026-09-19 실측, 하루 5.7만 단위 · ISR 쓰기 요금의 거의 전부). 정시로 내리면 같은 시간
 * 안에서 만든 사본은 글자가 전부 같아 저장이 안 일어나고, 바뀌는 건 시간당 한 번이다.
 *
 * 화면은 안 바뀐다 — 브라우저가 깨어나면 TimeAgo 가 자기 시계로 다시 세고 1분마다 갱신한다.
 * 자바스크립트가 돌기 전 첫 화면 한 순간만 정시 기준 글자다("N시간 전"·"N일 전"은 같거나
 * 한 칸 차이, 한 시간 안쪽 글의 "N분 전"만 그 순간 최대 한 시간 어긋난다). 정시보다 뒤에
 * 올라온 글은 차이가 음수라 "1분 전"으로 나가고, 역시 브라우저가 바로 고친다.
 */
export function timeAgoInitial(iso: string, now: number = Date.now()): string {
  return timeAgo(iso, hourFloor(now));
}
