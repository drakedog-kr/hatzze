"use client";

/**
 * shadcn/ui Breadcrumb(Base UI 바탕, 2026-09 레지스트리)를 옮긴 것이다. 모양은 app/styles/shadcn.css 의
 * `cn-breadcrumb-*`(rhea 스타일). 구분 아이콘만 Material Symbols `Icon` 으로 바꿨다(dialog.tsx 머리말).
 *
 * 링크는 `render` 로 Next 의 Link 를 끼운다: `<BreadcrumbLink render={<Link href="/insider" />}>내부자 리포트</BreadcrumbLink>`.
 */
import * as React from "react";
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cn } from "cn";

import { Icon } from "@/app/ui";

function Breadcrumb({ className, ...props }: React.ComponentProps<"nav">) {
  return <nav aria-label="현재 위치" data-slot="breadcrumb" className={cn("cn-breadcrumb", className)} {...props} />;
}

function BreadcrumbList({ className, ...props }: React.ComponentProps<"ol">) {
  return (
    <ol
      data-slot="breadcrumb-list"
      className={cn("cn-breadcrumb-list flex flex-wrap items-center wrap-break-word", className)}
      {...props}
    />
  );
}

function BreadcrumbItem({ className, ...props }: React.ComponentProps<"li">) {
  return <li data-slot="breadcrumb-item" className={cn("cn-breadcrumb-item inline-flex items-center", className)} {...props} />;
}

function BreadcrumbLink({ className, render, ...props }: useRender.ComponentProps<"a">) {
  return useRender({
    defaultTagName: "a",
    props: mergeProps<"a">({ className: cn("cn-breadcrumb-link", className) }, props),
    render,
    state: { slot: "breadcrumb-link" },
  });
}

function BreadcrumbPage({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="breadcrumb-page"
      role="link"
      aria-disabled="true"
      aria-current="page"
      className={cn("cn-breadcrumb-page", className)}
      {...props}
    />
  );
}

function BreadcrumbSeparator({ children, className, ...props }: React.ComponentProps<"li">) {
  return (
    <li data-slot="breadcrumb-separator" role="presentation" aria-hidden="true" className={cn("cn-breadcrumb-separator", className)} {...props}>
      {children ?? <Icon name="chevron_right" style={{ fontSize: 14 }} />}
    </li>
  );
}

export { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator };
