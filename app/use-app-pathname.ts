"use client";

import { usePathname } from "next/navigation";

import { appPath } from "@/lib/app-path";

/**
 * usePathname() 대신 쓴다 — 홈이 "/index" 로 들어오는 경우를 "/" 로 맞춘다(까닭은 lib/app-path.ts).
 * ⚠️ 셸·GA 처럼 경로로 무엇을 그리거나 세는 클라이언트 컴포넌트는 usePathname 을 직접 부르지 말 것 —
 *    서버(ISR 재생성)와 브라우저가 다른 경로를 보면 하이드레이션이 어긋난다.
 *    개발 서버에서 서버 렌더만 "/index" 로 바꿔 흉내 내면 사이드바 '시장 브리핑'의 활성 클래스부터 어긋난다(2026-09-23).
 */
export function useAppPathname(): string {
  return appPath(usePathname());
}
