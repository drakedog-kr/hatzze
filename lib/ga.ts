"use client";

import { sendGAEvent } from "@next/third-parties/google";

// GA4 커스텀 이벤트를 보내는 단 하나의 통로. 컴포넌트에서 sendGAEvent 를 직접 부르지 않는다.
//
// 측정 ID 가 없는 환경(로컬·프리뷰)에서는 아무것도 하지 않는다. sendGAEvent 는
// <GoogleAnalytics> 가 렌더된 적 없으면 호출마다 console.warn 을 찍는데
// (@next/third-parties 16.2.12 의 dist/google/ga.js), .env.local 의 NEXT_PUBLIC_GA_ID 는
// 주석 처리해 두는 게 우리 관례라 로컬은 늘 그 상태다 — 클릭할 때마다 콘솔이 더러워진다.
//
// ?ga=off 기기 제외 스위치는 여기서 신경 쓸 필요가 없다. app/layout.tsx 의 인라인
// 스크립트가 세우는 ga-disable-<측정ID> 플래그는 gtag.js 가 전송 직전에 보는 것이라,
// dataLayer 로 밀어넣은 커스텀 이벤트도 똑같이 막힌다.
const ON = Boolean(process.env.NEXT_PUBLIC_GA_ID);

export type GaParams = Record<string, string | number | boolean>;

export function track(name: string, params: GaParams = {}) {
  if (!ON) return;
  sendGAEvent("event", name, params);
}
