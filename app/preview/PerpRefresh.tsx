"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * 개장 직전 한 시간(08:00~08:59 KST)에만 화면을 스스로 새로 받는다 — '해외에서 거래 중인 값' 이 낡지 않게.
 *
 * 화면 사본(ISR)은 10분마다 새로 그려지지만, **열어 둔 탭**은 처음 받은 값에 멈춰 있다. 8시에 열어 둔 화면이 9시 직전까지
 * 8시 값을 보였다 — 10-15 SK하이닉스 해외 값은 그 한 시간에 −4.94% 에서 −7.73% 로 움직였다(5분봉 실측).
 * 새로 받는 것은 서버 사본이라 상류(하이퍼리퀴드 · 환율)로 나가는 요청은 늘지 않는다.
 *
 *   · 탭이 보일 때만 10분마다 · 탭으로 돌아오면 바로(1분 안에 받았으면 건너뜀).
 *   · 그 밖의 시각에는 아무것도 하지 않는다 — 표 · 브리핑은 하루 한 번 만드는 값이다.
 * ⚠️ 주소를 안 바꾸므로(router.refresh) GA 페이지뷰가 다시 잡히지 않는다.
 * ⚠️ 문구는 그대로 둔다. 이 값을 '실시간' 으로 내세우면 개장가 예고로 읽힌다(OvernightModule 주석) — 시점 알약만 바뀐다.
 */
const KST_HOUR = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", hour: "numeric", hourCycle: "h23" });
const inWindow = () => Number(KST_HOUR.format(new Date())) === 8;

export function PerpRefresh() {
  const router = useRouter();
  useEffect(() => {
    let last = Date.now();
    const pull = (gap: number) => {
      if (document.visibilityState !== "visible" || !inWindow() || Date.now() - last < gap) return;
      last = Date.now();
      router.refresh();
    };
    const id = window.setInterval(() => pull(9.5 * 60_000), 60_000);
    const onVis = () => pull(60_000);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [router]);
  return null;
}
