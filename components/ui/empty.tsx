/**
 * shadcn/ui Empty(2026-09 레지스트리)를 옮긴 것이다. 모양은 app/styles/shadcn.css 의 `cn-empty-*`(rhea).
 * 늘 실리는 부품이라 클래스 합치기는 `cn` 대신 `cx`(lib/cx.ts 머리말).
 */
import * as React from "react";

import { cx as cn } from "@/lib/cx";

function Empty({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty"
      className={cn("cn-empty flex w-full min-w-0 flex-1 flex-col items-center justify-center text-center text-balance", className)}
      {...props}
    />
  );
}

function EmptyHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="empty-header" className={cn("cn-empty-header flex max-w-sm flex-col items-center", className)} {...props} />;
}

function EmptyMedia({ className, variant = "default", ...props }: React.ComponentProps<"div"> & { variant?: "default" | "icon" }) {
  return (
    <div
      data-slot="empty-icon"
      data-variant={variant}
      className={cn("cn-empty-media flex shrink-0 items-center justify-center", variant === "icon" ? "cn-empty-media-icon" : "cn-empty-media-default", className)}
      {...props}
    />
  );
}

function EmptyTitle({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="empty-title" className={cn("cn-empty-title", className)} {...props} />;
}

function EmptyDescription({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="empty-description" className={cn("cn-empty-description text-muted-foreground", className)} {...props} />;
}

export { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription };
