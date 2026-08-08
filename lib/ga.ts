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

/**
 * 종목 코드를 GA4 로 보낼 표기로 바꾼다. "005930" → "A005930".
 *
 * 앞자리 0 을 지키려고 붙이는 접두어다. 숫자로만 이뤄진 값은 GA4 리포트에서 수로
 * 읽혀서, 코드를 그대로 보내면 005930 이 5930 으로, 000660 이 660 으로 찍힌다
 * (2026-08-08 탐색 표에서 확인). 보내는 쪽 값은 문제가 없다 — stocks.code 는 text
 * 컬럼이고 REST 응답도 "005930" 이다.
 *
 * A 는 KRX 단축코드 표기(A005930)를 그대로 쓴 것이다. 리포트를 읽는 사람이 자릿수
 * 되돌리는 규칙을 기억하는 것보다 값 자체가 온전한 편이 낫고, 아무 글자나 붙이는
 * 것보다는 이미 쓰이는 표기가 낫다.
 */
export function gaStockCode(code: string) {
  return `A${code}`;
}
