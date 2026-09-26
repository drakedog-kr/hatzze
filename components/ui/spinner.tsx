/**
 * shadcn/ui Spinner(2026-09 레지스트리 rhea) 자리.
 *
 * 원본과 다른 점 — rhea 는 아이콘(Loader2)에 `role="status"` 를 붙이지만, 이 사이트의 로딩 화면은 읽을 글을 따로 둔다
 * (loading.tsx 마다 화면에 안 보이는 `role="status"` 한 줄). 그래서 여기 원은 **꾸밈**이다(aria-hidden). 모양은 이 사이트의
 * 테두리 원(`.hz-spinner`, sheets.css — 동작 줄이기 설정이면 늦춘다).
 *
 * 훅이 없어 서버·클라이언트 어디서나 그린다. 클래스 합치기는 `cx`(lib/cx.ts).
 */
import * as React from "react";

import { cx } from "@/lib/cx";

function Spinner({ className, ...props }: React.ComponentProps<"span">) {
  return <span data-slot="spinner" aria-hidden className={cx("hz-spinner", className)} {...props} />;
}

export { Spinner };
