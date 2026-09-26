"use client";

/**
 * shadcn/ui AlertDialog(Base UI 바탕, 2026-09 레지스트리 rhea)를 옮긴 것이다. 모양은 app/styles/shadcn.css 의 `cn-alert-dialog-*`.
 *
 * 원본과 다른 점.
 * - 그림 자리(AlertDialogMedia)는 옮기지 않았다. 쓰는 곳이 없고, 한 화면에 같은 아이콘이 두 번 서면 안 된다.
 * - 클래스 합치기는 `cx`(lib/cx.ts). 넘겨받는 클래스가 기본 클래스와 부딪치지 않게 쓴다.
 *
 * 동작은 Base UI 가 맡는다: 여는 순간 초점이 판 안(첫 단추)으로 가고, Esc 나 '취소'로 닫히며, 닫으면 연 단추로 초점이
 * 돌아온다. 브라우저 기본 확인창(window.confirm)과 달리 판 바깥을 눌러도 닫히지 않는다 — 되돌릴 수 없는 일을 묻는 판이다.
 */
import * as React from "react";
import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog";

import { cx } from "@/lib/cx";
import { buttonClass, type ButtonProps } from "./button";

function AlertDialog(props: AlertDialogPrimitive.Root.Props) {
  return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />;
}

function AlertDialogContent({ className, children, ...props }: Omit<AlertDialogPrimitive.Popup.Props, "className"> & { className?: string }) {
  return (
    <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal">
      <AlertDialogPrimitive.Backdrop data-slot="alert-dialog-overlay" className="cn-alert-dialog-overlay fixed inset-0 isolate z-50" />
      <AlertDialogPrimitive.Popup
        data-slot="alert-dialog-content"
        className={cx("cn-alert-dialog-content fixed top-1/2 left-1/2 z-50 grid w-full -translate-x-1/2 -translate-y-1/2 outline-none", className)}
        {...props}
      >
        {children}
      </AlertDialogPrimitive.Popup>
    </AlertDialogPrimitive.Portal>
  );
}

function AlertDialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="alert-dialog-header" className={cx("cn-alert-dialog-header grid", className)} {...props} />;
}

function AlertDialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="alert-dialog-footer" className={cx("cn-alert-dialog-footer flex", className)} {...props} />;
}

function AlertDialogTitle({ className, ...props }: Omit<AlertDialogPrimitive.Title.Props, "className"> & { className?: string }) {
  return <AlertDialogPrimitive.Title data-slot="alert-dialog-title" className={cx("cn-alert-dialog-title", className)} {...props} />;
}

function AlertDialogDescription({ className, ...props }: Omit<AlertDialogPrimitive.Description.Props, "className"> & { className?: string }) {
  return <AlertDialogPrimitive.Description data-slot="alert-dialog-description" className={cx("cn-alert-dialog-description", className)} {...props} />;
}

/** 판을 닫기만 하는 단추(원본의 AlertDialogCancel). 기본 모양은 outline. */
function AlertDialogCancel({
  className,
  variant = "outline",
  size = "default",
  ...props
}: Omit<AlertDialogPrimitive.Close.Props, "className"> & Pick<ButtonProps, "variant" | "size"> & { className?: string }) {
  return <AlertDialogPrimitive.Close data-slot="alert-dialog-cancel" className={buttonClass(variant, size, className)} {...props} />;
}

/** 일을 하는 단추(원본의 AlertDialogAction). 누른 뒤 판을 닫는 것은 부르는 쪽이 한다. */
function AlertDialogAction({
  className,
  variant = "default",
  size = "default",
  ...props
}: Omit<React.ComponentProps<"button">, "className"> & Pick<ButtonProps, "variant" | "size"> & { className?: string }) {
  return <button type="button" data-slot="alert-dialog-action" className={buttonClass(variant, size, className)} {...props} />;
}

export { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter, AlertDialogTitle, AlertDialogDescription, AlertDialogCancel, AlertDialogAction };
