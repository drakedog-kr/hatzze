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
 * 숫자로만 이뤄진 값의 앞자리 0 을 지키려고 붙이는 접두어.
 *
 * 그런 값은 GA4 리포트에서 수로 읽힌다. 그대로 보내면 005930 이 5930 으로, 000660 이
 * 660 으로 찍힌다(2026-08-08 탐색 표에서 확인). 보내는 쪽은 멀쩡하다 — stocks.code 는
 * text 컬럼이고 REST 응답도 "005930" 이며, 전송 직전 파라미터도 문자열 칸(ep.)으로
 * 나가는 것을 로컬에서 확인했다. GA4 안에서 벌어지는 일이라, 값에 숫자 아닌 글자를
 * 섞는 것 말고는 막을 방법이 없다.
 *
 * 글자를 A 로 고른 건 KRX 단축코드 표기(A005930)가 이미 그 모양이어서다. 리포트를 읽는
 * 사람이 자릿수 되돌리는 규칙을 기억하는 것보다 값 자체가 온전한 편이 낫고, 아무 글자나
 * 붙이는 것보다는 이미 쓰이는 표기가 낫다.
 */
const DIGIT_GUARD = "A";

/**
 * 종목 코드를 GA4 로 보낼 표기로 바꾼다. "005930" → "A005930".
 *
 * 숫자만인지 따지지 않고 무조건 붙인다. 우선주 코드에는 글자가 섞여 있어서
 * (아모레퍼시픽홀딩스3우C = 00279K) 조건을 걸면 한 측정기준에 A005930 과 00279K 가
 * 섞인다. 코드는 사람이 읽는 자유 텍스트가 아니라 식별자라 표기가 한 가지인 게 낫다.
 */
export function gaStockCode(code: string) {
  return `${DIGIT_GUARD}${code}`;
}

/**
 * 검색어를 GA4 로 보낼 표기로 바꾼다. "005930" → "A005930", "삼성전자" → 그대로.
 *
 * 검색어는 코드와 달리 무조건 붙일 수 없다. 종목명이 훨씬 흔해서 "A삼성전자" 가 된다.
 * 그래서 숫자만인 값에만 붙인다. 검색창에 숫자만 친 경우는 사실상 종목 코드를 친
 * 것이고(코드 완전일치가 검색 1순위다), 그 결과 stock_code 와 같은 표기로 모인다.
 *
 * 자릿수가 모자란 검색어("0059")도 A0059 가 되어 단축코드로는 성립하지 않는다. 그래도
 * 붙인다 — 여기서 지키려는 건 코드의 유효성이 아니라 사용자가 실제로 친 자릿수다.
 */
export function gaSearchTerm(term: string) {
  return /^[0-9]+$/.test(term) ? `${DIGIT_GUARD}${term}` : term;
}
