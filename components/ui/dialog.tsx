"use client";

/**
 * shadcn/ui Dialog(Base UI 바탕, 2026-09 레지스트리)를 옮긴 것이다. 모양은 app/styles/shadcn.css 의
 * `cn-dialog-*` 규칙(rhea 스타일)이 입힌다.
 *
 * 원본과 다른 점 둘.
 * - 아이콘 자리(IconPlaceholder)를 이 사이트의 Material Symbols `Icon` 으로 바꿨다. shadcn 이 고를 수
 *   있는 아이콘 세트에 Material Symbols 가 없어, 그대로 두면 모양이 다른 아이콘이 섞인다.
 * - 닫기 단추가 원본은 shadcn Button 을 쓰는데, 아직 Button 을 안 들였으니 같은 모양의 button 으로 둔다.
 */
import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { cn } from "cn";

import { Icon } from "@/app/ui";

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({ className, ...props }: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn("cn-dialog-overlay fixed inset-0 isolate z-50", className)}
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean;
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          "cn-dialog-content fixed top-1/2 left-1/2 z-50 w-full -translate-x-1/2 -translate-y-1/2 outline-none",
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close data-slot="dialog-close" className="cn-dialog-close">
            <Icon name="close" style={{ fontSize: 18 }} />
            <span className="sr-only">닫기</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="dialog-header" className={cn("cn-dialog-header flex flex-col", className)} {...props} />;
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return <DialogPrimitive.Title data-slot="dialog-title" className={cn("cn-dialog-title", className)} {...props} />;
}

function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description data-slot="dialog-description" className={cn("cn-dialog-description", className)} {...props} />
  );
}

export { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogOverlay, DialogPortal, DialogTitle, DialogTrigger };
