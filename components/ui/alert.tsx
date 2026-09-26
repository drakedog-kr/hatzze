/**
 * shadcn/ui Alert(2026-09 레지스트리 rhea)를 옮긴 것이다. 모양은 app/styles/shadcn.css 의 `cn-alert-*`.
 *
 * 원본과 다른 점.
 * - `destructive` 는 rhea 의 '흰 판 + 붉은 글자'가 아니라 이 사이트가 먼저 쓰던 모양이다 — 옅은 붉은 바탕 + 왼쪽 막대 +
 *   진한 붉은 글자(예전 LoadFailedNote 의 인라인 값을 그대로 옮겼다).
 * - 변형 표(cva) 대신 이름 → 클래스 표. 클래스 합치기는 `cx`(lib/cx.ts).
 * - 역할은 원본처럼 `role="alert"`(곧바로 끼어들어 읽힌다)가 기본이고, 급하지 않은 알림은 `role="status"` 를 넘긴다.
 *
 * 훅이 없어 서버·클라이언트 어디서나 그린다.
 */
import * as React from "react";

import { cx } from "@/lib/cx";

const VARIANT = {
  default: "cn-alert-default",
  destructive: "cn-alert-destructive",
} as const;

function Alert({ className, variant = "default", ...props }: React.ComponentProps<"div"> & { variant?: keyof typeof VARIANT }) {
  return <div data-slot="alert" role="alert" className={cx("cn-alert relative grid w-full text-left", VARIANT[variant], className)} {...props} />;
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="alert-title" className={cx("cn-alert-title", className)} {...props} />;
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="alert-description" className={cx("cn-alert-description", className)} {...props} />;
}

export { Alert, AlertTitle, AlertDescription };
