"use client";

import { useSyncExternalStore } from "react";
import { timeAgo } from "./time-ago";

/**
 * "3분 전"을 **브라우저 시계로** 세는 칸.
 *
 * 서버 컴포넌트가 셈하면 그 문장은 페이지를 만든 순간에 굳는다. 지금은 방문마다 새로
 * 만들어 티가 안 나지만, 페이지를 캐시로 돌리면(다음 PR) 사본이 몇 분 묵는 동안
 * "3분 전"이 그대로 보인다. 에러 없이 숫자만 어긋나는 종류라 여기서 미리 옮긴다.
 *
 * 그리는 순서: 서버가 셈한 `initial` 을 그대로 내보내고(하이드레이션이 어긋나지 않게),
 * 브라우저가 깨어나면 자기 시계로 다시 센다. 칸이 비는 순간이 없다 — 사본이 묵었을 때
 * "3분 전"이 "6분 전"으로 바뀌는 정도다. 열어 둔 동안은 1분마다 다시 센다.
 *
 * useEffect + setState 가 아니라 useSyncExternalStore 다(PcHint 와 같은 수). 시계는 리액트
 * 바깥이고, 서버 스냅샷을 `initial` 로 두면 SSR 문장과 첫 클라이언트 렌더가 같다.
 *
 * ⚠️ `initial` 은 반드시 **서버가** 셈한 값이어야 한다. 이 컴포넌트가 스스로 셈하면
 *    하이드레이션 때 브라우저 시계로 셈해 서버 문장과 어긋난다.
 */
export default function TimeAgo({ iso, initial }: { iso: string; initial: string }) {
  const text = useSyncExternalStore(
    subscribeMinute,
    () => timeAgo(iso),
    () => initial,
  );
  return text;
}

function subscribeMinute(cb: () => void) {
  const id = setInterval(cb, 60_000);
  return () => clearInterval(id);
}
