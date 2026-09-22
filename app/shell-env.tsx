"use client";

import { createContext, useContext } from "react";

import { THEME_PUBLIC } from "./screen-flags";

/**
 * 셸이 화면들에 내려 주는 **서버가 정한 값** 한 벌.
 *
 * ## 왜 컨텍스트인가
 *
 * 셸(AppShell)도 푸터도 클라이언트 컴포넌트라, 거기서 `process.env.VERCEL_ENV` 를 읽으면 **브라우저에서는 늘 undefined** 다
 * (Next 는 클라이언트 번들에 NEXT_PUBLIC_ 만 심는다). `!process.env.VERCEL_ENV` 는 서버에서 false·브라우저에서 true 가 되어
 * 서버 HTML 에 없던 링크가 하이드레이션 뒤에 슬그머니 나타난다 — 안 연 화면이면 그게 곧 404 로 가는 문이다.
 * 그래서 값은 **layout.tsx(서버)가 한 번 정해** AppShell 의 prop 으로 넣고, 여기 컨텍스트로 내려간다.
 *
 * ⚠️ 이 파일을 AppShell 밖에 둔 것은 푸터가 같은 값을 읽어야 해서다. AppShell 에 두면 푸터 → AppShell → 푸터로 돌아간다.
 */
export type ShellEnv = {
  /**
   * 테마 리포트를 **링크로** 낼 것인가. 열면(THEME_PUBLIC) 늘 그렇고, 안 연 동안은 로컬(배포 아님)에서만 —
   * 만드는 중에 사이드바·푸터에서 눌러 보고 소식 띠도 봐야 해서다(2026-09-22).
   * 읽는 곳: 사이드바 NAV ↔ COMING_SOON · 머리 도구의 건너가기 단추 · 소식 띠(NEWS) · 푸터 바로가기.
   */
  themeNav: boolean;
};

export const ShellEnvContext = createContext<ShellEnv>({ themeNav: THEME_PUBLIC });
export const useShellEnv = () => useContext(ShellEnvContext);
